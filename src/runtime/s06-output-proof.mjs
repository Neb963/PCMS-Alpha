import {authorizeS06Exception} from './s06-exception-review.mjs';
// S06: canonical output lineage is a *separate*, attributed Git fact.
// Never overwrite the frozen S05 declaration/READY input fingerprint.
const SHA40=/^[0-9a-f]{40}$/,SHA64=/^[0-9a-f]{64}$/;
const OP=/^writeback_[0-9a-f]{32}$/;
const fail=code=>({ok:false,code});
export function sealedS06OutputProof({ready,stage,writeback,job,exception}={}){
  const r=ready?.record||ready,s=stage?.record||stage,
    w=writeback?.record||writeback;
  const active=r?.active;
  const exceptional=w?.mode==='S06_EXCEPTION';
  const reviewed=exceptional?authorizeS06Exception({ready:r,stage:s,
    job:job?.job||job,record:exception?.record||exception}):{ok:true};
  if(!r||!active||r.desired||r.hold||
     !s||s.slug!==r.slug||s.readyIdentifier!==active.identifier||
     s.readyInputFingerprint!==active.inputFingerprint||
     !w||w.state!=='CONFIRMED'||!['S06','S06_EXCEPTION'].includes(w.mode)||
     !reviewed.ok||
     (exceptional&&(w.exceptionRevision!==(exception?.record||exception)?.revision||
       w.sourceFingerprint!==(job?.job||job)?.sourceFingerprint))||
     w.folder!=='generators/'+r.slug||
     w.readyIdentifier!==active.identifier||
     w.readyInputFingerprint!==active.inputFingerprint||
     w.testingSha!==s.testingSha||
     !SHA64.test(w.sealedSource?.fingerprint||'')||
     w.sealedSource.fingerprint!==w.sourceFingerprint||
     !OP.test(w.operationId||'')||
     ![w.baseHead,w.expectedHead,w.commitSha].every(x=>SHA40.test(x||'')))
    return fail('S06_ATTRIBUTED_OUTPUT_NOT_AVAILABLE');
  return {ok:true,outputProof:{readyIdentifier:active.identifier,
    readyInputFingerprint:active.inputFingerprint,
    testingSha:w.testingSha,folder:w.folder,operationId:w.operationId,
    baseHead:w.baseHead,expectedHead:w.expectedHead,
    commitSha:w.commitSha,sealedSource:w.sealedSource}};
}

// A requested/adopted child may inherit a PCMS-written Git F while its own
// tests are still pending. Preserve that historical Git fact; it grants no
// current testing or publication authority. PREPARED successor writes also
// retain the exact confirmed predecessor via their immutable history.
export async function resolveS06OutputProof(db,context){
 const direct=sealedS06OutputProof(context);if(direct.ok)return direct;
 const stage=context.stage?.record||context.stage,ready=context.ready?.record||context.ready,current=context.writeback?.record||context.writeback;
 if(!stage||!ready?.active||ready.desired||ready.hold)return direct;
 const read=key=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('OUTPUT_HISTORY_READ_FAILED'))});
 const candidates=[];
 if(current?.state==='CONFIRMED')candidates.push(current);
 else if(current?.baseHead===stage.sourceHead){
  const rows=await new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').openCursor(),out=[];q.onsuccess=e=>{const c=e.target.result;if(!c){resolve(out);return}if(typeof c.key==='string'&&c.key.startsWith('writeback-history:'+stage.slug+':'))out.push(c.value?.record);c.continue()};q.onerror=reject});
  candidates.push(...rows.filter(w=>w?.state==='CONFIRMED'&&w.commitSha===stage.sourceHead));
 }
 for(const w of candidates){
  if(w.commitSha!==stage.sourceHead||w.accountId!==stage.accountId||w.personaUid!==stage.personaUid||
     w.principalFingerprint!==stage.principalFingerprint||w.remotePublicId!==stage.remotePublicId)continue;
  let parentStage=stage,parentJob=context.job?.job||context.job,exception=context.exception?.record||context.exception;
  if(w.mode==='S06_EXCEPTION'){
   parentStage=(await read('stage-history:'+stage.slug+':'+w.stageRevision))?.record;
   parentJob=(await read('ai-history:'+stage.slug+':'+w.jobRevision))?.job;
   if(exception?.revision!==w.exceptionRevision)exception=(await read('s06-exception-history:'+stage.slug+':'+w.exceptionRevision))?.record;
   if(!parentStage||!parentJob||parentStage.slug!==stage.slug||parentStage.accountId!==stage.accountId||parentStage.personaUid!==stage.personaUid||parentStage.bindingVersion!==stage.bindingVersion||parentStage.remotePublicId!==stage.remotePublicId||parentStage.principalFingerprint!==stage.principalFingerprint)continue;
  }
  const proof=sealedS06OutputProof({ready,stage:parentStage,job:parentJob,writeback:w,exception});
  if(proof.ok)return {...proof,historical:true};
 }
 return direct;
}
