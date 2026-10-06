export const API = import.meta.env.VITE_SATELLITE_URL;
export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

/** Whether this deployment has the assistant, for showing its button at all. */
export async function assistantStatus() {
    try {
        const res = await fetch(`${API}/ai/chat/status`, { headers: authHeaders() });
        return res.ok ? await res.json() : { enabled: false };
    } catch {
        return { enabled: false };
    }
}
