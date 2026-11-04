import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLabRun, advanceLabRun, type LabTransport } from '../lib/correctness-lab.ts';
import type { Intent, Snapshot, Entry, Exchange } from '../lib/banking.ts';

const accountId = '10000000-0000-4000-8000-000000000001';
const entryId = '20000000-0000-4000-8000-000000000001';
const timestamp = '2026-11-04T12:30:00Z';
function snapshot(balance = '250.00', available = '750.00', entries: Entry[] = []): Snapshot {
  return { account: { id: accountId, currency: 'USD', creditLimit: '1000.00', outstandingBalance: balance, availableCredit: available, expiresAt: timestamp }, history: { entries, nextCursor: null } };
}
function receipt(kind: 'PURCHASE' | 'PAYMENT', amount: string, balanceAfter: string, availableAfter: string): Entry {
  return { id: entryId, accountId, sequence: 1, kind, amount, balanceAfter, availableAfter, postedAt: timestamp };
}
function response(payload: unknown, status: number | null, replayed: boolean | null = null) {
  const exchange: Exchange = { id: crypto.randomUUID(), operation: 'test', method: 'POST', path: '/api/lab/banking', status, durationMs: 1, replayed, outcome: status === null ? 'uncertain' : status >= 400 ? 'rejected' : replayed ? 'replayed' : 'confirmed', request: null, response: payload as Record<string, unknown>, observedAt: timestamp };
  return { payload, exchange };
}
function transport(postings: ReturnType<typeof response>[], final: Snapshot, options: { lostFinal?: boolean } = {}) {
  const requests: Intent[] = [];
  let reads = 0;
  let creates = 0;
  const api: LabTransport = {
    async create() { creates++; return response({ accountId, expiresAt: timestamp }, 201); },
    async snapshot() { reads++; return options.lostFinal && reads === 2 ? response(null, null) : response(reads === 1 ? snapshot() : final, 200); },
    async post(intent, _signal, expectedAccount) { assert.equal(expectedAccount, accountId); requests.push({ ...intent }); return postings.shift() ?? response(null, null); }
  };
  return { api, requests, counts: () => ({ reads, creates }) };
}

test('successful purchase uses four browser requests and reconciles its actual receipt', async () => {
  const entry = receipt('PURCHASE', '100.00', '350.00', '650.00');
  const t = transport([response(entry, 201, false)], snapshot('350.00', '650.00', [entry]));
  const result = await advanceLabRun(createLabRun('purchase', 'run-one'), t.api);
  assert.equal(result.status, 'passed');
  assert.equal(result.exchanges.length, 4);
  assert.deepEqual(t.counts(), { reads: 2, creates: 1 });
  assert.ok(result.checks.every(check => check.passed));
});

test('expected insufficient credit rejection passes only with unchanged state and empty ledger', async () => {
  const t = transport([response({ code: 'INSUFFICIENT_CREDIT' }, 422)], snapshot());
  assert.equal((await advanceLabRun(createLabRun('insufficient-credit', 'run-two'), t.api)).status, 'passed');
  const bad = transport([response({ code: 'INSUFFICIENT_CREDIT' }, 422)], snapshot('251.00', '749.00'));
  assert.equal((await advanceLabRun(createLabRun('insufficient-credit', 'run-three'), bad.api)).status, 'failed');
});

test('identical replay uses five requests, one key and the complete original receipt', async () => {
  const entry = receipt('PAYMENT', '10.00', '240.00', '760.00');
  const t = transport([response(entry, 201, false), response(entry, 200, true)], snapshot('240.00', '760.00', [entry]));
  const result = await advanceLabRun(createLabRun('identical-replay', 'run-four'), t.api);
  assert.equal(result.status, 'passed');
  assert.equal(result.exchanges.length, 5);
  assert.equal(t.requests[0].key, t.requests[1].key);
  assert.equal(t.requests[0].amount, '10');
  assert.equal(t.requests[1].amount, '10.00');
});

test('conflicting key verifies the 409 error and exactly one persisted original posting', async () => {
  const entry = receipt('PAYMENT', '10.00', '240.00', '760.00');
  const t = transport([response(entry, 201, false), response({ code: 'IDEMPOTENCY_CONFLICT' }, 409)], snapshot('240.00', '760.00', [entry]));
  const result = await advanceLabRun(createLabRun('conflicting-key', 'run-five'), t.api);
  assert.equal(result.status, 'passed');
  assert.equal(t.requests[0].key, t.requests[1].key);
});

test('lost posting response stops and manual continuation preserves the exact intent', async () => {
  const entry = receipt('PURCHASE', '100.00', '350.00', '650.00');
  const t = transport([response(null, null), response(entry, 200, true)], snapshot('350.00', '650.00', [entry]));
  const interrupted = await advanceLabRun(createLabRun('purchase', 'run-six'), t.api);
  assert.equal(interrupted.status, 'inconclusive');
  assert.equal(interrupted.recovery, 'retry');
  assert.deepEqual(t.counts(), { reads: 1, creates: 1 });
  const resumed = await advanceLabRun(interrupted, t.api);
  assert.equal(resumed.status, 'passed');
  assert.deepEqual(t.requests[0], t.requests[1]);
  assert.deepEqual(t.counts(), { reads: 2, creates: 1 });
});

