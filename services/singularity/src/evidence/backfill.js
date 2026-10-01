/**
 * Copies FindingImage rows into the evidence store.
 *
 * Idempotent and resumable: the work list is "images with no FindingEvidence
 * copy yet", so re-running after an interruption picks up where it stopped,
 * and FindingEvidence.legacyImageId being unique means two concurrent runs
 * cannot copy one image twice. FindingImage itself is never modified.
 *
 * Batched: ids are paged with a keyset cursor, and each image's base64 is
 * loaded on its own, so memory stays at about one image however large the
 * table is. (Loading the table in one findMany is exactly the out-of-memory
 * failure Evidence exists to fix.)
 */

import { ingestEvidence, recordCustody } from "./custody.js";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Ids of images not yet copied, after `after`, in id order. */
async function pendingIds(db, after, take) {
    const rows = await db.$queryRaw`
        SELECT fi.id FROM FindingImage fi
        LEFT JOIN FindingEvidence fe ON fe.legacyImageId = fi.id
        WHERE fe.id IS NULL AND fi.id > ${after}
        ORDER BY fi.id
        LIMIT ${take}`;
    return rows.map((r) => r.id);
}

/** How many images still have no copy. */
export async function countPending(db) {
    const [{ n }] = await db.$queryRaw`
        SELECT COUNT(*) AS n FROM FindingImage fi
        LEFT JOIN FindingEvidence fe ON fe.legacyImageId = fi.id
        WHERE fe.id IS NULL`;
    return Number(n);
}

/**
 * @param {object} options
 * @param {number} [options.batchSize]  ids fetched per query
 * @param {number} [options.limit]  stop after this many images (Infinity: all)
 * @param {string} [options.actor]  recorded on custody events
 * @param {(line: string) => void} [options.log]
 * @returns {Promise<{ copied: number, alreadyCopied: number, failed: Array<{ id: string, reason: string }> }>}
 */
export async function backfillImages(db, store, { batchSize = 50, limit = Infinity, actor = "backfill", log = () => {} } = {}) {
    const result = { copied: 0, alreadyCopied: 0, failed: [] };
    let after = "";
    let seen = 0;

    while (seen < limit) {
        const ids = await pendingIds(db, after, Math.min(batchSize, limit - seen));
        if (ids.length === 0) break;

        for (const id of ids) {
            seen += 1;
            after = id;
            try {
                const outcome = await copyOne(db, store, id, actor);
                if (outcome === "copied") result.copied += 1;
                else if (outcome === "already") result.alreadyCopied += 1;
            } catch (err) {
                result.failed.push({ id, reason: err.message });
                log(`image ${id}: ${err.message}`);
            }
        }
        log(`copied ${result.copied}, failed ${result.failed.length}, last id ${after}`);
    }
    return result;
}

async function copyOne(db, store, id, actor) {
    const image = await db.findingImage.findUnique({ where: { id } });
    if (!image) return "gone"; // deleted since it was listed

    const base64 = String(image.imageData ?? "").replace(/\s/g, "").replace(/^data:[^,]*,/, "");
    if (!base64 || !BASE64.test(base64)) throw new Error("imageData is not valid base64");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) throw new Error("imageData is empty");

    const detail = { source: "FindingImage", imageId: id };
    const { sha256, event } = await ingestEvidence(db, store, { buffer, mimeType: image.mimeType, actor, detail });
    if (event.observedSha !== sha256) {
        throw new Error(`stored file hashes to ${event.observedSha ?? "nothing"}, expected ${sha256}`);
    }

    // Keep the image's place among its finding's images.
    const position = await db.findingImage.count({
        where: {
            reportFindingId: image.reportFindingId,
            OR: [{ createdAt: { lt: image.createdAt } }, { createdAt: image.createdAt, id: { lt: image.id } }],
        },
    });

    let attachment;
    try {
        attachment = await db.findingEvidence.create({
            data: {
                reportFindingId: image.reportFindingId,
                evidenceSha: sha256,
                title: image.title,
                caption: image.caption,
                position,
                legacyImageId: id,
                createdAt: image.createdAt,
            },
        });
    } catch (err) {
        if (err.code === "P2002") return "already"; // another run copied it first
        throw err;
    }
    await recordCustody(db, store, {
        sha256, action: "ATTACHED", actor,
        detail: { ...detail, reportFindingId: image.reportFindingId, attachmentId: attachment.id },
    });
    return "copied";
}
