/**
 * Typst renderer.
 *
 * Compiles a report payload (see src/payload/buildPayload.js) with a Typst
 * template into a PDF. Each render gets a scratch directory laid out as
 *
 *   templates/  a copy of the templates directory; each template is a
 *               subdirectory whose main.typ is its entry point, and may
 *               import shared files from sibling directories
 *   data/       payload.json and the finding images beside it
 *
 * and Typst runs with that directory as --root, so the template can read
 * nothing outside it. Typst has no network access and cannot run programs,
 * so operator-written content has nowhere to escape to.
 *
 * System fonts are ignored so output does not depend on the host; the fonts
 * embedded in Typst are always available, and TYPST_FONT_PATHS (read by Typst
 * itself) adds more. The PDF creation date is the payload's generatedAt, so
 * the same payload always produces the same bytes.
 */

import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const BUILTIN_TEMPLATES_DIR = path.resolve("templates/typst");
const TEMPLATE_NAME = /^[A-Za-z0-9_-]+$/;

/**
 * Checks that `templatesDir` holds a template called `template` and returns
 * its entry point. Throws an Error that says what is wrong, so a misconfigured
 * deployment fails at startup rather than on the first report.
 */
export function resolveTemplate(templatesDir, template) {
    if (!TEMPLATE_NAME.test(template)) {
        throw new Error(`Typst template name must be letters, digits, "-" or "_", not "${template}"`);
    }
    if (!fs.existsSync(templatesDir) || !fs.statSync(templatesDir).isDirectory()) {
        throw new Error(`Typst templates directory not found: ${templatesDir}`);
    }
    const entry = path.join(templatesDir, template, "main.typ");
    if (!fs.existsSync(entry)) {
        throw new Error(`Typst template "${template}" not found: expected ${entry}`);
    }
    return entry;
}

/** The template failed to compile. `diagnostics` holds Typst's parsed errors. */
export class TypstError extends Error {
    constructor(message, diagnostics = [], output = "") {
        super(message);
        this.name = "TypstError";
        this.diagnostics = diagnostics;
        this.output = output;
    }
}

/**
 * @param {object} options
 * @param {object} options.payload   a report payload
 * @param {Array<{path: string, data: Buffer}>} [options.assets]  files the payload refers to
 * @param {string} options.outputDir
 * @param {string|null} [options.filename]  reuse this name; otherwise a new UUID name
 * @param {string} [options.prefix]
 * @param {string} [options.templatesDir]  a directory of templates
 * @param {string} [options.template]  the subdirectory to compile
 * @param {string} [options.typstBin]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<string>} the PDF's file name within outputDir
 */
export async function renderTypst({
    payload,
    assets = [],
    outputDir,
    filename = null,
    prefix = "",
    templatesDir = BUILTIN_TEMPLATES_DIR,
    template = "report",
    typstBin = process.env.TYPST_BIN || "typst",
    timeoutMs = 60_000,
}) {
    resolveTemplate(templatesDir, template);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "horizon-typst-"));
    try {
        // Dereference symlinks: the copy holds real files, all inside --root.
        fs.cpSync(templatesDir, path.join(work, "templates"), { recursive: true, dereference: true });
        const dataDir = path.join(work, "data");
        fs.mkdirSync(dataDir);
        fs.writeFileSync(path.join(dataDir, "payload.json"), JSON.stringify(payload));
        for (const asset of assets) {
            const target = path.join(dataDir, asset.path);
            if (!target.startsWith(dataDir + path.sep)) throw new Error(`asset path escapes the data directory: ${asset.path}`);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, asset.data);
        }

        const pdf = path.join(work, "out.pdf");
        const args = [
            "compile",
            "--diagnostic-format", "short",
            "--root", work,
            "--ignore-system-fonts",
            "--input", "payload=/data/payload.json",
            ...creationTimestamp(payload.generatedAt),
            path.join(work, "templates", template, "main.typ"),
            pdf,
        ];
        await run(typstBin, args, timeoutMs, work);

        const name = path.basename(filename || `${prefix}${uuidv4()}.pdf`);
        const temp = path.join(outputDir, `temp-${prefix}${uuidv4()}.pdf`);
        fs.copyFileSync(pdf, temp);
        fs.renameSync(temp, path.join(outputDir, name));
        return name;
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

function creationTimestamp(iso) {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? [] : ["--creation-timestamp", String(Math.floor(ms / 1000))];
}

function run(bin, args, timeoutMs, work) {
    return new Promise((resolve, reject) => {
        // Run inside the scratch directory so diagnostics name template/..., not host paths.
        execFile(bin, args, { cwd: work, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (!err) return resolve();
            if (err.code === "ENOENT") {
                return reject(new TypstError(`Typst is not installed (looked for "${bin}"; set TYPST_BIN)`));
            }
            if (err.killed) {
                return reject(new TypstError(`Typst did not finish within ${timeoutMs / 1000}s`));
            }
            const output = String(stderr);
            reject(new TypstError("The report template failed to compile", parseDiagnostics(output), output));
        });
    });
}

/**
 * Parses Typst's short diagnostic format, one problem per line:
 *
 *   templates/report/main.typ:12:3: error: unknown variable: foo
 *
 * Returns [{ severity, message, file, line, column }]; location fields are
 * null for a diagnostic Typst could not place.
 */
export function parseDiagnostics(output) {
    const diagnostics = [];
    for (const line of output.split("\n")) {
        const placed = line.match(/^(.+?):(\d+):(\d+): (error|warning): (.*)$/);
        if (placed) {
            const [, file, row, column, severity, message] = placed;
            diagnostics.push({ severity, message, file, line: Number(row), column: Number(column) });
            continue;
        }
        const unplaced = line.match(/^(error|warning): (.*)$/);
        if (unplaced) {
            diagnostics.push({ severity: unplaced[1], message: unplaced[2], file: null, line: null, column: null });
        }
    }
    return diagnostics;
}
