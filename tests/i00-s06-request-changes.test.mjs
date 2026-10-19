import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createS06ChangeStore} from '../src/runtime/s06-request-changes.mjs';
import {planS06Writeback} from '../src/runtime/s06-writeback-progress.mjs';
globalThis.crypto??=webcrypto;
const name='s06-review-child',READY='rev-child-input-20261019',
  INPUT='b'.repeat(64),PRINCIPAL='c'.repeat(64),
  COMMIT='d'.repeat(40),BASE='e'.repeat(40),OP='writeback_'+'1'.repeat(32),
  ID='change_'+'2'.repeat(32),session='f'.repeat(64);
const b64=s=>Buffer.from(s).toString('base64');
const original=async()=>exactSource([{path:'main.pjs',base64:b64('initial')},
  {path:'index.html',base64:b64('<main>initial</main>')}]);
const finalSource=async()=>exactSource([{path:'main.pjs',base64:b64('tested F')},
  {path:'index.html',base64:b64('<main>tested F</main>')}]);
async function setup({releaseState='APPROVED',readyHold=null,wbState='CONFIRMED'}={}){
 const P=await original(),F=await finalSource(),db=fakeDatabase();
 const stage={slug:name,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,
   candidate:P,previous:P,nonce:'nonce-1234567890123456',
   accountId:'account-1',personaUid:'persona-1',bindingVersion:1,
   principalFingerprint:PRINCIPAL,remotePublicId:'provider-1',
   readyIdentifier:READY,readyInputFingerprint:INPUT,
   sourceHead:BASE,sourceFolder:'generators/'+name,
   gitFingerprint:INPUT,testingSha:null};
 const job={slug:name,revision:7,stageRevision:4,state:'TESTS_VERIFIED',
   verifiedFinal:F.fingerprint,sourceFingerprint:F.fingerprint,finalSource:F,
   readyIdentifier:READY,readyInputFingerprint:INPUT,
   executionSlotReleased:true,native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:session},
   prompt:{revision:2,text:'Test the exact saved source and correct issues.',
     tests:['default_generator_smoke'],source:'GIT_MAIN_CHAT1_PINNED'},
   chat1:{state:'RUNNING',sessionDigest:session,tests:{default_generator_smoke:{
     result:'PASS',sourceFingerprint:F.fingerprint}}},chat2:null,
   optionalTesting:null};
 const ready={slug:name,repositoryId:'111',revision:2,
   active:{identifier:READY,inputFingerprint:INPUT},desired:null,hold:readyHold};
 const wb={slug:name,mode:'S06',state:wbState,revision:3,
   operationId:OP,stageRevision:4,jobRevision:7,
   readyIdentifier:READY,readyInputFingerprint:INPUT,
   sealedSource:F,sourceFingerprint:F.fingerprint,
   commitSha:COMMIT,baseHead:BASE,expectedHead:BASE,
   testingSha:null,folder:'generators/'+name};
 const release=releaseState?{slug:name,state:releaseState,revision:2,
   releaseId:'release_'+'3'.repeat(32),
   approval:{sourceFingerprint:F.fingerprint}}:null;
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  const m=t.objectStore('meta');
  m.put({key:'s05-ready:'+name,record:ready});
  m.put({key:'stage:'+name,record:stage});
  m.put({key:'ai-job:'+name,job,accountId:'account-1'});
  m.put({key:'writeback:'+name,record:wb});
  if(release)m.put({key:'release:'+name,release});
 });
 const store=createS06ChangeStore(db);
 const request=()=>store.request({name,stage,job,
   sourceFingerprint:F.fingerprint,
   instructions:'Change the greeting and keep the required tests.',
   expectedStageRevision:4,expectedJobRevision:7,
   releaseRevision:release?2:null,requestId:ID});
 return {db,store,request,stage,job,F,P,ready,wb,release};
}
test('S06 Request Changes revokes only unsent approval; no remote effect and preserves old F',async()=>{
 const x=await setup();const r=await x.request();
 assert.equal(r.state,'REQUESTED',JSON.stringify(r));
 assert.equal(x.db.read('meta','release:'+name).release.state,'CANCELED');
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
 assert.equal(x.db.read('meta','ai-job:'+name).job.state,'TESTS_VERIFIED');
 assert.equal(x.db.read('meta','s06-change:'+name).record.parentFingerprint,x.F.fingerprint);
 const again=await x.request();
 assert.equal(again.code,'S06_REQUEST_ALREADY_PENDING');
 assert.equal(x.db.keys('operations').length,0);
});
test('S06 Request Changes child retains P and parent tested F, creates new AI session and same READY token',async()=>{
 const x=await setup();const requested=await x.request();
 const started=await x.store.admit(name,requested.revision);
 assert.equal(started.state,'ADMITTED',JSON.stringify(started));
 const stage=x.db.read('meta','stage:'+name).record,
   job=x.db.read('meta','ai-job:'+name).job;
 assert.equal(stage.revision,5);
 assert.equal(stage.candidate.fingerprint,x.F.fingerprint);
 assert.equal(stage.previous.fingerprint,x.P.fingerprint);
 assert.equal(stage.sourceHead,COMMIT);
 assert.equal(stage.readyIdentifier,READY);
 assert.equal(job.revision,8);
 assert.equal(job.state,'PENDING_NATIVE_SESSION');
 assert.equal(job.sourceFingerprint,x.F.fingerprint);
 assert.equal(job.prompt.source,'S06_REQUEST_CHANGES_CHILD');
 assert.match(job.prompt.text,/Change the greeting/);
 assert.equal(job.prompt.tests[0],'default_generator_smoke');
 assert.equal(job.readyInputFingerprint,INPUT);
 assert.equal(x.db.read('meta','stage-history:'+name+':4').record.candidate.fingerprint,x.P.fingerprint);
 assert.equal(x.db.read('meta','ai-history:'+name+':7').job.finalSource.fingerprint,x.F.fingerprint);
 assert.equal(x.db.read('meta','writeback:'+name).record.state,'CONFIRMED');
 assert.equal(x.db.read('meta','s05-ready:'+name).record.active.identifier,READY);
 assert.equal((await x.store.admit(name,requested.revision)).code,'S06_REQUEST_STALE_OR_CONSUMED');
 assert.equal(planS06Writeback({ready:x.ready,stage,job,writeback:x.wb}).ok,false);
 assert.equal(x.db.keys('operations').length,0);
});
test('S06 child returns to Git PREPARE only after fresh independently tested F',async()=>{
 const x=await setup({releaseState:null});
 const requested=await x.request();
 assert.equal((await x.store.admit(name,requested.revision)).state,'ADMITTED');
 const childStage=x.db.read('meta','stage:'+name).record,
   childJob=x.db.read('meta','ai-job:'+name).job;
 assert.equal(planS06Writeback({ready:x.ready,stage:childStage,
   job:childJob,writeback:x.wb}).ok,false);
 const verifiedJob={...childJob,revision:childJob.revision+1,
   state:'TESTS_VERIFIED',executionSlotReleased:true,
   finalSource:x.F,sourceFingerprint:x.F.fingerprint,verifiedFinal:x.F.fingerprint,
   native:{step:'CHAT1_SEND',state:'CHAT1_OBSERVED_IDLE',sessionDigest:session},
   chat1:{state:'RUNNING',sessionDigest:session,tests:{default_generator_smoke:{
     result:'PASS',sourceFingerprint:x.F.fingerprint}}},
   chat2:null};
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'ai-job:'+name,job:verifiedJob,accountId:'account-1'});
 });
 const next=planS06Writeback({ready:x.ready,stage:childStage,
   job:verifiedJob,writeback:x.wb});
 assert.equal(next.type,'PREPARE',JSON.stringify(next));
 assert.equal(next.sourceFingerprint,x.F.fingerprint);
 assert.equal(x.db.read('meta','s05-ready:'+name).record.active.identifier,READY);
 assert.equal(x.db.read('meta','release:'+name),undefined);
});
test('S06 newer READY supersession prevents request admission and preserves old stage',async()=>{
 const x=await setup({releaseState:null});const requested=await x.request();
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'s05-ready:'+name,record:{...x.ready,
    revision:3,desired:{identifier:'rev-later',inputFingerprint:'a'.repeat(64)}}});
 });
 assert.equal((await x.store.admit(name,requested.revision)).code,
   'S06_REQUEST_SOURCE_OR_OWNERSHIP_CHANGED');
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
 assert.equal(x.db.keys('operations').length,0);
});
test('S06 attempted or ambiguous publication and Git writes reject Request Changes',async()=>{
 for(const c of [{releaseState:'DISPATCH_POSSIBLE'},
    {releaseState:'PUBLICATION_UNCERTAIN'},
    {releaseState:null,wbState:'HELD_UNCERTAIN'},
    {releaseState:null,readyHold:'READY_REVOKED_NOT_READY'}]){
  const x=await setup(c);const r=await x.request();
  assert.equal(r.ok,false,JSON.stringify(c));
  assert.equal(x.db.read('meta','s06-change:'+name),undefined);
 }
});
test('S06 stale child cannot override operator-paused ledger and cannot skip parent revision',async()=>{
 const x=await setup({releaseState:null});
 const r=await x.request();assert.equal(r.ok,true);
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'ai-job:'+name,accountId:'account-1',
    job:{...x.job,revision:8}});
 });
 assert.equal((await x.store.admit(name,r.revision)).ok,false);
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
});

