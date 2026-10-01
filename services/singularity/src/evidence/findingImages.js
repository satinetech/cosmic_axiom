/**
 * Dual read for finding images, while FindingImage and Evidence coexist.
 *
 * During this expand phase FindingImage stays the source of truth for an
 * image's title, caption and order -- the existing API still writes there.
 * What changes is where the bytes come from: when an image has been copied
 * into the evidence store (a FindingEvidence row with legacyImageId), its bytes
 * are read from disk and its base64 column is never loaded. Images without a
 * copy, or whose copy is missing on disk, fall back to the column. Evidence
 * attached directly, with no FindingImage behind it, follows.
 *
 * The result has exactly the FindingImage shape the API has always returned.
 */

// Include for a ReportFinding: image metadata without the base64 column, and
// the evidence attachments.
export const FINDING_IMAGES_INCLUDE = {
    images: {
        select: { id: true, reportFindingId: true, title: true, caption: true, mimeType: true, createdAt: true },
        orderBy: { createdAt: "asc" },
    },
    evidence: {
        include: { evidence: { select: { mimeType: true } } },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    },
};

/** Replaces a finding loaded with FINDING_IMAGES_INCLUDE by one with `images` resolved and no `evidence` key. */
export async function resolveFindingImages(db, store, finding) {
    if (!finding) return finding;
    const { evidence: attachments = [], images: legacy = [], ...rest } = finding;
    const copies = new Map(attachments.filter((a) => a.legacyImageId).map((a) => [a.legacyImageId, a]));

    const images = [];
    const needColumn = [];
    for (const image of legacy) {
        const copy = copies.get(image.id);
        const bytes = copy ? await store.get(copy.evidenceSha) : null;
        if (copy && !bytes) {
            console.error(`evidence ${copy.evidenceSha} for image ${image.id} is missing on disk; using the stored column`);
        }
        if (!bytes) needColumn.push(image.id);
        images.push({ ...image, imageData: bytes ? bytes.toString("base64") : null });
    }

    if (needColumn.length > 0) {
        const rows = await db.findingImage.findMany({
            where: { id: { in: needColumn } },
            select: { id: true, imageData: true },
        });
        const column = new Map(rows.map((r) => [r.id, r.imageData]));
        for (const image of images) {
            if (image.imageData === null) image.imageData = column.get(image.id) ?? null;
        }
    }

    for (const a of attachments) {
        if (a.legacyImageId) continue; // shown through its FindingImage, or deleted with it
        const bytes = await store.get(a.evidenceSha);
        if (!bytes) {
            console.error(`evidence ${a.evidenceSha} attached as ${a.id} is missing on disk; omitted`);
            continue;
        }
        images.push({
            id: a.id,
            reportFindingId: a.reportFindingId,
            title: a.title,
            caption: a.caption,
            mimeType: a.evidence.mimeType,
            createdAt: a.createdAt,
            imageData: bytes.toString("base64"),
        });
    }

    return { ...rest, images: images.filter((i) => i.imageData !== null) };
}

/** resolveFindingImages for the reportFinding of each section. */
export async function resolveSectionImages(db, store, sections) {
    const one = async (section) => section?.reportFinding
        ? { ...section, reportFinding: await resolveFindingImages(db, store, section.reportFinding) }
        : section;
    return Array.isArray(sections) ? Promise.all(sections.map(one)) : one(sections);
}
