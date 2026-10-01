import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";

dotenv.config();

const router = express.Router();
const FORGE_URL = process.env.FORGE_URL;

// Forwards to forge's operator log routes, passing its status and body through.
function forward(method, path, failure) {
    return async (req, res) => {
        try {
            const response = await axios({
                method,
                url: `${FORGE_URL}/engagement/${encodeURIComponent(req.params.id)}${path}`,
                params: req.query,
                data: method === "post" ? req.body : undefined,
                headers: { Authorization: req.headers.authorization },
            });
            res.status(response.status).json(response.data);
        } catch (error) {
            console.error(`${failure}:`, error.response?.data || error.message);
            if (error.response) {
                res.status(error.response.status).json(error.response.data);
            } else {
                res.status(500).json({ error: failure });
            }
        }
    };
}

// GET /engagement/:id/log - entries, paged with ?after=<seq>&limit=<n>
router.get("/:id/log", authenticateRequest, forward("get", "/log", "Failed to read operator log"));
// POST /engagement/:id/log - append an entry
router.post("/:id/log", authenticateRequest, forward("post", "/log", "Failed to append to operator log"));
// GET /engagement/:id/log/verify - check the hash chain
router.get("/:id/log/verify", authenticateRequest, forward("get", "/log/verify", "Failed to verify operator log"));

export default router;
