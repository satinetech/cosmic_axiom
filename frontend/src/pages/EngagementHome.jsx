import { ArrowLeft, ExternalLink, FileText, ImagePlus, Loader2, Pencil, Plus, Shield, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import ImageManagementModal from "../components/ImageManagementModal";
import NewEngagementModal from "../components/NewEngagementModal";
import RecordsTab from "../components/RecordsTab";
import { RECORD_TYPES } from "../records";
import ScopeModal from "../components/ScopeModal";
import { TABS, engagementKindLabel, profileOf } from "../profiles";
import OperatorLog from "./OperatorLog";

const API = import.meta.env.VITE_SATELLITE_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/** fetch + JSON, throwing the server's message on a non-2xx. */
async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { ...authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

const SEVERITY_STYLES = {
    CRITICAL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    MEDIUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    LOW: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

const card = "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4";
const button = "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors";
const primary = `${button} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`;
const secondary = `${button} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;
const input = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100";

const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : "—");

// A single engagement from forge carries `customer` as an object, a list
// entry as the name; read either.
const customerName = (e) => (typeof e?.customer === "string" ? e.customer : e?.customer?.name || e?.customerName || "");

/**
 * An engagement's home: everything about one engagement in one place, as tabs
 * chosen by its profile (src/profiles). /engagements/:engagementId?tab=<key>
 */
function EngagementHome() {
    const { engagementId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const [engagement, setEngagement] = useState(null);
    const [report, setReport] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            setEngagement(await api(`/engagement/${engagementId}`));
            const reports = await api("/reports");
            setReport((Array.isArray(reports) ? reports : []).find((r) => r.engagementId === engagementId) || null);
            setError("");
        } catch (err) {
            setError(err.message);
        }
    }, [engagementId]);

    useEffect(() => { load(); }, [load]);

    if (error) return <div className="p-6 text-red-600 dark:text-red-400">{error}</div>;
    if (!engagement) return <div className="p-6 flex justify-center"><Loader2 className="animate-spin text-gray-400" /></div>;

    const profile = profileOf(engagement);
    const tab = profile.tabs.includes(searchParams.get("tab")) ? searchParams.get("tab") : profile.tabs[0];

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex items-start gap-3">
                <Link to="/engagements" className="p-2 mt-1 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" title="All engagements">
                    <ArrowLeft size={18} />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{engagement.name}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {customerName(engagement)} · {engagementKindLabel(engagement)} · {engagement.status?.toLowerCase()}
                    </p>
                </div>
            </div>

            <nav className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto" aria-label="Engagement sections">
                {profile.tabs.map((key) => (
                    <button
                        key={key}
                        onClick={() => setSearchParams({ tab: key })}
                        aria-current={tab === key ? "page" : undefined}
                        className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${tab === key
                            ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
                    >
                        {profile.tabLabels?.[key] ?? TABS[key].label}
                    </button>
                ))}
            </nav>

            {tab === "overview" && <OverviewTab engagement={engagement} report={report} onChanged={load} />}
            {TABS[tab].records && <RecordsTab key={tab} engagementId={engagementId} config={RECORD_TYPES[TABS[tab].records]} />}
            {tab === "scope" && <ScopeTab engagement={engagement} onChanged={load} />}
            {tab === "findings" && <FindingsTab engagement={engagement} report={report} onReportCreated={load} />}
            {tab === "log" && <OperatorLog engagementId={engagementId} embedded />}
            {tab === "roe" && <RoeTab engagement={engagement} />}
            {tab === "report" && <ReportTab engagement={engagement} report={report} onReportCreated={load} />}
        </div>
    );
}

function OverviewTab({ engagement, report, onChanged }) {
    const [editing, setEditing] = useState(false);
    const [customers, setCustomers] = useState([]);
    const profile = profileOf(engagement);

    const openEdit = async () => {
        setCustomers(await api("/customer").catch(() => []));
        setEditing(true);
    };
    const save = async (data) => {
        await api(`/engagement/${engagement.id}`, { method: "PUT", body: data });
        await onChanged();
    };

    const facts = [
        ["Customer", customerName(engagement)],
        ["Kind", profile.label],
        ...(profile.usesTestingType ? [["Type", engagementKindLabel(engagement)], ["Methodology", engagement.methodology?.replace(/_/g, " ").toLowerCase()]] : []),
        ["Status", engagement.status?.toLowerCase()],
        ["Start", formatDate(engagement.startDate)],
        ["End", formatDate(engagement.endDate)],
        ["Contact", [engagement.contactName, engagement.contactEmail].filter(Boolean).join(" · ") || "—"],
        ["Report", report ? report.title : "Not started"],
    ];

    return (
        <div className="space-y-4">
            <div className={card}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-gray-900 dark:text-white">Details</h2>
                    <button onClick={openEdit} className={secondary}><Pencil size={14} /> Edit</button>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    {facts.map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                            <dt className="w-28 shrink-0 text-gray-500 dark:text-gray-400">{k}</dt>
                            <dd className="text-gray-900 dark:text-gray-100">{v || "—"}</dd>
                        </div>
                    ))}
                </dl>
                {engagement.description && <p className="mt-3 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{engagement.description}</p>}
            </div>
            <NewEngagementModal isOpen={editing} onClose={() => setEditing(false)} onSave={save} customers={customers} initialData={engagement} />
        </div>
    );
}

function ScopeTab({ engagement, onChanged }) {
    const [managing, setManaging] = useState(false);
    const scopes = Array.isArray(engagement.scopes) ? engagement.scopes : [];
    return (
        <div className={card}>
            <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium text-gray-900 dark:text-white">Scope ({scopes.length})</h2>
                <button onClick={() => setManaging(true)} className={secondary}><Target size={14} /> Manage scope</button>
            </div>
            {scopes.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing in scope yet.</p>
            ) : (
                <table className="w-full text-sm">
                    <thead><tr className="text-left text-gray-500"><th className="py-1">Address</th><th>Status</th><th>Description</th></tr></thead>
                    <tbody>
                        {scopes.map((s) => (
                            <tr key={s.id} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="py-1.5 font-mono text-gray-900 dark:text-gray-100">{s.address}</td>
                                <td className={s.inScope ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{s.inScope ? "In scope" : "Out of scope"}</td>
                                <td className="text-gray-600 dark:text-gray-400">{s.description || "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <ScopeModal isOpen={managing} onClose={() => { setManaging(false); onChanged(); }} engagement={engagement} onScopeUpdated={onChanged} />
        </div>
    );
}

/** The engagement's report, created on first need. */
async function ensureReport(engagement, report) {
    if (report) return report;
    return api("/reports", {
        method: "POST",
        body: { engagementId: engagement.id, title: `${customerName(engagement)} ${profileOf(engagement).label} report`.trim() },
    });
}

const emptyFinding = { title: "", severity: "MEDIUM", description: "", impact: "", recommendation: "" };

function FindingsTab({ engagement, report, onReportCreated }) {
    const [sections, setSections] = useState([]);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(emptyFinding);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [imagesFor, setImagesFor] = useState(null); // the finding whose images are open
    const [uploading, setUploading] = useState(false);

    const loadSections = useCallback(async () => {
        if (!report) { setSections([]); setLoading(false); return; }
        try {
            const data = await api(`/reports/${report.id}/sections`);
            setSections(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [report]);

    useEffect(() => { loadSections(); }, [loadSections]);

    const findings = sections
        .filter((s) => s.type?.toUpperCase() === "FINDING" && s.reportFinding)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const addFinding = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const r = await ensureReport(engagement, report);
            await api("/sections", { method: "POST", body: { reportId: r.id, type: "FINDING", position: sections.length, ...form } });
            setForm(emptyFinding);
            setAdding(false);
            if (!report) await onReportCreated(); else await loadSections();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Image handlers, in the shape ImageManagementModal calls them.
    const refreshImages = async (findingId) => {
        const data = await api(`/reports/${report.id}/sections`);
        setSections(Array.isArray(data) ? data : []);
        setImagesFor((cur) => (cur ? (data.find((s) => s.reportFinding?.id === findingId) || cur) : cur));
    };
    const onUpload = async (reportFindingId, file, title, caption) => {
        setUploading(true);
        try {
            const imageData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1]);
                reader.readAsDataURL(file);
            });
            await api("/images", { method: "POST", body: { reportFindingId, title: title || file.name, caption: caption || "", imageData, mimeType: file.type } });
            await refreshImages(reportFindingId);
        } catch (err) {
            alert(err.message);
        } finally {
            setUploading(false);
        }
    };
    const onUpdate = async (imageId, field, value) => {
        await api(`/images/${imageId}`, { method: "PUT", body: { [field]: value } }).catch((err) => alert(err.message));
        await refreshImages(imagesFor?.reportFinding?.id);
    };
    const onDelete = async (imageId, reportFindingId) => {
        await api(`/images/${imageId}`, { method: "DELETE" }).catch((err) => alert(err.message));
        await refreshImages(reportFindingId);
    };

    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-medium text-gray-900 dark:text-white">Findings ({findings.length})</h2>
                <div className="flex gap-2">
                    {report && <Link to={`/report-writer/${report.id}`} className={secondary}><ExternalLink size={14} /> Add from library in the Report Writer</Link>}
                    <button onClick={() => setAdding((a) => !a)} className={primary}><Plus size={14} /> New finding</button>
                </div>
            </div>

            {adding && (
                <form onSubmit={addFinding} className={`${card} space-y-3`}>
                    <div className="flex flex-col md:flex-row gap-3">
                        <input className={`${input} md:flex-[3]`} placeholder="Title" aria-label="Title" value={form.title} onChange={set("title")} required />
                        <select className={`${input} md:flex-1`} aria-label="Severity" value={form.severity} onChange={set("severity")}>
                            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                        </select>
                    </div>
                    <textarea className={input} rows={3} placeholder="What was found, and how" aria-label="Description" value={form.description} onChange={set("description")} required />
                    <textarea className={input} rows={2} placeholder="Impact" aria-label="Impact" value={form.impact} onChange={set("impact")} required />
                    <textarea className={input} rows={2} placeholder="Recommendation" aria-label="Recommendation" value={form.recommendation} onChange={set("recommendation")} required />
                    {!report && <p className="text-xs text-gray-500">This engagement has no report yet; adding a finding starts one.</p>}
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setAdding(false)} className={secondary}>Cancel</button>
                        <button type="submit" disabled={saving} className={primary}>{saving && <Loader2 size={14} className="animate-spin" />} Add finding</button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : findings.length === 0 ? (
                <p className={`${card} text-sm text-gray-500`}>No findings yet. Add one, then attach its screenshots and evidence here.</p>
            ) : (
                <ul className="space-y-3">
                    {findings.map((s) => {
                        const f = s.reportFinding;
                        const images = Array.isArray(f.images) ? f.images : [];
                        return (
                            <li key={s.id} className={card}>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_STYLES[f.severity] || ""}`}>{f.severity}</span>
                                    <h3 className="font-medium text-gray-900 dark:text-white flex-1">{f.title}</h3>
                                    <button onClick={() => setImagesFor(s)} className={secondary}>
                                        <ImagePlus size={14} /> {images.length ? `Evidence (${images.length})` : "Add screenshots"}
                                    </button>
                                </div>
                                {f.description && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-3 whitespace-pre-wrap">{f.description}</p>}
                                {images.length > 0 && (
                                    <div className="mt-3 flex gap-2 overflow-x-auto">
                                        {images.map((img) => (
                                            <img key={img.id} src={`data:${img.mimeType};base64,${img.imageData}`} alt={img.title}
                                                title={img.title} className="h-20 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
                                                onClick={() => setImagesFor(s)} />
                                        ))}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <ImageManagementModal
                isOpen={!!imagesFor}
                onClose={() => setImagesFor(null)}
                images={imagesFor?.reportFinding?.images || []}
                onUpload={onUpload}
                onUpdate={onUpdate}
                onDelete={onDelete}
                uploading={uploading}
                reportFindingId={imagesFor?.reportFinding?.id}
            />
        </div>
    );
}

function RoeTab({ engagement }) {
    return (
        <div className={card}>
            <h2 className="font-medium text-gray-900 dark:text-white mb-2">Rules of engagement</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Authorisation, testing windows and restrictions for this engagement.</p>
            <Link to={`/engagements/${engagement.id}/roe`} className={secondary}><Shield size={14} /> Open rules of engagement</Link>
        </div>
    );
}

function ReportTab({ engagement, report, onReportCreated }) {
    const [busy, setBusy] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [error, setError] = useState("");

    const start = async () => {
        setBusy(true);
        try { await ensureReport(engagement, report); await onReportCreated(); } catch (err) { setError(err.message); } finally { setBusy(false); }
    };

    const generate = async () => {
        setBusy(true);
        setError("");
        try {
            const { url } = await api(`/reports/${report.id}/generate-pdf`, { method: "POST", body: { reportId: report.id } });
            const res = await fetch(`${API}/reports/pdf/${url.split("/").pop()}`, { headers: authHeaders() });
            if (!res.ok) throw new Error(`The PDF was generated but could not be downloaded (${res.status})`);
            setPdfUrl(URL.createObjectURL(await res.blob()));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    if (!report) {
        return (
            <div className={card}>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">No report yet.</p>
                <button onClick={start} disabled={busy} className={primary}><FileText size={14} /> Start the report</button>
                {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
        );
    }

    return (
        <div className={`${card} space-y-3`}>
            <h2 className="font-medium text-gray-900 dark:text-white">{report.title}</h2>
            <div className="flex flex-wrap gap-2">
                <button onClick={generate} disabled={busy} className={primary}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Generate PDF
                </button>
                <Link to={`/report-writer/${report.id}`} className={secondary}><Pencil size={14} /> Edit in the Report Writer</Link>
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {pdfUrl && (
                <div className="space-y-2">
                    <a href={pdfUrl} download={`${report.title}.pdf`} className="text-sm text-indigo-600 dark:text-indigo-400 underline">Download the PDF</a>
                    <iframe title="Report PDF" src={pdfUrl} className="w-full h-[70vh] rounded border border-gray-200 dark:border-gray-700" />
                </div>
            )}
        </div>
    );
}

export default EngagementHome;
