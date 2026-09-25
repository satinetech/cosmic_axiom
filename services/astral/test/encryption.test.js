import assert from 'node:assert/strict';
import test from 'node:test';

// encryption.js resolves its key at IMPORT time, so the environment has to be
// set before the module loads. A static `import` is hoisted and would run first,
// which is why this uses a dynamic import instead.
process.env.API_KEY_ENCRYPTION_KEY = 'test-key-not-a-real-secret';

const { encrypt, decrypt } = await import('../src/utils/encryption.js');

test('round-trips a simple string', () => {
  const plaintext = 'sk-not-a-real-api-key';
  assert.equal(decrypt(encrypt(plaintext)), plaintext);
});

test('round-trips values that commonly break naive crypto wrappers', () => {
  const cases = [
    '',
    'a',
    'ünïcødé ✓ 日本語',
    'has:colons:in:it',          // the ciphertext format is colon-delimited
    'x'.repeat(10_000),          // spans many cipher blocks
  ];

  for (const plaintext of cases) {
    assert.equal(decrypt(encrypt(plaintext)), plaintext, `failed for ${JSON.stringify(plaintext.slice(0, 20))}`);
  }
});

test('uses a fresh IV per call, so equal plaintexts do not produce equal ciphertexts', () => {
  const plaintext = 'the same secret, encrypted twice';
  const a = encrypt(plaintext);
  const b = encrypt(plaintext);

  assert.notEqual(a, b, 'identical ciphertexts imply a reused IV');
  assert.equal(decrypt(a), plaintext);
  assert.equal(decrypt(b), plaintext);
});

test('emits <iv>:<ciphertext> with a 16-byte IV', () => {
  const [iv, body, ...rest] = encrypt('anything').split(':');

  assert.equal(rest.length, 0, 'expected exactly one separator');
  assert.match(iv, /^[0-9a-f]{32}$/, 'IV should be 16 bytes of hex');
  assert.match(body, /^[0-9a-f]+$/);
});

test('a tampered ciphertext never decrypts to the original plaintext', () => {
  // AES-CBC is not authenticated, so tampering is not reliably *detected* --
  // it usually throws on a padding error, but it may also return garbage. The
  // property that always holds, and the one worth asserting, is that it never
  // yields the original message.
  const plaintext = 'the original message';
  const [iv, body] = encrypt(plaintext).split(':');

  const flipped = (parseInt(body.slice(-1), 16) ^ 0x1).toString(16);
  const tampered = `${iv}:${body.slice(0, -1)}${flipped}`;

  let result;
  try {
    result = decrypt(tampered);
  } catch {
    return; // threw, which is the common and acceptable outcome
  }
  assert.notEqual(result, plaintext);
});
