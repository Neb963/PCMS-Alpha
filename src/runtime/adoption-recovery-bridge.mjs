// Internal S02 -> S04 proof bridge. Called ONLY after actual native-host
// ciphertext reopen, full authenticated inactive decode, independent source
// closure audit and native recovery qualification have all succeeded.
// No UI port, imported sources, or synthetic ACK can invoke this boundary.
import {createAdoptionStore} from './adoption-store.mjs';
import {recoveredAdoptionWitnesses} from './adoption-recovery.mjs';
const hex=/^[a-f0-9]{64}$/;
const run=/^s02_[a-f0-9]{32}$/;
export async function qualifyRecoveredOriginals({
  db,recoveredPcms,runId,ciphertextSha256,preparedSha256,sourceAudit
}){
  if(!db||!run.test(runId||'')||!hex.test(ciphertextSha256||'')||
     !hex.test(preparedSha256||'')||
     sourceAudit?.status!=='SOURCE_BYTES_AUDITED_NOT_DISK_VERIFIED')
    throw Error('S04_AUTHENTICATED_RECOVERY_REQUIRED');
  const witnessed=recoveredAdoptionWitnesses(recoveredPcms);
  const store=createAdoptionStore(db);
  let qualified=0,held=0,already=0;
  for(const witness of witnessed){
    // A restored prior profile is not an authority to mutate the present
    // profile: a fresh current local row must match EVERY identity/revision.
    let current;
    try{current=await store.getFull(witness.slug);}
    catch{held++;continue;}
    const a=current?.record;
    if(!current?.ok||a?.archived||a.archiveState!=='ARCHIVED_GIT_CONFIRMED'||
       a.revision!==witness.revision||
       a.accountId!==witness.accountId||
       a.personaUid!==witness.personaUid||
       a.bindingVersion!==witness.bindingVersion||
       a.remotePublicId!==witness.remotePublicId||
       a.original?.fingerprint!==witness.fingerprint||
       a.archiveCommit!==witness.archiveCommit||
       a.archiveRef!==witness.archiveRef){
      if(a?.originalCheckpoint?.receiptId===runId&&
         a.originalCheckpoint?.fingerprint===witness.fingerprint&&
         a.originalCheckpoint?.archiveDigest===ciphertextSha256)already++;
      else held++;
      continue;
    }
    let result;
    try{result=await store.confirmCheckpoint({
      slug:witness.slug,expectedRevision:witness.revision,
      proof:{source:'INDEPENDENT_AUTHENTICATED_RECOVERY',verified:true,
        receiptId:runId,originalFingerprint:witness.fingerprint,
        archiveDigest:ciphertextSha256,
        archiveCommit:witness.archiveCommit,archiveRef:witness.archiveRef}
    });}catch{held++;continue;}
    if(result?.ok)qualified++;else held++;
  }
  // Source content and personal identifiers never leave this boundary.
  return Object.freeze({total:witnessed.length,qualified,already,held,
    activation:'OFF',source:'QUALIFIED_DISK_REOPENED_SOURCE_READONLY'});
}
