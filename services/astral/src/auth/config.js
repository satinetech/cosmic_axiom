import { parseTrustedProxies } from './trustedProxy.js';

/**
 * Authentication mode.
 *
 *   local           Username and password against the User table. The only
 *                   behaviour this service has ever had, and the default, so an
 *                   existing deployment that sets none of these variables is
 *                   unchanged.
 *
 *   trusted-header  An authenticating proxy in front has already established
 *                   who the caller is and says so in a request header.
 *
 * Every misconfiguration here is fatal at startup rather than at the first
 * request. A service whose job is to decide who someone is should not run at
 * all if it cannot state the rule it is deciding by -- and the alternative,
 * discovering it on the first login attempt, means discovering it in
 * production.
 */
export const AUTH_MODES = ['local', 'trusted-header'];

export function loadAuthConfig(env = process.env) {
    const mode = (env.AUTH_MODE ?? 'local').trim();

    if (!AUTH_MODES.includes(mode)) {
        throw new Error(
            `AUTH_MODE must be one of ${AUTH_MODES.join(', ')} (got '${mode}')`,
        );
    }

    if (mode === 'local') {
        return { mode };
    }

    let trustedProxies;
    try {
        trustedProxies = parseTrustedProxies(env.TRUSTED_PROXIES);
    } catch (err) {
        throw new Error(
            `AUTH_MODE=trusted-header requires TRUSTED_PROXIES: ${err.message}. ` +
            'List the address or CIDR of the authenticating proxy, and nothing else -- ' +
            'anything that can reach this service from a listed address can assert any identity.',
        );
    }

    const userHeader = (env.AUTH_HEADER_USER ?? '').trim().toLowerCase();
    if (!userHeader) {
        throw new Error(
            'AUTH_MODE=trusted-header requires AUTH_HEADER_USER, the header your proxy ' +
            "sets the authenticated user in (for example 'X-Forwarded-User', " +
            "'X-Auth-Request-Email' or 'Tailscale-User-Login'). There is deliberately no " +
            'default: guessing this wrong means reading an attacker-supplied header.',
        );
    }

    const nameHeader = (env.AUTH_HEADER_NAME ?? '').trim().toLowerCase() || null;

    // Off by default. The proxy vouches for WHO someone is; it says nothing
    // about whether they should have an account here. Opting in is a decision
    // an operator should make knowingly.
    const jitProvision = (env.AUTH_JIT_PROVISION ?? 'false').trim().toLowerCase() === 'true';
    const defaultRole = (env.AUTH_DEFAULT_ROLE ?? 'PENTESTER').trim();

    return { mode, trustedProxies, userHeader, nameHeader, jitProvision, defaultRole };
}
