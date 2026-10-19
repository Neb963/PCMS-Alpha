import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createS06ExceptionStore} from '../src/runtime/s06-exception-review.mjs';
import {createWritebackStore} from '../src/runtime/writeback-store.mjs';
import {planS06Writeback} from '../src/runtime/s06-writeback-progress.mjs';
import {releaseCandidateTestContext,approvalTuple} from '../src/runtime/release-core.mjs';
import {createReleaseStore} from '../src/runtime/release-store.mjs';
globalThis.crypto??=webcrypto;
const N='s06-exception-transaction',INPUT='a'.repeat(64),
  PRINCIPAL='b'.repeat(64),SESSION='c'.repeat(64),
  BASE='d'.repeat(40),HEAD='e'.repeat(40),COMMIT='f'.repeat(40);
const b64=s=>Buffer.from(s).toString('base64');
async function source(x){return exactSource([
 {path:'main.pjs',base64:b64(x)},
 {path:'index.html',base64:b64('<main>'+x+'</main>')}]);}
async function setup({knownFailure=false,manual=false}={}){
 const P=await source(''),F=await source('exception source');
 const stage={slug:N,accountId:'acct',personaUid:'person',
  bindingVersion:1,accountRevision:1,principalFingerprint:PRINCIPAL,
  remotePublicId:'remote-1',revision:4,state:'SOURCE_VERIFIED',
  verifiedAt:1,nonce:'stage-nonce-1',sourceFolder:'generators/'+N,
  sourceHead:BASE,testingSha:manual?null:INPUT,
  previous:P,candidate:F,readyIdentifier:'rev-fixture',
  readyInputFingerprint:INPUT};
 const job={schema:1,slug:N,revision:7,stageRevision:4,
  sourceFingerprint:F.fingerprint,verifiedFinal:null,finalSource:F,
  readyIdentifier:'rev-fixture',readyInputFingerprint:INPUT,
  sourceFolder:'generators/'+N,state:'TESTS_UNVERIFIED',executionSlotReleased:true,
  native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:SESSION},
  prompt:{revision:1,text:'Test actual source.',tests:['smoke']},
  optionalTesting:manual?null:{sha256:INPUT,text:'Optional checks',tests:['optional']},
  chat1:{state:'RUNNING',sessionDigest:SESSION,tests:manual?{}:{
   smoke:{result:knownFailure?'FAIL':'PASS',sourceFingerprint:F.fingerprint}}},
  chat2:manual?null:{state:'PENDING',sessionDigest:null,tests:{}},
  hold:manual?'AI_TEST_INFRASTRUCTURE_UNAVAILABLE':
   'AI_CHAT2_ISOLATION_UNVERIFIED',changes:[]};
 const ready={slug:N,repositoryId:'111',revision:2,
  active:{identifier:'rev-fixture',inputFingerprint:INPUT},desired:null,hold:null};
 const account={accountId:'acct',personaUid:'person',bindingVersion:1,revision:1,
  state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',
    bindingVersion:1,principalFingerprint:PRINCIPAL}};
 const inventory={slug:N,accountId:'acct',personaUid:'person',
  bindingVersion:1,remoteId:'remote-1',ownerState:'OBSERVED_OWNER',
  visibility:'UNLISTED',revision:1};
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  const m=t.objectStore('meta');
  m.put({key:'s05-ready:'+N,record:ready});
  m.put({key:'stage:'+N,record:stage});
  m.put({key:'ai-job:'+N,accountId:'acct',job});
  m.put({key:'account:acct',account});
  m.put({key:'inventory:'+N,generator:inventory});
 });
 const store=createS06ExceptionStore(db);
 const checks=manual?[{name:'smoke',result:'PASS',
   observation:'Opened the actual saved source and confirmed test output.'}]:[];
 const mode=manual?'MANUAL_INFRASTRUCTURE':'OPTIONAL_CHAT2_INCOMPLETE';
 const recorded=await store.record({name:N,mode,checks,
  consent:'I PERFORMED THE RECORDED MANUAL CHECKS',
  expectedStageRevision:4,expectedJobRevision:7,sourceFingerprint:F.fingerprint});
 return {P,F,ready,stage,job,account,inventory,db,mode,recorded};
}
test('C-49 exception prepares source-only Git intent with explicit provenance, not verified AI status',async()=>{
 const x=await setup();
 assert.equal(x.recorded.state,'RECORDED',JSON.stringify(x.recorded));
 const plan=planS06Writeback({ready:x.ready,stage:x.stage,job:x.job,
   exception:x.db.read('meta','s06-exception:'+N).record});
 assert.equal(plan.type,'PREPARE',JSON.stringify(plan));
 assert.equal(plan.mode,'S06_EXCEPTION');
 assert.equal(plan.sourceFingerprint,x.F.fingerprint);
 assert.equal(x.job.verifiedFinal,null);
 const store=createWritebackStore(x.db);
 const first=await store.prepare({name:N,stage:x.stage,job:x.job,
   probe:{ok:true,head:HEAD,baseHead:BASE,folder:'generators/'+N},
   mode:'S06_EXCEPTION',message:'PCMS exceptional '+N+' candidate',
   operationId:'writeback_'+'1'.repeat(32)});
 assert.equal(first.state,'PREPARED',JSON.stringify(first));
 const sealed=await store.getFull(N);
 assert.equal(sealed.record.mode,'S06_EXCEPTION');
 assert.equal(sealed.record.exceptionRevision,x.recorded.revision);
 assert.equal(sealed.record.sealedSource.fingerprint,x.F.fingerprint);
 assert.equal(sealed.record.testingSha,x.stage.testingSha);
 assert.equal(x.db.read('meta','ai-job:'+N).job.verifiedFinal,null);
 assert.equal(x.db.keys('operations').length,0);
 const armed=await store.arm(N,first.revision);
 assert.equal(armed.state,'DISPATCH_POSSIBLE',JSON.stringify(armed));
 assert.equal((await store.arm(N,first.revision)).ok,false);
});
test('C-48 operator-observed manual test labels also require original source CAS and distinct Git mode',async()=>{
 const x=await setup({manual:true});
 assert.equal(x.recorded.state,'RECORDED',JSON.stringify(x.recorded));
 const decision=planS06Writeback({ready:x.ready,stage:x.stage,job:x.job,
  exception:x.db.read('meta','s06-exception:'+N).record});
 assert.equal(decision.mode,'S06_EXCEPTION',JSON.stringify(decision));
});
test('C-47 independent known FAIL cannot mint exceptional Git intent',async()=>{
 const x=await setup({knownFailure:true});
 assert.equal(x.recorded.code,'S06_EXCEPTION_KNOWN_FAILURE_BLOCKED');
 assert.equal(planS06Writeback({ready:x.ready,stage:x.stage,job:x.job}).ok,false);
 const store=createWritebackStore(x.db);
 assert.equal((await store.prepare({name:N,stage:x.stage,job:x.job,
  probe:{head:HEAD,baseHead:BASE,folder:'generators/'+N},
  mode:'S06_EXCEPTION',message:'PCMS exceptional '+N+' candidate',
  operationId:'writeback_'+'1'.repeat(32)})).ok,false);
 assert.equal(x.db.read('meta','writeback:'+N),undefined);
});
test('C-49 source-bound manual approval cannot bypass independent Git CONFIRMED receipt',async()=>{
 const x=await setup();assert.equal(x.recorded.state,'RECORDED');
 const exception=x.db.read('meta','s06-exception:'+N).record;
 const testContext=releaseCandidateTestContext(x.stage,x.job,{
   ready:x.ready,exception});
 assert.equal(testContext.mode,'EXCEPTION_MANUAL_REVIEW',JSON.stringify(testContext));
 const candidate=approvalTuple({slug:N,stage:x.stage,job:x.job,
   source:x.F,git:{ok:true,testingSha:x.stage.testingSha},
   kind:'PRIVATE_NEW',previous:x.P,testContext});
 assert.equal(candidate.ok,true,JSON.stringify(candidate));
 assert.equal(candidate.tuple.aiVerified,false);
 const release=createReleaseStore(x.db),params={approval:candidate,
   stage:x.stage,job:x.job,account:x.account,inventory:x.inventory,
   source:x.F,previous:x.P,kind:'PRIVATE_NEW',
   releaseId:'release_'+'2'.repeat(32)};
 assert.equal((await release.approve(params)).ok,false,
   'No Git-confirmed source may be approved from manual evidence alone');
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'writeback:'+N,record:{
   slug:N,state:'CONFIRMED',revision:3,mode:'S06_EXCEPTION',
   exceptionRevision:x.recorded.revision,exceptionMode:x.mode,
   stageRevision:4,jobRevision:7,commitSha:COMMIT,
   sourceFingerprint:x.F.fingerprint,testingSha:x.stage.testingSha,
   readyIdentifier:'rev-fixture',readyInputFingerprint:INPUT}});
 });
 const approved=await release.approve(params);
 assert.equal(approved.state,'APPROVED',JSON.stringify(approved));
 assert.equal(approved.publication,'HELD_OR_UNVERIFIED');
 assert.equal(x.db.read('meta','ai-job:'+N).job.verifiedFinal,null);
 const intent=await release.markDispatch(N,approved.revision,candidate.tuple);
 assert.equal(intent.state,'DISPATCH_POSSIBLE',JSON.stringify(intent));
 assert.equal(x.db.keys('operations').length,1);
 assert.equal((await release.markDispatch(N,approved.revision,candidate.tuple)).ok,false);
});
test('C-49 late exception revision change revokes manual approval publication CAS',async()=>{
 const x=await setup(),exception=x.db.read('meta','s06-exception:'+N).record;
 const proof=releaseCandidateTestContext(x.stage,x.job,{ready:x.ready,exception});
 assert.equal(proof.ok,true);
 await new Promise((resolve,reject)=>{
  const t=x.db.transaction('meta','readwrite');t.oncomplete=resolve;t.onabort=reject;
  t.objectStore('meta').put({key:'writeback:'+N,record:{
   slug:N,state:'CONFIRMED',revision:3,mode:'S06_EXCEPTION',
   exceptionRevision:exception.revision,stageRevision:4,jobRevision:7,
   commitSha:COMMIT,sourceFingerprint:x.F.fingerprint,
   testingSha:x.stage.testingSha,readyIdentifier:'rev-fixture',
   readyInputFingerprint:INPUT}});
  t.objectStore('meta').put({key:'s06-exception:'+N,record:{
   ...exception,revision:exception.revision+1}});
 });
 const tuple=approvalTuple({slug:N,stage:x.stage,job:x.job,
  source:x.F,previous:x.P,git:{ok:true,testingSha:x.stage.testingSha},
  kind:'PRIVATE_NEW',testContext:proof});
 const result=await createReleaseStore(x.db).approve({approval:tuple,stage:x.stage,
  job:x.job,account:x.account,inventory:x.inventory,source:x.F,previous:x.P,
  kind:'PRIVATE_NEW',releaseId:'release_'+'4'.repeat(32)});
 assert.equal(result.ok,false,JSON.stringify(result));
 assert.equal(x.db.read('meta','release:'+N),undefined);
});
