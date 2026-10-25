import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
globalThis.crypto??=webcrypto;
const b64=s=>Buffer.from(s).toString('base64');
const source=async s=>exactSource([{path:'main.pjs',base64:b64(s)},
 {path:'index.html',base64:b64('<main>'+s+'</main>')}]);
const slug='s05-ai-successor',A='a'.repeat(64);
const fullStage=(previous,candidate)=>({slug,state:'SOURCE_VERIFIED',revision:9,
  verifiedAt:12345,nonce:'nonce-fixed-unique-01',candidate,previous,
  accountId:'account-01',personaUid:'persona-01',bindingVersion:2,
  readyIdentifier:'rev-revision-B',readyInputFingerprint:A,
  remotePublicId:'remote-01'});
async function seed(db,rows){
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['meta'],'readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  for(const row of rows)t.objectStore('meta').put(row);
 });
}
test('S05 AI accepts verified-idle saved predecessor without public release and frees same-account slot',async()=>{
 const previous=await source('A'),candidate=await source('B');
 const db=fakeDatabase(),store=createAiStore(db);
 const stage=fullStage(previous,candidate);
 const job={schema:1,slug,revision:6,stageRevision:8,accountId:'account-01',
  state:'KNOWN_FAILURE',sourceFingerprint:previous.fingerprint,
  finalSource:{fingerprint:previous.fingerprint},
  native:{state:'CHAT1_OBSERVED_IDLE'},executionSlotReleased:false};
 await seed(db,[
  {key:'ai-job:'+slug,job,accountId:'account-01'},
  {key:'s05-ready:'+slug,record:{revision:4,
    active:{identifier:'rev-revision-B',inputFingerprint:A},desired:null}},
  {key:'stage:'+slug,record:stage}
 ]);
 const result=await store.start(stage);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.revision,7);
 assert.equal(result.state,'PENDING_NATIVE_SESSION');
 assert.equal(db.read('meta','ai-history:'+slug+':6').job.state,'KNOWN_FAILURE');
 assert.equal(db.read('meta','ai-job:'+slug).job.readyIdentifier,'rev-revision-B');
});
test('S05 AI refuses running native predecessor or mismatched saved source',async()=>{
 const previous=await source('A'),candidate=await source('B');
 const stage=fullStage(previous,candidate);
 for(const job of [
  {state:'KNOWN_FAILURE',native:{state:'RUNNING_OBSERVED'},
   finalSource:{fingerprint:previous.fingerprint}},
  {state:'KNOWN_FAILURE',native:{state:'CHAT1_OBSERVED_IDLE'},
   finalSource:{fingerprint:'c'.repeat(64)}},
  {state:'HELD_RECONCILE',native:{state:'CHAT1_OBSERVED_IDLE'},
   finalSource:{fingerprint:previous.fingerprint}}
 ]){
  const db=fakeDatabase(),store=createAiStore(db);
  await seed(db,[
   {key:'ai-job:'+slug,accountId:'account-01',job:{schema:1,slug,
    revision:6,stageRevision:8,sourceFingerprint:previous.fingerprint,...job}},
   {key:'s05-ready:'+slug,record:{active:{
      identifier:'rev-revision-B',inputFingerprint:A},desired:null}},
   {key:'stage:'+slug,record:stage}
  ]);
  const result=await store.start(stage);
  assert.equal(result.code,'AI_PREVIOUS_NATIVE_OR_SOURCE_NOT_QUIESCENT');
  assert.equal(db.keys('events').length,0);
  assert.equal(db.read('meta','ai-job:'+slug).job.revision,6);
 }
});

test('S05 start rejects stale or absent canonical stage inside the committing transaction',async()=>{
 const previous=await source('A'),candidate=await source('B');
 const stage=fullStage(previous,candidate);
 for(const mutate of [
   () => null,
   r => ({...r,revision:r.revision+1}),
   r => ({...r,nonce:'different-writer-nonce'}),
   r => ({...r,state:'HUMAN_OWNED'}),
   r => ({...r,verifiedAt:undefined}),
   r => ({...r,readyIdentifier:'rev-old-candidate'})
 ]){
   const db=fakeDatabase(),store=createAiStore(db);
   const prior={schema:1,slug,revision:6,stageRevision:8,
     accountId:'account-01',state:'KNOWN_FAILURE',
     sourceFingerprint:previous.fingerprint,finalSource:{fingerprint:previous.fingerprint},
     native:{state:'CHAT1_OBSERVED_IDLE'},executionSlotReleased:false};
   const canonical=mutate(stage);
   await seed(db,[
      {key:'ai-job:'+slug,accountId:'account-01',job:prior},
      {key:'s05-ready:'+slug,record:{revision:4,
        active:{identifier:'rev-revision-B',inputFingerprint:A},desired:null}},
      ...(canonical?[{key:'stage:'+slug,record:canonical}]:[])
   ]);
   const result=await store.start(stage);
   assert.equal(result.code,'AI_CANONICAL_STAGE_CHANGED',JSON.stringify(result));
   assert.equal(db.read('meta','ai-job:'+slug).job.revision,6);
   assert.equal(db.keys('events').length,0);
 }
});

test('J04 public successor AI uses saved unapproved replacement F1 and retains original P for release; stale replacement CAS is held',async()=>{
 const P=await source('original published P'),F1=await source('saved unapproved F1'),F2=await source('new READY F2');
 for(const mode of ['valid','wrong-baseline','changed-canonical']){
  const db=fakeDatabase(),store=createAiStore(db),stage={...fullStage(P,F2),sourceOrigin:'EXISTING_UPDATE',writePrevious:mode==='wrong-baseline'?P:F1};
  const job={schema:1,slug,revision:6,stageRevision:8,accountId:'account-01',state:'TESTS_VERIFIED',sourceFingerprint:F1.fingerprint,finalSource:{fingerprint:F1.fingerprint},native:{state:'CHAT1_OBSERVED_IDLE'},executionSlotReleased:true};
  await seed(db,[{key:'ai-job:'+slug,accountId:'account-01',job},{key:'s05-ready:'+slug,record:{active:{identifier:'rev-revision-B',inputFingerprint:A},desired:null}},{key:'stage:'+slug,record:mode==='changed-canonical'?{...stage,writePrevious:P}:stage}]);
  const out=await store.start(stage);
  assert.equal(out.ok,mode==='valid',JSON.stringify({mode,out}));
  if(mode==='valid'){assert.equal(out.state,'PENDING_NATIVE_SESSION');assert.equal(db.read('meta','stage:'+slug).record.previous.fingerprint,P.fingerprint);assert.equal(db.read('meta','stage:'+slug).record.writePrevious.fingerprint,F1.fingerprint)}
  else {assert.equal(out.code,mode==='wrong-baseline'?'AI_PREVIOUS_NATIVE_OR_SOURCE_NOT_QUIESCENT':'AI_CANONICAL_STAGE_CHANGED');assert.equal(db.read('meta','ai-job:'+slug).job.revision,6);assert.equal(db.keys('events').length,0)}
 }
});
