import assert from 'node:assert/strict';
import {assessArchive as assessWithReview,monitor} from './creditflow-monitor.mjs';
const now=1800000000;
const assessArchive=(row,time)=>assessWithReview(row,time,null);
const good={systemIdentifier:'1234567890123456789',walSegmentBytes:16777216,archivedCount:'10',failedCount:'0',lastArchivedUnix:now-60,lastFailedUnix:null,statsResetUnix:now-86400,lastFailedWal:null,lastArchivedWal:'000000010000000000000010',currentWal:'000000010000000000000011',leafExpires:now+365*86400,caExpires:now+365*86400};
assert.equal(assessArchive(good,now).ok,true);
for(const [label,patch] of [
 ['archive_failure',{failedCount:'1',lastFailedUnix:now-60}],
 ['future_archive',{lastArchivedUnix:now+10}],
 ['no_success',{archivedCount:'0'}],
 ['certificate_expiring',{leafExpires:now+44*86400}],
 ['ca_expiring',{caExpires:now+44*86400}],
 ['missing_certificate',{leafExpires:null}],
 ['wal_gap_lag',{currentWal:'000000010000000000000015',lastArchivedUnix:now-600}],
 ['bad_wal_metadata',{currentWal:'invalid'}],
 ['bad_database_identity',{systemIdentifier:'invalid'}],
 ['negative_count',{archivedCount:'-1'}]
])assert.equal(assessArchive({...good,...patch},now).ok,false,label);
assert.equal(assessArchive({...good,lastArchivedUnix:now-86400},now).ok,true,'idle with no pending closed segments');
const result=await monitor({MONITOR_PROJECT:'CreditFlow',HEALTH_CHECKS:'[]'},async()=>{throw Error('MUST_NOT_LEAK_SECRET')},async()=>{throw Error('MUST_NOT_LEAK_SECRET')},fetch,now);
assert.equal(result.status,'alert');assert.equal(JSON.stringify(result).includes('MUST_NOT_LEAK_SECRET'),false);
console.log('MONITOR_VALIDATION_13_PASS');
