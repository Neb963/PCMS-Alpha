import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';

const slug='test-staged-source',nonce='e'.repeat(32),sid='1'.repeat(64);
const api={runtime:{id:'fixture',getURL:s=>'moz-extension://fixture/'+s},
  storage:{local:{get:async()=>({})}}};
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html#work-queue'};
const payload={pjs:'output = 1',html:'<h1>ready</h1>',assets:[]};
const encode=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const saved=await exactSource([
  {path:'main.pjs',base64:encode(payload.pjs)},
  {path:'index.html',base64:encode(payload.html)}
]);
assert.equal(saved.ok,true);
const baseStage={slug,nonce,revision:4,state:'SOURCE_VERIFIED',
  personaUid:'p1',principalFingerprint:'fingerprint',remotePublicId:'remote'};
const baseJob={slug,revision:7,stageRevision:4,state:'TESTS_UNVERIFIED',
  prompt:{revision:1,tests:['default_generator_smoke']},
  chat1:{sessionDigest:sid,tests:{}},chat2:null,
  native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:sid},
  sourceFingerprint:saved.fingerprint,finalSource:saved};
const route={ready:true,cookieStoreId:'protected-container',routeId:'wg-verified'};
function scenario({stageChange=false,sourceChange=false,ownerChange=false}={}){
  let stageReads=0,tests=0,observations=0;
  const fakeStage=()=>({getFull:async()=>({ok:true,record:
    ++stageReads>=2&&stageChange?{...baseStage,state:'HUMAN_OWNED'}:baseStage})});
  const guard=()=>({
    getSafeRouteReadiness:async()=>route,
    runNativeAiStep:async(_persona,req)=>{
      observations++;
      if(req.action==='ORACLE_SMOKE')return {
        ok:true,source:'INDEPENDENT_BROWSER_ASSERTION',
        name:'default_generator_smoke',result:'PASS',observedAt:1700000000000
      };
      assert.equal(req.action,'OBSERVE');
      return {ok:true,busy:false,editorClean:true,sourceSaved:true,
        sessionDigest:sid,slug};
    },
    observeReadOnly:async()=>({ok:true,
      principalFingerprint:ownerChange?'changed':baseStage.principalFingerprint,
      original:{...payload,remotePublicId:'remote',ownerResult:'IS_OWNER',
        visibility:'UNLISTED',
        pjs:sourceChange?'output = 2':payload.pjs}}),
  });
  const service=createAiBoundary(api,{open:async()=>({}),guard,
    storeFactory:()=>({
      getJobFull:async()=>({ok:true,job:baseJob}),
      record:async(_slug,_revision,entry)=>{tests++;return {ok:true,entry};}
    }),
    stageFactory:fakeStage});
  return {call:()=>service.run({type:'RUN_TESTS',params:{
    slug,expectedRevision:baseJob.revision}},sender),
    count:()=>({tests,observations,stageReads})};
}
test('P52-05 X human takes over stage after browser PASS but before canonical TEST receipt',async()=>{
  const h=scenario({stageChange:true}),r=await h.call();
  assert.equal(r.code,'AI_TEST_STAGE_CHANGED');
  assert.equal(h.count().tests,0);
  assert.equal(h.count().observations,3);
});
test('P52-05 X external saved source changed or old owner cannot certify previous fingerprint',async()=>{
  for(const props of [{sourceChange:true},{ownerChange:true}]){
    const h=scenario(props),r=await h.call();
    assert.equal(r.ok,false,JSON.stringify(props));
    assert.equal(h.count().tests,0);
  }
});
test('P52-05 F exact stable final source and same stage after independent browser PASS commits once',async()=>{
  const h=scenario(),r=await h.call();
  assert.equal(r.ok,true);
  assert.equal(h.count().tests,1);
  assert.equal(r.entry.name,'default_generator_smoke');
  assert.equal(r.entry.sourceFingerprint,saved.fingerprint);
  assert.equal(r.entry.independentSource,'INDEPENDENT_BROWSER_ASSERTION');
});
