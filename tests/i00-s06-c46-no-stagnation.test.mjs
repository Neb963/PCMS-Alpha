import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
const N='s06-no-subjective-stagnation',F='a'.repeat(64),SESSION='b'.repeat(64);
test('C-46 repeated same-source known required failures never turn into guessed stagnation',async()=>{
 const db=fakeDatabase();
 const job={schema:1,slug:N,revision:1,stageRevision:3,
  sourceFingerprint:F,verifiedFinal:null,state:'KNOWN_FAILURE',
  native:{state:'CHAT1_OBSERVED_IDLE',step:'CHAT1_REPAIR',sessionDigest:SESSION},
  executionSlotReleased:true,prompt:{revision:1,tests:['required_smoke'],
   text:'Continue independently tested repairs.'},
  chat1:{state:'RUNNING',sessionDigest:SESSION,tests:{
   required_smoke:{result:'FAIL',sourceFingerprint:F}}},
  chat2:null,changes:[],hold:'KNOWN_FAILURE_RETEST_REQUIRED'};
 const snapshot={ok:true,fingerprint:F,files:[
   {path:'index.html',size:1,sha256:F},
   {path:'main.pjs',size:1,sha256:F}
 ],blobs:[{path:'index.html',base64:'eA=='},
   {path:'main.pjs',base64:'eA=='}],totalBytes:2};
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'ai-job:'+N,accountId:'account',job});
 });
 const store=createAiStore(db);let revision=1;
 for(let n=0;n<8;n++){
  const done=await store.checkpointSource(N,revision,snapshot);
  assert.equal(done.state,'KNOWN_FAILURE',JSON.stringify(done));
  assert.equal(done.hold,'KNOWN_FAILURE_RETEST_REQUIRED');
  revision=done.revision;
 }
 const current=await store.getJobFull(N);
 assert.equal(current.job.state,'KNOWN_FAILURE');
 assert.equal(current.job.verifiedFinal,null);
 assert.equal(current.job.noProgressCount,undefined);
 assert.equal(db.keys('operations').length,0);
});
