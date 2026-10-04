import { ListPlus } from "lucide-react";
import { useState } from "react";

// The asks most incident responses start with. One click adds it as open.
export const COMMON_REQUESTS = [
    "Entra ID / Microsoft 365 app registration for log collection",
    "Unified audit log export for the incident window",
    "EDR or Velociraptor agent deployment to affected hosts",
    "Firewall and VPN logs for the incident window",
    "Backup status and last known-good restore points",
    "Asset inventory and network diagram",
    "Out-of-band point of contact and escalation list",
];

export function RequestTools({ records, reload, engagementId, api }) {
    const [open, setOpen] = useState(false);
    const asked = new Set(records.map((r) => r.request));
    const add = async (request) => {
        await api(`/engagement/${engagementId}/requests`, { method: "POST", body: { request } }).catch((err) => alert(err.message));
        await reload();
    };
    return (
        <div className="relative">
            <button onClick={() => setOpen((o) => !o)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                <ListPlus size={14} /> Common requests
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-96 z-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
                    {COMMON_REQUESTS.map((r) => (
                        <button key={r} disabled={asked.has(r)} onClick={() => { setOpen(false); add(r); }}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">
                            {r}{asked.has(r) ? " (asked)" : ""}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
