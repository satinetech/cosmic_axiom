/**
 * Operator log: append-only, hash-chained per engagement.
 *
 * Each entry's digest is the sha256 of its canonical form, and the canonical
 * form includes the previous entry's digest, so editing, deleting or
 * reordering any entry breaks every digest after it -- verifyChain finds the
 * first one.
 *
 * What this is NOT: tamper-proof. The chain lives in the same database as the
 * entries, so anyone with write access to it can rewrite an entry and
 * recompute every digest after it. It makes casual or partial edits evident;
 * it does not stop a determined administrator. Say so wherever the chain is
 * shown, rather than letting the presence of hashes imply more.
 */

import crypto from "crypto";

export const GENESIS = "0".repeat(64);

// An entry written more than this long after it says it happened is marked
// backdated. Writing a log up afterwards is normal; the point is that the log
// says so.
export const BACKDATED_AFTER_MS = 15 * 60 * 1000;

// occurredAt may be at most this far in the future (clock skew), never more.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export class OplogError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.name = "OplogError";
        this.field = field;
    }
}

const iso = (d) => new Date(d).toISOString();
const orNull = (v) => (v === undefined ? null : v);

/**
 * The exact bytes an entry's digest covers. A fixed-order array rather than an
 * object, so the result can never depend on key order. The leading tag makes a
 * future change to the format a different, recognisable string.
 */
export function canonical(entry) {
    const attachments = (entry.attachments || [])
        .map((a) => [a.sha256, orNull(a.label)])
        .sort((a, b) => (a[0] + "\0" + (a[1] ?? "")).localeCompare(b[0] + "\0" + (b[1] ?? "")));
    return JSON.stringify([
        "oplog-v1",
        entry.engagementId,
        entry.seq,
        iso(entry.occurredAt),
        iso(entry.recordedAt),
        entry.backdated,
        entry.operator,
        entry.summary,
        orNull(entry.command),
        orNull(entry.output),
        orNull(entry.tool),
        orNull(entry.targetAddress),
        orNull(entry.scopeVerdict),
        orNull(entry.correctsSeq),
        attachments,
        entry.prevDigest,
    ]);
}

export function digest(entry) {
    return crypto.createHash("sha256").update(canonical(entry)).digest("hex");
}

// --- scope ------------------------------------------------------------------

function ipv4(s) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Whether `target` is `entry`, or an IPv4 address inside `entry` when that is a CIDR. */
export function addressMatches(target, entry) {
    const t = String(target).trim().toLowerCase();
    const e = String(entry).trim().toLowerCase();
    if (t === e) return true;
    const cidr = /^(.+)\/(\d{1,2})$/.exec(e);
    const ip = ipv4(t);
    if (!cidr || ip === null) return false;
    const net = ipv4(cidr[1]);
    const bits = Number(cidr[2]);
    if (net === null || bits > 32) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((ip & mask) >>> 0) === ((net & mask) >>> 0);
}

/**
 * IN_SCOPE, OUT_OF_SCOPE or NOT_LISTED for a target against an engagement's
 * scope rows; null when there is no target. An explicit exclusion wins over an
 * inclusion -- a host carved out of an in-scope range is out of scope.
 */
export function scopeVerdict(targetAddress, scopes) {
    if (targetAddress === null || targetAddress === undefined || String(targetAddress).trim() === "") return null;
    const matches = scopes.filter((s) => addressMatches(targetAddress, s.address));
    if (matches.some((s) => s.inScope === false)) return "OUT_OF_SCOPE";
    if (matches.some((s) => s.inScope !== false)) return "IN_SCOPE";
    return "NOT_LISTED";
}

// --- writing ------------------------------------------------------------------

const ENTRY_INCLUDE = { attachments: { select: { sha256: true, label: true } } };

/**
 * Appends an entry and returns it. `operator` comes from the caller's token,
 * never from the request body. Retries when another entry takes the same seq
 * first, so concurrent writers still produce one unbroken chain.
 */
