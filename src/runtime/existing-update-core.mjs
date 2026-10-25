// A05: passwordless previous-good source checkpoint for EXISTING_UPDATE.
// The original bytes remain immutable in canonical journal storage, and are
// verified again on every use. Old encrypted V1 records are read-only held,
// never silently converted, discarded or opened through an OS credential host.
import {fail} from './journal.mjs';
import {exactSource} from './staging-core.mjs';
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export async function sealPrevious(previous){
  if(previous?.ok!==true||!hex(previous.fingerprint))
    return fail('RECOVERY_SOURCE_INVALID');
  const source=await exactSource(previous.blobs);
  if(!source.ok||source.fingerprint!==previous.fingerprint)
    return fail('RECOVERY_SOURCE_DRIFT');
  return {ok:true,format:'PCMS_I13_P_PLAIN_V3',
    fingerprint:source.fingerprint,files:source.files.length,
    blobs:structuredClone(source.blobs)};
}
export async function unlockPrevious(checkpoint){
  if(checkpoint?.format==='PCMS_I13_P_V1')
    return fail('RECOVERY_LEGACY_PASSWORD_SEAL_HELD');
  if(checkpoint?.format!=='PCMS_I13_P_PLAIN_V3'||
     !hex(checkpoint.fingerprint)||!Number.isSafeInteger(checkpoint.files)||
     checkpoint.files<2||!Array.isArray(checkpoint.blobs))
    return fail('RECOVERY_CHECKPOINT_INVALID');
  try{
    const source=await exactSource(checkpoint.blobs);
    if(!source.ok||source.fingerprint!==checkpoint.fingerprint||
       source.files.length!==checkpoint.files)
      return fail('RECOVERY_SOURCE_DRIFT');
    return {ok:true,source};
  }catch{return fail('RECOVERY_CHECKPOINT_CORRUPT');}
}
export function authorizeSleepingUpdate({account,inventory,adoption,shadow,original,remote,windowOverride=false}){
  if(!account||!inventory||!adoption||!original?.ok||!remote?.ok||
    account.state!=='VERIFIED'||account.revision!==adoption.accountRevision||
    account.identity?.source!=='GUARDED_SESSION_READBACK'||
    account.identity?.principalFingerprint!==adoption.principalFingerprint||
    account.bindingVersion!==adoption.bindingVersion||
    account.personaUid!==adoption.personaUid||
    inventory.slug!==adoption.slug||inventory.remoteId!==adoption.remotePublicId||
    inventory.ownerState!=='OBSERVED_OWNER'||
    inventory.accountId!==adoption.accountId||
    inventory.bindingVersion!==adoption.bindingVersion||
    adoption.archiveState!=='ARCHIVED_GIT_CONFIRMED'||adoption.archived===true||
    remote.remotePublicId!==inventory.remoteId||remote.ownerResult!=='IS_OWNER'||
    remote.visibility!=='PUBLIC'||
    original.fingerprint!==remote.source?.fingerprint||
    (!windowOverride&&(shadow?.phase!=='SLEEPING'||!Number.isSafeInteger(shadow.sleepRemaining)||shadow.sleepRemaining<=0||shadow.slot===true))||shadow?.paused===true||
    shadow.identityHeld===true||shadow.reviewHeld===true||
    shadow.ownerVerified!==true||shadow.releaseVerified!==true||
    shadow.bindingVersion!==inventory.bindingVersion||
    shadow.remoteId!==inventory.remoteId||
    shadow.accountId!==inventory.accountId||
    shadow.personaUid!==inventory.personaUid)
    return fail('EXISTING_SLEEP_OWNER_OR_PRIOR_F_UNVERIFIED');
  return {ok:true,slug:inventory.slug,previousFingerprint:original.fingerprint};
}
