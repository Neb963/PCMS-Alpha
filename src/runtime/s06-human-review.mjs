// S06 / C-53 human review takeover. Defer never touches the provider,
// native editor, Git or test evidence. Adopt admits only independently
// observed saved bytes as a NEW stage and untested AI job, preserving P/F.
import {beginAiJob} from './ai-evidence.mjs';
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createReadyStore} from './ready-store.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {exactSource} from './staging-core.mjs';
const fail=code=>({ok:false,code});
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const KEY=s=>'s06-human:'+s;
const show=r=>r?{ok:true,slug:r.slug,state:r.state,revision:r.revision,
  parentStageRevision:r.parentStageRevision,
  parentJobRevision:r.parentJobRevision,parentFingerprint:r.parentFingerprint,
  adoptedFingerprint:r.adoptedFingerprint||null,
  childStageRevision:r.childStageRevision||null,reclaimPending:r.reclaimPending===true,changedAt:r.changedAt}:
  fail('S06_HUMAN_REVIEW_NOT_FOUND');
export const humanReviewParentRevision=s=>s?.state==='SOURCE_VERIFIED'?s.revision:
 ['HANDOFF_REQUESTED','HUMAN_OWNED'].includes(s?.state)&&Number.isSafeInteger(s.handoffParentRevision)&&s.handoffParentRevision<s.revision&&s.handoffParentFingerprint===s.candidate?.fingerprint?s.handoffParentRevision:null;
const candidate=(ready,s,j,w)=>!!(ready?.active&&!ready.desired&&!ready.hold&&
  slug(ready?.slug)&&ready.slug===s?.slug&&s.slug===j?.slug&&
  s.slug===w?.slug&&w.folder==='generators/'+s.slug&&
  s.sourceFolder===w.folder&&
  humanReviewParentRevision(s)!==null&&s.verifiedAt&&
  s.readyIdentifier===ready.active.identifier&&
  s.readyInputFingerprint===ready.active.inputFingerprint&&
  j?.stageRevision===humanReviewParentRevision(s)&&j.state==='TESTS_VERIFIED'&&
  j.readyIdentifier===s.readyIdentifier&&
  j.readyInputFingerprint===s.readyInputFingerprint&&
  j.executionSlotReleased===true&&
  ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(j.native?.state)&&
  fp(j.verifiedFinal)&&j.verifiedFinal===j.sourceFingerprint&&
  j.finalSource?.fingerprint===j.verifiedFinal&&
  w?.mode==='S06'&&w.state==='CONFIRMED'&&
  w.stageRevision===humanReviewParentRevision(s)&&w.jobRevision===j.revision&&
  w.sourceFingerprint===j.verifiedFinal&&
  w.readyIdentifier===s.readyIdentifier&&
  w.readyInputFingerprint===s.readyInputFingerprint&&
  /^[a-f0-9]{40}$/.test(w.commitSha||''));
