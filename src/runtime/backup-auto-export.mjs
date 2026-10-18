// I15 isolated background invocation of already verified I08 encrypted archive.
// Never stores a secret, calls a provider, or claims filesystem-byte proof.
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {snapshotCanonical,consistentOrThrow,encodeIntegrated,decodeIntegrated,
  preflightSourceRecovery,snapshotCanonicalV2,verifyCanonicalV2Unchanged} from './backup-core.mjs';
import {waitForPcmsBackupDonor} from './backup-auto-donor.mjs';
async function donor(api,readDonor=waitForPcmsBackupDonor){
  const data=await (await readDonor()).snapshot();
  if(!data?.state||!Array.isArray(data.containers))throw Error('BACKUP_DONOR_UNAVAILABLE');
  return {state:data.state,containers:data.containers};
}
async function storage(api){
  const data=await api.storage.local.get(null),out=Object.create(null);
  for(const [key,value] of Object.entries(data||{}))
    if(key==='automationJobs'||key.startsWith('gm-values:'))out[key]=value;
  return out;
}
async function cookies(api,portable,readDonor=waitForPcmsBackupDonor){
  const out=Object.create(null);
  for(const person of portable.personas){
    const data=await (await readDonor()).cookies(person.sourceId);
    if(!Array.isArray(data))throw Error('BACKUP_COOKIE_UNAVAILABLE');
    out[person.sourceId]=data;
  }
  return out;
}
export async function sealAutomatic(api,db,password,sentinel){
  const before=await donor(api),extras=await storage(api);
  const pcms=await snapshotCanonical(db);
  const params={state:before.state,containers:before.containers,userscriptData:extras,
    automationHistory:filterOrdinaryAutomationJobs(Object.values(extras.automationJobs||{})),
    selection:{kind:'full'}};
  const initial=createPortableBackupPayload(params);
  const cookieData=await cookies(api,initial);
  const portable=createPortableBackupPayload({...params,cookiesByProfile:cookieData});
  const envelope=await encodeBackupEnvelope({payload:portable,password,scope:{kind:'full'},
    appVersion:api.runtime.getManifest().version,stateSchemaVersion:before.state.schemaVersion});
  const [after,extrasAfter,pcmsAfter,cookiesAfter]=await Promise.all([
    donor(api),storage(api),snapshotCanonical(db),cookies(api,initial)]);
  consistentOrThrow(pcms,pcmsAfter);
  consistentOrThrow(before,after);
  consistentOrThrow(extras,extrasAfter);
  consistentOrThrow(cookieData,cookiesAfter);
  if((await sentinel.inspect()).held)throw Error('BACKUP_RESTORE_HOLD');
  const archive=await encodeIntegrated({pcms,donorEnvelope:envelope,passphrase:password,
    appVersion:api.runtime.getManifest().version});
  const checked=await decodeIntegrated(archive.text,password,{decodeDonor:decodeBackupEnvelope});
  consistentOrThrow(checked.pcms,pcms);
  return archive;
}

