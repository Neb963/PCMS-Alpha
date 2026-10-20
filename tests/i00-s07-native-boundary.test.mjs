import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefresherBoundary} from '../src/runtime/refresher-boundary.mjs';
import {emptyShadow,advanceShadow,HOUR} from '../src/runtime/refresher-core.mjs';

const START=2000000;
const witness=(sequence,elapsedMs)=>({
  observerEpoch:'observer_epoch_001',
  systemBootId:'system_boot_001',
  nativeLifetimeId:'native_lifetime_001',
  observerConnectionId:'pipe_connection_001',
  sequence,hostAwakeNs:String(1000000000+elapsedMs*1000000),
  hostBootNs:String(1000000000+elapsedMs*1000000)
});
function fixture({throwWitness=false,clockGate=true}={}){
  const turns=[],samples=[];
  const api={
    storage:{local:{get:async()=>({}),set:async()=>{}}},
    alarms:{create:async()=>{},get:async name=>({name}),onAlarm:{addListener(){}}},
    runtime:{id:'pcms-test',onConnect:{addListener(){}},onStartup:{addListener(){}},
      onInstalled:{addListener(){}},getURL:path=>'moz-extension://pcms-test/'+path}};
  const store={
    turn:async args=>{
      turns.push(args);
      const next=advanceShadow(emptyShadow(),args);
      assert.equal(next.ok,true);
      return {ok:true,revision:2,state:next.state};
    }
  };
  const guard=()=>({sampleNativeWitness:async()=>{
    samples.push('native');
    if(throwWitness)throw Error('pipe unavailable');
    return {ok:true,witness:witness(1,0)};
  }});
  return {turns,samples,boundary:createRefresherBoundary(api,{
    open:async()=>({}),storeFactory:()=>store,guard,
    nativeClockGate:()=>clockGate,
    continuousCoverageFor:async()=>null,
    observationGate:()=>false,refreshGate:()=>false,
    clock:()=>START+1000,newId:()=> 'browser_boot_01'
  })};
}
test('S07 E04 B-boundary: native witness without independent continuous eligibility is not time authority',async()=>{
  const f=fixture();
  const result=await f.boundary.tick();
  assert.equal(result.ok,true);
  assert.equal(f.samples.length,1);
  assert.equal(f.turns.length,1);
  assert.equal(f.turns[0].nativeClock.sequence,1);
  assert.equal(f.turns[0].qualifiedCoverages,null);
  assert.equal(f.turns[0].receipt,undefined);
  assert.equal(result.providerEffects,'OFF');
  assert.equal(result.refresh,'REFRESH_ACTIVATION_HELD');
});
test('S07 E04 X-boundary: missing original native pipe and disabled sample gate never synthesize a timer',async()=>{
  for(const config of [{throwWitness:true},{clockGate:false}]){
    const f=fixture(config),result=await f.boundary.tick();
    assert.equal(result.ok,true);
    assert.equal(f.turns[0].nativeClock,null);
    assert.equal(f.turns[0].qualifiedCoverages,null);
    assert.equal(f.samples.length,config.clockGate===false?0:1);
  }
});
