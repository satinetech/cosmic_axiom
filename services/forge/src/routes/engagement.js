import { EngagementProfile, PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";

const prisma = new PrismaClient();
const PROFILES = Object.values(EngagementProfile);
const router = Router();

// GET /engagement - List all engagements
router.get("/", authenticateRequest, async (req, res) => {
    try {
        const engagements = await prisma.engagement.findMany({
            include: {
                customer: {
                    select: { id: true, name: true },
                },
                testingParameters: true,
            },
            orderBy: { createdAt: "desc" },
        });

        res.json(
            engagements.map((e) => ({
                id: e.id,
                name: e.name,
                status: e.status,
                startDate: e.startDate,
                endDate: e.endDate,
                customerId: e.customerId,
                customer: e.customer?.name || "Unknown",
                profile: e.profile,
                type: e.type,
                methodology: e.methodology,
                riskTolerance: e.riskTolerance,
                complianceFrameworks: e.complianceFrameworks,
            }))
        );
    } catch (err) {
        console.error("Failed to fetch engagements:", err.message);
        res.status(500).json({ error: "Failed to fetch engagements" });
    }
});

// GET /engagement/:id - Get a specific engagement
router.get("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;

    try {
        const engagement = await prisma.engagement.findUnique({
            where: { id },
            include: {
                customer: {
                    select: { 
                        id: true, 
                        name: true,
                        contacts: {
                            where: { isPrimary: true },
                            take: 1
                        }
                    },
                },
                testingParameters: true,
                scopes: true,
            },
        });

        if (!engagement) {
            return res.status(404).json({ error: "Engagement not found" });
        }

        const primaryContact = engagement.customer?.contacts?.[0];
        
        res.json({
            id: engagement.id,
            externalRef: engagement.externalRef,
            name: engagement.name,
            description: engagement.description,
            status: engagement.status,
            startDate: engagement.startDate,
            endDate: engagement.endDate,
            customerId: engagement.customerId,
            customer: {
                id: engagement.customer?.id,
                name: engagement.customer?.name || "Unknown",
                customerName: engagement.customer?.name || "Unknown",
                contactName: primaryContact?.name || null,
                contactEmail: primaryContact?.email || null,
                contactPhone: primaryContact?.phone || null,
                contactTitle: "Primary Contact", // Default title since it's not in the Contact model
            },
            customerName: engagement.customer?.name || "Unknown", // Keep for backward compatibility
            contactName: primaryContact?.name || null, // Keep for backward compatibility
            contactEmail: primaryContact?.email || null, // Keep for backward compatibility
            contactPhone: primaryContact?.phone || null, // Keep for backward compatibility
            contactTitle: "Primary Contact", // Keep for backward compatibility
            organization: "Cosmic Axiom Security", // Testing organization
            profile: engagement.profile,
            type: engagement.type,
            methodology: engagement.methodology,
            complianceFrameworks: engagement.complianceFrameworks,
            riskTolerance: engagement.riskTolerance,
            businessCriticalHours: engagement.businessCriticalHours,
            criticalSystems: engagement.criticalSystems,
            previousEngagements: engagement.previousEngagements,
            budgetHours: engagement.budgetHours,
            maxConcurrentTesters: engagement.maxConcurrentTesters,
            testingParameters: engagement.testingParameters,
            scopes: engagement.scopes,
        });
    } catch (err) {
        console.error("Failed to fetch engagement:", err.message);
        res.status(500).json({ error: "Failed to fetch engagement" });
    }
});