// Narrow §9 aggregate browser admission. Firefox does not provide precise
// available JS heap. deviceMemory, where present, is a coarse bucket only.
// Cap measured serialized UTF-16 source volume; no account/history ceilings.
const MiB=1048576;
export function v2CaptureResourcePolicy(environment=globalThis.navigator){
  const bucket=Number(environment?.deviceMemory);
  const memoryBucketGiB=Number.isFinite(bucket)&&bucket>=1&&bucket<=128?
    bucket:null;
  const maxAggregateUtf16Bytes=memoryBucketGiB===null?512*MiB:
    Math.min(2048*MiB,Math.max(512*MiB,
      Math.floor(memoryBucketGiB*1024*MiB/8)));
  return {maxAggregateUtf16Bytes,memoryBucketGiB,
    browserHeapBytes:null,measurement:'SERIALIZED_UTF16_PROXY_NOT_JS_HEAP'};
}
export async function checkV2BrowserStorage(environment,estimatedStageBytes=0){
  if(!Number.isSafeInteger(estimatedStageBytes)||estimatedStageBytes<0)
    throw Error('BACKUP_V2_RESOURCE_POLICY_INVALID');
  let sample=null;
  try{sample=await environment?.storage?.estimate?.();}catch{}
  const usage=sample?.usage,quota=sample?.quota;
  if(!Number.isFinite(usage)||!Number.isFinite(quota)||
     usage<0||quota<=0||usage>quota)
    return {known:false,usageBytes:null,quotaBytes:null,
      warning:'BROWSER_QUOTA_UNKNOWN_NOT_RESERVED'};
  // Quota is advisory; native disk is independently preflighted. Allow the
  // existing source to remain; reserve staging growth and a safety margin.
  const needed=Math.max(128*MiB,Math.ceil(estimatedStageBytes*2));
  if(quota-usage<needed)throw Error('BACKUP_V2_BROWSER_QUOTA_INSUFFICIENT');
  return {known:true,usageBytes:usage,quotaBytes:quota,
    freeEstimateBytes:quota-usage,reserveBytes:needed,
    warning:'BROWSER_QUOTA_ADVISORY_NOT_RESERVED'};
}

// S02: source-complete *cut preparation* shares the existing I15 donor and
// Firefox/IndexedDB consistency authorities. No second backup scheduler.
// The caller is the guarded background coordinator; successful cut preparation
// never itself writes the disk, source, donor, provider, Git or routing state.
export async function captureV2SourceCut(api,db,password,sentinel,{
  donorReader=waitForPcmsBackupDonor,resourceEnvironment=globalThis.navigator
}={}){
  const policy=v2CaptureResourcePolicy(resourceEnvironment);
  const initialQuota=await checkV2BrowserStorage(resourceEnvironment);
  const before=await donor(api,donorReader),extras=await storage(api);
  const resourceStats={};
  const pcms=await snapshotCanonicalV2(db,{
    maxAggregateUtf16Bytes:policy.maxAggregateUtf16Bytes,resourceStats});
  // Strict E-06 source-byte closure: legacy v1 may still preserve incomplete
  // historical state, but candidate v2 must never export incomplete source.
  const sourceAudit=await preflightSourceRecovery(pcms);
  const params={state:before.state,containers:before.containers,userscriptData:extras,
    automationHistory:filterOrdinaryAutomationJobs(Object.values(extras.automationJobs||{})),
    selection:{kind:'full'}};
  const initial=createPortableBackupPayload(params);
  const cookieData=await cookies(api,initial,donorReader);
  const portable=createPortableBackupPayload({...params,cookiesByProfile:cookieData});
  const donorEnvelope=await encodeBackupEnvelope({
    payload:portable,password,scope:{kind:'full'},
    appVersion:api.runtime.getManifest().version,
    stateSchemaVersion:before.state.schemaVersion});
  const finalQuota=await checkV2BrowserStorage(resourceEnvironment,
    Math.ceil(resourceStats.aggregateUtf16Bytes/3)+donorEnvelope.length);
  const [after,extrasAfter,sourceCutCheck,cookiesAfter]=await Promise.all([
    donor(api,donorReader),storage(api),verifyCanonicalV2Unchanged(db,pcms),
    cookies(api,initial,donorReader)]);
  if(sourceCutCheck?.ok!==true)throw Error('BACKUP_SOURCE_CUT_CHANGED');
  consistentOrThrow(before,after);
  consistentOrThrow(extras,extrasAfter);
  consistentOrThrow(cookieData,cookiesAfter);
  if((await sentinel.inspect()).held)throw Error('BACKUP_RESTORE_HOLD');
  return Object.freeze({pcms,donorEnvelope,sourceAudit,
    resourceEstimate:Object.freeze({aggregateUtf16Bytes:resourceStats.aggregateUtf16Bytes,
      canonicalRows:resourceStats.canonicalRows,
      memoryBucketGiB:policy.memoryBucketGiB,
      maxAggregateUtf16Bytes:policy.maxAggregateUtf16Bytes,
      browserHeapBytes:null,initialQuota,finalQuota}),
    cut:'CONSISTENT_SOURCE_CUT'});
}
