import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {authorizeReadyAiAdvance,authorizeGitReadyAiAdvance} from '../src/runtime/ready-ai-gate.mjs';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';
const slug='s05-old-job',sha='a'.repeat(64),id='rev-s05candidate1';
const job={slug,revision:7,readyIdentifier:id,readyInputFingerprint:sha};
const ready={ok:true,record:{active:{identifier:id,inputFingerprint:sha},desired:null}};
test('S05 older native session stays reconcilable but cannot advance after newer READY',async()=>{
 assert.equal(authorizeReadyAiAdvance(job,ready).ok,true);
 assert.equal(authorizeReadyAiAdvance(job,{...ready,record:{
  ...ready.record,desired:{identifier:'rev-s05candidate2'}}}).code,
  'S05_READY_SUPERSEDED_RECONCILE_OLDER_SESSION');
 assert.equal(authorizeReadyAiAdvance(job,{...ready,record:{
  active:{identifier:'rev-other',inputFingerprint:sha},desired:null}}).ok,false);
 assert.equal(authorizeReadyAiAdvance(job,{ok:false}).ok,false);
 assert.equal(authorizeReadyAiAdvance(job,{...ready,record:{
   ...ready.record,hold:'READY_REVOKED_NOT_READY'}}).code,
   'S05_READY_SUPERSEDED_RECONCILE_OLDER_SESSION');
 assert.equal(authorizeReadyAiAdvance({slug}, {ok:false}).ok,true,
  'legacy job retains its separate admission contract');
});
test('S05 port rejects stale READY for all effect-capable AI advancement commands',async()=>{
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['meta'],'readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  t.objectStore('meta').put({key:'s05-ready:'+slug,
    record:{slug,repositoryId:'1411034835',revision:4,
      active:{identifier:id,inputFingerprint:sha},
      desired:{identifier:'rev-s05candidate2',inputFingerprint:'b'.repeat(64)}}});
 });
 let native=0;
 const api={runtime:{id:'fixture-extension',getURL:s=>'moz-extension://fixture/'+s},
  storage:{local:{get:async()=>({})}}};
 const boundary=createAiBoundary(api,{
  open:async()=>db,effectGate:()=>true,
  storeFactory:()=>({getJobFull:async()=>({ok:true,job})}),
  guard:()=>({runNativeAiStep:async()=>{native++;return {ok:true};}})
 });
 const sender={id:'fixture-extension',url:'moz-extension://fixture/pcms/index.html'};
 for(const type of ['ADVANCE_JOB','BEGIN_NATIVE','RUN_TESTS','VERIFY_FRESH_CHAT2']){
  const r=await boundary.run({type,params:{slug,expectedRevision:7,
    ...(type==='BEGIN_NATIVE'?{step:'CHAT1_SEND'}:{})}},sender);
  assert.equal(r.code,'S05_READY_SUPERSEDED_RECONCILE_OLDER_SESSION',
    JSON.stringify({type,r}));
 }
 assert.equal(native,0);
});

test('S05 independent current-main READY must match job candidate before native work',()=>{
 const repositoryId='1411034835',head='d'.repeat(40);
 const catalog={ok:true,complete:true,source:'PINNED_MAIN_READ_ONLY',
   repositoryId,head};
 const coherent={ok:true,code:'READY_COHERENT_INPUT_PINNED',
   slug,pinnedHead:head,legacy:false,token:'s05candidate1',
   inputFingerprint:sha};
 const same=authorizeGitReadyAiAdvance(job,catalog,coherent,{repositoryId,slug});
 assert.equal(same.ok,true,JSON.stringify(same));
 for(const change of [
  {coherent:{...coherent,token:'a-new-ready'}},
  {coherent:{...coherent,inputFingerprint:'d'.repeat(64)}},
  {coherent:{...coherent,pinnedHead:'f'.repeat(40)}},
  {coherent:{...coherent,code:'READY_REVOKED'}},
  {catalog:{...catalog,complete:false}},
  {catalog:{...catalog,repositoryId:'another-repo'}}
 ]){
  const checked=authorizeGitReadyAiAdvance(job,change.catalog||catalog,
    change.coherent||coherent,{repositoryId,slug});
  assert.equal(checked.ok,false,JSON.stringify(change));
 }
});
test('S05 native send cannot use stale main even when cached local READY is active',async()=>{
 const db=fakeDatabase(),repositoryId='1411034835';
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  t.objectStore('meta').put({key:'s05-ready:'+slug,record:{
    revision:3,repositoryId,active:{identifier:id,inputFingerprint:sha},desired:null}});
 });
 let guarded=0;
 const api={runtime:{id:'fixture-extension',
   getURL:s=>'moz-extension://fixture/'+s,
   sendNativeMessage:async()=>({ok:true,credential:'fixture-read-token'})},
   storage:{local:{get:async key=>key==='pcmsS03Git'?
      {pcmsS03Git:{repository:'Neb963/per-gens',repositoryId}}:{}}}};
 const boundary=createAiBoundary(api,{open:async()=>db,
  storeFactory:()=>({getJobFull:async()=>({ok:true,job})}),
  guard:()=>{guarded++;return null;},
  gitCredential:async()=>({ok:true,credential:'fixture-read-token'}),
  scanCatalog:async()=>({ok:true,complete:true,source:'PINNED_MAIN_READ_ONLY',
    repositoryId,head:'a'.repeat(40)}),
  inspectReady:async()=>({ok:true,code:'READY_COHERENT_INPUT_PINNED',
    slug,pinnedHead:'a'.repeat(40),token:'revoked-previous',
    inputFingerprint:sha})});
 const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
 const result=await boundary.run({type:'BEGIN_NATIVE',params:{
   slug,expectedRevision:job.revision,step:'CHAT1_SEND'}},sender);
 assert.equal(result.code,'S05_AI_MAIN_READY_SUPERSEDED',JSON.stringify(result));
 assert.equal(guarded,0,'no donor-native provider effects');
});