test('S06 interrupted Request Changes transaction neither revokes approval nor records intent',async()=>{
 const x=await setup();x.db.failNextCommit();
 await assert.rejects(x.request());
 assert.equal(x.db.read('meta','release:'+name).release.state,'APPROVED');
 assert.equal(x.db.read('meta','s06-change:'+name),undefined);
 assert.equal(x.db.read('meta','ai-job:'+name).job.revision,7);
});
test('S06 interrupted child admission retains all parent lineage atomically',async()=>{
 const x=await setup({releaseState:null});
 const req=await x.request();assert.equal(req.ok,true);
 x.db.failNextCommit();
 await assert.rejects(x.store.admit(name,req.revision));
 assert.equal(x.db.read('meta','s06-change:'+name).record.state,'REQUESTED');
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
 assert.equal(x.db.read('meta','ai-job:'+name).job.revision,7);
 assert.equal(x.db.read('meta','stage-history:'+name+':4'),undefined);
 assert.equal(x.db.read('meta','ai-history:'+name+':7'),undefined);
});

test('S06 Request Changes cannot bypass an existing human-editor hold',async()=>{
 const x=await setup({releaseState:null});
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'s06-human:'+name,
   record:{slug:name,state:'DEFERRED',revision:1,parentStageRevision:4}});
 });
 const result=await x.request();
 assert.equal(result.code,'S06_HUMAN_REVIEW_DEFERRED');
 assert.equal(x.db.read('meta','s06-change:'+name),undefined);
 assert.equal(x.db.keys('operations').length,0);
});
