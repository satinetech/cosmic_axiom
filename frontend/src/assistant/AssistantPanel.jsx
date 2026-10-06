import { AlertTriangle, Check, ChevronRight, Loader2, RotateCcw, Send, Sparkles, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { API, authHeaders } from "./api";
import { displayItems, liveItems, parseSSE, toolLabel } from "./transcript";

// The conversation survives tab changes and reloads, not the browser closing.
// Storage can be full or unavailable; the panel works without it.
const storageKey = (engagementId) => `assistant:${engagementId}`;
function loadConversation(engagementId) {
    try {
        return JSON.parse(sessionStorage.getItem(storageKey(engagementId)) || "[]");
    } catch {
        return [];
    }
}
function saveConversation(engagementId, messages) {
    try {
        if (messages.length) sessionStorage.setItem(storageKey(engagementId), JSON.stringify(messages));
        else sessionStorage.removeItem(storageKey(engagementId));
    } catch {
        // Too large or blocked: the conversation lasts as long as the page.
    }
}

/**
 * The engagement assistant, as a panel over the right of the engagement page.
 * It reads the engagement and its tooling through nebula (/ai/chat) and cannot
 * change anything.
 */
export default function AssistantPanel({ engagementId, open, onClose }) {
    const [messages, setMessages] = useState(() => loadConversation(engagementId));
    const [pending, setPending] = useState(null); // the user's text while a turn runs
    const [events, setEvents] = useState([]);
    const [failure, setFailure] = useState("");
    const [draft, setDraft] = useState("");
    const abortRef = useRef(null);
    const bottomRef = useRef(null);

    // Braced bodies: an effect may return only a cleanup function, and
    // scrollIntoView returns a Promise in current Chromium.
    useEffect(() => { saveConversation(engagementId, messages); }, [engagementId, messages]);
    useEffect(() => () => abortRef.current?.abort(), []);
    useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages, events, pending]);

    const items = useMemo(() => displayItems(messages), [messages]);
    const live = useMemo(() => liveItems(events), [events]);
    const busy = pending !== null;

    async function send(event) {
        event?.preventDefault();
        const text = draft.trim();
        if (!text || busy) return;
        const outgoing = [...messages, { role: "user", content: text }];
        setDraft("");
        setFailure("");
        setEvents([]);
        setPending(text);

        const abort = new AbortController();
        abortRef.current = abort;
        let finished = false;
        try {
            const res = await fetch(`${API}/ai/chat`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ engagementId, messages: outgoing }),
                signal: abort.signal,
            });
            if (!res.ok || !res.body) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.error || `The assistant is unavailable (${res.status}).`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                const parsed = parseSSE(buffer + decoder.decode(value, { stream: true }));
                buffer = parsed.rest;
                for (const e of parsed.events) {
                    if (e.type === "done") {
                        finished = true;
                        setMessages(e.messages);
                    } else if (e.type === "error") {
                        throw new Error(e.error);
                    } else {
                        setEvents((prev) => [...prev, e]);
                    }
                }
            }
            if (!finished) throw new Error("The connection closed before the assistant finished.");
            setEvents((prev) => prev.filter((e) => e.type === "notice" || e.type === "refusal"));
        } catch (err) {
            if (!abort.signal.aborted) setFailure(err.message);
            // The turn did not complete: give the question back to edit or resend.
            if (!finished) {
                setDraft(text);
                setEvents([]);
            }
        } finally {
            abortRef.current = null;
            setPending(null);
        }
    }

    function restart() {
        abortRef.current?.abort();
        setMessages([]);
        setEvents([]);
        setFailure("");
    }

    if (!open) return null;

    return (
        <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full sm:w-[30rem] flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
            aria-label="Engagement assistant"
        >
            <header className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
                <h2 className="flex-1 font-semibold text-gray-900 dark:text-white">Assistant</h2>
                <button onClick={restart} disabled={busy || !messages.length} title="New conversation"
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40">
                    <RotateCcw size={16} />
                </button>
                <button onClick={onClose} title="Close" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X size={16} />
                </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm">
                {items.length === 0 && !busy && (
                    <div className="text-gray-500 dark:text-gray-400 space-y-2">
                        <p>Ask about this engagement. The assistant reads its records and the tooling attached to it, and names the evidence it used.</p>
                        <p>It cannot change anything. When something should be recorded, it writes the entry for you to add.</p>
                    </div>
                )}
                {items.map((item, i) => <Item key={item.id ?? i} item={item} />)}
                {busy && (
                    <>
                        <Item item={{ kind: "user", text: pending }} />
                        {live.map((item, i) => <Item key={item.id ?? `live-${i}`} item={item} />)}
                        {!live.some((i) => i.kind === "assistant") && (
                            <div className="flex items-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Working…</div>
                        )}
                    </>
                )}
                {!busy && live.map((item, i) => <Item key={`after-${i}`} item={item} />)}
                {failure && <Item item={{ kind: "notice", tone: "warn", text: failure }} />}
                <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t border-gray-200 dark:border-gray-700 p-3 flex gap-2 items-end">
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) send(e); }}
                    rows={2}
                    placeholder="Ask about this engagement…"
                    className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                {busy ? (
                    <button type="button" onClick={() => abortRef.current?.abort()} title="Stop"
                        className="p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                        <Square size={16} />
                    </button>
                ) : (
                    <button type="submit" disabled={!draft.trim()} title="Send"
                        className="p-2.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                        <Send size={16} />
                    </button>
                )}
            </form>
        </aside>
    );
}