test('lost final snapshot offers refresh only and does not repeat a known posting', async () => {
  const entry = receipt('PURCHASE', '100.00', '350.00', '650.00');
  const t = transport([response(entry, 201, false)], snapshot('350.00', '650.00', [entry]), { lostFinal: true });
  const interrupted = await advanceLabRun(createLabRun('purchase', 'run-seven'), t.api);
  assert.equal(interrupted.recovery, 'refresh');
  const resumed = await advanceLabRun(interrupted, t.api);
  assert.equal(resumed.status, 'passed');
  assert.equal(t.requests.length, 1);
});

test('aborted run issues no requests and cannot be mislabeled as verified', async () => {
  const controller = new AbortController(); controller.abort();
  const t = transport([], snapshot());
  const run = await advanceLabRun(createLabRun('purchase', 'run-eight'), t.api, { signal: controller.signal });
  assert.equal(run.status, 'inconclusive');
  assert.equal(run.exchanges.length, 0);
  assert.deepEqual(t.counts(), { reads: 0, creates: 0 });
});

test('changed replay receipt and incomplete history fail verification', async () => {
  const entry = receipt('PAYMENT', '10.00', '240.00', '760.00');
  const changed = transport([response(entry, 201, false), response({ ...entry, postedAt: '2026-11-04T12:31:00Z' }, 200, true)], snapshot('240.00', '760.00', [entry]));
  assert.equal((await advanceLabRun(createLabRun('identical-replay', 'run-nine'), changed.api)).status, 'failed');
  const incomplete = transport([response(entry, 201, false)], { ...snapshot('240.00', '760.00', [entry]), history: { entries: [entry], nextCursor: 1 } });
  assert.equal((await advanceLabRun(createLabRun('purchase', 'run-ten'), incomplete.api)).status, 'failed');
});

test('incorrect initial account and wrong rejection code stop before any later mutation', async () => {
  const t = transport([], snapshot());
  t.api.snapshot = async () => response({ ...snapshot(), account: { ...snapshot().account, id: entryId } }, 200);
  const foreign = await advanceLabRun(createLabRun('purchase', 'run-eleven'), t.api);
  assert.equal(foreign.status, 'failed');
  assert.equal(t.requests.length, 0);
  const wrongCode = transport([response({ code: 'OVERPAYMENT' }, 422)], snapshot());
  assert.equal((await advanceLabRun(createLabRun('insufficient-credit', 'run-twelve'), wrongCode.api)).status, 'failed');
});

test('quota limits stop as inconclusive and retain the exact posting for manual recovery', async () => {
  const creating = transport([], snapshot());
  creating.api.create = async () => response({ code: 'SANDBOX_UNAVAILABLE' }, 429);
  const limitedCreation = await advanceLabRun(createLabRun('purchase', 'quota-create'), creating.api);
  assert.equal(limitedCreation.status, 'inconclusive');
  assert.equal(limitedCreation.recovery, 'restart');
  assert.match(limitedCreation.message, /limit/i);
  assert.equal(limitedCreation.exchanges.length, 1);
  assert.ok(limitedCreation.checks.every(check => check.passed));
  const entry = receipt('PURCHASE', '100.00', '350.00', '650.00');
  const posting = transport([response({ code: 'RATE_LIMITED' }, 429), response(entry, 201, false)], snapshot('350.00', '650.00', [entry]));
  const limitedPosting = await advanceLabRun(createLabRun('purchase', 'quota-post'), posting.api);
  assert.equal(limitedPosting.status, 'inconclusive');
  assert.equal(limitedPosting.recovery, 'retry');
  assert.match(limitedPosting.message, /limit/i);
  assert.equal(limitedPosting.exchanges.length, 3);
  assert.equal((await advanceLabRun(limitedPosting, posting.api)).status, 'passed');
  assert.deepEqual(posting.requests[0], posting.requests[1]);
});

test('expired or replaced lab sessions require a fresh account without reporting financial failure', async () => {
  for (const failure of [response({ code: 'SESSION_REQUIRED' }, 401), response({ code: 'LAB_SESSION_CHANGED' }, 409)]) {
    const t = transport([failure], snapshot());
    const interrupted = await advanceLabRun(createLabRun('purchase', `expired-${failure.exchange.status}`), t.api);
    assert.equal(interrupted.status, 'inconclusive');
    assert.equal(interrupted.recovery, 'restart');
    assert.ok(interrupted.checks.every(check => check.passed));
    const repeated = await advanceLabRun(interrupted, t.api);
    assert.equal(repeated.exchanges.length, 3);
    assert.equal(t.requests.length, 1);
  }
});
