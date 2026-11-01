import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessArchive, assessBackup, checkHealth, monitor} from './creditflow-monitor.mjs';

const NOW = 1800000000;
const ACK = Object.freeze({id:'synthetic-reviewed-incident',systemIdentifier:'1234567890123456789',failedCount:11,lastFailedUnix:NOW-3600,lastFailedWal:'000000010000000000000010',statsResetUnix:NOW-86400});
const assessFixture = (row, now, acknowledgement = ACK) => assessArchive(row, now, acknowledgement);
const good = (patch = {}) => ({
  systemIdentifier: '1234567890123456789',
  walSegmentBytes: 16777216,
  archivedCount: '100',
  failedCount: '0',
  statsResetUnix: NOW-86400,
  lastArchivedUnix: NOW - 60,
  lastFailedUnix: null,
  lastFailedWal: null,
  lastArchivedWal: '000000010000000000000020',
  currentWal: '000000010000000000000021',
  leafExpires: NOW + 365 * 86400,
  caExpires: NOW + 365 * 86400,
  ...patch
});
const recovered = (patch = {}) => good({
  failedCount: '11',
  lastFailedUnix: NOW - 3600,
  lastFailedWal: '000000010000000000000010',
  ...patch
});
function catalogue(patch = {}) {
  const record = {'db-id':1, 'backup-timestamp-start':NOW-120,
    'backup-timestamp-stop':NOW-100, 'backup-type':'full', 'backup-error':false, ...patch};
  const parts = [
    ['backrest', [['backrest-format','5'], ['backrest-version','"fixture"']]],
    ['backup:current', [['20270115-000000F',JSON.stringify(record)]]],
    ['db', [['db-id','1'], ['db-system-id','1234567890123456789'], ['db-version','"17"']]],
    ['db:history', [['1','{"db-system-id":1234567890123456789,"db-version":"17"}']]]
  ];
  const canonical = '{'+parts.map(([section, pairs]) =>
    JSON.stringify(section)+':{'+pairs.map(([key,value]) =>
      JSON.stringify(key)+':'+value).join(',')+'}').join(',')+'}';
  const checksum = createHash('sha1').update(canonical).digest('hex');
  return parts.map(([section,pairs])=>'['+section+']\n'+
    pairs.map(([key,value])=>key+'='+value).join('\n')).join('\n\n')+
    '\n\n[backrest]\nbackrest-checksum="'+checksum+'"\n';
}
const env = {
  MONITOR_PROJECT:'CreditFlow',
  HEALTH_CHECKS:'[{"url":"https://example.com","contains":"CreditFlow"}]',
  BACKUP_REPO_PATH:'/synthetic'
};
const healthyFetch = async()=>new Response('CreditFlow');
const run = (row, backup = catalogue(), fetcher = healthyFetch) =>
  monitor(env, async()=>backup, async()=>row, fetcher, NOW, ACK);

