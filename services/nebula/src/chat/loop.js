/**
 * The chat's agent loop: Claude, streamed, calling the toolbox's tools until it
 * has an answer.
 *
 * Stateless. The caller sends the whole conversation each turn -- including the
 * assistant's tool calls and the tool results, exactly as this loop produced
 * them -- and gets the extended conversation back in the final event. Nothing
 * is kept here between requests.
 */

import Anthropic from '@anthropic-ai/sdk';

/** Upper bound on model calls in one user turn, so a confused loop ends. */
export const MAX_ITERATIONS = 25;

/**
 * Run one user turn.
 *
 * @param {object} p
 * @param {Anthropic} p.client
 * @param {string} p.model
 * @param {string} p.effort        low | medium | high | xhigh | max
 * @param {string} p.system
 * @param {Anthropic.Beta.BetaMessageParam[]} p.messages  ends with the user's new message
 * @param {{definitions: object[], call: (name: string, input: unknown) => Promise<{text: string, isError: boolean}>}} p.toolbox
 * @param {(event: object) => void} p.emit   progress for the browser
 * @param {AbortSignal} [p.signal]
 */
export async function runTurn({ client, model, effort, system, messages, toolbox, emit, signal }) {
    const transcript = [...messages];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 };
    let jsonRetries = 0;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = client.beta.messages.stream(
            {
                model,
                max_tokens: 64000,
                system,
                messages: transcript,
                tools: toolbox.definitions,
                output_config: { effort },
                // Caches the conversation so far; each loop iteration re-reads it.
                cache_control: { type: 'ephemeral' },
                // A model that declines -- security tooling can trip the cyber
                // classifier -- is re-run on Anthropic's recommended fallback.
                betas: ['server-side-fallback-2026-07-01'],
                fallbacks: 'default',
            },
            { signal },
        );
        stream.on('text', (text) => emit({ type: 'text', text }));

        let message;
        try {
            message = await stream.finalMessage();
            jsonRetries = 0;
        } catch (err) {
            // Only a tool input that could not be parsed at all is retried.
            if (err instanceof Anthropic.APIError || signal?.aborted || jsonRetries++ >= 2) throw err;
            emit({ type: 'notice', text: 'Retrying a garbled tool call.' });
            continue;
        }

        usage.input_tokens += message.usage?.input_tokens ?? 0;
        usage.output_tokens += message.usage?.output_tokens ?? 0;
        usage.cache_read_input_tokens += message.usage?.cache_read_input_tokens ?? 0;

        for (const block of message.content) {
            if (block.type === 'fallback') emit({ type: 'notice', text: `${block.from.model} declined; ${block.to.model} continued.` });
        }

        if (message.stop_reason === 'refusal') {
            // A refusal can cut a tool call off mid-input: never run its tools.
            emit({ type: 'refusal', category: message.stop_details?.category ?? null });
            return { messages: transcript, usage, stopReason: 'refusal' };
        }

        transcript.push({ role: 'assistant', content: message.content });

        if (message.stop_reason === 'pause_turn') continue;

        const calls = message.content.filter((b) => b.type === 'tool_use');
        if (calls.length === 0) return { messages: transcript, usage, stopReason: message.stop_reason };

        if (message.stop_reason === 'max_tokens') {
            // A truncated tool input usually still parses; do not run it.
            transcript.pop();
            emit({ type: 'notice', text: 'The reply ran out of room mid tool call; ask again, more narrowly.' });
            return { messages: transcript, usage, stopReason: 'max_tokens' };
        }

        // All results in one user message, in call order.
        const results = await Promise.all(
            calls.map(async (call) => {
                emit({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
                const r = await toolbox.call(call.name, call.input);
                emit({ type: 'tool_result', id: call.id, name: call.name, isError: r.isError, preview: r.text.slice(0, 400) });
                return { type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.isError ? { is_error: true } : {}) };
            }),
        );
        transcript.push({ role: 'user', content: results });
    }

    emit({ type: 'notice', text: `Stopped after ${MAX_ITERATIONS} steps without a final answer.` });
    return { messages: transcript, usage, stopReason: 'iteration_limit' };
}
