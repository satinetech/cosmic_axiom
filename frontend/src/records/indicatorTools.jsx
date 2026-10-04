import { ClipboardPaste, Download, Loader2 } from "lucide-react";
import { useState } from "react";

export const INDICATOR_TYPES = [
    { value: "IP", label: "IP address" },
    { value: "DOMAIN", label: "Domain" },
    { value: "URL", label: "URL" },
    { value: "EMAIL", label: "Email" },
    { value: "HASH_SHA256", label: "SHA-256" },
    { value: "HASH_SHA1", label: "SHA-1" },
    { value: "HASH_MD5", label: "MD5" },
    { value: "FILE_NAME", label: "File name" },
    { value: "ACCOUNT", label: "Account" },
    { value: "OTHER", label: "Other" },
];

/** Undo the usual defanging (forge does the same before storing). */
const refang = (v) => v.replace(/^hxxp(s?):\/\//i, "http$1://").replace(/\[\.\]|\(\.\)|\[dot\]/gi, ".").replace(/\[@\]|\[at\]/gi, "@").trim();

/** The likeliest type for a pasted value. */
export function detectIndicatorType(raw) {
    const v = refang(raw);
    if (/^[0-9a-f]{64}$/i.test(v)) return "HASH_SHA256";
    if (/^[0-9a-f]{40}$/i.test(v)) return "HASH_SHA1";
    if (/^[0-9a-f]{32}$/i.test(v)) return "HASH_MD5";
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v) || (/^[0-9a-f:]+$/i.test(v) && (v.match(/:/g) || []).length >= 2)) return "IP";
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return "URL";
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "EMAIL";
    if (/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) return "DOMAIN";
    if (/\.[a-z0-9]{2,4}$/i.test(v) && !/\s/.test(v)) return "FILE_NAME";
    return "OTHER";
}

const csvCell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote always; neutralise spreadsheet formulas.
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Paste many + Export CSV, for the Indicators tab. */
export function IndicatorTools({ records, reload, engagementId, api }) {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const lines = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];

    const addAll = async () => {
        setBusy(true);
        const outcome = { added: 0, already: 0, failed: [] };
        for (const value of lines) {
            try {
                await api(`/engagement/${engagementId}/indicators`, { method: "POST", body: { type: detectIndicatorType(value), value } });
                outcome.added += 1;
            } catch (err) {
                if (/already recorded/.test(err.message)) outcome.already += 1;
                else outcome.failed.push(`${value}: ${err.message}`);
            }
        }
        setResult(outcome);
        setBusy(false);
        if (outcome.failed.length === 0) setText("");
        await reload();
    };

    const exportCsv = () => {
        const header = ["type", "value", "first_seen_utc", "last_seen_utc", "confidence", "description"];
        const rows = records.map((r) => [r.type, r.value, r.firstSeen, r.lastSeen, r.confidence, r.description]);
        const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "indicators.csv";
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const btn = "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700";
    return (
        <>
            <button onClick={exportCsv} disabled={records.length === 0} className={`${btn} disabled:opacity-50`}><Download size={14} /> Export CSV</button>
            <button onClick={() => { setOpen((o) => !o); setResult(null); }} className={btn}><ClipboardPaste size={14} /> Paste many</button>
            {open && (
                <div className="basis-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-2">
                    <label htmlFor="indicator-paste" className="block text-sm text-gray-700 dark:text-gray-300">
                        One indicator per line. Types are detected; defanged values (hxxp, [.]) are restored.
                    </label>
                    <textarea id="indicator-paste" rows={6} value={text} onChange={(e) => setText(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                    {lines.length > 0 && (
                        <p className="text-xs text-gray-500">
                            {lines.length} to add: {Object.entries(lines.reduce((acc, l) => ({ ...acc, [detectIndicatorType(l)]: (acc[detectIndicatorType(l)] || 0) + 1 }), {}))
                                .map(([t, n]) => `${n} ${INDICATOR_TYPES.find((x) => x.value === t)?.label ?? t}`).join(", ")}
                        </p>
                    )}
                    {result && (
                        <div className="text-sm">
                            <p className="text-gray-700 dark:text-gray-300">Added {result.added}{result.already ? `, ${result.already} already recorded` : ""}.</p>
                            {result.failed.map((f) => <p key={f} className="text-red-600 dark:text-red-400">{f}</p>)}
                        </div>
                    )}
                    <div className="flex justify-end">
                        <button onClick={addAll} disabled={busy || lines.length === 0}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                            {busy && <Loader2 size={14} className="animate-spin" />} Add {lines.length || ""}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