// POST /engagement - Create a new engagement
router.post("/", authenticateRequest, async (req, res) => {
    const { 
        name, description, customerId, status, startDate, endDate,
        profile, type, methodology, complianceFrameworks, riskTolerance,
        businessCriticalHours, criticalSystems, previousEngagements,
        budgetHours, maxConcurrentTesters, testingParameters
    } = req.body;

    if (!name || !customerId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    if (profile !== undefined && !PROFILES.includes(profile)) {
        return res.status(400).json({ error: `profile must be one of ${PROFILES.join(", ")}` });
    }

    try {
        const newEngagement = await prisma.engagement.create({
            data: {
                name,
                description,
                customerId,
                status: status || "PLANNED",
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                profile: profile || "PENTEST",
                type: type || "NETWORK_PENTEST",
                methodology: methodology || "BLACK_BOX",
                complianceFrameworks: complianceFrameworks || [],
                riskTolerance: riskTolerance || "MEDIUM",
                businessCriticalHours: businessCriticalHours || null,
                criticalSystems: criticalSystems || [],
                previousEngagements: previousEngagements || [],
                budgetHours: budgetHours || null,
                maxConcurrentTesters: maxConcurrentTesters || null,
                testingParameters: testingParameters ? {
                    create: testingParameters
                } : undefined,
            },
            include: {
                customer: {
                    select: { id: true, name: true },
                },
                testingParameters: true,
            },
        });

        // Return the engagement in the same format as GET
        res.status(201).json({
            id: newEngagement.id,
            name: newEngagement.name,
            description: newEngagement.description,
            status: newEngagement.status,
            startDate: newEngagement.startDate,
            endDate: newEngagement.endDate,
            customerId: newEngagement.customerId,
            customer: newEngagement.customer?.name || "Unknown",
            profile: newEngagement.profile,
            type: newEngagement.type,
            methodology: newEngagement.methodology,
            complianceFrameworks: newEngagement.complianceFrameworks,
            riskTolerance: newEngagement.riskTolerance,
            businessCriticalHours: newEngagement.businessCriticalHours,
            criticalSystems: newEngagement.criticalSystems,
            previousEngagements: newEngagement.previousEngagements,
            budgetHours: newEngagement.budgetHours,
            maxConcurrentTesters: newEngagement.maxConcurrentTesters,
            testingParameters: newEngagement.testingParameters,
        });
    } catch (err) {
        console.error("Failed to create engagement:", err.message);
        res.status(500).json({ error: "Failed to create engagement" });
    }
});

// PUT /engagement/:id - Update an engagement
router.put("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;
    const { 
        name, description, customerId, status, startDate, endDate,
        profile, type, methodology, complianceFrameworks, riskTolerance,
        businessCriticalHours, criticalSystems, previousEngagements,
        budgetHours, maxConcurrentTesters, testingParameters
    } = req.body;

    if (profile !== undefined && !PROFILES.includes(profile)) {
        return res.status(400).json({ error: `profile must be one of ${PROFILES.join(", ")}` });
    }

    try {
        // Handle testing parameters update separately if provided
        if (testingParameters) {
            const existingParams = await prisma.testingParameters.findUnique({
                where: { engagementId: id },
            });

            if (existingParams) {
                await prisma.testingParameters.update({
                    where: { engagementId: id },
                    data: testingParameters,
                });
            } else {
                await prisma.testingParameters.create({
                    data: {
                        ...testingParameters,
                        engagementId: id,
                    },
                });
            }
        }

        const updatedEngagement = await prisma.engagement.update({
            where: { id },
            data: {
                ...(name !== undefined && { name }),
                ...(description !== undefined && { description }),
                ...(customerId !== undefined && { customerId }),
                ...(status !== undefined && { status }),
                ...(startDate !== undefined && { startDate: new Date(startDate) }),
                ...(endDate !== undefined && { endDate: new Date(endDate) }),
                ...(profile !== undefined && { profile }),
                ...(type !== undefined && { type }),
                ...(methodology !== undefined && { methodology }),
                ...(complianceFrameworks !== undefined && { complianceFrameworks }),
                ...(riskTolerance !== undefined && { riskTolerance }),
                ...(businessCriticalHours !== undefined && { businessCriticalHours }),
                ...(criticalSystems !== undefined && { criticalSystems }),
                ...(previousEngagements !== undefined && { previousEngagements }),
                ...(budgetHours !== undefined && { budgetHours }),
                ...(maxConcurrentTesters !== undefined && { maxConcurrentTesters }),
            },
            include: {
                customer: {
                    select: { id: true, name: true },
                },
                testingParameters: true,
            },
        });

        // Return the engagement in the same format as GET
        res.json({
            id: updatedEngagement.id,
            name: updatedEngagement.name,
            description: updatedEngagement.description,
            status: updatedEngagement.status,
            startDate: updatedEngagement.startDate,
            endDate: updatedEngagement.endDate,
            customerId: updatedEngagement.customerId,
            customer: updatedEngagement.customer?.name || "Unknown",
            profile: updatedEngagement.profile,
            type: updatedEngagement.type,
            methodology: updatedEngagement.methodology,
            complianceFrameworks: updatedEngagement.complianceFrameworks,
            riskTolerance: updatedEngagement.riskTolerance,
            businessCriticalHours: updatedEngagement.businessCriticalHours,
            criticalSystems: updatedEngagement.criticalSystems,
            previousEngagements: updatedEngagement.previousEngagements,
            budgetHours: updatedEngagement.budgetHours,
            maxConcurrentTesters: updatedEngagement.maxConcurrentTesters,
            testingParameters: updatedEngagement.testingParameters,
        });
    } catch (err) {
        console.error("Failed to update engagement:", err.message);
        res.status(500).json({ error: "Failed to update engagement" });
    }
});

// DELETE /engagement/:id - Delete an engagement
router.delete("/:id", authenticateRequest, async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.engagement.delete({
            where: { id },
        });

        res.json({ message: "Engagement deleted successfully" });
    } catch (err) {
        if (err.code === "P2003") {
            // Its operator log is a record of what was done; it is kept, so
            // the engagement is too.
            return res.status(409).json({ error: "This engagement has an operator log and cannot be deleted" });
        }
        console.error("Failed to delete engagement:", err.message);
        res.status(500).json({ error: "Failed to delete engagement" });
    }
});

export default router;
