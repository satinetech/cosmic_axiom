// Pure tests always run. The database tests need a migrated, disposable MySQL:
//
//   TEST_DATABASE_URL=mysql://user:pass@host:3306/scratch npm test
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
    GENESIS, BACKDATED_AFTER_MS, OplogError, canonical, digest, addressMatches, scopeVerdict, appendEntry, verifyChain,
} from "../src/oplog/chain.js";

const sample = {
    engagementId: "e1", seq: 1, occurredAt: new Date("2026-03-01T10:00:00.000Z"), recordedAt: new Date("2026-03-01T10:01:00.000Z"),
    backdated: false, operator: "u1", summary: "Port scan of the DMZ", command: "nmap -sV 10.0.0.0/24", output: null,
    tool: "nmap", targetAddress: "10.0.0.0/24", scopeVerdict: "IN_SCOPE", correctsSeq: null, prevDigest: GENESIS,
    attachments: [],
};

describe("canonical form and digest", () => {
    test("covers every field, so changing any one changes the digest", () => {
        const base = digest(sample);
        const changes = {
            engagementId: "e2", seq: 2, occurredAt: new Date("2026-03-01T10:00:00.001Z"), recordedAt: new Date(0),
            backdated: true, operator: "u2", summary: "Port scan of the DMZ.", command: null, output: "x", tool: "masscan",
            targetAddress: "10.0.0.1", scopeVerdict: "NOT_LISTED", correctsSeq: 1, prevDigest: "f".repeat(64),
            attachments: [{ sha256: "a".repeat(64), label: null }],
        };
        for (const [field, value] of Object.entries(changes)) {
            assert.notEqual(digest({ ...sample, [field]: value }), base, field);
        }
    });

    test("absent and null optional fields are the same thing", () => {
        const { command, output, tool, targetAddress, scopeVerdict: v, correctsSeq, ...rest } = sample;
        assert.equal(digest({ ...rest, command: null, output: null, tool: null, targetAddress: null, scopeVerdict: null, correctsSeq: null }),
            digest({ ...rest }));
    });

    test("attachment order does not matter", () => {
        const a = { sha256: "a".repeat(64), label: "one" };
        const b = { sha256: "b".repeat(64), label: null };
        assert.equal(digest({ ...sample, attachments: [a, b] }), digest({ ...sample, attachments: [b, a] }));
    });

    test("is a tagged, fixed-order array", () => {
        const parsed = JSON.parse(canonical(sample));
        assert.equal(parsed[0], "oplog-v1");
        assert.equal(parsed.length, 16);
        assert.equal(parsed[3], "2026-03-01T10:00:00.000Z");
    });
});

describe("format 2: decisions", () => {
    const v2 = { ...sample, format: 2, kind: "ACTION", approvedBy: null };

    test("covers kind and approvedBy, and differs from v1", () => {
        assert.equal(JSON.parse(canonical(v2))[0], "oplog-v2");
        assert.notEqual(digest(v2), digest(sample));
        assert.notEqual(digest({ ...v2, kind: "DECISION" }), digest(v2));
        assert.notEqual(digest({ ...v2, approvedBy: "CISO" }), digest(v2));
    });

    test("v1 is unchanged, so entries written before decisions still verify", () => {
        assert.equal(JSON.parse(canonical(sample))[0], "oplog-v1");
        assert.equal(JSON.parse(canonical(sample)).length, 16);
    });
});

describe("scope", () => {
    const scopes = [
        { address: "10.0.0.0/24", inScope: true },
        { address: "10.0.0.7", inScope: false },
        { address: "App.Example.com", inScope: true },
    ];

    test("matches exactly, ignoring case and surrounding space", () => {
        assert.ok(addressMatches(" app.example.COM ", "App.Example.com"));
        assert.ok(!addressMatches("api.example.com", "example.com"));
    });

    test("matches IPv4 addresses inside a CIDR", () => {
        assert.ok(addressMatches("10.0.0.200", "10.0.0.0/24"));
        assert.ok(!addressMatches("10.0.1.1", "10.0.0.0/24"));
        assert.ok(addressMatches("192.168.4.4", "0.0.0.0/0"));
        assert.ok(!addressMatches("10.0.0.300", "10.0.0.0/24"));
    });

    test("an exclusion wins over the range it is carved out of", () => {
        assert.equal(scopeVerdict("10.0.0.5", scopes), "IN_SCOPE");
        assert.equal(scopeVerdict("10.0.0.7", scopes), "OUT_OF_SCOPE");
        assert.equal(scopeVerdict("app.example.com", scopes), "IN_SCOPE");
        assert.equal(scopeVerdict("10.9.9.9", scopes), "NOT_LISTED");
        assert.equal(scopeVerdict("", scopes), null);
        assert.equal(scopeVerdict(null, scopes), null);
    });
});