export async function appendEntry(db, input, { now = new Date(), attempts = 5 } = {}) {
    const { engagementId, operator } = input;
    if (!engagementId) throw new OplogError("engagementId", "is required");
    if (!operator) throw new OplogError("operator", "is required");
    if (typeof input.summary !== "string" || input.summary.trim() === "") {
        throw new OplogError("summary", "is required: say what was done");
    }
    const occurredAt = input.occurredAt === undefined ? now : new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new OplogError("occurredAt", "is not a date");
    if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        throw new OplogError("occurredAt", "is in the future");
    }
    for (const a of input.attachments || []) {
        if (!/^[0-9a-f]{64}$/.test(a.sha256 ?? "")) throw new OplogError("attachments", `not a sha256: ${a.sha256}`);
    }

    const engagement = await db.engagement.findUnique({ where: { id: engagementId }, include: { scopes: true } });
    if (!engagement) throw new OplogError("engagementId", "no such engagement");
    const verdict = scopeVerdict(input.targetAddress, engagement.scopes);

    for (let attempt = 1; ; attempt++) {
        const last = await db.operatorLogEntry.findFirst({
            where: { engagementId }, orderBy: { seq: "desc" }, select: { seq: true, entryDigest: true },
        });
        const seq = (last?.seq ?? 0) + 1;
        if (input.correctsSeq != null && !(Number.isInteger(input.correctsSeq) && input.correctsSeq >= 1 && input.correctsSeq < seq)) {
            throw new OplogError("correctsSeq", `no earlier entry ${input.correctsSeq} to correct`);
        }
        const entry = {
            engagementId,
            seq,
            occurredAt,
            recordedAt: now,
            backdated: now.getTime() - occurredAt.getTime() > BACKDATED_AFTER_MS,
            operator,
            summary: input.summary,
            command: orNull(input.command),
            output: orNull(input.output),
            tool: orNull(input.tool),
            targetAddress: orNull(input.targetAddress),
            scopeVerdict: verdict,
            correctsSeq: orNull(input.correctsSeq),
            prevDigest: last?.entryDigest ?? GENESIS,
        };
        const attachments = (input.attachments || []).map((a) => ({ sha256: a.sha256, label: orNull(a.label) }));
        try {
            return await db.operatorLogEntry.create({
                data: { ...entry, entryDigest: digest({ ...entry, attachments }), attachments: { create: attachments } },
                include: ENTRY_INCLUDE,
            });
        } catch (err) {
            if (err.code === "P2002" && attempt < attempts) continue; // lost the race for this seq
            throw err;
        }
    }
}

// --- verifying ----------------------------------------------------------------

/**
 * Walks an engagement's chain in order, a page at a time. Returns
 * { ok: true, entries } or { ok: false, entries, seq, problem } for the first
 * entry that does not fit.
 */
export async function verifyChain(db, engagementId, { pageSize = 500 } = {}) {
    let expectedSeq = 1;
    let prev = GENESIS;
    for (;;) {
        const page = await db.operatorLogEntry.findMany({
            where: { engagementId, seq: { gte: expectedSeq } },
            orderBy: { seq: "asc" },
            take: pageSize,
            include: ENTRY_INCLUDE,
        });
        for (const entry of page) {
            const fail = (problem) => ({ ok: false, entries: expectedSeq - 1, seq: entry.seq, problem });
            if (entry.seq !== expectedSeq) return fail(`expected entry ${expectedSeq} next; entries are missing or renumbered`);
            if (entry.prevDigest !== prev) return fail("does not follow the entry before it");
            if (digest(entry) !== entry.entryDigest) return fail("has been changed since it was written");
            prev = entry.entryDigest;
            expectedSeq += 1;
        }
        if (page.length < pageSize) return { ok: true, entries: expectedSeq - 1 };
    }
}
