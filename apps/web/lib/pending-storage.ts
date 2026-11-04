import { bindPosting, type PendingPosting } from './simulator-state.ts';
import type { Snapshot } from './banking.ts';
export type TabStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PendingRecord = PendingPosting & { version: 1; phase: 'retry' | 'refresh'; acknowledged: 'posted' | 'rejected' | null };
export type FreshBarrier = Readonly<{ version: 1; purpose: 'fresh-account'; previousAccountId: string | null; createdAccountId: string | null }>;
export const pendingStorageKey = 'creditflow.pending.v1';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const accountId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function freshBarrier(value: unknown): FreshBarrier | null {
  if (!object(value) || !exactKeys(value, ['version', 'purpose', 'previousAccountId', 'createdAccountId']) || value.version !== 1 || value.purpose !== 'fresh-account' || !(value.previousAccountId === null || accountId(value.previousAccountId)) || !(value.createdAccountId === null || accountId(value.createdAccountId)) || value.createdAccountId !== null && value.createdAccountId === value.previousAccountId) return null;
  return Object.freeze({ version: 1, purpose: 'fresh-account', previousAccountId: value.previousAccountId, createdAccountId: value.createdAccountId });
}
function record(value: unknown): PendingRecord | null {
  if (!object(value) || !exactKeys(value, ['version', 'accountId', 'intent', 'phase', 'acknowledged']) || value.version !== 1 || typeof value.accountId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.accountId) || !object(value.intent)) return null;
  const intent = value.intent;
  if (!exactKeys(intent, ['operation', 'amount', 'key']) || (intent.operation !== 'payments' && intent.operation !== 'purchases') || typeof intent.amount !== 'string' || intent.amount.length < 1 || intent.amount.length > 14 || typeof intent.key !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(intent.key)) return null;
  if (!(value.phase === 'retry' && value.acknowledged === null || value.phase === 'refresh' && (value.acknowledged === 'posted' || value.acknowledged === 'rejected'))) return null;
  return Object.freeze({ version: 1, ...bindPosting({ operation: intent.operation, amount: intent.amount, key: intent.key }, value.accountId), phase: value.phase, acknowledged: value.acknowledged });
}
export function loadPending(storage: TabStorage | null): { kind: 'pending'; record: PendingRecord } | { kind: 'fresh-required'; barrier: FreshBarrier } | { kind: 'empty' | 'invalid' | 'unavailable' } {
  if (!storage) return { kind: 'unavailable' };
  let raw: string | null;
  try { raw = storage.getItem(pendingStorageKey); } catch { return { kind: 'unavailable' }; }
  if (raw === null) return { kind: 'empty' };
  if (raw.length > 1024) return { kind: 'invalid' };
  try {
    const value: unknown = JSON.parse(raw);
    const barrier = freshBarrier(value);
    if (barrier) return { kind: 'fresh-required', barrier };
    const parsed = record(value);
    return parsed ? { kind: 'pending', record: parsed } : { kind: 'invalid' };
  }
  catch { return { kind: 'invalid' }; }
}
export function savePending(storage: TabStorage | null, pending: PendingPosting, phase: PendingRecord['phase'], acknowledged: PendingRecord['acknowledged']): boolean {
  if (!storage) return false;
  const valid = record({ version: 1, accountId: pending.accountId, intent: pending.intent, phase, acknowledged });
  if (!valid) return false;
  try {
    const encoded = JSON.stringify(valid);
    storage.setItem(pendingStorageKey, encoded);
    return storage.getItem(pendingStorageKey) === encoded;
  } catch { return false; }
}
export function clearPending(storage: TabStorage | null): boolean {
  if (!storage) return false;
  try { storage.removeItem(pendingStorageKey); return storage.getItem(pendingStorageKey) === null; }
  catch { return false; }
}
export function finishPending(storage: TabStorage | null, pending: PendingPosting, accountId: string, acknowledged: PendingRecord['acknowledged']): boolean {
  return acknowledged !== null && pending.accountId === accountId && clearPending(storage);
}
function writeFresh(storage: TabStorage | null, barrier: FreshBarrier): boolean {
  if (!storage || !freshBarrier(barrier)) return false;
  try { const encoded = JSON.stringify(barrier); storage.setItem(pendingStorageKey, encoded); return storage.getItem(pendingStorageKey) === encoded; }
  catch { return false; }
}
export function beginFresh(storage: TabStorage | null, previousAccountId: string | null): boolean {
  if (previousAccountId !== null && !accountId(previousAccountId)) return false;
  const current = loadPending(storage);
  if (current.kind === 'pending' || current.kind === 'unavailable') return false;
  const previous = current.kind === 'fresh-required' ? current.barrier.previousAccountId : previousAccountId;
  return writeFresh(storage, { version: 1, purpose: 'fresh-account', previousAccountId: previous, createdAccountId: null });
}
export function markFreshCreated(storage: TabStorage | null, createdAccountId: string): boolean {
  const current = loadPending(storage);
  return current.kind === 'fresh-required' && accountId(createdAccountId) && writeFresh(storage, { ...current.barrier, createdAccountId });
}
export function finishFresh(storage: TabStorage | null, snapshot: Snapshot): boolean {
  const current = loadPending(storage);
  if (current.kind !== 'fresh-required') return false;
  const barrier = current.barrier;
  const fresh = accountId(snapshot.account.id) && snapshot.account.currency === 'USD' && snapshot.account.creditLimit === '1000.00' && snapshot.account.outstandingBalance === '250.00' && snapshot.account.availableCredit === '750.00' && snapshot.history.entries.length === 0 && snapshot.history.nextCursor === null;
  const matches = barrier.createdAccountId !== null ? snapshot.account.id === barrier.createdAccountId : barrier.previousAccountId !== null && snapshot.account.id !== barrier.previousAccountId;
  return fresh && matches && clearPending(storage);
}
