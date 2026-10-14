// I15 isolated background invocation of already verified I08 encrypted archive.
// Never stores a secret, calls a provider, or claims filesystem-byte proof.
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {snapshotCanonical,consistentOrThrow,encodeIntegrated,decodeIntegrated} from './backup-core.mjs';
import {getPcmsBackupDonor} from './backup-auto-donor.mjs';
async function donor(api){
  const data=await getPcmsBackupDonor().snapshot();
  if(!data?.state||!Array.isArray(data.containers))throw Error('BACKUP_DONOR_UNAVAILABLE');
  return {state:data.state,containers:data.containers};
}
async function storage(api){
  const data=await api.storage.local.get(null),out=Object.create(null);
  for(const [key,value] of Object.entries(data||{}))
    if(key==='automationJobs'||key.startsWith('gm-values:'))out[key]=value;
  return out;
}
async function cookies(api,portable){
  const out=Object.create(null);
  for(const person of portable.personas){
    const data=await getPcmsBackupDonor().cookies(person.sourceId);
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
