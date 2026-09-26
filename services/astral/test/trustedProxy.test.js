import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTrustedProxies, isTrustedPeer, normalizeAddress } from '../src/auth/trustedProxy.js';

const allow = (raw) => parseTrustedProxies(raw);

test('matches a bare address exactly', () => {
    const list = allow('172.18.0.5');
    assert.equal(isTrustedPeer('172.18.0.5', list), true);
    assert.equal(isTrustedPeer('172.18.0.6', list), false);
});

test('matches inside a CIDR and not outside it', () => {
    const list = allow('172.18.0.0/16');
    assert.equal(isTrustedPeer('172.18.0.1', list), true);
    assert.equal(isTrustedPeer('172.18.255.254', list), true);
    assert.equal(isTrustedPeer('172.19.0.1', list), false);
    assert.equal(isTrustedPeer('172.17.255.255', list), false);
});

test('gets the boundaries of a /24 right', () => {
    const list = allow('10.1.2.0/24');
    assert.equal(isTrustedPeer('10.1.2.0', list), true);
    assert.equal(isTrustedPeer('10.1.2.255', list), true);
    assert.equal(isTrustedPeer('10.1.1.255', list), false);
    assert.equal(isTrustedPeer('10.1.3.0', list), false);
});

test('handles the high half of the address space without sign trouble', () => {
    // A 32-bit shift in JS is signed, so 255.x without an unsigned coercion
    // compares negative and silently matches nothing -- or everything.
    const list = allow('255.255.0.0/16');
    assert.equal(isTrustedPeer('255.255.1.1', list), true);
    assert.equal(isTrustedPeer('255.254.1.1', list), false);

    const wide = allow('128.0.0.0/1');
    assert.equal(isTrustedPeer('200.1.2.3', wide), true);
    assert.equal(isTrustedPeer('127.255.255.255', wide), false);
});

test('treats an IPv4-mapped IPv6 peer as the IPv4 address', () => {
    // Node hands these out on a dual-stack socket, so a rule written in IPv4
    // has to match one.
    const list = allow('172.18.0.0/16');
    assert.equal(isTrustedPeer('::ffff:172.18.0.5', list), true);
    assert.equal(isTrustedPeer('::ffff:10.0.0.1', list), false);
    assert.equal(normalizeAddress('::FFFF:172.18.0.5'), '172.18.0.5');
});

test('matches a literal IPv6 address, case-insensitively', () => {
    const list = allow('::1, fd00:abcd::5');
    assert.equal(isTrustedPeer('::1', list), true);
    assert.equal(isTrustedPeer('FD00:ABCD::5', list), true);
    assert.equal(isTrustedPeer('fd00:abcd::6', list), false);
});

test('accepts a list and trims whitespace', () => {
    const list = allow('  10.0.0.0/8 ,172.18.0.5,  ::1  ');
    assert.equal(isTrustedPeer('10.9.9.9', list), true);
    assert.equal(isTrustedPeer('172.18.0.5', list), true);
    assert.equal(isTrustedPeer('::1', list), true);
    assert.equal(isTrustedPeer('192.168.1.1', list), false);
});

test('refuses to build an empty allowlist', () => {
    // An empty list must be a configuration error, not a quiet trust-nobody or
    // -- with one sign flipped somewhere -- a quiet trust-everybody.
    for (const raw of ['', '   ', ',,', undefined, null]) {
        assert.throws(() => parseTrustedProxies(raw), /No trusted proxies/);
    }
});

test('rejects malformed entries rather than ignoring them', () => {
    for (const raw of ['10.0.0.300', '10.0.0.1/33', '10.0.0.1/-1', 'not-an-address',
                       '10.0.0.1/8/8', '10.0.1', '10.0.0.010']) {
        assert.throws(() => parseTrustedProxies(raw), undefined, `should reject ${raw}`);
    }
});

test('refuses an unknown or missing peer address', () => {
    const list = allow('10.0.0.0/8');
    for (const peer of [undefined, null, '', '   ', 'garbage']) {
        assert.equal(isTrustedPeer(peer, list), false);
    }
});

test('refuses when the allowlist itself is missing or empty', () => {
    for (const list of [undefined, null, []]) {
        assert.equal(isTrustedPeer('10.0.0.1', list), false);
    }
});

test('/0 means everything, and only when written explicitly', () => {
    assert.equal(isTrustedPeer('8.8.8.8', allow('0.0.0.0/0')), true);
    assert.equal(isTrustedPeer('8.8.8.8', allow('10.0.0.0/8')), false);
});
