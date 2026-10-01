// Golden page images for the Typst template; see test/golden/index.js.
// Skipped when typst is missing, or is not the version the images were made with.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fixtureNames } from "./fixtures/index.js";
import { GOLDEN_DIR, goldenTypstVersion, installedTypstVersion, pngs, renderPages } from "./golden/index.js";

const installed = installedTypstVersion();
const expected = goldenTypstVersion();
const skip = !installed
    ? "typst not found (set TYPST_BIN)"
    : installed !== expected
        ? `golden images were made with typst ${expected}, but ${installed} is installed`
        : false;

describe(`golden pages (typst ${expected})`, { skip }, () => {
    for (const fixture of fixtureNames()) {
        test(fixture, () => {
            const golden = path.join(GOLDEN_DIR, fixture);
            const rendered = renderPages(fixture);
            const actualDir = path.join(golden, ".actual");
            fs.rmSync(actualDir, { recursive: true, force: true });
            try {
                const want = pngs(golden);
                const got = pngs(rendered);
                const differing = [...new Set([...want, ...got])].filter((page) =>
                    !want.includes(page) || !got.includes(page) ||
                    !fs.readFileSync(path.join(golden, page)).equals(fs.readFileSync(path.join(rendered, page))));

                if (differing.length > 0) {
                    // Keep what was rendered beside the goldens, for comparison.
                    fs.cpSync(rendered, actualDir, { recursive: true });
                    assert.fail(
                        `${fixture}: ${differing.join(", ")} differ from the golden images ` +
                        `(${want.length} expected page(s), ${got.length} rendered).\n` +
                        `The rendered pages are in ${path.relative(process.cwd(), actualDir)}/.\n` +
                        "If the change is intended, run `npm run golden` and commit the new images.");
                }
            } finally {
                fs.rmSync(rendered, { recursive: true, force: true });
            }
        });
    }
});
