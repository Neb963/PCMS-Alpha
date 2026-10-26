import test from 'node:test';
import assert from 'node:assert/strict';
import {createS06StandingAuthority,createS06ScopeGate} from '../src/runtime/s06-standing-authority.mjs';
import {createAiBoundary,AI_PROGRESS_ALARM} from '../src/runtime/ai-boundary.mjs';
const consent='I AUTHORIZE PROTECTED PCMS OPERATIONS';
const off={development:false,gitWrite:false,publication:false};
const grants={...off,development:true},repository={repository:'Neb963/per-gens',repositoryId:'123'};
const drain=async()=>{for(let i=0;i<180;i++)await Promise.resolve();};
async function until(predicate){
 for(let i=0;i<800;i++){if(predicate())return;await Promise.resolve();}
 assert.fail('Expected trusted transition did not settle');
}
function fixture({seed=null,config=repository,restore=null,blockCreate=false,blockRecovery=false}={}){
 const data=new Map([['pcmsS03Git',config]]),storageListeners=[],alarms=new Map(),events={},frames=[];
 if(seed)data.set('pcmsS06StandingAuthority',structuredClone(seed));
 if(restore)data.set('pcmsRestoreInProgress',restore);
 const event=name=>({addListener:fn=>(events[name]??=[]).push(fn)});
 let creates=0,scans=0,recoveries=0,releaseCreate,releaseRecovery;
 const createBarrier=new Promise(resolve=>releaseCreate=resolve),recoveryBarrier=new Promise(resolve=>releaseRecovery=resolve);
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p,
  onConnect:event('connect'),onStartup:event('startup'),onInstalled:event('installed')},
  storage:{onChanged:{addListener:fn=>storageListeners.push(fn)},local:{
   get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>data.has(k))
    .map(k=>[k,structuredClone(data.get(k))])),
   set:async rows=>{
    const changes={};for(const [key,value] of Object.entries(rows)){
     changes[key]={oldValue:data.get(key),newValue:value};data.set(key,structuredClone(value));
    }
    for(const fn of storageListeners)fn(changes,'local');
   }
  }},
  alarms:{onAlarm:event('alarm'),get:async name=>alarms.get(name),
   clear:async name=>alarms.delete(name),create:async(name,settings)=>{
    creates++;if(blockCreate)await createBarrier;alarms.set(name,{name,...settings});
   }}};
 const authority=createS06StandingAuthority(api);
 authority.subscribe(snapshot=>frames.push(snapshot));
 const effectGate=createS06ScopeGate(authority,'development');
 const ai=createAiBoundary(api,{authority,effectGate,open:async()=>({}),storeFactory:()=>({
  recoverNative:async()=>{recoveries++;if(blockRecovery)await recoveryBarrier;return{ok:true};},
  list:async()=>{scans++;return{ok:true,jobs:[],more:false,truncated:false};}
 })});
 return {api,authority,ai,data,frames,alarms,events,effectGate,
  stats:()=>({creates,scans,recoveries}),releaseCreate,releaseRecovery,
  grant:async()=>{
   const current=await authority.state();
   return authority.update({expectedRevision:current.record.revision,repositoryId:'123',consent,grants});
  }};
}
const seeded={schema:1,revision:1,...repository,grants};
test('F2 cold persisted grant reconstructs one alarm and immediately advances after actual native recovery',async()=>{
 const f=fixture({seed:seeded,blockRecovery:true});f.authority.register();f.ai.register();
 await f.authority.state();await until(()=>f.alarms.has(AI_PROGRESS_ALARM));
 assert.equal(f.effectGate(),true);assert.equal(f.stats().scans,0);
 f.releaseRecovery();await until(()=>f.stats().scans===1);
 assert.equal(f.stats().recoveries,1);assert.equal(f.stats().creates,1);
 f.ai.register();await f.authority.state();await drain();
 assert.equal(f.stats().creates,1);assert.equal(f.stats().scans,1);
 await f.authority.revoke();await until(()=>!f.alarms.has(AI_PROGRESS_ALARM));
});
test('F2 explicit new development grant wakes AI without startup, installation event or restart',async()=>{
 const f=fixture();f.authority.register();f.ai.register();await f.authority.state();await drain();
 assert.equal(f.effectGate(),false);assert.equal(f.alarms.size,0);assert.equal(f.stats().scans,0);
 const result=await f.grant();assert.equal(result.ok,true);
 await until(()=>f.alarms.has(AI_PROGRESS_ALARM)&&f.stats().scans===1);
 assert.equal(f.stats().creates,1);assert.equal(f.stats().recoveries,1);
 await f.authority.revoke();await until(()=>f.alarms.size===0);
});
test('F2 pending update and revocation notify OFF synchronously and do not resurrect a pending alarm create',async()=>{
 const f=fixture({seed:seeded,blockCreate:true});f.authority.register();await f.authority.state();f.ai.register();
 await until(()=>f.stats().creates===1);
 const revoke=f.authority.revoke();assert.equal(f.effectGate(),false);
 assert.equal(f.frames.at(-1).grants.development,false);
 await revoke;f.releaseCreate();await drain();
 assert.equal(f.alarms.size,0);assert.equal(f.effectGate(),false);
});
test('F2 invalid, mismatched and restore-held persisted policies never activate AI',async()=>{
 for(const options of [
  {seed:{...seeded,schema:99}},
  {seed:{...seeded,grants:{...grants,development:'true'}}},
  {seed:seeded,config:{...repository,repositoryId:'999'}},
  {seed:seeded,restore:{active:true,status:'PREPARING'}}
 ]){
  const f=fixture(options);f.authority.register();f.ai.register();await f.authority.state();await drain();
  assert.equal(f.effectGate(),false);assert.equal(f.alarms.size,0);assert.equal(f.stats().scans,0);
  assert.equal(f.frames.some(frame=>frame.grants.development),false);
 }
});
test('F2 a throwing or nonsettling authorization observer cannot block policy readback or another subscriber',async()=>{
 const f=fixture(),observed=[];
 const stopThrow=f.authority.subscribe(()=>{throw Error('PRIVATE_CANARY_MUST_NOT_ESCAPE');});
 const stopHang=f.authority.subscribe(()=>new Promise(()=>{}));
 const stop=f.authority.subscribe(value=>observed.push(value));
 f.authority.register();await f.authority.state();
 assert.equal((await f.grant()).ok,true);
 assert.equal(observed.at(-1).grants.development,true);
 assert.equal(Object.isFrozen(observed.at(-1)),true);
 assert.equal(Object.isFrozen(observed.at(-1).grants),true);
 assert.equal(JSON.stringify(observed).includes('PRIVATE_CANARY'),false);
 stopThrow();stopHang();stop();await f.authority.revoke();
});
test('F2 effective scope gates expose the original authority generation and no extra grant scope',async()=>{
 const f=fixture();f.authority.register();await f.authority.state();
 const invalid=createS06ScopeGate(f.authority,'allOtherAccounts');
 assert.equal(invalid(),false);const before=f.effectGate.generation();
 assert.equal((await f.grant()).ok,true);
 assert.equal(f.effectGate(),true);assert.ok(f.effectGate.generation()>before);
 assert.equal(invalid(),false);
 const revoke=f.authority.revoke();assert.equal(f.effectGate(),false);await revoke;
});
