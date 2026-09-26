import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSeedUsers, generatePassword, ROLES } from '../src/seed.js';

test('parses a list of username:ROLE pairs', () => {
    assert.deepEqual(parseSeedUsers('alice:ADMIN, bob:PENTESTER'), [
        { username: 'alice', role: 'ADMIN' },
        { username: 'bob', role: 'PENTESTER' },
    ]);
});

test('accepts a role that contains a space', () => {
    assert.deepEqual(parseSeedUsers('carol:PENTEST LEAD'), [
        { username: 'carol', role: 'PENTEST LEAD' },
    ]);
});

test('splits on the LAST colon, so a username containing one survives', () => {
    assert.deepEqual(parseSeedUsers('a:b@example.com:ADMIN'), [
        { username: 'a:b@example.com', role: 'ADMIN' },
    ]);
});

test('is case-insensitive about the role but not the username', () => {
    assert.deepEqual(parseSeedUsers('Alice:admin'), [{ username: 'Alice', role: 'ADMIN' }]);
});

test('an empty or absent list is not an error', () => {
    for (const raw of ['', '   ', ',,', undefined, null]) {
        assert.deepEqual(parseSeedUsers(raw), []);
    }
});

test('rejects an unknown role rather than creating an unusable account', () => {
    // An account whose role no authorization check matches is exactly what this
    // configuration exists to prevent, so a typo has to stop the run.
    assert.throws(() => parseSeedUsers('alice:SUPERUSER'), /Unknown role/);
    assert.throws(() => parseSeedUsers('alice:ADMINS'), /Unknown role/);
});

test('rejects a malformed entry rather than skipping it', () => {
    assert.throws(() => parseSeedUsers('alice'), /username:ROLE/);
    assert.throws(() => parseSeedUsers(':ADMIN'), /username:ROLE/);
    assert.throws(() => parseSeedUsers('alice:'), /Unknown role/);
});

test('every role the application recognises is accepted', () => {
    for (const role of ROLES) {
        assert.deepEqual(parseSeedUsers(`u:${role}`), [{ username: 'u', role }]);
    }
});

test('generated passwords are long, unpredictable and shell-safe', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
        const pw = generatePassword();
        assert.ok(pw.length >= 32, `too short: ${pw.length}`);
        // base64url: no quoting hazards when pasted into a shell or a URL.
        assert.match(pw, /^[A-Za-z0-9_-]+$/);
        seen.add(pw);
    }
    assert.equal(seen.size, 200, 'passwords must not repeat');
});
