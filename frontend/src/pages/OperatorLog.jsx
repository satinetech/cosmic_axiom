import { AlertTriangle, ArrowLeft, CheckCircle, ChevronDown, ChevronRight, Clock, Link2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

const API = import.meta.env.VITE_SATELLITE_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

const VERDICTS = {
    IN_SCOPE: { label: "In scope", className: "text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800" },
    OUT_OF_SCOPE: { label: "Out of scope", className: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800" },
    NOT_LISTED: { label: "Not in scope list", className: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800" },
};

const formatTime = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function duration(ms) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.round(hours / 24)} days`;
}

// <input type="datetime-local"> wants local time without a zone.
function localInputValue(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const emptyForm = () => ({ kind: "ACTION", approvedBy: "", summary: "", earlier: false, occurredAt: "", targetAddress: "", tool: "", command: "", output: "", correctsSeq: "" });

// Standalone at /engagements/:engagementId/log, or embedded as a tab of the
// engagement's home page (engagementId passed in, own header hidden).
function OperatorLog({ engagementId: engagementIdProp, embedded = false } = {}) {
    const params = useParams();
    const engagementId = engagementIdProp || params.engagementId;
    const [engagement, setEngagement] = useState(null);
    const [entries, setEntries] = useState([]);
    const [chain, setChain] = useState(null);
    const [users, setUsers] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [form, setForm] = useState(emptyForm);
    const [formError, setFormError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [expanded, setExpanded] = useState({});
    const [moreOpen, setMoreOpen] = useState(false);
    const [scopeAddresses, setScopeAddresses] = useState([]);
    const summaryRef = useRef(null);

    const load = useCallback(async () => {
        try {
            // Every entry, a page at a time, in order.
            const all = [];
            for (let after = 0; ; ) {
                const res = await fetch(`${API}/engagement/${engagementId}/log?after=${after}&limit=500`, { headers: authHeaders() });
                if (!res.ok) throw new Error(`Could not load the log (${res.status})`);
                const page = await res.json();
                all.push(...page);
                if (page.length < 500) break;
                after = page[page.length - 1].seq;
            }
            setEntries(all);
            const verify = await fetch(`${API}/engagement/${engagementId}/log/verify`, { headers: authHeaders() });
            setChain(verify.ok ? await verify.json() : null);
            setLoadError("");
        } catch (err) {
            setLoadError(err.message);
        } finally {
            setLoading(false);
        }
    }, [engagementId]);

    useEffect(() => {
        load();
        fetch(`${API}/engagement/${engagementId}`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : null)).then(setEngagement).catch(() => {});
        fetch(`${API}/scope/engagement/${engagementId}`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => setScopeAddresses(list.map((s) => s.address)))
            .catch(() => {});
        fetch(`${API}/users`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => setUsers(Object.fromEntries(list.map((u) => [u.id, u.name || u.username]))))
            .catch(() => {});
    }, [engagementId, load]);

    const correctedBy = useMemo(() => {
        const map = {};
        for (const e of entries) if (e.correctsSeq) (map[e.correctsSeq] ||= []).push(e.seq);
        return map;
    }, [entries]);

    const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

    // Suggestions: the engagement's scope and anything already logged.
    const targetSuggestions = useMemo(
        () => [...new Set([...scopeAddresses, ...entries.map((e) => e.targetAddress).filter(Boolean)])],
        [scopeAddresses, entries],
    );
    const toolSuggestions = useMemo(() => [...new Set(entries.map((e) => e.tool).filter(Boolean))], [entries]);

    const toggleEarlier = (checked) =>
        setForm((f) => ({ ...f, earlier: checked, occurredAt: checked ? f.occurredAt || localInputValue(new Date()) : "" }));

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        const body = { summary: form.summary, kind: form.kind };
        if (form.kind === "DECISION") body.approvedBy = form.approvedBy;
        if (form.earlier && form.occurredAt) body.occurredAt = new Date(form.occurredAt).toISOString();
        for (const field of ["targetAddress", "tool", "command", "output"]) if (form[field].trim()) body[field] = form[field];
        if (form.correctsSeq) body.correctsSeq = Number(form.correctsSeq);
        try {
            const res = await fetch(`${API}/engagement/${engagementId}/log`, {
                method: "POST",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setFormError({ field: data.field, message: data.error || "Could not save the entry" });
                // Show the field at fault if it is in the collapsed section.
                if (["occurredAt", "command", "output", "correctsSeq"].includes(data.field)) setMoreOpen(true);
                return;
            }
            // Keep target and tool: the next entry is usually about the same thing.
            setForm((f) => ({ ...emptyForm(), targetAddress: f.targetAddress, tool: f.tool }));
            await load();
            summaryRef.current?.focus();
        } catch (err) {
            setFormError({ message: err.message });
        } finally {
            setSaving(false);
        }
    };

    const inputClass = (field) =>
        `w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${
            formError?.field === field ? "border-red-500" : "border-gray-300 dark:border-gray-600"
        }`;

    return (
        <div className={embedded ? "space-y-6" : "p-6 max-w-5xl mx-auto space-y-6"}>
            {!embedded && (
            <div className="flex items-center gap-3">
                <Link to="/engagements" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Back to engagements">
                    <ArrowLeft size={18} />
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Operator Log</h1>
                    {engagement && <p className="text-sm text-gray-500 dark:text-gray-400">{engagement.name} · {engagement.customerName}</p>}
                </div>
            </div>
            )}

            {chain && (
                <div className={`rounded-lg border p-4 text-sm ${chain.ok
                    ? "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50"
                    : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20"}`}>
                    <div className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                        {chain.ok
                            ? <><CheckCircle size={16} className="text-green-600" /> Chain intact: {chain.entries} {chain.entries === 1 ? "entry" : "entries"} unchanged since written</>
                            : <><ShieldAlert size={16} className="text-red-600" /> Entry #{chain.seq} {chain.problem}</>}
                        {chain.lastRecordedAt && <span className="font-normal text-gray-500 dark:text-gray-400">· last written {formatTime(chain.lastRecordedAt)}</span>}
                    </div>
                    <p className="mt-1 text-gray-600 dark:text-gray-400">{chain.limit}</p>
                </div>
            )}

            <form onSubmit={submit} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm" role="radiogroup" aria-label="Kind of entry">
                        {[["ACTION", "Action"], ["DECISION", "Decision"]].map(([value, label]) => (
                            <button key={value} type="button" role="radio" aria-checked={form.kind === value}
                                onClick={() => setForm((f) => ({ ...f, kind: value }))}
                                className={`px-3 py-1.5 ${form.kind === value ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {form.kind === "DECISION" && (
                        <input value={form.approvedBy} onChange={set("approvedBy")} required aria-label="Approved by"
                            placeholder="Approved by (who authorised it)" className={`${inputClass("approvedBy")} md:w-80 w-full`} />
                    )}
                    <span className="text-xs text-gray-500">
                        {form.kind === "DECISION" ? "A decision: what was decided, and who authorised it." : "An action: something the team did."}
                    </span>
                </div>
                <textarea
                    ref={summaryRef}
                    rows={2}
                    autoFocus
                    value={form.summary}
                    onChange={set("summary")}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e); }}
                    required
                    aria-label="What was done, and why"
                    className={inputClass("summary")}
                    placeholder={form.kind === "DECISION"
                        ? "What was decided, and why? e.g. Disable jsmith's account and revoke sessions: confirmed token theft."
                        : "What did you do, and why? e.g. Tested the login form for SQL injection; blind boolean-based injection in the username field."}
                />
                <div className="flex flex-col md:flex-row gap-3">
                    <input value={form.targetAddress} onChange={set("targetAddress")} list="oplog-targets" aria-label="Target"
                        className={`${inputClass("targetAddress")} md:flex-[2] font-mono`} placeholder="Target (optional): host, IP or URL" />
                    <datalist id="oplog-targets">{targetSuggestions.map((t) => <option key={t} value={t} />)}</datalist>
                    <input value={form.tool} onChange={set("tool")} list="oplog-tools" aria-label="Tool"
                        className={`${inputClass("tool")} md:flex-1`} placeholder="Tool (optional)" />
                    <datalist id="oplog-tools">{toolSuggestions.map((t) => <option key={t} value={t} />)}</datalist>
                    <button type="submit" disabled={saving || !form.summary.trim()}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap">
                        {saving && <Loader2 size={14} className="animate-spin" />} Add entry
                    </button>
                </div>
                <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                    <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300">
                        {moreOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        More detail: when, command, output, corrections
                    </button>
                    <span>Ctrl+Enter adds the entry. Entries can't be edited or deleted; fix a mistake with a correcting entry.</span>
                </div>
                {moreOpen && (
                    <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                <input type="checkbox" checked={form.earlier} onChange={(e) => toggleEarlier(e.target.checked)} />
                                This happened earlier
                            </label>
                            {form.earlier && (
                                <input type="datetime-local" value={form.occurredAt} onChange={set("occurredAt")} max={localInputValue(new Date())}
                                    aria-label="When it happened" className={`${inputClass("occurredAt")} w-auto`} />
                            )}
                            <span className="text-xs text-gray-500">
                                {form.earlier ? "The entry will show that it was written up later." : "Otherwise the entry is timed now."}
                            </span>
                        </div>
                        <textarea rows={2} value={form.command} onChange={set("command")} aria-label="Command"
                            placeholder="Command (optional)" className={`${inputClass("command")} font-mono`} />
                        <textarea rows={3} value={form.output} onChange={set("output")} aria-label="Output"
                            placeholder="Output (optional)" className={`${inputClass("output")} font-mono`} />
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            Corrects entry
                            <select value={form.correctsSeq} onChange={set("correctsSeq")} className={`${inputClass("correctsSeq")} w-auto`}>
                                <option value="">none</option>
                                {[...entries].reverse().map((e) => (
                                    <option key={e.seq} value={e.seq}>#{e.seq}: {e.summary.slice(0, 60)}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                )}
                {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError.message}</p>}
            </form>

            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : loadError ? (
                <p className="text-red-600 dark:text-red-400">{loadError}</p>
            ) : entries.length === 0 ? (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8">No entries yet.</p>
            ) : (
                <ol className="space-y-3">
                    {[...entries].reverse().map((e) => {
                        const verdict = e.scopeVerdict && VERDICTS[e.scopeVerdict];
                        const lag = new Date(e.recordedAt) - new Date(e.occurredAt);
                        const open = expanded[e.seq];
                        return (
                            <li key={e.seq} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                    <span className="font-mono text-gray-500">#{e.seq}</span>
                                    <span className="text-gray-900 dark:text-gray-100">{formatTime(e.occurredAt)}</span>
                                    <span className="text-gray-500">· {users[e.operator] || e.operator.slice(0, 8)}</span>
                                    {e.backdated && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs text-gray-700 bg-gray-50 border-gray-300 dark:text-gray-300 dark:bg-gray-900 dark:border-gray-600"
                                            title={`Written ${formatTime(e.recordedAt)}`}>
                                            <Clock size={12} /> written {duration(lag)} later
                                        </span>
                                    )}
                                    {verdict && (
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs ${verdict.className}`}>
                                            {e.scopeVerdict === "IN_SCOPE" ? <CheckCircle size={12} /> : e.scopeVerdict === "OUT_OF_SCOPE" ? <XCircle size={12} /> : <AlertTriangle size={12} />}
                                            {verdict.label}
                                        </span>
                                    )}
                                    {e.kind === "DECISION" && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800">
                                            Decision · approved by {e.approvedBy}
                                        </span>
                                    )}
                                    {e.correctsSeq && <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Link2 size={12} /> corrects #{e.correctsSeq}</span>}
                                    {correctedBy[e.seq] && <span className="text-xs text-amber-700 dark:text-amber-400">corrected by {correctedBy[e.seq].map((s) => `#${s}`).join(", ")}</span>}
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-gray-900 dark:text-gray-100">{e.summary}</p>
                                {(e.targetAddress || e.tool) && (
                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                        {e.targetAddress && <>Target <code className="font-mono">{e.targetAddress}</code></>}
                                        {e.targetAddress && e.tool && " · "}
                                        {e.tool && <>Tool {e.tool}</>}
                                    </p>
                                )}
                                {e.command && <pre className="mt-2 rounded bg-gray-50 dark:bg-gray-900 p-2 text-xs font-mono whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">{e.command}</pre>}
                                {e.output && (
                                    <div className="mt-2">
                                        <button type="button" onClick={() => setExpanded((x) => ({ ...x, [e.seq]: !open }))}
                                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
                                            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Output
                                        </button>
                                        {open && <pre className="mt-1 rounded bg-gray-50 dark:bg-gray-900 p-2 text-xs font-mono whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200 max-h-96 overflow-auto">{e.output}</pre>}
                                    </div>
                                )}
                                {e.attachments?.length > 0 && (
                                    <p className="mt-2 text-xs text-gray-500">
                                        Attached: {e.attachments.map((a) => a.label || `${a.sha256.slice(0, 12)}…`).join(", ")}
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}

export default OperatorLog;
