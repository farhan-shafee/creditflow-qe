'use client';
import { useEffect, useRef, useState } from 'react';
import { newIdentity, observeRequest, readEntry, type Exchange, type Intent, type Snapshot } from '../../lib/banking';
import { bindPosting, creationDecision, certifyPendingExchange, sessionDecision, type PendingPosting } from '../../lib/simulator-state';
import { beginFresh, clearPending, finishFresh, finishPending, loadPending, markFreshCreated, savePending, type TabStorage } from '../../lib/pending-storage';

function tabStorage(): TabStorage | null {
  try { return window.sessionStorage; } catch { return null; }
}

export function useSimulator(onInspect: (exchange: Exchange) => void) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('Start a private synthetic account. All balances come from the Java API.');
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('50.00');
  const [operation, setOperation] = useState<Intent['operation']>('payments');
  const [recovery, setRecovery] = useState<'refresh' | 'retry' | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const pending = useRef<PendingPosting | null>(null);
  const acknowledged = useRef<'posted' | 'rejected' | null>(null);
  const working = useRef(false);
  const currentAccount = useRef<string | null>(null);
  const freshRequired = useRef(false);

  function endSession(reason: 'expired' | 'changed', report = true) {
    const unresolved = pending.current !== null;
    const priorOutcome = acknowledged.current;
    pending.current = null; currentAccount.current = null;
    acknowledged.current = null;
    if (!freshRequired.current) clearPending(tabStorage());
    setData(null); setRecovery(null); setHighlightId(null);
    if (report) {
      const prior = !unresolved ? '' : priorOutcome === 'posted' ? ' The posting was confirmed on its original account, but that account could not be refreshed.' : priorOutcome === 'rejected' ? ' The request was rejected before the account became unavailable.' : ' The previous request remains unconfirmed and may have committed to its original account.';
      setError(`${reason === 'expired' ? 'Your synthetic session expired.' : 'The synthetic account changed in another tab.'}${prior} Start a fresh synthetic account to continue.`);
      setMessage('A fresh account must be started explicitly before another transaction.');
    }
  }
  async function refresh(signal?: AbortSignal, requireSession = true): Promise<'ready' | 'terminal' | 'aborted'> {
    const { exchange } = await observeRequest('/api/banking', { cache: 'no-store', signal });
    if (signal?.aborted) return 'aborted';
    const decision = sessionDecision(exchange, pending.current);
    if (decision.kind === 'expired' || decision.kind === 'changed') { endSession(decision.kind, requireSession); return 'terminal'; }
    if (decision.kind !== 'ready') throw new Error('Could not refresh authoritative account state. Refresh before another transaction.');
    if (freshRequired.current) {
      if (!finishFresh(tabStorage(), decision.snapshot)) {
        setData(null); currentAccount.current = null; setRecovery(null);
        setError('A fresh account could not be confirmed. The previous request may remain unconfirmed. Start a replacement account explicitly before posting.');
        setMessage('The recovery barrier remains until a new account and its authoritative snapshot agree.');
        return 'terminal';
      }
      freshRequired.current = false; setRecovery(null);
    }
    setData(decision.snapshot); currentAccount.current = decision.snapshot.account.id;
    return 'ready';
  }
  useEffect(() => {
    const controller = new AbortController();
    const restored = loadPending(tabStorage());
    if (restored.kind === 'invalid' || restored.kind === 'unavailable') {
      setError(restored.kind === 'invalid' ? 'The saved request could not be validated. An earlier request may have committed. Start a fresh synthetic account explicitly before posting again.' : 'Tab storage is unavailable, so a previous request cannot be recovered safely. Enable session storage and start a fresh synthetic account before posting.');
      setMessage('A fresh account must be started explicitly before another transaction.');
      setLoading(false);
      return () => controller.abort();
    }
    if (restored.kind === 'pending') {
      pending.current = bindPosting(restored.record.intent, restored.record.accountId);
      acknowledged.current = restored.record.acknowledged;
      setOperation(restored.record.intent.operation); setAmount(restored.record.intent.amount);
      setRecovery(restored.record.phase);
    } else if (restored.kind === 'fresh-required') {
      freshRequired.current = true; setRecovery('refresh');
    }
    refresh(controller.signal, restored.kind === 'pending' || restored.kind === 'fresh-required').then(result => {
      if (controller.signal.aborted || result !== 'ready') return;
      setMessage(restored.kind !== 'pending' ? 'Existing synthetic account restored. Balances and ledger refreshed from the API.'
        : restored.record.phase === 'retry' ? 'Saved request restored for its original account. Current balances are refreshed; retry its exact identity to obtain the receipt.'
        : restored.record.acknowledged === 'posted' ? 'Confirmed posting restored. Refresh the account to finish reconciliation without another posting.'
        : 'Rejected request restored. Refresh the account to finish reconciliation.');
    }).catch(() => { if (!controller.signal.aborted) setError('Account state is unavailable. Refresh before continuing the saved request.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function completeRecovery(): boolean {
    if (pending.current && !finishPending(tabStorage(), pending.current, currentAccount.current ?? '', acknowledged.current)) {
      setError('Account state refreshed, but its recovery record could not be cleared. Enable tab storage and refresh again before a new transaction.');
      setRecovery(acknowledged.current === null ? 'retry' : 'refresh');
      return false;
    }
    pending.current = null; acknowledged.current = null; setRecovery(null);
    return true;
  }

  async function start() {
    if (working.current || pending.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (!beginFresh(tabStorage(), currentAccount.current)) throw new Error('The recovery barrier could not be saved. Enable tab storage before starting a replacement account.');
      freshRequired.current = true; setRecovery('refresh');
      const { exchange } = await observeRequest('/api/sandbox', { method: 'POST' });
      onInspect(exchange);
      const decision = creationDecision(exchange);
      if (decision === 'rejected') throw new Error(exchange.status === 429 ? 'Sandbox creation limit reached. Try again later.' : 'Account creation was rejected. Try again when ready.');
      setRecovery('refresh');
      if (decision === 'unconfirmed') throw new Error('Account creation could not be confirmed. Refresh the account before trying again.');
      if (!markFreshCreated(tabStorage(), String(exchange.response?.accountId ?? ''))) throw new Error('The account was created, but its recovery identity could not be saved. Refresh or start a replacement account explicitly.');
      if (await refresh() !== 'ready') return;
      setRecovery(null); setHighlightId(null);
      setMessage('Synthetic account ready. It has a private, expiring session and no real funds.');
    } catch (e) { setError(e instanceof Error ? e.message : 'The account is unavailable.'); }
    finally { working.current = false; setBusy(false); setLoading(false); }
  }
  async function reconcile() {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try {
      if (await refresh() !== 'ready') return;
      if (recovery === 'retry' && pending.current) {
        setMessage('Authoritative state refreshed. The intent remains unconfirmed: retry its saved identity to obtain the receipt.');
      } else {
        if (!completeRecovery()) return;
        setMessage('Account and ledger reconciled with the API.');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Account refresh is unavailable.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function postIntent() {
    if (working.current || !pending.current) return;
    if (acknowledged.current !== null) { setRecovery('refresh'); return; }
    const bound = pending.current;
    if (loading || currentAccount.current !== bound.accountId) {
      setError('Refresh authoritative account state before retrying the saved request. No transaction was sent.');
      return;
    }
    const intent = bound.intent;
    working.current = true; setBusy(true); setError(''); setRecovery('retry');
    try {
      if (!savePending(tabStorage(), bound, 'retry', null)) {
        setError('No request was sent in this attempt because its retry identity could not be saved. Enable tab storage, then retry the saved request.');
        return;
      }
      const observed = await observeRequest('/api/banking', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Expected-Account': bound.accountId }, body: JSON.stringify(intent) }, intent);
      const { decision, exchange } = certifyPendingExchange(bound, observed.exchange);
      onInspect(exchange);
      if (decision === 'expired' || decision === 'changed') { endSession(decision); return; }
      if (decision === 'retry') {
        setError('Response unconfirmed. The transaction may have committed. Retry the exact saved intent; a new submission is locked.');
        return;
      }
      acknowledged.current = decision === 'refresh' ? 'posted' : 'rejected';
      setRecovery('refresh');
      savePending(tabStorage(), bound, 'refresh', acknowledged.current);
      const entry = readEntry(exchange.response);
      if (decision === 'refresh' && exchange.status === 201 && entry) setHighlightId(entry.id);
      if (decision === 'rejected') setError(`${String(exchange.response?.code ?? 'REQUEST_REJECTED')}: ${String(exchange.response?.message ?? 'The API rejected this request.')}`);
      if (await refresh() !== 'ready') return;
      if (!completeRecovery()) return;
      setMessage(decision === 'rejected' ? 'Request rejected by the API. Account and ledger have been refreshed.' : exchange.replayed ? 'Original receipt returned. The same intent produced no duplicate posting.' : 'Transaction confirmed. Balances and ledger refreshed from PostgreSQL.');
    } catch { setError('Account refresh is unavailable. The posting response is recorded; refresh state before a new transaction.'); }
    finally { working.current = false; setBusy(false); }
  }
  function submit() {
    if (working.current || recovery || pending.current || !data || !currentAccount.current) return;
    pending.current = bindPosting({ operation, amount, key: newIdentity() }, currentAccount.current);
    acknowledged.current = null;
    void postIntent();
  }
  return { data, busy, loading, message, error, amount, setAmount, operation, setOperation,
    recovery, canReplaceAccount: freshRequired.current && pending.current === null, highlightId, start, reconcile, postIntent, submit };
}
