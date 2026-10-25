import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
import {createS06ExceptionBoundary,createS06ExceptionStore,authorizeS06Exception} from '../src/runtime/s06-exception-review.mjs';
import {planAiStep} from '../src/runtime/ai-supervisor.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
const slug='exception-idle',F='a'.repeat(64),session='b'.repeat(64),nonce='c'.repeat(32);
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
async function fixture(mode,adverse=''){
 const db=fakeDatabase(),source=await exactSource([{path:'main.pjs',base64:btoa('output = 1')},{path:'index.html',base64:btoa('<p>source</p>')}]);
 const stage={slug,revision:3,state:'SOURCE_VERIFIED',verifiedAt:1,nonce,personaUid:'persona-1',accountId:'account',principalFingerprint:F,remotePublicId:'remote',candidate:source,previous:source,readyIdentifier:'ready',readyInputFingerprint:F};
 const job={schema:1,slug,revision:5,stageRevision:3,state:'TESTS_UNVERIFIED',sourceFingerprint:source.fingerprint,finalSource:source,verifiedFinal:null,executionSlotReleased:false,readyIdentifier:'ready',readyInputFingerprint:F,
  native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:session},prompt:{revision:1,tests:['smoke'],text:'Pinned tests'},chat1:{sessionDigest:session,tests:mode==='OPTIONAL_CHAT2_INCOMPLETE'?{smoke:{result:'PASS',sourceFingerprint:source.fingerprint}}:{}},
  optionalTesting:mode==='OPTIONAL_CHAT2_INCOMPLETE'?{sha256:F,text:'Optional test',tests:['optional']}:null,chat2:mode==='OPTIONAL_CHAT2_INCOMPLETE'?{state:'PENDING',tests:{},sessionDigest:null}:null,hold:'AI_TEST_INFRASTRUCTURE_UNAVAILABLE'};
 if(adverse==='known-failure')job.chat1.tests.smoke={result:'FAIL',sourceFingerprint:source.fingerprint};
 const ready={slug,revision:1,active:{identifier:'ready',inputFingerprint:F},desired:null,hold:null};
 await put(db,{key:'stage:'+slug,record:stage},{key:'ai-job:'+slug,accountId:'account',job},{key:'s05-ready:'+slug,record:ready});
 const effects=[],api={storage:{local:{get:async()=>({})}}};let observations=0;
 const guard=()=>({getSafeRouteReadiness:async()=>({ready:true,routeId:'route',cookieStoreId:'container'}),inspectStageEditor:async()=>({ok:true,clean:adverse!=='dirty'}),
  runNativeAiStep:async(_,r)=>{assert.equal(r.action,'OBSERVE');observations++;return {ok:true,busy:adverse==='busy',sessionDigest:adverse==='session'?F:session,sourceSaved:true,editorClean:true,hasQueue:false,inputOccupied:false,attachmentsPending:false}},
  observeReadOnly:async()=>{if(adverse==='instruction')assert.equal((await createAiStore(db).operatorControl(slug,5,1,{instructions:'Keep this explicitly requested fix pending.'})).ok,true);if(adverse==='race')await put(db,{key:'ai-job:'+slug,accountId:'account',job:{...job,revision:6}});
   return {ok:true,principalFingerprint:F,original:{remotePublicId:'remote',ownerResult:'IS_OWNER',visibility:'UNLISTED',pjs:adverse==='source'?'changed':'output = 1',html:'<p>source</p>',assets:[]}};}});
 const params={slug,mode,checks:mode==='MANUAL_INFRASTRUCTURE'?[{name:'smoke',result:'PASS',observation:'I loaded the saved source and checked the expected rendered output.'}]:[],consent:'I PERFORMED THE RECORDED MANUAL CHECKS',expectedStageRevision:3,expectedJobRevision:5,sourceFingerprint:source.fingerprint};
 return {db,source,stage,job,ready,effects,params,boundary:createS06ExceptionBoundary(api,{open:async()=>db,guard}),observations:()=>observations};
}
test('J04 explicit exceptional review freezes only independently settled exact saved source without inventing test PASS',async()=>{
 for(const mode of ['MANUAL_INFRASTRUCTURE','OPTIONAL_CHAT2_INCOMPLETE']){const f=await fixture(mode);
  const r=await f.boundary.runTrusted({type:'RECORD_EXCEPTION',params:f.params});assert.equal(r.ok,true,JSON.stringify(r));
  const job=f.db.read('meta','ai-job:'+slug).job;assert.equal(job.revision,6);assert.equal(job.executionSlotReleased,true);assert.equal(job.verifiedFinal,null);
  assert.equal(job.state,'TESTS_UNVERIFIED');assert.equal(planAiStep(job).code,'AI_EXCEPTION_REVIEW_FROZEN');
  assert.equal(authorizeS06Exception({ready:f.ready,stage:f.stage,job,record:f.db.read('meta','s06-exception:'+slug).record}).ok,true);
  assert.equal(f.observations(),2);assert.equal(f.db.keys('operations').length,0);
  const store=createAiStore(f.db),pause=await store.operatorControl(slug,job.revision,1,{paused:true});assert.equal(pause.ok,true);
  const resumed=await store.operatorControl(slug,job.revision,pause.controlRevision,{paused:false});assert.equal(resumed.ok,true);assert.equal(resumed.slotReleased,true);
  const current=(await store.getJobFull(slug)).job;assert.equal(current.revision,6);assert.equal(current.awaitingExecutionSlot,false);
  assert.equal(authorizeS06Exception({ready:f.ready,stage:f.stage,job:current,record:f.db.read('meta','s06-exception:'+slug).record}).ok,true);
  assert.equal((await store.operatorControl(slug,job.revision,resumed.controlRevision,{instructions:'Try new repairs'})).code,'AI_TESTED_CANDIDATE_REQUEST_CHANGES_REQUIRED');
  assert.equal((await store.checkpointSource(slug,job.revision,f.source)).revision,6,'readonly same-F probe cannot invalidate frozen exceptional evidence');
 }
});
test('J04 pending native work, dirty edits, session/source drift, stale CAS and known failures cannot freeze exceptional review',async()=>{
 for(const adverse of ['busy','dirty','session','source','race','instruction','known-failure']){const f=await fixture('MANUAL_INFRASTRUCTURE',adverse);
  const r=await f.boundary.runTrusted({type:'RECORD_EXCEPTION',params:f.params});assert.equal(r.ok,false,adverse+JSON.stringify(r));
  assert.equal(f.db.read('meta','ai-job:'+slug).job.executionSlotReleased,false);if(adverse==='instruction')assert.ok(f.db.read('meta','ai-job:'+slug).job.operatorInstruction);assert.equal(f.db.read('meta','s06-exception:'+slug),undefined);assert.equal(f.db.keys('operations').length,0);
 }
 const f=await fixture('MANUAL_INFRASTRUCTURE');const forged=await createS06ExceptionStore(f.db).record({name:slug,...f.params,idleProof:{ok:true}});
 assert.equal(forged.code,'S06_EXCEPTION_CANONICAL_SOURCE_UNVERIFIED');assert.equal(f.db.read('meta','ai-job:'+slug).job.executionSlotReleased,false);
});