const markdown = {
    p: (props) => <p className="my-2" {...props} />,
    ul: (props) => <ul className="my-2 ml-5 list-disc space-y-1" {...props} />,
    ol: (props) => <ol className="my-2 ml-5 list-decimal space-y-1" {...props} />,
    h1: (props) => <h3 className="mt-3 mb-1 font-semibold" {...props} />,
    h2: (props) => <h3 className="mt-3 mb-1 font-semibold" {...props} />,
    h3: (props) => <h3 className="mt-3 mb-1 font-semibold" {...props} />,
    code: ({ className, ...props }) => (
        <code className={`${className ?? ""} rounded bg-gray-100 dark:bg-gray-800 px-1 py-0.5 font-mono text-xs`} {...props} />
    ),
    pre: (props) => <pre className="my-2 overflow-x-auto rounded-lg bg-gray-100 dark:bg-gray-800 p-3 text-xs" {...props} />,
    table: (props) => <div className="my-2 overflow-x-auto"><table className="min-w-full text-xs border-collapse" {...props} /></div>,
    th: (props) => <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left font-semibold" {...props} />,
    td: (props) => <td className="border border-gray-200 dark:border-gray-700 px-2 py-1 align-top" {...props} />,
    a: (props) => <a className="text-indigo-600 dark:text-indigo-400 underline" target="_blank" rel="noreferrer" {...props} />,
};

function Item({ item }) {
    if (item.kind === "user") {
        return (
            <div className="ml-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                {item.text}
            </div>
        );
    }
    if (item.kind === "assistant") {
        return (
            <div className="text-gray-900 dark:text-gray-100 leading-relaxed">
                <Markdown remarkPlugins={[remarkGfm]} components={markdown}>{item.text}</Markdown>
            </div>
        );
    }
    if (item.kind === "tool") {
        const running = item.result === undefined;
        return (
            <details className="group rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-gray-600 dark:text-gray-300 list-none">
                    <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
                    <span className="flex-1">{toolLabel(item.name)}</span>
                    {running ? <Loader2 size={12} className="animate-spin" />
                        : item.isError ? <AlertTriangle size={12} className="text-amber-500" />
                        : <Check size={12} className="text-green-600" />}
                </summary>
                <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 px-3 py-2 font-mono text-[11px] text-gray-600 dark:text-gray-400">
                    <pre className="whitespace-pre-wrap break-all">{JSON.stringify(item.input, null, 1)}</pre>
                    {!running && <pre className="whitespace-pre-wrap break-all max-h-60 overflow-y-auto">{item.result}</pre>}
                </div>
            </details>
        );
    }
    return (
        <div className={`flex gap-2 rounded-lg px-3 py-2 text-xs ${item.tone === "warn"
            ? "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            : "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
            {item.tone === "warn" && <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
            <span>{item.text}</span>
        </div>
    );
}
