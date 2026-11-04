export type Account = { id: string; currency: string; creditLimit: string; outstandingBalance: string; availableCredit: string; expiresAt: string };
export type Entry = { id: string; accountId?: string; sequence: number; kind: 'PAYMENT' | 'PURCHASE'; amount: string; balanceAfter: string; availableAfter: string; postedAt: string };
export type Snapshot = { account: Account; history: { entries: Entry[]; nextCursor: number | null } };
export type Intent = { operation: 'payments' | 'purchases'; amount: string; key: string };
export type Exchange = { id: string; operation: string; amount?: string; method: 'GET' | 'POST'; path: string; status: number | null; durationMs: number; replayed: boolean | null; outcome: 'observed' | 'confirmed' | 'replayed' | 'rejected' | 'uncertain'; request: Record<string, unknown> | null; response: Record<string, unknown> | null; observedAt: string };
export type Observation = { exchange: Exchange; payload: unknown };
/** getRandomValues is available in HTTP browser contexts where randomUUID is not. */
export function newIdentity(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
const moneyPattern = /^(0|[1-9][0-9]{0,39})\.[0-9]{2}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const money = (value: unknown): value is string => typeof value === 'string' && moneyPattern.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && timestampPattern.test(value) && Number.isFinite(Date.parse(value));

export function cents(value: string): bigint {
  if (!money(value)) throw new Error('Expected an exact USD decimal string.');
  const [whole, fractional] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fractional);
}
export function moneyString(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
export function formatMoney(value: string | bigint): string {
  const canonical = moneyString(typeof value === 'bigint' ? value : cents(value));
  const [whole, fractional] = canonical.split('.');
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fractional}`;
}
function readAccount(value: unknown): Account | null {
  if (!object(value) || !uuid(value.id) || value.currency !== 'USD' || !money(value.creditLimit) || !money(value.outstandingBalance) || !money(value.availableCredit) || !timestamp(value.expiresAt)) return null;
  return { id: value.id, currency: 'USD', creditLimit: value.creditLimit, outstandingBalance: value.outstandingBalance, availableCredit: value.availableCredit, expiresAt: value.expiresAt };
}
export function readEntry(value: unknown): Entry | null {
  if (!object(value) || !uuid(value.id) || !uuid(value.accountId) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) <= 0 || !['PAYMENT', 'PURCHASE'].includes(String(value.kind)) || !money(value.amount) || !money(value.balanceAfter) || !money(value.availableAfter) || !timestamp(value.postedAt)) return null;
  return { id: value.id, accountId: value.accountId, sequence: Number(value.sequence), kind: value.kind as Entry['kind'], amount: value.amount, balanceAfter: value.balanceAfter, availableAfter: value.availableAfter, postedAt: value.postedAt };
}
export function readSnapshot(value: unknown): Snapshot | null {
  if (!object(value) || !object(value.history) || !Array.isArray(value.history.entries) || value.history.entries.length > 100) return null;
  const account = readAccount(value.account);
  const entries = value.history.entries.map(readEntry);
  const cursor = value.history.nextCursor;
  if (!account || entries.some(entry => !entry || entry.accountId !== account.id) || !(cursor === null || Number.isSafeInteger(cursor) && Number(cursor) > 0)) return null;
  return { account, history: { entries: entries as Entry[], nextCursor: cursor as number | null } };
}

const errorMessages: Record<string, string> = {
  INSUFFICIENT_CREDIT: 'Purchase exceeds available credit.', OVERPAYMENT: 'Payment exceeds outstanding balance.',
  IDEMPOTENCY_CONFLICT: 'This request key already identifies another transaction.', INVALID_AMOUNT: 'Enter a positive USD decimal amount with at most two fractional digits.',
  INVALID_BODY: 'The request body was rejected.', INVALID_IDEMPOTENCY_KEY: 'The request key was rejected.',
  SESSION_REQUIRED: 'Start a fresh synthetic account to continue.', UNAUTHORIZED: 'The synthetic session has expired.', SESSION_CHANGED: 'The synthetic account changed. Start a fresh account to continue.',
  LAB_SESSION_CHANGED: 'The lab account changed. Start a fresh lab run.', ACCOUNT_NOT_FOUND: 'Synthetic account not found.',
  ORIGIN_REJECTED: 'The request origin was rejected.', RATE_LIMITED: 'Request limit reached. Try again later.',
  REQUEST_TOO_LARGE: 'The request exceeded the body limit.', SANDBOX_UNAVAILABLE: 'A synthetic account could not be created.',
  BACKEND_UNAVAILABLE: 'The banking service could not confirm this request.', INVALID_UPSTREAM: 'The banking response could not be verified.'
};
/** Only contract fields enter the browser inspector; arbitrary text and headers never do. */
export function sanitizePayload(value: unknown): Record<string, unknown> | null {
  if (!object(value)) return null;
  const snapshot = readSnapshot(value);
  if (snapshot) return snapshot;
  const entry = readEntry(value);
  if (entry) return entry;
  const account = readAccount(value);
  if (account) return account;
  if (uuid(value.accountId) && timestamp(value.expiresAt)) return { accountId: value.accountId, expiresAt: value.expiresAt };
  if (typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.code)) {
    const code = Object.hasOwn(errorMessages, value.code) ? value.code : 'REQUEST_FAILED';
    return { code, message: errorMessages[code] ?? 'The request was rejected.', ...(uuid(value.requestId) ? { requestId: value.requestId } : {}), ...(timestamp(value.timestamp) ? { timestamp: value.timestamp } : {}) };
  }
  return null;
}

const endpoints = new Set(['/api/banking', '/api/sandbox', '/api/lab/banking', '/api/lab/sandbox']);
export async function observeRequest(path: string, options: RequestInit, intent?: Intent, fetcher: typeof fetch = fetch): Promise<Observation> {
  const started = performance.now();
  const allowed = endpoints.has(path);
  const safeIntent = intent && ['payments', 'purchases'].includes(intent.operation) ? {
    operation: intent.operation,
    amount: /^[0-9.eE+-]{1,24}$/.test(intent.amount) ? intent.amount : '[invalid amount]',
    key: /^[A-Za-z0-9_-]{1,80}$/.test(intent.key) ? intent.key : '[invalid key]'
  } : null;
  const exchange: Exchange = { id: newIdentity(), operation: safeIntent?.operation ?? (path.endsWith('/sandbox') ? 'Create sandbox' : 'Read account and ledger'), ...(safeIntent ? { amount: safeIntent.amount } : {}), method: options.method?.toUpperCase() === 'POST' ? 'POST' : 'GET', path: allowed ? path : '/api/unsupported', status: null, durationMs: 0, replayed: null, outcome: 'uncertain', request: safeIntent, response: null, observedAt: new Date().toISOString() };
  let payload: Record<string, unknown> | null = null;
  try {
    if (!allowed) return { exchange, payload };
    const response = await fetcher(path, { ...options, cache: 'no-store' });
    exchange.status = response.status;
    const replay = response.headers.get('Idempotency-Replayed');
    exchange.replayed = replay === 'true' ? true : replay === 'false' ? false : null;
    payload = sanitizePayload(await response.json());
    exchange.response = payload;
    if (payload) exchange.outcome = response.status >= 500 ? 'uncertain' : response.ok ? 'observed' : 'rejected';
  } catch { /* A transport or parse failure is observable, but cannot confirm a mutation. */ }
  finally { exchange.durationMs = Math.max(0, Math.round(performance.now() - started)); }
  return { exchange, payload };
}
