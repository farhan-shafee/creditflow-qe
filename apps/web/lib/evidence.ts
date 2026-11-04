const repository = 'https://github.com/farhan-shafee/creditflow-qe';
const day = 86_400_000;
type Freshness = 'recent' | 'stale';
type Conclusion = 'success' | 'failure' | 'cancelled';
export type EvidenceScope = 'core' | 'public' | 'browser' | 'web' | 'quality';
export type ScopeEvidence = { scope: EvidenceScope; runId: string; finishedAt: string; counts: Record<string, number> };
type Artifact = { id: number; name: string; digest: string; expiresAt: string; availability: 'validated' | 'access-unavailable' | 'expired' };
type ArtifactValidation = {
  validatedAt: string; sourceRevision: string; fingerprint: string; reportHashesVerified: number;
  commandLogHashesVerified: number; commandArguments: string;
};
export type AvailableEvidence = {
  state: 'available'; observedAt: string; observationFreshness: Freshness; sourceRevision: string;
  production: {
    reviewedOn: string; webRevision: string; apiRevision: string; currentVerification: 'unverified';
    recordFreshness: Freshness; sourceUrl: string;
  };
  latestMainCI: {
    runId: number; revision: string; branch: 'main'; workflow: string; startedAt: string; finishedAt: string;
    executionFreshness: Freshness; conclusion: Conclusion; jobs: { name: 'core' | 'browser'; conclusion: Conclusion }[];
    counts: ScopeEvidence[] | null; artifactAccess: 'validated' | 'unavailable'; artifactValidation: ArtifactValidation | null;
    accessReason: string; artifacts: Artifact[]; runUrl: string;
  };
  historicalBaseline: {
    verifiedAt: string; runId: number; declaredSourceRevision: string; manifestRevision: string; revisionMismatch: boolean;
    matchedHashes: number; artifactAccess: 'expired-or-removed'; artifactExpiresAt: string; scopes: ScopeEvidence[];
    sourceUrl: string; runUrl: string;
  };
  archiveMonitor: { recordedAt: string; incidentId: string; retainedFailures: number; rollout: 'pending'; sourceUrl: string };
};
export type EvidenceViewModel = AvailableEvidence | { state: 'unavailable'; message: string };

function check(condition: unknown): asserts condition { if (!condition) throw new Error('Invalid evidence'); }
function shape(value: unknown, keys: string[]): Record<string, unknown> {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  const record = value as Record<string, unknown>;
  check(Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key)));
  return record;
}
function text(value: unknown): string {
  check(typeof value === 'string' && value.length > 0 && value.length <= 1000 && !/[\u0000-\u001f]/.test(value));
  return value;
}
function integer(value: unknown, minimum = 0): number {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum);
  return value;
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  check(typeof value === 'string' && choices.includes(value as T));
  return value as T;
}
function revision(value: unknown): string {
  const result = text(value); check(/^[a-f0-9]{40}$/.test(result)); return result;
}
function timestamp(value: unknown): string {
  const result = text(value);
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(result));
  const parsed = new Date(result);
  check(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === result.slice(0, 19));
  return result;
}
function calendarDate(value: unknown): string {
  const result = text(value); check(/^\d{4}-\d{2}-\d{2}$/.test(result));
  check(new Date(result).toISOString().slice(0, 10) === result); return result;
}
function documentPath(value: unknown): string {
  const result = text(value); check(/^docs\/[a-zA-Z0-9_/-]+\.(md|json)$/.test(result)); return result;
}
function freshness(value: string, now: number): Freshness { return now - Date.parse(value) < day ? 'recent' : 'stale'; }
const metrics: Record<EvidenceScope, string[]> = {
  core: ['unit', 'postgres_integration', 'testng', 'cucumber', 'cucumber_steps'],
  public: ['testng', 'cucumber', 'cucumber_steps'], browser: ['ui', 'bruno_requests', 'bruno_checks'],
  web: ['frontend', 'npm_vulnerabilities'], quality: ['components', 'affected_components', 'gitleaks_findings']
};
function scopes(value: unknown, earliest: number, latest: number): ScopeEvidence[] {
  check(Array.isArray(value) && value.length === 5);
  const result = value.map(item => {
    const record = shape(item, ['scope', 'runId', 'finishedAt', 'counts']);
    const scope = choice(record.scope, ['core', 'public', 'browser', 'web', 'quality']);
    const runId = text(record.runId); check(/^\d{8}T\d{6}Z-[a-f0-9]{32}$/.test(runId));
    const finishedAt = timestamp(record.finishedAt);
    check(Date.parse(finishedAt) >= earliest && Date.parse(finishedAt) <= latest);
    const rawCounts = shape(record.counts, metrics[scope]);
    const counts = Object.fromEntries(metrics[scope].map(key => [key, integer(rawCounts[key])]));
    return { scope, runId, finishedAt, counts };
  });
  check(new Set(result.map(item => item.scope)).size === 5); return result;
}

