import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { EvidenceStore, sha256 } from "../src/evidence/store.js";
import { ingestEvidence, recordCustody } from "../src/evidence/custody.js";
import { resolveFindingImages, resolveSectionImages } from "../src/evidence/findingImages.js";

let root;
let store;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-test-"));
    store = new EvidenceStore(root);
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const other = Buffer.from("not really a gif");

/** Overwrites a stored file in place, as corruption or tampering would. */
function tamper(sha, bytes) {
    const file = store.pathFor(sha);
    fs.chmodSync(file, 0o640);
    fs.writeFileSync(file, bytes);
}

/** Just enough of a Prisma client, recording what was asked of it. */
function fakeDb({ columns = {} } = {}) {
    const calls = { findMany: [], evidence: [], custody: [] };
    return {
        calls,
        findingImage: {
            findMany: async ({ where }) => {
                calls.findMany.push(where.id.in);
                return where.id.in.filter((id) => id in columns).map((id) => ({ id, imageData: columns[id] }));
            },
        },
        evidence: {
            create: async ({ data }) => {
                if (calls.evidence.some((d) => d.sha256 === data.sha256)) {
                    throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
                }
                calls.evidence.push(data);
                return data;
            },
        },
        evidenceCustodyEvent: {
            create: async ({ data }) => { calls.custody.push(data); return { id: calls.custody.length, ...data }; },
        },
    };
}

describe("EvidenceStore", () => {
    test("stores by content hash, sharded, and reads back", async () => {
        const { sha256: sha, size, created } = await store.put(png);
        assert.equal(sha, sha256(png));
        assert.equal(size, png.length);
        assert.equal(created, true);
        assert.equal(store.pathFor(sha), path.join(root, "sha256", sha.slice(0, 2), sha.slice(2, 4), sha));
        assert.ok((await store.get(sha)).equals(png));
    });

    test("stores identical bytes once", async () => {
        await store.put(png);
        const again = await store.put(Buffer.from(png));
        assert.equal(again.created, false);
        const dir = path.dirname(store.pathFor(again.sha256));
        assert.deepEqual(fs.readdirSync(dir), [again.sha256]);
    });

    test("files are read-only once written", async () => {
        const { sha256: sha } = await store.put(png);
        assert.equal(fs.statSync(store.pathFor(sha)).mode & 0o222, 0);
    });

    test("a missing file reads as null", async () => {
        const sha = sha256(other);
        assert.equal(await store.get(sha), null);
        assert.equal(await store.observe(sha), null);
    });

    test("observe reports the hash the bytes have now, not the name", async () => {
        const { sha256: sha } = await store.put(png);
        assert.equal(await store.observe(sha), sha);
        tamper(sha, other);
        assert.equal(await store.observe(sha), sha256(other));
    });

    test("refuses anything that is not a sha256 as a name", () => {
        for (const bad of ["../../etc/passwd", "ABC", "0".repeat(63), "0".repeat(64) + "/x", null, undefined, "G".repeat(64)]) {
            assert.throws(() => store.pathFor(bad), /not a sha256/, String(bad));
        }
    });
});

describe("custody", () => {
    test("ingesting stores the file, ensures a row, and records what is on disk", async () => {
        const db = fakeDb();
        const result = await ingestEvidence(db, store, { buffer: png, mimeType: "image/png", actor: "alice" });
        const sha = sha256(png);
        assert.equal(result.sha256, sha);
        assert.deepEqual(db.calls.evidence, [{ sha256: sha, size: png.length, mimeType: "image/png" }]);
        assert.deepEqual(db.calls.custody[0], {
            evidenceSha: sha, action: "INGESTED", observedSha: sha, actor: "alice", detail: undefined,
        });
    });

    test("ingesting the same bytes twice is two events and one file", async () => {
        const db = fakeDb();
        const first = await ingestEvidence(db, store, { buffer: png, mimeType: "image/png" });
        const second = await ingestEvidence(db, store, { buffer: png, mimeType: "image/png" });
        assert.equal(first.created, true);
        assert.equal(second.created, false);
        assert.equal(db.calls.evidence.length, 1, "one row; the duplicate insert is absorbed");
        assert.equal(db.calls.custody.length, 2);
    });

    test("a changed file is recorded as changed", async () => {
        const db = fakeDb();
        const { sha256: sha } = await store.put(png);
        tamper(sha, other);
        const event = await recordCustody(db, store, { sha256: sha, action: "VERIFIED" });
        assert.equal(event.evidenceSha, sha);
        assert.equal(event.observedSha, sha256(other));
    });

    test("a missing file is recorded as missing", async () => {
        const db = fakeDb();
        const sha = sha256(other);
        const event = await recordCustody(db, store, { sha256: sha, action: "VERIFIED" });
        assert.equal(event.observedSha, null);
    });
});

