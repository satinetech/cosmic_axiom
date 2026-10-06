/**
 * The engagement assistant, without spending a token: a real MCP server
 * in-process, and a scripted stand-in for the Anthropic client.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { runTurn, MAX_ITERATIONS } from '../src/chat/loop.js';
import { inputSchema, openToolbox, parseServers, resultText, MAX_RESULT_CHARS } from '../src/chat/mcpTools.js';
import { chatRouter, systemPrompt, validMessages } from '../src/chat/route.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** An MCP server with one read-only tool and one that writes, recording auth. */
async function mcpFixture() {
    const seen = { authorizations: [], calls: [] };
    const http = createServer(async (req, res) => {
        seen.authorizations.push(req.headers.authorization ?? null);
        const server = new McpServer({ name: 'fixture', version: '0' });
        server.registerTool(
            'search',
            { description: 'Search alerts', inputSchema: { q: z.string() }, annotations: { readOnlyHint: true } },
            async ({ q }) => {
                seen.calls.push(q);
                return { content: [{ type: 'text', text: `3 alerts for ${q}` }] };
            },
        );
        server.registerTool('quarantine', { description: 'Isolate a host', inputSchema: { host: z.string() } }, async () => ({
            content: [{ type: 'text', text: 'isolated' }],
        }));
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => { transport.close(); server.close(); });
        await server.connect(transport);
        await transport.handleRequest(req, res);
    });
    await new Promise((r) => http.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${http.address().port}/mcp`, seen, close: () => http.close() };
}

/**
 * Stands in for `new Anthropic()`: each stream() call answers with the next
 * scripted message, streaming its text blocks through 'text' listeners.
 */
function scriptedClient(script) {
    const requests = [];
    return {
        requests,
        beta: {
            messages: {
                stream(params) {
                    requests.push(structuredClone(params));
                    const next = script.shift();
                    if (!next) throw new Error('script exhausted');
                    const listeners = [];
                    return {
                        on(event, fn) {
                            if (event === 'text') listeners.push(fn);
                            return this;
                        },
                        async finalMessage() {
                            if (next instanceof Error) throw next;
                            for (const b of next.content) if (b.type === 'text') listeners.forEach((fn) => fn(b.text));
                            return { usage: { input_tokens: 10, output_tokens: 5 }, ...next };
                        },
                    };
                },
            },
        },
    };
}

const userTurn = (text) => [{ role: 'user', content: text }];

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test('parseServers: empty is none; names and urls are checked', () => {
    assert.deepEqual(parseServers(''), []);
    assert.equal(parseServers('[{"name":"case","url":"http://x:1/mcp","forwardAuth":true}]')[0].forwardAuth, true);
    assert.throws(() => parseServers('{"name":"case"}'), /JSON array/);
    assert.throws(() => parseServers('[{"name":"Case Tools","url":"http://x/mcp"}]'), /name must match/);
    assert.throws(() => parseServers('[{"name":"a","url":"nope"}]'), /not a URL/);
    assert.throws(() => parseServers('[{"name":"a","url":"http://x"},{"name":"a","url":"http://y"}]'), /two servers named a/);
});

test('resultText: text joined, other content named, long results cut', () => {
    assert.equal(resultText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }] }), 'a\n[image content omitted]');
    assert.match(resultText({ content: [{ type: 'text', text: 'x'.repeat(MAX_RESULT_CHARS + 5) }] }), /truncated by nebula: 5 more/);
});

test('inputSchema drops the $schema marker and keeps the rest', () => {
    assert.deepEqual(
        inputSchema({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { q: { type: 'string' } } }),
        { type: 'object', properties: { q: { type: 'string' } } },
    );
    assert.deepEqual(inputSchema(undefined), { type: 'object' });
});

test('validMessages: a conversation ending with the user', () => {
    assert.ok(validMessages(userTurn('hi')));
    assert.ok(!validMessages([]));
    assert.ok(!validMessages([{ role: 'assistant', content: 'x' }]));
    assert.ok(!validMessages([{ role: 'system', content: 'x' }]));
});

test('systemPrompt names the engagement and any unreachable source', () => {
    const p = systemPrompt({ engagementId: 'eng-1', unavailable: ['case'] });
    assert.match(p, /eng-1/);
    assert.match(p, /could not be reached for this turn: case/);
});

// ---------------------------------------------------------------------------
// Tools over MCP
// ---------------------------------------------------------------------------

test('openToolbox: read-only tools only, the caller\'s token forwarded, calls routed', async () => {
    const mcp = await mcpFixture();
    try {
        const [server] = parseServers(JSON.stringify([{ name: 'case', url: mcp.url, forwardAuth: true }]));
        const box = await openToolbox([server], { authorization: 'Bearer user-jwt' });
        assert.deepEqual(box.definitions.map((d) => d.name), ['case__search']);
        assert.equal(box.definitions[0].eager_input_streaming, true);
        assert.equal(box.definitions[0].input_schema.type, 'object');
        assert.equal('$schema' in box.definitions[0].input_schema, false);

        assert.deepEqual(await box.call('case__search', { q: 'sshd' }), { text: '3 alerts for sshd', isError: false });
        assert.equal((await box.call('case__quarantine', { host: 'x' })).isError, true);
        await box.close();

        assert.ok(mcp.seen.authorizations.length > 0);
        assert.ok(mcp.seen.authorizations.every((a) => a === 'Bearer user-jwt'));
        assert.deepEqual(mcp.seen.calls, ['sshd']);
    } finally {
        mcp.close();
    }
});

test('openToolbox: write tools appear only when allowed; no token unless forwardAuth', async () => {
    const mcp = await mcpFixture();
    try {
        const [server] = parseServers(JSON.stringify([{ name: 'case', url: mcp.url }]));
        const box = await openToolbox([server], { authorization: 'Bearer user-jwt', allowWrite: true });
        assert.deepEqual(box.definitions.map((d) => d.name).sort(), ['case__quarantine', 'case__search']);
        await box.close();
        assert.ok(mcp.seen.authorizations.every((a) => a === null));
    } finally {
        mcp.close();
    }
});

test('openToolbox: an unreachable server is reported, not fatal', async () => {
    const [server] = parseServers('[{"name":"gone","url":"http://127.0.0.1:1/mcp"}]');
    const box = await openToolbox([server], { log: {} });
    assert.deepEqual(box.unavailable, ['gone']);
    assert.deepEqual(box.definitions, []);
});

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

const fakeBox = (calls = []) => ({
    definitions: [{ name: 'case__search', input_schema: { type: 'object' } }],
    async call(name, input) {
        calls.push([name, input]);
        return { text: `result for ${input.q}`, isError: false };
    },
});

test('runTurn: calls tools, returns results in one message, ends on the answer', async () => {
    const calls = [];
    const events = [];
    const client = scriptedClient([
        {
            stop_reason: 'tool_use',
            content: [
                { type: 'text', text: 'Looking. ' },
                { type: 'tool_use', id: 't1', name: 'case__search', input: { q: 'a' } },
                { type: 'tool_use', id: 't2', name: 'case__search', input: { q: 'b' } },
            ],
        },
        { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Two hosts.' }] },
    ]);
    const out = await runTurn({ client, model: 'm', effort: 'high', system: 's', messages: userTurn('q'), toolbox: fakeBox(calls), emit: (e) => events.push(e) });

    assert.equal(out.stopReason, 'end_turn');
    assert.deepEqual(calls, [['case__search', { q: 'a' }], ['case__search', { q: 'b' }]]);
    assert.equal(out.messages.length, 4);
    assert.deepEqual(out.messages[2].content.map((r) => r.tool_use_id), ['t1', 't2']);
    assert.deepEqual(events.filter((e) => e.type === 'text').map((e) => e.text), ['Looking. ', 'Two hosts.']);
    assert.deepEqual(events.filter((e) => e.type === 'tool_call').map((e) => e.id), ['t1', 't2']);
    assert.equal(out.usage.input_tokens, 20);

    // Every request carries the fallback opt-in, effort and caching.
    const req = client.requests[1];
    assert.equal(req.fallbacks, 'default');
    assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
    assert.deepEqual(req.output_config, { effort: 'high' });
    assert.deepEqual(req.cache_control, { type: 'ephemeral' });
    // The second request saw the first answer and its tool results.
    assert.equal(req.messages.length, 3);
});

test('runTurn: a refusal stops without running that turn\'s tools', async () => {
    const calls = [];
    const events = [];
    const client = scriptedClient([
        { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [{ type: 'tool_use', id: 't1', name: 'case__search', input: { q: 'a' } }] },
    ]);
    const out = await runTurn({ client, model: 'm', effort: 'high', system: 's', messages: userTurn('q'), toolbox: fakeBox(calls), emit: (e) => events.push(e) });
    assert.equal(out.stopReason, 'refusal');
    assert.deepEqual(calls, []);
    assert.deepEqual(events.at(-1), { type: 'refusal', category: 'cyber' });
});

test('runTurn: a tool call cut off at max_tokens is not run', async () => {
    const calls = [];
    const client = scriptedClient([
        { stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 't1', name: 'case__search', input: { q: 'partial' } }] },
    ]);
    const out = await runTurn({ client, model: 'm', effort: 'high', system: 's', messages: userTurn('q'), toolbox: fakeBox(calls), emit: () => {} });
    assert.equal(out.stopReason, 'max_tokens');
    assert.deepEqual(calls, []);
    assert.equal(out.messages.length, 1);
});

test('runTurn: stops at the iteration limit', async () => {
    const loopForever = () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'case__search', input: { q: 'x' } }] });
    const client = scriptedClient(Array.from({ length: MAX_ITERATIONS }, loopForever));
    const events = [];
    const out = await runTurn({ client, model: 'm', effort: 'high', system: 's', messages: userTurn('q'), toolbox: fakeBox(), emit: (e) => events.push(e) });
    assert.equal(out.stopReason, 'iteration_limit');
    assert.match(events.at(-1).text, /Stopped after/);
});

// ---------------------------------------------------------------------------
// The route
// ---------------------------------------------------------------------------

async function serve(router) {
    const app = express();
    app.use('/ai/chat', router);
    const http = createServer(app);
    await new Promise((r) => http.listen(0, '127.0.0.1', r));
    return { url: `http://127.0.0.1:${http.address().port}/ai/chat`, close: () => http.close() };
}

