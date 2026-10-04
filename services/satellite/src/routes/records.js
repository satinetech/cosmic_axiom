import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";

dotenv.config();

const router = express.Router();
const FORGE_URL = process.env.FORGE_URL;

// Engagement record kinds forge serves at /engagement/:id/<kind>[/:recordId].
// Adding a kind to forge means adding its name here.
export const RECORD_KINDS = ["timeline", "indicators"];

// Forwards to forge, passing its status and body through.
router.all("/:id/:kind/:recordId?", authenticateRequest, async (req, res, next) => {
    if (!RECORD_KINDS.includes(req.params.kind)) return next();
    const { id, kind, recordId } = req.params;
    const path = [id, kind, recordId].filter(Boolean).map(encodeURIComponent).join("/");
    try {
        const response = await axios({
            method: req.method,
            url: `${FORGE_URL}/engagement/${path}`,
            params: req.query,
            data: ["POST", "PUT"].includes(req.method) ? req.body : undefined,
            headers: { Authorization: req.headers.authorization },
        });
        res.status(response.status).json(response.data);
    } catch (error) {
        console.error(`${req.method} /engagement/${path} failed:`, error.response?.data || error.message);
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: `Failed to ${req.method === "GET" ? "read" : "save"} ${kind}` });
        }
    }
});

export default router;
