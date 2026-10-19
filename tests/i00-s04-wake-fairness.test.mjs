import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationWatcher} from '../src/runtime/creation-watch.mjs';
function setup(){
  const db=fakeDatabase(),state=new Map();
  const local={get:async key=>({[key]:state.get(key)}),
    set:async packet=>{for(const [k,v] of Object.entries(packet))state.set(k,structuredClone(v));}};
  const api={storage:{local},alarms:{create:async()=>{},
    onAlarm:{addListener(){} }},runtime:{onStartup:{addListener(){}},
    onInstalled:{addListener(){}}}};
  return {db,api,state};
}
test('S04 D: 31 blocked oldest intents cannot starve later healthy work across wakes',async()=>{
  const ctx=setup(),s=createCoordinatorStore(ctx.db);
  for(let i=0;i<32;i++){
    const out=await s.acceptCreate({
      intentId:'intent_'+String(i).padStart(8,'0'),
      slug:'s04-round-'+String(i).padStart(3,'0'),origin:'OPERATOR'});
    assert.equal(out.ok,true,out.code);
  }
  const attempts=[],make=()=>createCreationWatcher(ctx.api,{
    open:async()=>ctx.db,maxPerWake:8,clock:()=>1000,
    createRunner:()=>({step:async(id,rev)=>{attempts.push(id);
      assert.equal(rev,1);
      return {ok:false,code:'INITIAL_INVENTORY_UNKNOWN'};}})
  });
  const first=make();
  for(let j=0;j<2;j++){
    const run=await first.tick();
    assert.equal(run.selected,8);
    assert.equal(run.held,8);
  }
  // Simulate Firefox background unload: only canonical IDB and the
  // explicitly non-authoritative progress hint persist across a new runner.
  const next=make();
  for(let j=0;j<2;j++)await next.tick();
  assert.equal(new Set(attempts).size,32,
    'all 32 intents must get a turn despite the same first eight holding');
  assert.equal(ctx.state.has('pcmsS04QueueCursor'),true);
  assert.equal(ctx.state.get('pcmsS04WakeReceipt').providerActivation,
    'HELD_UNLESS_SCOPED_GATE');
});
test('S04 D: reconciliation states remain schedulable while terminal states are not',async()=>{
  const ctx=setup(),tx=ctx.db.transaction(['meta'],'readwrite');
  for(const [i,state] of ['CREATE_UNCERTAIN','RENAME_UNCERTAIN',
    'GIT_UNCERTAIN','GIT_DISPATCH_POSSIBLE','ADOPTION_ORIGINAL_PENDING',
    'ASSOCIATED_NOT_READY'].entries()){
    tx.objectStore('meta').put({key:'s00-create-intent:intent_recovery_'+i,
      record:{intentId:'intent_recovery_'+i,slug:'s04-recover-'+i,
        state,revision:1,hold:state+'_PENDING'}});
  }
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=reject;});
  const seen=[];
  const runner=createCreationWatcher(ctx.api,{open:async()=>ctx.db,
    createRunner:()=>({step:async id=>{seen.push(id);return {ok:false,code:'HELD'};}})});
  const result=await runner.tick();
  assert.equal(result.selected,5);
  assert.equal(seen.includes('intent_recovery_5'),false);
  assert.equal(seen.includes('intent_recovery_2'),true);
});