const url = process.env.TEST_DATABASE_URL;

describe("the chain, in MySQL", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
    let db;
    let engagement;
    const now = new Date("2026-03-01T12:00:00.000Z");
    const minutesAgo = (m) => new Date(now.getTime() - m * 60 * 1000);
    const append = (input, opts = {}) => appendEntry(db, { engagementId: engagement.id, operator: "u1", ...input }, { now, ...opts });

    before(() => { db = new PrismaClient({ datasources: { db: { url } } }); });
    after(() => db?.$disconnect());
    beforeEach(async () => {
        await db.oplogAttachment.deleteMany();
        await db.operatorLogEntry.deleteMany();
        await db.scope.deleteMany();
        await db.engagement.deleteMany();
        await db.customer.deleteMany();
        const customer = await db.customer.create({ data: { name: "C" } });
        engagement = await db.engagement.create({
            data: {
                name: "E", startDate: now, customerId: customer.id,
                scopes: { create: [{ address: "10.0.0.0/24" }, { address: "10.0.0.7", inScope: false }] },
            },
        });
    });

    test("appends a gapless, linked chain that verifies", async () => {
        const one = await append({ summary: "Recon", occurredAt: minutesAgo(1) });
        const two = await append({ summary: "Scan", targetAddress: "10.0.0.9", attachments: [{ sha256: "c".repeat(64), label: "nmap.xml" }] });
        assert.deepEqual([one.seq, two.seq], [1, 2]);
        assert.equal(one.prevDigest, GENESIS);
        assert.equal(two.prevDigest, one.entryDigest);
        assert.equal(two.scopeVerdict, "IN_SCOPE");
        assert.equal(two.attachments.length, 1);
        assert.deepEqual(await verifyChain(db, engagement.id), { ok: true, entries: 2 });
    });

    test("records when it was written and whether that was late", async () => {
        const live = await append({ summary: "now", occurredAt: minutesAgo(1) });
        const late = await append({ summary: "written up later", occurredAt: minutesAgo(BACKDATED_AFTER_MS / 60000 + 1) });
        assert.equal(live.backdated, false);
        assert.equal(late.backdated, true);
        assert.equal(late.recordedAt.toISOString(), now.toISOString());
    });

    test("refuses an entry with no summary, a future time, or a bad correction", async () => {
        await append({ summary: "first" });
        await assert.rejects(append({ summary: "  " }), (e) => e instanceof OplogError && e.field === "summary");
        await assert.rejects(append({ summary: "x", occurredAt: new Date(now.getTime() + 60 * 60 * 1000) }), (e) => e.field === "occurredAt");
        await assert.rejects(append({ summary: "x", correctsSeq: 5 }), (e) => e.field === "correctsSeq");
        assert.equal((await append({ summary: "fixes 1", correctsSeq: 1 })).correctsSeq, 1);
    });

    test("freezes the scope verdict as it was when written", async () => {
        const entry = await append({ summary: "touched .7", targetAddress: "10.0.0.7" });
        assert.equal(entry.scopeVerdict, "OUT_OF_SCOPE");
        await db.scope.updateMany({ where: { address: "10.0.0.7" }, data: { inScope: true } });
        const reread = await db.operatorLogEntry.findUnique({ where: { id: entry.id } });
        assert.equal(reread.scopeVerdict, "OUT_OF_SCOPE");
        assert.deepEqual(await verifyChain(db, engagement.id), { ok: true, entries: 1 });
    });

    test("concurrent writers still produce one unbroken chain", async () => {
        await Promise.all(Array.from({ length: 12 }, (_, i) => append({ summary: `entry ${i}`, operator: `u${i % 3}` }, { attempts: 20 })));
        const seqs = (await db.operatorLogEntry.findMany({ orderBy: { seq: "asc" } })).map((e) => e.seq);
        assert.deepEqual(seqs, Array.from({ length: 12 }, (_, i) => i + 1));
        assert.deepEqual(await verifyChain(db, engagement.id), { ok: true, entries: 12 });
    });

    test("an edited entry is found", async () => {
        for (const s of ["a", "b", "c"]) await append({ summary: s });
        await db.$executeRaw`UPDATE OperatorLogEntry SET summary = 'b, but nicer' WHERE seq = 2`;
        assert.deepEqual(await verifyChain(db, engagement.id), {
            ok: false, entries: 1, seq: 2, problem: "has been changed since it was written",
        });
    });

    test("a deleted entry is found", async () => {
        for (const s of ["a", "b", "c"]) await append({ summary: s });
        await db.$executeRaw`DELETE FROM OperatorLogEntry WHERE seq = 2`;
        const result = await verifyChain(db, engagement.id);
        assert.equal(result.ok, false);
        assert.equal(result.seq, 3);
    });

    test("a removed attachment is found", async () => {
        await append({ summary: "with file", attachments: [{ sha256: "d".repeat(64) }] });
        await db.oplogAttachment.deleteMany();
        assert.equal((await verifyChain(db, engagement.id)).problem, "has been changed since it was written");
    });

    test("a rewrite that recomputes every digest passes: tamper-evident, not tamper-proof", async () => {
        for (const s of ["a", "b"]) await append({ summary: s });
        const entries = await db.operatorLogEntry.findMany({ orderBy: { seq: "asc" }, include: { attachments: true } });
        let prev = GENESIS;
        for (const e of entries) {
            const rewritten = { ...e, summary: `${e.summary} (rewritten)`, prevDigest: prev };
            const d = digest(rewritten);
            await db.operatorLogEntry.update({ where: { id: e.id }, data: { summary: rewritten.summary, prevDigest: prev, entryDigest: d } });
            prev = d;
        }
        assert.equal((await verifyChain(db, engagement.id)).ok, true);
    });

    test("an engagement with a log cannot be deleted out from under it", async () => {
        await append({ summary: "a" });
        await assert.rejects(db.engagement.delete({ where: { id: engagement.id } }), (e) => e.code === "P2003");
    });

    test("a decision needs who approved it, and is written in format 2", async () => {
        await assert.rejects(append({ summary: "Disable the account", kind: "DECISION" }), (e) => e.field === "approvedBy");
        await assert.rejects(append({ summary: "x", kind: "VOTE" }), (e) => e.field === "kind");
        const d = await append({ summary: "Disable jsmith's account", kind: "DECISION", approvedBy: "  Client CISO  " });
        assert.deepEqual([d.kind, d.approvedBy, d.format], ["DECISION", "Client CISO", 2]);
        assert.deepEqual(await verifyChain(db, engagement.id), { ok: true, entries: 1 });
    });

    test("changing a decision, or who approved it, is found", async () => {
        await append({ summary: "Isolate the host", kind: "DECISION", approvedBy: "IT lead" });
        await append({ summary: "Isolated FIN-07" });
        await db.$executeRaw`UPDATE OperatorLogEntry SET approvedBy = 'CEO' WHERE seq = 1`;
        assert.equal((await verifyChain(db, engagement.id)).seq, 1);
        await db.$executeRaw`UPDATE OperatorLogEntry SET approvedBy = 'IT lead', kind = 'ACTION' WHERE seq = 1`;
        assert.equal((await verifyChain(db, engagement.id)).seq, 1);
    });

    test("an entry from before decisions (format 1) still verifies, and cannot be turned into one", async () => {
        // Written the way the previous version did: format 1, hashed as oplog-v1.
        const legacy = {
            engagementId: engagement.id, seq: 1, occurredAt: now, recordedAt: now, backdated: false, operator: "u1",
            summary: "Old entry", command: null, output: null, tool: null, targetAddress: null, scopeVerdict: null,
            correctsSeq: null, prevDigest: GENESIS, format: 1, kind: "ACTION", approvedBy: null,
        };
        await db.operatorLogEntry.create({ data: { ...legacy, entryDigest: digest(legacy) } });
        await append({ summary: "New entry" });
        assert.deepEqual(await verifyChain(db, engagement.id), { ok: true, entries: 2 });
        await db.$executeRaw`UPDATE OperatorLogEntry SET kind = 'DECISION', approvedBy = 'Someone' WHERE seq = 1`;
        assert.equal((await verifyChain(db, engagement.id)).seq, 1);
    });

    test("relabelling a format 2 entry as format 1 is found", async () => {
        await append({ summary: "x", kind: "DECISION", approvedBy: "IT lead" });
        await db.$executeRaw`UPDATE OperatorLogEntry SET format = 1, kind = 'ACTION', approvedBy = NULL WHERE seq = 1`;
        assert.equal((await verifyChain(db, engagement.id)).ok, false);
    });

    test("verifies across pages", async () => {
        for (let i = 0; i < 7; i++) await append({ summary: `e${i}` });
        assert.deepEqual(await verifyChain(db, engagement.id, { pageSize: 3 }), { ok: true, entries: 7 });
    });
});
