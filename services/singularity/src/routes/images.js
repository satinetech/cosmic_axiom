import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";
import { EvidenceStore } from "../evidence/store.js";
import { FINDING_IMAGES_INCLUDE, resolveFindingImages } from "../evidence/findingImages.js";

const router = Router();
const prisma = new PrismaClient();
const store = new EvidenceStore();

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

        // Create the image
        const newImage = await prisma.findingImage.create({
            data: {
                reportFindingId,
                title,
                caption: caption || "",
                imageData,
                mimeType
            }
        });

        res.status(201).json(newImage);
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

        const updated = await prisma.findingImage.update({
            where: { id },
            data: updateData
        });

        res.json(updated);
    } catch (err) {
        console.error("Failed to update image:", err);
        res.status(500).json({ error: "Failed to update image" });
    }
});

// DELETE /images/:id - Delete an image
router.delete("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.findingImage.delete({
            where: { id }
        });

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