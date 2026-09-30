import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import Ajv2020 from "ajv/dist/2020.js";
import { buildPayload, PayloadError, PAYLOAD_SCHEMA_VERSION } from "../src/payload/buildPayload.js";
import { FIXTURES_DIR, FIXTURE_NOW, buildFixture, fixtureNames } from "./fixtures/index.js";

const schema = JSON.parse(fs.readFileSync(new URL("../schema/report-payload.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

function assertValid(payload) {
    const ok = validate(payload);
    assert.ok(ok, JSON.stringify(validate.errors, null, 2));
}

function minimalInput() {
    return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, "minimal", "request.json"), "utf8"));
}

function finding(overrides = {}) {
    return {
        id: "f1", title: "A finding", severity: "HIGH",
        description: "d", impact: "i", recommendation: "r",
        reference: null, tags: [], affectedSystems: [], images: [],
        ...overrides,
    };
}

function withSections(sections) {
    const input = minimalInput();
    input.report.sections = sections;
    return input;
}

describe("fixtures", () => {
    for (const name of fixtureNames()) {
        test(`${name}: payload.json and images/ are up to date (npm run fixtures)`, () => {
            const dir = path.join(FIXTURES_DIR, name);
            const { json, assets } = buildFixture(name);
            assert.equal(fs.readFileSync(path.join(dir, "payload.json"), "utf8"), json);

            const committed = fs.existsSync(path.join(dir, "images"))
                ? fs.readdirSync(path.join(dir, "images")).map((f) => `images/${f}`).sort()
                : [];
            assert.deepEqual(committed, assets.map((a) => a.path).sort());
            for (const asset of assets) {
                assert.ok(fs.readFileSync(path.join(dir, asset.path)).equals(asset.data), asset.path);
            }
        });

        test(`${name}: payload matches the schema`, () => {
            assertValid(buildFixture(name).payload);
        });
    }

    test("the schema rejects what buildPayload would never produce", () => {
        const { payload } = buildFixture("kitchen-sink");
        const broken = [
            (p) => { p.findings[0].severity = "INFO"; },
            (p) => { p.findings[0].images[0].path = "/etc/passwd"; },
            (p) => { p.report.createdAt = "February 2, 2026"; },
            (p) => { p.sections.push({ type: "FINDING", title: "no id" }); },
            (p) => { p.report.executiveSummary = ""; },
            (p) => { p.engagement.extra = true; },
        ];
        for (const breakIt of broken) {
            const p = structuredClone(payload);
            breakIt(p);
            assert.equal(validate(p), false, breakIt.toString());
        }
    });
});

