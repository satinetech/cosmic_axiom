/**
 * POST /ai/chat -- one user turn of the engagement assistant, streamed.
 * GET  /ai/chat/status -- whether the assistant is available here, for the UI.
 *
 * Request:  { engagementId?: string, messages: MessageParam[] }  ending with the
 *           user's new message; earlier turns exactly as a previous `done`
 *           event returned them.
 * Response: text/event-stream of JSON events:
 *   text         { text }                       a piece of the answer
 *   tool_call    { id, name, input }            a tool is being called
 *   tool_result  { id, name, isError, preview } and what came back
 *   notice       { text }                       something worth telling the user
 *   refusal      { category }                   the model declined
 *   error        { error }                      the turn failed
 *   done         { messages, usage, stopReason } the conversation to send next time
 *
 * Configuration (all optional; without AI_API_KEY the assistant is off):
 *   AI_API_KEY            Anthropic API key
 *   AI_CHAT_MODEL         default claude-opus-5-5
 *   AI_CHAT_EFFORT        default high
 *   AI_MCP_SERVERS        see chat/mcpTools.js
 *   AI_MCP_ALLOW_WRITE_TOOLS  default false
 */

import Anthropic from '@anthropic-ai/sdk';
import express, { Router } from 'express';

import { authenticateRequest } from '../middleware/authenticateRequest.js';
import { runTurn } from './loop.js';
import { openToolbox, parseServers } from './mcpTools.js';

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

export function chatConfig(env = process.env) {
    const effort = env.AI_CHAT_EFFORT || 'high';
    if (!EFFORTS.includes(effort)) throw new Error(`AI_CHAT_EFFORT must be one of ${EFFORTS.join(', ')}.`);
    return {
        enabled: (env.AI_PROVIDER || 'claude') !== 'ollama' && !!env.AI_API_KEY,
        apiKey: env.AI_API_KEY,
        model: env.AI_CHAT_MODEL || 'claude-opus-5-5',
        effort,
        servers: parseServers(env.AI_MCP_SERVERS),
        allowWrite: env.AI_MCP_ALLOW_WRITE_TOOLS === 'true',
    };
}

export function systemPrompt({ engagementId, unavailable }) {
    return [
        'You are the assistant inside COSMIC AXIOM, a security engagement workspace, helping the team working this engagement.',
        engagementId ? `The engagement in view has id ${engagementId}.` : '',
        'Your tools read the engagement and the tooling attached to it. Use them to answer from evidence, not from memory, and name the evidence: alert ids, timestamps, hosts, record ids.',
        'You cannot change anything. When the team should record something -- a timeline entry, an indicator, an affected asset, a client request -- write it out ready to paste, and say which record type it belongs in.',
        'Give times in UTC. Say plainly when the data does not support a conclusion, or when a tool returned nothing.',
        unavailable.length ? `These tool sources could not be reached for this turn: ${unavailable.join(', ')}.` : '',
    ]
        .filter(Boolean)
        .join('\n\n');
}

/** Shape check only: the API validates content. */
export function validMessages(messages) {
    return (
        Array.isArray(messages) &&
        messages.length > 0 &&
        messages.length <= 500 &&
        messages.every((m) => m && (m.role === 'user' || m.role === 'assistant') && (typeof m.content === 'string' || Array.isArray(m.content))) &&
        messages[messages.length - 1].role === 'user'
    );
}

/** The configuration, or the assistant switched off with the reason logged: a bad setting must not stop nebula. */
function safeConfig() {
    try {
        return chatConfig();
    } catch (err) {
        console.error(`nebula chat disabled: ${err.message}`);
        return { enabled: false, servers: [] };
    }
}

export function chatRouter({
    config = safeConfig(),
    makeClient = (key) => new Anthropic({ apiKey: key }),
    authenticate = authenticateRequest,
} = {}) {
    const router = Router();
    const client = config.enabled ? makeClient(config.apiKey) : null;

    router.get('/status', authenticate, (req, res) => {
        res.json({ enabled: config.enabled, model: config.enabled ? config.model : null, sources: config.servers.map((s) => s.name) });
    });

    // Conversations carry tool results, so the default 100 kB is far too small.
    router.post('/', authenticate, express.json({ limit: '20mb' }), async (req, res) => {
        if (!config.enabled) return res.status(503).json({ error: 'The assistant is not configured on this deployment.' });
        const { engagementId, messages } = req.body ?? {};
        if (engagementId !== undefined && (typeof engagementId !== 'string' || engagementId.length > 64)) {
            return res.status(400).json({ error: 'engagementId must be a string id.' });
        }
        if (!validMessages(messages)) {
            return res.status(400).json({ error: 'messages must be a non-empty conversation ending with a user message.' });
        }

        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            // nginx buffers proxied responses unless told not to.
            'X-Accel-Buffering': 'no',
        });
        const emit = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

        const abort = new AbortController();
        // A comment line every 15 s: proxies (nginx's default is 60 s) close a
        // response that goes quiet, and one slow tool call can be quiet that long.
        const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
        res.on('close', () => {
            clearInterval(keepAlive);
            abort.abort();
        });

        let toolbox;
        try {
            toolbox = await openToolbox(config.servers, { authorization: req.headers.authorization, allowWrite: config.allowWrite });
            const result = await runTurn({
                client,
                model: config.model,
                effort: config.effort,
                system: systemPrompt({ engagementId, unavailable: toolbox.unavailable }),
                messages,
                toolbox,
                emit,
                signal: abort.signal,
            });
            emit({ type: 'done', ...result });
        } catch (err) {
            if (!abort.signal.aborted) {
                console.error('nebula chat failed:', err);
                emit({ type: 'error', error: chatError(err) });
            }
        } finally {
            clearInterval(keepAlive);
            await toolbox?.close();
            res.end();
        }
    });

    return router;
}

/** What to tell the user, without leaking anything about the key. */
export function chatError(err) {
    if (err instanceof Anthropic.AuthenticationError) return 'The assistant\'s API key was refused. An administrator needs to replace it.';
    if (err instanceof Anthropic.RateLimitError) return 'The assistant is rate limited right now. Try again in a minute.';
    if (err instanceof Anthropic.BadRequestError) return `The request was rejected: ${err.message}`;
    if (err instanceof Anthropic.APIError) return `The model service failed (${err.status ?? 'no status'}). Try again.`;
    return 'The assistant failed. Try again.';
}
