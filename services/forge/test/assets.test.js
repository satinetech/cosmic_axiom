import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startForge } from "./helpers/server.js";

const url = process.env.TEST_DATABASE_URL;

describe("affected asset routes", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let f, engagement;
    before(async () => { f = await startForge(url); });
    after(() => f?.stop());
    beforeEach(async () => {
        await f.reset();
        const customer = await f.db.customer.create({ data: { name: "C" } });
        engagement = await f.db.engagement.create({ data: { name: "IR", startDate: new Date(), customerId: customer.id, profile: "INCIDENT_RESPONSE" } });
    });
    const assets = () => `/engagement/${engagement.id}/assets`;

    test("assets list worst first", async () => {
        for (const [identifier, status] of [["remediated", "REMEDIATED"], ["suspected", "SUSPECTED"], ["confirmed", "CONFIRMED_COMPROMISED"], ["contained", "CONTAINED"]]) {
            assert.equal((await f.call("POST", assets(), { kind: "HOST", identifier, status })).status, 201);
        }
        assert.deepEqual((await f.call("GET", assets())).body.map((a) => a.identifier), ["confirmed", "suspected", "contained", "remediated"]);
    });

    test("an asset is recorded once per kind, ignoring case", async () => {
        assert.equal((await f.call("POST", assets(), { kind: "ACCOUNT", identifier: "jsmith@example.com" })).status, 201);
        const dup = await f.call("POST", assets(), { kind: "ACCOUNT", identifier: "JSmith@Example.com" });
        assert.equal(dup.status, 409);
        assert.equal((await f.call("POST", assets(), { kind: "MAILBOX", identifier: "jsmith@example.com" })).status, 201);
    });

    test("containment cannot precede the compromise, including on update", async () => {
        const bad = await f.call("POST", assets(), { kind: "HOST", identifier: "h", firstCompromisedAt: "2026-09-12T10:00:00Z", containedAt: "2026-09-12T09:00:00Z" });
        assert.equal(bad.body.field, "containedAt");
        const { body } = await f.call("POST", assets(), { kind: "HOST", identifier: "h", firstCompromisedAt: "2026-09-12T10:00:00Z" });
        assert.equal((await f.call("PUT", `${assets()}/${body.id}`, { containedAt: "2026-09-11T00:00:00Z" })).status, 400);
        const ok = await f.call("PUT", `${assets()}/${body.id}`, { status: "CONTAINED", containedAt: "2026-09-12T12:00:00Z" });
        assert.deepEqual([ok.status, ok.body.status], [200, "CONTAINED"]);
    });
});
