import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeRoles } from '../src/middleware/authorizeRoles.js';

// Minimal stand-ins for what express hands the middleware.
const run = (middleware, req) => {
    let nexted = false;
    const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
    middleware(req, res, () => { nexted = true; });
    return { nexted, status: res.statusCode, body: res.body };
};

test('admits a request whose token carries an allowed role', () => {
    const r = run(authorizeRoles('ADMIN'), { tokenPayload: { role: 'ADMIN' } });
    assert.equal(r.nexted, true);
});

test('accepts the array spelling as well as the variadic one', () => {
    // apikeys.js called it this way, which the previous signature turned into
    // [['admin']] -- a list containing a list, matching nothing.
    const r = run(authorizeRoles(['ADMIN', 'PENTEST LEAD']), { tokenPayload: { role: 'PENTEST LEAD' } });
    assert.equal(r.nexted, true);
});

test('refuses a role that is not allowed', () => {
    const r = run(authorizeRoles('ADMIN'), { tokenPayload: { role: 'PENTESTER' } });
    assert.equal(r.nexted, false);
    assert.equal(r.status, 403);
});

test('refuses, rather than throwing, when the request carries no token payload', () => {
    // The previous version read req.user, which authenticateRequest never sets,
    // so this threw a TypeError and express turned it into a 500 -- for every
    // caller including a legitimate admin.
    const r = run(authorizeRoles('ADMIN'), {});
    assert.equal(r.nexted, false);
    assert.equal(r.status, 403, 'a gate that cannot see a role must refuse, not crash');
});

test('refuses when the payload has no role at all', () => {
    const r = run(authorizeRoles('ADMIN'), { tokenPayload: { sub: 'u1' } });
    assert.equal(r.nexted, false);
    assert.equal(r.status, 403);
});
