/**
 * The assistant's conversation, for display. Plain JS with no React, so it can
 * be tested with `node --test` (test/assistant.test.js).
 *
 * The conversation is kept exactly as nebula returned it -- Anthropic message
 * params, including tool calls and tool results -- because it has to go back
 * unchanged on the next turn. This module only reads it.
 */

/**
 * Split server-sent event text into JSON events. Returns the events and any
 * incomplete tail to prepend to the next chunk. Comment lines (keep-alives)
 * are skipped.
 */
export function parseSSE(buffer) {
    const parts = buffer.split("\n\n");
    const rest = parts.pop() ?? "";
    const events = [];
    for (const part of parts) {
        const data = part
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
        if (!data) continue;
        try {
            events.push(JSON.parse(data));
        } catch {
            // A malformed event is dropped rather than ending the stream.
        }
    }
    return { events, rest };
}

/** "case__wazuh_search_alerts" -> "Wazuh search alerts". */
export function toolLabel(name) {
    const bare = name.includes("__") ? name.slice(name.indexOf("__") + 2) : name;
    const words = bare.replace(/_/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

const textOf = (content) =>
    typeof content === "string"
        ? content
        : content
              .filter((b) => b.type === "text")
              .map((b) => b.text)
              .join("");

/**
 * The conversation as things to show, in order:
 *   { kind: "user", text }
 *   { kind: "assistant", text }
 *   { kind: "tool", id, name, input, result, isError }   result undefined until it returns
 */
export function displayItems(messages) {
    const items = [];
    const tools = new Map();
    for (const message of messages ?? []) {
        if (message.role === "user") {
            if (typeof message.content === "string") {
                items.push({ kind: "user", text: message.content });
                continue;
            }
            for (const block of message.content) {
                if (block.type === "tool_result") {
                    const tool = tools.get(block.tool_use_id);
                    if (tool) {
                        tool.result = typeof block.content === "string" ? block.content : textOf(block.content ?? []);
                        tool.isError = block.is_error === true;
                    }
                } else if (block.type === "text" && block.text) {
                    items.push({ kind: "user", text: block.text });
                }
            }
            continue;
        }
        for (const block of message.content ?? []) {
            if (block.type === "text" && block.text) {
                const last = items[items.length - 1];
                if (last?.kind === "assistant") last.text += block.text;
                else items.push({ kind: "assistant", text: block.text });
            } else if (block.type === "tool_use") {
                const tool = { kind: "tool", id: block.id, name: block.name, input: block.input, result: undefined, isError: false };
                tools.set(block.id, tool);
                items.push(tool);
            }
        }
    }
    return items;
}

/**
 * The display for a turn in progress, built from its events so far: the text
 * streamed, the tool calls made and what came back.
 */
export function liveItems(events) {
    const items = [];
    const tools = new Map();
    for (const e of events) {
        if (e.type === "text") {
            const last = items[items.length - 1];
            if (last?.kind === "assistant") last.text += e.text;
            else items.push({ kind: "assistant", text: e.text });
        } else if (e.type === "tool_call") {
            const tool = { kind: "tool", id: e.id, name: e.name, input: e.input, result: undefined, isError: false };
            tools.set(e.id, tool);
            items.push(tool);
        } else if (e.type === "tool_result") {
            const tool = tools.get(e.id);
            if (tool) {
                tool.result = e.preview;
                tool.isError = e.isError;
            }
        } else if (e.type === "notice" || e.type === "refusal" || e.type === "error") {
            items.push({
                kind: "notice",
                tone: e.type === "notice" ? "info" : "warn",
                text:
                    e.type === "refusal"
                        ? `The model declined to continue${e.category ? ` (${e.category})` : ""}. Try rephrasing the question.`
                        : e.text ?? e.error,
            });
        }
    }
    return items;
}
