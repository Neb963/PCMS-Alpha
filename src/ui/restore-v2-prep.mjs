// S02 v2 restore preparation reuses the existing I16 inert restore policy.
// No import, donor write, source activation, provider or route authority.
// Caller MUST separately verify actual native terminal authentication and
// file identity; this reader does not confer an approval by accepting a receipt.
import {decodeAuthenticatedV2,preserveNegativeZero,canonicalJSON} from './backup-v2-codec.mjs';
import {decodeV2InactiveFrames} from './restore-v2-stream-decode.mjs';
import {preflightSourceRecovery,digest,validatePcmsSnapshot} from './backup-core.mjs';
import {prepareRestoredCanonical} from './restore-sanitize.mjs';

const fail=code=>{throw Error(code)};
const check=(v,code)=>{if(!v)fail(code)};
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export async function prepareInactiveV2({
  authenticatedPlaintext,readback,expectedCiphertextSha256,
  password,decodeDonor,currentPcms,uidRemap={},mode='merge',
  fresh=false,accountChoices={}
}={}){
  check(authenticatedPlaintext instanceof Uint8Array &&
    readback?.state==='AUTHENTICATED_SECOND_PASS' &&
    sha(expectedCiphertextSha256) &&
    readback.sha256===expectedCiphertextSha256,
    'RESTORE_V2_AUTHENTICATED_SOURCE_REQUIRED');
  validatePcmsSnapshot(currentPcms);
  const opened=await decodeAuthenticatedV2(authenticatedPlaintext,{password,decodeDonor});
  return finalizeInactive(opened,{currentPcms,uidRemap,mode,
    fresh,accountChoices,
    archiveSha256:readback.sha256});
}
async function finalizeInactive(opened,{currentPcms,uidRemap,mode,
  fresh,accountChoices,archiveSha256}){
  const sourceAudit=opened.sourceAudit||await preflightSourceRecovery(opened.pcms);
  const prepared=prepareRestoredCanonical({
    incoming:opened.pcms,current:currentPcms,mode,uidRemap,
    fresh,accountChoices});
  // Independently revalidate rehydrated references *after* UID binding
  // sanitization, before any future guarded staged canonical write.
  await preflightSourceRecovery(prepared);
  return Object.freeze({
    prepared,donor:opened.donor,
    donorEnvelope:opened.donorEnvelope,
    sourceAudit,
    preparedSha256:await digest(canonicalJSON(preserveNegativeZero(prepared))),
    archiveSha256,
    status:'INACTIVE_PREPARED_NOT_APPLIED',
    controller:'RESTORE_HELD',activation:'OFF',
    providerEffects:'OFF',importedApproval:'HISTORICAL_ONLY'
  });
}

export async function prepareInactiveV2FromStage({
  stage,runId,readback,expectedCiphertextSha256,password,decodeDonor,
  currentPcms,uidRemap={},mode='merge',fresh=false,accountChoices={}
}={}){
  check(stage&&typeof stage.frames==='function'&&
    typeof stage.inspect==='function'&&
    typeof runId==='string'&&/^s02_[a-f0-9]{32}$/.test(runId)&&
    readback?.state==='AUTHENTICATED_SECOND_PASS'&&
    readback.complete===true&&
    sha(expectedCiphertextSha256)&&
    readback.sha256===expectedCiphertextSha256,
    'RESTORE_V2_TERMINAL_AUTH_REQUIRED');
  const observed=await stage.inspect(runId);
  check(observed?.runId===runId&&
    observed.state==='READY_FOR_INACTIVE_DECODER'&&
    observed.acceptedBytes===observed.expectedBytes,
    'RESTORE_V2_STAGING_UNVERIFIED');
  validatePcmsSnapshot(currentPcms);
  const opened=await decodeV2InactiveFrames(stage.frames(runId),{
    password,decodeDonor});
  return finalizeInactive(opened,{currentPcms,uidRemap,mode,
    fresh,accountChoices,archiveSha256:readback.sha256});
}
