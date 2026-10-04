// The engagement routes' handling of `profile`, over HTTP against a migrated,
// disposable MySQL:
//
//   TEST_DATABASE_URL=mysql://user:pass@host:3306/scratch npm test
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";

const url = process.env.TEST_DATABASE_URL;

describe("engagement profile", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let db, server, astral, base, customer;

    before(async () => {
        astral = http.createServer((req, res) => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ valid: true, payload: { sub: "u1", role: "PENTEST LEAD" } }));
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
        await db.testingParameters.deleteMany();
        await db.engagement.deleteMany();
        await db.customer.deleteMany();
        customer = await db.customer.create({ data: { name: "Example Corp" } });
    });

    const call = async (method, path, body) => {
        const res = await fetch(base + path, {
            method,
            headers: { "content-type": "application/json", authorization: "Bearer t" },
            body: body && JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    const create = (extra = {}) =>
        call("POST", "/engagement", { name: "E", customerId: customer.id, startDate: "2026-10-04", ...extra });

    test("an engagement is a pentest unless it says otherwise", async () => {
        const { status, body } = await create();
        assert.equal(status, 201);
        assert.equal(body.profile, "PENTEST");
    });

    test("an incident response engagement keeps its profile through create, list and detail", async () => {
        const { body } = await create({ profile: "INCIDENT_RESPONSE" });
        assert.equal(body.profile, "INCIDENT_RESPONSE");
        assert.equal((await call("GET", "/engagement")).body[0].profile, "INCIDENT_RESPONSE");
        assert.equal((await call("GET", `/engagement/${body.id}`)).body.profile, "INCIDENT_RESPONSE");
    });

    test("the profile can be changed, and is left alone when not sent", async () => {
        const { body } = await create();
        const changed = await call("PUT", `/engagement/${body.id}`, { profile: "INCIDENT_RESPONSE" });
        assert.equal(changed.status, 200);
        assert.equal(changed.body.profile, "INCIDENT_RESPONSE");
        const renamed = await call("PUT", `/engagement/${body.id}`, { name: "Renamed" });
        assert.equal(renamed.body.profile, "INCIDENT_RESPONSE");
    });

    test("an unknown profile is a 400 naming the choices, on create and update", async () => {
        const bad = await create({ profile: "FORENSICS" });
        assert.equal(bad.status, 400);
        assert.match(bad.body.error, /PENTEST, INCIDENT_RESPONSE/);
        const { body } = await create();
        assert.equal((await call("PUT", `/engagement/${body.id}`, { profile: "nope" })).status, 400);
        assert.equal(await db.engagement.count(), 1);
    });
});
