import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getEvidenceView } from '../lib/evidence.ts';

const source = JSON.parse(readFileSync(new URL('../data/evidence.json', import.meta.url), 'utf8'));
const now = new Date('2026-11-04T23:00:00Z');
function fixture() { return structuredClone(source); }
function available(input = fixture(), at = now) {
  const view = getEvidenceView(input, at);
  assert.equal(view.state, 'available');
  if (view.state !== 'available') throw new Error('Expected evidence');
  return view;
}

test('ties the accepted frontend to verified main while keeping the backend revision separate', () => {
  const view = available();
  assert.equal(view.production.webRevision, 'b286242e0b3e8f3aa1539a256662865ba4002ef1');
  assert.equal(view.production.apiRevision, '20c91f5e10658ab4ce3ec7f2727c8a4934f5b314');
  assert.equal(view.production.currentVerification, 'unverified');
  assert.equal(view.latestMainCI.revision, 'b286242e0b3e8f3aa1539a256662865ba4002ef1');
  assert.equal(view.latestMainCI.conclusion, 'success');
});

test('uses validated latest counts and leaves inaccessible counts unavailable', () => {
  const view = available();
  assert.equal(view.latestMainCI.counts?.find((scope: any) => scope.scope === 'quality')?.counts.components, 205);
  assert.equal(view.latestMainCI.counts?.find((scope: any) => scope.scope === 'browser')?.counts.ui, 37);
  assert.equal(view.latestMainCI.counts?.find((scope: any) => scope.scope === 'web')?.counts.frontend, 57);
  assert.equal(view.latestMainCI.artifactValidation?.reportHashesVerified, 192);
  assert.equal(view.latestMainCI.artifactValidation?.commandLogHashesVerified, 22);
  assert.equal(view.latestMainCI.artifactAccess, 'validated');
  assert.equal(view.historicalBaseline.scopes[0].counts.unit, 31);
  const input = fixture();
  input.latestMainCI.artifactAccess = 'unavailable';
  assert.equal(getEvidenceView(input, now).state, 'unavailable');
  input.latestMainCI.counts = null;
  input.latestMainCI.artifactValidation = null;
  assert.equal(available(input).latestMainCI.counts, null);
  input.latestMainCI.counts = source.historicalBaseline.scopes;
  assert.equal(getEvidenceView(input, now).state, 'unavailable');
});

test('preserves the historical manifest revision instead of the receipt declared revision', () => {
  const view = available();
  assert.equal(view.historicalBaseline.manifestRevision, 'bb169a6f591e60ebd94358c82da5b9ae12e4093f');
  assert.equal(view.historicalBaseline.declaredSourceRevision, 'b3209d36d979b9b2c3bfe1850882db3481839e65');
  assert.equal(view.historicalBaseline.revisionMismatch, true);
  assert.equal(view.historicalBaseline.artifactAccess, 'expired-or-removed');
});

test('fresh metadata does not renew older execution and deployment records', () => {
  const current = available();
  assert.equal(current.observationFreshness, 'recent');
  assert.equal(current.latestMainCI.executionFreshness, 'recent');
  assert.equal(current.production.recordFreshness, 'recent');
  const input = fixture();
  input.observedAt = '2026-11-06T12:00:00Z';
  const view = available(input, new Date('2026-11-06T13:00:00Z'));
  assert.equal(view.observationFreshness, 'recent');
  assert.equal(view.latestMainCI.executionFreshness, 'stale');
  assert.equal(view.production.recordFreshness, 'stale');
  assert.equal(available(fixture(), new Date(Date.parse(source.observedAt) + 86_400_000)).observationFreshness, 'stale');
});

test('marks expired artifacts while preserving the recorded access failure', () => {
  const before = available();
  assert.equal(before.latestMainCI.artifacts[0].availability, 'validated');
  const after = available(fixture(), new Date('2026-11-19T00:00:00Z'));
  assert.equal(after.latestMainCI.artifacts[0].availability, 'expired');
  assert.equal(after.latestMainCI.artifactAccess, 'validated');
});

