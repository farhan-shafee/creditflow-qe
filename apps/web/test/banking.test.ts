import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cents, moneyString, formatMoney, readSnapshot, sanitizePayload, observeRequest } from '../lib/banking.ts';

const accountId = '10000000-0000-4000-8000-000000000001';
const entryId = '20000000-0000-4000-8000-000000000001';
const expiresAt = '2026-11-04T12:30:00Z';
const account = { id: accountId, currency: 'USD', creditLimit: '1000.00', outstandingBalance: '250.00', availableCredit: '750.00', expiresAt };
const entry = { id: entryId, accountId, sequence: 1, kind: 'PAYMENT', amount: '10.00', balanceAfter: '240.00', availableAfter: '760.00', postedAt: expiresAt };

test('money arithmetic stays exact at cent boundaries and rejects noncanonical API money', () => {
  assert.equal(cents('0.01') + cents('999.99'), 100000n);
  assert.equal(moneyString(cents('9999999999999999.99') + 1n), '10000000000000000.00');
  assert.equal(formatMoney('1000.01'), '$1,000.01');
  for (const value of ['1e2', '1.001', '-1.00', 'NaN', '1', '01.00']) assert.throws(() => cents(value));
});

test('snapshot contract rejects incomplete money, pagination and foreign account entries', () => {
  const value = { account, history: { entries: [], nextCursor: null } };
  assert.deepEqual(readSnapshot(value), value);
  assert.equal(readSnapshot({ ...value, account: { ...account, availableCredit: 750 } }), null);
  assert.equal(readSnapshot({ ...value, history: { entries: [entry], nextCursor: '1' } }), null);
  assert.equal(readSnapshot({ ...value, history: { entries: [{ ...entry, accountId: entryId }], nextCursor: null } }), null);
});

test('inspector allowlist discards credentials and untrusted error text recursively', () => {
  const cleaned = sanitizePayload({ account: { ...account, token: 'secret' }, history: { entries: [{ ...entry, authorization: 'secret' }], nextCursor: null }, token: 'secret', cookies: ['secret'] });
  assert.equal(JSON.stringify(cleaned).includes('secret'), false);
  assert.deepEqual(cleaned, { account, history: { entries: [entry], nextCursor: null } });
  const error = sanitizePayload({ code: 'INSUFFICIENT_CREDIT', message: 'token=secret', token: 'secret', requestId: entryId, timestamp: expiresAt });
  assert.equal(error?.code, 'INSUFFICIENT_CREDIT');
  assert.equal(JSON.stringify(error).includes('secret'), false);
  assert.equal(sanitizePayload({ token: 'secret', headers: { authorization: 'secret' } }), null);
});

test('observed HTTP exchange preserves real status, replay header and safe request identity', async () => {
  const intent = { operation: 'payments' as const, amount: '10.00', key: 'same-key' };
  const result = await observeRequest('/api/lab/banking', { method: 'POST', body: JSON.stringify(intent) }, intent,
    (async () => new Response(JSON.stringify(entry), { status: 200, headers: { 'Idempotency-Replayed': 'true', 'Set-Cookie': 'secret' } })) as typeof fetch);
  assert.equal(result.exchange.status, 200);
  assert.equal(result.exchange.replayed, true);
  assert.equal(result.exchange.outcome, 'observed');
  assert.deepEqual(result.exchange.request, intent);
  assert.deepEqual(result.payload, entry);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('network and unreadable response failures retain uncertain exchange metadata', async () => {
  const network = await observeRequest('/api/lab/banking', { method: 'GET' }, undefined,
    (async () => { throw new Error('Bearer secret'); }) as typeof fetch);
  assert.equal(network.exchange.status, null);
  assert.equal(network.exchange.outcome, 'uncertain');
  const unreadable = await observeRequest('/api/lab/banking', { method: 'GET' }, undefined,
    (async () => new Response('{broken secret', { status: 502 })) as typeof fetch);
  assert.equal(unreadable.exchange.status, 502);
  assert.equal(unreadable.exchange.outcome, 'uncertain');
  assert.equal(unreadable.payload, null);
  assert.equal(JSON.stringify([network, unreadable]).includes('secret'), false);
});

test('invalid amount observation retains the actual operation and key without arbitrary input text', async () => {
  const fetcher = (async () => new Response(JSON.stringify({ code: 'INVALID_AMOUNT', message: 'secret' }), { status: 400 })) as typeof fetch;
  const decimal = await observeRequest('/api/banking', { method: 'POST' }, { operation: 'payments', amount: '1.001', key: 'invalid-amount-request' }, fetcher);
  assert.equal(decimal.exchange.operation, 'payments');
  assert.deepEqual(decimal.exchange.request, { operation: 'payments', amount: '1.001', key: 'invalid-amount-request' });
  const arbitrary = await observeRequest('/api/banking', { method: 'POST' }, { operation: 'purchases', amount: 'Bearer secret', key: 'same-key' }, fetcher);
  assert.equal(arbitrary.exchange.operation, 'purchases');
  assert.deepEqual(arbitrary.exchange.request, { operation: 'purchases', amount: '[invalid amount]', key: 'same-key' });
  assert.equal(JSON.stringify(arbitrary).includes('secret'), false);
});

test('success HTTP facts alone cannot certify a foreign or malformed financial receipt', async () => {
  const intent = { operation: 'payments' as const, amount: '10.00', key: 'same-key' };
  const foreign = await observeRequest('/api/banking', { method: 'POST' }, intent,
    (async () => new Response(JSON.stringify({ ...entry, accountId: '10000000-0000-4000-8000-000000000002' }), { status: 201, headers: { 'Idempotency-Replayed': 'false' } })) as typeof fetch);
  assert.equal(foreign.exchange.status, 201);
  assert.equal(foreign.exchange.replayed, false);
  assert.equal(foreign.exchange.outcome, 'observed');
  assert.ok(foreign.exchange.durationMs >= 0);
  const malformed = await observeRequest('/api/banking', { method: 'POST' }, intent,
    (async () => new Response(JSON.stringify({ id: entryId, amount: '10.00' }), { status: 201 })) as typeof fetch);
  assert.equal(malformed.exchange.status, 201);
  assert.equal(malformed.exchange.outcome, 'uncertain');
  assert.equal(malformed.payload, null);
});

test('observations dispatch securely when browser crypto supports random values without randomUUID', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const secureRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: secureRandomValues } });
  let dispatched = false;
  try {
    assert.equal(globalThis.crypto.randomUUID, undefined);
    const result = await observeRequest('/api/banking', { method: 'GET' }, undefined,
      (async () => { dispatched = true; return new Response(JSON.stringify({ account, history: { entries: [], nextCursor: null } }), { status: 200 }); }) as typeof fetch);
    assert.equal(dispatched, true);
    assert.equal(result.exchange.status, 200);
    assert.match(result.exchange.id, /^[0-9a-f]{32}$/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  }
});
