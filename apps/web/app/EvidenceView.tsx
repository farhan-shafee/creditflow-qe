import type { EvidenceViewModel, ScopeEvidence } from '../lib/evidence';

const repo = 'https://github.com/farhan-shafee/creditflow-qe';
const labels: Record<string, string> = {
  unit: 'unit tests', postgres_integration: 'PostgreSQL integration tests', testng: 'TestNG tests',
  cucumber: 'Cucumber scenarios', cucumber_steps: 'Cucumber steps', ui: 'browser tests',
  bruno_requests: 'Bruno requests', bruno_checks: 'Bruno checks', frontend: 'frontend contracts',
  npm_vulnerabilities: 'npm vulnerabilities', components: 'resolved components',
  affected_components: 'affected components', gitleaks_findings: 'secret scan findings'
};
function time(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}
function Commit({ value }: { value: string }) {
  return <a href={`${repo}/commit/${value}`} target="_blank" rel="noreferrer"><code>{value.slice(0, 7)}</code></a>;
}
function Counts({ scopes }: { scopes: ScopeEvidence[] }) {
  return <dl className="evidence-counts">{scopes.map(scope => <div key={scope.scope}>
    <dt>{scope.scope}</dt><dd>{Object.entries(scope.counts).map(([key, count]) => `${count} ${labels[key]}`).join(' · ')}<br /><span className="fine">Finished <time dateTime={scope.finishedAt}>{time(scope.finishedAt)}</time></span></dd>
  </div>)}</dl>;
}

export default function EvidenceView({ evidence }: { evidence: EvidenceViewModel }) {
  if (evidence.state === 'unavailable') return <section className="panel" aria-label="Evidence unavailable"><h2>Evidence unavailable</h2><p>{evidence.message}</p></section>;
  const { production, latestMainCI: ci, historicalBaseline: baseline, archiveMonitor: monitor } = evidence;
  const expired = ci.artifacts.some(artifact => artifact.availability === 'expired');
  return <section aria-label="Release and execution evidence" data-testid="evidence-view">
    <div className="section-heading"><div><div className="eyebrow">SOURCE & EXECUTION</div><h2>Every claim has a revision.</h2><p>Recorded releases, executed checks and their limits.</p></div>
      <span className={`tag ${evidence.observationFreshness === 'stale' ? 'warning' : 'neutral'}`}>Snapshot {evidence.observationFreshness === 'stale' ? 'stale' : 'recorded'}</span>
    </div>
    <p className="fine">Metadata observed <time dateTime={evidence.observedAt}>{time(evidence.observedAt)}</time>. This saved snapshot does not poll GitHub or production. Records become stale after 24 hours.</p>
    <div className="evidence-grid">
      <article className="panel">
        <div className="panel-top"><h3>Recorded production</h3><span className="tag neutral">Current state unverified</span></div>
        <dl className="evidence-identities"><div><dt>Frontend</dt><dd><Commit value={production.webRevision} /></dd></div><div><dt>API</dt><dd><Commit value={production.apiRevision} /></dd></div></dl>
        <p>Railway release record reviewed <time dateTime={production.reviewedOn}>{production.reviewedOn}</time>.</p>
        <p className="fine">{production.recordFreshness === 'stale' ? 'Stale record. ' : ''}The pinned record describes verification at its stated time. This saved page does not recheck provider health or submit verification transactions.</p>
        <a className="text-link" href={production.sourceUrl} target="_blank" rel="noreferrer">Read pinned release record ↗</a>
      </article>
      <article className="panel">
        <div className="panel-top"><h3>Latest verified main CI</h3><span className="tag">{ci.conclusion === 'success' ? 'Passed' : ci.conclusion}</span></div>
        <p><Commit value={ci.revision} /> · {ci.branch} · Run {ci.runId}</p>
        <p className="fine"><time dateTime={ci.startedAt}>{time(ci.startedAt)}</time> to <time dateTime={ci.finishedAt}>{time(ci.finishedAt)}</time>. {ci.executionFreshness === 'stale' ? 'Execution is older than 24 hours.' : 'Execution recorded within 24 hours.'}</p>
        <p>{ci.jobs.map(job => `${job.name}: ${job.conclusion}`).join(' · ')}</p>
        {ci.counts ? <>
          <details><summary>View validated execution counts</summary><Counts scopes={ci.counts} /></details>
          <p className="fine">{ci.artifactValidation && ci.artifactValidation.reportHashesVerified + ci.artifactValidation.commandLogHashesVerified} retained report and command-log hashes checked {ci.artifactValidation && time(ci.artifactValidation.validatedAt)}. Jenkins controller execution for this CI revision remains unverified.</p>
        </> : <p>Counts unavailable. Latest artifacts could not be inspected.</p>}
        <p className="fine">{expired ? ci.counts ? 'Artifact download retention has expired; these counts come from the retained validation.' : 'Artifact download retention has expired. Counts remain unavailable.' : `Artifact retention ends ${time(ci.artifacts.reduce((earliest, artifact) => artifact.expiresAt < earliest ? artifact.expiresAt : earliest, ci.artifacts[0].expiresAt))}. Access may require GitHub sign-in.`}</p>
        <details><summary>Access and validation limits</summary><p className="fine">{ci.accessReason}</p>{ci.artifactValidation && <p className="fine">{ci.artifactValidation.commandArguments}</p>}</details>
        <a className="text-link" href={ci.runUrl} target="_blank" rel="noreferrer">Open exact CI run ↗</a>
      </article>
      <article className="panel">
        <div className="panel-top"><h3>Historical baseline</h3><span className="tag neutral">October 15, 2026</span></div>
        <p>Validated manifest revision <Commit value={baseline.manifestRevision} />.</p>
        <p className="fine">Artifact receipt verified <time dateTime={baseline.verifiedAt}>{time(baseline.verifiedAt)}</time>; {baseline.matchedHashes} hashes matched.</p>
        <details><summary>View historical execution counts</summary><Counts scopes={baseline.scopes} /></details>
        {baseline.revisionMismatch && <p className="fine">The receipt declares <Commit value={baseline.declaredSourceRevision} />. Its validated manifests identify <Commit value={baseline.manifestRevision} />; these counts belong to the manifest revision.</p>}
        <p className="fine">Original artifacts expired or were removed after the recorded {time(baseline.artifactExpiresAt)} retention date. The retained receipt supports these historical counts.</p>
        <a className="text-link" href={baseline.sourceUrl} target="_blank" rel="noreferrer">Inspect retained receipt ↗</a>
      </article>
    </div>
    <p className="fine">Archive monitor record at <time dateTime={monitor.recordedAt}>{time(monitor.recordedAt)}</time>: {monitor.retainedFailures} historical failures retained for {monitor.incidentId}; the reviewed rollout was pending in the <a href={monitor.sourceUrl} target="_blank" rel="noreferrer">pinned recovery record</a>. This is not a current health result.</p>
  </section>;
}
