import { readSnapshot, type Exchange, type Intent, type Snapshot } from './banking.ts';
import { postingDecision } from './transaction-decision.ts';
export type PendingPosting = Readonly<{ intent: Readonly<Intent>; accountId: string }>;
/** A retry is bound to both its request identity and the account that originally accepted it. */
export function bindPosting(intent: Intent, accountId: string): PendingPosting {
  return Object.freeze({ accountId, intent: Object.freeze({ ...intent }) });
}
export function sessionDecision(exchange: Exchange, pending?: PendingPosting | null): { kind: 'ready'; snapshot: Snapshot } | { kind: 'expired' | 'changed' | 'unavailable' } {
  if (exchange.status === 401) return { kind: 'expired' };
  const snapshot = exchange.status === 200 ? readSnapshot(exchange.response) : null;
  if (!snapshot) return { kind: 'unavailable' };
  if (pending && snapshot.account.id !== pending.accountId) return { kind: 'changed' };
  return { kind: 'ready', snapshot };
}
export function pendingDecision(pending: PendingPosting, exchange: Exchange): 'expired' | 'changed' | 'refresh' | 'rejected' | 'retry' {
  if (exchange.status === 401) return 'expired';
  if (exchange.status === 409 && exchange.response?.code === 'SESSION_CHANGED') return 'changed';
  return postingDecision(pending.intent, exchange, pending.accountId);
}
export function certifyPendingExchange(pending: PendingPosting, exchange: Exchange): { decision: ReturnType<typeof pendingDecision>; exchange: Exchange } {
  const decision = pendingDecision(pending, exchange);
  const outcome = decision === 'refresh' ? exchange.replayed === true ? 'replayed' : 'confirmed' : decision === 'retry' ? 'uncertain' : 'rejected';
  return { decision, exchange: { ...exchange, outcome } };
}
export function creationDecision(exchange: Exchange): 'created' | 'rejected' | 'unconfirmed' {
  if (exchange.status === 201 && (exchange.outcome === 'observed' || exchange.outcome === 'confirmed') && typeof exchange.response?.accountId === 'string' && typeof exchange.response?.expiresAt === 'string') return 'created';
  if (exchange.status !== null && exchange.status >= 400 && exchange.status < 500 && exchange.status !== 408 && exchange.outcome === 'rejected') return 'rejected';
  return 'unconfirmed';
}
