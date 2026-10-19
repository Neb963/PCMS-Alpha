import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {evaluation} from '../src/runtime/ai-evidence.mjs';
import {createS06ExceptionStore,assessS06Exception}
  from '../src/runtime/s06-exception-review.mjs';
import {s06ReviewStatus} from '../src/runtime/s06-review-queue.mjs';
const S='s06-exception-scope',H='a'.repeat(64),I='rev-a',
  SESSION='b'.repeat(64);
const b64=s=>Buffer.from(s).toString('base64');
const makeSource=()=>exactSource([
 {path:'main.pjs',base64:b64('output = 123')},
 {path:'index.html',base64:b64('<main>123</main>')}
]);
async function fixture({optional=true,infrastructure=false,failed=false,verified=false}={}){
 const F=await makeSource();
 const ready={slug:S,revision:1,active:{identifier:I,inputFingerprint:H},
   desired:null,hold:null};
 const stage={slug:S,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,
   readyIdentifier:I,readyInputFingerprint:H,candidate:F,previous:F};
 const job={slug:S,revision:7,stageRevision:4,sourceFingerprint:F.fingerprint,
   verifiedFinal:null,finalSource:F,readyIdentifier:I,readyInputFingerprint:H,
   executionSlotReleased:true,native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:SESSION},
   prompt:{revision:2,tests:['smoke'],text:'Test actual source.'},
   optionalTesting:optional?{sha256:H,tests:['optional'],text:'Test optional'}:null,
   chat1:{state:'RUNNING',sessionDigest:SESSION,tests:{
      smoke:{result:failed?'FAIL':'PASS',sourceFingerprint:F.fingerprint}}},
   chat2:optional?{state:'PENDING',sessionDigest:null,tests:{}}:null,
   hold:infrastructure?'AI_TEST_INFRASTRUCTURE_UNAVAILABLE':
     'AI_CHAT2_ISOLATION_UNVERIFIED',state:'TESTS_UNVERIFIED'};
 if(verified){job.optionalTesting=null;job.chat2=null;
   job.state='TESTS_VERIFIED';job.verifiedFinal=F.fingerprint;}
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  const m=t.objectStore('meta');
  m.put({key:'s05-ready:'+S,record:ready});
  m.put({key:'stage:'+S,record:stage});
  m.put({key:'ai-job:'+S,accountId:'account',job});
 });
 return {db,store:createS06ExceptionStore(db),ready,stage,job,F};
}
const request=(x,mode,checks=[])=>x.store.record({
 name:S,mode,checks,consent:'I PERFORMED THE RECORDED MANUAL CHECKS',
 expectedStageRevision:4,expectedJobRevision:7,
 sourceFingerprint:x.F.fingerprint
});
test('C-49 verified Chat1 with optional Chat2 unavailable is exceptional, never AI PASS',async()=>{
 const x=await fixture(),status=evaluation(x.job);
 assert.equal(status.chat1Pass,true);
 assert.equal(status.chat2Pass,false);
 assert.equal(status.state,'TESTS_UNVERIFIED');
 const receipt=await request(x,'OPTIONAL_CHAT2_INCOMPLETE');
 assert.equal(receipt.state,'RECORDED',JSON.stringify(receipt));
 assert.equal(receipt.chat1Verified,true);
 assert.equal(receipt.chat2Verified,false);
 assert.equal(x.db.read('meta','ai-job:'+S).job.verifiedFinal,null);
 assert.equal(s06ReviewStatus({decision:{ok:false,code:'TESTS_UNVERIFIED'},
   exception:receipt,sourceFingerprint:x.F.fingerprint,stageRevision:4}).state,
   'EXCEPTION_HELD');
 assert.equal(x.db.keys('operations').length,0);
});
test('C-48 actual manual required check observations are recorded, not AI verified',async()=>{
 const x=await fixture({optional:false,infrastructure:true});
 const checks=[{name:'smoke',result:'PASS',
   observation:'I loaded the saved generator and observed the expected output.'}];
 const r=await request(x,'MANUAL_INFRASTRUCTURE',checks);
 assert.equal(r.state,'RECORDED',JSON.stringify(r));
 assert.match(r.evidenceMode,/NOT_AI_VERIFIED/);
 assert.equal(x.db.read('meta','ai-job:'+S).job.verifiedFinal,null);
 assert.equal(x.db.keys('operations').length,0);
});
test('C-47 known failing required tests cannot be overridden by manual or optional exceptional labels',async()=>{
 const x=await fixture({failed:true,infrastructure:true});
 for(const mode of ['MANUAL_INFRASTRUCTURE','OPTIONAL_CHAT2_INCOMPLETE']){
  const v=await request(x,mode,[{name:'smoke',result:'PASS',
    observation:'Manually asserted success although an actual test failed.'}]);
  assert.equal(v.code,'S06_EXCEPTION_KNOWN_FAILURE_BLOCKED');
  assert.equal(x.db.read('meta','s06-exception:'+S),undefined);
 }
});
test('C-48 no infrastructure evidence or incomplete manual tests never create a usable exceptional record',async()=>{
 const x=await fixture({optional:false});
 for(const checks of [[],[{name:'smoke',result:'PASS',
   observation:'Checked output manually.'}]]){
  assert.equal((await request(x,'MANUAL_INFRASTRUCTURE',checks)).ok,false);
 }
 const y=await fixture({optional:false,infrastructure:true});
 assert.equal((await request(y,'MANUAL_INFRASTRUCTURE',[])).code,
  'S06_MANUAL_CHECKS_INCOMPLETE');
 assert.equal((await request(y,'MANUAL_INFRASTRUCTURE',[{
  name:'unknown',result:'PASS',observation:'Did a different test manually.'}])).ok,false);
});
test('C-48/C-49 reject unpinned READY and stale revision, preserve recorded child across transaction failure',async()=>{
 const x=await fixture();
 const mismatch=await x.store.record({
  name:S,mode:'OPTIONAL_CHAT2_INCOMPLETE',checks:[],
  consent:'I PERFORMED THE RECORDED MANUAL CHECKS',
  expectedStageRevision:5,expectedJobRevision:7,
  sourceFingerprint:x.F.fingerprint});
 assert.equal(mismatch.code,'S06_EXCEPTION_CONTEXT_OR_EFFECT_CHANGED');
 x.db.failNextCommit();
 await assert.rejects(request(x,'OPTIONAL_CHAT2_INCOMPLETE'));
 assert.equal(x.db.read('meta','s06-exception:'+S),undefined);
 const r=await request(x,'OPTIONAL_CHAT2_INCOMPLETE');
 assert.equal(r.state,'RECORDED');
 assert.equal((await request(x,'OPTIONAL_CHAT2_INCOMPLETE')).code,
  'S06_EXCEPTION_ALREADY_RECORDED');
});
test('C-48/49 fully tested jobs must use normal verified Git route, not special exceptional route',async()=>{
 const x=await fixture({verified:true});
 assert.equal((await request(x,'OPTIONAL_CHAT2_INCOMPLETE')).code,
  'S06_EXCEPTION_NORMAL_VERIFIED_PATH_REQUIRED');
});
