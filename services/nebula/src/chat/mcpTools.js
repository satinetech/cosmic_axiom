/**
 * Tools for the chat, from the MCP servers this deployment is configured with.
 *
 * Configuration is one environment variable, AI_MCP_SERVERS, a JSON array:
 *
 *   [{ "name": "case", "url": "http://10.0.0.5:8091/mcp", "forwardAuth": true }]
 *
 * - name         prefixes the server's tool names (case__wazuh_search_alerts),
 *                so two servers can never collide. Lower case, digits, - and _.
 * - url          a Streamable HTTP MCP endpoint reachable from this container.
 * - forwardAuth  send the signed-in user's own bearer token, so the server can
 *                act as that user rather than as nebula. Default false.
 *
 * READ-ONLY BY DEFAULT. Only tools whose server marks them readOnlyHint are
 * offered to the model unless AI_MCP_ALLOW_WRITE_TOOLS=true. The chat has no
 * approval step yet, so a tool that changes something must not be callable from
 * it until one exists.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const NAME = /^[a-z0-9_-]{1,24}$/;
/** The Messages API caps tool names at 64 characters. */
const MAX_TOOL_NAME = 64;
/** Tool results go back to the model; past this they cost more than they say. */
export const MAX_RESULT_CHARS = 100_000;

export function parseServers(raw) {
    if (!raw || !raw.trim()) return [];
    let list;
    try {
        list = JSON.parse(raw);
    } catch {
        throw new Error('AI_MCP_SERVERS is not valid JSON.');
    }
    if (!Array.isArray(list)) throw new Error('AI_MCP_SERVERS must be a JSON array.');
    const seen = new Set();
    return list.map((s, i) => {
        if (!s || typeof s.name !== 'string' || !NAME.test(s.name)) {
            throw new Error(`AI_MCP_SERVERS[${i}].name must match ${NAME}.`);
        }
        if (seen.has(s.name)) throw new Error(`AI_MCP_SERVERS has two servers named ${s.name}.`);
        seen.add(s.name);
        let url;
        try {
            url = new URL(s.url);
        } catch {
            throw new Error(`AI_MCP_SERVERS[${i}].url is not a URL.`);
        }
        return { name: s.name, url, forwardAuth: s.forwardAuth === true };
    });
}

/**
 * An MCP tool's input schema as a Messages API input_schema: the same JSON
 * Schema, without the top-level $schema dialect marker MCP servers include,
 * which means nothing to the API.
 */
export function inputSchema(schema) {
    const { $schema, ...rest } = schema ?? {};
    return { type: 'object', ...rest };
}

/** One MCP result as tool_result text. */
export function resultText(result) {
    const parts = (result?.content ?? []).map((c) =>
        c.type === 'text' ? c.text : `[${c.type} content omitted]`,
    );
    let text = parts.join('\n') || '(no content)';
    if (text.length > MAX_RESULT_CHARS) {
        text = `${text.slice(0, MAX_RESULT_CHARS)}\n[truncated by nebula: ${text.length - MAX_RESULT_CHARS} more characters]`;
    }
    return text;
}

/**
 * Connect to every configured server for one chat request and gather its tools.
 *
 * Per request, not shared: the connection carries the caller's own token, and
 * one user's connection must never serve another's call.
 */
export async function openToolbox(servers, { authorization, allowWrite = false, log = console } = {}) {
    const clients = [];
    const definitions = [];
    const routes = new Map();
    const unavailable = [];

    for (const server of servers) {
        const headers = server.forwardAuth && authorization ? { Authorization: authorization } : {};
        const client = new Client({ name: 'cosmic-axiom-nebula', version: '1.0.0' });
        try {
            await client.connect(new StreamableHTTPClientTransport(server.url, { requestInit: { headers } }));
            clients.push(client);
            const { tools } = await client.listTools();
            for (const tool of tools) {
                if (!allowWrite && tool.annotations?.readOnlyHint !== true) continue;
                const name = `${server.name}__${tool.name}`.slice(0, MAX_TOOL_NAME);
                routes.set(name, { client, tool: tool.name });
                definitions.push({
                    name,
                    description: tool.description ?? tool.title ?? tool.name,
                    input_schema: inputSchema(tool.inputSchema),
                    // Streamed requests: let inputs arrive as generated. The MCP
                    // server validates arguments against its own schema, so an
                    // input the tolerant parser truncated comes back as an
                    // error result rather than running.
                    eager_input_streaming: true,
                });
            }
        } catch (err) {
            // One server down must not take the chat with it; the model is told.
            log.warn?.(`nebula chat: MCP server ${server.name} unavailable: ${err.message}`);
            unavailable.push(server.name);
            await client.close().catch(() => {});
        }
    }

    return {
        definitions,
        unavailable,
        async call(name, input) {
            const route = routes.get(name);
            if (!route) return { text: `No tool named ${name}.`, isError: true };
            try {
                const result = await route.client.callTool({ name: route.tool, arguments: input ?? {} });
                return { text: resultText(result), isError: result.isError === true };
            } catch (err) {
                return { text: `The tool failed: ${err.message}`, isError: true };
            }
        },
        async close() {
            await Promise.all(clients.map((c) => c.close().catch(() => {})));
        },
    };
}
