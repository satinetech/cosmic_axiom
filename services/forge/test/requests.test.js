import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { startForge } from "./helpers/server.js";

const url = process.env.TEST_DATABASE_URL;

describe("client request routes", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let f, engagement;
    before(async () => { f = await startForge(url); });
    after(() => f?.stop());
    beforeEach(async () => {
        await f.reset();
        const customer = await f.db.customer.create({ data: { name: "C" } });
        engagement = await f.db.engagement.create({ data: { name: "IR", startDate: new Date(), customerId: customer.id, profile: "INCIDENT_RESPONSE" } });
    });
    const reqs = () => `/engagement/${engagement.id}/requests`;

    test("a request is open and dated now unless told otherwise", async () => {
        const before = Date.now();
        const { status, body } = await f.call("POST", reqs(), { request: "Audit log export" });
        assert.equal(status, 201);
        assert.equal(body.status, "OPEN");
        assert.equal(body.resolvedAt, null);
        assert.ok(new Date(body.requestedAt).getTime() >= before - 1000);
    });

    test("resolvedAt follows the status", async () => {
        const { body } = await f.call("POST", reqs(), { request: "Firewall logs" });
        const received = await f.call("PUT", `${reqs()}/${body.id}`, { status: "RECEIVED" });
        assert.ok(received.body.resolvedAt);
        const noted = await f.call("PUT", `${reqs()}/${body.id}`, { detail: "Only 30 days retained" });
        assert.equal(noted.body.resolvedAt, received.body.resolvedAt, "an edit does not move it");
        const reopened = await f.call("PUT", `${reqs()}/${body.id}`, { status: "OPEN" });
        assert.equal(reopened.body.resolvedAt, null);
    });

    test("open requests list first, soonest due first", async () => {
        const a = await f.call("POST", reqs(), { request: "done" });
        await f.call("PUT", `${reqs()}/${a.body.id}`, { status: "RECEIVED" });
        await f.call("POST", reqs(), { request: "later", dueAt: "2026-10-20T00:00:00Z" });
        await f.call("POST", reqs(), { request: "sooner", dueAt: "2026-10-10T00:00:00Z" });
        assert.deepEqual((await f.call("GET", reqs())).body.map((r) => r.request), ["sooner", "later", "done"]);
    });
});
