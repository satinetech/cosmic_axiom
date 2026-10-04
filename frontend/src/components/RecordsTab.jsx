import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const API = import.meta.env.VITE_SATELLITE_URL;

async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const err = new Error(data?.error || `Request failed (${res.status})`);
        err.field = data?.field;
        throw err;
    }
    return data;
}

// Datetimes are UTC throughout: entered in a datetime-local field read as UTC,
// shown as "YYYY-MM-DD HH:MM:SS UTC".
export const utcInput = (iso) => (iso ? new Date(iso).toISOString().slice(0, 19) : "");
export const utcText = (iso) => (iso ? `${new Date(iso).toISOString().slice(0, 19).replace("T", " ")} UTC` : "");
const fromUtcInput = (value) => (value ? new Date(`${value.length === 16 ? `${value}:00` : value}Z`).toISOString() : null);

const optionLabel = (field, value) => field.options?.find((o) => o.value === value)?.label ?? value;

const BADGES = {
    CONFIRMED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    LIKELY: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    POSSIBLE: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

/** One cell of a record, as text or a small badge. `config.cells` may override. */
function Cell({ config, field, record }) {
    const value = record[field.name];
    if (config.cells?.[field.name]) return config.cells[field.name](value, record);
    if (value === null || value === undefined || value === "") return <span className="text-gray-400">—</span>;
    if (field.type === "datetime") return <span className="font-mono text-xs whitespace-nowrap">{utcText(value)}</span>;
    if (field.type === "enum" && BADGES[value]) {
        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${BADGES[value]}`}>{optionLabel(field, value)}</span>;
    }
    if (field.type === "enum") return optionLabel(field, value);
    return <span className={field.mono ? "font-mono" : ""}>{value}</span>;
}

const emptyFrom = (config) =>
    Object.fromEntries(config.fields.map((f) => [f.name, f.default ?? ""]));

const toForm = (config, record) =>
    Object.fromEntries(config.fields.map((f) => [f.name, f.type === "datetime" ? utcInput(record[f.name]) : record[f.name] ?? ""]));

const toBody = (config, form) =>
    Object.fromEntries(config.fields.map((f) => {
        const v = form[f.name];
        if (f.type === "datetime") return [f.name, fromUtcInput(v)];
        return [f.name, v === "" ? null : v];
    }));

/**
 * A list of one kind of engagement record (see src/records) with add, edit and
 * delete. `config` is a RECORD_TYPES entry.
 */
function RecordsTab({ engagementId, config }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // null, "new", or a record id
    const [form, setForm] = useState(() => emptyFrom(config));
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const base = `/engagement/${engagementId}/${config.path}`;

    const load = useCallback(async () => {
        try {
            setRecords(await api(base));
            setError(null);
        } catch (err) {
            setError({ message: err.message });
        } finally {
            setLoading(false);
        }
    }, [base]);

    useEffect(() => { load(); }, [load]);

    const startNew = () => { setForm(emptyFrom(config)); setEditing("new"); setError(null); };
    const startEdit = (record) => { setForm(toForm(config, record)); setEditing(record.id); setError(null); };

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const body = toBody(config, form);
            if (editing === "new") await api(base, { method: "POST", body });
            else await api(`${base}/${editing}`, { method: "PUT", body });
            setEditing(null);
            await load();
        } catch (err) {
            setError({ message: err.message, field: err.field });
        } finally {
            setSaving(false);
        }
    };

    const remove = async (record) => {
        if (!confirm(`Delete this ${config.noun}?`)) return;
        try {
            await api(`${base}/${record.id}`, { method: "DELETE" });
            await load();
        } catch (err) {
            setError({ message: err.message });
        }
    };

    const input = (field) =>
        `w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${error?.field === field
            ? "border-red-500" : "border-gray-300 dark:border-gray-600"}`;

    const renderField = (field) => {
        const common = {
            id: `${config.path}-${field.name}`,
            value: form[field.name] ?? "",
            onChange: (e) => setForm((f) => ({ ...f, [field.name]: e.target.value })),
            required: !!field.required,
            className: `${input(field.name)} ${field.mono ? "font-mono" : ""}`,
        };
        if (field.type === "text") return <textarea rows={3} {...common} placeholder={field.placeholder} />;
        if (field.type === "datetime") return <input type="datetime-local" step="1" {...common} />;
        if (field.type === "enum") {
            return (
                <select {...common}>
                    {!field.required && <option value="">—</option>}
                    {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            );
        }
        return <input {...common} placeholder={field.placeholder} />;
    };

    const fieldsByName = Object.fromEntries(config.fields.map((f) => [f.name, f]));
    const sorted = config.sort ? [...records].sort(config.sort) : records;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="font-medium text-gray-900 dark:text-white">{config.title} ({records.length})</h2>
                    {config.intro && <p className="text-sm text-gray-500 dark:text-gray-400 max-w-3xl">{config.intro}</p>}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                    {config.actions?.({ records, reload: load, engagementId, api })}
                    <button onClick={startNew} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700">
                        <Plus size={14} /> Add {config.noun}
                    </button>
                </div>
            </div>

            {editing && (
                <form onSubmit={save} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {config.fields.map((field) => (
                            <div key={field.name} className={field.wide || field.type === "text" ? "md:col-span-4" : ""}>
                                <label htmlFor={`${config.path}-${field.name}`} className="block text-sm text-gray-700 dark:text-gray-300 mb-1">
                                    {field.label}{field.required && <span className="text-red-500"> *</span>}
                                </label>
                                {renderField(field)}
                            </div>
                        ))}
                    </div>
                    {error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Cancel</button>
                        <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                            {saving && <Loader2 size={14} className="animate-spin" />} {editing === "new" ? `Add ${config.noun}` : "Save"}
                        </button>
                    </div>
                </form>
            )}

            {!editing && error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}

            {loading ? (
                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : records.length === 0 ? (
                <p className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm text-gray-500">
                    No {config.noun}s yet.
                </p>
            ) : (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                {config.columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{fieldsByName[c].label}</th>)}
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((record) => (
                                <tr key={record.id} className="border-b border-gray-100 dark:border-gray-700 align-top">
                                    {config.columns.map((c) => (
                                        <td key={c} className="px-3 py-2 text-gray-900 dark:text-gray-100">
                                            <Cell config={config} field={fieldsByName[c]} record={record} />
                                        </td>
                                    ))}
                                    <td className="px-3 py-2 whitespace-nowrap text-right">
                                        <button onClick={() => startEdit(record)} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600"><Pencil size={14} /></button>
                                        <button onClick={() => remove(record)} title="Delete" className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default RecordsTab;
