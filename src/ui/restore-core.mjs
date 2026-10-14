// I16 authenticated restore preflight. No import, identity or remote mutation authority.
// Plans carry digests, not decrypted archive content, into persistent diagnostics.
import {decodeIntegrated,digest,validatePcmsSnapshot,MAX_ARCHIVE_BYTES} from './backup-core.mjs';

const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const check=(v,c)=>{if(!v)throw Error(c);};
export const RESTORE_MODES=Object.freeze(['merge','replace']);
export const RESTORE_GROUPS=Object.freeze(['donor-personas','donor-cookies','donor-portable','pcms-canonical']);
export const RESTORE_EXCLUSIONS=Object.freeze([
  'native WireGuard private configurations','external provider sessions',
  'unsaved editor content','source controller authority','pre-existing publication approvals'
]);
export async function openRestoreArchive(bytes,password,{decodeDonor}={}){
  check(typeof decodeDonor==='function','RESTORE_DONOR_DECODER_REQUIRED');
  check(typeof bytes==='string'&&new TextEncoder().encode(bytes).length<=MAX_ARCHIVE_BYTES,'RESTORE_ARCHIVE_LIMIT');
  const archive=await decodeIntegrated(bytes,password,{decodeDonor});
  const donor=(await decodeDonor(archive.donorEnvelope,password)).payload;
  return {archive,donor,archiveSha256:await digest(bytes)};
}
export function inspectRestoreMappings(donor,mappings,containers,{fresh=false}={}){
  check(Array.isArray(donor?.personas)&&donor.personas.length<=10000,'RESTORE_PERSONAS_INVALID');
  check(mappings&&typeof mappings==='object'&&!Array.isArray(mappings),'RESTORE_MAPPING_REQUIRED');
  const available=new Map((containers||[]).filter(x=>typeof x?.cookieStoreId==='string').map(x=>[x.cookieStoreId,x]));
  const results=[],used=new Set(),keys=new Set();
  check(Object.keys(mappings).length===donor.personas.length,'RESTORE_MAPPING_INCOMPLETE');
  for(const p of donor.personas){
    check(typeof p.key==='string'&&p.key.length<=256&&!keys.has(p.key),'RESTORE_DUPLICATE_PERSONA');
    keys.add(p.key);
    const chosen=mappings[p.key];
    check(typeof chosen==='string'&&chosen.length>0&&available.has(chosen),'RESTORE_MAPPING_UNVERIFIED');
    check(!used.has(chosen),'RESTORE_MAPPING_COLLISION');used.add(chosen);
    const current=available.get(chosen);
    if(fresh)check(current.verifiedDisposable===true,'RESTORE_FRESH_BINDING_UNVERIFIED');
    check(p.profile?.routeMode!=='direct','RESTORE_DIRECT_REVIEW_REQUIRED');
    results.push({key:p.key,sourceId:p.sourceId||null,
      targetId:chosen,targetName:current.name||'Existing container',
      sourcePersonaUid:p.profile?.personaUid||null,
      status:'MAPPING_ONLY_UNVERIFIED'});
  }
  return results;
}
export async function previewRestore({archiveText,password,mode='merge',fresh=false,
  mappings={},currentPcms,currentDonor,currentPortable,containers=[],decodeDonor}){
  check(RESTORE_MODES.includes(mode),'RESTORE_MODE_INVALID');
  validatePcmsSnapshot(currentPcms);
  check(currentPortable&&typeof currentPortable==='object'&&Array.isArray(currentPortable.personas),
    'RESTORE_DESTINATION_PORTABLE_MISSING');
  check(currentDonor?.state&&Array.isArray(currentDonor.containers),'RESTORE_DESTINATION_UNAVAILABLE');
  const opened=await openRestoreArchive(archiveText,password,{decodeDonor});
  const groups=inspectRestoreMappings(opened.donor,mappings,containers,{fresh});
  // The archive itself is encrypted and authenticated. The destination cut is
  // not a lock: it must be re-read immediately before a guarded write.
  const destinationSha256=await digest(JSON.stringify({pcms:currentPcms,donor:currentDonor,portable:currentPortable}));
  const sourceSha256=await digest(JSON.stringify(opened.archive.pcms));
  const risk={
    importedPersonas:groups.length,
    importedRoutes:(opened.donor.routes||[]).length,
    importedScripts:(opened.donor.scripts||[]).length,
    importedCookies:Object.values(opened.donor.cookies||{}).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0),
    canonicalRows:Object.values(opened.archive.pcms.stores).reduce((n,a)=>n+a.length,0),
    currentCanonicalRows:Object.values(currentPcms.stores).reduce((n,a)=>n+a.length,0),
    importedApprovalStatus:'HISTORICAL_ONLY',
    routeStatus:'BLOCK_UNTIL_INDEPENDENT_ROUTE_REVIEW',
    sessionStatus:'UNVERIFIED',
    providerEffects:'OFF',
    newController:fresh?'INACTIVE_PREDECESSOR_UNKNOWN':'RESTORE_HELD'
  };
  // Never infer that matching container/name implies matching account, UID or route.
  const plan={schema:1,mode,fresh,archiveSha256:opened.archiveSha256,
    sourceSha256,destinationSha256,groups,risk,exclusions:RESTORE_EXCLUSIONS};
  const planSha256=await digest(JSON.stringify(plan));
  return {plan,planSha256,opened};
}
export async function verifyCheckpoint({checkpointText,password,currentPcms,
  currentPortable,archivedAtLeastTier=0,decodeDonor}){
  // A disk-selected file proves byte readback, but does not by itself prove
  // the current destination matches; compare both full canonical and donor cuts.
  check(archivedAtLeastTier===3,'RESTORE_CHECKPOINT_DISK_PROOF_REQUIRED');
  const opened=await openRestoreArchive(checkpointText,password,{decodeDonor});
  check(eq(opened.archive.pcms,currentPcms),'RESTORE_CHECKPOINT_PCMS_DRIFT');
  check(eq(opened.donor,currentPortable),'RESTORE_CHECKPOINT_DONOR_DRIFT');
  return {sha256:opened.archiveSha256,verified:true,tier:3};
}
export async function revalidateRestorePlan({expectedPlanSha256,expectedDestinationSha256,
  currentPcms,currentDonor,currentPortable,plan}){
  check(await digest(JSON.stringify(plan))===expectedPlanSha256,'RESTORE_PLAN_CHANGED');
  check(await digest(JSON.stringify({pcms:currentPcms,donor:currentDonor}))===
    expectedDestinationSha256,'RESTORE_DESTINATION_DRIFT');
  return true;
}
export function restoreReadiness(plan,checkpoint){
  if(!checkpoint?.verified||checkpoint.tier!==3)return {ok:false,code:'RESTORE_CHECKPOINT_REQUIRED'};
  if(!plan?.planSha256||!plan.plan?.archiveSha256)return {ok:false,code:'RESTORE_PLAN_REQUIRED'};
  if(plan.plan.fresh)return {ok:false,code:'RESTORE_FRESH_CONTROLLER_INACTIVE'};
  return {ok:true,code:'RESTORE_GUARD_ALLOWED'};
}
