'use client';
import type { Exchange } from '../../lib/banking';
export default function TransactionInspector({ exchange, details }: { exchange: Exchange | null; details: () => void }) {
  return <div className="panel inspector"><div className="panel-top"><div><div className="eyebrow">OBSERVED APPLICATION TRAFFIC</div><h3>Transaction inspector</h3></div><span className={`tag ${exchange?.outcome === 'uncertain' ? 'warning' : ''}`}>{exchange ? exchange.outcome : 'Awaiting request'}</span></div>
    <p className="fine">Real responses through the same-origin application. Credentials stay on the server.</p>
    <dl className="inspector-facts"><div><dt>Operation</dt><dd data-testid="inspector-operation">{exchange ? exchange.operation.replace('payments', 'Payment').replace('purchases', 'Purchase') : '—'}</dd></div><div><dt>HTTP status</dt><dd data-testid="inspector-status">{exchange?.status ?? (exchange ? 'Unconfirmed' : '—')}</dd></div><div><dt>HTTP round trip</dt><dd data-testid="inspector-duration">{exchange ? `${exchange.durationMs.toFixed(1)} ms` : '—'}</dd></div></dl>
    {exchange?.amount && <p className="inspector-amount">Submitted amount <strong>{exchange.amount} USD</strong></p>}
    <div className="code-label"><span>Sanitized request</span><span>{exchange?.method ?? 'POST'} {exchange?.path ?? '/api/banking'}</span></div><pre data-testid="inspector-request" tabIndex={0}>{exchange ? JSON.stringify(exchange.request, null, 2) : '// A transaction request will appear here.'}</pre>
    <div className="code-label"><span>Sanitized response</span>{exchange?.replayed !== null && exchange && <span>Replay: {exchange.replayed ? 'true' : 'false'}</span>}</div><pre data-testid="receipt" tabIndex={0}>{exchange ? JSON.stringify(exchange.response, null, 2) : '// No request has been observed yet.'}</pre>
    <div className="inspector-bottom"><span className="fine">Browser-measured, including HTTP transfer. No backend processing time is inferred.</span><button data-testid="transaction-details" className="button secondary" disabled={!exchange} onClick={details}>View details ↗</button></div>
  </div>;
}
