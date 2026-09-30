// Needs the typst binary (TYPST_BIN, or `typst` on PATH); skipped without it.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { renderTypst, parseDiagnostics, TypstError } from "../src/renderers/typst.js";
import { buildFixture, fixtureNames } from "./fixtures/index.js";

const typstBin = process.env.TYPST_BIN || "typst";
let typstVersion = null;
try {
    typstVersion = execFileSync(typstBin, ["--version"], { encoding: "utf8" }).trim();
} catch {
    // not installed
}
const skip = typstVersion ? false : `typst not found (set TYPST_BIN)`;

let outputDir;
before(() => { outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-typst-test-")); });
after(() => fs.rmSync(outputDir, { recursive: true, force: true }));

async function pages(name) {
    const pdf = await PDFDocument.load(fs.readFileSync(path.join(outputDir, name)));
    return pdf.getPageCount();
}

describe(`typst renderer (${typstVersion ?? "not installed"})`, { skip }, () => {
    for (const fixture of fixtureNames()) {
        test(`renders the ${fixture} fixture`, async () => {
            const { payload, assets } = buildFixture(fixture);
            const name = await renderTypst({ payload, assets, outputDir, typstBin });
            assert.match(name, /^[0-9a-f-]{36}\.pdf$/);
            assert.ok(await pages(name) >= 3, "title page, contents and at least one section");
        });
    }

    test("the same payload gives the same bytes", async () => {
        const { payload, assets } = buildFixture("kitchen-sink");
        const a = await renderTypst({ payload, assets, outputDir, typstBin, filename: "a.pdf" });
        const b = await renderTypst({ payload, assets, outputDir, typstBin, filename: "b.pdf" });
        assert.ok(fs.readFileSync(path.join(outputDir, a)).equals(fs.readFileSync(path.join(outputDir, b))));
    });

    test("reuses an existing filename and leaves no temp files", async () => {
        const { payload } = buildFixture("minimal");
        const name = await renderTypst({ payload, outputDir, typstBin, filename: "existing.pdf" });
        assert.equal(name, "existing.pdf");
        assert.deepEqual(fs.readdirSync(outputDir).filter((f) => f.startsWith("temp-")), []);
    });

    test("a broken template raises TypstError with located diagnostics", async () => {
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-typst-bad-"));
        try {
            fs.writeFileSync(path.join(templateDir, "main.typ"), "= Title\n#no-such-function()\n");
            const { payload } = buildFixture("minimal");
            await assert.rejects(renderTypst({ payload, outputDir, typstBin, templateDir }), (err) => {
                assert.ok(err instanceof TypstError);
                assert.deepEqual(err.diagnostics[0], {
                    severity: "error", message: "unknown variable: no-such-function",
                    file: "template/main.typ", line: 2, column: 1,
                });
                return true;
            });
        } finally {
            fs.rmSync(templateDir, { recursive: true, force: true });
        }
    });

    test("the template cannot read outside its scratch directory", async () => {
        const templateDir = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-typst-escape-"));
        try {
            fs.writeFileSync(path.join(templateDir, "main.typ"), '#read("/../../../../etc/hostname")\n');
            const { payload } = buildFixture("minimal");
            await assert.rejects(renderTypst({ payload, outputDir, typstBin, templateDir }), TypstError);
        } finally {
            fs.rmSync(templateDir, { recursive: true, force: true });
        }
    });
});

test("a missing typst binary is reported as such", async () => {
    const { payload } = buildFixture("minimal");
    await assert.rejects(
        renderTypst({ payload, outputDir: os.tmpdir(), typstBin: "/nonexistent/typst" }),
        (err) => err instanceof TypstError && /not installed/.test(err.message),
    );
});

test("parseDiagnostics reads Typst's short format", () => {
    assert.deepEqual(parseDiagnostics(
        "template/main.typ:3:1: error: unknown variable: foo\n" +
        "template/prose.typ:10:5: warning: unused\n" +
        "error: file not found\n",
    ), [
        { severity: "error", message: "unknown variable: foo", file: "template/main.typ", line: 3, column: 1 },
        { severity: "warning", message: "unused", file: "template/prose.typ", line: 10, column: 5 },
        { severity: "error", message: "file not found", file: null, line: null, column: null },
    ]);
});
