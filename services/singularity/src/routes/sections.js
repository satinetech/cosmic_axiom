import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";
import { EvidenceStore } from "../evidence/store.js";
import { FINDING_IMAGES_INCLUDE, resolveSectionImages } from "../evidence/findingImages.js";

const router = Router();
const prisma = new PrismaClient();
const store = new EvidenceStore();

// POST /sections - Create and assign to report
router.post("/", authenticateRequest, async (req, res) => {
    const { reportId, type, position, title, description, recommendation, impact, reference, severity, tags, content, affectedSystems } = req.body;

    console.log("POST /sections request body:", req.body);

    if (!reportId || !type) {
        console.log("Missing required fields - reportId:", reportId, "type:", type);
        return res.status(400).json({ error: "Missing required fields: reportId and type are required" });
    }

    try {
        // Handle different section types
        if (type === "finding" || type === "FINDING") {
            // For findings, create a ReportFinding first
            if (!title || !description || !recommendation || !impact || !severity) {
                return res.status(400).json({ error: "Missing required finding fields" });
            }

            // First check if the report exists
            const reportExists = await prisma.report.findUnique({
                where: { id: reportId }
            });

            if (!reportExists) {
                console.error(`Report with ID ${reportId} not found`);
                
                // Log available reports for debugging
                const allReports = await prisma.report.findMany({
                    select: { id: true, title: true, engagementId: true }
                });
                console.log("Available reports:", allReports);
                
                return res.status(400).json({ error: `Report with ID ${reportId} not found` });
            }

            const newFinding = await prisma.reportFinding.create({
                data: {
                    reportId,
                    title,
                    description,
                    recommendation,
                    impact,
                    reference,
                    severity,
                    tags,
                    affectedSystems: affectedSystems || [],
                },
            });

            const newSection = await prisma.section.create({
                data: {
                    reportId,
                    type: "FINDING",
                    position: position || 0,
                    reportFindingId: newFinding.id,
                },
                include: {
                    reportFinding: {
                        include: {
                            images: true
                        }
                    }
                }
            });

            res.status(201).json(newSection);
        } else {
            // For connectivity or custom sections, just create the section
            const newSection = await prisma.section.create({
                data: {
                    reportId,
                    type: type.toUpperCase(),
                    position: position || 0,
                    title: title || "Connectivity Section",
                    content: content || ""
                },
            });

            res.status(201).json(newSection);
        }
    } catch (err) {
        console.error("Failed to create section:", err.message);
        res.status(500).json({ error: "Failed to create section" });
    }
});

// PUT /sections/:id - Update section fields
router.put("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;
    const updateData = { ...req.body };

    try {
        // Remove fields that shouldn't be updated directly
        delete updateData.id;
        delete updateData.reportId;
        delete updateData.createdAt;
        delete updateData.updatedAt;
        delete updateData.reportFinding;
        delete updateData.report;

        // Only update fields that exist in the Section model
        const allowedFields = ['type', 'position', 'reportFindingId', 'title', 'content'];
        const filteredData = {};
        
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                filteredData[field] = updateData[field];
            }
        }

        const updated = await prisma.section.update({
            where: { id },
            data: filteredData,
            include: {
                reportFinding: {
                    include: FINDING_IMAGES_INCLUDE
                }
            }
        });

        res.json(await resolveSectionImages(prisma, store, updated));
    } catch (err) {
        console.error("Failed to update section:", err);
        res.status(500).json({ error: "Failed to update section" });
    }
});

// GET /sections/report/:reportId - Get all sections for a report
router.get("/:reportId", authenticateRequest, async (req, res) => {
    const { reportId } = req.params;

    try {
        const sections = await prisma.section.findMany({
            where: { reportId },
            orderBy: { createdAt: "desc" },
            include: {
                reportFinding: {
                    include: FINDING_IMAGES_INCLUDE
                },
            }
        });

        res.json(await resolveSectionImages(prisma, store, sections));
    } catch (err) {
        console.error(`Failed to get sections for report ${reportId}:`, err.message);
        res.status(500).json({ error: "Failed to fetch sections for report" });
    }
});

// PUT /findings/:id - Update report finding
router.put("/findings/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;
    const updateData = { ...req.body };

    try {
        // Remove fields that shouldn't be updated
        delete updateData.id;
        delete updateData.reportId;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        const updated = await prisma.reportFinding.update({
            where: { id },
            data: updateData
        });

        res.json(updated);
    } catch (err) {
        console.error("Failed to update finding:", err);
        res.status(500).json({ error: "Failed to update finding" });
    }
});

// DELETE /sections/:id - Delete a section
router.delete("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;

    try {
        // First get the section to see if it has a reportFinding
        const section = await prisma.section.findUnique({
            where: { id },
            include: { reportFinding: true }
        });

        if (!section) {
            return res.status(404).json({ error: "Section not found" });
        }

        // If it's a finding section, delete the reportFinding first (cascade will handle the section)
        if (section.reportFindingId && section.reportFinding) {
            await prisma.reportFinding.delete({
                where: { id: section.reportFindingId }
            });
        } else {
            // Otherwise just delete the section
            await prisma.section.delete({
                where: { id }
            });
        }

        res.json({ message: "Section deleted successfully" });
    } catch (err) {
        console.error("Failed to delete section:", err);
        res.status(500).json({ error: "Failed to delete section" });
    }
});

export default router;
