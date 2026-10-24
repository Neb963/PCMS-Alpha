import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createS06HumanStore,createS06HumanBoundary}
 from '../src/runtime/s06-human-review.mjs';
import {planS06Writeback} from '../src/runtime/s06-writeback-progress.mjs';
globalThis.crypto??=webcrypto;
const name='s06-human-editor',readyId='rev-current',input='b'.repeat(64),
 principal='c'.repeat(64),digest='d'.repeat(64),commit='e'.repeat(40);
const b64=s=>Buffer.from(s).toString('base64');
const source=(pjs,html)=>exactSource([
 {path:'main.pjs',base64:b64(pjs)},
 {path:'index.html',base64:b64(html)}]);
async function fixture({releaseState='APPROVED',readyHold=null,wbState='CONFIRMED'}={}){
 const P=await source('previous P','<main>previous</main>'),
 F=await source('tested F','<main>tested F</main>'),
 H=await source('human updated source','<main>human saved</main>');
 const stage={slug:name,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,
  accountId:'account-1',personaUid:'persona-1',nonce:'stage-nonce-1',
  bindingVersion:1,principalFingerprint:principal,remotePublicId:'remote-1',
  sourceFolder:'generators/'+name,sourceHead:'a'.repeat(40),
  readyIdentifier:readyId,readyInputFingerprint:input,
  gitFingerprint:input,testingSha:null,candidate:P,previous:P};
 const job={slug:name,revision:7,stageRevision:4,state:'TESTS_VERIFIED',
  sourceFingerprint:F.fingerprint,verifiedFinal:F.fingerprint,finalSource:F,
  readyIdentifier:readyId,readyInputFingerprint:input,
  executionSlotReleased:true,
  native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:digest},
  prompt:{revision:2,text:'Test source with independent checks.',
    tests:['default_generator_smoke'],source:'GIT_MAIN_CHAT1_PINNED'},
  optionalTesting:null,chat1:{state:'RUNNING',sessionDigest:digest,
    tests:{default_generator_smoke:{result:'PASS',sourceFingerprint:F.fingerprint}}},
  chat2:null};
 const ready={slug:name,revision:2,active:{
  identifier:readyId,inputFingerprint:input},desired:null,hold:readyHold};
 const wb={slug:name,revision:3,mode:'S06',state:wbState,stageRevision:4,
  jobRevision:7,sourceFingerprint:F.fingerprint,commitSha:commit,
  readyIdentifier:readyId,readyInputFingerprint:input,
  folder:'generators/'+name};
 const release=releaseState?{slug:name,revision:2,state:releaseState,
  releaseId:'release_'+'1'.repeat(32),
  approval:{sourceFingerprint:releaseState==='CONFIRMED_PUBLIC'?
    P.fingerprint:F.fingerprint}}:null;
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite');
  t.oncomplete=resolve;t.onabort=reject;
  const m=t.objectStore('meta');
  m.put({key:'s05-ready:'+name,record:ready});
  m.put({key:'stage:'+name,record:stage});
  m.put({key:'ai-job:'+name,job,accountId:stage.accountId});
  m.put({key:'writeback:'+name,record:wb});
  if(release)m.put({key:'release:'+name,release});
 });
 const store=createS06HumanStore(db);
 const defer=()=>store.defer({name,expectedStageRevision:4,
  expectedJobRevision:7,expectedFingerprint:F.fingerprint});
 return {db,store,defer,stage,job,wb,ready,release,F,P,H};
}
test('C-53 Defer cancels only unsent approval and never alters source or remote state',async()=>{
 const x=await fixture(),hold=await x.defer();
 assert.equal(hold.state,'DEFERRED',JSON.stringify(hold));
 assert.equal(x.db.read('meta','release:'+name).release.state,'CANCELED');
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
 assert.equal(x.db.read('meta','ai-job:'+name).job.verifiedFinal,x.F.fingerprint);
 assert.equal(x.db.read('meta','writeback:'+name).record.state,'CONFIRMED');
 assert.equal(x.db.keys('operations').length,0);
 assert.equal((await x.defer()).code,'S06_HUMAN_ALREADY_DEFERRED');
});
test('C-53 saved adoption makes a new untested child with P and tested F preserved',async()=>{
 const x=await fixture(),held=await x.defer();
 const out=await x.store.adopt({name,expectedRevision:held.revision,source:x.H});
 assert.equal(out.state,'ADOPTED_UNTESTED',JSON.stringify(out));
 const st=x.db.read('meta','stage:'+name).record,
  job=x.db.read('meta','ai-job:'+name).job;
 assert.equal(st.revision,5);
 assert.equal(st.candidate.fingerprint,x.H.fingerprint);
 assert.equal(st.previous.fingerprint,x.P.fingerprint);
 assert.equal(st.sourceHead,commit);
 assert.equal(job.state,'PENDING_NATIVE_SESSION');
 assert.equal(job.sourceFingerprint,x.H.fingerprint);
 assert.equal(job.verifiedFinal,null);
 assert.equal(job.prompt.tests[0],'default_generator_smoke');
 assert.equal(job.readyIdentifier,readyId);
 assert.equal(x.db.read('meta','stage-history:'+name+':4').record.revision,4);
 assert.equal(x.db.read('meta','ai-history:'+name+':7').job.finalSource.fingerprint,
   x.F.fingerprint);
 assert.equal(planS06Writeback({ready:x.ready,stage:st,job,writeback:x.wb}).ok,false);
 assert.equal(x.db.keys('operations').length,0);
 assert.equal((await x.store.adopt({name,expectedRevision:held.revision,source:x.H})).ok,false);
});
test('C-53 stale/ambiguous attempts cannot erase human work or alter approval',async()=>{
 for(const c of [{readyHold:'OPERATOR_PAUSED'},
    {releaseState:'DISPATCH_POSSIBLE'},
    {releaseState:'PUBLICATION_UNCERTAIN'},
    {wbState:'HELD_UNCERTAIN'}]){
  const x=await fixture(c);
  assert.equal((await x.defer()).ok,false,JSON.stringify(c));
  assert.equal(x.db.read('meta','s06-human:'+name),undefined);
 }
 const x=await fixture();
 const held=await x.defer();
 assert.equal((await x.store.adopt({name,expectedRevision:held.revision,
   source:x.F})).code,'S06_HUMAN_SAVED_SOURCE_OR_RELEASE_CHANGED');
 assert.equal((await x.store.adopt({name,expectedRevision:held.revision,
   source:{...x.H,blobs:x.F.blobs}})).code,'S06_HUMAN_SOURCE_PROOF_INVALID');
 assert.equal((await x.store.adopt({name,expectedRevision:held.revision,
   source:{...x.H,files:x.F.files}})).code,'S06_HUMAN_SOURCE_PROOF_INVALID');
 const d=x.db.read('meta','s06-human:'+name).record;
 assert.equal(d.state,'DEFERRED');
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
});
test('C-53 interrupted Defer and Adopt transactions do not leave partial revisions',async()=>{
 const x=await fixture();
 x.db.failNextCommit();
 await assert.rejects(x.defer());
 assert.equal(x.db.read('meta','s06-human:'+name),undefined);
 assert.equal(x.db.read('meta','release:'+name).release.state,'APPROVED');
 const held=await x.defer();
 x.db.failNextCommit();
 await assert.rejects(x.store.adopt({name,expectedRevision:held.revision,source:x.H}));
 assert.equal(x.db.read('meta','s06-human:'+name).record.state,'DEFERRED');
 assert.equal(x.db.read('meta','stage:'+name).record.revision,4);
 assert.equal(x.db.read('meta','ai-job:'+name).job.revision,7);
});
test('C-53 boundary adopts only stable guarded saved source, never unsaved draft',async()=>{
 const x=await fixture({releaseState:null}),held=await x.defer();
 const settings={};
 const api={storage:{local:{get:async key=>({[key]:settings[key]})}}};
 let dirty=false,changed=false,observations=0,raceSecondSave=false;
 const native=()=>({ok:true,busy:false,editorClean:!dirty,sourceSaved:!dirty,
  sessionDigest:digest,hasQueue:false,inputOccupied:false,
  attachmentsPending:false});
 const guard={
  getSafeRouteReadiness:async()=>({ready:true,routeId:'route-1',cookieStoreId:'ctx-1'}),
  inspectStageEditor:async()=>({ok:true,clean:!dirty}),
  inspectHumanReview:async()=>({ok:!dirty,clean:!dirty,noEditors:false,sessionDigest:digest}),
  reclaimHumanReview:async()=>({ok:true}),
  runNativeAiStep:async()=>native(),
  observeReadOnly:async()=>{
   observations++;
   return {ok:true,principalFingerprint:principal,original:{
    remotePublicId:'remote-1',ownerResult:'IS_OWNER',visibility:'UNLISTED',
    pjs:changed||(raceSecondSave&&observations%2===1)?
      'tested F':'human updated source',
    html:changed||(raceSecondSave&&observations%2===1)?
      '<main>tested F</main>':'<main>human saved</main>',
    assets:[]}};
  }
 };
 const b=createS06HumanBoundary(api,{open:async()=>x.db,guard:()=>guard});
 dirty=true;
 assert.equal((await b.runTrusted({type:'ADOPT_HUMAN',
  params:{slug:name,expectedRevision:held.revision}})).code,
  'S06_HUMAN_UNSAVED_OR_ACTIVE_EDITOR_DEFERRED');
 assert.equal(observations,0);
 dirty=false;changed=true;
 assert.equal((await b.runTrusted({type:'ADOPT_HUMAN',
  params:{slug:name,expectedRevision:held.revision}})).code,
  'S06_HUMAN_NO_CHANGED_SAVED_SOURCE');
 changed=false;
 raceSecondSave=true;
 assert.equal((await b.runTrusted({type:'ADOPT_HUMAN',
  params:{slug:name,expectedRevision:held.revision}})).code,
  'S06_HUMAN_SAVED_SOURCE_CHANGED_DURING_ADOPTION');
 assert.equal(x.db.read('meta','s06-human:'+name).record.state,'DEFERRED');
 raceSecondSave=false;
 const adopted=await b.runTrusted({type:'ADOPT_HUMAN',
  params:{slug:name,expectedRevision:held.revision}});
 assert.equal(adopted.state,'ADOPTED_UNTESTED',JSON.stringify(adopted));
 assert.equal(x.db.read('meta','stage:'+name).record.candidate.fingerprint,x.H.fingerprint);
});

