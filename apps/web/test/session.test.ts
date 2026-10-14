import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeSession, decodeSession } from '../lib/session.ts';

const secret = 'test-only-key-with-more-than-thirty-two-bytes';
const session = { accountId: 'synthetic-account', token: 'synthetic-token', expiresAt: 2000 };
test('signed session round-trips', () => {
  assert.deepEqual(decodeSession(encodeSession(session, secret), secret, 1000), session);
});
test('tampering, wrong secret and expiry invalidate the session', () => {
  const value = encodeSession(session, secret);
  assert.equal(decodeSession(value + 'x', secret, 1000), null);
  assert.equal(decodeSession(value, 'different-signing-key', 1000), null);
  assert.equal(decodeSession(value, secret, 2000), null);
  assert.equal(decodeSession('', secret, 1000), null);
});
