// S02 v2 restore preparation reuses the existing I16 inert restore policy.
// No import, donor write, source activation, provider or route authority.
// Caller MUST separately verify actual native terminal authentication and
// file identity; this reader does not confer an approval by accepting a receipt.
import {decodeAuthenticatedV2} from './backup-v2-codec.mjs';
import {preflightSourceRecovery,digest,validatePcmsSnapshot} from './backup-core.mjs';
import {prepareRestoredCanonical} from './restore-sanitize.mjs';

const fail=code=>{throw Error(code)};
const check=(v,code)=>{if(!v)fail(code)};
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export async function prepareInactiveV2({
  authenticatedPlaintext,readback,expectedCiphertextSha256,
  password,decodeDonor,currentPcms,uidRemap={},mode='merge'
}={}){
  check(authenticatedPlaintext instanceof Uint8Array &&
    readback?.state==='AUTHENTICATED_SECOND_PASS' &&
    sha(expectedCiphertextSha256) &&
    readback.sha256===expectedCiphertextSha256,
    'RESTORE_V2_AUTHENTICATED_SOURCE_REQUIRED');
  validatePcmsSnapshot(currentPcms);
  const opened=await decodeAuthenticatedV2(authenticatedPlaintext,{password,decodeDonor});
  const sourceAudit=await preflightSourceRecovery(opened.pcms);
  const prepared=prepareRestoredCanonical({
    incoming:opened.pcms,current:currentPcms,mode,uidRemap});
  // Independently revalidate rehydrated references *after* UID binding
  // sanitization, before any future guarded staged canonical write.
  await preflightSourceRecovery(prepared);
  return Object.freeze({
    prepared,donor:opened.donor,
    donorEnvelope:opened.donorEnvelope,
    sourceAudit,
    preparedSha256:await digest(JSON.stringify(prepared)),
    archiveSha256:readback.sha256,
    status:'INACTIVE_PREPARED_NOT_APPLIED',
    controller:'RESTORE_HELD',activation:'OFF',
    providerEffects:'OFF',importedApproval:'HISTORICAL_ONLY'
  });
}