test('historical failures with later WAL progress stop failing while retaining all evidence', () => {
  const result = assessFixture(recovered(), NOW);
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.archiveFailureState, 'historical_with_later_progress');
  assert.equal(result.failedCount, 11);
  assert.equal(result.lastFailedUnix, NOW-3600);
  assert.equal(result.lastFailedWal, '000000010000000000000010');
});
test('a failed WAL successfully retried at the same position can recover', () => {
  const result = assessFixture(recovered({lastArchivedWal:'000000010000000000000010',currentWal:'000000010000000000000011'}), NOW);
  assert.equal(result.ok, true);
});
test('a new failure re-alerts even if successes follow it immediately', () => {
  const result = assessFixture(recovered({lastFailedUnix:NOW-120}), NOW, {...ACK,lastFailedUnix:NOW-120});
  assert.equal(result.ok, false);
  assert.equal(result.archiveFailureState, 'quiet_period');
  assert.ok(result.issues.includes('archive_failure_recent'));
});
test('quiet period includes its 900 second boundary', () => {
  assert.equal(assessFixture(recovered({lastFailedUnix:NOW-900}), NOW, {...ACK,lastFailedUnix:NOW-900}).ok, true);
  assert.equal(assessFixture(recovered({lastFailedUnix:NOW-899}), NOW, {...ACK,lastFailedUnix:NOW-899}).ok, false);
});
test('failure newer than the last success remains unresolved after the quiet period', () => {
  const result = assessFixture(recovered({lastArchivedUnix:NOW-7200}), NOW);
  assert.equal(result.ok, false);
  assert.equal(result.archiveFailureState, 'active');
  assert.ok(result.issues.includes('archive_failure_unresolved'));
});
test('equal success and failure timestamps do not prove a retry succeeded', () => {
  assert.equal(assessFixture(recovered({lastArchivedUnix:NOW-3600}), NOW).ok, false);
});
test('success behind the failed WAL cannot clear an incident', () => {
  assert.equal(assessFixture(recovered({lastFailedWal:'000000010000000000000022'}), NOW).ok, false);
});
test('recovery never compares WAL across timelines', () => {
  const result = assessFixture(recovered({lastFailedWal:'000000020000000000000010'}), NOW);
  assert.equal(result.ok, false);
});
test('WAL rollover uses exact positions rather than segment suffixes', () => {
  const result = assessFixture(recovered({
    lastFailedWal:'0000000100000000000000FF',
    lastArchivedWal:'000000010000000100000000',
    currentWal:'000000010000000100000001'
  }), NOW, {...ACK,lastFailedWal:'0000000100000000000000FF'});
  assert.equal(result.ok, true);
  assert.equal(result.pendingSegments, 1);
});
for (const [label, patch] of [
  ['missing failed WAL', {lastFailedWal:undefined}],
  ['malformed failed WAL', {lastFailedWal:'bad'}],
  ['out of range failed WAL segment', {lastFailedWal:'000000010000000000000100'}],
  ['missing failed time', {lastFailedUnix:undefined}],
  ['null failed time', {lastFailedUnix:null}],
  ['future failed time', {lastFailedUnix:NOW+1}],
  ['negative failed time', {lastFailedUnix:-1}],
  ['nonfinite failed time', {lastFailedUnix:NaN}],
  ['string failed time', {lastFailedUnix:String(NOW-3600)}],
  ['missing failure count', {failedCount:undefined}],
  ['negative failure count', {failedCount:'-1'}],
  ['unsafe failure count', {failedCount:'9007199254740992'}],
  ['non-string failure count', {failedCount:11}]
]) {
  test(label+' fails closed', () => assert.equal(assessFixture(recovered(patch), NOW).ok, false));
}
test('zero failures with a recorded failure is incoherent', () => {
  assert.equal(assessFixture(recovered({failedCount:'0'}), NOW).ok, false);
});
test('clean metadata has explicit no-failure classification', () => {
  const result = assessFixture(good(), NOW);
  assert.equal(result.ok, true);
  assert.equal(result.archiveFailureState, 'none');
  assert.equal(result.lastFailedUnix, null);
  assert.equal(result.lastFailedWal, null);
});
test('an idle database with no closed WAL backlog remains healthy', () => {
  assert.equal(assessFixture(good({lastArchivedUnix:NOW-86400}), NOW).ok, true);
});
test('archival lag remains an alert after old failures recover', () => {
  const result = assessFixture(recovered({
    lastArchivedUnix:NOW-600, currentWal:'000000010000000000000025'
  }), NOW);
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('archive_lag'));
});
for (const [label, patch] of [
  ['expired leaf', {leafExpires:NOW-1}],
  ['expiring CA', {caExpires:NOW+44*86400}],
  ['invalid identity', {systemIdentifier:'bad'}],
  ['invalid current WAL', {currentWal:'bad'}],
  ['future archive time', {lastArchivedUnix:NOW+1}],
  ['invalid WAL segment size', {walSegmentBytes:0}]
]) {
  test(label+' still alerts with historical failures', () =>
    assert.equal(assessFixture(recovered(patch), NOW).ok, false));
}
test('recovered history reaches the real monitor result without hiding the count', async () => {
  const result = await run(recovered());
  assert.equal(result.status, 'ok');
  assert.equal(result.database.failedCount, 11);
  assert.equal(result.database.archiveFailureState, 'historical_with_later_progress');
});
test('a new intermittent failure makes the full monitor alert again', async () => {
  assert.equal((await run(recovered({lastFailedUnix:NOW-120}))).status, 'alert');
});
test('archive recovery never hides an overdue backup', async () => {
  const result = await run(recovered(), catalogue({
    'backup-timestamp-start':NOW-31*3600-10, 'backup-timestamp-stop':NOW-31*3600
  }));
  assert.equal(result.status, 'alert');
  assert.ok(result.issues.includes('backup_overdue'));
});
test('archive recovery never hides a backup identity mismatch', async () => {
  const result = await run(recovered({systemIdentifier:'2234567890123456789'}));
  assert.equal(result.status, 'alert');
  assert.ok(result.issues.includes('backup_database_identity_mismatch'));
});
test('archive recovery never hides an HTTP failure', async () => {
  const result = await run(recovered(), catalogue(), async()=>new Response('unavailable',{status:503}));
  assert.equal(result.status, 'alert');
  assert.ok(result.issues.includes('health_check_failed'));
});
test('read errors remain alerts and do not expose exception details', async () => {
  const result = await monitor(env, async()=>{throw Error('SENSITIVE_FIXTURE');},
    async()=>{throw Error('SENSITIVE_FIXTURE');}, healthyFetch, NOW);
  assert.equal(result.status, 'alert');
  assert.ok(!JSON.stringify(result).includes('SENSITIVE_FIXTURE'));
});
test('tampered catalogue still fails its checksum', () => {
  assert.equal(assessBackup(catalogue().replace('"backup-error":false','"backup-error":true'), NOW).ok,false);
});
test('cross-origin health redirect never receives a protected key', async () => {
  const urls = [];
  const result = await checkHealth({url:'https://example.com',protected:true},async(url)=>{
    urls.push(url); return new Response(null,{status:302,headers:{location:'https://foreign.example'}});
  }, 'SYNTHETIC_KEY');
  assert.equal(result.ok, false);
  assert.deepEqual(urls, ['https://example.com/']);
});

