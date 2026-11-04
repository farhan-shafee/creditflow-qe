import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindPosting, sessionDecision, pendingDecision, creationDecision, certifyPendingExchange } from '../lib/simulator-state.ts';
import type { Exchange, Intent, Snapshot } from '../lib/banking.ts';

const accountId = '10000000-0000-4000-8000-000000000001';
const otherAccount = '10000000-0000-4000-8000-000000000002';
const timestamp = '2026-11-04T14:30:00Z';
const intent: Intent = { operation: 'payments', amount: '50.00', key: 'original-identity' };
const snapshot: Snapshot = { account: { id: accountId, currency: 'USD', creditLimit: '1000.00', outstandingBalance: '250.00', availableCredit: '750.00', expiresAt: timestamp }, history: { entries: [], nextCursor: null } };
function exchange(status: number | null, response: Record<string, unknown> | null, outcome: Exchange['outcome'] = 'confirmed'): Exchange {
  return { id: 'observed', operation: 'payments', method: 'POST', path: '/api/banking', durationMs: 1, status, response, outcome, replayed: status === 201 ? false : null, request: null, observedAt: timestamp };
}

test('pending posting freezes a copied request and its original account for every retry', () => {
  const editable = { ...intent };
  const pending = bindPosting(editable, accountId);
  editable.key = 'new-key'; editable.amount = '51.00';
  assert.deepEqual(pending, { accountId, intent });
  assert.throws(() => { (pending.intent as Intent).key = 'changed'; }, TypeError);
  assert.throws(() => { (pending as { accountId: string }).accountId = otherAccount; }, TypeError);
});

test('session expiry is terminal instead of leaving an unretryable pending request', () => {
  assert.equal(sessionDecision(exchange(401, { code: 'SESSION_REQUIRED' }, 'rejected'), bindPosting(intent, accountId)).kind, 'expired');
  assert.equal(pendingDecision(bindPosting(intent, accountId), exchange(401, { code: 'SESSION_REQUIRED' }, 'rejected')), 'expired');
});

test('a different account snapshot cannot retarget an unresolved posting', () => {
  const changed = { ...snapshot, account: { ...snapshot.account, id: otherAccount } };
  const result = sessionDecision(exchange(200, changed), bindPosting(intent, accountId));
  assert.equal(result.kind, 'changed');
  assert.equal('snapshot' in result, false);
});

test('same-account refresh confirms state while transport failures retain recovery', () => {
  const ready = sessionDecision(exchange(200, snapshot), bindPosting(intent, accountId));
  assert.equal(ready.kind, 'ready');
  if (ready.kind === 'ready') assert.deepEqual(ready.snapshot, snapshot);
  assert.equal(sessionDecision(exchange(null, null, 'uncertain'), bindPosting(intent, accountId)).kind, 'unavailable');
  assert.equal(sessionDecision(exchange(503, { code: 'BACKEND_UNAVAILABLE' }, 'uncertain')).kind, 'unavailable');
});

test('server account-change rejection terminates the saved intent before any retry', () => {
  assert.equal(pendingDecision(bindPosting(intent, accountId), exchange(409, { code: 'SESSION_CHANGED' }, 'rejected')), 'changed');
  assert.equal(pendingDecision(bindPosting(intent, accountId), exchange(null, null, 'uncertain')), 'retry');
});

test('a success receipt for a new cookie account cannot confirm the original account intent', () => {
  const receipt = { id: '20000000-0000-4000-8000-000000000001', accountId: otherAccount, sequence: 1, kind: 'PAYMENT', amount: '50.00', balanceAfter: '200.00', availableAfter: '800.00', postedAt: timestamp };
  assert.equal(pendingDecision(bindPosting(intent, accountId), exchange(201, receipt)), 'retry');
  assert.equal(pendingDecision(bindPosting(intent, accountId), exchange(201, { ...receipt, accountId })), 'refresh');
  const foreign = certifyPendingExchange(bindPosting(intent, accountId), exchange(201, receipt));
  assert.equal(foreign.decision, 'retry');
  assert.equal(foreign.exchange.outcome, 'uncertain');
  assert.equal(foreign.exchange.status, 201);
  const confirmed = certifyPendingExchange(bindPosting(intent, accountId), exchange(201, { ...receipt, accountId }));
  assert.equal(confirmed.exchange.outcome, 'confirmed');
});

test('ambiguous creation requires refresh while confirmed creation and known rejection stay distinct', () => {
  assert.equal(creationDecision(exchange(201, null, 'uncertain')), 'unconfirmed');
  assert.equal(creationDecision(exchange(null, null, 'uncertain')), 'unconfirmed');
  assert.equal(creationDecision(exchange(503, { code: 'BACKEND_UNAVAILABLE' }, 'uncertain')), 'unconfirmed');
  assert.equal(creationDecision(exchange(201, { accountId, expiresAt: timestamp })), 'created');
  assert.equal(creationDecision(exchange(201, { accountId, expiresAt: timestamp }, 'observed')), 'created');
  assert.equal(creationDecision(exchange(429, { code: 'SANDBOX_UNAVAILABLE' }, 'rejected')), 'rejected');
});
