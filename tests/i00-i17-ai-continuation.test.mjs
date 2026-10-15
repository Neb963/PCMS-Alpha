import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary,productionAiGate} from '../src/runtime/ai-boundary.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
const slug='ordinary-ai-continuation',sid='1'.repeat(64);
const encode=s=>Buffer.from(s).toString('base64');
const source=async pjs=>exactSource([{path:'main.pjs',base64:encode(pjs)},{path:'index.html',base64:encode('<p>fixture</p>')}]);
const initial=await source('initial'),final=await source('meaningfully repaired');
const api={runtime:{id:'self',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async()=>({})}}};
const sender={id:'self',url:api.runtime.getURL('pcms/index.html')};
function fixture({stop=false,changedSession=false,dirty=false,wrongOwner=false,lostAck=false}={}){
  const effects=[],journal=[];
  const stage={slug,revision:1,state:'SOURCE_VERIFIED',candidate:initial,
    personaUid:'persona-fixture',accountId:'account-fixture',remotePublicId:'remote-fixture',
    principalFingerprint:'f'.repeat(64),nonce:'a'.repeat(32)};
  const {ok:ignored,...storedFinal}=final;
  let job={slug,revision:5,stageRevision:1,sourceFingerprint:final.fingerprint,finalSource:storedFinal,
    state:stop?'TESTS_UNVERIFIED':'KNOWN_FAILURE',prompt:{text:'task',tests:['default_generator_smoke']},
    chat1:{sessionDigest:sid},native:{state:stop?'RUNNING_OBSERVED':'CHAT1_OBSERVED_IDLE',sessionDigest:sid}};
  const store={getJobFull:async()=>({ok:true,job:structuredClone(job)}),
    armNative:async(_,revision,step)=>{assert.equal(revision,job.revision);journal.push(step);
      job={...job,revision:job.revision+1,state:'HELD_RECONCILE',native:{state:'DISPATCH_POSSIBLE',step}};
      return {ok:true,state:'DISPATCH_POSSIBLE'};},
    setAutomation:async(_,revision,enabled,scope)=>{assert.equal(revision,job.revision);
      job={...job,automation:{...scope,enabled}};return {ok:true};}};
  const guard=()=>({getSafeRouteReadiness:async()=>({ready:true,routeId:'protected',cookieStoreId:'container'}),
    inspectStageEditor:async()=>({ok:!dirty,clean:!dirty}),
    observeReadOnly:async()=>({ok:true,principalFingerprint:wrongOwner?'e'.repeat(64):stage.principalFingerprint,
      original:{ownerResult:'IS_OWNER',remotePublicId:stage.remotePublicId,visibility:'UNLISTED',pjs:'meaningfully repaired',html:'<p>fixture</p>',assets:[]}}),
    runNativeAiStep:async(_,r)=>{
      if(r.action==='OBSERVE')return {ok:true,busy:true,sessionDigest:changedSession?'2'.repeat(64):sid,
        hasQueue:false,inputOccupied:false,attachmentsPending:false,editorClean:!dirty,sourceSaved:!dirty};
      assert.equal(job.native.state,'DISPATCH_POSSIBLE');
      if(r.action==='STOP')assert.equal(r.expectedSessionDigest,sid);
      effects.push(r.action);if(lostAck)throw Error('lost ack');return {ok:true};}});
  const boundary=createAiBoundary(api,{open:async()=>({}),storeFactory:()=>store,
    stageFactory:()=>({getFull:async()=>({ok:true,record:stage})}),guard});
  const run=(type,params)=>boundary.run({type,params},sender);
  const arm=step=>run('ARM_EXACT_AI',{slug,expectedRevision:job.revision,step,confirmation:step+' '+slug});
  const begin=step=>run('BEGIN_NATIVE',{slug,expectedRevision:job.revision,step});
  return {run,arm,begin,effects,journal,stage,job:()=>job};
}
test('I17 normal manual continuation accepts independently checkpointed F after original B changed',async()=>{
  const f=fixture({lostAck:true});assert.equal((await f.arm('CHAT1_REPAIR')).ok,true);
  assert.equal((await f.begin('CHAT1_REPAIR')).code,'AI_DISPATCH_POSSIBLE_RECONCILE');
  assert.deepEqual(f.effects,['SEND']);assert.deepEqual(f.journal,['CHAT1_REPAIR']);
  assert.equal((await f.begin('CHAT1_REPAIR')).ok,false);assert.deepEqual(f.effects,['SEND']);
  const history=fixture();assert.equal((await history.arm('READ_ONLY_HISTORY')).ok,true);
  const auto=fixture();assert.equal((await auto.run('SET_AUTO_JOB',{slug,expectedRevision:5,enabled:true,confirmation:'AUTO AI '+slug})).ok,true);
  assert.equal(auto.job().automation.sourceFingerprint,final.fingerprint);
  assert.equal(productionAiGate({phase:'I10',step:'CHAT1_REPAIR',job:auto.job(),stage:auto.stage}),true);
});
test('I17 exact Stop cancels only the observed AI-owned running session without overwriting dirty source',async()=>{
  const f=fixture({stop:true,dirty:true,lostAck:true});assert.equal((await f.arm('STOP')).ok,true);
  assert.equal((await f.begin('STOP')).code,'AI_DISPATCH_POSSIBLE_RECONCILE');
  assert.deepEqual(f.effects,['STOP']);assert.deepEqual(f.journal,['STOP']);
  assert.equal(f.job().sourceFingerprint,final.fingerprint);
  assert.equal((await f.arm('STOP')).code,'AI_JOB_HELD');assert.deepEqual(f.effects,['STOP']);
});
test('I17 changed session, wrong owner and dirty repair cannot dispatch',async()=>{
  const changed=fixture({stop:true,changedSession:true});assert.equal((await changed.arm('STOP')).ok,false);
  assert.deepEqual(changed.effects,[]);assert.deepEqual(changed.journal,[]);
  const owner=fixture({stop:true,wrongOwner:true});await owner.arm('STOP');assert.equal((await owner.begin('STOP')).ok,false);
  assert.deepEqual(owner.effects,[]);assert.deepEqual(owner.journal,[]);
  const dirty=fixture({dirty:true});assert.equal((await dirty.arm('CHAT1_REPAIR')).ok,false);assert.deepEqual(dirty.effects,[]);
});
