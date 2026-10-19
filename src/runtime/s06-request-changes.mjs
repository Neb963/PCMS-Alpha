// S06 Request Changes is local operator intent, never a provider command.
// The only child admission is an atomic handoff of independently tested F:
// same READY declaration, stable owner, same guarded generator/editor slot,
// previous-good P and Git source preserved, old AI/approval archived.
import {beginAiJob,validPromptRevision} from './ai-evidence.mjs';
import {exactSource,verifyReadback} from './staging-core.mjs';
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {isI17Quarantined} from './legacy-quarantine.mjs';
const fail=code=>({ok:false,code});
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const key=s=>'s06-change:'+s;
const show=r=>r?{ok:true,slug:r.slug,revision:r.revision,
  state:r.state,requestId:r.requestId,parentStageRevision:r.parentStageRevision,
  parentJobRevision:r.parentJobRevision,parentFingerprint:r.parentFingerprint,
  childStageRevision:r.childStageRevision||null,changedAt:r.changedAt}:
  fail('S06_REQUEST_NOT_FOUND');
const verified=(ready,stage,job,wb)=>{
  const active=ready?.active;
  return !!(active&&!ready.desired&&!ready.hold&&stage&&job&&wb&&
    stage.state==='SOURCE_VERIFIED'&&stage.verifiedAt&&
    stage.readyIdentifier===active.identifier&&
    stage.readyInputFingerprint===active.inputFingerprint&&
    job.stageRevision===stage.revision&&job.state==='TESTS_VERIFIED'&&
    job.readyIdentifier===active.identifier&&
    job.readyInputFingerprint===active.inputFingerprint&&
    job.executionSlotReleased===true&&
    ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.native?.state)&&
    fp(job.verifiedFinal)&&job.verifiedFinal===job.sourceFingerprint&&
    job.finalSource?.fingerprint===job.verifiedFinal&&
    wb.state==='CONFIRMED'&&wb.mode==='S06'&&
    wb.stageRevision===stage.revision&&wb.jobRevision===job.revision&&
    wb.sourceFingerprint===job.verifiedFinal&&wb.sealedSource?.fingerprint===job.verifiedFinal&&
    /^[a-f0-9]{40}$/.test(wb.commitSha||'')&&
    wb.readyIdentifier===active.identifier&&
    wb.readyInputFingerprint===active.inputFingerprint);
};
function tx(db,write,fn){
 return new Promise((resolve,reject)=>{
  let t,result=fail('S06_CHANGE_TRANSACTION_INCOMPLETE');
  try{t=db.transaction(write?['meta','events']:['meta'],write?'readwrite':'readonly');}
  catch{return reject(Error('S06_CHANGE_DB_UNAVAILABLE'));}
  t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('S06_CHANGE_DB_ABORT'));
  try{fn(t.objectStore('meta'),t,x=>{result=x;});}catch{try{t.abort();}catch{}}
 });
}
const promptFor=(parent,text)=>{
  const prompt={revision:parent?.prompt?.revision+1,
    source:'S06_REQUEST_CHANGES_CHILD',
    parentPromptRevision:parent?.prompt?.revision,
    tests:parent?.prompt?.tests,
    text:parent?.prompt?.text+'\n\nOperator Request Changes (exact saved F):\n'+text+
      '\nContinue only this generator; preserve the source and run all pinned tests. No Git, routing, account or publication operations.'};
  return validPromptRevision(prompt)?prompt:null;
};
export function createS06ChangeStore(db){
 const get=name=>!slug(name)?Promise.resolve(fail('S06_SLUG_INVALID')):
   tx(db,false,(m,t,done)=>m.get(key(name)).onsuccess=e=>
     done(show(e.target.result?.record)));
 function request({name,stage,job,sourceFingerprint,instructions,
   expectedStageRevision,expectedJobRevision,releaseRevision=null,requestId}){
  if(!slug(name)||isI17Quarantined({slug:name})||
     typeof instructions!=='string'||instructions.trim()!==instructions||
     instructions.length<3||instructions.length>4000||instructions.includes('\0')||
     !/^change_[a-f0-9]{32}$/.test(requestId||'')||
     !Number.isSafeInteger(expectedStageRevision)||expectedStageRevision<1||
     !Number.isSafeInteger(expectedJobRevision)||expectedJobRevision<1||
     (releaseRevision!==null&&(!Number.isSafeInteger(releaseRevision)||releaseRevision<1))||
     !fp(sourceFingerprint)||!promptFor(job,instructions))
    return Promise.resolve(fail('S06_CHANGE_REQUEST_INVALID'));
  return tx(db,true,(m,t,done)=>m.get(key(name)).onsuccess=oldReq=>{
   const old=oldReq.target.result?.record;
   if(old&&old.state==='REQUESTED'){
     done(fail('S06_REQUEST_ALREADY_PENDING'));return;
   }
   m.get('s06-human:'+name).onsuccess=human=>{
    if(human.target.result?.record?.state==='DEFERRED'){
     done(fail('S06_HUMAN_REVIEW_DEFERRED'));return;
    }
   m.get('s05-ready:'+name).onsuccess=rd=>{
    m.get('stage:'+name).onsuccess=st=>{
     m.get('ai-job:'+name).onsuccess=ai=>{
      m.get('writeback:'+name).onsuccess=gi=>{
       m.get('release:'+name).onsuccess=rl=>{
        const ready=rd.target.result?.record,s=st.target.result?.record,
          j=ai.target.result?.job,w=gi.target.result?.record,
          release=rl.target.result?.release;
        if(!verified(ready,s,j,w)||s.revision!==expectedStageRevision||
           j.revision!==expectedJobRevision||
           sourceFingerprint!==j.verifiedFinal||
           !stage||!job||stage.revision!==s.revision||job.revision!==j.revision||
           release?.revision!==(releaseRevision??undefined)){
          // A caller may omit releaseRevision only when no release exists.
          done(fail('S06_CHANGE_CONTEXT_CHANGED'));return;
        }
        if(release&&!['APPROVED','CANCELED'].includes(release.state)){
          done(fail('S06_PUBLICATION_ALREADY_ATTEMPTED'));return;
        }
        const record={slug:name,revision:(old?.revision||0)+1,
          requestId,instructions,state:'REQUESTED',
          readyIdentifier:ready.active.identifier,
          readyInputFingerprint:ready.active.inputFingerprint,
          parentStageRevision:s.revision,parentJobRevision:j.revision,
          parentFingerprint:j.verifiedFinal,parentWriteback:w.operationId,
          parentCommit:w.commitSha,changedAt:Date.now()};
        if(old)m.put({key:'s06-change-history:'+name+':'+old.requestId,
          record:structuredClone(old)});
        m.put({key:key(name),record});
        if(release?.state==='APPROVED'){
          const canceled={...release,state:'CANCELED',revision:release.revision+1,
            reason:'S06_REQUEST_CHANGES_APPROVAL_REVOKED',changedAt:Date.now()};
          m.put({key:'release:'+name,release:canceled});
          t.objectStore('events').add({stage:'S06_APPROVAL_REVOKED_FOR_REQUEST',slug:name,
            releaseId:release.releaseId,requestId});
        }
        t.objectStore('events').add({stage:'S06_REQUEST_CHANGES',slug:name,
          requestId,parentFingerprint:record.parentFingerprint,
          providerEffects:'NONE'});
        done(show(record));
       };
      };
     };
    };
   };
   };
  });
 }
 function admit(name,expectedRevision){
  if(!slug(name)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   return Promise.resolve(fail('S06_CHANGE_ADMISSION_INVALID'));
  return tx(db,true,(m,t,done)=>m.get(key(name)).onsuccess=e=>{
   const req=e.target.result?.record;
   if(!req||req.revision!==expectedRevision||req.state!=='REQUESTED'){
     done(fail('S06_REQUEST_STALE_OR_CONSUMED'));return;
   }
   m.get('s05-ready:'+name).onsuccess=rd=>{
    m.get('stage:'+name).onsuccess=st=>{
     m.get('ai-job:'+name).onsuccess=ai=>{
      m.get('writeback:'+name).onsuccess=gi=>{
       m.get('release:'+name).onsuccess=rl=>{
        const ready=rd.target.result?.record,s=st.target.result?.record,
          j=ai.target.result?.job,w=gi.target.result?.record,
          release=rl.target.result?.release;
        if(!verified(ready,s,j,w)||s.revision!==req.parentStageRevision||
           j.revision!==req.parentJobRevision||j.verifiedFinal!==req.parentFingerprint||
           w.operationId!==req.parentWriteback||w.commitSha!==req.parentCommit||
           ready.active.identifier!==req.readyIdentifier||
           ready.active.inputFingerprint!==req.readyInputFingerprint||
           (release&&!['CANCELED'].includes(release.state))){
          done(fail('S06_REQUEST_SOURCE_OR_OWNERSHIP_CHANGED'));return;
        }
        const prompt=promptFor(j,req.instructions);
        const childStage={...s,revision:s.revision+1,
          state:'SOURCE_VERIFIED',candidate:structuredClone(j.finalSource),
          sourceHead:w.commitSha,verifiedAt:Date.now(),
          parentStageRevision:s.revision,childRequestId:req.requestId};
        const result=prompt?beginAiJob({stage:childStage,
          prompt,optionalTesting:j.optionalTesting||null}):fail('S06_CHILD_PROMPT_INVALID');
        if(!result.ok){done(result);return;}
        const childJob={...result.job,revision:j.revision+1,
          createdAt:Date.now(),readyIdentifier:ready.active.identifier,
          readyInputFingerprint:ready.active.inputFingerprint,
          sourceFolder:s.sourceFolder,childRequestId:req.requestId,
          parentJobRevision:j.revision,parentFingerprint:j.verifiedFinal};
        m.put({key:'stage-history:'+name+':'+s.revision,record:structuredClone(s)});
        m.put({key:'ai-history:'+name+':'+j.revision,
          accountId:s.accountId,job:structuredClone(j)});
        m.put({key:'stage:'+name,record:childStage});
        m.put({key:'ai-job:'+name,accountId:s.accountId,job:childJob});
        const next={...req,revision:req.revision+1,state:'ADMITTED',
          childStageRevision:childStage.revision,childJobRevision:childJob.revision,
          changedAt:Date.now()};
        m.put({key:key(name),record:next});
        t.objectStore('events').add({stage:'S06_CHILD_ADMITTED',slug:name,
          requestId:req.requestId,parentFingerprint:req.parentFingerprint,
          childStageRevision:childStage.revision,providerEffects:'NONE'});
        done(show(next));
       };
      };
     };
    };
   };
  });
 }
 return Object.freeze({get,request,admit});
}
// A separate guarded read-only preflight, before atomic admission. A changed
// editor, route, owner or saved F holds the child rather than overwriting it.
export function createS06ChangeProgress(api,{
 open=openCanonicalDatabase,guard=internalPcmsGuard,maxCandidates=80}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let database=null,flight=null;const db=()=>database||=open().catch(e=>{database=null;throw e;});
 async function perform(){
  try{
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   const d=await db(),queue=createReadyStore(d),store=createS06ChangeStore(d);
   const cursorKey='pcmsS06ChangeCursor';
   const old=(await api.storage.local.get(cursorKey))?.[cursorKey];
   let after=typeof old==='string'&&slug(old)?old:'',examined=0,last='';
   for(let page=0;page<64&&examined<maxCandidates;page++){
    const list=await queue.list({after,limit:Math.min(80,maxCandidates-examined)});
    if(!list.ok)return list;
    for(let i=0;i<list.items.length;i++){
     const item=list.items[i];examined++;last=item.slug;
     const req=await store.get(item.slug);
     if(!req.ok||req.state!=='REQUESTED')continue;
     const next=i+1<list.items.length||list.more?item.slug:'';
     const held=async code=>{
       await api.storage.local.set({[cursorKey]:next,
         pcmsS06ChangeReceipt:{slug:item.slug,code,ok:false,
           observedAt:Date.now()}});
       return fail(code);
     };
     const [stage,job,writeback,ready]=await Promise.all([
      createStagingStore(d).getFull(item.slug),createAiStore(d).getJobFull(item.slug),
      createWritebackStore(d).getFull(item.slug),queue.get(item.slug)]);
     if(!stage.ok||!job.ok||!writeback.ok||!ready.ok||
        !verified(ready.record,stage.record,job.job,writeback.record))
       return held('S06_CHANGE_CURRENT_EVIDENCE_UNVERIFIED');
     const g=guard(),s=stage.record,j=job.job;
     if(!g?.getSafeRouteReadiness||!g?.inspectStageEditor||
        !g?.runNativeAiStep||!g?.observeReadOnly)
       return held('S06_CHILD_DONOR_GUARD_UNAVAILABLE');
     const route=await g.getSafeRouteReadiness(s.personaUid);
     const editor=await g.inspectStageEditor(s.personaUid,s.slug,s.nonce);
     const native=await g.runNativeAiStep(s.personaUid,{slug:s.slug,
       nonce:s.nonce,action:'OBSERVE'});
     const seen=await g.observeReadOnly(s.personaUid,false,s.slug);
     const f=await exactSource(j.finalSource.blobs);
     const packet={ok:seen?.ok,source:'DONOR_GUARDED_ORIGINAL_READBACK',
       slug:s.slug,accountId:s.accountId,personaUid:s.personaUid,
       principalFingerprint:seen?.principalFingerprint,
       remotePublicId:seen?.original?.remotePublicId,
       ownerResult:seen?.original?.ownerResult,visibility:seen?.original?.visibility,
       pjs:seen?.original?.pjs,html:seen?.original?.html,
       assets:seen?.original?.assets};
     const source=f.ok&&f.fingerprint===j.verifiedFinal?
       await verifyReadback(f,packet,{slug:s.slug,accountId:s.accountId,
         personaUid:s.personaUid,principalFingerprint:s.principalFingerprint,
         remotePublicId:s.remotePublicId}):fail('S06_CHILD_F_CORRUPT');
     const afterRoute=await g.getSafeRouteReadiness(s.personaUid);
     if(!route?.ready||!afterRoute?.ready||
        route.cookieStoreId!==afterRoute.cookieStoreId||route.routeId!==afterRoute.routeId||
        editor?.ok!==true||editor.clean!==true||
        native?.ok!==true||native.busy!==false||native.editorClean!==true||
        native.sessionDigest!==j.native?.sessionDigest||
        native.sourceSaved!==true||native.hasQueue!==false||
        native.inputOccupied!==false||native.attachmentsPending!==false||
        !source.ok||seen.original?.visibility!=='UNLISTED')
       return held('S06_CHILD_EDITOR_ROUTE_OR_SAVED_F_UNVERIFIED');
     if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
     const result=await store.admit(item.slug,req.revision);
     await api.storage.local.set({[cursorKey]:next,
       pcmsS06ChangeReceipt:{slug:item.slug,code:result.code||null,
         ok:result.ok,state:result.state,observedAt:Date.now()}});
     return result;
    }
    if(!list.more)break;
    if(!list.nextCursor||list.nextCursor<=after)
      return fail('S06_CHANGE_CURSOR_INVALID');
    after=list.nextCursor;
   }
   await api.storage.local.set({[cursorKey]:examined>=maxCandidates?last:''});
   return {ok:true,code:'S06_NO_PENDING_CHANGES'};
  }catch{return fail('S06_CHANGE_PROGRESS_UNAVAILABLE');}
 }
 const tick=()=>flight||(flight=perform().finally(()=>{flight=null;}));
 return Object.freeze({tick});
}
