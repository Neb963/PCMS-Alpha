// I15 isolated background invocation of already verified I08 encrypted archive.
// Never stores a secret, calls a provider, or claims filesystem-byte proof.
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {snapshotCanonical,consistentOrThrow,encodeIntegrated,decodeIntegrated,
  preflightSourceRecovery,snapshotCanonicalV2,verifyCanonicalV2Unchanged,
  v2CaptureResourcePolicy,checkV2BrowserStorage} from './backup-core.mjs';
import {waitForPcmsBackupDonor} from './backup-auto-donor.mjs';
import {retryS02ConsistentCut} from './source-cut-retry.mjs';
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

// S02: source-complete *cut preparation* shares the existing I15 donor and
// Firefox/IndexedDB consistency authorities. No second backup scheduler.
// The caller is the guarded background coordinator; successful cut preparation
// never itself writes the disk, source, donor, provider, Git or routing state.
async function advisoryNativeMemory(api){
  // The registered fixed-purpose S02 host reports a Linux OS/cgroup hint.
  // No untrusted message, path, vault secret or operational authority is sent.
  // Failure is recorded as unsupported measurement, not a false heap value.
  let port;
  try{
    port=api.runtime.connectNative('local.pcms.backup_v2');
    const answer=await new Promise((resolve,reject)=>{
      let settled=false;
      port.onMessage.addListener(value=>{if(!settled){settled=true;resolve(value);}});
      port.onDisconnect.addListener(()=>{if(!settled){settled=true;
        reject(Error('BACKUP_V2_OS_MEMORY_UNAVAILABLE'));}});
      port.postMessage({action:'resource.inspect'});
    });
    return answer?.ok===true&&answer.state==='ADVISORY_ONLY'&&
      Number.isSafeInteger(answer.osAvailableMemoryBytes)&&
      answer.osAvailableMemoryBytes>0?answer.osAvailableMemoryBytes:null;
  }catch{return null;}
  finally{try{port?.disconnect()}catch{}}
}
async function captureV2SourceCutOnce(api,db,password,sentinel,{
  donorReader=waitForPcmsBackupDonor,resourceEnvironment=globalThis.navigator,
  osMemoryProbe=advisoryNativeMemory
}={}){
  const available=await osMemoryProbe(api);
  const policy=v2CaptureResourcePolicy(resourceEnvironment,available);
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
      osAvailableMemoryBytes:policy.osAvailableMemoryBytes,
      maxAggregateUtf16Bytes:policy.maxAggregateUtf16Bytes,
      browserHeapBytes:null,initialQuota,finalQuota}),
    cut:'CONSISTENT_SOURCE_CUT'});
}

// The five-store cut must stay unchanged through donor/cookie materialization.
// A concurrent background journal write invalidates that candidate, never
// permits a partial export. Retry read-only capture at most three times;
// unrelated errors and persistent churn remain hard failures. No external
// native export or provider effect is dispatched by this function.
export function captureV2SourceCut(api,db,password,sentinel,options={}){
  return retryS02ConsistentCut(()=>
    captureV2SourceCutOnce(api,db,password,sentinel,options));
}
