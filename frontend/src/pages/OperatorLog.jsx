import { AlertTriangle, ArrowLeft, CheckCircle, ChevronDown, ChevronRight, Clock, Link2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const emptyForm = () => ({ summary: "", occurredAt: "", targetAddress: "", tool: "", command: "", output: "", correctsSeq: "" });

function OperatorLog() {
    const { engagementId } = useParams();
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

    const submit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError(null);
        const body = { summary: form.summary };
        if (form.occurredAt) body.occurredAt = new Date(form.occurredAt).toISOString();
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
                return;
            }
            setForm(emptyForm());
            await load();
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
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Link to="/engagements" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="Back to engagements">
                    <ArrowLeft size={18} />
                </Link>
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Operator Log</h1>
                    {engagement && <p className="text-sm text-gray-500 dark:text-gray-400">{engagement.name} · {engagement.customerName}</p>}
                </div>
            </div>

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
                <h2 className="font-medium text-gray-900 dark:text-white">New entry</h2>
                <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">What was done, and why <span className="text-red-500">*</span></label>
                    <textarea rows={3} value={form.summary} onChange={set("summary")} required className={inputClass("summary")}
                        placeholder="e.g. Tested the login form for SQL injection; confirmed blind boolean-based injection in the username field." />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">When it happened</label>
                        <input type="datetime-local" value={form.occurredAt} onChange={set("occurredAt")} max={localInputValue(new Date())} className={inputClass("occurredAt")} />
                        <p className="mt-1 text-xs text-gray-500">Blank means now. Earlier times are marked as written up later.</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Target</label>
                        <input value={form.targetAddress} onChange={set("targetAddress")} className={inputClass("targetAddress")} placeholder="Host, IP or URL, as you'd type it" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Tool</label>
                        <input value={form.tool} onChange={set("tool")} className={inputClass("tool")} placeholder="e.g. Burp Suite" />
                    </div>
                </div>
                <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Command</label>
                    <textarea rows={2} value={form.command} onChange={set("command")} className={`${inputClass("command")} font-mono`} />
                </div>
                <div>
                    <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Output</label>
                    <textarea rows={3} value={form.output} onChange={set("output")} className={`${inputClass("output")} font-mono`} />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Corrects entry</label>
                        <select value={form.correctsSeq} onChange={set("correctsSeq")} className={inputClass("correctsSeq")}>
                            <option value="">—</option>
                            {entries.map((e) => <option key={e.seq} value={e.seq}>#{e.seq}</option>)}
                        </select>
                    </div>
                    <p className="flex-1 text-xs text-gray-500">Entries can't be edited or deleted. To fix a mistake, write a new entry that corrects it.</p>
                    <button type="submit" disabled={saving}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                        {saving && <Loader2 size={14} className="animate-spin" />} Add entry
                    </button>
                </div>
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
