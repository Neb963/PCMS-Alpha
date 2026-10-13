import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';

// Independent fake external editor, separate from canonical DB. The second
// OBSERVE deliberately races saved-byte readback, so no test can pass merely
// by seeing an earlier idle snapshot or a claimed saved-source fingerprint.
const slug='source-fence-fixture',sid='1'.repeat(64),nonce='f'.repeat(32);
const route={ready:true,cookieStoreId:'firefox-container',routeId:'protected-wg'};
const stage={slug,nonce,revision:3,state:'SOURCE_VERIFIED',personaUid:'p1',
  principalFingerprint:'owner-fingerprint',remotePublicId:'remote-id'};
const job={slug,revision:5,stageRevision:3,state:'TESTS_UNVERIFIED',
  native:{step:'CHAT1_SEND',state:'CHAT1_OBSERVED_IDLE',sessionDigest:sid},
  chat1:{sessionDigest:sid,tests:{}},prompt:{tests:['default_generator_smoke']},
  sourceFingerprint:'a'.repeat(64)};
const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>({})}}};
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html#work-queue'};
const observed=()=>({ok:true,slug,sessionDigest:sid,busy:false,
  sourceSaved:true,editorClean:true,inputOccupied:false,attachmentsPending:false,
  hasQueue:false});
function harness({second={},stageChange=false}={}){
  const callbacks=[],saveCalls=[];
  let observedCount=0,stageReads=0;
  const saved={snapshot:null};
  const guard=()=>({
    getSafeRouteReadiness:async()=>({...route}),
    runNativeAiStep:async(_persona,req)=>{
      assert.equal(req.action,'OBSERVE');
      callbacks.push(req.action);
      observedCount++;
      return observedCount===2?{...observed(),...second}:observed();
    },
    observeReadOnly:async()=>({ok:true,principalFingerprint:stage.principalFingerprint,
      original:{remotePublicId:stage.remotePublicId,ownerResult:'IS_OWNER',
        visibility:'UNLISTED',pjs:'output = 1',html:'<h1>ready</h1>',assets:[]}}),
    inspectStageEditor:async()=>({ok:true,clean:true})
  });
  const store={
    getJobFull:async()=>({ok:true,job}),
    checkpointSource:async(...args)=>{
      saveCalls.push(args);return {ok:true,revision:6,state:'TESTS_UNVERIFIED'};
    }
  };
  const service=createAiBoundary(api,{
    open:async()=>({}),guard,storeFactory:()=>store,
    stageFactory:()=>({getFull:async()=>{
      stageReads++;
      return {ok:true,record:stageReads>=2&&stageChange?
        {...stage,revision:4}:stage};
    }})
  });
  return {run:()=>service.run({type:'PROBE_NATIVE',params:{
    slug,expectedRevision:job.revision}},sender),
    saveCalls,callbacks};
}
test('P52-06 X changed native activity during full saved-source readback cannot checkpoint F',async()=>{
  for(const second of [{busy:true},{sessionDigest:'2'.repeat(64)},
    {editorClean:false},{sourceSaved:false},{inputOccupied:true},
    {attachmentsPending:true},{hasQueue:true},{ok:false}]){
    const h=harness({second}),r=await h.run();
    assert.equal(r.code,'AI_NATIVE_CHANGED_DURING_SOURCE_READBACK',JSON.stringify(second));
    assert.equal(h.saveCalls.length,0);
    assert.deepEqual(h.callbacks,['OBSERVE','OBSERVE']);
  }
});
test('P52-06 X concurrent stage replacement denies stale source checkpoint',async()=>{
  const h=harness({stageChange:true}),r=await h.run();
  assert.equal(r.code,'AI_STAGE_CHANGED_DURING_SOURCE_READBACK');
  assert.equal(h.saveCalls.length,0);
});
test('P52-06 F stable native idle, clean editor, protected route and exact stage permit only a checkpoint',async()=>{
  const h=harness(),r=await h.run();
  assert.equal(r.ok,true);
  assert.equal(r.tests,'INDEPENDENT_ORACLE_REQUIRED');
  assert.equal(r.state,'TESTS_UNVERIFIED');
  assert.equal(h.saveCalls.length,1);
  assert.equal(h.saveCalls[0][0],slug);
  assert.equal(h.saveCalls[0][1],job.revision);
  assert.equal(h.saveCalls[0][2].ok,true);
  assert.deepEqual(h.callbacks,['OBSERVE','OBSERVE']);
});
