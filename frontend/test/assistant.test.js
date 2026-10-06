// node --test test/  -- the assistant panel's conversation logic, no browser.
import assert from "node:assert/strict";
import { test } from "node:test";

import { displayItems, liveItems, parseSSE, toolLabel } from "../src/assistant/transcript.js";

test("parseSSE: whole events parsed, the tail kept, keep-alives skipped", () => {
    const { events, rest } = parseSSE(': keep-alive\n\ndata: {"type":"text","text":"a"}\n\ndata: {"type":"te');
    assert.deepEqual(events, [{ type: "text", text: "a" }]);
    assert.equal(rest, 'data: {"type":"te');
    assert.deepEqual(parseSSE(rest + 'xt","text":"b"}\n\n').events, [{ type: "text", text: "b" }]);
});

test("parseSSE: a malformed event is dropped, not fatal", () => {
    assert.deepEqual(parseSSE('data: {nope\n\ndata: {"type":"done"}\n\n').events, [{ type: "done" }]);
});

test("toolLabel drops the server prefix", () => {
    assert.equal(toolLabel("case__wazuh_search_alerts"), "Wazuh search alerts");
    assert.equal(toolLabel("lookup"), "Lookup");
});

test("displayItems: user text, assistant text, tool calls with their results", () => {
    const items = displayItems([
        { role: "user", content: "Anything on dc01?" },
        { role: "assistant", content: [
            { type: "thinking", thinking: "" },
            { type: "text", text: "Checking." },
            { type: "tool_use", id: "t1", name: "case__wazuh_search_alerts", input: { agent: "dc01" } },
        ] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "0 alerts", is_error: false }] },
        { role: "assistant", content: [{ type: "text", text: "Nothing in 24h." }] },
    ]);
    assert.deepEqual(items.map((i) => i.kind), ["user", "assistant", "tool", "assistant"]);
    assert.equal(items[2].result, "0 alerts");
    assert.equal(items[3].text, "Nothing in 24h.");
});

test("liveItems: streamed text joins, tool results attach, refusals say so", () => {
    const items = liveItems([
        { type: "text", text: "Look" },
        { type: "text", text: "ing." },
        { type: "tool_call", id: "t1", name: "case__velociraptor_vql", input: { vql: "SELECT 1" } },
        { type: "tool_result", id: "t1", name: "case__velociraptor_vql", isError: true, preview: "denied" },
        { type: "refusal", category: "cyber" },
    ]);
    assert.equal(items[0].text, "Looking.");
    assert.deepEqual([items[1].result, items[1].isError], ["denied", true]);
    assert.match(items[2].text, /declined to continue \(cyber\)/);
});
