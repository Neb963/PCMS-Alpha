// Realm-local receipts: an operator form cannot assert that an active native
// session stopped. Only fresh guarded observations can freeze a review source.
import {exactSource,verifyReadback} from './staging-core.mjs';
const proofs=new WeakMap();
const tuple=(s,j)=>[s.slug,s.revision,s.nonce,j.revision,j.sourceFingerprint,j.native?.sessionDigest];
export const validExceptionalIdleProof=(proof,stage,job)=>!!stage&&!!job&&!!proof&&proofs.has(proof)&&JSON.stringify(proofs.get(proof).tuple)===JSON.stringify(tuple(stage,job));
export const exceptionalIdleEvidence=(proof,stage,job)=>validExceptionalIdleProof(proof,stage,job)?proofs.get(proof):null;
export async function captureExceptionalIdle({guard:g,stage:s,job:j,held=async()=>false}){
 const fail=code=>({ok:false,code});
 if(!j.native){
  if(j.chat1?.sessionDigest||j.chat2?.sessionDigest||j.operatorInstruction||!['PENDING_NATIVE_SESSION','TESTS_UNVERIFIED'].includes(j.state)||!g?.inspectManualEditor||!g?.getSafeRouteReadiness||!g?.observeReadOnly)return fail('S06_EXCEPTION_NEVER_STARTED_UNVERIFIED');
  const route=await g.getSafeRouteReadiness(s.personaUid),editor=await g.inspectManualEditor(s.personaUid,s.slug,s.nonce);
  if(!route?.ready||!editor?.ok||editor.noNativeSession!==true||editor.clean!==true)return fail('S06_EXCEPTION_NEVER_STARTED_UNVERIFIED');
  const source=await exactSource(s.candidate?.blobs);if(!source.ok||source.fingerprint!==j.sourceFingerprint)return fail('S06_EXCEPTION_STORED_SOURCE_INVALID');
  const raw=await g.observeReadOnly(s.personaUid,false,s.slug);
  const verified=await verifyReadback(source,{ok:raw?.ok===true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:s.slug,accountId:s.accountId,personaUid:s.personaUid,
   principalFingerprint:raw?.principalFingerprint,remotePublicId:raw?.original?.remotePublicId,ownerResult:raw?.original?.ownerResult,visibility:raw?.original?.visibility,
   pjs:raw?.original?.pjs,html:raw?.original?.html,assets:raw?.original?.assets},{slug:s.slug,accountId:s.accountId,personaUid:s.personaUid,principalFingerprint:s.principalFingerprint,remotePublicId:s.remotePublicId});
  const after=await g.getSafeRouteReadiness(s.personaUid),again=await g.inspectManualEditor(s.personaUid,s.slug,s.nonce);
  if(!verified.ok||!after?.ready||after.routeId!==route.routeId||after.cookieStoreId!==route.cookieStoreId||!again?.ok||again.noNativeSession!==true||again.clean!==true||again.noEditors!==editor.noEditors||again.tabId!==editor.tabId||await held())return fail('S06_EXCEPTION_CONTEXT_CHANGED');
  const proof=Object.freeze({ok:true});proofs.set(proof,{tuple:tuple(s,j),kind:'NEVER_DISPATCHED_SOURCE',source,route:after,editor:again});return proof;
 }
 if(!['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(j.native?.state)||!j.native?.sessionDigest||j.operatorInstruction||s.humanReclaimPending)
  return fail('S06_EXCEPTION_IDLE_SOURCE_REQUIRED');
 if(!g?.getSafeRouteReadiness||!g?.runNativeAiStep||!g?.inspectStageEditor||!g?.observeReadOnly)return fail('S06_EXCEPTION_GUARD_UNAVAILABLE');
 const route=await g.getSafeRouteReadiness(s.personaUid);if(!route?.ready)return fail('S06_EXCEPTION_ROUTE_UNVERIFIED');
 const valid=n=>n?.ok===true&&n.busy===false&&n.sessionDigest===j.native.sessionDigest&&n.editorClean===true&&n.sourceSaved===true&&n.hasQueue===false&&n.inputOccupied===false&&n.attachmentsPending===false;
 const observe=()=>g.runNativeAiStep(s.personaUid,{slug:s.slug,nonce:s.nonce,action:'OBSERVE'});
 if(!valid(await observe()))return fail('S06_EXCEPTION_NATIVE_NOT_SETTLED');
 const editor=await g.inspectStageEditor(s.personaUid,s.slug,s.nonce);if(!editor?.ok||editor.clean!==true)return fail('S06_EXCEPTION_EDITOR_UNVERIFIED');
 const raw=await g.observeReadOnly(s.personaUid,false,s.slug),source=await exactSource(j.finalSource?.blobs);
 if(!source.ok||source.fingerprint!==j.sourceFingerprint)return fail('S06_EXCEPTION_STORED_SOURCE_INVALID');
 const verified=await verifyReadback(source,{ok:raw?.ok===true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:s.slug,accountId:s.accountId,personaUid:s.personaUid,
  principalFingerprint:raw?.principalFingerprint,remotePublicId:raw?.original?.remotePublicId,ownerResult:raw?.original?.ownerResult,visibility:raw?.original?.visibility,
  pjs:raw?.original?.pjs,html:raw?.original?.html,assets:raw?.original?.assets},{slug:s.slug,accountId:s.accountId,personaUid:s.personaUid,principalFingerprint:s.principalFingerprint,remotePublicId:s.remotePublicId});
 if(!verified.ok)return fail('S06_EXCEPTION_SAVED_SOURCE_CHANGED');
 const after=await g.getSafeRouteReadiness(s.personaUid);
 if(!after?.ready||after.routeId!==route.routeId||after.cookieStoreId!==route.cookieStoreId||!valid(await observe())||await held())return fail('S06_EXCEPTION_CONTEXT_CHANGED');
 const proof=Object.freeze({ok:true});proofs.set(proof,{tuple:tuple(s,j),kind:'OBSERVED_NATIVE_IDLE',source,route:after,editor});return proof;
}
