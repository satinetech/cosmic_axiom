// The operator log routes over HTTP, against a migrated, disposable MySQL:
//
//   TEST_DATABASE_URL=mysql://user:pass@host:3306/scratch npm test
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";

const url = process.env.TEST_DATABASE_URL;

describe("/engagement/:id/log", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let db, server, astral, base, engagement;

    before(async () => {
        // A token verifier answering the way astral's /token/verify does.
        astral = http.createServer((req, res) => {
            const user = req.headers.authorization === "Bearer other" ? "u2" : "u1";
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ valid: true, payload: { sub: user, role: "PENTESTER" } }));
        }).listen(0);
        Object.assign(process.env, { DATABASE_URL: url, ASTRAL_URL: `http://127.0.0.1:${astral.address().port}` });
        const { default: routes } = await import("../src/routes/index.js");
        const { PrismaClient } = await import("@prisma/client");
        db = new PrismaClient();
        const app = express();
        app.use(express.json());
        app.use("/", routes);
        server = app.listen(0);
        base = `http://127.0.0.1:${server.address().port}`;
    });

    after(async () => {
        server?.close();
        astral?.close();
        await db?.$disconnect();
    });

    beforeEach(async () => {
        await db.oplogAttachment.deleteMany();
        await db.operatorLogEntry.deleteMany();
        await db.scope.deleteMany();
        await db.engagement.deleteMany();
        await db.customer.deleteMany();
        const customer = await db.customer.create({ data: { name: "C" } });
        engagement = await db.engagement.create({
            data: { name: "E", startDate: new Date(), customerId: customer.id, scopes: { create: [{ address: "10.0.0.0/24" }] } },
        });
    });

    const call = async (method, path, body, token = "t") => {
        const res = await fetch(base + path, {
            method,
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: body && JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    const log = () => `/engagement/${engagement.id}/log`;

    test("an entry is written as the token's user, whatever the body says", async () => {
        const { status, body } = await call("POST", log(), {
            summary: "Scanned the app tier", targetAddress: "10.0.0.12", tool: "nmap", operator: "someone-else",
        });
        assert.equal(status, 201);
        assert.equal(body.operator, "u1");
        assert.equal(body.seq, 1);
        assert.equal(body.scopeVerdict, "IN_SCOPE");
        assert.equal((await call("POST", log(), { summary: "second" }, "other")).body.operator, "u2");
    });

    test("entries come back in order, a page at a time", async () => {
        for (let i = 1; i <= 5; i++) await call("POST", log(), { summary: `entry ${i}` });
        const first = await call("GET", `${log()}?limit=2`);
        assert.deepEqual(first.body.map((e) => e.seq), [1, 2]);
        const next = await call("GET", `${log()}?after=2&limit=2`);
        assert.deepEqual(next.body.map((e) => e.seq), [3, 4]);
        assert.equal((await call("GET", `${log()}?limit=x`)).status, 200);
        assert.equal((await call("GET", `${log()}?after=-1`)).status, 400);
    });

    test("verification reports the chain and says what it does not prove", async () => {
        await call("POST", log(), { summary: "a" });
        await call("POST", log(), { summary: "b" });
        const ok = await call("GET", `${log()}/verify`);
        assert.equal(ok.body.ok, true);
        assert.equal(ok.body.entries, 2);
        assert.ok(ok.body.lastRecordedAt);
        assert.match(ok.body.limit, /not tamper-proof/);

        await db.$executeRaw`UPDATE OperatorLogEntry SET summary = 'edited' WHERE seq = 1`;
        const broken = await call("GET", `${log()}/verify`);
        assert.equal(broken.body.ok, false);
        assert.equal(broken.body.seq, 1);
    });

    test("bad input is a 400 naming the field; an unknown engagement is a 404", async () => {
        const missing = await call("POST", log(), { command: "id" });
        assert.equal(missing.status, 400);
        assert.equal(missing.body.field, "summary");
        assert.equal((await call("POST", log(), { summary: "x", occurredAt: "nonsense" })).body.field, "occurredAt");
        assert.equal((await call("POST", "/engagement/nope/log", { summary: "x" })).status, 404);
    });

    test("an engagement with a log is kept: 409, not 500", async () => {
        await call("POST", log(), { summary: "a" });
        const res = await call("DELETE", `/engagement/${engagement.id}`);
        assert.equal(res.status, 409);
        assert.ok(await db.engagement.findUnique({ where: { id: engagement.id } }));
    });

    test("an engagement without a log still deletes", async () => {
        assert.equal((await call("DELETE", `/engagement/${engagement.id}`)).status, 200);
    });
});