describe("resolveFindingImages", () => {
    const meta = (id, extra = {}) => ({
        id, reportFindingId: "f1", title: `t-${id}`, caption: `c-${id}`, mimeType: "image/png",
        createdAt: new Date("2026-01-01T00:00:00Z"), ...extra,
    });
    const attachment = (id, sha, extra = {}) => ({
        id, reportFindingId: "f1", evidenceSha: sha, title: `et-${id}`, caption: `ec-${id}`, position: 0,
        legacyImageId: null, createdAt: new Date("2026-01-02T00:00:00Z"), evidence: { mimeType: "image/gif" }, ...extra,
    });

    test("an image not yet copied reads its stored column", async () => {
        const db = fakeDb({ columns: { i1: "COLUMN" } });
        const out = await resolveFindingImages(db, store, { id: "f1", title: "x", images: [meta("i1")], evidence: [] });
        assert.deepEqual(out, { id: "f1", title: "x", images: [{ ...meta("i1"), imageData: "COLUMN" }] });
        assert.deepEqual(db.calls.findMany, [["i1"]]);
    });

    test("a copied image reads from disk, keeps its own metadata, and never loads the column", async () => {
        const db = fakeDb({ columns: { i1: "COLUMN" } });
        const { sha256: sha } = await store.put(png);
        const out = await resolveFindingImages(db, store, {
            id: "f1", images: [meta("i1")], evidence: [attachment("a1", sha, { legacyImageId: "i1" })],
        });
        assert.deepEqual(out.images, [{ ...meta("i1"), imageData: png.toString("base64") }]);
        assert.deepEqual(db.calls.findMany, []);
    });

    test("a copy missing on disk falls back to the column", async () => {
        const db = fakeDb({ columns: { i1: "COLUMN" } });
        const out = await resolveFindingImages(db, store, {
            id: "f1", images: [meta("i1")], evidence: [attachment("a1", sha256(other), { legacyImageId: "i1" })],
        });
        assert.equal(out.images[0].imageData, "COLUMN");
        assert.deepEqual(db.calls.findMany, [["i1"]]);
    });

    test("evidence attached directly follows, in the FindingImage shape", async () => {
        const db = fakeDb({ columns: { i1: "COLUMN" } });
        const { sha256: sha } = await store.put(png);
        const out = await resolveFindingImages(db, store, { id: "f1", images: [meta("i1")], evidence: [attachment("a1", sha)] });
        assert.deepEqual(out.images.map((i) => i.id), ["i1", "a1"]);
        assert.deepEqual(out.images[1], {
            id: "a1", reportFindingId: "f1", title: "et-a1", caption: "ec-a1", mimeType: "image/gif",
            createdAt: new Date("2026-01-02T00:00:00Z"), imageData: png.toString("base64"),
        });
    });

    test("a copy whose image was deleted is not shown", async () => {
        const db = fakeDb();
        const { sha256: sha } = await store.put(png);
        const out = await resolveFindingImages(db, store, {
            id: "f1", images: [], evidence: [attachment("a1", sha, { legacyImageId: "gone" })],
        });
        assert.deepEqual(out.images, []);
    });

    test("an attachment missing on disk is omitted, not returned empty", async () => {
        const db = fakeDb();
        const out = await resolveFindingImages(db, store, { id: "f1", images: [], evidence: [attachment("a1", sha256(other))] });
        assert.deepEqual(out.images, []);
    });

    test("sections without a finding pass through", async () => {
        const db = fakeDb({ columns: { i1: "COLUMN" } });
        const out = await resolveSectionImages(db, store, [
            { id: "s1", reportFinding: null },
            { id: "s2", reportFinding: { id: "f1", images: [meta("i1")], evidence: [] } },
        ]);
        assert.equal(out[0].reportFinding, null);
        assert.equal(out[1].reportFinding.images[0].imageData, "COLUMN");
        assert.equal("evidence" in out[1].reportFinding, false);
    });
});
