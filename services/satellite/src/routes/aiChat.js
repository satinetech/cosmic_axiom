import axios from "axios";
import express from "express";
import { authenticateRequest } from "../middleware/authenticateRequest.js";

/**
 * The engagement assistant (nebula /ai/chat), passed through.
 *
 * Mounted in index.js AHEAD of the JSON body parser, on purpose:
 *   - a conversation carries tool results and outgrows the parser's 100 kB
 *     default, and raising that for every route would mean parsing large
 *     bodies before anyone is authenticated;
 *   - the response is a server-sent event stream, which has to reach the
 *     browser as it is written, not when it ends.
 * So the request body is streamed to nebula unparsed, after authentication,
 * and nebula's events are streamed back. nebula enforces its own size limit.
 */
export function aiChatRouter({ nebulaUrl = process.env.NEBULA_URL || "http://localhost:3007", authenticate = authenticateRequest } = {}) {
    const router = express.Router();

    router.get("/status", authenticate, async (req, res) => {
        try {
            const response = await axios.get(`${nebulaUrl}/ai/chat/status`, {
                headers: { Authorization: req.headers.authorization },
            });
            res.json(response.data);
        } catch (error) {
            // An older nebula without the assistant answers 404: report it as off.
            if (error.response?.status === 404) return res.json({ enabled: false, model: null, sources: [] });
            res.status(error.response?.status || 502).json({ error: "The assistant service is unavailable" });
        }
    });

    router.post("/", authenticate, async (req, res) => {
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        try {
            const upstream = await axios.post(`${nebulaUrl}/ai/chat`, req, {
                headers: {
                    Authorization: req.headers.authorization,
                    "Content-Type": req.headers["content-type"] || "application/json",
                    ...(req.headers["content-length"] ? { "Content-Length": req.headers["content-length"] } : {}),
                },
                responseType: "stream",
                // The body is a stream of unknown size; nebula decides what is too big.
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                // A turn with many tool calls can run for minutes.
                timeout: 0,
                signal: abort.signal,
                validateStatus: () => true,
            });
            res.status(upstream.status);
            for (const header of ["content-type", "cache-control", "x-accel-buffering"]) {
                if (upstream.headers[header]) res.setHeader(header, upstream.headers[header]);
            }
            res.flushHeaders();
            upstream.data.pipe(res);
        } catch (error) {
            if (abort.signal.aborted) return;
            console.error("POST /ai/chat failed:", error.message);
            if (!res.headersSent) res.status(502).json({ error: "The assistant service is unavailable" });
            else res.end();
        }
    });

    return router;
}
