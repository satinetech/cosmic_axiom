import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAuthConfig } from '../src/auth/config.js';

test('defaults to local mode when nothing is set', () => {
    // The guarantee that matters for an existing deployment: set none of these
    // variables and nothing changes.
    assert.deepEqual(loadAuthConfig({}), { mode: 'local' });
});

test('local mode ignores the rest of the configuration', () => {
    const cfg = loadAuthConfig({ AUTH_MODE: 'local', TRUSTED_PROXIES: 'nonsense', AUTH_HEADER_USER: '' });
    assert.deepEqual(cfg, { mode: 'local' });
});

test('rejects an unknown mode rather than falling back to one', () => {
    assert.throws(() => loadAuthConfig({ AUTH_MODE: 'header' }), /AUTH_MODE must be one of/);
    assert.throws(() => loadAuthConfig({ AUTH_MODE: 'TRUSTED-HEADER' }), /AUTH_MODE must be one of/);
});

test('trusted-header mode refuses to start without an allowlist', () => {
    assert.throws(
        () => loadAuthConfig({ AUTH_MODE: 'trusted-header', AUTH_HEADER_USER: 'x-forwarded-user' }),
        /requires TRUSTED_PROXIES/,
    );
    assert.throws(
        () => loadAuthConfig({ AUTH_MODE: 'trusted-header', TRUSTED_PROXIES: '  ', AUTH_HEADER_USER: 'x-forwarded-user' }),
        /requires TRUSTED_PROXIES/,
    );
});

test('trusted-header mode refuses to start on a malformed allowlist', () => {
    assert.throws(
        () => loadAuthConfig({ AUTH_MODE: 'trusted-header', TRUSTED_PROXIES: '10.0.0.0/99', AUTH_HEADER_USER: 'x' }),
        /requires TRUSTED_PROXIES/,
    );
});

test('trusted-header mode refuses to guess the header name', () => {
    assert.throws(
        () => loadAuthConfig({ AUTH_MODE: 'trusted-header', TRUSTED_PROXIES: '10.0.0.0/8' }),
        /requires AUTH_HEADER_USER/,
    );
});

test('lower-cases header names, because node lower-cases incoming headers', () => {
    const cfg = loadAuthConfig({
        AUTH_MODE: 'trusted-header',
        TRUSTED_PROXIES: '10.0.0.0/8',
        AUTH_HEADER_USER: 'X-Forwarded-User',
        AUTH_HEADER_NAME: 'X-Forwarded-Preferred-Username',
    });
    assert.equal(cfg.userHeader, 'x-forwarded-user');
    assert.equal(cfg.nameHeader, 'x-forwarded-preferred-username');
});

test('JIT provisioning is off unless it is turned on explicitly', () => {
    const base = { AUTH_MODE: 'trusted-header', TRUSTED_PROXIES: '10.0.0.0/8', AUTH_HEADER_USER: 'x' };
    assert.equal(loadAuthConfig(base).jitProvision, false);
    for (const v of ['false', 'FALSE', '1', 'yes', 'on', '']) {
        assert.equal(loadAuthConfig({ ...base, AUTH_JIT_PROVISION: v }).jitProvision, false, `'${v}' must not enable it`);
    }
    assert.equal(loadAuthConfig({ ...base, AUTH_JIT_PROVISION: 'true' }).jitProvision, true);
    assert.equal(loadAuthConfig({ ...base, AUTH_JIT_PROVISION: 'TRUE' }).jitProvision, true);
});

test('the default provisioned role is the least privileged one', () => {
    const cfg = loadAuthConfig({ AUTH_MODE: 'trusted-header', TRUSTED_PROXIES: '10.0.0.0/8', AUTH_HEADER_USER: 'x' });
    assert.equal(cfg.defaultRole, 'PENTESTER');
});