describe("buildPayload", () => {
    test("stamps the schema version and the given time", () => {
        const { payload } = buildPayload(minimalInput(), { now: FIXTURE_NOW });
        assert.equal(payload.schemaVersion, PAYLOAD_SCHEMA_VERSION);
        assert.equal(payload.generatedAt, "2026-03-01T12:00:00.000Z");
    });

    test("does not mutate its input", () => {
        const { request } = buildFixture("kitchen-sink");
        const before = structuredClone(request);
        buildPayload(request, { now: FIXTURE_NOW });
        assert.deepEqual(request, before);
    });

    test("orders sections by position, then creation time", () => {
        const { payload } = buildPayload(withSections([
            { type: "CUSTOM", position: 2, title: "c", createdAt: "2026-01-01T00:00:00Z" },
            { type: "CUSTOM", position: 1, title: "b", createdAt: "2026-01-02T00:00:00Z" },
            { type: "CUSTOM", position: 1, title: "a", createdAt: "2026-01-01T00:00:00Z" },
        ]));
        assert.deepEqual(payload.sections.map((s) => s.title), ["a", "b", "c"]);
    });

    test("lists findings in section order and references them by id", () => {
        const { payload } = buildPayload(withSections([
            { type: "FINDING", position: 1, reportFinding: finding({ id: "second" }) },
            { type: "FINDING", position: 0, reportFinding: finding({ id: "first" }) },
        ]));
        assert.deepEqual(payload.findings.map((f) => f.id), ["first", "second"]);
        assert.deepEqual(payload.sections, [
            { type: "FINDING", findingId: "first" },
            { type: "FINDING", findingId: "second" },
        ]);
    });

    test("lists a finding once when two sections refer to it", () => {
        const { payload } = buildPayload(withSections([
            { type: "FINDING", position: 0, reportFinding: finding() },
            { type: "FINDING", position: 1, reportFinding: finding() },
        ]));
        assert.equal(payload.findings.length, 1);
        assert.equal(payload.sections.length, 2);
    });

    test("drops a finding section whose finding is gone", () => {
        const { payload } = buildPayload(withSections([{ type: "FINDING", position: 0, reportFinding: null }]));
        assert.deepEqual(payload.sections, []);
        assert.deepEqual(payload.findings, []);
    });

    test("accepts lower-case section types and severities", () => {
        const { payload } = buildPayload(withSections([
            { type: "finding", position: 0, reportFinding: finding({ severity: "low" }) },
        ]));
        assert.equal(payload.sections[0].type, "FINDING");
        assert.equal(payload.findings[0].severity, "LOW");
    });

    test("turns blank text into null and trims the rest", () => {
        const input = minimalInput();
        input.report.executiveSummary = "   ";
        input.report.conclusion = "  Done.  ";
        input.report.title = "  Title  ";
        const { payload } = buildPayload(input);
        assert.equal(payload.report.executiveSummary, null);
        assert.equal(payload.report.title, "Title");
        assert.deepEqual(payload.report.conclusion, [{ type: "paragraph", children: [{ type: "text", text: "Done." }] }]);
    });

    test("parses operator prose as Markdown and leaves titles as plain text", () => {
        const { payload } = buildPayload(withSections([
            { type: "CUSTOM", position: 0, title: "**not bold**", content: "**bold**" },
            { type: "FINDING", position: 1, reportFinding: finding({ title: "*t*", impact: "*i*" }) },
        ]));
        assert.equal(payload.sections[0].title, "**not bold**");
        assert.equal(payload.sections[0].content[0].children[0].type, "strong");
        assert.equal(payload.findings[0].title, "*t*");
        assert.equal(payload.findings[0].impact[0].children[0].type, "emphasis");
    });

    test("keeps markup characters as plain text", () => {
        const title = "XSS in #search <script>alert(1)</script> $x *y* _z_";
        const { payload } = buildPayload(withSections([
            { type: "FINDING", position: 0, reportFinding: finding({ title }) },
        ]));
        assert.equal(payload.findings[0].title, title);
    });

    test("normalises dates to ISO 8601 UTC", () => {
        const input = minimalInput();
        input.engagement.startDate = "2026-01-05";
        input.engagement.endDate = "";
        const { payload } = buildPayload(input);
        assert.equal(payload.engagement.startDate, "2026-01-05T00:00:00.000Z");
        assert.equal(payload.engagement.endDate, null);
    });

    test("reads JSON columns stored as strings", () => {
        const { payload } = buildPayload(withSections([
            { type: "FINDING", position: 0, reportFinding: finding({ tags: '["a", " ", "b"]', affectedSystems: "host-1" }) },
        ]));
        assert.deepEqual(payload.findings[0].tags, ["a", "b"]);
        assert.deepEqual(payload.findings[0].affectedSystems, ["host-1"]);
    });

    test("falls back to the flat customer fields", () => {
        const input = minimalInput();
        delete input.engagement.customer;
        input.engagement.customerName = "Flat Co";
        input.engagement.contactName = "Sam";
        const { payload } = buildPayload(input);
        assert.equal(payload.engagement.customer.name, "Flat Co");
        assert.equal(payload.engagement.customer.contact.name, "Sam");
        assertValid(payload);
    });

    test("has no contact when none is known", () => {
        const { payload } = buildPayload(minimalInput());
        assert.equal(payload.engagement.customer.contact, null);
    });

    test("splits images out as assets referenced by path", () => {
        const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        const { payload, assets } = buildPayload(withSections([{
            type: "FINDING", position: 0, reportFinding: finding({
                images: [
                    { id: "img-1", title: "t", caption: "c", mimeType: "image/png", imageData: png },
                    { id: "../../etc/passwd", title: "t", caption: "", mimeType: "image/jpeg", imageData: `data:image/jpeg;base64,${png}` },
                ],
            }),
        }]));
        assert.deepEqual(payload.findings[0].images.map((i) => i.path), ["images/img-1.png", "images/etcpasswd.jpg"]);
        assert.equal(payload.findings[0].images[1].caption, null);
        assert.equal(assets.length, 2);
        assert.ok(assets[0].data.equals(Buffer.from(png, "base64")));
        assert.ok(assets[1].data.equals(Buffer.from(png, "base64")));
        assertValid(payload);
    });

    describe("rejects input it cannot represent, naming the field", () => {
        const cases = [
            ["a missing report", { engagement: {} }, "report"],
            ["a missing engagement", { report: {} }, "engagement"],
            ["an unknown section type", withSections([{ type: "APPENDIX", position: 0 }]), "report.sections[0].type"],
            ["an unknown severity",
                withSections([{ type: "FINDING", position: 0, reportFinding: finding({ severity: "INFO" }) }]),
                "report.sections[0].reportFinding.severity"],
            ["an unsupported image type",
                withSections([{ type: "FINDING", position: 0, reportFinding: finding({ images: [{ id: "x", mimeType: "image/bmp", imageData: "AAAA" }] }) }]),
                "report.sections[0].reportFinding.images[0].mimeType"],
            ["an empty image",
                withSections([{ type: "FINDING", position: 0, reportFinding: finding({ images: [{ id: "x", mimeType: "image/png", imageData: "" }] }) }]),
                "report.sections[0].reportFinding.images[0].imageData"],
        ];
        for (const [what, input, where] of cases) {
            test(what, () => {
                assert.throws(() => buildPayload(input), (err) => err instanceof PayloadError && err.path === where);
            });
        }

        test("an unparseable date", () => {
            const input = minimalInput();
            input.report.createdAt = "last Tuesday";
            assert.throws(() => buildPayload(input), (err) => err instanceof PayloadError && err.path === "report.createdAt");
        });
    });
});
