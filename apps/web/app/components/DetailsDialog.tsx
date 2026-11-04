'use client';
import { useEffect, useRef, useState } from 'react';
import type { Entry, Exchange } from '../../lib/banking';
import { containDialogTab } from './dialog-focus';
export type Detail = { kind: 'exchange'; value: Exchange } | { kind: 'entry'; value: Entry };
export default function DetailsDialog({ detail, close }: { detail: Detail | null; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState<Detail | null>(null);
  const [closing, setClosing] = useState(false);
  const [copied, setCopied] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    if (detail) {
      if (!dialog?.open) previous.current = document.activeElement as HTMLElement | null;
      setShown(detail); setClosing(false); setCopied('');
      const frame = requestAnimationFrame(() => { if (dialog && !dialog.open) dialog.showModal(); });
      return () => cancelAnimationFrame(frame);
    }
    if (dialog?.open) {
      setClosing(true);
      const timer = setTimeout(() => {
        dialog.close(); setShown(null); setClosing(false);
        if (previous.current?.isConnected) previous.current.focus({ preventScroll: true });
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180);
      return () => clearTimeout(timer);
    }
  }, [detail]);
  const content = detail ?? shown;
  const response = content?.kind === 'exchange' ? content.value.response : content?.value;
  async function copy() {
    try { await navigator.clipboard.writeText(JSON.stringify(response, null, 2)); setCopied('Sanitized data copied.'); }
    catch { setCopied('Copy unavailable. Select the JSON below to copy it.'); }
  }
  return <dialog ref={ref} className="details-dialog" data-closing={closing} data-testid="transaction-drawer" aria-labelledby="details-title" onKeyDown={containDialogTab} onCancel={event => { event.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}>
    {content && <div className="drawer-content"><div className="panel-top"><div><div className="eyebrow">SERVER-SUPPORTED DETAILS</div><h2 id="details-title">{content.kind === 'entry' ? 'Ledger receipt' : 'Observed exchange'}</h2></div><button autoFocus className="icon-button" data-testid="details-close" onClick={close} aria-label="Close transaction details">×</button></div>
      <p>{content.kind === 'entry' ? 'An immutable receipt retrieved from this account’s ledger. HTTP timing and status are unavailable for this historical entry.' : 'Sanitized application data from the selected request. Round-trip time is measured in the browser, not inside the backend.'}</p>
      {content.kind === 'exchange' && <dl className="detail-facts"><div><dt>HTTP status</dt><dd>{content.value.status ?? 'No response'}</dd></div><div><dt>HTTP round trip</dt><dd>{content.value.durationMs.toFixed(1)} ms</dd></div><div><dt>Outcome</dt><dd>{content.value.outcome}</dd></div></dl>}
      <pre tabIndex={0} aria-label="Sanitized transaction details">{JSON.stringify(response, null, 2)}</pre>
      <button type="button" className="button secondary" onClick={copy}>Copy sanitized JSON</button><p role="status" className="fine">{copied || 'Session credentials are excluded.'}</p>
    </div>}
  </dialog>;
}