test('fails closed for missing, malformed or unsupported snapshots', () => {
  for (const input of [undefined, null, [], {}, { ...fixture(), schemaVersion: 2 }]) {
    assert.equal(getEvidenceView(input, now).state, 'unavailable');
  }
});

test('rejects future observations, impossible timestamps and reversed execution windows', () => {
  for (const change of [
    (input: any) => { input.observedAt = '2026-11-05T00:00:00Z'; },
    (input: any) => { input.observedAt = '2026-02-30T13:28:21Z'; },
    (input: any) => { input.latestMainCI.finishedAt = '2026-10-31T01:00:00Z'; },
    (input: any) => { input.production.reviewedOn = '2026-10-32'; },
    (input: any) => { input.historicalBaseline.scopes[0].finishedAt = '2026-11-01T00:00:00Z'; }
  ]) {
    const input = fixture();
    change(input);
    assert.equal(getEvidenceView(input, now).state, 'unavailable');
  }
});

test('rejects unpinned source identities and source paths outside repository documents', () => {
  for (const change of [
    (input: any) => { input.sourceRevision = 'main'; },
    (input: any) => { input.production.apiRevision = '20c91f5'; },
    (input: any) => { input.production.sourcePath = '../private.json'; },
    (input: any) => { input.archiveMonitor.sourcePath = 'https://elsewhere.example'; },
    (input: any) => { input.latestMainCI.branch = 'feature'; }
  ]) {
    const input = fixture();
    change(input);
    assert.equal(getEvidenceView(input, now).state, 'unavailable');
  }
});

test('rejects missing or inconsistent jobs and artifacts rather than showing success', () => {
  for (const change of [
    (input: any) => { input.latestMainCI.jobs = []; },
    (input: any) => { input.latestMainCI.jobs[0].conclusion = 'failure'; },
    (input: any) => { input.latestMainCI.artifacts[0].name = 'creditflow-core-another-revision'; },
    (input: any) => { input.latestMainCI.artifacts[0].digest = 'sha256:invalid'; },
    (input: any) => { input.latestMainCI.artifacts[0].id = -1; },
    (input: any) => { input.latestMainCI.artifactValidation.sourceRevision = input.production.apiRevision; },
    (input: any) => { input.latestMainCI.artifactValidation.reportHashesVerified = -1; }
  ]) {
    const input = fixture();
    change(input);
    assert.equal(getEvidenceView(input, now).state, 'unavailable');
  }
});

test('rejects missing baseline scopes and invalid counts', () => {
  for (const change of [
    (input: any) => { input.historicalBaseline.scopes.pop(); },
    (input: any) => { input.historicalBaseline.scopes[0].counts.unit = -1; },
    (input: any) => { input.historicalBaseline.scopes[0].counts.unit = 1.5; },
    (input: any) => { input.historicalBaseline.scopes[0].counts.unit = '31'; },
    (input: any) => { input.historicalBaseline.scopes[0].counts = {}; }
  ]) {
    const input = fixture();
    change(input);
    assert.equal(getEvidenceView(input, now).state, 'unavailable');
  }
});

test('does not allow production verification or monitor rollout claims to be elevated', () => {
  const production = fixture();
  production.production.currentVerification = 'verified';
  assert.equal(getEvidenceView(production, now).state, 'unavailable');
  const monitor = fixture();
  monitor.archiveMonitor.rollout = 'deployed';
  assert.equal(getEvidenceView(monitor, now).state, 'unavailable');
});

test('pins report links and returns independent validated data', () => {
  const input = fixture();
  const view = available(input);
  assert.equal(view.latestMainCI.runUrl, 'https://github.com/farhan-shafee/creditflow-qe/actions/runs/41886196621');
  assert.equal(view.production.sourceUrl, 'https://github.com/farhan-shafee/creditflow-qe/blob/4fac13ac84565296281fed72ae6e1b1dd9b3be55/docs/evidence/financial-workspace-20261104.md');
  input.production.webRevision = 'bad';
  assert.equal(view.production.webRevision, 'b286242e0b3e8f3aa1539a256662865ba4002ef1');
});
