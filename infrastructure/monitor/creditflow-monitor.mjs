import{createHash,X509Certificate}from'node:crypto';
import{checkServerIdentity}from'node:tls';
// Project-scoped read-only checks. No database or Railway account credentials.
// Exact reviewed incident only; new counts/timestamps/WAL/epochs cannot inherit this acknowledgement.
export const REVIEWED_ARCHIVE_INCIDENT=Object.freeze({
 id:'CF-ARCHIVE-20261031',systemIdentifier:'7700470356004089914',failedCount:11,
 lastFailedUnix:1793477059.095708,lastFailedWal:'00000001000000240000008B',
 statsResetUnix:1792905469.450778
});
export function assessBackup(text,now){
 try{
  if(typeof text!=='string'||text.length>1048576)throw Error();
  let section=null,expected=null,sealed=false;const sections=new Map(),records=[];
  for(const raw of text.split(/\r?\n/)){
   const line=raw.trim();if(!line||line.startsWith('#'))continue;
   if(line.startsWith('[')){if(sealed||!/^\[[a-zA-Z0-9:_-]+\]$/.test(line))throw Error();section=line.slice(1,-1);if(!sections.has(section))sections.set(section,new Map());continue;}
   if(!section||sealed)throw Error();const at=line.indexOf('=');if(at<1)throw Error();
   const key=line.slice(0,at),value=line.slice(at+1);
   JSON.parse(value);
   if(section==='backrest'&&key==='backrest-checksum'){expected=JSON.parse(value);sealed=true;continue;}
   const values=sections.get(section);if(values.has(key))throw Error();values.set(key,value);
  }
  if(!sealed||!/^([a-f0-9]{40})$/.test(expected)||!sections.has('backup:current')||!sections.has('db')||!sections.has('db:history'))throw Error();
  const backrest=sections.get('backrest'),db=sections.get('db');
  if(backrest.get('backrest-format')!=='5'||!backrest.has('backrest-version')||!db.has('db-id')||!db.has('db-system-id')||!db.has('db-version'))throw Error();
  const canonical='{'+[...sections].map(([name,values])=>JSON.stringify(name)+':{'+[...values].map(([k,v])=>JSON.stringify(k)+':'+v).join(',')+'}').join(',')+'}';
  if(createHash('sha1').update(canonical).digest('hex')!==expected)throw Error();
  const rawSystem=db.get('db-system-id');const systemIdentifier=/^\d{10,20}$/.test(rawSystem)?rawSystem:JSON.parse(rawSystem);if(typeof systemIdentifier!=='string'||!/^\d{10,20}$/.test(systemIdentifier))throw Error();
  const dbId=JSON.parse(db.get('db-id'));if(!sections.get('db:history').has(String(dbId)))throw Error();
  for(const [label,value]of sections.get('backup:current')){
   const item=JSON.parse(value),stop=item['backup-timestamp-stop'],start=item['backup-timestamp-start'],type=item['backup-type'];
   if(!Number.isSafeInteger(stop)||!Number.isSafeInteger(start)||start<0||stop<start||stop>now||!['full','diff','incr'].includes(type)||item['backup-error']!==false||item['db-id']!==dbId)throw Error();
   records.push({label,stop,type});
  }
  if(!records.length)throw Error();
  records.sort((a,b)=>b.stop-a.stop);const latest=records[0],full=records.find(x=>x.type==='full'),issues=[];
  if(now-latest.stop>30*3600)issues.push('backup_overdue');
  if(!full||now-full.stop>8*86400)issues.push('full_backup_overdue');
  return{applicable:true,ok:issues.length===0,issues,systemIdentifier,latest:latest.label,latestStop:latest.stop,ageHours:Math.round((now-latest.stop)/36)/100,fullStop:full?.stop??null};
 }catch{return{applicable:true,ok:false,issues:['backup_catalog_invalid']};}
}
export function assessArchive(row,now,reviewed=REVIEWED_ARCHIVE_INCIDENT){
 const issues=[];
 const validTime=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=now;
 if(!Number.isFinite(now)||now<0)issues.push('archive_timestamp_invalid');
 if(typeof row?.systemIdentifier!=='string'||!/^\d{10,20}$/.test(row.systemIdentifier))issues.push('database_identity_invalid');
 const count=x=>typeof x==='string'&&/^\d+$/.test(x)&&Number.isSafeInteger(Number(x))?Number(x):NaN;
 const archived=count(row?.archivedCount),failed=count(row?.failedCount),last=row?.lastArchivedUnix;
 if(!Number.isSafeInteger(archived)||archived<1||!Number.isSafeInteger(failed))issues.push('archiver_metadata_invalid');
 if(!validTime(last))issues.push('archive_timestamp_invalid');
 if(!validTime(row?.statsResetUnix)||row.statsResetUnix>last)issues.push('archiver_statistics_invalid');
 if(reviewed&&row?.systemIdentifier===reviewed.systemIdentifier&&row?.statsResetUnix!==reviewed.statsResetUnix)issues.push('archiver_statistics_changed');
 for(const [key,name]of[['leafExpires','database_certificate'],['caExpires','database_ca']]){
  const expiry=row?.[key];if(typeof expiry!=='number'||!Number.isFinite(expiry)||expiry<=now)issues.push(name+'_invalid_or_expired');
  else if(expiry-now<45*86400)issues.push(name+'_expiring');
 }
 let pending=null,priorPosition=null,failedPosition=null,failureWalValid=false;
 try{
  const current=row.currentWal,prior=row.lastArchivedWal,bytes=row.walSegmentBytes;
  if(!Number.isSafeInteger(bytes)||bytes<1048576||bytes>1073741824||4294967296%bytes!==0)throw Error();
  const perLog=4294967296n/BigInt(bytes);
  const position=wal=>{
   if(typeof wal!=='string'||!/^[0-9A-F]{24}$/.test(wal))throw Error();
   const segment=BigInt('0x'+wal.slice(16));if(segment>=perLog)throw Error();
   return BigInt('0x'+wal.slice(8,16))*perLog+segment;
  };
  priorPosition=position(prior);
  if(current.slice(0,8)!==prior.slice(0,8))throw Error();
  const gap=position(current)-priorPosition;
  if(gap<0n||gap>BigInt(Number.MAX_SAFE_INTEGER))throw Error();pending=Number(gap);
  if(pending>1&&now-last>300)issues.push('archive_lag');
  if(failed>0){
   try{
    failedPosition=position(row.lastFailedWal);
    failureWalValid=row.lastFailedWal.slice(0,8)===prior.slice(0,8);
   }catch{failureWalValid=false;}
  }
 }catch{issues.push('wal_metadata_invalid');}
 const reviewedMatch=reviewed&&row?.systemIdentifier===reviewed.systemIdentifier&&failed===reviewed.failedCount&&row?.lastFailedUnix===reviewed.lastFailedUnix&&row?.lastFailedWal===reviewed.lastFailedWal&&row?.statsResetUnix===reviewed.statsResetUnix;
 let archiveFailureState='unverifiable';
 if(failed===0&&row?.lastFailedUnix===null&&row?.lastFailedWal===null){
  archiveFailureState='none';
 }else if(failed>0&&validTime(row?.lastFailedUnix)&&validTime(last)&&failureWalValid&&priorPosition!==null&&Number.isFinite(now)&&validTime(row?.statsResetUnix)&&row.statsResetUnix<=row.lastFailedUnix){
  if(last<=row.lastFailedUnix||priorPosition<failedPosition){
   archiveFailureState='active';issues.push('archive_failure_unresolved');
  }else if(now-row.lastFailedUnix<900){
   archiveFailureState='quiet_period';issues.push('archive_failure_recent');
  }else if(!reviewedMatch){
   archiveFailureState='unreviewed';issues.push('archive_failure_unreviewed');
  }else{
   // Only reviewed failures can recover: WAL order alone cannot prove a complete archive.
   archiveFailureState='historical_with_later_progress';
  }
 }else{
  issues.push('archiver_failure_metadata_invalid');
 }
 return{ok:issues.length===0,issues,systemIdentifier:row?.systemIdentifier??null,archivedCount:Number.isFinite(archived)?archived:null,failedCount:Number.isFinite(failed)?failed:null,lastArchivedUnix:Number.isFinite(last)?last:null,pendingSegments:pending,certificateExpires:row?.leafExpires??null,caExpires:row?.caExpires??null,lastFailedUnix:validTime(row?.lastFailedUnix)?row.lastFailedUnix:null,lastFailedWal:typeof row?.lastFailedWal==='string'&&/^[0-9A-F]{24}$/.test(row.lastFailedWal)?row.lastFailedWal:null,statsResetUnix:validTime(row?.statsResetUnix)?row.statsResetUnix:null,reviewedIncidentId:archiveFailureState==='historical_with_later_progress'?reviewed.id:null,archiveFailureState};
}
async function readBounded(stream,limit){
 if(!stream)throw Error();const reader=stream.getReader(),chunks=[];let size=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error();}chunks.push(value);}}
 finally{reader.releaseLock();}
 const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength;}return new TextDecoder().decode(all);
}
export async function checkHealth(check,fetchImpl=fetch,provisionKey=null){
 try{
  const url=new URL(check.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();
  let response,current=url.href;
  for(let hop=0;hop<4;hop++){
   response=await fetchImpl(current,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Owner-readonly-status-check',...(check.protected?{'X-Sandbox-Provision-Key':provisionKey}:{})},redirect:'manual'});
   if(response.status<300||response.status>=400)break;
   const next=new URL(response.headers.get('location'),current);
   if(next.origin!==url.origin||next.username||next.password||next.search||next.hash)throw Error();
   await response.body?.cancel();current=next.href;if(hop===3)throw Error();
  }
  if(response.status!==200)return{url:url.href,ok:false,status:response.status,issue:'http_status'};
  if(response.url&&new URL(response.url).origin!==url.origin)throw Error();
  const body=await readBounded(response.body,262144);
  if(check.status&&JSON.parse(body).status!==check.status)return{url:url.href,ok:false,issue:'health_status'};
  if(check.contains&&!body.toLowerCase().includes(check.contains.toLowerCase()))return{url:url.href,ok:false,issue:'content_missing'};
  return{url:url.href,ok:true,status:200};
 }catch{return{ok:false,issue:'health_unreachable_or_invalid'};}
}
export async function monitor(env,readBackup,readDatabase,fetchImpl=fetch,now=null,reviewedArchiveFailure=REVIEWED_ARCHIVE_INCIDENT){
 const clock=typeof now==='function'?now:()=>now??Date.now()/1000;
 if(!env.MONITOR_PROJECT||!env.HEALTH_CHECKS)return{event:'OPS_MONITOR',status:'setup_required',checkedAt:new Date(clock()*1000).toISOString()};
 const result={event:'OPS_MONITOR',version:1,project:env.MONITOR_PROJECT,checkedAt:new Date(clock()*1000).toISOString(),status:'ok',health:[],backup:{applicable:false},issues:[]};
 try{
  const checks=JSON.parse(env.HEALTH_CHECKS);if(!Array.isArray(checks)||!checks.length||checks.length>5)throw Error();
  result.health=await Promise.all(checks.map(c=>checkHealth(c,fetchImpl,env.PROVISION_KEY)));
  if(result.health.some(c=>!c.ok))result.issues.push('health_check_failed');
 }catch{result.issues.push('health_configuration_invalid');}
 const required={CreditFlow:true}[env.MONITOR_PROJECT];
 if(typeof required!=='boolean')result.issues.push('project_configuration_invalid');
 if(required&&!env.BACKUP_REPO_PATH){result.backup={applicable:true,ok:false};result.issues.push('backup_configuration_missing');}
 if(env.BACKUP_REPO_PATH){
  try{result.backup=assessBackup(await readBackup(),clock());if(!result.backup.ok)result.issues.push(...result.backup.issues);}
  catch{result.backup={applicable:true,ok:false};result.issues.push('backup_unreadable');}
 }
 try{result.database=assessArchive(await readDatabase(),clock(),reviewedArchiveFailure);if(!result.database.ok)result.issues.push(...result.database.issues);}catch{result.database={ok:false};result.issues.push('database_monitor_unverifiable');}
 if(result.backup?.systemIdentifier&&typeof result.database?.systemIdentifier==='string'&&/^\d{10,20}$/.test(result.database.systemIdentifier)&&result.backup.systemIdentifier!==result.database.systemIdentifier)result.issues.push('backup_database_identity_mismatch');
 result.checkedAt=new Date(clock()*1000).toISOString();
 if(result.issues.length)result.status='alert';
 return result;
}
if(import.meta.main&&typeof Bun!=='undefined'){
 const env=Bun.env;
 const readBackup=async()=>{
  const path=env.BACKUP_REPO_PATH;
  if(!/^\/[A-Za-z0-9_\/-]+$/.test(path)||!env.MONITOR_S3_BUCKET||!env.MONITOR_S3_ENDPOINT||!env.MONITOR_S3_ACCESS_KEY||!env.MONITOR_S3_SECRET_KEY)throw Error();
  const endpoint=new URL('https://'+env.MONITOR_S3_ENDPOINT);if(endpoint.pathname!=='/'||endpoint.search||endpoint.username||endpoint.password)throw Error();
  endpoint.hostname=env.MONITOR_S3_BUCKET+'.'+endpoint.hostname;
  const client=new Bun.S3Client({accessKeyId:env.MONITOR_S3_ACCESS_KEY,secretAccessKey:env.MONITOR_S3_SECRET_KEY,region:env.MONITOR_S3_REGION||'auto',endpoint:endpoint.origin,virtualHostedStyle:true});
  let timer;try{return await Promise.race([readBounded(client.file(path.replace(/^\//,'')+'/backup/main/backup.info').stream(),1048576),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),20000);})]);}finally{clearTimeout(timer);}
 };
 const readDatabase=async()=>{
  if(env.DB_HOST!=='creditflow-postgres.railway.internal'||!env.DB_CA_PEM||!env.MONITOR_DB_PASSWORD)throw Error();
  let leafExpires=null;
  const sql=new Bun.SQL({adapter:'postgres',hostname:env.DB_HOST,port:5432,database:'postgres',username:'creditflow_monitor',password:env.MONITOR_DB_PASSWORD,max:1,connectionTimeout:10,idleTimeout:1,tls:{ca:env.DB_CA_PEM,rejectUnauthorized:true,checkServerIdentity(host,cert){const error=checkServerIdentity(host,cert);if(error)return error;leafExpires=Date.parse(cert.valid_to)/1000;}}});
  try{
   const rows=await sql`SELECT (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",archived_count::text AS "archivedCount",failed_count::text AS "failedCount",extract(epoch from last_archived_time)::float8 AS "lastArchivedUnix",extract(epoch from last_failed_time)::float8 AS "lastFailedUnix",pg_size_bytes(current_setting('wal_segment_size'))::int AS "walSegmentBytes",last_archived_wal AS "lastArchivedWal",last_failed_wal AS "lastFailedWal",extract(epoch from stats_reset)::float8 AS "statsResetUnix",pg_walfile_name(pg_current_wal_lsn()) AS "currentWal" FROM pg_stat_archiver`;
   if(rows.length!==1)throw Error();
   return {...rows[0],leafExpires,caExpires:Date.parse(new X509Certificate(env.DB_CA_PEM).validTo)/1000};
  }finally{await sql.close({timeout:2});}
 };
 const result=await monitor(env,readBackup,readDatabase);
 console.log('OPS_MONITOR '+JSON.stringify(result));
 process.exit(result.status==='alert'?1:0);
}
