'use client';

import { useEffect, useRef, useState } from 'react';
import { formatMoney, newIdentity, type Exchange } from '../lib/banking';
import { advanceLabRun, createLabRun, createLabTransport, labScenarios, type LabRun, type LabScenarioId } from '../lib/correctness-lab';

const featureSource = 'https://github.com/farhan-shafee/creditflow-qe/blob/5b65732a9ce8fd77ea0052215d1d8f6156629441/automation/api-bdd/src/test/resources/features/credit-card.feature';
export default function CorrectnessLab({ onInspect }: { onInspect?: (exchange: Exchange) => void }) {
  const [selected, setSelected] = useState<LabScenarioId>('purchase');
  const [run, setRun] = useState<LabRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<Exchange[]>([]);
  const runRef = useRef<LabRun | null>(null);
  const active = useRef(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; controller.current?.abort(); };
  }, []);
  const scenario = labScenarios.find(item => item.id === selected)!;
  const recovery = run?.status === 'inconclusive' ? run.recovery : null;
  async function execute(fresh: boolean) {
    if (active.current) return;
    active.current = true;
    const source = fresh ? createLabRun(selected, newIdentity()) : runRef.current;
    if (!source) { active.current = false; return; }
    const currentGeneration = ++generation.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setLive(source.exchanges); setRun({ ...source, status: 'running', message: 'Running a bounded sequence against the real API…' });
    runRef.current = source;
    try {
      const result = await advanceLabRun(source, createLabTransport(), { signal: abort.signal, onExchange(exchange) {
        if (!mounted.current || generation.current !== currentGeneration) return;
        setLive(previous => [...previous, exchange]);
        onInspect?.(exchange);
      } });
      if (mounted.current && generation.current === currentGeneration) { runRef.current = result; setRun(result); }
    } finally {
      if (generation.current === currentGeneration) { active.current = false; controller.current = null; if (mounted.current) setBusy(false); }
    }
  }
  const status = busy ? 'running' : run?.status ?? 'ready';
  const statusText = ({ ready: 'Ready to run', running: 'Running', passed: 'Passed', failed: 'Failed', inconclusive: 'Inconclusive' } as const)[status];
  const locked = busy || recovery === 'retry' || recovery === 'refresh';
  function selectScenario(value: LabScenarioId) {
    if (locked || active.current) return;
    setSelected(value); setRun(null); runRef.current = null; setLive([]);
  }
  return <section id="lab" className="section correctness-lab" aria-labelledby="lab-title">
    <div className="section-heading"><div><div className="eyebrow">CORRECTNESS LAB</div><h2 id="lab-title">Put the financial rules to the test.</h2><p>Four focused demos. Actual responses, exact balances and a persisted ledger.</p></div><span className={`tag lab-result ${status}`} role="status" aria-live="polite" data-testid="lab-status" data-state={status}>{statusText}</span></div>
    <div className="lab-layout">
      <div className="panel lab-controls"><div className="panel-top"><h3>Choose a behavior</h3><span className="mini-label">REAL API</span></div>
        <label htmlFor="lab-scenario">Scenario</label><select id="lab-scenario" data-testid="lab-select" value={selected} onChange={event => selectScenario(event.target.value as LabScenarioId)} disabled={locked}>{labScenarios.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        <p>{scenario.description}</p><div className="lab-expected"><span className="mini-label">EXPECTED BEHAVIOR</span><p>{scenario.expected}</p></div>
        <div className="lab-actions"><button className="button" data-testid="lab-run" disabled={locked} onClick={() => void execute(true)}>{run ? 'Run a fresh demo' : 'Run this demo'} <span aria-hidden="true">→</span></button>
          {busy ? <button className="button secondary" data-testid="lab-cancel" onClick={() => controller.current?.abort()}>Stop run</button> : null}
          {!busy && recovery === 'retry' ? <button className="button" data-testid="lab-retry" onClick={() => void execute(false)}>Retry the same request</button> : null}
          {!busy && recovery === 'refresh' ? <button className="button" data-testid="lab-refresh" onClick={() => void execute(false)}>Refresh lab account</button> : null}</div>
        <p className="fine">Each run creates its own lab account, separate from the banking simulator. A normal run makes at most five browser requests. No background polling.</p>
      </div>
      <div className="panel lab-proof"><div className="panel-top"><h3>Observed proof</h3><span className="mini-label">BROWSER DEMO</span></div>
        <p className="lab-message" aria-live="polite">{busy ? 'Running a bounded sequence against the real API…' : run?.message ?? 'Run a scenario to compare actual HTTP responses with the resulting financial state.'}</p>
        {run?.before || run?.after ? <div className="lab-balances"><div><span>Before</span><strong>{run.before ? formatMoney(run.before.account.outstandingBalance) : '—'}</strong><small>Outstanding · {run.before ? formatMoney(run.before.account.availableCredit) : '—'} available</small></div><div><span>After</span><strong data-testid="lab-outstanding">{run.after ? formatMoney(run.after.account.outstandingBalance) : '—'}</strong><small>Outstanding · <span data-testid="lab-available">{run.after ? formatMoney(run.after.account.availableCredit) : '—'}</span> available</small></div></div> : null}
        {run?.checks.length ? <ul className="lab-checks" aria-label="Financial assertions">{run.checks.map((check, index) => <li data-testid="lab-check" data-passed={check.passed} key={`${index}-${check.label}`}><span aria-hidden="true">{check.passed ? '✓' : '×'}</span><span>{check.label}</span><span className="sr-only">{check.passed ? 'Passed' : 'Failed'}</span></li>)}</ul> : <div className="empty lab-empty">The result appears only after the API responds.</div>}
      </div>
    </div>
    {live.length ? <div className="panel lab-exchanges"><div className="panel-top"><h3>Request sequence</h3><span className="mini-label">OBSERVED HTTP</span></div><ol>{live.map((exchange, index) => <li data-testid="lab-exchange" key={exchange.id}><span className="lab-step">{String(index + 1).padStart(2, '0')}</span><div><strong>{exchange.operation}</strong><small>{exchange.method} {exchange.path}{exchange.amount ? ` · ${exchange.amount} USD` : ''}</small></div><span className={`http-status ${exchange.outcome}`}>{exchange.status ?? 'Unconfirmed'}{exchange.replayed === true ? ' · replay' : ''}</span><button type="button" className="text-link" aria-label={`Inspect lab request ${index + 1}`} onClick={() => onInspect?.(exchange)}>Inspect ↗</button></li>)}</ol></div> : null}
    <p className="fine lab-source">This browser demo checks a bounded example of the behavior in <a href={`${featureSource}#L${scenario.featureLine}`} target="_blank" rel="noreferrer">“{scenario.scenario}” ↗</a>. Cucumber execution and CI evidence are reported separately.</p>
  </section>;
}