test('C-53 pending Request Changes and human Defer cannot seize the same candidate',async()=>{
 const x=await fixture();
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'s06-change:'+name,
    record:{slug:name,state:'REQUESTED',revision:1,parentStageRevision:4}});
 });
 assert.equal((await x.defer()).code,'S06_PENDING_REQUEST_CHANGES');
 assert.equal(x.db.read('meta','s06-human:'+name),undefined);
 assert.equal(x.db.read('meta','release:'+name).release.state,'APPROVED');
});

test('C-53 existing public P receipt remains immutable when newer unlisted human update is deferred and adopted',async()=>{
 const x=await fixture({releaseState:'CONFIRMED_PUBLIC'});
 const confirmed=x.db.read('meta','release:'+name).release;
 assert.equal(confirmed.approval.sourceFingerprint,x.P.fingerprint);
 const held=await x.defer();
 assert.equal(held.state,'DEFERRED',JSON.stringify(held));
 assert.deepEqual(x.db.read('meta','release:'+name).release,confirmed,
   'No historical public approval may be revoked to create the new child');
 const adopted=await x.store.adopt({name,expectedRevision:held.revision,source:x.H});
 assert.equal(adopted.state,'ADOPTED_UNTESTED',JSON.stringify(adopted));
 assert.deepEqual(x.db.read('meta','release:'+name).release,confirmed);
 assert.equal(x.db.read('meta','stage:'+name).record.previous.fingerprint,x.P.fingerprint);
});
test('C-53 unrelated public receipt cannot authorize adoption of another prior-good source',async()=>{
 const x=await fixture({releaseState:'CONFIRMED_PUBLIC'});
 const old=x.db.read('meta','release:'+name).release;
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'release:'+name,release:{
   ...old,approval:{...old.approval,sourceFingerprint:x.F.fingerprint}}});
 });
 assert.equal((await x.defer()).code,'S06_HUMAN_CONTEXT_CHANGED');
 assert.equal(x.db.read('meta','s06-human:'+name),undefined);
});
