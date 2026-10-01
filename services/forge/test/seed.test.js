import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { parseSeed, seedEngagement, SeedError } from "../src/seed/engagement.js";

const doc = (over = {}) => ({
    externalRef: "CASE-1",
    customer: { name: "Example Corp" },
    engagement: { name: "Web App 2026", startDate: "2026-10-01", type: "WEB_APP_PENTEST", status: "ACTIVE" },
    scope: [
        { address: "10.0.0.0/24", description: "App tier" },
        { address: "10.0.0.7", inScope: false, notes: "Payments host" },
    ],
    ...over,
});

describe("parseSeed", () => {
    test("normalises a valid description", () => {
        const seed = parseSeed(doc());
        assert.equal(seed.engagement.startDate.toISOString(), "2026-10-01T00:00:00.000Z");
        assert.deepEqual(seed.scope.map((s) => [s.address, s.inScope]), [["10.0.0.0/24", true], ["10.0.0.7", false]]);
    });

    test("names the field that is wrong", () => {
        const cases = [
            [{ externalRef: "" }, "externalRef"],
            [{ customer: {} }, "customer.name"],
            [{ engagement: { startDate: "2026-10-01" } }, "engagement.name"],
            [{ engagement: { name: "x" } }, "engagement.startDate"],
            [{ engagement: { name: "x", startDate: "soon" } }, "engagement.startDate"],
            [{ engagement: { name: "x", startDate: "2026-10-01", type: "PIZZA" } }, "engagement.type"],
            [{ scope: "10.0.0.1" }, "scope"],
            [{ scope: [{ address: "" }] }, "scope[0].address"],
            [{ scope: [{ address: "a", inScope: "yes" }] }, "scope[0].inScope"],
            [{ scope: [{ address: "a", criticality: "EXTREME" }] }, "scope[0].criticality"],
        ];
        for (const [over, field] of cases) {
            assert.throws(() => parseSeed(doc(over)), (e) => e instanceof SeedError && e.field === field, field);
        }
    });
});

const url = process.env.TEST_DATABASE_URL;

describe("seedEngagement, in MySQL", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let db;
    before(() => { db = new PrismaClient({ datasources: { db: { url } } }); });
    after(() => db?.$disconnect());
    beforeEach(async () => {
        await db.oplogAttachment.deleteMany();
        await db.operatorLogEntry.deleteMany();
        await db.scope.deleteMany();
        await db.engagement.deleteMany();
        await db.customer.deleteMany();
    });

    test("creates the customer, engagement and scope", async () => {
        const { engagementId, created } = await seedEngagement(db, doc());
        assert.equal(created, true);
        const e = await db.engagement.findUnique({ where: { id: engagementId }, include: { customer: true, scopes: true } });
        assert.equal(e.externalRef, "CASE-1");
        assert.equal(e.customer.name, "Example Corp");
        assert.equal(e.type, "WEB_APP_PENTEST");
        assert.deepEqual(e.scopes.map((s) => [s.address, s.inScope]).sort(), [["10.0.0.0/24", true], ["10.0.0.7", false]]);
    });

    test("re-running changes nothing, even after edits", async () => {
        const first = await seedEngagement(db, doc());
        await db.engagement.update({ where: { id: first.engagementId }, data: { name: "Renamed by a person" } });
        const again = await seedEngagement(db, doc({ engagement: { name: "Seed name", startDate: "2026-10-01" } }));
        assert.deepEqual(again, { engagementId: first.engagementId, created: false });
        assert.equal((await db.engagement.findUnique({ where: { id: first.engagementId } })).name, "Renamed by a person");
        assert.equal(await db.scope.count(), 2);
    });

    test("reuses a customer with the same name", async () => {
        await seedEngagement(db, doc());
        await seedEngagement(db, doc({ externalRef: "CASE-2" }));
        assert.equal(await db.customer.count(), 1);
        assert.equal(await db.engagement.count(), 2);
    });

    test("an invalid description writes nothing", async () => {
        await assert.rejects(seedEngagement(db, doc({ scope: [{ address: "ok" }, { address: "" }] })), SeedError);
        assert.equal(await db.customer.count(), 0);
    });

    test("concurrent runs create one engagement", async () => {
        const results = await Promise.all([seedEngagement(db, doc()), seedEngagement(db, doc()), seedEngagement(db, doc())]);
        assert.equal(await db.engagement.count(), 1);
        assert.equal(new Set(results.map((r) => r.engagementId)).size, 1);
        assert.equal(results.filter((r) => r.created).length, 1);
    });

    test("the command reads stdin, prints the result, and exits 2 on a bad description", () => {
        const env = { ...process.env, DATABASE_URL: url };
        const ok = execFileSync("node", ["src/seed-engagement.js"], { input: JSON.stringify(doc()), env, encoding: "utf8" });
        assert.equal(JSON.parse(ok).created, true);
        const bad = spawnSync("node", ["src/seed-engagement.js"], { input: JSON.stringify(doc({ customer: {} })), env, encoding: "utf8" });
        assert.equal(bad.status, 2);
        assert.match(bad.stderr, /customer\.name: is required/);
        const notJson = spawnSync("node", ["src/seed-engagement.js"], { input: "{nope", env, encoding: "utf8" });
        assert.equal(notJson.status, 2);
    });
});
