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
  // An optional capability check is an externally independently proven L
  // receipt, never a boolean derived from the UI or an HTTP save ACK.
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
    const proof=methodProofFor({row,account});
    if(proof?.source!=='INDEPENDENT_LIVE_SOURCE_MARKER_PROOF'||
       proof.allowedByProvider!==true||
       proof.meaningfulEffectVerified!==true||
       !/^[A-Za-z0-9_-]{1,100}$/.test(proof.version||'')||
       !/^[A-Za-z0-9_-]{1,100}$/.test(proof.evidenceId||''))return {status:'UNVERIFIED'};
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
    if(!planned.ok)return {status:'UNVERIFIED'};
    const entry={row:{stableId:row.stableId,slug:row.slug,accountId:row.accountId,
      personaUid:row.personaUid,remoteId:row.remoteId,bindingVersion:row.bindingVersion},
      principalFingerprint:account.principalFingerprint,sourceFingerprint,
      targetFingerprint:planned.toFingerprint,nonce,markerId,
      previousFiles:planned.previousFiles,targetFiles:planned.targetFiles};
    // A newer prepared candidate replaces only volatile, *undispatched* data;
    // the canonical RESERVED/DISPATCH_POSSIBLE claim is the actual authority.
    pending.set(row.stableId,entry);
    return {status:'SUPPORTED_AND_VERIFIED',method:'CONTROLLED_SOURCE_MARKER',
      allowedByProvider:true,meaningfulEffectVerified:true,
      sourceFingerprint,targetFingerprint:entry.targetFingerprint,
      markerId,evidenceId:proof.evidenceId,version:proof.version};
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
       entry.markerId!==claim.markerId)return denied('REFRESH_PREPARED_CANDIDATE_CHANGED');
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
    return {
      kind:fingerprint===claim.targetFingerprint?'EFFECT_CHANGED':
        fingerprint===claim.sourceFingerprint?'NO_EFFECT':'UNKNOWN',
      sourceFingerprint:fingerprint,targetMatched:true,principalMatched:true
    };
  }
  return Object.freeze({prepare,execute,readback});
}
