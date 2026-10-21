// S07 fixed source-only PUBLIC refresher adapter. No generic page executor.
// All remote actions are via the original donor lease / exact I13 writer.
// The production caller supplies NO live method evidence until L proof exists.
import {internalPcmsGuard} from './persona-guard.mjs';
import {exactSource} from './staging-core.mjs';
import {planRefresherSourceCandidate} from './refresher-admission.mjs';

const HEX=/^[a-f0-9]{64}$/,SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const denied=code=>({ok:false,code});
function base64(text){
  const raw=new TextEncoder().encode(text);
  let binary='';
  for(let i=0;i<raw.length;i+=8192)binary+=String.fromCharCode(...raw.subarray(i,i+8192));
  return btoa(binary);
}
async function readOwnedPublic(g,{slug,personaUid,remoteId,principalFingerprint}){
  if(!SLUG.test(slug||'')||!remoteId||!HEX.test(principalFingerprint||'')||
     typeof g?.observeReadOnly!=='function')return denied('REFRESH_TARGET_NOT_VERIFIED');
  const response=await g.observeReadOnly(personaUid,false,slug);
  const item=response?.original;
  if(response?.ok!==true||response.principalFingerprint!==principalFingerprint||
     item?.ownerResult!=='IS_OWNER'||item.visibility!=='PUBLIC'||
     item.remotePublicId!==remoteId||typeof item.pjs!=='string'||
     typeof item.html!=='string'||!Array.isArray(item.assets))
    return denied('REFRESH_REMOTE_OWNER_OR_VISIBILITY_CHANGED');
  const source=await exactSource([
    {path:'main.pjs',base64:base64(item.pjs)},
    {path:'index.html',base64:base64(item.html)},...item.assets]);
  return source.ok?{ok:true,source}:denied(source.code||'REFRESH_SOURCE_UNVERIFIED');
}
export function createRefresherNativeAdapter({
  guard=internalPcmsGuard,
  // Fixed guarded I13 writer availability is an engineering capability.
  // It does NOT assert that a source edit causes recent-page placement.
  methodProofFor=()=>null,
  newId=()=>crypto.randomUUID().replaceAll('-','')
}={}){
  const pending=new Map(); // volatile only: no source payload in scheduler IDB
  async function prepare(row,account){
    const g=guard();
    if(!g?.getSafeRouteReadiness||!g?.observeReadOnly||!g?.runRefresherStep||
       !HEX.test(account?.principalFingerprint||'')||
       !SLUG.test(row?.slug||'')||!HEX.test(row?.releaseFingerprint||'')||
       account?.verifiedIdentity!==true)
      return {status:'UNVERIFIED'};
    // A previous source save can be independently verified while local
    // tab cleanup failed. Safely retry only that exact S07-owned clean tab.
    if(row.refresh?.savedNonce){
      let released;
      try{released=await g.closeRefresherTab?.(row.personaUid,{
        slug:row.slug,nonce:row.refresh.savedNonce});}catch{}
      if(released?.ok!==true)return {status:'UNVERIFIED'};
    }
    const original=await readOwnedPublic(g,{
      slug:row.slug,personaUid:row.personaUid,remoteId:row.remoteId,
      principalFingerprint:account.principalFingerprint});
    const sourceFingerprint=row.refresh?.savedSourceFingerprint||row.releaseFingerprint;
    if(!original.ok||original.source.fingerprint!==sourceFingerprint)
      return {status:'UNVERIFIED'};
    const markerId=newId(),nonce=newId();
    if(!/^[a-f0-9]{32}$/.test(nonce)||
       !/^[A-Za-z0-9_-]{16,64}$/.test(markerId))return {status:'UNVERIFIED'};
    const planned=await planRefresherSourceCandidate({
      files:original.source.blobs,expectedFingerprint:sourceFingerprint,markerId});
    if(!planned.ok||planned.toFingerprint===sourceFingerprint)return {status:'UNVERIFIED'};
    // Proof is derived from this independently read owned-public source and
    // the concrete byte-different planned candidate, not an unconditional
    // installed-method assertion. Actual saved bytes and recent-feed presence
    // remain separate later receipts and must NEVER be inferred here.
    const proof=methodProofFor({row,account,source:original.source,
      planned,guard:g});
    if(!['GUARDED_FIXED_EDITOR_METHOD','INDEPENDENT_LIVE_SOURCE_MARKER_PROOF']
      .includes(proof?.source)||
       proof.allowedByProvider!==true||
       proof.meaningfulEffectVerified!==true||
       !/^[A-Za-z0-9_-]{1,100}$/.test(proof.version||'')||
       !/^[A-Za-z0-9_-]{1,100}$/.test(proof.evidenceId||''))return {status:'UNVERIFIED'};
    const entry={row:{stableId:row.stableId,slug:row.slug,accountId:row.accountId,
      personaUid:row.personaUid,remoteId:row.remoteId,bindingVersion:row.bindingVersion},
      principalFingerprint:account.principalFingerprint,sourceFingerprint,
      targetFingerprint:planned.toFingerprint,nonce,markerId,
      previousFiles:planned.previousFiles,targetFiles:planned.targetFiles};
    // A newer prepared candidate replaces only volatile, *undispatched* data;
    // the canonical RESERVED/DISPATCH_POSSIBLE claim is the actual authority.
    // A single Refresher turn prepares at most one source candidate.
    // Bound volatile full-source manifests to ONE candidate even if a
    // transaction later rejects admission; never accumulate fleet-sized
    // 16 MB objects across 1,000+ generators.
    pending.clear();
    pending.set(row.stableId,entry);
    return {status:'SUPPORTED_AND_VERIFIED',method:'CONTROLLED_SOURCE_MARKER',
      allowedByProvider:true,meaningfulEffectVerified:true,
      sourceFingerprint,targetFingerprint:entry.targetFingerprint,
      markerId,nonce,evidenceId:proof.evidenceId,version:proof.version};
  }
  async function execute(claim){
    const entry=pending.get(claim?.stableId);
    if(!entry||claim?.method!=='CONTROLLED_SOURCE_MARKER'||
       entry.row.slug!==claim.slug||entry.row.personaUid!==claim.personaUid||
       entry.row.accountId!==claim.accountId||
       entry.row.bindingVersion!==claim.bindingVersion||
       entry.principalFingerprint!==claim.principalFingerprint||
       entry.sourceFingerprint!==claim.sourceFingerprint||
       entry.targetFingerprint!==claim.targetFingerprint||
       entry.markerId!==claim.markerId||
       entry.nonce!==claim.nonce)return denied('REFRESH_PREPARED_CANDIDATE_CHANGED');
    pending.delete(claim.stableId);
    const g=guard();
    if(!g?.runRefresherStep)return denied('REFRESH_WRITER_UNAVAILABLE');
    // PUBLIC is mandatory inside the page's clean() and post-save checks.
    const result=await g.runRefresherStep(claim.personaUid,{
      action:'REFRESH',slug:claim.slug,nonce:entry.nonce,
      markerId:entry.markerId,previousFiles:entry.previousFiles,
      targetFiles:entry.targetFiles});
    // ACK alone is not an independently saved source observation.
    return result?.ok===true?{ok:true,code:'REFRESH_SAVE_ACK_ONLY'}:
      denied(result?.code||'REFRESH_SAVE_UNCERTAIN');
  }
  async function readback(claim){
    const g=guard();
    let checked;
    try{
      checked=await readOwnedPublic(g,{
        slug:claim?.slug,personaUid:claim?.personaUid,remoteId:claim?.remoteId,
        principalFingerprint:claim?.principalFingerprint});
    }catch{return {kind:'UNKNOWN',targetMatched:false,principalMatched:false};}
    if(!checked?.ok)return {kind:'UNKNOWN',targetMatched:false,principalMatched:false};
    const fingerprint=checked.source.fingerprint;
    // The original network readback has already independently verified the
    // full provider source. Only now attempt local cleanup of our own editor;
    // an unavailable cleanup is not a fabricated provider success.
    if((fingerprint===claim.targetFingerprint||fingerprint===claim.sourceFingerprint)&&
       /^[a-f0-9]{32}$/.test(claim.nonce||''))
      try{await g.closeRefresherTab?.(claim.personaUid,{
        slug:claim.slug,nonce:claim.nonce});}catch{}
    return {
      kind:fingerprint===claim.targetFingerprint?'EFFECT_CHANGED':
        fingerprint===claim.sourceFingerprint?'NO_EFFECT':'UNKNOWN',
      sourceFingerprint:fingerprint,targetMatched:true,principalMatched:true
    };
  }
  return Object.freeze({prepare,execute,readback});
}
