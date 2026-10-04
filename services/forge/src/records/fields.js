/**
 * Validation for engagement record fields (see router.js). Kept apart from
 * the routes so it can be used, and tested, without the HTTP layer.
 */

export class FieldError extends Error {
    constructor(field, message) {
        super(`${field}: ${message}`);
        this.field = field;
    }
}

// VARCHAR(191) is Prisma's MySQL default for String; TEXT holds 65,535 bytes.
const LIMITS = { string: 191, text: 60000 };

/**
 * One field's value, normalised, or `undefined` when absent. Field kinds:
 * string, text (trimmed; blank is null), datetime (ISO 8601 or anything Date
 * parses), enum (one of `values`).
 */
export function readField(name, spec, raw) {
    if (raw === undefined) return undefined;
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        if (spec.required) throw new FieldError(name, "is required");
        return null;
    }
    switch (spec.type) {
        case "string":
        case "text": {
            if (typeof raw !== "string") throw new FieldError(name, "must be text");
            const value = raw.trim();
            const max = spec.max ?? LIMITS[spec.type];
            if (value.length > max) throw new FieldError(name, `is longer than ${max} characters`);
            return value;
        }
        case "datetime": {
            const d = new Date(raw);
            if (Number.isNaN(d.getTime())) throw new FieldError(name, `is not a date: ${JSON.stringify(raw)}`);
            return d;
        }
        case "enum":
            if (!spec.values.includes(raw)) throw new FieldError(name, `must be one of ${spec.values.join(", ")}`);
            return raw;
        default:
            throw new Error(`unknown field type ${spec.type}`);
    }
}

/** The body's declared fields, validated. `partial` skips absent required fields (updates). */
export function readFields(fields, body, { partial = false } = {}) {
    const data = {};
    for (const [name, spec] of Object.entries(fields)) {
        let value = readField(name, spec, body?.[name]);
        if (value === undefined && !partial) {
            if (spec.required) throw new FieldError(name, "is required");
            value = spec.default;
        }
        if (value !== undefined) data[name] = value;
    }
    return data;
}
