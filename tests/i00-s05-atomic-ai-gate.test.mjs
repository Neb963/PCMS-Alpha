import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
const slug='s05-atomic-advance';
const F='a'.repeat(64),H='b'.repeat(64),D='c'.repeat(64);
const candidate='rev-candidate-20261019';
const baseJob=()=>({schema:1,slug,revision:7,stageRevision:4,
  accountId:'account-fixture',sourceFingerprint:F,
  readyIdentifier:candidate,readyInputFingerprint:H,
  state:'KNOWN_FAILURE',native:{step:'CHAT1_SEND',state:'CHAT1_OBSERVED_IDLE',
    sessionDigest:D},finalSource:{fingerprint:F},verifiedFinal:null,
  chat1:{state:'RUNNING',sessionDigest:D,tests:{default_generator_smoke:{result:'FAIL',sourceFingerprint:F,observedAt:1}}},chat2:null,
  prompt:{revision:1,text:'Test the source',tests:['default_generator_smoke']},
  optionalTesting:null,turns:0,changes:[],hold:'INDEPENDENT_BROWSER_TESTS_REQUIRED'});
async function setup(ready,job=baseJob()){
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readwrite');
  tx.oncomplete=resolve;tx.onabort=()=>reject(Error('ABORT'));
  const m=tx.objectStore('meta');
  m.put({key:'ai-job:'+slug,job,accountId:'account-fixture'});
  if(ready)m.put({key:'s05-ready:'+slug,record:ready});
 });
 return {db,store:createAiStore(db)};
}
const active=()=>({revision:3,active:{identifier:candidate,inputFingerprint:H},desired:null});
const cases=[
 {name:'new desired token',ready:{...active(),desired:{identifier:'rev-next'}}},
 {name:'NOT_READY main revoke',ready:{...active(),hold:'READY_REVOKED_NOT_READY'}},
 {name:'active token changed',ready:{...active(),active:{
   identifier:'rev-something-else',inputFingerprint:H}}},
 {name:'missing READY ledger',ready:null}
];
test('S05 atomic native effect CAS blocks each superseded or revoked candidate',async()=>{
 for(const c of cases){
  const {db,store}=await setup(c.ready);
  const result=await store.armNative(slug,7,'CHAT1_REPAIR');
  assert.equal(result.code,'AI_READY_CANDIDATE_CHANGED',c.name+': '+JSON.stringify(result));
  assert.equal(db.read('meta','ai-job:'+slug).job.revision,7);
  assert.equal(db.keys('events').length,0);
 }
});
test('S05 atomic test evidence cannot mint PASS for superseded source, but live candidate can',async()=>{
 const entry={type:'TEST',chat:1,name:'default_generator_smoke',
  result:'PASS',sourceFingerprint:F,
  independentSource:'INDEPENDENT_BROWSER_ASSERTION',observedAt:100};
 for(const c of cases){
  const {db,store}=await setup(c.ready);
  const result=await store.record(slug,7,entry);
  assert.equal(result.code,'AI_READY_CANDIDATE_CHANGED',c.name+': '+JSON.stringify(result));
  assert.equal(db.read('meta','ai-job:'+slug).job.chat1.tests.default_generator_smoke.result,
    'FAIL');
  assert.equal(db.keys('events').length,0);
 }
 const good=await setup(active());
 const result=await good.store.record(slug,7,entry);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(good.db.read('meta','ai-job:'+slug).job.chat1.tests.default_generator_smoke.result,
   'PASS');
 assert.equal(good.db.keys('events').length,1);
});
test('S05 native arm accepts exact current READY but preserves dispatch marker semantics',async()=>{
 const x=await setup(active());
 const result=await x.store.armNative(slug,7,'CHAT1_REPAIR');
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(x.db.read('meta','ai-job:'+slug).job.native.state,'DISPATCH_POSSIBLE');
 assert.equal(x.db.keys('events').length,1);
});
