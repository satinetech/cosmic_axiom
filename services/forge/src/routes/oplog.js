import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";
import { appendEntry, verifyChain, OplogError } from "../oplog/chain.js";

const router = Router();
const prisma = new PrismaClient();

// What the chain does and does not prove, returned with every verification so
// no client can show a green tick without it.
const CHAIN_LIMIT =
    "Tamper-evident, not tamper-proof: the chain shows whether entries were changed after they were " +
    "written, but anyone with write access to the database could rewrite the whole log and its hashes.";

// The writer is whoever the token says, never what the request body claims.
// astral's /token/verify answers { valid, payload }.
const operatorOf = (req) => req.tokenPayload?.payload?.sub ?? null;

const PAGE_MAX = 500;

// GET /engagement/:id/log?after=<seq>&limit=<n> - entries in order, a page at a time
router.get("/:id/log", authenticateRequest, async (req, res) => {
    const after = Number.parseInt(req.query.after ?? "0", 10);
    const limit = Math.min(Number.parseInt(req.query.limit ?? "100", 10) || 100, PAGE_MAX);
    if (!Number.isInteger(after) || after < 0 || limit < 1) {
        return res.status(400).json({ error: "after and limit must be non-negative whole numbers" });
    }
    try {
        const entries = await prisma.operatorLogEntry.findMany({
            where: { engagementId: req.params.id, seq: { gt: after } },
            orderBy: { seq: "asc" },
            take: limit,
            include: { attachments: { select: { sha256: true, label: true } } },
        });
        res.json(entries);
    } catch (err) {
        console.error("Failed to read operator log:", err.message);
        res.status(500).json({ error: "Failed to read operator log" });
    }
});

// POST /engagement/:id/log - append an entry
router.post("/:id/log", authenticateRequest, async (req, res) => {
    const operator = operatorOf(req);
    if (!operator) return res.status(401).json({ error: "The token does not identify a user" });

    const { summary, occurredAt, command, output, tool, targetAddress, correctsSeq, attachments, kind, approvedBy } = req.body ?? {};
    try {
        const entry = await appendEntry(prisma, {
            engagementId: req.params.id, operator,
            summary, occurredAt, command, output, tool, targetAddress, correctsSeq, attachments, kind, approvedBy,
        });
        res.status(201).json(entry);
    } catch (err) {
        if (err instanceof OplogError) {
            const status = err.field === "engagementId" ? 404 : 400;
            return res.status(status).json({ error: err.message, field: err.field });
        }
        console.error("Failed to append to operator log:", err.message);
        res.status(500).json({ error: "Failed to append to operator log" });
    }
});

// GET /engagement/:id/log/verify - check the chain
router.get("/:id/log/verify", authenticateRequest, async (req, res) => {
    try {
        const result = await verifyChain(prisma, req.params.id);
        const last = await prisma.operatorLogEntry.findFirst({
            where: { engagementId: req.params.id }, orderBy: { seq: "desc" }, select: { recordedAt: true },
        });
        res.json({ ...result, lastRecordedAt: last?.recordedAt ?? null, limit: CHAIN_LIMIT });
    } catch (err) {
        console.error("Failed to verify operator log:", err.message);
        res.status(500).json({ error: "Failed to verify operator log" });
    }
});

export default router;
