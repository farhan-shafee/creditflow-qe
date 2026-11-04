import { cents, readEntry, type Exchange, type Intent } from './banking.ts';
export type PostingDecision = 'refresh' | 'rejected' | 'retry';
const rejectedCodes = new Set(['INVALID_AMOUNT', 'OVERPAYMENT', 'INSUFFICIENT_CREDIT', 'IDEMPOTENCY_CONFLICT', 'SESSION_REQUIRED', 'UNAUTHORIZED', 'ORIGIN_REJECTED', 'RATE_LIMITED', 'REQUEST_TOO_LARGE', 'INVALID_BODY', 'INVALID_IDEMPOTENCY_KEY', 'ACCOUNT_NOT_FOUND']);
/** A success-shaped status alone cannot confirm a financial intent. */
export function postingDecision(intent: Intent, exchange: Exchange, accountId: string): PostingDecision {
  const entry = readEntry(exchange.response);
  const match = intent.amount.match(/^([0-9]{1,9})(?:\.([0-9]{1,2}))?$/);
  const amount = match ? BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0')) : null;
  const acknowledged = exchange.status === 201 && exchange.replayed === false || exchange.status === 200 && exchange.replayed === true;
  if (acknowledged && entry && entry.accountId === accountId && entry.kind === (intent.operation === 'payments' ? 'PAYMENT' : 'PURCHASE') && amount === cents(entry.amount)) return 'refresh';
  if (exchange.status !== null && exchange.status >= 400 && exchange.status < 500 && exchange.status !== 408 && typeof exchange.response?.code === 'string' && rejectedCodes.has(exchange.response.code)) return 'rejected';
  return 'retry';
}
