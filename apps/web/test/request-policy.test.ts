import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigin, BodyError, readJsonBody } from '../lib/request-policy.ts';

test('writes require an approved exact origin matching Host, including reverse proxy deployments', () => {
  assert.equal(allowedOrigin('http://web:3100', 'web:3100', undefined, true), true);
  assert.equal(allowedOrigin('https://creditflow.farhan-shafee.com', 'creditflow.farhan-shafee.com', 'https://creditflow.farhan-shafee.com', false), true);
  for (const origin of [null, 'null', 'https://evil.example', 'https://creditflow.farhan-shafee.com.evil.example', 'https://creditflow.farhan-shafee.com/path']) {
    assert.equal(allowedOrigin(origin, 'creditflow.farhan-shafee.com', 'https://creditflow.farhan-shafee.com', false), false);
  }
  assert.equal(allowedOrigin('https://creditflow.farhan-shafee.com', 'other.example', 'https://creditflow.farhan-shafee.com', false), false);
  assert.equal(allowedOrigin('http://localhost:3100', 'localhost:3100', undefined, false), false);
});
const stream = (text: string) => new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(text)); c.close(); } });
test('JSON validation rejects malformed, null, arrays and invalid UTF-8', async () => {
  for (const raw of ['{', 'null', '[]', 'true']) await assert.rejects(readJsonBody(stream(raw)), (e: unknown) => e instanceof BodyError && e.status === 400);
  assert.deepEqual(await readJsonBody(stream('{"amount":"50.00"}')), { amount: '50.00' });
  await assert.rejects(readJsonBody(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([255])); c.close(); } })), BodyError);
});
test('streaming body limit counts bytes and cancels without draining oversized input', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode('€'.repeat(342))); }, cancel() { cancelled = true; } });
  await assert.rejects(readJsonBody(body), (e: unknown) => e instanceof BodyError && e.status === 413);
  assert.equal(cancelled, true);
});
