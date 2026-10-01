// The /images routes over HTTP, against a real MySQL (see backfill.test.js):
//
//   TEST_DATABASE_URL=mysql://user:pass@host:3306/scratch npm test
//
// The database must be migrated and disposable. Skipped without it.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import express from "express";
import { sha256 } from "../src/evidence/store.js";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "TEST_DATABASE_URL not set";

describe("/images", { skip }, () => {
    let db, base, server, astral, root, store, finding, otherFinding;

    before(async () => {
        // A token verifier that accepts anything, as one user, answering the
        // way astral's /token/verify does.
        astral = http.createServer((req, res) => {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ valid: true, payload: { sub: "u1", role: "ADMIN", jti: "j1" } }));
        }).listen(0);
        root = fs.mkdtempSync(path.join(os.tmpdir(), "images-routes-"));
        Object.assign(process.env, {
            DATABASE_URL: url, EVIDENCE_ROOT: root, ASTRAL_URL: `http://127.0.0.1:${astral.address().port}`,
        });
        const { default: images } = await import("../src/routes/images.js");
        const { EvidenceStore } = await import("../src/evidence/store.js");
        const { PrismaClient } = await import("@prisma/client");
        db = new PrismaClient();
        store = new EvidenceStore(root);
        const app = express();
        app.use(express.json({ limit: "10mb" }));
        app.use("/images", images);
        server = app.listen(0);
        base = `http://127.0.0.1:${server.address().port}/images`;
    });

    after(async () => {
        server?.close();
        astral?.close();
        await db?.$disconnect();
        fs.rmSync(root, { recursive: true, force: true });
    });

    beforeEach(async () => {
        await db.findingEvidence.deleteMany();
        await db.evidenceCustodyEvent.deleteMany();
        await db.evidence.deleteMany();
        await db.report.deleteMany();
        const report = await db.report.create({ data: { engagementId: "e1", title: "R" } });
        const make = () => db.reportFinding.create({
            data: { reportId: report.id, title: "F", description: "d", recommendation: "r", impact: "i", severity: "HIGH" },
        });
        finding = await make();
        otherFinding = await make();
    });

    const call = async (method, p, body) => {
        const res = await fetch(base + p, {
            method,
            headers: { "content-type": "application/json", authorization: "Bearer t" },
            body: body && JSON.stringify(body),
        });
        return { status: res.status, body: await res.json() };
    };
    const upload = (bytes, extra = {}) => call("POST", "", {
        reportFindingId: finding.id, title: "shot", caption: "cap", mimeType: "image/png",
        imageData: bytes.toString("base64"), ...extra,
    });
    const list = async (id = finding.id) => (await call("GET", `/finding/${id}`)).body;

    test("an upload goes to the evidence store, not FindingImage", async () => {
        const bytes = Buffer.from("a screenshot");
        const { status, body } = await upload(bytes);
        assert.equal(status, 201);
        assert.deepEqual(Object.keys(body).sort(), ["caption", "createdAt", "id", "imageData", "mimeType", "reportFindingId", "title"]);
        assert.equal(body.imageData, bytes.toString("base64"));

        assert.equal(await db.findingImage.count(), 0);
        const sha = sha256(bytes);
        assert.ok((await store.get(sha)).equals(bytes));
        const events = await db.evidenceCustodyEvent.findMany({ orderBy: { id: "asc" } });
        assert.deepEqual(events.map((e) => [e.action, e.observedSha, e.actor]), [
            ["INGESTED", sha, "u1"], ["ATTACHED", sha, "u1"],
        ]);

        const images = await list();
        assert.equal(images.length, 1);
        assert.equal(images[0].id, body.id);
        assert.ok(Buffer.from(images[0].imageData, "base64").equals(bytes));
    });

    test("the same file uploaded to two findings is stored once", async () => {
        const bytes = Buffer.from("shared");
        await upload(bytes);
        await upload(bytes, { reportFindingId: otherFinding.id });
        assert.equal(await db.evidence.count(), 1);
        assert.equal(await db.findingEvidence.count(), 2);
    });

    test("new uploads follow a finding's existing images, in upload order", async () => {
        await db.findingImage.create({
            data: { reportFindingId: finding.id, title: "old", caption: "", imageData: Buffer.from("old").toString("base64"), mimeType: "image/png" },
        });
        await upload(Buffer.from("one"), { title: "first" });
        await upload(Buffer.from("two"), { title: "second" });
        assert.deepEqual((await list()).map((i) => i.title), ["old", "first", "second"]);
    });

    test("editing an upload", async () => {
        const { body } = await upload(Buffer.from("x"));
        const edited = await call("PUT", `/${body.id}`, { caption: "new caption" });
        assert.equal(edited.status, 200);
        assert.equal(edited.body.caption, "new caption");
        assert.equal((await list())[0].caption, "new caption");
    });

    test("editing an older image updates its evidence copy too", async () => {
        const old = await db.findingImage.create({
            data: { reportFindingId: finding.id, title: "old", caption: "", imageData: "eA==", mimeType: "image/png" },
        });
        await db.evidence.create({ data: { sha256: sha256(Buffer.from("x")), size: 1, mimeType: "image/png" } });
        await db.findingEvidence.create({
            data: { reportFindingId: finding.id, evidenceSha: sha256(Buffer.from("x")), title: "old", caption: "", legacyImageId: old.id },
        });
        assert.equal((await call("PUT", `/${old.id}`, { title: "renamed" })).status, 200);
        assert.equal((await db.findingImage.findUnique({ where: { id: old.id } })).title, "renamed");
        assert.equal((await db.findingEvidence.findUnique({ where: { legacyImageId: old.id } })).title, "renamed");
    });

    test("deleting an upload detaches it and keeps the file and its record", async () => {
        const bytes = Buffer.from("to delete");
        const { body } = await upload(bytes);
        assert.equal((await call("DELETE", `/${body.id}`)).status, 200);
        assert.deepEqual(await list(), []);
        const sha = sha256(bytes);
        assert.equal(await db.evidence.count({ where: { sha256: sha } }), 1);
        assert.ok(await store.get(sha));
        const last = await db.evidenceCustodyEvent.findFirst({ orderBy: { id: "desc" } });
        assert.deepEqual([last.action, last.observedSha, last.detail.attachmentId], ["DETACHED", sha, body.id]);
    });

    test("deleting an older image removes its evidence copy as well", async () => {
        const old = await db.findingImage.create({
            data: { reportFindingId: finding.id, title: "old", caption: "", imageData: "eA==", mimeType: "image/png" },
        });
        const sha = sha256(Buffer.from("x"));
        await store.put(Buffer.from("x"));
        await db.evidence.create({ data: { sha256: sha, size: 1, mimeType: "image/png" } });
        await db.findingEvidence.create({ data: { reportFindingId: finding.id, evidenceSha: sha, title: "old", caption: "", legacyImageId: old.id } });
        assert.equal((await call("DELETE", `/${old.id}`)).status, 200);
        assert.equal(await db.findingImage.count(), 0);
        assert.equal(await db.findingEvidence.count(), 0);
        assert.equal((await db.evidenceCustodyEvent.findFirst({ orderBy: { id: "desc" } })).action, "DETACHED");
    });

    test("an unknown id is a 404, not a 500", async () => {
        assert.equal((await call("PUT", "/nope", { title: "x" })).status, 404);
        assert.equal((await call("DELETE", "/nope")).status, 404);
    });

    test("uploads are still validated", async () => {
        assert.equal((await upload(Buffer.from("x"), { imageData: "%%%" })).status, 400);
        assert.equal((await upload(Buffer.from("x"), { mimeType: "text/html" })).status, 400);
        assert.equal((await upload(Buffer.from("x"), { reportFindingId: "nope" })).status, 404);
        assert.equal(await db.evidence.count(), 0);
    });
});
