/**
 * What an indicator value must look like for its type, and its normal form.
 * Kept apart from the routes so it can be used, and tested, on its own.
 */

import { FieldError } from "./fields.js";

export const INDICATOR_TYPES = ["IP", "DOMAIN", "URL", "EMAIL", "HASH_MD5", "HASH_SHA1", "HASH_SHA256", "FILE_NAME", "ACCOUNT", "OTHER"];

/** Undo the usual defanging: hxxp, [.], (.), [dot], [@], [at]. */
export function refang(value) {
    return value
        .replace(/^hxxp(s?):\/\//i, "http$1://")
        .replace(/\[\.\]|\(\.\)|\[dot\]/gi, ".")
        .replace(/\[@\]|\[at\]/gi, "@")
        .replace(/\[:\]/g, ":")
        .trim();
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX = { HASH_MD5: 32, HASH_SHA1: 40, HASH_SHA256: 64 };

function isIp(v) {
    if (IPV4.test(v)) return true;
    // IPv6: hex groups with at most one "::"; the URL parser does the hard part.
    if (!/^[0-9a-f:]+$/i.test(v) || !v.includes(":")) return false;
    try { new URL(`http://[${v}]/`); return true; } catch { return false; }
}

/**
 * The value normalised for its type, or a FieldError saying why it is not one.
 * Exported for the tests and for anything that needs the same rules.
 */
export function normaliseIndicator(type, raw) {
    const v = refang(String(raw));
    switch (type) {
        case "IP":
            if (!isIp(v)) throw new FieldError("value", "is not an IPv4 or IPv6 address");
            return v.toLowerCase();
        case "DOMAIN": {
            const d = v.toLowerCase().replace(/\.$/, "");
            if (!DOMAIN.test(d)) throw new FieldError("value", "is not a domain name");
            return d;
        }
        case "URL":
            try { new URL(v); } catch { throw new FieldError("value", "is not a URL (include the scheme, e.g. https://)"); }
            return v;
        case "EMAIL":
            if (!EMAIL.test(v)) throw new FieldError("value", "is not an email address");
            return v.toLowerCase();
        case "HASH_MD5":
        case "HASH_SHA1":
        case "HASH_SHA256": {
            const h = v.toLowerCase();
            if (!new RegExp(`^[0-9a-f]{${HEX[type]}}$`).test(h)) throw new FieldError("value", `is not a ${HEX[type]}-character hex ${type.slice(5)} hash`);
            return h;
        }
        default:
            return v;
    }
}