/** Pure snapshot validation; no reads, requests, polling or credential access. */
export function getEvidenceView(input: unknown, now = new Date()): EvidenceViewModel {
  try {
    const nowMs = now.getTime(); check(Number.isFinite(nowMs));
    const root = shape(input, ['schemaVersion', 'observedAt', 'sourceRevision', 'production', 'latestMainCI', 'historicalBaseline', 'archiveMonitor']);
    check(root.schemaVersion === 1);
    const observedAt = timestamp(root.observedAt); const observedMs = Date.parse(observedAt); check(observedMs <= nowMs);
    const sourceRevision = revision(root.sourceRevision);
    const sourceUrl = (path: unknown) => `${repository}/blob/${sourceRevision}/${documentPath(path)}`;
    const production = shape(root.production, ['reviewedOn', 'sourcePath', 'webRevision', 'apiRevision', 'currentVerification']);
    const reviewedOn = calendarDate(production.reviewedOn); check(Date.parse(reviewedOn) <= observedMs);
    const productionView: AvailableEvidence['production'] = {
      reviewedOn, webRevision: revision(production.webRevision), apiRevision: revision(production.apiRevision),
      currentVerification: choice(production.currentVerification, ['unverified']), recordFreshness: freshness(reviewedOn, nowMs),
      sourceUrl: sourceUrl(production.sourcePath)
    };
    const ci = shape(root.latestMainCI, ['runId', 'revision', 'branch', 'workflow', 'startedAt', 'finishedAt', 'conclusion', 'jobs', 'counts', 'artifactAccess', 'accessReason', 'artifacts', 'artifactValidation']);
    const runId = integer(ci.runId, 1); const ciRevision = revision(ci.revision);
    const startedAt = timestamp(ci.startedAt); const finishedAt = timestamp(ci.finishedAt);
    const startedMs = Date.parse(startedAt); const finishedMs = Date.parse(finishedAt);
    check(startedMs <= finishedMs && finishedMs <= observedMs);
    const conclusion = choice(ci.conclusion, ['success', 'failure', 'cancelled']);
    check(Array.isArray(ci.jobs) && ci.jobs.length === 2);
    const jobs = ci.jobs.map(value => {
      const job = shape(value, ['name', 'conclusion']);
      return { name: choice(job.name, ['core', 'browser']), conclusion: choice(job.conclusion, ['success', 'failure', 'cancelled']) };
    });
    check(new Set(jobs.map(job => job.name)).size === 2);
    check(conclusion !== 'success' || jobs.every(job => job.conclusion === 'success'));
    const artifactAccess = choice(ci.artifactAccess, ['validated', 'unavailable']);
    let counts: ScopeEvidence[] | null = null; let artifactValidation: ArtifactValidation | null = null;
    if (artifactAccess === 'validated') {
      counts = scopes(ci.counts, startedMs, finishedMs);
      const validation = shape(ci.artifactValidation, ['validatedAt', 'sourceRevision', 'fingerprint', 'reportHashesVerified', 'commandLogHashesVerified', 'commandArguments']);
      const validatedAt = timestamp(validation.validatedAt);
      check(Date.parse(validatedAt) >= finishedMs && Date.parse(validatedAt) <= observedMs);
      const validatedRevision = revision(validation.sourceRevision); check(validatedRevision === ciRevision);
      const fingerprint = text(validation.fingerprint); check(/^[a-f0-9]{64}$/.test(fingerprint));
      artifactValidation = {
        validatedAt, sourceRevision: validatedRevision, fingerprint, reportHashesVerified: integer(validation.reportHashesVerified, 5),
        commandLogHashesVerified: integer(validation.commandLogHashesVerified, 5), commandArguments: text(validation.commandArguments)
      };
    } else { check(ci.counts === null && ci.artifactValidation === null); }
    check(Array.isArray(ci.artifacts) && ci.artifacts.length === 2);
    const artifacts = ci.artifacts.map(value => {
      const artifact = shape(value, ['id', 'name', 'digest', 'expiresAt']); const name = text(artifact.name);
      check(['core', 'browser'].some(scope => name === `creditflow-${scope}-${ciRevision}`));
      const digest = text(artifact.digest); check(/^sha256:[a-f0-9]{64}$/.test(digest));
      const expiresAt = timestamp(artifact.expiresAt); check(Date.parse(expiresAt) >= finishedMs - day);
      const availability: Artifact['availability'] = Date.parse(expiresAt) <= nowMs ? 'expired' : artifactAccess === 'validated' ? 'validated' : 'access-unavailable';
      return { id: integer(artifact.id, 1), name, digest, expiresAt, availability };
    });
    check(new Set(artifacts.map(artifact => artifact.id)).size === 2 && new Set(artifacts.map(artifact => artifact.name)).size === 2);
    const baseline = shape(root.historicalBaseline, ['verifiedAt', 'runId', 'declaredSourceRevision', 'manifestRevision', 'sourcePath', 'matchedHashes', 'artifactAccess', 'artifactExpiresAt', 'scopes']);
    const verifiedAt = timestamp(baseline.verifiedAt); const verifiedMs = Date.parse(verifiedAt); check(verifiedMs <= observedMs);
    const declaredSourceRevision = revision(baseline.declaredSourceRevision); const manifestRevision = revision(baseline.manifestRevision);
    const artifactExpiresAt = timestamp(baseline.artifactExpiresAt); check(Date.parse(artifactExpiresAt) >= verifiedMs);
    const historicalRunId = integer(baseline.runId, 1);
    const monitor = shape(root.archiveMonitor, ['recordedAt', 'sourcePath', 'incidentId', 'retainedFailures', 'rollout']);
    const recordedAt = timestamp(monitor.recordedAt); check(Date.parse(recordedAt) <= observedMs);
    const incidentId = text(monitor.incidentId); check(/^CF-ARCHIVE-\d{8}$/.test(incidentId));
    return {
      state: 'available', observedAt, observationFreshness: freshness(observedAt, nowMs), sourceRevision, production: productionView,
      latestMainCI: {
        runId, revision: ciRevision, branch: choice(ci.branch, ['main']), workflow: text(ci.workflow), startedAt, finishedAt,
        executionFreshness: freshness(finishedAt, nowMs), conclusion, jobs, counts, artifactAccess, artifactValidation,
        accessReason: text(ci.accessReason), artifacts, runUrl: `${repository}/actions/runs/${runId}`
      },
      historicalBaseline: {
        verifiedAt, runId: historicalRunId, declaredSourceRevision, manifestRevision, revisionMismatch: declaredSourceRevision !== manifestRevision,
        matchedHashes: integer(baseline.matchedHashes, 1), artifactAccess: choice(baseline.artifactAccess, ['expired-or-removed']), artifactExpiresAt,
        scopes: scopes(baseline.scopes, 0, verifiedMs), sourceUrl: sourceUrl(baseline.sourcePath), runUrl: `${repository}/actions/runs/${historicalRunId}`
      },
      archiveMonitor: { recordedAt, incidentId, retainedFailures: integer(monitor.retainedFailures), rollout: choice(monitor.rollout, ['pending']), sourceUrl: sourceUrl(monitor.sourcePath) }
    };
  } catch {
    return { state: 'unavailable', message: 'The recorded evidence could not be validated. Current deployment and test results are unavailable.' };
  }
}
