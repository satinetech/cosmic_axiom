// forge's real routes over HTTP, with a stub token verifier answering the way
// astral's /token/verify does. For route tests against a migrated, disposable
// MySQL (TEST_DATABASE_URL).
import http from "http";
import express from "express";

export async function startForge(url) {
    const astral = http.createServer((req, res) => {
        const user = req.headers.authorization === "Bearer other" ? "u2" : "u1";
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ valid: true, payload: { sub: user, role: "PENTEST LEAD" } }));
    }).listen(0);
    Object.assign(process.env, { DATABASE_URL: url, ASTRAL_URL: `http://127.0.0.1:${astral.address().port}` });
    const { default: routes } = await import("../../src/routes/index.js");
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    const app = express();
    app.use(express.json());
    app.use("/", routes);
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;

    const call = async (method, path, body, token = "t") => {
        const res = await fetch(base + path, {
            method,
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: body && JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };

    // Empty every engagement table, children first.
    const reset = async () => {
        for (const m of ["clientRequest", "affectedAsset", "indicator", "timelineEvent", "oplogAttachment", "operatorLogEntry", "scope", "testingParameters", "engagement", "customer"]) {
            if (db[m]) await db[m].deleteMany();
        }
    };

    const stop = async () => {
        server.close();
        astral.close();
        await db.$disconnect();
    };

    return { db, call, reset, stop };
}
