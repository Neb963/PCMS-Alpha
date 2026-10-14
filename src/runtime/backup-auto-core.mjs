// I15: deterministic time, run admission, secret boundary and tracked-only retention.
// Pure reducer/oracles: no filesystem, Firefox APIs, secrets or provider authority.
export const AUTO_KEY='backup:auto-state';
export const AUTO_ALARM='pcms-i15-daily-backup';
export const AUTO_PORT='pcms-i15-backup';
export const VAULT_HOST='local.pcms.backup_vault';
export const DAY=86400000, RETAIN=14, RETRY=3600000;
const active=new Set(['PREPARING','VERIFIED','DISPATCH_POSSIBLE','DOWNLOAD_STARTED']);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const idOK=s=>typeof s==='string'&&/^auto_[a-f0-9]{32}$/.test(s);
export function emptyAuto(){
  return {revision:0,enabled:false,lastSuccessDay:-1,lastAttemptDay:-1,
    nextAttemptAt:0,active:null,archives:[],status:'DISABLED',code:'AUTO_OFF'};
}
export function validAuto(s){
  return !!s&&Number.isSafeInteger(s.revision)&&s.revision>=0&&
    typeof s.enabled==='boolean'&&Number.isSafeInteger(s.lastSuccessDay)&&
    Number.isSafeInteger(s.lastAttemptDay)&&Number.isFinite(s.nextAttemptAt)&&
    Array.isArray(s.archives)&&s.archives.length<=500&&
    s.archives.every(a=>a.kind==='AUTO'&&idOK(a.runId)&&Number.isSafeInteger(a.downloadId)&&
      a.downloadId>=0&&hex(a.sha256)&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&
      typeof a.filename==='string'&&Number.isSafeInteger(a.day)&&
      ['COMPLETE','DELETION_POSSIBLE','REMOVED','DELETE_HELD'].includes(a.state))&&
    (!s.active||(idOK(s.active.runId)&&active.has(s.active.status)&&
      Number.isSafeInteger(s.active.day)&&Number.isSafeInteger(s.active.startedAt)));
}
export function dayAt(now){if(!Number.isSafeInteger(now)||now<0)throw Error('BACKUP_CLOCK_INVALID');return Math.floor(now/DAY);}
export function admission(s,now){
  if(!validAuto(s))return {ok:false,code:'BACKUP_STATE_CORRUPT'};
  if(!s.enabled)return {ok:false,code:'AUTO_OFF'};
  const day=dayAt(now);
  // A backward clock shift cannot replay yesterday's successful attempt.
  if(s.lastSuccessDay>=day)return {ok:false,code:'BACKUP_ALREADY_DONE'};
  if(s.active)return {ok:false,code:'BACKUP_INFLIGHT_OR_UNCERTAIN'};
  if(now<s.nextAttemptAt)return {ok:false,code:'BACKUP_COOLDOWN'};
  // A missing period is one catch-up, never a burst proportional to downtime.
  return {ok:true,day,catchUp:s.lastAttemptDay>=0&&day>s.lastAttemptDay+1};
}
export function vaultResponse(response){
  // Never spread, stringify or log untrusted native responses.
  if(!response||typeof response!=='object'||Array.isArray(response)||
    Object.keys(response).some(k=>!['ok','passphrase','code'].includes(k)))
    return {ok:false,code:'VAULT_PROTOCOL_INVALID'};
  if(response.ok!==true){
    const code=['LOCKED','MISSING','UNAVAILABLE','DENIED','TIMEOUT'].includes(response.code)?
      response.code:'UNAVAILABLE';
    return {ok:false,code:'SUSPENDED_KEY_UNAVAILABLE',reason:code};
  }
  if(typeof response.passphrase!=='string'||response.passphrase.length<12||
    new TextEncoder().encode(response.passphrase).length>4096)
    return {ok:false,code:'VAULT_PROTOCOL_INVALID'};
  return {ok:true,passphrase:response.passphrase};
}
export function ownedFile(row){
  // Always match the actual whole Firefox path, not just a filename glob.
  return !!row&&Number.isSafeInteger(row.id)&&row.id>=0&&
    typeof row.filename==='string'&&
    /[/\\]Downloads[/\\]pcms-backups[/\\]pcms-alpha-auto-[a-f0-9]{32}(?: \(\d+\))?\.encrypted$/i.test(row.filename)&&
    row.state==='complete'&&row.exists===true&&
    Number.isSafeInteger(row.fileSize)&&row.fileSize>0;
}
export function archiveFromDownload(runId,day,sha256,bytes,row){
  if(!idOK(runId)||!Number.isSafeInteger(day)||!hex(sha256)||
    !Number.isSafeInteger(bytes)||bytes<=0||!ownedFile(row)||row.fileSize!==bytes)
    return null;
  if(!row.filename.includes(runId))return null;
  return {kind:'AUTO',runId,day,downloadId:row.id,sha256,bytes,
    filename:row.filename,state:'COMPLETE',tier:2};
}
export function selectRetention(archives){
  // Includes only independently tracked Tier 2 successes. Protect newest 14,
  // and never trust an ambiguous/missing/duplicate download identifier.
  const good=archives.filter(a=>a.kind==='AUTO'&&a.state==='COMPLETE'&&a.tier>=2)
    .sort((a,b)=>b.day-a.day||b.runId.localeCompare(a.runId));
  if(good.length<=RETAIN)return [];
  const unique=new Set(),duplicate=new Set();
  for(const a of archives){if(unique.has(a.downloadId))duplicate.add(a.downloadId);unique.add(a.downloadId);}
  const keep=new Set(good.slice(0,RETAIN).map(a=>a.runId));
  const lastGood=good[0]?.runId;
  return good.filter(a=>!keep.has(a.runId)&&a.runId!==lastGood&&
    !duplicate.has(a.downloadId)&&idOK(a.runId)&&hex(a.sha256));
}
export function deletionProof(archive,item){
  // No deletion on name collision, missing history, moved or edited files.
  if(!archive||archive.kind!=='AUTO'||archive.state!=='DELETION_POSSIBLE'||!ownedFile(item)||
    archive.downloadId!==item.id||archive.filename!==item.filename||
    archive.bytes!==item.fileSize)return {ok:false,code:'DELETE_PROOF_MISSING'};
  return {ok:true};
}
export function safeStatus(s){
  if(!validAuto(s))return {ok:false,code:'BACKUP_STATE_CORRUPT'};
  return {ok:true,enabled:s.enabled,status:s.status,code:s.code,
    retained:s.archives.filter(x=>x.state==='COMPLETE').length,
    deletionHeld:s.archives.filter(x=>x.state==='DELETE_HELD').length,
    lastSuccessDay:s.lastSuccessDay,active:s.active?.status||null,
    tier:s.archives.some(a=>a.state==='COMPLETE')?2:0,proof:'BROWSER_REPORTED_ONLY'};
}
