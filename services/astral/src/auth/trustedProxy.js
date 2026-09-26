/**
 * Which network peers are allowed to assert an identity.
 *
 * Forward-auth has no cryptographic component. An identity header is
 * trustworthy only because of WHERE IT CAME FROM: an authenticating proxy that
 * sets it on every request it forwards, overwriting anything the client sent.
 * The moment something else can reach this service directly, that something
 * sends the header itself and is whoever it likes.
 *
 * So the peer is checked, per request, against an explicit allowlist. Per
 * request rather than once at startup, because the deployment can change under
 * a running process and a check that ran once is a check that has stopped
 * being true.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4ToInt(address) {
    const m = IPV4.exec(address);
    if (!m) return null;

    let value = 0;
    for (let i = 1; i <= 4; i += 1) {
        const octet = Number(m[i]);
        // Number('01') is 1, so a leading zero would silently pass. Reject the
        // ambiguous spelling instead: 010 is 8 to some parsers and 10 to others.
        if (!Number.isInteger(octet) || octet < 0 || octet > 255 || m[i] !== String(octet)) return null;
        value = (value * 256) + octet;
    }
    return value;
}

/**
 * An IPv4-mapped IPv6 address is the same host as the IPv4 one. Node hands
 * these out routinely on a dual-stack socket, so `::ffff:172.18.0.5` has to
 * match a rule written as `172.18.0.0/16`.
 */
export function normalizeAddress(address) {
    if (typeof address !== 'string') return null;
    const value = address.trim().toLowerCase();
    if (value === '') return null;
    if (value.startsWith('::ffff:')) {
        const mapped = value.slice(7);
        return IPV4.test(mapped) ? mapped : value;
    }
    return value;
}

function parseEntry(entry) {
    // IPv6 is matched literally rather than by prefix. A correct IPv6 CIDR
    // implementation is a lot of code for a case that does not arise here --
    // the trusted peer is a proxy on a container network -- and a subtly wrong
    // one would be worse than none.
    if (entry.includes(':')) {
        return { kind: 'literal', value: entry.toLowerCase() };
    }

    const [addressPart, bitsPart, ...rest] = entry.split('/');
    if (rest.length > 0) throw new Error(`Not a valid address or CIDR: '${entry}'`);

    const base = ipv4ToInt(addressPart);
    if (base === null) throw new Error(`Not a valid address or CIDR: '${entry}'`);

    if (bitsPart === undefined) return { kind: 'cidr', base, mask: 0xffffffff };

    const bits = Number(bitsPart);
    if (!Number.isInteger(bits) || bits < 0 || bits > 32 || bitsPart !== String(bits)) {
        throw new Error(`Prefix length must be 0-32: '${entry}'`);
    }

    // >>> 0 keeps this unsigned; a /0 shift of 32 is a no-op in JS, hence the
    // explicit case.
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return { kind: 'cidr', base: (base & mask) >>> 0, mask };
}

/**
 * Parse the allowlist. Throws rather than returning an empty list, because an
 * empty allowlist in this mode is a misconfiguration that would otherwise trust
 * nobody quietly -- or, with a different bug, everybody.
 */
export function parseTrustedProxies(raw) {
    const entries = String(raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (entries.length === 0) {
        throw new Error('No trusted proxies configured');
    }

    return entries.map(parseEntry);
}

export function isTrustedPeer(address, allowlist) {
    const normalized = normalizeAddress(address);
    if (normalized === null || !Array.isArray(allowlist) || allowlist.length === 0) return false;

    const asInt = ipv4ToInt(normalized);

    return allowlist.some((rule) => {
        if (rule.kind === 'literal') return rule.value === normalized;
        if (asInt === null) return false;
        return ((asInt & rule.mask) >>> 0) === rule.base;
    });
}
