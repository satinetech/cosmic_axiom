import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";
import { EvidenceStore } from "../evidence/store.js";
import { FINDING_IMAGES_INCLUDE, resolveFindingImages } from "../evidence/findingImages.js";
import { ingestEvidence, recordCustody } from "../evidence/custody.js";

const router = Router();
const prisma = new PrismaClient();
const store = new EvidenceStore();

// Who to name on custody events: the token's subject, the user's id. astral's
// /token/verify answers { valid, payload }, and the claims are in payload.
const actorOf = (req) => {
    const claims = req.user?.payload ?? req.user;
    return claims?.email || claims?.sub || null;
};

// A FindingEvidence attachment in the FindingImage shape the API returns.
const asImage = (attachment, imageData) => ({
    id: attachment.id,
    reportFindingId: attachment.reportFindingId,
    title: attachment.title,
    caption: attachment.caption,
    mimeType: attachment.evidence.mimeType,
    createdAt: attachment.createdAt,
    imageData,
});

// POST /images - Add image to a finding
router.post("/", authenticateRequest, async (req, res) => {
    const { reportFindingId, title, caption, imageData, mimeType } = req.body;

    if (!reportFindingId || !title || !imageData || !mimeType) {
        return res.status(400).json({ 
            error: "Missing required fields: reportFindingId, title, imageData, and mimeType are required" 
        });
    }

    // Validate image data is base64
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(imageData.replace(/\s/g, ''))) {
        return res.status(400).json({ error: "Invalid base64 image data" });
    }

    // Validate mime type
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validMimeTypes.includes(mimeType)) {
        return res.status(400).json({ 
            error: `Invalid mime type. Supported types: ${validMimeTypes.join(', ')}` 
        });
    }

    try {
        // Check if finding exists
        const finding = await prisma.reportFinding.findUnique({
            where: { id: reportFindingId }
        });

        if (!finding) {
            return res.status(404).json({ error: "Report finding not found" });
        }

        // Store the file in the evidence store and attach it, after the
        // finding's existing images.
        const base64 = imageData.replace(/\s/g, '');
        const actor = actorOf(req);
        const { sha256 } = await ingestEvidence(prisma, store, {
            buffer: Buffer.from(base64, "base64"), mimeType, actor, detail: { reportFindingId },
        });
        const position =
            await prisma.findingImage.count({ where: { reportFindingId } }) +
            await prisma.findingEvidence.count({ where: { reportFindingId, legacyImageId: null } });
        const attachment = await prisma.findingEvidence.create({
            data: { reportFindingId, evidenceSha: sha256, title, caption: caption || "", position },
            include: { evidence: { select: { mimeType: true } } },
        });
        await recordCustody(prisma, store, {
            sha256, action: "ATTACHED", actor, detail: { reportFindingId, attachmentId: attachment.id },
        });

        res.status(201).json(asImage(attachment, base64));
    } catch (err) {
        console.error("Failed to create image:", err);
        res.status(500).json({ error: "Failed to create image" });
    }
});

// PUT /images/:id - Update image metadata
router.put("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;
    const { title, caption } = req.body;

    try {
        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (caption !== undefined) updateData.caption = caption;

        // An image from before the evidence store: update it, and its evidence
        // copy if it has one, so the two never disagree.
        if (await prisma.findingImage.findUnique({ where: { id }, select: { id: true } })) {
            const updated = await prisma.findingImage.update({ where: { id }, data: updateData });
            await prisma.findingEvidence.updateMany({ where: { legacyImageId: id }, data: updateData });
            return res.json(updated);
        }

        const attachment = await prisma.findingEvidence.findUnique({ where: { id } });
        if (!attachment || attachment.legacyImageId) {
            return res.status(404).json({ error: "Image not found" });
        }
        const updated = await prisma.findingEvidence.update({
            where: { id },
            data: updateData,
            include: { evidence: { select: { mimeType: true } } },
        });
        const bytes = await store.get(updated.evidenceSha);
        res.json(asImage(updated, bytes ? bytes.toString("base64") : null));
    } catch (err) {
        console.error("Failed to update image:", err);
        res.status(500).json({ error: "Failed to update image" });
    }
});

// DELETE /images/:id - Delete an image
router.delete("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;

    try {
        // Detaching never deletes the file: it stays in the evidence store
        // with its custody record, and a DETACHED event says when it left.
        let detached;
        if (await prisma.findingImage.findUnique({ where: { id }, select: { id: true } })) {
            await prisma.findingImage.delete({ where: { id } });
            detached = await prisma.findingEvidence.findUnique({ where: { legacyImageId: id } });
        } else {
            detached = await prisma.findingEvidence.findUnique({ where: { id } });
            if (!detached || detached.legacyImageId) {
                return res.status(404).json({ error: "Image not found" });
            }
        }
        if (detached) {
            await prisma.findingEvidence.delete({ where: { id: detached.id } });
            await recordCustody(prisma, store, {
                sha256: detached.evidenceSha, action: "DETACHED", actor: actorOf(req),
                detail: { reportFindingId: detached.reportFindingId, attachmentId: detached.id },
            });
        }

        res.json({ message: "Image deleted successfully" });
    } catch (err) {
        console.error("Failed to delete image:", err);
        res.status(500).json({ error: "Failed to delete image" });
    }
});

// GET /images/finding/:findingId - Get all images for a finding
router.get("/finding/:findingId", authenticateRequest, async (req, res) => {
    const { findingId } = req.params;

    try {
        const finding = await prisma.reportFinding.findUnique({
            where: { id: findingId },
            select: FINDING_IMAGES_INCLUDE,
        });

        res.json(finding ? (await resolveFindingImages(prisma, store, finding)).images : []);
    } catch (err) {
        console.error("Failed to fetch images:", err);
        res.status(500).json({ error: "Failed to fetch images" });
    }
});

export default router;