function transact(db,write,run){
 return new Promise((resolve,reject)=>{
   let tx,result=fail('S06_HUMAN_TRANSACTION_INCOMPLETE');
   try{tx=db.transaction(write?['meta','events']:['meta'],
       write?'readwrite':'readonly');}
   catch{return reject(Error('S06_HUMAN_DB_UNAVAILABLE'));}
   tx.oncomplete=()=>resolve(result);
   tx.onabort=()=>reject(Error('S06_HUMAN_DB_ABORTED'));
   try{run(tx.objectStore('meta'),tx,v=>{result=v;});}
   catch{try{tx.abort();}catch{}}
 });
}
const readCurrent=(m,name,done,run)=>{
 m.get('s05-ready:'+name).onsuccess=rd=>{
  m.get('stage:'+name).onsuccess=st=>{
   m.get('ai-job:'+name).onsuccess=ai=>{
    m.get('writeback:'+name).onsuccess=wb=>{
     m.get('release:'+name).onsuccess=rl=>{
      run({ready:rd.target.result?.record,s:st.target.result?.record,
       j:ai.target.result?.job,w:wb.target.result?.record,
       release:rl.target.result?.release},done);
     };
    };
   };
  };
 };
};
export function createS06HumanStore(db){
 const get=name=>!slug(name)?Promise.resolve(fail('S06_HUMAN_SLUG_INVALID')):
  transact(db,false,(m,t,done)=>m.get(KEY(name)).onsuccess=e=>
   done(show(e.target.result?.record)));
 function defer({name,expectedStageRevision,expectedJobRevision,
  expectedFingerprint}){
  if(!slug(name)||!Number.isSafeInteger(expectedStageRevision)||
    expectedStageRevision<1||!Number.isSafeInteger(expectedJobRevision)||
    expectedJobRevision<1||!fp(expectedFingerprint))
   return Promise.resolve(fail('S06_HUMAN_CONTEXT_INVALID'));
  return transact(db,true,(m,t,done)=>m.get(KEY(name)).onsuccess=oldHuman=>{
   const prior=oldHuman.target.result?.record;
   if(prior?.state==='DEFERRED'){done(fail('S06_HUMAN_ALREADY_DEFERRED'));return;}
   m.get('s06-change:'+name).onsuccess=ch=>{
    if(ch.target.result?.record?.state==='REQUESTED'){
      done(fail('S06_PENDING_REQUEST_CHANGES'));return;
    }
   readCurrent(m,name,done,({ready,s,j,w,release})=>{
    if(!candidate(ready,s,j,w)||
       s.revision!==expectedStageRevision||
       j.revision!==expectedJobRevision||
       j.verifiedFinal!==expectedFingerprint||
       (release&&!['APPROVED','CANCELED'].includes(release.state)&&
        !(release.state==='CONFIRMED_PUBLIC'&&
          release.approval?.sourceFingerprint===s.previous?.fingerprint))){
      done(fail('S06_HUMAN_CONTEXT_CHANGED'));return;
    }
    const row={slug:name,revision:(prior?.revision||0)+1,state:'DEFERRED',
      parentStageRevision:humanReviewParentRevision(s),parentJobRevision:j.revision,
      parentFingerprint:j.verifiedFinal,
      readyIdentifier:ready.active.identifier,
      readyInputFingerprint:ready.active.inputFingerprint,
      parentCommit:w.commitSha,changedAt:Date.now()};
    if(prior)m.put({key:'s06-human-history:'+name+':'+prior.revision,
      record:structuredClone(prior)});
    m.put({key:KEY(name),record:row});
    if(release?.state==='APPROVED'){
      const revoked={...release,revision:release.revision+1,
       state:'CANCELED',reason:'S06_HUMAN_REVIEW_DEFERRED',
       changedAt:Date.now()};
      m.put({key:'release:'+name,release:revoked});
    }
    t.objectStore('events').add({stage:'S06_HUMAN_DEFERRED',slug:name,
      parentStageRevision:s.revision,parentFingerprint:j.verifiedFinal,
      providerEffects:'NONE',savedHumanBytes:'NOT_TOUCHED'});
    done(show(row));
   });
   };
  });
 }
 async function adopt({name,expectedRevision,source}){
  if(!slug(name)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
    !source?.ok||!fp(source.fingerprint))
    return fail('S06_HUMAN_ADOPTION_INVALID');
  // The canonical store does not take caller-supplied "ok" or fingerprints
  // as an oracle. Reseal the full allowed file set before the local CAS.
  const sealed=await exactSource(source.blobs);
  if(!sealed.ok||sealed.fingerprint!==source.fingerprint||
     JSON.stringify(sealed.files)!==JSON.stringify(source.files)||
     JSON.stringify(sealed.blobs)!==JSON.stringify(source.blobs))
    return fail('S06_HUMAN_SOURCE_PROOF_INVALID');
  return transact(db,true,(m,t,done)=>m.get(KEY(name)).onsuccess=e=>{
   const prior=e.target.result?.record;
   if(!prior||prior.revision!==expectedRevision||prior.state!=='DEFERRED'){
    done(fail('S06_HUMAN_ADOPTION_STALE'));return;
   }
   readCurrent(m,name,done,({ready,s,j,w,release})=>{
    if(!candidate(ready,s,j,w)||
       prior.parentStageRevision!==humanReviewParentRevision(s)||
       prior.parentJobRevision!==j.revision||
       prior.parentFingerprint!==j.verifiedFinal||
       prior.parentCommit!==w.commitSha||
       prior.readyIdentifier!==ready.active.identifier||
       prior.readyInputFingerprint!==ready.active.inputFingerprint||
       source.fingerprint===j.verifiedFinal||
       (release&&release.state!=='CANCELED'&&
        !(release.state==='CONFIRMED_PUBLIC'&&
          release.approval?.sourceFingerprint===s.previous?.fingerprint))){
      done(fail('S06_HUMAN_SAVED_SOURCE_OR_RELEASE_CHANGED'));return;
    }
    const stage={...s,revision:s.revision+1,
      state:'SOURCE_VERIFIED',candidate:structuredClone(source),humanReclaimPending:true,
      handoffParentRevision:null,handoffParentFingerprint:null,
      sourceHead:w.commitSha,verifiedAt:Date.now(),
      childSource:'S06_INDEPENDENT_SAVED_HUMAN_SOURCE',
      parentStageRevision:humanReviewParentRevision(s),humanReviewRevision:prior.revision};
    const initial=beginAiJob({stage,prompt:j.prompt,
      optionalTesting:j.optionalTesting||null});
    if(!initial.ok){done(initial);return;}
    const job={...initial.job,revision:j.revision+1,createdAt:Date.now(),
      readyIdentifier:s.readyIdentifier,
      readyInputFingerprint:s.readyInputFingerprint,
      sourceFolder:s.sourceFolder,
      parentJobRevision:j.revision,adoptedHumanFingerprint:source.fingerprint};
    m.put({key:'stage-history:'+name+':'+s.revision,
      record:structuredClone(s)});
    m.put({key:'ai-history:'+name+':'+j.revision,
      accountId:s.accountId,job:structuredClone(j)});
    m.put({key:'stage:'+name,record:stage});
    m.put({key:'ai-job:'+name,accountId:s.accountId,job});
    const updated={...prior,revision:prior.revision+1,
      state:'ADOPTED_UNTESTED',reclaimPending:true,adoptedFingerprint:source.fingerprint,
      childStageRevision:stage.revision,childJobRevision:job.revision,
      changedAt:Date.now()};
    m.put({key:KEY(name),record:updated});
    t.objectStore('events').add({stage:'S06_HUMAN_SOURCE_ADOPTED',
      slug:name,sourceFingerprint:source.fingerprint,
      priorFingerprint:prior.parentFingerprint,
      childStageRevision:stage.revision,tests:'UNVERIFIED',
      providerEffects:'NONE'});
    done(show(updated));
   });
  });
 }
 function finishReclaim(name,expectedRevision){
  return transact(db,true,(m,t,done)=>m.get(KEY(name)).onsuccess=e=>{const r=e.target.result?.record;
   if(r?.state!=='ADOPTED_UNTESTED'||r.revision!==expectedRevision||!r.reclaimPending){done(fail('S06_HUMAN_RECLAIM_STALE'));return}
   readCurrent(m,name,done,({ready,s,j})=>{
    if(s?.revision!==r.childStageRevision||j?.revision!==r.childJobRevision||s.state!=='SOURCE_VERIFIED'||!s.humanReclaimPending||
      s.candidate?.fingerprint!==r.adoptedFingerprint||j.adoptedHumanFingerprint!==r.adoptedFingerprint||j.native||!ready?.active||ready.desired||
      ready.active.identifier!==r.readyIdentifier||ready.active.inputFingerprint!==r.readyInputFingerprint){done(fail('S06_HUMAN_RECLAIM_CHILD_CHANGED'));return}
    m.put({key:'stage:'+name,record:{...s,humanReclaimPending:false}});
    const next={...r,revision:r.revision+1,reclaimPending:false,changedAt:Date.now()};m.put({key:KEY(name),record:next});
    t.objectStore('events').add({stage:'S06_HUMAN_EDITOR_RECLAIM_CONFIRMED',slug:name,childStageRevision:s.revision,tests:'UNVERIFIED'});done(show(next));
   });
  });
 }
 return Object.freeze({get,defer,adopt,finishReclaim});
}
const encode=text=>{
 const raw=new TextEncoder().encode(text);let bin='';
 for(let i=0;i<raw.length;i+=8192)
  bin+=String.fromCharCode(...raw.subarray(i,i+8192));
 return btoa(bin);
};
export function createS06HumanBoundary(api,{
 open=openCanonicalDatabase,guard=internalPcmsGuard
}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let connection=null;const db=()=>connection||=open().catch(e=>{connection=null;throw e;});
 async function runTrusted(message){
  const p=message.params||{},database=await db(),
    store=createS06HumanStore(database);
  if(message.type==='GET_HUMAN')return store.get(p.slug);
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  if(message.type==='DEFER_HUMAN')return store.defer({
    name:p.slug,expectedStageRevision:p.expectedStageRevision,
    expectedJobRevision:p.expectedJobRevision,
    expectedFingerprint:p.expectedFingerprint});
  if(!['ADOPT_HUMAN','OPEN_HUMAN_EDITOR'].includes(message.type))return fail('S06_HUMAN_ACTION_INVALID');
  const [held,stage,job,writeback,ready]=await Promise.all([
    store.get(p.slug),createStagingStore(database).getFull(p.slug),
    createAiStore(database).getJobFull(p.slug),
    createWritebackStore(database).getFull(p.slug),
    createReadyStore(database).get(p.slug)
  ]);
  if(!held.ok||held.revision!==p.expectedRevision||!stage.ok||!job.ok||!writeback.ok||!ready.ok)return fail('S06_HUMAN_ADOPTION_CONTEXT_UNVERIFIED');
  const s=stage.record,j=job.job,g=guard();
  if(message.type==='OPEN_HUMAN_EDITOR'){
   if(held.state!=='DEFERRED'||!candidate(ready.record,s,j,writeback.record))return fail('S06_HUMAN_ADOPTION_CONTEXT_UNVERIFIED');
   const stages=createStagingStore(database);let current=s;
   if(current.state==='SOURCE_VERIFIED'){
    const request=await stages.move(p.slug,current.revision,'HANDOFF_REQUESTED',{reason:'HUMAN_TAKEOVER'});if(!request.ok)return request;
    current=(await stages.getFull(p.slug)).record;
   }
   if(current.state==='HANDOFF_REQUESTED'){
    const release=await g?.releaseStagingTab?.(s.personaUid,p.slug,s.nonce);if(!release?.ok)return fail('HANDOFF_RELEASE_UNVERIFIED');
    const moved=await stages.move(p.slug,current.revision,'HUMAN_OWNED');if(!moved.ok)return moved;
   }
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   return g?.openHumanReview?.(s.personaUid,p.slug,s.nonce)||fail('S06_HUMAN_DONOR_GUARD_UNAVAILABLE');
  }
  if(!g?.getSafeRouteReadiness||!g?.inspectHumanReview||!g?.reclaimHumanReview||!g?.observeReadOnly)return fail('S06_HUMAN_DONOR_GUARD_UNAVAILABLE');
  async function reclaim(row){
   const current=await createStagingStore(database).getFull(p.slug);
   if(!current.ok||current.record.revision!==row.childStageRevision||current.record.candidate?.fingerprint!==row.adoptedFingerprint||!current.record.humanReclaimPending)return fail('S06_HUMAN_RECLAIM_CHILD_CHANGED');
   const out=await g.reclaimHumanReview(current.record.personaUid,p.slug,current.record.nonce,row.adoptedFingerprint);
   if(!out?.ok||(await sentinel.inspect()).held)return {ok:false,code:'S06_HUMAN_EDITOR_RECLAIM_PENDING',human:row};
   return store.finishReclaim(p.slug,row.revision);
  }
  if(held.state==='ADOPTED_UNTESTED'&&held.reclaimPending)return reclaim(held);
  if(held.state!=='DEFERRED'||!candidate(ready.record,s,j,writeback.record))return fail('S06_HUMAN_ADOPTION_CONTEXT_UNVERIFIED');
  const before=await g.getSafeRouteReadiness(s.personaUid);if(before?.ready!==true)return fail('S06_HUMAN_ROUTE_UNVERIFIED');
  const editor=await g.inspectHumanReview(s.personaUid,s.slug,s.nonce);
  if(!editor?.ok||editor.clean!==true)return fail('S06_HUMAN_UNSAVED_OR_ACTIVE_EDITOR_DEFERRED');
  const owner=await g.observeReadOnly(s.personaUid,false,s.slug);
  if(owner?.ok!==true||owner.principalFingerprint!==s.principalFingerprint||
     owner.original?.ownerResult!=='IS_OWNER'||
     owner.original?.remotePublicId!==s.remotePublicId||
     owner.original?.visibility!=='UNLISTED'||
     typeof owner.original.pjs!=='string'||
     typeof owner.original.html!=='string'||!Array.isArray(owner.original.assets))
    return fail('S06_HUMAN_OWNER_OR_SOURCE_UNVERIFIED');
  const fresh=await exactSource([
    {path:'main.pjs',base64:encode(owner.original.pjs)},
    {path:'index.html',base64:encode(owner.original.html)},
    ...owner.original.assets]);
  if(!fresh.ok)return fail('S06_HUMAN_SAVED_BYTES_UNVERIFIED');
  if(fresh.fingerprint===j.verifiedFinal)
    return fail('S06_HUMAN_NO_CHANGED_SAVED_SOURCE');
  const after=await g.getSafeRouteReadiness(s.personaUid),editorAfter=await g.inspectHumanReview(s.personaUid,s.slug,s.nonce);
  if(!after?.ready||after.routeId!==before.routeId||after.cookieStoreId!==before.cookieStoreId||!editorAfter?.ok||editorAfter.clean!==true||
    editorAfter.noEditors!==editor.noEditors||editorAfter.sessionDigest!==editor.sessionDigest||editorAfter.humanEpoch!==editor.humanEpoch||(await sentinel.inspect()).held)return fail('S06_HUMAN_EDITOR_CHANGED_DURING_ADOPTION');
  // An intervening human save can leave the native session idle and clean
  // again. A fresh, independently observed full provider source is required
  // immediately before admitting this exact fingerprint into local testing.
  const second=await g.observeReadOnly(s.personaUid,false,s.slug);
  if(second?.ok!==true||
     second.principalFingerprint!==s.principalFingerprint||
     second.original?.ownerResult!=='IS_OWNER'||
     second.original?.remotePublicId!==s.remotePublicId||
     second.original?.visibility!=='UNLISTED'||
     typeof second.original.pjs!=='string'||
     typeof second.original.html!=='string'||
     !Array.isArray(second.original.assets))
    return fail('S06_HUMAN_SECOND_OWNER_UNVERIFIED');
  const repeated=await exactSource([
    {path:'main.pjs',base64:encode(second.original.pjs)},
    {path:'index.html',base64:encode(second.original.html)},
    ...second.original.assets]);
  if(!repeated.ok||repeated.fingerprint!==fresh.fingerprint||
     (await sentinel.inspect()).held)
    return fail('S06_HUMAN_SAVED_SOURCE_CHANGED_DURING_ADOPTION');
  const adopted=await store.adopt({name:p.slug,expectedRevision:p.expectedRevision,source:fresh});
  return adopted.ok?reclaim(adopted):adopted;
 }
 return Object.freeze({runTrusted});
}
