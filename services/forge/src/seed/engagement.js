/**
 * Create an engagement -- customer, engagement and scope -- from a JSON
 * description, for systems that set engagements up programmatically.
 *
 *   {
 *     "externalRef": "CASE-1234",                       required, unique
 *     "customer":   { "name": "Example Corp" },          required; reused if one has this name
 *     "engagement": { "name": "...", "startDate": "2026-10-01", required
 *                     "endDate", "description", "profile", "status", "type", "methodology" },
 *     "scope": [ { "address": "10.0.0.0/24", "inScope": true,
 *                  "description", "notes", "assetType", "environment", "criticality" } ]
 *   }
 *
 * Idempotent on externalRef: if an engagement already has it, nothing is
 * changed -- people may have edited it since -- and the existing id is
 * returned. Validation happens before anything is written.
 */

import { AssetCriticality, AssetEnvironment, AssetType, EngagementProfile, EngagementStatus, EngagementType, TestingMethodology } from "@prisma/client";

export class SeedError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.name = "SeedError";
        this.field = field;
    }
}

const text = (v, field, { required = false } = {}) => {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
        if (required) throw new SeedError(field, "is required");
        return undefined;
    }
    if (typeof v !== "string") throw new SeedError(field, "must be a string");
    return v.trim();
};

const oneOf = (v, values, field) => {
    if (v === undefined || v === null) return undefined;
    if (!Object.values(values).includes(v)) throw new SeedError(field, `must be one of ${Object.values(values).join(", ")}`);
    return v;
};

const date = (v, field, { required = false } = {}) => {
    if (v === undefined || v === null || v === "") {
        if (required) throw new SeedError(field, "is required");
        return undefined;
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new SeedError(field, `is not a date: ${JSON.stringify(v)}`);
    return d;
};

/** Validates and normalises a seed document. Throws SeedError naming the field. */
export function parseSeed(doc) {
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new SeedError("(document)", "must be a JSON object");
    const e = doc.engagement ?? {};
    const scope = doc.scope ?? [];
    if (!Array.isArray(scope)) throw new SeedError("scope", "must be a list");

    return {
        externalRef: text(doc.externalRef, "externalRef", { required: true }),
        customer: { name: text(doc.customer?.name, "customer.name", { required: true }) },
        engagement: {
            name: text(e.name, "engagement.name", { required: true }),
            description: text(e.description, "engagement.description"),
            startDate: date(e.startDate, "engagement.startDate", { required: true }),
            endDate: date(e.endDate, "engagement.endDate"),
            profile: oneOf(e.profile, EngagementProfile, "engagement.profile"),
            status: oneOf(e.status, EngagementStatus, "engagement.status"),
            type: oneOf(e.type, EngagementType, "engagement.type"),
            methodology: oneOf(e.methodology, TestingMethodology, "engagement.methodology"),
        },
        scope: scope.map((s, i) => {
            const at = `scope[${i}]`;
            if (!s || typeof s !== "object") throw new SeedError(at, "must be an object");
            if (s.inScope !== undefined && typeof s.inScope !== "boolean") throw new SeedError(`${at}.inScope`, "must be true or false");
            return {
                address: text(s.address, `${at}.address`, { required: true }),
                inScope: s.inScope ?? true,
                description: text(s.description, `${at}.description`),
                notes: text(s.notes, `${at}.notes`),
                assetType: oneOf(s.assetType, AssetType, `${at}.assetType`),
                environment: oneOf(s.environment, AssetEnvironment, `${at}.environment`),
                criticality: oneOf(s.criticality, AssetCriticality, `${at}.criticality`),
            };
        }),
    };
}

/** Creates the engagement unless one already has this externalRef. Returns { engagementId, created }. */
export async function seedEngagement(db, doc) {
    const seed = parseSeed(doc);
    const existing = await db.engagement.findUnique({ where: { externalRef: seed.externalRef }, select: { id: true } });
    if (existing) return { engagementId: existing.id, created: false };

    try {
        return await db.$transaction(async (tx) => {
            const customer = (await tx.customer.findFirst({ where: { name: seed.customer.name }, select: { id: true } }))
                ?? (await tx.customer.create({ data: { name: seed.customer.name }, select: { id: true } }));
            const engagement = await tx.engagement.create({
                data: {
                    ...seed.engagement,
                    externalRef: seed.externalRef,
                    customerId: customer.id,
                    scopes: { create: seed.scope },
                },
                select: { id: true },
            });
            return { engagementId: engagement.id, created: true };
        });
    } catch (err) {
        // Another run created it first.
        if (err.code === "P2002") {
            const winner = await db.engagement.findUnique({ where: { externalRef: seed.externalRef }, select: { id: true } });
            if (winner) return { engagementId: winner.id, created: false };
        }
        throw err;
    }
}
