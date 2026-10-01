import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";

dotenv.config();

const router = express.Router();
const FORGE_URL = process.env.FORGE_URL;
const SINGULARITY_URL = process.env.SINGULARITY_URL;

// GET /engagement - Enrich each engagement with a report flag
router.get("/", authenticateRequest, async (req, res) => {
    try {
        // 1. Fetch engagements from Forge
        const engagementRes = await axios.get(`${FORGE_URL}/engagement`, {
            headers: { Authorization: req.headers.authorization },
        });
        const engagements = engagementRes.data;

        // 2. Fetch full reports from Singularity
        const reportRes = await axios.get(`${SINGULARITY_URL}/reports`, {
            headers: { Authorization: req.headers.authorization },
        });
        const reports = reportRes.data;

        // 3. Build a Map of engagementId → report
        const reportMap = new Map();
        reports.forEach((report) => {
            reportMap.set(report.engagementId, report);
        });

        // 4. Fetch testing parameters for all engagements in parallel
        const testingParamsPromises = engagements.map(async (engagement) => {
            try {
                const response = await axios.get(`${FORGE_URL}/testing-parameters/${engagement.id}`, {
                    headers: { Authorization: req.headers.authorization },
                });
                return { engagementId: engagement.id, params: response.data };
            } catch (err) {
                // If 404, testing parameters don't exist yet
                if (err.response && err.response.status === 404) {
                    return { engagementId: engagement.id, params: null };
                }
                console.error(`Failed to fetch testing params for engagement ${engagement.id}:`, err.message);
                return { engagementId: engagement.id, params: null };
            }
        });

        const testingParamsResults = await Promise.all(testingParamsPromises);
        
        // 5. Build a Map of engagementId → testingParameters
        const testingParamsMap = new Map();
        testingParamsResults.forEach(({ engagementId, params }) => {
            testingParamsMap.set(engagementId, params);
        });

        // 6. Enrich engagements with reportId and testingParameters if they exist
        const enriched = engagements.map((engagement) => {
            const report = reportMap.get(engagement.id);
            const testingParams = testingParamsMap.get(engagement.id);
            return {
                ...engagement,
                report: report ? { id: report.id } : null,
                testingParameters: testingParams,
            };
        });


        res.json(enriched);
    } catch (err) {
        console.error("GET /engagement failed:", err.message);
        res.status(500).json({ error: "Failed to fetch enriched engagements" });
    }
});

// POST /engagement
router.post("/", authenticateRequest, async (req, res) => {
    try {
        const response = await axios.post(`${FORGE_URL}/engagement`, req.body, {
            headers: { Authorization: req.headers.authorization },
        });
        res.status(201).json(response.data);
    } catch (err) {
        console.error("POST /engagement failed:", err.message);
        res.status(500).json({ error: "Failed to create engagement" });
    }
});

// GET /engagement/:id
router.get("/:id", authenticateRequest, async (req, res) => {
    try {
        // Fetch engagement data from Forge
        const engagementResponse = await axios.get(`${FORGE_URL}/engagement/${req.params.id}`, {
            headers: { Authorization: req.headers.authorization },
        });
        const engagement = engagementResponse.data;

        // Fetch scopes for this engagement
        let scopes = [];
        try {
            const scopesResponse = await axios.get(`${FORGE_URL}/scope/engagement/${req.params.id}`, {
                headers: { Authorization: req.headers.authorization },
            });
            scopes = scopesResponse.data;
        } catch (scopeErr) {
            // If scopes don't exist or error, continue without them
            console.warn(`Could not fetch scopes for engagement ${req.params.id}:`, scopeErr.message);
        }

        // Return enriched engagement data
        res.json({
            ...engagement,
            scopes
        });
    } catch (err) {
        console.error(`GET /engagement/${req.params.id} failed:`, err.message);
        res.status(404).json({ error: "Engagement not found" });
    }
});

// PUT /engagements/:id
router.put("/:id", authenticateRequest, async (req, res) => {
    try {
        const response = await axios.put(`${FORGE_URL}/engagement/${req.params.id}`, req.body, {
            headers: { Authorization: req.headers.authorization },
        });
        res.json(response.data);
    } catch (err) {
        console.error(`PUT /engagement/${req.params.id} failed:`, err.message);
        res.status(500).json({ error: "Failed to update engagement" });
    }
});

// DELETE /engagement/:id
router.delete("/:id", authenticateRequest, async (req, res) => {
    try {
        // An engagement with an operator log is kept (forge refuses to delete
        // it), so check before deleting its reports -- otherwise they would be
        // gone and the engagement still there.
        const logRes = await axios.get(`${FORGE_URL}/engagement/${req.params.id}/log`, {
            params: { limit: 1 },
            headers: { Authorization: req.headers.authorization },
        });
        if (logRes.data.length > 0) {
            return res.status(409).json({ error: "This engagement has an operator log and cannot be deleted" });
        }

        // First, find and delete all reports associated with this engagement
        const reportsRes = await axios.get(`${SINGULARITY_URL}/reports?engagementId=${req.params.id}`, {
            headers: { Authorization: req.headers.authorization },
        });
        
        const reports = reportsRes.data;
        
        // Delete each report (which will cascade delete sections, findings, and images)
        for (const report of reports) {
            await axios.delete(`${SINGULARITY_URL}/reports/${report.id}`, {
                headers: { Authorization: req.headers.authorization },
            });
        }
        
        // Then delete the engagement (which will cascade delete scopes)
        await axios.delete(`${FORGE_URL}/engagement/${req.params.id}`, {
            headers: { Authorization: req.headers.authorization },
        });
        
        res.json({ message: "Engagement and all associated data deleted successfully" });
    } catch (err) {
        console.error(`DELETE /engagement/${req.params.id} failed:`, err.message);
        if (err.response?.status === 409) return res.status(409).json(err.response.data);
        res.status(500).json({ error: "Failed to delete engagement" });
    }
});

export default router;
