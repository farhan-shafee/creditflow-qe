import { cents, moneyString, observeRequest, readEntry, readSnapshot, type Entry, type Intent, type Observation, type Exchange, type Snapshot } from './banking.ts';
export type LabTransport = { create(signal?: AbortSignal): Promise<Observation>; snapshot(signal?: AbortSignal): Promise<Observation>; post(intent: Intent, signal?: AbortSignal, accountId?: string): Promise<Observation> };

export const labScenarios = [
  { id: 'purchase', title: 'Successful purchase', description: 'Post $100.00 and reconcile the receipt, balance and ledger.', featureLine: 10, scenario: 'Purchase and payment reconcile the ledger', expected: '201 · one posting · $350.00 outstanding' },
  { id: 'insufficient-credit', title: 'Insufficient credit', description: 'Request $750.01 against $750.00 available and verify no state change.', featureLine: 42, scenario: 'Business rule failures leave no ledger entry', expected: '422 · INSUFFICIENT_CREDIT · zero postings' },
  { id: 'identical-replay', title: 'Identical replay', description: 'Send 10 and 10.00 with one key; verify one immutable receipt.', featureLine: 63, scenario: 'Replaying normalized payment after later activity returns the original receipt', expected: '201 → 200 · same receipt · one posting' },
  { id: 'conflicting-key', title: 'Conflicting key', description: 'Reuse a payment key with a different amount and verify the rejection.', featureLine: 76, scenario: 'Conflicting idempotency key is rejected', expected: '201 → 409 · IDEMPOTENCY_CONFLICT · one posting' }
] as const;
export type LabScenarioId = typeof labScenarios[number]['id'];
export type LabCheck = { label: string; passed: boolean };
type Posting = { intent: Intent; status: number; replayed: boolean | null; receipt: Entry | null; errorCode: string | null };
export type LabRun = {
  id: string; scenarioId: LabScenarioId; steps: readonly Intent[];
  status: 'ready' | 'running' | 'passed' | 'failed' | 'inconclusive';
  phase: 'create' | 'initial' | 'post' | 'final' | 'done'; stepIndex: number;
  recovery: 'retry' | 'refresh' | 'restart' | null; message: string;
  accountId?: string; before?: Snapshot; after?: Snapshot;
  exchanges: Exchange[]; checks: LabCheck[]; postings: Posting[];
};
export function createLabRun(scenario: string, runId: string): LabRun {
  if (!labScenarios.some(item => item.id === scenario)) throw new Error('Unknown lab scenario.');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) throw new Error('Invalid lab run identity.');
  const key = `lab-${runId}`;
  const steps: Intent[] = scenario === 'purchase' ? [{ operation: 'purchases', amount: '100.00', key }]
    : scenario === 'insufficient-credit' ? [{ operation: 'purchases', amount: '750.01', key }]
    : [{ operation: 'payments', amount: '10', key }, { operation: 'payments', amount: scenario === 'identical-replay' ? '10.00' : '11', key }];
  return { id: runId, scenarioId: scenario as LabScenarioId, steps: Object.freeze(steps.map(step => Object.freeze(step))), status: 'ready', phase: 'create', stepIndex: 0, recovery: null, message: 'Ready to run against a fresh isolated lab account.', exchanges: [], checks: [], postings: [] };
}
export function createLabTransport(fetcher: typeof fetch = fetch): LabTransport {
  return {
    create: signal => observeRequest('/api/lab/sandbox', { method: 'POST', signal }, undefined, fetcher),
    snapshot: signal => observeRequest('/api/lab/banking', { method: 'GET', signal }, undefined, fetcher),
    post: (intent, signal, accountId) => observeRequest('/api/lab/banking', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-Lab-Account': accountId ?? '' }, body: JSON.stringify(intent) }, intent, fetcher)
  };
}
function check(run: LabRun, label: string, passed: boolean): boolean {
  run.checks.push({ label, passed });
  return passed;
}
function fail(run: LabRun, message: string): LabRun {
  run.status = 'failed'; run.phase = 'done'; run.recovery = null; run.message = message;
  return run;
}
function interrupted(run: LabRun): LabRun {
  run.status = 'inconclusive';
  run.recovery = run.phase === 'post' ? 'retry' : run.phase === 'initial' || run.phase === 'final' ? 'refresh' : 'restart';
  run.message = run.recovery === 'retry' ? 'The posting outcome is unconfirmed. Retry the exact request to reconcile it safely.'
    : run.recovery === 'refresh' ? 'The account snapshot is unconfirmed. Refresh to continue; confirmed postings will not be repeated.'
    : 'Account creation could not be confirmed. Start a new lab run when ready.';
  return run;
}
const payloadObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const intentMoney = (value: string): bigint => cents(`${value.split('.')[0]}.${(value.split('.')[1] ?? '').padEnd(2, '0')}`);
const sameEntry = (a: Entry, b: Entry): boolean => (['id', 'accountId', 'sequence', 'kind', 'amount', 'balanceAfter', 'availableAfter', 'postedAt'] as const).every(key => a[key] === b[key]);

function verifyFinal(run: LabRun): LabRun {
  const before = run.before!;
  const after = run.after!;
  const entries = after.history.entries;
  const expectedOutstanding = run.scenarioId === 'purchase' ? '350.00' : run.scenarioId === 'insufficient-credit' ? '250.00' : '240.00';
  const expectedAvailable = run.scenarioId === 'purchase' ? '650.00' : run.scenarioId === 'insufficient-credit' ? '750.00' : '760.00';
  const expectedCount = run.scenarioId === 'insufficient-credit' ? 0 : 1;
  check(run, 'Final snapshot belongs to this isolated USD account', after.account.id === run.accountId && after.account.currency === 'USD' && after.account.creditLimit === before.account.creditLimit);
  check(run, `Outstanding ${expectedOutstanding}; available ${expectedAvailable}`, after.account.outstandingBalance === expectedOutstanding && after.account.availableCredit === expectedAvailable);
  check(run, 'Outstanding plus available equals the credit limit exactly', cents(after.account.outstandingBalance) + cents(after.account.availableCredit) === cents(after.account.creditLimit));
  check(run, `Complete ledger contains ${expectedCount} persisted posting${expectedCount === 1 ? '' : 's'}`, after.history.nextCursor === null && entries.length === expectedCount);
  check(run, 'Ledger identities are unique and ordered newest first', new Set(entries.map(entry => entry.id)).size === entries.length && entries.every((entry, index) => entry.accountId === run.accountId && (index === 0 || entries[index - 1].sequence > entry.sequence)));
  const persisted = new Map<string, Entry>();
  for (const posting of run.postings) if (posting.receipt) persisted.set(posting.receipt.id, posting.receipt);
  check(run, 'Every confirmed receipt appears unchanged exactly once', persisted.size === expectedCount && entries.every(entry => !!persisted.get(entry.id) && sameEntry(entry, persisted.get(entry.id)!)));
  let balance = cents(before.account.outstandingBalance);
  let reconciles = true;
  for (const entry of [...entries].reverse()) {
    const amount = cents(entry.amount);
    balance += entry.kind === 'PURCHASE' ? amount : -amount;
    reconciles &&= amount > 0n && balance >= 0n && balance <= cents(after.account.creditLimit) && moneyString(balance) === entry.balanceAfter && moneyString(cents(after.account.creditLimit) - balance) === entry.availableAfter;
  }
  check(run, 'Each receipt and final balance reconcile using exact cents', reconciles && moneyString(balance) === after.account.outstandingBalance);
  if (run.scenarioId === 'identical-replay') check(run, 'Replay returns the complete original immutable receipt', !!run.postings[0]?.receipt && !!run.postings[1]?.receipt && sameEntry(run.postings[0].receipt, run.postings[1].receipt));
  run.status = run.checks.every(item => item.passed) ? 'passed' : 'failed';
  run.phase = 'done'; run.recovery = null;
  run.message = run.status === 'passed' ? 'Passed. Actual HTTP responses, account balances and the persisted ledger agree.' : 'Failed. The observed API result did not satisfy every financial invariant.';
  return run;
}

/** One bounded sequence, with explicit continuation only after a user requests recovery. */
export async function advanceLabRun(source: LabRun, transport: LabTransport, options: { signal?: AbortSignal; onExchange?: (exchange: Exchange) => void } = {}): Promise<LabRun> {
  const run: LabRun = { ...source, exchanges: [...source.exchanges], checks: [...source.checks], postings: [...source.postings] };
  if (run.phase === 'done' || source.status === 'inconclusive' && source.recovery === 'restart') return run;
  const recoveringPost = source.status === 'inconclusive' && source.recovery === 'retry';
  run.status = 'running'; run.recovery = null;
  // Creation + initial read + at most two postings + final read: never poll or auto-retry.
  for (let request = 0; request < 5; request++) {
    if (options.signal?.aborted) return interrupted(run);
    const phase = run.phase;
    let observed: Observation;
    try {
      observed = phase === 'create' ? await transport.create(options.signal)
        : phase === 'initial' || phase === 'final' ? await transport.snapshot(options.signal)
        : await transport.post(run.steps[run.stepIndex], options.signal, run.accountId);
    } catch { return interrupted(run); }
    run.exchanges.push(observed.exchange);
    options.onExchange?.(observed.exchange);
    const status = observed.exchange.status;
    if (status === 429) {
      interrupted(run);
      run.message = run.phase === 'create' ? 'Sandbox creation limit reached. No further requests were sent. Start a fresh lab run after the limit resets.'
        : run.phase === 'post' ? 'Request limit reached. No further requests were sent. Retry the same saved request after the limit resets.'
        : 'Request limit reached. No further requests were sent. Refresh the lab account after the limit resets.';
      return run;
    }
    if (status === 401 || status === 409 && payloadObject(observed.payload).code === 'LAB_SESSION_CHANGED') {
      run.status = 'inconclusive'; run.recovery = 'restart';
      run.message = `${status === 401 ? 'The lab session expired.' : 'The lab account changed in another tab.'} Prior posting outcomes remain as recorded. Start a fresh lab run to continue.`;
      return run;
    }
    if (status === null || status >= 500 || observed.exchange.outcome === 'uncertain') return interrupted(run);
    if (phase === 'create') {
      const created = payloadObject(observed.payload);
      if (!check(run, 'Fresh lab account created with HTTP 201', status === 201 && typeof created.accountId === 'string')) return fail(run, 'Lab account creation did not match its contract.');
      run.accountId = created.accountId as string;
      run.phase = 'initial';
    } else if (phase === 'initial' || phase === 'final') {
      const snapshot = readSnapshot(observed.payload);
      if (!check(run, phase === 'initial' ? 'Initial account and ledger returned HTTP 200' : 'Final account and ledger returned HTTP 200', status === 200 && !!snapshot)) return fail(run, 'The account snapshot did not match its contract.');
      if (phase === 'initial') {
        run.before = snapshot!;
        const fresh = snapshot!.account.id === run.accountId && snapshot!.account.currency === 'USD' && snapshot!.account.creditLimit === '1000.00' && snapshot!.account.outstandingBalance === '250.00' && snapshot!.account.availableCredit === '750.00' && snapshot!.history.entries.length === 0 && snapshot!.history.nextCursor === null;
        if (!check(run, 'Fresh owned account starts at 250.00 outstanding and 750.00 available with an empty ledger', fresh)) return fail(run, 'The lab account was not fresh and isolated. No posting was submitted.');
        run.phase = 'post';
      } else { run.after = snapshot!; return verifyFinal(run); }
    } else {
      const intent = run.steps[run.stepIndex];
      const expectedReject = run.scenarioId === 'insufficient-credit' || run.scenarioId === 'conflicting-key' && run.stepIndex === 1;
      const expectedCode = run.scenarioId === 'insufficient-credit' ? 'INSUFFICIENT_CREDIT' : 'IDEMPOTENCY_CONFLICT';
      const receipt = readEntry(observed.payload);
      const errorCode = typeof payloadObject(observed.payload).code === 'string' ? String(payloadObject(observed.payload).code) : null;
      if (expectedReject) {
        const expectedStatus = run.scenarioId === 'insufficient-credit' ? 422 : 409;
        if (!check(run, `HTTP ${expectedStatus} · ${expectedCode}`, status === expectedStatus && errorCode === expectedCode)) return fail(run, 'The API did not return the expected rejection.');
      } else {
        const replayExpected = run.scenarioId === 'identical-replay' && run.stepIndex === 1;
        const recovered = recoveringPost && run.stepIndex === source.stepIndex;
        const validStatus = replayExpected ? status === 200 && observed.exchange.replayed === true
          : status === 201 && observed.exchange.replayed === false || recovered && status === 200 && observed.exchange.replayed === true;
        if (!check(run, replayExpected ? 'HTTP 200 · replay confirmed' : 'Posting confirmed with a new receipt or the same safely retried request', validStatus)) return fail(run, 'The posting status or replay header was unexpected.');
        const expectedKind = intent.operation === 'payments' ? 'PAYMENT' : 'PURCHASE';
        if (!check(run, `Receipt identifies this account and the exact ${intent.amount} ${expectedKind.toLowerCase()}`, !!receipt && receipt.accountId === run.accountId && receipt.kind === expectedKind && cents(receipt.amount) === intentMoney(intent.amount))) return fail(run, 'The receipt did not identify the submitted transaction.');
      }
      run.postings.push({ intent, status, replayed: observed.exchange.replayed, receipt, errorCode });
      run.stepIndex++;
      run.phase = run.stepIndex < run.steps.length ? 'post' : 'final';
    }
  }
  return interrupted(run);
}
