import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindPosting } from '../lib/simulator-state.ts';
import { pendingStorageKey, loadPending, savePending, finishPending, clearPending, beginFresh, markFreshCreated, finishFresh, type TabStorage } from '../lib/pending-storage.ts';
import type { Snapshot } from '../lib/banking.ts';

const accountId = '10000000-0000-4000-8000-000000000001';
const otherAccount = '10000000-0000-4000-8000-000000000002';
const pending = bindPosting({ operation: 'purchases', amount: '37.25', key: 'saved-original-key' }, accountId);
function memory() {
  const values = new Map<string, string>();
  const storage: TabStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
  return { storage, values };
}

test('tab recovery round-trips only a versioned exact request and original account', () => {
  const { storage, values } = memory();
  assert.equal(savePending(storage, pending, 'retry', null), true);
  const restored = loadPending(storage);
  assert.equal(restored.kind, 'pending');
  if (restored.kind === 'pending') assert.deepEqual(restored.record, { version: 1, ...pending, phase: 'retry', acknowledged: null });
  assert.deepEqual(Object.keys(JSON.parse(values.get(pendingStorageKey)!)).sort(), ['accountId', 'acknowledged', 'intent', 'phase', 'version']);
  assert.equal(loadPending(memory().storage).kind, 'empty');
});

test('known posting outcome restores refresh-only while inconsistent recovery phases are rejected', () => {
  const { storage, values } = memory();
  assert.equal(savePending(storage, pending, 'refresh', 'posted'), true);
  const restored = loadPending(storage);
  assert.equal(restored.kind, 'pending');
  if (restored.kind === 'pending') { assert.equal(restored.record.phase, 'refresh'); assert.equal(restored.record.acknowledged, 'posted'); }
  assert.equal(savePending(storage, pending, 'refresh', null), false);
  assert.equal(savePending(storage, pending, 'retry', 'posted'), false);
  const value = JSON.parse(values.get(pendingStorageKey)!);
  values.set(pendingStorageKey, JSON.stringify({ ...value, phase: 'retry' }));
  assert.equal(loadPending(storage).kind, 'invalid');
});

test('malformed, oversized, foreign-schema and unbounded records never become runnable requests', () => {
  const { storage, values } = memory();
  const valid = { version: 1, ...pending, phase: 'retry', acknowledged: null };
  for (const raw of ['{', 'null', 'x'.repeat(1025), JSON.stringify({ ...valid, token: 'forbidden' }), JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, accountId: 'other' }), JSON.stringify({ ...valid, intent: { ...pending.intent, amount: '1'.repeat(15) } }), JSON.stringify({ ...valid, intent: { ...pending.intent, operation: 'transfer' } })]) {
    values.set(pendingStorageKey, raw);
    assert.equal(loadPending(storage).kind, 'invalid');
  }
});

test('unavailable storage fails closed and a failed update does not erase the original retry identity', () => {
  assert.equal(loadPending(null).kind, 'unavailable');
  assert.equal(savePending(null, pending, 'retry', null), false);
  const { storage, values } = memory();
  assert.equal(savePending(storage, pending, 'retry', null), true);
  const original = values.get(pendingStorageKey);
  const denied: TabStorage = { ...storage, setItem() { throw new Error('storage denied'); } };
  assert.equal(savePending(denied, pending, 'refresh', 'posted'), false);
  assert.equal(values.get(pendingStorageKey), original);
  const unreadable: TabStorage = { ...storage, getItem() { throw new Error('storage denied'); } };
  assert.equal(loadPending(unreadable).kind, 'unavailable');
});

test('only a known result reconciled on the original account can clear pending recovery', () => {
  const { storage } = memory();
  savePending(storage, pending, 'retry', null);
  assert.equal(finishPending(storage, pending, accountId, null), false);
  assert.equal(finishPending(storage, pending, otherAccount, 'posted'), false);
  assert.equal(loadPending(storage).kind, 'pending');
  assert.equal(finishPending(storage, pending, accountId, 'posted'), true);
  assert.equal(loadPending(storage).kind, 'empty');
  savePending(storage, pending, 'retry', null);
  assert.equal(clearPending(storage), true);
  assert.equal(loadPending(storage).kind, 'empty');
});

const freshSnapshot = (id: string): Snapshot => ({ account: { id, currency: 'USD', creditLimit: '1000.00', outstandingBalance: '250.00', availableCredit: '750.00', expiresAt: '2026-11-04T17:00:00Z' }, history: { entries: [], nextCursor: null } });

test('a failed fresh creation after corrupt recovery preserves the barrier across reloads', () => {
  const { storage, values } = memory();
  values.set(pendingStorageKey, '{corrupt');
  assert.equal(loadPending(storage).kind, 'invalid');
  assert.equal(beginFresh(storage, null), true);
  // Creation rejected before a cookie changed: there is no confirmed new account identity.
  assert.equal(loadPending(storage).kind, 'fresh-required');
  assert.equal(finishFresh(storage, freshSnapshot(accountId)), false);
  assert.equal(loadPending(storage).kind, 'fresh-required');
  assert.equal(loadPending(storage).kind, 'fresh-required');
  assert.equal(markFreshCreated(storage, otherAccount), true);
  assert.equal(beginFresh(storage, null), true);
  assert.equal(finishFresh(storage, freshSnapshot(accountId)), false);
});

test('a fresh barrier clears only after the new account is confirmed and its snapshot matches', () => {
  const { storage } = memory();
  assert.equal(beginFresh(storage, accountId), true);
  assert.equal(finishFresh(storage, freshSnapshot(accountId)), false);
  assert.equal(markFreshCreated(storage, otherAccount), true);
  assert.equal(finishFresh(storage, freshSnapshot(accountId)), false);
  assert.equal(loadPending(storage).kind, 'fresh-required');
  assert.equal(finishFresh(storage, freshSnapshot(otherAccount)), true);
  assert.equal(loadPending(storage).kind, 'empty');
  // An unreadable creation response can be reconciled when the authoritative cookie account is demonstrably new.
  assert.equal(beginFresh(storage, accountId), true);
  assert.equal(finishFresh(storage, freshSnapshot(otherAccount)), true);
});