test('J04 manual and optional incomplete candidates accept source-bound Request Changes as fresh untested children',async()=>{
 const {createS06ChangeStore}=await import('../src/runtime/s06-request-changes.mjs');
 for(const mode of ['MANUAL_INFRASTRUCTURE','OPTIONAL_CHAT2_INCOMPLETE']){
  const f=await fixture(mode),recorded=await f.boundary.runTrusted({type:'RECORD_EXCEPTION',params:f.params});assert.equal(recorded.ok,true);
  const job=f.db.read('meta','ai-job:'+slug).job,ex=f.db.read('meta','s06-exception:'+slug).record;
  await put(f.db,{key:'writeback:'+slug,record:{slug,operationId:'writeback_'+'1'.repeat(32),revision:1,state:'CONFIRMED',mode:'S06_EXCEPTION',exceptionRevision:ex.revision,stageRevision:3,jobRevision:job.revision,sourceFingerprint:job.sourceFingerprint,sealedSource:f.source,commitSha:'c'.repeat(40),readyIdentifier:'ready',readyInputFingerprint:F}});
  const store=createS06ChangeStore(f.db),r=await store.request({name:slug,stage:f.stage,job,sourceFingerprint:job.sourceFingerprint,instructions:'Revise this exceptional candidate.',expectedStageRevision:3,expectedJobRevision:job.revision,requestId:'change_'+'2'.repeat(32)});
  assert.equal(r.state,'REQUESTED',JSON.stringify(r));assert.equal((await store.admit(slug,r.revision)).state,'ADMITTED');
  const child=f.db.read('meta','ai-job:'+slug).job;assert.equal(child.verifiedFinal,null);assert.equal(child.exceptionFrozen,undefined);assert.equal(child.state,'PENDING_NATIVE_SESSION');assert.equal(child.operatorInstruction.text,'Revise this exceptional candidate.');
  assert.equal(authorizeS06Exception({ready:f.ready,stage:f.db.read('meta','stage:'+slug).record,job:child,record:ex}).ok,false);
 }
});

