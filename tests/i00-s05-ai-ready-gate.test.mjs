import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {authorizeReadyAiAdvance} from '../src/runtime/ready-ai-gate.mjs';
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
