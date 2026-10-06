import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import express from "express";

import { aiChatRouter } from "../src/routes/aiChat.js";

/** A nebula that echoes what it got, then streams two events with a pause between. */
async function fakeNebula(seen) {
    const http = createServer((req, res) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            seen.push({ url: req.url, auth: req.headers.authorization, bytes: Buffer.concat(chunks).length });
            if (req.url === "/ai/chat/status") return void res.end(JSON.stringify({ enabled: true, model: "m", sources: ["case"] }));
            res.writeHead(200, { "content-type": "text/event-stream", "x-accel-buffering": "no" });
            res.write(`data: ${JSON.stringify({ type: "text", text: "first" })}\n\n`);
            setTimeout(() => {
                res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
                res.end();
            }, 300);
        });
    });
    await new Promise((r) => http.listen(0, "127.0.0.1", r));
    return { url: `http://127.0.0.1:${http.address().port}`, close: () => http.close() };
}

async function satellite(nebulaUrl, authenticate) {
    const app = express();
    app.use("/ai/chat", aiChatRouter({ nebulaUrl, authenticate }));
    app.use(express.json()); // as in index.js: after the chat route
    const http = createServer(app);
    await new Promise((r) => http.listen(0, "127.0.0.1", r));
    return { url: `http://127.0.0.1:${http.address().port}/ai/chat`, close: () => http.close() };
}

const pass = (_req, _res, next) => next();
const refuse = (_req, res) => res.status(401).json({ error: "Missing token" });

test("streams events through as they are written, with the body and token intact", async () => {
    const seen = [];
    const nebula = await fakeNebula(seen);
    const sat = await satellite(nebula.url, pass);
    try {
        // Far past express.json()'s 100 kB default.
        const body = JSON.stringify({ messages: [{ role: "user", content: "x".repeat(500_000) }] });
        const started = Date.now();
        const res = await fetch(sat.url, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("content-type"), "text/event-stream");
        assert.equal(res.headers.get("x-accel-buffering"), "no");

        const reader = res.body.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        assert.match(first, /"first"/);
        assert.ok(Date.now() - started < 250, "the first event arrived before the stream ended");
        let rest = "";
        for (let r = await reader.read(); !r.done; r = await reader.read()) rest += new TextDecoder().decode(r.value);
        assert.match(rest, /"done"/);

        assert.deepEqual(seen[0], { url: "/ai/chat", auth: "Bearer t", bytes: Buffer.byteLength(body) });
    } finally {
        sat.close();
        nebula.close();
    }
});

test("status passes through", async () => {
    const nebula = await fakeNebula([]);
    const sat = await satellite(nebula.url, pass);
    try {
        assert.deepEqual(await (await fetch(`${sat.url}/status`)).json(), { enabled: true, model: "m", sources: ["case"] });
    } finally {
        sat.close();
        nebula.close();
    }
});

test("an unauthenticated request never reaches nebula", async () => {
    const seen = [];
    const nebula = await fakeNebula(seen);
    const sat = await satellite(nebula.url, refuse);
    try {
        const res = await fetch(sat.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        assert.equal(res.status, 401);
        assert.equal(seen.length, 0);
    } finally {
        sat.close();
        nebula.close();
    }
});

test("an unreachable nebula is a 502, and an old one reports the assistant off", async () => {
    const sat = await satellite("http://127.0.0.1:1", pass);
    try {
        const res = await fetch(sat.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
        assert.equal(res.status, 502);
    } finally {
        sat.close();
    }
    const old = createServer((_req, res) => { res.statusCode = 404; res.end("{}"); });
    await new Promise((r) => old.listen(0, "127.0.0.1", r));
    const sat2 = await satellite(`http://127.0.0.1:${old.address().port}`, pass);
    try {
        assert.deepEqual(await (await fetch(`${sat2.url}/status`)).json(), { enabled: false, model: null, sources: [] });
    } finally {
        sat2.close();
        old.close();
    }
});
