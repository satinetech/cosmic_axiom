// Golden page images for the Typst templates.
//
// Each fixture in test/fixtures is compiled with the template horizon would
// pick for it (templates/typst/ir-report for incident response, else
// templates/typst/report) and
// every page is rendered to PNG. The committed PNGs are the expected output:
// a template change shows up in review as an image diff, page by page.
//
// Output depends on the Typst version, so TYPST_VERSION records the one the
// images were made with. `npm run golden` regenerates them with the installed
// Typst.
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { FIXTURE_NOW } from "../fixtures/index.js";

export const GOLDEN_DIR = path.dirname(fileURLToPath(import.meta.url));
const HORIZON_DIR = path.resolve(GOLDEN_DIR, "../..");
export const PPI = 72;

export function typstBin() {
    return process.env.TYPST_BIN || "typst";
}

/** "0.15.1", or null when typst is not installed. */
export function installedTypstVersion() {
    try {
        const out = execFileSync(typstBin(), ["--version"], { encoding: "utf8" });
        return out.match(/typst (\S+)/)?.[1] ?? null;
    } catch {
        return null;
    }
}

export function goldenTypstVersion() {
    return fs.readFileSync(path.join(GOLDEN_DIR, "TYPST_VERSION"), "utf8").trim();
}

/**
 * Renders a fixture's payload.json to page-N.png files in a new temporary
 * directory, exactly as the template documents compiling it standalone.
 * Returns the directory; the caller removes it.
 */
export function renderPages(fixture) {
    const payload = JSON.parse(fs.readFileSync(path.join(HORIZON_DIR, "test/fixtures", fixture, "payload.json"), "utf8"));
    const template = payload.engagement.profile === "INCIDENT_RESPONSE" ? "ir-report" : "report";
    const out = fs.mkdtempSync(path.join(os.tmpdir(), `horizon-golden-${fixture}-`));
    execFileSync(typstBin(), [
        "compile",
        "--root", HORIZON_DIR,
        "--ignore-system-fonts",
        "--creation-timestamp", String(FIXTURE_NOW.getTime() / 1000),
        "--input", `payload=/test/fixtures/${fixture}/payload.json`,
        "--format", "png",
        "--ppi", String(PPI),
        path.join(HORIZON_DIR, "templates/typst", template, "main.typ"),
        path.join(out, "page-{0p}.png"),
    ], { stdio: ["ignore", "ignore", "pipe"] });
    return out;
}

export function pngs(dir) {
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort() : [];
}
