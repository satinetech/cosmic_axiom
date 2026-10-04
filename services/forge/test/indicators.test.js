import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FieldError } from "../src/records/fields.js";
import { startForge } from "./helpers/server.js";

const lib = () => import("../src/records/indicatorValues.js");

describe("normaliseIndicator", () => {
    test("refangs and normalises each type", async () => {
        const { normaliseIndicator: n } = await lib();
        assert.equal(n("URL", "hxxps://evil[.]example/login"), "https://evil.example/login");
        assert.equal(n("DOMAIN", "Evil[.]Example."), "evil.example");
        assert.equal(n("IP", "203.0.113[.]7"), "203.0.113.7");
        assert.equal(n("IP", "2001:DB8::1"), "2001:db8::1");
        assert.equal(n("EMAIL", "Bob[@]Evil.Example"), "bob@evil.example");
        assert.equal(n("HASH_SHA256", "A".repeat(64)), "a".repeat(64));
        assert.equal(n("FILE_NAME", "  invoice.pdf.exe "), "invoice.pdf.exe");
    });

    test("refuses a value that is not its type", async () => {
        const { normaliseIndicator: n } = await lib();
        const cases = [["IP", "300.1.1.1"], ["IP", "evil.example"], ["DOMAIN", "not a domain"], ["URL", "evil.example/path"],
            ["EMAIL", "bob"], ["HASH_MD5", "a".repeat(31)], ["HASH_SHA1", "z".repeat(40)], ["HASH_SHA256", "a".repeat(40)]];
        for (const [type, value] of cases) {
            assert.throws(() => n(type, value), (e) => e instanceof FieldError && e.field === "value", `${type} ${value}`);
        }
    });
});

const url = process.env.TEST_DATABASE_URL;

describe("indicator routes", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let f, engagement;
    before(async () => { f = await startForge(url); });
    after(() => f?.stop());
    beforeEach(async () => {
        await f.reset();
        const customer = await f.db.customer.create({ data: { name: "C" } });
        engagement = await f.db.engagement.create({ data: { name: "IR", startDate: new Date(), customerId: customer.id, profile: "INCIDENT_RESPONSE" } });
    });
    const ind = () => `/engagement/${engagement.id}/indicators`;

    test("stores the normalised value and refuses the same indicator twice, however spelled", async () => {
        const first = await f.call("POST", ind(), { type: "DOMAIN", value: "Evil[.]Example" });
        assert.equal(first.status, 201);
        assert.equal(first.body.value, "evil.example");
        const again = await f.call("POST", ind(), { type: "DOMAIN", value: "evil.example." });
        assert.equal(again.status, 409);
        assert.match(again.body.error, /already recorded/);
        assert.equal((await f.call("POST", ind(), { type: "URL", value: "http://evil.example" })).status, 201, "same text, different type");
    });

    test("bad input is a 400 naming the field", async () => {
        assert.equal((await f.call("POST", ind(), { type: "IP", value: "nope" })).body.field, "value");
        assert.equal((await f.call("POST", ind(), { type: "IPV4", value: "1.2.3.4" })).body.field, "type");
        const order = await f.call("POST", ind(), { type: "IP", value: "1.2.3.4", firstSeen: "2026-09-12T10:00:00Z", lastSeen: "2026-09-11T10:00:00Z" });
        assert.equal(order.body.field, "lastSeen");
        assert.equal(await f.db.indicator.count(), 0);
    });

    test("an update is re-checked and re-normalised against the stored type", async () => {
        const { body } = await f.call("POST", ind(), { type: "HASH_SHA1", value: "a".repeat(40) });
        assert.equal((await f.call("PUT", `${ind()}/${body.id}`, { value: "short" })).status, 400);
        const ok = await f.call("PUT", `${ind()}/${body.id}`, { value: "B".repeat(40), confidence: "CONFIRMED" });
        assert.equal(ok.status, 200);
        assert.deepEqual([ok.body.value, ok.body.confidence], ["b".repeat(40), "CONFIRMED"]);
    });
});
