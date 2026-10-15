'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Account = { id: string; currency: string; creditLimit: string; outstandingBalance: string; availableCredit: string; expiresAt: string };
type Entry = { id: string; sequence: number; kind: string; amount: string; balanceAfter: string; postedAt: string };
type Snapshot = { account: Account; history: { entries: Entry[]; nextCursor: number | null } };
const repo = 'https://github.com/farhan-shafee/creditflow-qe';
const verifiedCommit = '39e1728e6aca03f1e9c3d435a028e0316542edce';
const verifiedRun = `${repo}/actions/runs/38682147631`;
const verifiedTree = `${repo}/tree/${verifiedCommit}`;
const verifiedBlob = `${repo}/blob/${verifiedCommit}`;
const evidenceRecord = `${repo}/blob/feat/provider-pilot/docs/evidence/STATUS.md`;
const navigation = [['01', 'Overview', '#overview'], ['02', 'Banking simulator', '#simulator'], ['03', 'API explorer', '#api'], ['04', 'Test automation', '#automation'], ['05', 'Architecture', '#architecture'], ['06', 'Interview walkthrough', '#interview']];

export default function CommandCenter() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Start a private synthetic account to exercise the real API.');
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('50.00');
  const [operation, setOperation] = useState('payments');
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [recovery, setRecovery] = useState<'refresh' | 'retry' | null>(null);
  const pending = useRef<{ operation: string; amount: string; key: string } | null>(null);
  async function refresh(signal?: AbortSignal) {
    const response = await fetch('/api/banking', { cache: 'no-store', signal });
    if (response.ok) { const payload = await response.json() as Snapshot; setData(payload); return; }
    if (response.status === 401) { setData(null); return; }
    throw new Error('Could not refresh account state. Retry before submitting another transaction.');
  }
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Connection unavailable.'); });
    return () => controller.abort();
  }, []);
  async function start() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/sandbox', { method: 'POST' });
      if (!r.ok) throw new Error(r.status === 429 ? 'Sandbox creation limit reached. Try again later.' : 'The banking sandbox is temporarily unavailable. Please try again.');
      pending.current = null; setRecovery(null); setReceipt(null); await refresh(); setMessage('Fresh synthetic account created. Your session expires in 30 minutes.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  async function reconcile() {
    setBusy(true); setError('');
    try { await refresh(); pending.current = null; setRecovery(null); setMessage('Account state reconciled with PostgreSQL.'); }
    catch { setError('Could not refresh account state. Refresh before posting another transaction.'); }
    finally { setBusy(false); }
  }
  async function postIntent() {
    if (!pending.current) return;
    setBusy(true); setError(''); setRecovery('retry');
    try {
      const r = await fetch('/api/banking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current) });
      const payload = await r.json() as Record<string, unknown>;
      setReceipt(payload);
      if (!r.ok) {
        if (r.status < 500) { pending.current = null; setRecovery(null); }
        throw new Error(`${String(payload.code ?? 'REQUEST_FAILED')}: ${String(payload.message ?? 'Request rejected')}`);
      }
      setRecovery('refresh');
      await refresh(); pending.current = null; setRecovery(null); setMessage('Transaction posted. Balances and ledger refreshed from PostgreSQL.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Retry the last transaction safely.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || recovery) return;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    pending.current = { operation, amount, key: Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('') };
    await postIntent();
  }
  const a = data?.account;
  const utilization = a ? Number(a.outstandingBalance) / Number(a.creditLimit) * 100 : 0;
  return <div className="shell">
    <a className="skip" href="#main">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#overview"><span className="brandmark">C<span>F</span></span><span>CreditFlow<span className="brand-sub">QUALITY ENGINEERING</span></span></a>
      <div className="workspace">ENGINEERING WORKSPACE</div>
      <nav aria-label="Main navigation">{navigation.map(([n, text, href]) => <a key={n} href={href}><span>{n}</span>{text}</a>)}</nav>
      <div className="sidebar-bottom"><span className="dot" /> Synthetic environment<p>Real application. Real tests.<br />No real funds.</p><a href={verifiedTree} target="_blank" rel="noreferrer">View tested baseline ↗</a></div>
    </aside>
    <main id="main">
      <header className="topbar"><span>PROJECT / CREDITFLOW QE</span><div><span className="pill">Synthetic USD</span><a href={verifiedRun} target="_blank" rel="noreferrer">Baseline CI ↗</a></div></header>
      <section id="overview" className="hero">
        <div><div className="eyebrow">THE AUTOMATION COMMAND CENTER</div><h1>Financial logic.<br /><span>Executable proof.</span></h1><p>A working credit-card ledger, independently tested through Java and Cucumber. Explore the behavior, inspect the contracts, follow the evidence.</p><div className="hero-actions"><a className="button" href="#simulator">Open banking simulator <span>↗</span></a><a className="text-link" href={verifiedRun}>Inspect baseline CI ↗</a></div><div className="tech-row">{['Java 21', 'Spring Boot', 'Cucumber', 'REST Assured', 'PostgreSQL'].map(t => <span key={t}>{t}</span>)}</div></div>
        <div className="ledger-visual" aria-label="Transaction correctness principles"><div className="visual-top"><span>CF / ENGINEERING LEDGER</span><span>01</span></div><div className="visual-title">Every state change<br />has a receipt.</div><div className="visual-rule"><span>01</span><div>Validate the contract<small>Exact decimal input</small></div><b>↗</b></div><div className="visual-rule"><span>02</span><div>Commit atomically<small>Balance + immutable ledger</small></div><b>↗</b></div><div className="visual-rule"><span>03</span><div>Prove the behavior<small>Independent HTTP assertions</small></div><b>↗</b></div><div className="visual-footer">ISOLATED SESSIONS <span>•</span> IDEMPOTENT REQUESTS</div></div>
      </section>
      <section id="simulator" className="section">
        <div className="section-heading"><div><div className="eyebrow">01 / BANKING SIMULATOR</div><h2>Exercise the real system.</h2><p>Fresh synthetic data for your session. Changes persist until its 30-minute expiry.</p></div><button onClick={start} disabled={busy} data-testid="start-sandbox" className="button">{a ? 'Start fresh account' : 'Start synthetic account'} <span>＋</span></button></div>
        <div role="status" className="notice">{busy ? 'Processing request…' : message}</div>
        {error ? <div role="alert" data-testid="error" className="error">{error}</div> : null}
        {recovery ? <button type="button" className="button" disabled={busy} data-testid={recovery === 'refresh' ? 'refresh-account' : 'retry-transaction'} onClick={recovery === 'refresh' ? reconcile : postIntent}>{recovery === 'refresh' ? 'Refresh account' : 'Retry last transaction'}</button> : null}
        <div className="metrics">{[['Credit limit', a?.creditLimit, 'USD / fixed synthetic limit', 'credit-limit'], ['Outstanding balance', a?.outstandingBalance, 'Posted purchases − payments', 'outstanding'], ['Available credit', a?.availableCredit, 'Limit − outstanding balance', 'available']].map(([title, value, hint, id]) => <div className="metric" key={id}><span>{title}</span><strong data-testid={id}>{value ? `$${value}` : '—'}</strong><small>{hint}</small></div>)}</div>
        <div className="sim-grid"><form className="panel" onSubmit={submit}><div className="panel-top"><h3>Post a transaction</h3><span className="mini-label">USD</span></div><label htmlFor="operation">Operation</label><select id="operation" data-testid="operation" value={operation} onChange={e => setOperation(e.target.value)} disabled={busy || !!recovery}><option value="payments">Simulated payment</option><option value="purchases">Simulated purchase</option></select><label htmlFor="amount">Amount</label><div className="amount-input"><span>$</span><input id="amount" data-testid="amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} required maxLength={14} disabled={busy || !!recovery} /></div><button className="button full" data-testid="submit-transaction" disabled={busy || !!recovery || !a} type="submit">Post simulated transaction <span>→</span></button><p className="fine">The API enforces precision, credit limits, overpayment rules and idempotency. No real money moves.</p></form><div className="panel account-panel"><div className="panel-top"><h3>Session account</h3><span className="tag">{a ? 'ACTIVE' : 'NOT STARTED'}</span></div><div className="account-id">{a ? `CF •••• ${a.id.slice(-8).toUpperCase()}` : 'Your isolated account'}</div><p>{a ? 'This account belongs only to your sandbox session.' : 'Start an account to see live balances and transaction history.'}</p><div className="util-label"><span>Credit utilization</span><strong>{a ? `${utilization.toFixed(1)}%` : '—'}</strong></div><div className="meter" role="meter" aria-label="Credit utilization" aria-valuemin={0} aria-valuemax={100} aria-valuenow={utilization}><div style={{ width: `${utilization}%` }} /></div><div className="account-note"><span>AUTHENTICATION</span><b>Account-scoped, expiring session</b></div><div className="account-note"><span>DATA SOURCE</span><b>Live API → PostgreSQL</b></div></div></div>
        <div className="panel history"><div className="panel-top"><h3>Transaction ledger</h3><span className="mini-label">NEWEST FIRST / UP TO 50 ENTRIES</span></div><div className="table-scroll"><table><thead><tr><th>Sequence</th><th>Operation</th><th>Amount</th><th>Balance after</th><th>Posted at</th></tr></thead><tbody>{data?.history.entries.length ? data.history.entries.map(t => <tr key={t.id} data-testid="ledger-row"><td>#{t.sequence}</td><td><span className={`type ${t.kind.toLowerCase()}`}>{t.kind}</span></td><td>${t.amount}</td><td>${t.balanceAfter}</td><td>{new Date(t.postedAt).toLocaleTimeString()}</td></tr>) : <tr><td colSpan={5} className="empty">{a ? 'No transactions yet. Post a payment or purchase above.' : 'Start a synthetic account to view its ledger.'}</td></tr>}</tbody></table></div></div>
      </section>
      <section id="api" className="section"><div className="section-heading"><div><div className="eyebrow">02 / API EXPLORER</div><h2>Contracts you can inspect.</h2><p>Versioned endpoints, structured errors and explicit request identity.</p></div><a className="text-link" href={`${verifiedBlob}/services/banking-api/src/main/resources/static/openapi.yaml`}>OpenAPI source ↗</a></div><div className="api-grid"><div className="panel"><div className="endpoint"><b>POST</b><code>/api/v1/accounts/&#123;id&#125;/payments</code></div><pre>{'Authorization: Bearer <session-token>\nIdempotency-Key: payment-001\nContent-Type: application/json\n\n{ "amount": "50.00" }'}</pre><p className="fine">Representative request. Amount is a decimal string. Initial post: 201. Identical replay: 200. Conflicting key: 409.</p></div><div className="panel"><div className="panel-top"><h3>Latest transaction response</h3><span className="mini-label">LIVE SESSION</span></div><pre data-testid="receipt">{receipt ? JSON.stringify(receipt, null, 2) : '// Submit a transaction to inspect\n// its actual response here.'}</pre></div></div></section>
      <section id="automation" className="section"><div className="section-heading"><div><div className="eyebrow">03 / TEST AUTOMATION & CI</div><h2>Follow a rule through every layer.</h2><p>Inspect a tested reference revision and its reports, then follow the current release record.</p></div><a className="button secondary" href={verifiedRun}>Open baseline CI run ↗</a></div><div className="layer-grid">{[['01','Domain unit tests','Money precision, immutable state and credit boundaries.','services/banking-api/src/test/java/com/creditflow/banking/domain',verifiedTree],['02','PostgreSQL integration','Persistence, rollback, constraints, replay and concurrent updates.','services/banking-api/src/test/java/com/creditflow/banking/LedgerIT.java',verifiedBlob],['03','Independent Cucumber','Gherkin → scenario context → REST Assured → running API.','automation/api-bdd',verifiedTree],['04','Enterprise tooling','Separate TestNG matrix, Bruno collection and Jenkins pipeline.','docs/testing/strategy.md',verifiedBlob]].map(([n,t,d,p,source]) => <a className="layer" key={n} href={`${source}/${p}`}><span>{n}</span><h3>{t}</h3><p>{d}</p><b>Inspect implementation ↗</b></a>)}</div><details className="code-details"><summary>Read an executable scenario</summary><pre>{'Scenario: Concurrent requests cannot overspend available credit\n  When I submit 12 simultaneous purchases of "100"\n  Then exactly 7 responses have status 201\n  And exactly 5 responses have status 422\n  And the account has outstanding "950.00" and available "50.00"\n  And there are 7 ledger entries'}</pre></details><p className="fine">Source and CI links identify tested baseline <a href={`${repo}/commit/${verifiedCommit}`}>{verifiedCommit.slice(0, 7)}</a>. See the <a href={evidenceRecord}>current release and evidence record</a> for deployed frontend/API commits, later runs and verification limits. Authored configuration is not execution proof.</p></section>
      <section id="architecture" className="section"><div className="eyebrow">04 / ARCHITECTURE & DECISIONS</div><h2>Small system. Explicit boundaries.</h2><div className="architecture"><div><span>VISITOR</span><strong>Next.js command center</strong><small>HttpOnly session · same-origin writes</small></div><b>→</b><div><span>APPLICATION</span><strong>Spring Boot ledger</strong><small>Ownership · validation · row locks</small></div><b>→</b><div><span>PERSISTENCE</span><strong>PostgreSQL</strong><small>Atomic state + receipt · Flyway</small></div></div><div className="decisions">{[['Why exact decimals?','No rounding ambiguity. The backend calculates with BigDecimal; the UI displays returned strings.'],['Why row locks?','Concurrent operations serialize per account. The credit check and ledger entry share one transaction.'],['Why independent tests?','API automation imports no application classes, so it validates observable contracts rather than implementation details.']].map(([t,d]) => <article key={t}><h3>{t}</h3><p>{d}</p></article>)}</div></section>
      <section id="interview" className="walkthrough"><div><div className="eyebrow">05 / THE FIVE-MINUTE WALKTHROUGH</div><h2>Run it. Explain it.<br />Rebuild the important parts.</h2><p>Domain rules → transactional service → Cucumber architecture → execution evidence → trade-offs.</p><a className="button" href={`${verifiedBlob}/docs/interview-guide/five-minute-walkthrough.md`}>Open the interview guide ↗</a></div><div className="walkthrough-note">BUILT TO BE DEFENDED<p>This portfolio project was built with AI assistance. The interview goal is to understand, reproduce and debug the engineering personally.</p></div></section>
      <footer><span>CreditFlow QE / Farhan Shafee</span><span>Synthetic data only. No real banking services.</span><a href={verifiedRun}>Baseline CI run ↗</a></footer>
    </main>
  </div>;
}
