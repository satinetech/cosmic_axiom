/**
 * Evidence ingestion and chain of custody.
 *
 * Custody events are append-only: nothing in this service updates or deletes
 * them. Each records observedSha, the hash of the bytes actually on disk at that
 * moment (null if the file is missing), so a later reader can tell "verified
 * intact" from "vouched for".
 */

/** Hashes the stored file afresh and appends a custody event for it. */
export async function recordCustody(db, store, { sha256, action, actor = null, detail = undefined }) {
    const observedSha = await store.observe(sha256);
    return db.evidenceCustodyEvent.create({
        data: { evidenceSha: sha256, action, observedSha, actor, detail },
    });
}

/**
 * Stores the bytes (once, however often they arrive), ensures an Evidence row
 * and records an INGESTED event. Returns { sha256, size, created, event }.
 */
export async function ingestEvidence(db, store, { buffer, mimeType, actor = null, detail = undefined }) {
    const { sha256, size, created } = await store.put(buffer);
    // Not upsert: Prisma's upsert on MySQL is a read then a write, so two
    // concurrent ingests of the same bytes would both try to insert. The row
    // is the same either way; a duplicate means someone else got there first.
    try {
        await db.evidence.create({ data: { sha256, size, mimeType } });
    } catch (err) {
        if (err.code !== "P2002") throw err;
    }
    const event = await recordCustody(db, store, { sha256, action: "INGESTED", actor, detail });
    return { sha256, size, created, event };
}
