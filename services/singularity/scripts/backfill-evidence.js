// Copy existing FindingImage rows into the evidence store.
//
//   node scripts/backfill-evidence.js [--dry-run] [--batch N] [--limit N]
//
// Safe to interrupt and re-run: it only ever copies images that have no copy
// yet, and never modifies or deletes a FindingImage. Exits non-zero if any
// image could not be copied; those are listed and left as they were.
import { PrismaClient } from "@prisma/client";
import { EvidenceStore } from "../src/evidence/store.js";
import { backfillImages, countPending } from "../src/evidence/backfill.js";

function option(name, fallback) {
    const i = process.argv.indexOf(name);
    if (i === -1) return fallback;
    const value = Number(process.argv[i + 1]);
    if (!Number.isInteger(value) || value < 1) {
        console.error(`${name} needs a positive whole number`);
        process.exit(2);
    }
    return value;
}

const db = new PrismaClient();
const store = new EvidenceStore();
try {
    const pending = await countPending(db);
    console.log(`${pending} image(s) not yet copied; evidence root ${store.root}`);
    if (!process.argv.includes("--dry-run") && pending > 0) {
        const result = await backfillImages(db, store, {
            batchSize: option("--batch", 50),
            limit: option("--limit", Infinity),
            log: (line) => console.log(line),
        });
        console.log(`done: ${result.copied} copied, ${result.alreadyCopied} already copied, ${result.failed.length} failed; ${await countPending(db)} remaining`);
        for (const f of result.failed) console.log(`  failed ${f.id}: ${f.reason}`);
        process.exitCode = result.failed.length > 0 ? 1 : 0;
    }
} finally {
    await db.$disconnect();
}
