/**
 * Report payload builder.
 *
 * Turns the { report, engagement } body that satellite posts to /generate into
 * a self-contained, renderer-neutral JSON document described by
 * schema/report-payload.schema.json.
 *
 * The payload is plain data: dates are ISO 8601 strings, enums keep their
 * database spelling, and nothing is pre-formatted or pre-counted. Presentation
 * (date formats, severity totals, numbering) belongs to whichever template
 * consumes it. Finding images are split out as separate assets and referenced
 * by relative path, so the payload stays small and readable.
 *
 * buildPayload is pure: it never mutates its input and, given the same input
 * and `now`, always returns the same result.
 */

export const PAYLOAD_SCHEMA_VERSION = 1;

const SECTION_TYPES = new Set(["FINDING", "CONNECTIVITY", "CUSTOM"]);
const SEVERITIES = new Set(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const IMAGE_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
};

/** Raised when the input cannot be turned into a valid payload. `path` locates the bad field. */
export class PayloadError extends Error {
    constructor(path, message) {
        super(`${path}: ${message}`);
        this.name = "PayloadError";
        this.path = path;
    }
}

/**
 * @param {{ report: object, engagement: object }} input  the /generate request body
 * @param {{ now?: Date }} [options]  `now` fixes generatedAt, for reproducible output
 * @returns {{ payload: object, assets: Array<{ path: string, mimeType: string, data: Buffer }> }}
 */
export function buildPayload({ report, engagement }, { now = new Date() } = {}) {
    if (!isObject(report)) throw new PayloadError("report", "is required");
    if (!isObject(engagement)) throw new PayloadError("engagement", "is required");

    const assets = [];
    const findings = [];
    const sections = [];

    orderSections(report.sections).forEach(({ section, index }) => {
        const at = `report.sections[${index}]`;
        const type = typeof section.type === "string" ? section.type.toUpperCase() : section.type;
        if (!SECTION_TYPES.has(type)) {
            throw new PayloadError(`${at}.type`, `unknown section type ${JSON.stringify(section.type)}`);
        }

        if (type === "FINDING") {
            // A finding section whose finding has been deleted has nothing to show.
            if (!isObject(section.reportFinding)) return;
            const id = String(section.reportFinding.id ?? "");
            // Two sections may point at one finding; list it once.
            if (!findings.some((f) => f.id === id)) {
                findings.push(buildFinding(section.reportFinding, `${at}.reportFinding`, assets));
            }
            sections.push({ type: "FINDING", findingId: id });
        } else {
            sections.push({ type, title: text(section.title), content: text(section.content) });
        }
    });

    const payload = {
        schemaVersion: PAYLOAD_SCHEMA_VERSION,
        generatedAt: now.toISOString(),
        report: {
            id: String(report.id ?? ""),
            title: text(report.title) ?? "",
            classification: text(report.classification) ?? "CONFIDENTIAL",
            version: text(report.version) ?? "1.0",
            createdAt: date(report.createdAt, "report.createdAt"),
            updatedAt: date(report.updatedAt, "report.updatedAt"),
            executiveSummary: text(report.executiveSummary),
            methodology: text(report.methodology),
            toolsAndTechniques: text(report.toolsAndTechniques),
            conclusion: text(report.conclusion),
        },
        engagement: buildEngagement(engagement),
        sections,
        findings,
    };

    return { payload, assets };
}

function buildEngagement(engagement) {
    // forge returns the customer both nested and flattened (the flat fields are
    // kept for backward compatibility); prefer the nested copy.
    const customer = isObject(engagement.customer) ? engagement.customer : {};
    const pick = (field) => text(customer[field]) ?? text(engagement[field]);

    const contact = {
        name: pick("contactName"),
        title: pick("contactTitle"),
        email: pick("contactEmail"),
        phone: pick("contactPhone"),
    };

    return {
        id: String(engagement.id ?? ""),
        name: text(engagement.name) ?? "",
        type: text(engagement.type),
        methodology: text(engagement.methodology),
        status: text(engagement.status),
        startDate: date(engagement.startDate, "engagement.startDate"),
        endDate: date(engagement.endDate, "engagement.endDate"),
        organization: text(engagement.organization),
        customer: {
            name: text(customer.name) ?? text(engagement.customerName) ??
                (typeof engagement.customer === "string" ? text(engagement.customer) : null),
            contact: contact.name || contact.email || contact.phone ? contact : null,
        },
        scope: list(engagement.scopes).filter(isObject).map((scope) => ({
            address: text(scope.address) ?? "",
            description: text(scope.description),
            notes: text(scope.notes),
            inScope: scope.inScope !== false,
            assetType: text(scope.assetType),
            environment: text(scope.environment),
            criticality: text(scope.criticality),
        })),
    };
}

function buildFinding(finding, at, assets) {
    const severity = typeof finding.severity === "string" ? finding.severity.toUpperCase() : finding.severity;
    if (!SEVERITIES.has(severity)) {
        throw new PayloadError(`${at}.severity`, `unknown severity ${JSON.stringify(finding.severity)}`);
    }
    const id = String(finding.id ?? "");

    return {
        id,
        title: text(finding.title) ?? "",
        severity,
        description: text(finding.description),
        impact: text(finding.impact),
        recommendation: text(finding.recommendation),
        references: text(finding.reference) ? [finding.reference.trim()] : [],
        tags: strings(finding.tags),
        affectedSystems: strings(finding.affectedSystems),
        images: list(finding.images).filter(isObject).map((image, i) => buildImage(image, id, `${at}.images[${i}]`, assets)),
    };
}

function buildImage(image, findingId, at, assets) {
    const mimeType = String(image.mimeType ?? "").toLowerCase();
    const extension = IMAGE_EXTENSIONS[mimeType];
    if (!extension) {
        throw new PayloadError(`${at}.mimeType`, `unsupported image type ${JSON.stringify(image.mimeType)}`);
    }
    // Stored as bare base64; tolerate a data: URI prefix as well.
    const base64 = String(image.imageData ?? "").replace(/^data:[^,]*,/, "");
    const data = Buffer.from(base64, "base64");
    if (data.length === 0) throw new PayloadError(`${at}.imageData`, "is empty");

    const name = safeName(image.id) || `${safeName(findingId) || "finding"}-${assets.length + 1}`;
    const path = `images/${name}.${extension}`;
    assets.push({ path, mimeType, data });

    return { id: String(image.id ?? ""), title: text(image.title), caption: text(image.caption), path };
}

/** Sections in the order the report writer shows them: position, then creation time. */
function orderSections(sections) {
    return list(sections)
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => isObject(section))
        .sort((a, b) =>
            num(a.section.position) - num(b.section.position) ||
            time(a.section.createdAt) - time(b.section.createdAt) ||
            a.index - b.index);
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function list(value) {
    return Array.isArray(value) ? value : [];
}

/** A trimmed string, or null when absent or blank. */
function text(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s === "" ? null : s;
}

/** A JSON column holding a list of strings; tolerates a JSON-encoded string. */
function strings(value) {
    let v = value;
    if (typeof v === "string") {
        try { v = JSON.parse(v); } catch { v = [v]; }
    }
    return list(v).map(text).filter((s) => s !== null);
}

function date(value, at) {
    if (value === null || value === undefined || value === "") return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new PayloadError(at, `is not a date: ${JSON.stringify(value)}`);
    return d.toISOString();
}

function num(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function time(value) {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function safeName(value) {
    return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "");
}