test('unreviewed old failures never clear merely because later WAL advanced', () => {
  const result = assessFixture(recovered({failedCount:'12'}), NOW);
  assert.equal(result.ok, false);
  assert.equal(result.archiveFailureState, 'unreviewed');
  assert.ok(result.issues.includes('archive_failure_unreviewed'));
});
test('same failure count with a new failure timestamp is unreviewed', () => {
  assert.equal(assessFixture(recovered({lastFailedUnix:NOW-3500}), NOW).ok, false);
});
test('an acknowledgement for another cluster cannot suppress failures', () => {
  assert.equal(assessFixture(recovered(), NOW, {...ACK,systemIdentifier:'2234567890123456789'}).ok, false);
});
test('an acknowledgement for another failed WAL cannot suppress failures', () => {
  assert.equal(assessFixture(recovered(), NOW, {...ACK,lastFailedWal:'000000010000000000000011'}).ok, false);
});
test('no acknowledgement means historical failures remain actionable', () => {
  const result = assessFixture(recovered(), NOW, null);
  assert.equal(result.ok, false);
  assert.equal(result.archiveFailureState, 'unreviewed');
});
test('statistics reset invalidates the acknowledgement even with no remaining failure count', () => {
  const result = assessFixture(good({statsResetUnix:NOW-1000}), NOW);
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('archiver_statistics_changed'));
});
test('a changed statistics epoch with the same count is not the reviewed incident', () => {
  assert.equal(assessFixture(recovered({statsResetUnix:NOW-5000}), NOW).ok, false);
});
test('missing statistics epoch cannot match the reviewed incident', () => {
  assert.equal(assessFixture(recovered({statsResetUnix:undefined}), NOW).ok, false);
});
test('invalid statistics epoch fails closed', () => {
  for(const statsResetUnix of [NaN,Infinity,NOW+1,-1,'bad']) {
    assert.equal(assessFixture(recovered({statsResetUnix}), NOW).ok, false);
  }
});

test('the recorded production metadata replays the exact reviewed incident without clearing its count', () => {
  const fixture=JSON.parse(fs.readFileSync(new URL('../../docs/evidence/archive-monitor-20261031/metadata-fixture.json',import.meta.url),'utf8'));
  const result=assessArchive({...fixture.metadata,...fixture.certificateObservation},fixture.assessmentUnix);
  assert.equal(result.ok,true);
  assert.equal(result.failedCount,11);
  assert.equal(result.lastFailedUnix,1793477059.095708);
  assert.equal(result.reviewedIncidentId,'CF-ARCHIVE-20261031');
  assert.equal(result.archiveFailureState,'historical_with_later_progress');
});