test('J04 exceptional final F updates only the existing comparison source and preserves immutable public P',async()=>{
 const {createExistingStore}=await import('../src/runtime/existing-update-store.mjs');
 for(const mode of ['MANUAL_INFRASTRUCTURE','OPTIONAL_CHAT2_INCOMPLETE']){
  const f=await fixture(mode);assert.equal((await f.boundary.runTrusted({type:'RECORD_EXCEPTION',params:f.params})).ok,true);
  const old={slug,revision:1,state:'STAGE_CONFIRMED',nonce,accountId:f.stage.accountId,previousFingerprint:'d'.repeat(64),recovery:{immutable:'previous-good'},stagedFingerprint:'e'.repeat(64)};
  await put(f.db,{key:'existing-update:'+slug,record:old});
  const store=createExistingStore(f.db),out=await store.setFinal(slug,1,f.source);assert.equal(out.ok,true,JSON.stringify(out));
  const saved=f.db.read('meta','existing-update:'+slug).record;assert.equal(saved.stagedFingerprint,f.source.fingerprint);assert.deepEqual(saved.recovery,old.recovery);assert.equal(saved.previousFingerprint,old.previousFingerprint);
  const job=f.db.read('meta','ai-job:'+slug).job;
  await put(f.db,{key:'ai-job:'+slug,accountId:f.stage.accountId,job:{...job,revision:job.revision+1}});
  assert.equal((await store.setFinal(slug,2,f.source)).code,'EXISTING_FINAL_TESTS_OR_STAGE_CHANGED');
  await put(f.db,{key:'ai-job:'+slug,accountId:f.stage.accountId,job:{...job,chat1:{...job.chat1,tests:{smoke:{result:'FAIL',sourceFingerprint:f.source.fingerprint}}}}});
  assert.equal((await store.setFinal(slug,2,f.source)).code,'EXISTING_FINAL_TESTS_OR_STAGE_CHANGED');
 }
});

test('J04 requested exceptional child and prepared successor retain historical Git attribution without inheriting parent test authority',async()=>{
 const {createS06ChangeStore}=await import('../src/runtime/s06-request-changes.mjs'),{resolveS06OutputProof}=await import('../src/runtime/s06-output-proof.mjs');
 const f=await fixture('MANUAL_INFRASTRUCTURE');assert.equal((await f.boundary.runTrusted({type:'RECORD_EXCEPTION',params:f.params})).ok,true);
 const j=f.db.read('meta','ai-job:'+slug).job,ex=f.db.read('meta','s06-exception:'+slug).record,commit='c'.repeat(40),operationId='writeback_'+'1'.repeat(32);
 const wb={slug,accountId:f.stage.accountId,personaUid:f.stage.personaUid,principalFingerprint:f.stage.principalFingerprint,remotePublicId:f.stage.remotePublicId,folder:'generators/'+slug,operationId,revision:1,state:'CONFIRMED',mode:'S06_EXCEPTION',exceptionRevision:ex.revision,stageRevision:3,jobRevision:j.revision,sourceFingerprint:j.sourceFingerprint,sealedSource:f.source,commitSha:commit,baseHead:'d'.repeat(40),expectedHead:'d'.repeat(40),readyIdentifier:'ready',readyInputFingerprint:F};
 await put(f.db,{key:'writeback:'+slug,record:wb});
 const store=createS06ChangeStore(f.db),req=await store.request({name:slug,stage:f.stage,job:j,sourceFingerprint:j.sourceFingerprint,instructions:'Continue from this exact saved exceptional source.',expectedStageRevision:3,expectedJobRevision:j.revision,requestId:'change_'+'3'.repeat(32)});assert.equal(req.ok,true,JSON.stringify(req));assert.equal((await store.admit(slug,req.revision)).ok,true);
 const stage=f.db.read('meta','stage:'+slug).record,job=f.db.read('meta','ai-job:'+slug).job,context={ready:f.ready,stage,job,writeback:wb,exception:ex};
 const proof=await resolveS06OutputProof(f.db,context);assert.equal(proof.ok,true,JSON.stringify(proof));assert.equal(proof.historical,true);assert.equal(proof.outputProof.commitSha,commit);assert.equal(authorizeS06Exception({ready:f.ready,stage,job,record:ex}).ok,false);
 await put(f.db,{key:'writeback-history:'+slug+':'+operationId,record:wb});
 assert.equal((await resolveS06OutputProof(f.db,{...context,writeback:{...wb,state:'PREPARED',operationId:'writeback_'+'2'.repeat(32),baseHead:commit}})).ok,true);
 assert.equal((await resolveS06OutputProof(f.db,{...context,ready:{...f.ready,desired:{identifier:'new',inputFingerprint:F}}})).ok,false);
 assert.equal((await resolveS06OutputProof(f.db,{...context,stage:{...stage,principalFingerprint:'e'.repeat(64)}})).ok,false);
 const parent=f.db.read('meta','ai-history:'+slug+':'+j.revision);parent.job.chat1.tests.smoke={result:'FAIL',sourceFingerprint:f.source.fingerprint};await put(f.db,parent);
 assert.equal((await resolveS06OutputProof(f.db,context)).ok,false,'a real failed parent test never becomes exceptional attribution');
});
