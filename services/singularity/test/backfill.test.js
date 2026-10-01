// Runs against a real MySQL database, because the backfill is mostly SQL:
//
//   TEST_DATABASE_URL=mysql://user:pass@host:3306/scratch npm test
//
// The database must have the migrations applied (prisma migrate deploy) and
// MUST be disposable: every test empties the report tables. Skipped without it.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { EvidenceStore, sha256 } from "../src/evidence/store.js";
import { backfillImages, countPending } from "../src/evidence/backfill.js";
import { FINDING_IMAGES_INCLUDE, resolveFindingImages } from "../src/evidence/findingImages.js";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "TEST_DATABASE_URL not set";

const bytes = (n) => Buffer.from(`image number ${n}`);

describe("backfillImages", { skip }, () => {
    let db;
    let root;
    let store;
    let finding;

    before(() => { db = new PrismaClient({ datasources: { db: { url } } }); });
    after(() => db?.$disconnect());

    beforeEach(async () => {
        await db.findingEvidence.deleteMany();
        await db.evidenceCustodyEvent.deleteMany();
        await db.evidence.updateMany({ data: { redactedFromSha: null } });
        await db.evidence.deleteMany();
        await db.report.deleteMany(); // cascades sections, findings, images
        root = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-test-"));
        store = new EvidenceStore(root);
        const report = await db.report.create({ data: { engagementId: "e1", title: "R" } });
        finding = await db.reportFinding.create({
            data: { reportId: report.id, title: "F", description: "d", recommendation: "r", impact: "i", severity: "HIGH" },
        });
    });

    async function addImage(n, extra = {}) {
        return db.findingImage.create({
            data: {
                reportFindingId: finding.id, title: `t${n}`, caption: `c${n}`, mimeType: "image/png",
                imageData: bytes(n).toString("base64"), createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)), ...extra,
            },
        });
    }

    test("copies every image across batches, in place, verified", async () => {
        const images = [];
        for (let n = 0; n < 5; n++) images.push(await addImage(n));
        const before = await db.findingImage.findMany({ orderBy: { id: "asc" } });

        const result = await backfillImages(db, store, { batchSize: 2 });
        assert.deepEqual(result, { copied: 5, alreadyCopied: 0, failed: [] });
        assert.equal(await countPending(db), 0);

        for (const [n, image] of images.entries()) {
            const copy = await db.findingEvidence.findUnique({ where: { legacyImageId: image.id } });
            assert.equal(copy.evidenceSha, sha256(bytes(n)));
            assert.equal(copy.position, n);
            assert.equal(copy.caption, `c${n}`);
            assert.ok((await store.get(copy.evidenceSha)).equals(bytes(n)));
            const events = await db.evidenceCustodyEvent.findMany({ where: { evidenceSha: copy.evidenceSha }, orderBy: { id: "asc" } });
            assert.deepEqual(events.map((e) => [e.action, e.observedSha]), [
                ["INGESTED", copy.evidenceSha], ["ATTACHED", copy.evidenceSha],
            ]);
        }
        // FindingImage is left exactly as it was.
        assert.deepEqual(await db.findingImage.findMany({ orderBy: { id: "asc" } }), before);
    });

    test("re-running copies nothing more", async () => {
        for (let n = 0; n < 3; n++) await addImage(n);
        await backfillImages(db, store);
        const again = await backfillImages(db, store);
        assert.deepEqual(again, { copied: 0, alreadyCopied: 0, failed: [] });
        assert.equal(await db.findingEvidence.count(), 3);
    });

    test("an interrupted run resumes where it stopped", async () => {
        for (let n = 0; n < 5; n++) await addImage(n);
        assert.equal((await backfillImages(db, store, { limit: 2 })).copied, 2);
        assert.equal(await countPending(db), 3);
        assert.equal((await backfillImages(db, store)).copied, 3);
        assert.equal(await db.findingEvidence.count(), 5);
    });

    test("identical images share one file", async () => {
        await addImage(1);
        await addImage(1, { title: "same bytes" });
        await backfillImages(db, store);
        assert.equal(await db.evidence.count(), 1);
        assert.equal(await db.findingEvidence.count(), 2);
    });

    test("a bad image is reported and skipped, and the rest are copied", async () => {
        await addImage(0);
        const bad = await addImage(1, { imageData: "%%% not base64 %%%" });
        await addImage(2);
        const result = await backfillImages(db, store);
        assert.equal(result.copied, 2);
        assert.deepEqual(result.failed, [{ id: bad.id, reason: "imageData is not valid base64" }]);
        assert.equal(await countPending(db), 1);
    });

    test("two concurrent runs never copy an image twice", async () => {
        for (let n = 0; n < 8; n++) await addImage(n);
        const [a, b] = await Promise.all([
            backfillImages(db, store, { batchSize: 3 }),
            backfillImages(db, store, { batchSize: 3 }),
        ]);
        assert.equal(await db.findingEvidence.count(), 8);
        assert.deepEqual([...a.failed, ...b.failed], []);
        assert.ok(a.copied + b.copied <= 8 && a.copied + b.copied + a.alreadyCopied + b.alreadyCopied >= 8);
    });

    test("afterwards, reads serve the bytes from disk", async () => {
        await addImage(0);
        await backfillImages(db, store);
        // Corrupt the column: if the shim read it, the result would show it.
        await db.findingImage.updateMany({ data: { imageData: "Q09MVU1O" } });
        const loaded = await db.reportFinding.findUnique({ where: { id: finding.id }, include: FINDING_IMAGES_INCLUDE });
        const { images } = await resolveFindingImages(db, store, loaded);
        assert.equal(images[0].imageData, bytes(0).toString("base64"));
    });
});
