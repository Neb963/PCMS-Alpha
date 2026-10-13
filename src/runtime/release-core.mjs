// I13 pure release/rollback admission. Neither Git writeback nor a human
// approval implies a provider listing effect. All manifest bytes are in F.
import {fail,isSafeId} from './journal.mjs';
import {exactSource,diffSource} from './staging-core.mjs';
import {evaluation} from './ai-evidence.mjs';

export const RELEASE_STATES=Object.freeze([
  'APPROVED','DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN',
  'CONFIRMED_PUBLIC','RECOVERY_HOLD','RESTORED_UNLISTED'
]);
const fp=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const slug=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(v);
export function releaseContext(stage,account,inventory) {
  if(!stage||!account||!inventory||!slug(stage.slug)||
     inventory.slug!==stage.slug||inventory.accountId!==stage.accountId||
     inventory.personaUid!==stage.personaUid||
     inventory.bindingVersion!==stage.bindingVersion||
     inventory.remoteId!==stage.remotePublicId||
     inventory.ownerState!=='OBSERVED_OWNER'||
     account.accountId!==stage.accountId||account.personaUid!==stage.personaUid||
     account.bindingVersion!==stage.bindingVersion||
     account.revision!==stage.accountRevision||
     account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
     account.identity?.bindingVersion!==stage.bindingVersion||
     account.identity?.principalFingerprint!==stage.principalFingerprint||
     !fp(stage.principalFingerprint))
    return fail('RELEASE_OWNER_OR_BINDING_CHANGED');
  return {ok:true};
}
export function releaseTestContext(stage,job) {
  if(stage?.state!=='SOURCE_VERIFIED'||!stage.verifiedAt||
     !job||job.slug!==stage.slug||job.stageRevision!==stage.revision||
     job.state!=='TESTS_VERIFIED'||job.executionSlotReleased!==true||
     evaluation(job).state!=='TESTS_VERIFIED'||
     job.sourceFingerprint!==job.verifiedFinal||
     job.finalSource?.fingerprint!==job.verifiedFinal||
     !fp(job.verifiedFinal)||
     !['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.native?.state))
    return fail('RELEASE_TESTS_STALE_OR_UNVERIFIED');
  return {ok:true};
}
export async function candidateManifest(stage,job) {
  if(!releaseTestContext(stage,job).ok)return fail('RELEASE_TESTS_STALE_OR_UNVERIFIED');
  const source=await exactSource(job.finalSource.blobs);
  if(!source.ok||source.fingerprint!==job.verifiedFinal)
    return fail('FINAL_F_BYTES_CHANGED');
  return source;
}
export function releaseGitContext(stage,probe) {
  // A relevant Git HEAD change must be interpreted by inspectGitSource,
  // never by comparing raw main HEADs (unrelated commits are allowed).
  if(!probe?.ok||probe.ready!==true||probe.folder!==stage?.sourceFolder||
     !fp(probe.fingerprint)||!Array.isArray(probe.paths)||
     !/^[a-f0-9]{40}$/.test(probe.head||''))
    return fail('RELEASE_READY_NOT_VERIFIED');
  if(probe.testingSha!==stage.testingSha)
    return fail('RELEASE_TEST_INPUT_CHANGED');
  return {ok:true,head:probe.head,fingerprint:probe.fingerprint,
    testingSha:probe.testingSha};
}
export function releaseEditorContext({stage,route,editor,native,previousRoute}) {
  if(!route?.ready||route.cookieStoreId!==previousRoute?.cookieStoreId||
     route.routeId!==previousRoute?.routeId||!stage?.nonce||
     editor?.ok!==true||editor.clean!==true||
     native?.ok!==true||native.busy!==false||native.editorClean!==true||
     native.sourceSaved!==true||native.hasQueue!==false||
     native.inputOccupied!==false||native.attachmentsPending!==false)
    return fail('RELEASE_EDITOR_OR_ROUTE_UNVERIFIED');
  return {ok:true};
}
export function existingUpdateAdmission({adoption,inventory,shadow,previous,archive,backup}){
  if(!adoption||adoption.archived===true||
     adoption.archiveState!=='ARCHIVED_GIT_CONFIRMED'||
     !fp(adoption.original?.fingerprint)||adoption.original?.blobs?.length<2||
     adoption.remotePublicId!==inventory?.remoteId||
     adoption.accountId!==inventory?.accountId||
     adoption.bindingVersion!==inventory?.bindingVersion||
     !previous?.ok||!archive?.ok||
     archive.fingerprint!==adoption.original.fingerprint||
     !backup?.ok||backup.decryptable!==true||backup.sourceFingerprint!==previous.fingerprint)
    return fail('ORIGINAL_OR_RECOVERY_NOT_PROVEN');
  // Shadow queue computes availability; it never itself unlists.
  if(shadow?.phase!=='SLEEP'||shadow.sleepEvidence!=='GUARDED_INTERVAL'||
     shadow.paused===true||inventory.visibility!=='UNLISTED'||
     shadow.listingEvidence!=='INDEPENDENT_UNLISTED_READBACK')
    return fail('SLEEP_OR_UNLIST_UNVERIFIED');
  return {ok:true};
}
export function approvalTuple({slug:target,stage,job,source,git,kind='PRIVATE_NEW',previous}) {
  if(!slug(target)||target!==stage?.slug||!source?.ok||
     source.fingerprint!==job?.verifiedFinal||!fp(source.fingerprint)||
     !git?.ok||!previous?.ok||!fp(previous.fingerprint))
    return fail('APPROVAL_INPUTS_UNVERIFIED');
  return {ok:true,tuple:{
    slug:target,accountId:stage.accountId,personaUid:stage.personaUid,
    bindingVersion:stage.bindingVersion,accountRevision:stage.accountRevision,
    remotePublicId:stage.remotePublicId,principalFingerprint:stage.principalFingerprint,
    stageRevision:stage.revision,jobRevision:job.revision,
    sourceFingerprint:source.fingerprint,files:source.files,
    previousFingerprint:previous.fingerprint,kind,
    gitFolder:stage.sourceFolder,gitTestingSha:git.testingSha,
    testPromptRevision:job.prompt?.revision??null,
    testingFingerprint:job.optionalTesting?.sha256??null
  }};
}
export function matchesApproval(approved,candidate) {
  if(!approved||!candidate)return fail('APPROVAL_MISSING');
  // Compare every authority-bearing field, not only the source digest.
  const keys=['slug','accountId','personaUid','bindingVersion',
    'accountRevision','remotePublicId','principalFingerprint',
    'stageRevision','jobRevision','sourceFingerprint',
    'previousFingerprint','kind','gitFolder','gitTestingSha',
    'testPromptRevision','testingFingerprint'];
  if(keys.some(k=>approved[k]!==candidate[k])||
     JSON.stringify(approved.files)!==JSON.stringify(candidate.files))
    return fail('APPROVAL_STALE');
  return {ok:true};
}
export async function publicationReadback(approval,observed,context){
  if(!approval||!observed||observed.ok!==true||
     observed.source!=='DONOR_GUARDED_ORIGINAL_READBACK'||
     observed.slug!==approval.slug||observed.accountId!==approval.accountId||
     observed.personaUid!==approval.personaUid||
     observed.principalFingerprint!==approval.principalFingerprint||
     observed.remotePublicId!==approval.remotePublicId||
     observed.ownerResult!=='IS_OWNER'||
     observed.visibility!=='PUBLIC'||context?.guardReady!==true||
     !Number.isSafeInteger(observed.observedAt)||observed.observedAt<1||
     !isSafeId(observed.observationId))
    return fail('PUBLICATION_NOT_INDEPENDENTLY_CONFIRMED');
  const toBase64=s=>{
    let binary='';const b=new TextEncoder().encode(s);
    for(let i=0;i<b.length;i+=8192)binary+=String.fromCharCode(...b.subarray(i,i+8192));
    return btoa(binary);
  };
  const actual=await exactSource([
    {path:'main.pjs',base64:toBase64(observed.pjs||'')},
    {path:'index.html',base64:toBase64(observed.html||'')},
    ...(Array.isArray(observed.assets)?observed.assets:[])
  ]);
  if(!actual.ok||actual.fingerprint!==approval.sourceFingerprint||
     actual.files.length!==approval.files.length||
     diffSource({ok:true,files:approval.files},actual).changes.length)
    return fail('PUBLICATION_SOURCE_CONTRADICTION');
  return {ok:true,source:'INDEPENDENT_PUBLICATION_READBACK',
    sourceFingerprint:actual.fingerprint,observationId:observed.observationId,
    observedAt:observed.observedAt};
}
export function safeRollbackAdmission({release,observed,editor,restore,previous}){
  if(!release||!['PUBLICATION_UNCERTAIN','RECOVERY_HOLD','CONFIRMED_PUBLIC'].includes(release.state)||
     !previous?.ok||previous.fingerprint!==release.approval.previousFingerprint||
     observed?.source!=='INDEPENDENT_FULL_BYTE_READBACK'||
     observed.fingerprint!==release.approval.sourceFingerprint||
     observed.visibility!=='UNLISTED'||editor?.ok!==true||editor.clean!==true||
     restore?.held===true)return fail('ROLLBACK_REQUIRES_EXACT_UNLISTED_F');
  return {ok:true,willRemain:'UNLISTED',republication:'FORBIDDEN'};
}
