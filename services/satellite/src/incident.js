import axios from "axios";

// The incident block horizon renders for INCIDENT_RESPONSE engagements: the
// engagement's timeline, indicators and affected assets as forge stores them,
// and the operator log split into decisions and actions.

const LOG_PAGE = 500;

/** Every operator log entry, following forge's `after` paging. */
async function readLog(forgeUrl, engagementId, headers) {
    const entries = [];
    for (;;) {
        const after = entries.length ? entries[entries.length - 1].seq : 0;
        const { data } = await axios.get(`${forgeUrl}/engagement/${engagementId}/log`, {
            headers, params: { after, limit: LOG_PAGE },
        });
        entries.push(...data);
        if (data.length < LOG_PAGE) return entries;
    }
}

/**
 * Turns forge records into horizon's `incident` input. Pure, so it can be
 * tested without the services.
 *
 * An entry that a later one corrects is left out: the correction is what the
 * team stands by. Operators are shown by name when astral knows them.
 */
export function toIncident({ timeline, indicators, assets, log, users }) {
    const names = new Map(users.map((u) => [u.id, u.name || u.username]));
    const corrected = new Set(log.filter((e) => e.correctsSeq != null).map((e) => e.correctsSeq));
    const current = log.filter((e) => !corrected.has(e.seq));
    const operator = (id) => (id == null ? null : names.get(id) ?? null);

    return {
        timeline,
        indicators,
        assets,
        decisions: current.filter((e) => e.kind === "DECISION").map((e) => ({
            occurredAt: e.occurredAt,
            summary: e.summary,
            approvedBy: e.approvedBy,
            operator: operator(e.operator),
        })),
        actions: current.filter((e) => e.kind !== "DECISION").map((e) => ({
            occurredAt: e.occurredAt,
            summary: e.summary,
            operator: operator(e.operator),
            targetAddress: e.targetAddress,
        })),
    };
}

/** Reads everything toIncident needs. Names are best effort; records are not. */
export async function loadIncident({ forgeUrl, astralUrl, engagementId, token }) {
    const headers = { Authorization: token };
    const records = (kind) => axios.get(`${forgeUrl}/engagement/${engagementId}/${kind}`, { headers }).then((r) => r.data);
    const [timeline, indicators, assets, log, users] = await Promise.all([
        records("timeline"),
        records("indicators"),
        records("assets"),
        readLog(forgeUrl, engagementId, headers),
        axios.get(`${astralUrl}/users`, { headers }).then((r) => (Array.isArray(r.data) ? r.data : [])).catch((err) => {
            console.error("Operator names unavailable for the report:", err.message);
            return [];
        }),
    ]);
    return toIncident({ timeline, indicators, assets, log, users });
}
