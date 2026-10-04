import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readField, readFields, FieldError } from "../src/records/fields.js";
import { startForge } from "./helpers/server.js";

describe("readField", () => {
    test("trims text and turns blank into null", () => {
        assert.equal(readField("t", { type: "string" }, "  hi  "), "hi");
        assert.equal(readField("t", { type: "string" }, "   "), null);
        assert.equal(readField("t", { type: "string" }, undefined), undefined);
    });

    test("refuses what does not fit, naming the field", () => {
        const cases = [
            [{ type: "string", required: true }, "", "is required"],
            [{ type: "string" }, 5, "must be text"],
            [{ type: "string" }, "x".repeat(192), "longer than 191"],
            [{ type: "datetime" }, "last Tuesday", "not a date"],
            [{ type: "enum", values: ["A", "B"] }, "C", "one of A, B"],
        ];
        for (const [spec, raw, message] of cases) {
            assert.throws(() => readField("f", spec, raw), (e) => e instanceof FieldError && e.field === "f" && e.message.includes(message), message);
        }
    });

    test("fills defaults on create, leaves absent fields alone on update", () => {
        const fields = { a: { type: "enum", values: ["X", "Y"], default: "X" }, b: { type: "string" } };
        assert.deepEqual(readFields(fields, {}), { a: "X" });
        assert.deepEqual(readFields(fields, { b: "z" }, { partial: true }), { b: "z" });
    });
});

const url = process.env.TEST_DATABASE_URL;

describe("timeline routes", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let f, engagement, other;
    before(async () => { f = await startForge(url); });
    after(() => f?.stop());
    beforeEach(async () => {
        await f.reset();
        const customer = await f.db.customer.create({ data: { name: "C" } });
        engagement = await f.db.engagement.create({ data: { name: "IR", startDate: new Date(), customerId: customer.id, profile: "INCIDENT_RESPONSE" } });
        other = await f.db.engagement.create({ data: { name: "Other", startDate: new Date(), customerId: customer.id } });
    });
    const tl = (id = engagement.id) => `/engagement/${id}/timeline`;

    test("events are written as the token's user and listed in time order", async () => {
        const later = await f.call("POST", tl(), { occurredAt: "2026-09-12T10:00:00Z", title: "Mailbox rule created", tactic: "Persistence", createdBy: "someone" });
        const earlier = await f.call("POST", tl(), { occurredAt: "2026-09-12T09:15:00Z", title: "Phishing email delivered", confidence: "CONFIRMED", source: "Mail trace" });
        assert.equal(later.status, 201);
        assert.equal(later.body.createdBy, "u1");
        assert.equal(later.body.confidence, "LIKELY");
        const list = await f.call("GET", tl());
        assert.deepEqual(list.body.map((e) => e.title), ["Phishing email delivered", "Mailbox rule created"]);
        assert.equal(earlier.body.occurredAt, "2026-09-12T09:15:00.000Z");
    });

    test("bad input is a 400 naming the field", async () => {
        const cases = [
            [{ title: "x" }, "occurredAt"],
            [{ occurredAt: "2026-09-12T09:00:00Z" }, "title"],
            [{ occurredAt: "soon", title: "x" }, "occurredAt"],
            [{ occurredAt: "2026-09-12T09:00:00Z", title: "x", tactic: "Hacking" }, "tactic"],
            [{ occurredAt: "2026-09-12T09:00:00Z", title: "x", confidence: "SURE" }, "confidence"],
        ];
        for (const [body, field] of cases) {
            const res = await f.call("POST", tl(), body);
            assert.equal(res.status, 400, field);
            assert.equal(res.body.field, field);
        }
        assert.equal(await f.db.timelineEvent.count(), 0);
    });

    test("an update changes only what it sends; a cleared optional field becomes null", async () => {
        const { body } = await f.call("POST", tl(), { occurredAt: "2026-09-12T09:00:00Z", title: "x", source: "Wazuh", tactic: "Execution" });
        const updated = await f.call("PUT", `${tl()}/${body.id}`, { title: "y", tactic: null });
        assert.equal(updated.status, 200);
        assert.deepEqual([updated.body.title, updated.body.source, updated.body.tactic], ["y", "Wazuh", null]);
        assert.equal((await f.call("PUT", `${tl()}/${body.id}`, { title: "" })).body.field, "title");
    });

    test("another engagement's event is not found, and an unknown engagement is a 404", async () => {
        const { body } = await f.call("POST", tl(), { occurredAt: "2026-09-12T09:00:00Z", title: "x" });
        assert.equal((await f.call("PUT", `${tl(other.id)}/${body.id}`, { title: "y" })).status, 404);
        assert.equal((await f.call("DELETE", `${tl(other.id)}/${body.id}`)).status, 404);
        assert.equal((await f.call("GET", tl(other.id))).body.length, 0);
        assert.equal((await f.call("POST", tl("nope"), { occurredAt: "2026-09-12T09:00:00Z", title: "x" })).status, 404);
    });

    test("delete removes it, and deleting the engagement removes its timeline", async () => {
        const a = await f.call("POST", tl(), { occurredAt: "2026-09-12T09:00:00Z", title: "a" });
        await f.call("POST", tl(), { occurredAt: "2026-09-12T09:01:00Z", title: "b" });
        assert.equal((await f.call("DELETE", `${tl()}/${a.body.id}`)).status, 200);
        assert.equal(await f.db.timelineEvent.count(), 1);
        await f.db.engagement.delete({ where: { id: engagement.id } });
        assert.equal(await f.db.timelineEvent.count(), 0);
    });
});