const passAuth = (req, _res, next) => { req.user = { sub: 'u1' }; next(); };

test('route: streams events and ends with the conversation to send next time', async () => {
    const mcp = await mcpFixture();
    const client = scriptedClient([
        { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'case__search', input: { q: 'dc01' } }] },
        { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Nothing on dc01.' }] },
    ]);
    const router = chatRouter({
        config: { enabled: true, apiKey: 'k', model: 'claude-opus-5-5', effort: 'high', servers: parseServers(JSON.stringify([{ name: 'case', url: mcp.url, forwardAuth: true }])), allowWrite: false },
        makeClient: () => client,
        authenticate: passAuth,
    });
    const s = await serve(router);
    try {
        const res = await fetch(s.url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer user-jwt' },
            body: JSON.stringify({ engagementId: 'eng-1', messages: userTurn('Anything on dc01?') }),
        });
        assert.equal(res.headers.get('content-type'), 'text/event-stream');
        assert.equal(res.headers.get('x-accel-buffering'), 'no');
        const events = (await res.text()).split('\n\n').filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, '')));
        assert.deepEqual(events.map((e) => e.type), ['tool_call', 'tool_result', 'text', 'done']);
        assert.equal(events[1].preview, '3 alerts for dc01');
        assert.equal(events.at(-1).messages.length, 4);
        assert.match(client.requests[0].system, /eng-1/);
        assert.ok(mcp.seen.authorizations.every((a) => a === 'Bearer user-jwt'));
    } finally {
        s.close();
        mcp.close();
    }
});

test('route: off without a key, and refuses a malformed conversation', async () => {
    const off = await serve(chatRouter({ config: { enabled: false, servers: [] }, authenticate: passAuth }));
    try {
        assert.deepEqual(await (await fetch(`${off.url}/status`)).json(), { enabled: false, model: null, sources: [] });
        assert.equal((await fetch(off.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 503);
    } finally {
        off.close();
    }
    const on = await serve(chatRouter({
        config: { enabled: true, apiKey: 'k', model: 'm', effort: 'high', servers: [], allowWrite: false },
        makeClient: () => scriptedClient([]),
        authenticate: passAuth,
    }));
    try {
        const r = await fetch(on.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'assistant', content: 'x' }] }) });
        assert.equal(r.status, 400);
    } finally {
        on.close();
    }
});
