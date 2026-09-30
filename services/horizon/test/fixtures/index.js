// Payload fixtures. Each directory holds request.json (a /generate body as
// satellite sends it) and the payload.json + images/ that buildPayload makes
// from it. The generated files are committed so a template can be compiled
// against them directly; `npm run fixtures` regenerates them, and the tests
// fail if they have drifted.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildPayload } from "../../src/payload/buildPayload.js";

export const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

// Fixed so regenerated fixtures are byte-identical.
export const FIXTURE_NOW = new Date("2026-03-01T12:00:00.000Z");

export function fixtureNames() {
    return fs.readdirSync(FIXTURES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
}

export function buildFixture(name) {
    const request = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name, "request.json"), "utf8"));
    const { payload, assets } = buildPayload(request, { now: FIXTURE_NOW });
    return { request, payload, assets, json: JSON.stringify(payload, null, 2) + "\n" };
}
