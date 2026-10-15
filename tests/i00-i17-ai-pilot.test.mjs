import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary,validateAiMessage} from '../src/runtime/ai-boundary.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';

const slug='pcms-test-native-private-0001',sid='1'.repeat(64);
const original={pjs:'output = 1',html:'<h1>source</h1>',assets:[]};
const enc=x=>Buffer.from(x,'utf8').toString('base64');
const saved=await exactSource([{path:'main.pjs',base64:enc(original.pjs)},
  {path:'index.html',base64:enc(original.html)}]);
assert.equal(saved.ok,true);
const fingerprint=saved.fingerprint;
const api={runtime:{id:'persona-route-manager@local',
  getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#work-queue'};
function fixture({clock=()=>0,expireAtMarker=false,lostAck=false,
  dirtyAfterMarker=false,routeChangeAfterMarker=false,history=false,
  wrongSource=false,stageChanged=false,remoteDrift=false}={}){
  const events=[],external=[];
  let marked=false,reads=0,jobReads=0;
  let job={slug,revision:7,stageRevision:4,state:history?'TESTS_UNVERIFIED':'PENDING_NATIVE_SESSION',
    sourceFingerprint:wrongSource?'b'.repeat(64):fingerprint,
    prompt:{text:'Pinned Chat 1 operator task',tests:['default_generator_smoke']},
    native:history?{state:'CHAT2_OBSERVED_IDLE',sessionDigest:'2'.repeat(64)}:null,
    chat1:{sessionDigest:history?sid:null,tests:{}},
    chat2:history?{state:'FRESH_OBSERVED',sessionDigest:'2'.repeat(64)}:null,
    optionalTesting:history?{text:'Pinned T1',tests:['default_generator_smoke']}:null,
    finalSource:history?{fingerprint}:null};
  const stage={slug,revision:4,state:'SOURCE_VERIFIED',accountId:'account-private',
    personaUid:'persona-verified',remotePublicId:'remote-private',
    principalFingerprint:'f'.repeat(64),nonce:'c'.repeat(32),
    candidate:saved};
  const store={
    getJobFull:async()=>{jobReads++;return {ok:true,job:structuredClone(job)}},
    armNative:async(_slug,revision,step)=>{
      assert.equal(revision,7);
      events.push('AI_DISPATCH_POSSIBLE');marked=true;
      if(expireAtMarker)clock.value=120001;
      job={...job,revision:8,state:'HELD_RECONCILE',
        native:{step,state:'DISPATCH_POSSIBLE'}};
      return {ok:true,state:'DISPATCH_POSSIBLE'};
    },
    verifySecondChat:async(...p)=>{
      events.push('HISTORY_CAS_VERIFIED');return {ok:true,params:p};
    }
  };
  const guard=()=>({
    getSafeRouteReadiness:async()=>{
      reads++;
      return {ready:true,routeId:routeChangeAfterMarker&&marked?'different-route':'protected-wg',
        cookieStoreId:'protected-container'};
    },
    inspectStageEditor:async()=>({ok:true,clean:!(dirtyAfterMarker&&marked)}),
    observeReadOnly:async()=>({ok:true,
      principalFingerprint:stage.principalFingerprint,
      original:{...original,html:remoteDrift?'<h1>human update</h1>':original.html,
        remotePublicId:stage.remotePublicId,ownerResult:'IS_OWNER',
        visibility:'UNLISTED'}}),
    runNativeAiStep:async(_persona,request)=>{
      external.push(request.action);
      if(request.action==='OBSERVE')return {ok:true,sessionDigest:'2'.repeat(64),
        busy:false,editorClean:true,sourceSaved:true,hasQueue:false,
        inputOccupied:false,attachmentsPending:false};
      if(request.action==='OBSERVE_OPFS')return {ok:true,
        sessionDigest:'2'.repeat(64),isolation:'UNVERIFIED',
        workspaceRootState:'PRESENT_UNTRUSTED',workerNamespace:'CURRENT_SESSION_WORKER_INIT_LOCK'};
      if(request.action==='OBSERVE_HISTORY')return {ok:true,
        code:'AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED',
        sessionDigest:'2'.repeat(64),serverHistory:'FIRST_USER_IS_T1'};
      assert.equal(request.action,'SEND');
      assert.equal(request.text,'Pinned Chat 1 operator task');
      return lostAck?{ok:false,code:'ACK_LOST'}:{ok:true,code:'SEND_ATTEMPTED_UNVERIFIED'};
    }
  });
  const service=createAiBoundary(api,{
    open:async()=>({}),storeFactory:()=>store,
    stageFactory:()=>({getFull:async()=>({ok:true,record:stageChanged?
      {...stage,revision:5}:stage})}),guard,effectGate:()=>false,
    pilotClock:()=>typeof clock==='function'?clock():clock.value
  });
  const run=(type,params)=>service.run({type,params},sender);
  const arm=(step='CHAT1_SEND',confirmation=step+' '+slug)=>
    run('ARM_DISPOSABLE_AI',{slug,expectedRevision:job.revision,step,confirmation});
  const begin=(step='CHAT1_SEND',revision=7)=>
    run('BEGIN_NATIVE',{slug,expectedRevision:revision,step});
  return {run,arm,begin,events,external,guard,job:()=>job,
    reads:()=>reads,jobReads:()=>jobReads};
}
test('I17 F/X one approved disposable native send journals before first remote effect',async()=>{
  const x=fixture({lostAck:true});
  assert.equal((await x.begin()).code,'AI_PROVIDER_ACTIVATION_HELD');
  assert.deepEqual(x.events,[]);assert.deepEqual(x.external,[]);
  assert.equal((await x.arm('CHAT1_SEND','CHAT1_SEND other')).code,
    'PILOT_CONFIRMATION_REQUIRED');
  const permit=await x.arm();
  assert.equal(permit.ok,true,permit.code);
  assert.equal(permit.scope,'SINGLE_DISPOSABLE_NATIVE_AI_STEP');
  assert.equal((await x.arm()).code,'PILOT_ALREADY_ARMED');
  const result=await x.begin();
  assert.equal(result.code,'AI_DISPATCH_POSSIBLE_RECONCILE');
  assert.equal(result.attempt,'ACK_LOST');
  assert.deepEqual(x.events,['AI_DISPATCH_POSSIBLE']);
  assert.deepEqual(x.external,['SEND']);
  assert.equal((await x.begin('CHAT1_SEND',8)).code,'AI_PROVIDER_ACTIVATION_HELD');
  assert.deepEqual(x.external,['SEND'],'lost response can never blind-replay the send');
});
test('I17 X expired grant after marker holds native effect; no send and no automatic replay',async()=>{
  const ticks={value:0},x=fixture({clock:ticks,expireAtMarker:true});
  assert.equal((await x.arm()).ok,true);
  assert.equal((await x.begin()).code,'AI_ACTIVATION_REVOKED_AFTER_MARKER');
  assert.deepEqual(x.events,['AI_DISPATCH_POSSIBLE']);
  assert.deepEqual(x.external,[]);
  assert.equal(x.job().native.state,'DISPATCH_POSSIBLE');
  assert.equal((await x.begin('CHAT1_SEND',8)).code,'AI_PROVIDER_ACTIVATION_HELD');
});
test('I17 X route loss or human-edited tab after marker cannot dispatch native AI',async()=>{
  for(const options of [
    [{routeChangeAfterMarker:true},'AI_DISPATCH_GUARD_CHANGED_RECONCILE'],
    [{dirtyAfterMarker:true},'AI_EDITOR_CHANGED_AFTER_MARKER']
  ]){
    const [opts,code]=options,x=fixture(opts);
    assert.equal((await x.arm()).ok,true,JSON.stringify(opts));
    assert.equal((await x.begin()).code,code);
    assert.deepEqual(x.events,['AI_DISPATCH_POSSIBLE']);
    assert.deepEqual(x.external,[]);
  }
});
test('I17 X source fingerprint or moved stage prevents arming and native traffic',async()=>{
  for(const opts of [{wrongSource:true},{stageChanged:true}]){
    const x=fixture(opts);
    assert.equal((await x.arm()).ok,false,JSON.stringify(opts));
    assert.deepEqual(x.events,[]);assert.deepEqual(x.external,[]);
  }
});
test('I17 F/X read-only server-history grant is distinct and consumed before provider read',async()=>{
  const x=fixture({history:true});
  const params={slug,expectedRevision:7};
  assert.equal((await x.run('VERIFY_FRESH_CHAT2',params)).code,
    'AI_SERVER_HISTORY_ACTIVATION_HELD');
  const arm=await x.arm('READ_ONLY_HISTORY');
  assert.equal(arm.ok,true,arm.code);
  const checked=await x.run('VERIFY_FRESH_CHAT2',params);
  assert.equal(checked.ok,true,checked.code);
  assert.deepEqual(x.external,['OBSERVE','OBSERVE_OPFS','OBSERVE_HISTORY','OBSERVE']);
  assert.deepEqual(x.events,['HISTORY_CAS_VERIFIED']);
  assert.equal((await x.run('VERIFY_FRESH_CHAT2',params)).code,
    'AI_SERVER_HISTORY_ACTIVATION_HELD');
});
test('I17 X native operator arm never authorizes AUTOMATION or forged web commands',async()=>{
  const x=fixture();
  const a=await x.arm('AUTOMATION');
  assert.equal(a.code,'INVALID_PARAMS');
  assert.equal(validateAiMessage(api,sender,{type:'ARM_DISPOSABLE_AI',
    params:{slug,expectedRevision:7,step:'CHAT1_SEND',
      confirmation:'CHAT1_SEND '+slug,force:true}}).code,'INVALID_PARAMS');
  assert.deepEqual(x.external,[]);
});

test('I17 X external Perchance saved-byte drift stops disposable AI before journal/effect',async()=>{
  const x=fixture({remoteDrift:true});
  assert.equal((await x.arm()).ok,true);
  assert.equal((await x.begin()).code,'AI_PILOT_REMOTE_SOURCE_CHANGED');
  assert.deepEqual(x.events,[]);
  assert.deepEqual(x.external,[]);
});
