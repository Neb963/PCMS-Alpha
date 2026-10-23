// A02 passwordless restore decision oracle. File framing and source closure
// were independently validated in disposable IndexedDB staging before this.
import {DB_STORES,validatePcmsSnapshot,digest} from './backup-core.mjs';
import {inspectRestoreMappings,stableRestoreDonorCut,
  RESTORE_EXCLUSIONS,RESTORE_MODES} from './restore-core.mjs';
import {validateBackupPayload,validateExternalArtifactHashes} from '../lib/backup-package.js';
const requireValid=(ok,code)=>{if(!ok)throw Error(code)};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function inspectPortableRestore({incoming,mode='merge',fresh=false,
  mappings={},currentPcms,currentDonor,currentPortable,containers=[]}){
  requireValid(RESTORE_MODES.includes(mode),'RESTORE_MODE_INVALID');
  validatePcmsSnapshot(currentPcms);
  requireValid(currentPortable&&Array.isArray(currentPortable.personas),
    'RESTORE_DESTINATION_PORTABLE_MISSING');
  requireValid(currentDonor?.state&&Array.isArray(currentDonor.containers),
    'RESTORE_DESTINATION_UNAVAILABLE');
  requireValid(incoming?.sourceVerified===true&&
    incoming.receipt?.status==='READY'&&
    /^[a-f0-9]{64}$/.test(incoming.receipt.chain||''),
    'PORTABLE_STAGE_NOT_VERIFIED');
  validatePcmsSnapshot(incoming.canonical);
  validateBackupPayload(incoming.donor);
  await validateExternalArtifactHashes(incoming.donor.scripts||[],{entries:true});
  const groups=inspectRestoreMappings(incoming.donor,mappings,containers,
    {fresh,strict:false});
  const destinationSha256=await digest(JSON.stringify({
    pcms:currentPcms,donor:stableRestoreDonorCut(currentDonor),
    portable:currentPortable}));
  const sourceSha256=await digest(JSON.stringify(incoming.canonical));
  const risk={
    importedPersonas:groups.length,
    unmappedPersonas:groups.filter(g=>g.status==='MAPPING_REQUIRED').length,
    newContainers:groups.filter(g=>g.status==='CREATE_REQUESTED').length,
    directRouteReviews:groups.filter(g=>g.status==='DIRECT_REVIEW_REQUIRED').length,
    importedRoutes:(incoming.donor.routes||[]).length,
    importedScripts:(incoming.donor.scripts||[]).length,
    importedCookies:Object.values(incoming.donor.cookies||{}).reduce((n,a)=>n+
      (Array.isArray(a)?a.length:0),0),
    canonicalRows:DB_STORES.reduce((n,s)=>n+incoming.canonical.stores[s].length,0),
    currentCanonicalRows:DB_STORES.reduce((n,s)=>n+currentPcms.stores[s].length,0),
    importedApprovalStatus:'HISTORICAL_ONLY',
    routeStatus:'BLOCK_UNTIL_INDEPENDENT_ROUTE_REVIEW',
    sessionStatus:'UNVERIFIED',providerEffects:'OFF',
    newController:fresh?'INACTIVE_PREDECESSOR_UNKNOWN':'RESTORE_HELD'
  };
  const plan={schema:2,format:'pcms-alpha-portable',mode,fresh,
    archiveSha256:incoming.receipt.chain,sourceSha256,destinationSha256,
    groups,risk,exclusions:RESTORE_EXCLUSIONS};
  return {plan,planSha256:await digest(JSON.stringify(plan))};
}
export async function verifyPortableCheckpoint({
  checkpoint,currentPcms,currentPortable}){
  requireValid(checkpoint?.sourceVerified===true&&
    checkpoint?.receipt?.status==='READY',
    'RESTORE_CHECKPOINT_FILE_REQUIRED');
  // A separate file selected by the operator and fully read through the
  // browser's File stream is independent input proof, not a native disk host.
  // A manual archive captures its own PREPARING receipt; completing its
  // browser download necessarily changes backup:manual-active. That record
  // cannot serve as self-certifying destination evidence and is not imported
  // as live disk authority. All other canonical rows remain exact.
  const withoutSelfReceipt=snapshot=>({...snapshot,stores:{
    ...snapshot.stores,meta:snapshot.stores.meta.filter(row=>
      row.key!=='backup:manual-active')}});
  requireValid(same(withoutSelfReceipt(checkpoint.canonical),
    withoutSelfReceipt(currentPcms)),'RESTORE_CHECKPOINT_PCMS_DRIFT');
  requireValid(same(checkpoint.donor,currentPortable),
    'RESTORE_CHECKPOINT_DONOR_DRIFT');
  return {verified:true,tier:3,sha256:checkpoint.receipt.chain,
    evidence:'OPERATOR_SELECTED_FILE_INDEPENDENT_READBACK'};
}
