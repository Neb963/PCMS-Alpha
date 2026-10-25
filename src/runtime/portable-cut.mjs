import {archiveWithPortableLocal,collectPortableLocal} from './portable-local.mjs';
// A02 source-preserving, non-authorizing browser-native backup cut.
// Intent/receipt and download dispatch are owned by the existing I15 runner.
import {createPortableBackupPayload,validateExternalArtifactHashes} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {snapshotCanonicalV2,verifyCanonicalV2Unchanged,
  preflightSourceRecovery,consistentOrThrow} from './backup-core.mjs';
import {waitForPcmsBackupDonor} from './backup-auto-donor.mjs';
import {encodePortableArchive,readPortableArchive} from './portable-archive.mjs';

function requireValid(value,code){if(!value)throw Error(code);}
const safe=k=>k==='automationJobs'||k.startsWith('gm-values:');
async function snapshotDonor(api,readDonor){
  const donor=await readDonor();
  const result=await donor.snapshot();
  requireValid(result?.state&&Array.isArray(result.containers),
    'PORTABLE_DONOR_UNAVAILABLE');
  const local=await api.storage.local.get(null);
  const extras=Object.fromEntries(Object.entries(local||{}).filter(([key])=>safe(key)));
  const params={state:result.state,containers:result.containers,userscriptData:extras,
    automationHistory:filterOrdinaryAutomationJobs(Object.values(extras.automationJobs||{})),
    selection:{kind:'full'}};
  const initial=createPortableBackupPayload(params);
  const cookies=Object.create(null);
  for(const entry of initial.personas){
    const list=await donor.cookies(entry.sourceId);
    requireValid(Array.isArray(list),'PORTABLE_COOKIE_UNAVAILABLE');
    cookies[entry.sourceId]=list;
  }
  const portable=createPortableBackupPayload({...params,cookiesByProfile:cookies});
  await validateExternalArtifactHashes(portable.scripts||[],{entries:true});
  return {portable,localSettings:collectPortableLocal(local),cut:{state:result.state,containers:result.containers,extras,cookies,localSettings:collectPortableLocal(local)}};
}
export async function capturePortableCut(api,db,sentinel,{readDonor=waitForPcmsBackupDonor,
  collect=snapshotCanonicalV2,verify=verifyCanonicalV2Unchanged}={}){
  requireValid(!(await sentinel.inspect()).held,'BACKUP_RESTORE_HOLD');
  const original=await snapshotDonor(api,readDonor);
  // Temporary compatibility with v2 pinned source snapshots. A02's full-size
  // bounded cursor writer is separately required before declaring scale PASS.
  const rawPcms=await collect(db,{serializedValues:true});
  const pcms=archiveWithPortableLocal(rawPcms,original.localSettings);
  const sourceAudit=await preflightSourceRecovery(pcms);
  const built=await encodePortableArchive({pcms,donor:original.portable,
    appVersion:api.runtime.getManifest().version});
  const verified=await verify(db,rawPcms,{serializedValues:true});
  requireValid(verified?.ok===true,'BACKUP_SOURCE_CUT_CHANGED');
  const afterwards=await snapshotDonor(api,readDonor);
  consistentOrThrow(original.cut,afterwards.cut);
  requireValid(!(await sentinel.inspect()).held,'BACKUP_RESTORE_HOLD');
  const opened=await readPortableArchive(built.blob);
  consistentOrThrow(opened.canonical,pcms);
  consistentOrThrow(opened.donor,original.portable);
  consistentOrThrow(opened.archiveSourceAudit,sourceAudit);
  return Object.freeze({...built,sourceAudit,
    code:'IN_MEMORY_SOURCE_AND_DONOR_VERIFIED',diskReadback:false});
}
export async function downloadPortable(api,archive,{runId,manual=false}){
  requireValid(archive?.blob instanceof Blob&&Number.isSafeInteger(archive.bytes)&&
    archive.bytes>0,'PORTABLE_DOWNLOAD_INPUT_INVALID');
  requireValid(/^(auto|manual)_[a-f0-9]{32}$/.test(runId),'PORTABLE_RUN_INVALID');
  let url,downloadId;
  try{
    url=URL.createObjectURL(archive.blob);
    downloadId=await api.downloads.download({
      url,filename:'pcms-backups/pcms-alpha-'+runId+'.pcms.jsonl',
      conflictAction:'uniquify',saveAs:false});
    requireValid(Number.isSafeInteger(downloadId)&&downloadId>=0,
      'PORTABLE_DOWNLOAD_ID_UNKNOWN');
    return {downloadId,runId,bytes:archive.bytes,manual,objectUrl:url,
      sourceAudit:archive.sourceAudit,receiptTier:1,code:'DOWNLOAD_STARTED'};
  }finally{
    // Firefox may still stream after the returned download ID. Caller owns the
    // successful URL until a terminal download observation, not this function.
    if(url&&!Number.isSafeInteger(downloadId))URL.revokeObjectURL(url);
  }
}
