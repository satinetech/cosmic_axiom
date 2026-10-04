// Needs the typst binary (TYPST_BIN, or `typst` on PATH); skipped without it.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { renderTypst, resolveTemplate, parseDiagnostics, TypstError, BUILTIN_TEMPLATES_DIR } from "../src/renderers/typst.js";
import { buildPayload } from "../src/payload/buildPayload.js";
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

/** A throwaway templates directory: { "dir/file.typ": "source", ... }. */
function templatesDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-templates-"));
    for (const [file, source] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), source);
    }
    return dir;
}

async function pages(name) {
    const pdf = await PDFDocument.load(fs.readFileSync(path.join(outputDir, name)));
    return pdf.getPageCount();
}

describe(`typst renderer (${typstVersion ?? "not installed"})`, { skip }, () => {
    for (const fixture of fixtureNames()) {
        test(`renders the ${fixture} fixture`, async () => {
            const { payload, assets } = buildFixture(fixture);
            const template = payload.engagement.profile === "INCIDENT_RESPONSE" ? "ir-report" : "report";
            const name = await renderTypst({ payload, assets, outputDir, typstBin, template });
            assert.match(name, /^[0-9a-f-]{36}\.pdf$/);
            assert.ok(await pages(name) >= 3, "title page, contents and at least one section");
        });
    }

    test("the incident response template renders sparse records", async () => {
        // Everything optional left out: no findings, no conclusion, records with
        // only their required fields.
        const input = JSON.parse(fs.readFileSync(new URL("./fixtures/minimal/request.json", import.meta.url), "utf8"));
        input.engagement.profile = "INCIDENT_RESPONSE";
        input.report.sections = [];
        input.report.conclusion = null;
        input.incident = {
            timeline: [{ occurredAt: "2026-01-01T00:00:00Z", title: "Only a title" }],
            indicators: [
                { type: "OTHER", value: "x" },
                { type: "URL", value: "https://example.com/" + "a".repeat(200), lastSeen: "2026-01-02T00:00:00Z" },
            ],
            assets: [{ kind: "OTHER", identifier: "thing" }],
            decisions: [{ occurredAt: "2026-01-01T00:00:00Z" }],
            actions: [{ occurredAt: "2026-01-01T00:00:00Z" }],
        };
        const { payload, assets } = buildPayload(input);
        const name = await renderTypst({ payload, assets, outputDir, typstBin, template: "ir-report" });
        assert.ok(await pages(name) >= 6, "title, contents, summary, timeline, assets, decisions, appendix");
    });

    test("the incident response template renders an incident with nothing recorded", async () => {
        const input = JSON.parse(fs.readFileSync(new URL("./fixtures/minimal/request.json", import.meta.url), "utf8"));
        input.engagement.profile = "INCIDENT_RESPONSE";
        const { payload, assets } = buildPayload(input);
        const name = await renderTypst({ payload, assets, outputDir, typstBin, template: "ir-report" });
        assert.ok(await pages(name) >= 3);
    });

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
        const dir = templatesDir({ "report/main.typ": "= Title\n#no-such-function()\n" });
        try {
            const { payload } = buildFixture("minimal");
            await assert.rejects(renderTypst({ payload, outputDir, typstBin, templatesDir: dir }), (err) => {
                assert.ok(err instanceof TypstError);
                assert.deepEqual(err.diagnostics[0], {
                    severity: "error", message: "unknown variable: no-such-function",
                    file: "templates/report/main.typ", line: 2, column: 1,
                });
                return true;
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("the template cannot read outside its scratch directory", async () => {
        const dir = templatesDir({ "report/main.typ": '#read("/../../../../etc/hostname")\n' });
        try {
            const { payload } = buildFixture("minimal");
            await assert.rejects(renderTypst({ payload, outputDir, typstBin, templatesDir: dir }), TypstError);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test("renders a template from another directory, importing a shared file", async () => {
        // One page per finding, titled through a function from a sibling directory:
        // proves the payload was read and the import resolved.
        const dir = templatesDir({
            "brand/lib.typ": "#let title(t) = heading(t)\n",
            "per-finding/main.typ":
                '#import "../brand/lib.typ": title\n' +
                '#let data = json(sys.inputs.payload)\n' +
                "#for (i, f) in data.findings.enumerate() {\n" +
                "  if i > 0 { pagebreak() }\n" +
                "  title(f.title)\n" +
                "}\n",
        });
        try {
            const { payload, assets } = buildFixture("kitchen-sink");
            const name = await renderTypst({ payload, assets, outputDir, typstBin, templatesDir: dir, template: "per-finding" });
            assert.equal(await pages(name), payload.findings.length);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
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
        "templates/report/main.typ:3:1: error: unknown variable: foo\n" +
        "templates/report/prose.typ:10:5: warning: unused\n" +
        "error: file not found\n",
    ), [
        { severity: "error", message: "unknown variable: foo", file: "templates/report/main.typ", line: 3, column: 1 },
        { severity: "warning", message: "unused", file: "templates/report/prose.typ", line: 10, column: 5 },
        { severity: "error", message: "file not found", file: null, line: null, column: null },
    ]);
});

describe("resolveTemplate", () => {
    test("finds the built-in incident response template", () => {
        assert.equal(resolveTemplate(BUILTIN_TEMPLATES_DIR, "ir-report"), path.join(BUILTIN_TEMPLATES_DIR, "ir-report", "main.typ"));
    });

    test("finds the built-in report template", () => {
        assert.equal(resolveTemplate(BUILTIN_TEMPLATES_DIR, "report"), path.join(BUILTIN_TEMPLATES_DIR, "report", "main.typ"));
    });

    test("rejects a name that is not a plain directory name", () => {
        for (const name of ["../report", "a/b", "", "."]) {
            assert.throws(() => resolveTemplate(BUILTIN_TEMPLATES_DIR, name), /template name/, name);
        }
    });

    test("says which directory is missing", () => {
        assert.throws(() => resolveTemplate("/nonexistent/templates", "report"), /templates directory not found: \/nonexistent\/templates/);
    });

    test("says which template is missing", () => {
        assert.throws(() => resolveTemplate(BUILTIN_TEMPLATES_DIR, "nope"), /template "nope" not found/);
    });
});
