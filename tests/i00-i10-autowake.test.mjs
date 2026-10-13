import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary,AI_PROGRESS_ALARM} from '../src/runtime/ai-boundary.mjs';
const id='owned-generator',sha='a'.repeat(64);
function apiFixture(){
  const alarm=[],startup=[],installed=[];
  const api={
    storage:{local:{get:async()=>({})}},
    alarms:{create:(name,schedule)=>alarm.push({name,schedule}),
      onAlarm:{addListener:fn=>alarm.push({listener:fn})}},
    runtime:{id:'fixture-extension',
      getURL:part=>'moz-extension://fixed/'+part,
      onConnect:{addListener:()=>{}},
      onStartup:{addListener:fn=>startup.push(fn)},
      onInstalled:{addListener:fn=>installed.push(fn)}}
  };
  return {api,alarm,startup,installed};
}
test('I10 F automation cannot schedule or execute if provider activation is absent',async()=>{
  const {api,alarm,startup}=apiFixture();
  let dbRead=0;
  const service=createAiBoundary(api,{
    open:async()=>{dbRead++;return{};},
    effectGate:()=>false
  });
  service.register();
  assert.equal(alarm.filter(x=>x.name===AI_PROGRESS_ALARM).length,0);
  assert.equal((await service.tick()).code,'AI_PROVIDER_ACTIVATION_HELD');
  // Canonical startup recovery may read IDB but must never dispatch provider effects.
  assert.ok(dbRead>=0);
  startup[0]();
  assert.equal(alarm.filter(x=>x.name===AI_PROGRESS_ALARM).length,0);
});
test('I10 F background alarm tick is bounded, oldest first and protected route denial sends nothing',async()=>{
  const {api,alarm,startup}=apiFixture();
  let stageReads=0,routeReads=0;
  const oldest={slug:id,revision:1,state:'HELD_RECONCILE',
    sourceFingerprint:sha,stageRevision:1,prompt:{tests:['default_generator_smoke']},
    chat1:{tests:{},sessionDigest:null},
    native:{state:'DISPATCH_POSSIBLE'},createdAt:1};
  const newer={...oldest,slug:'z-newer',createdAt:100};
  const service=createAiBoundary(api,{
    open:async()=>({}),
    effectGate:()=>true,
    storeFactory:()=>({
      list:async()=>({ok:true,truncated:false,jobs:[{slug:newer.slug},{slug:oldest.slug}]}),
      getJobFull:async slug=>({ok:true,job:slug===id?oldest:newer}),
      deferScheduler:async()=>({ok:true})
    }),
    stageFactory:()=>({getFull:async slug=>{
      stageReads++;
      return {ok:true,record:{slug,state:'SOURCE_VERIFIED',revision:1,
        personaUid:'persona',routeId:'protected'}};
    }}),
    guard:()=>({runNativeAiStep:async()=>{throw Error('MUST_NOT_DISPATCH')},getSafeRouteReadiness:async()=>{
      routeReads++;return {ready:false,code:'PROTECTED_ROUTE_UNVERIFIED'};
    }})
  });
  service.register();
  assert.equal(alarm.some(x=>x.name===AI_PROGRESS_ALARM&&x.schedule.periodInMinutes===1),true);
  startup[0]();
  assert.equal(alarm.filter(x=>x.name===AI_PROGRESS_ALARM).length,2);
  const result=await service.tick();
  assert.equal(result.code,'PROTECTED_ROUTE_UNVERIFIED');
  assert.equal(result.plannedStep,'PROBE_NATIVE');
  assert.equal(stageReads,1);
  assert.equal(routeReads,1);
});
test('I10 X overlapping wakes cannot run parallel scheduler passes',async()=>{
  const {api}=apiFixture();
  let unblock;const barrier=new Promise(resolve=>unblock=resolve);
  let scans=0;
  const service=createAiBoundary(api,{
    open:async()=>({}),effectGate:()=>true,
    storeFactory:()=>({
      list:async()=>{scans++;await barrier;return{ok:true,jobs:[],truncated:false};}
    })
  });
  const first=service.tick();
  // The first tick awaits the restore marker and DB before scanning.
  for(let i=0;i<40&&!scans;i++)await Promise.resolve();
  assert.equal(scans,1);
  assert.equal((await service.tick()).code,'AI_TICK_BUSY');
  unblock();
  assert.equal((await first).code,'AI_NO_ELIGIBLE_WORK');
  assert.equal(scans,1);
});

test('I10 F cold-wake model: durable deferral skips held oldest and admits independent next job',async()=>{
  const {api}=apiFixture();
  const jobs={
    'a-older':{slug:'a-older',revision:1,state:'HELD_RECONCILE',
      sourceFingerprint:sha,stageRevision:1,createdAt:100,
      prompt:{tests:['default_generator_smoke']},chat1:{sessionDigest:null,tests:{}},
      native:{step:'CHAT1_SEND',state:'DISPATCH_POSSIBLE'}},
    'z-newer':{slug:'z-newer',revision:1,state:'HELD_RECONCILE',
      sourceFingerprint:sha,stageRevision:1,createdAt:200,
      prompt:{tests:['default_generator_smoke']},chat1:{sessionDigest:null,tests:{}},
      native:{step:'CHAT1_SEND',state:'DISPATCH_POSSIBLE'}}
  };
  const visited=[],saved=[];
  const store={
    list:async()=>({ok:true,truncated:false,jobs:Object.values(jobs).map(j=>({slug:j.slug}))}),
    getJobFull:async slug=>({ok:true,job:jobs[slug]}),
    deferScheduler:async(slug,revision,until,code)=>{
      assert.equal(jobs[slug].revision,revision);
      jobs[slug]={...jobs[slug],revision:revision+1,
        schedulerDeferredUntil:until,schedulerHold:code};
      saved.push({slug,until,code});return{ok:true};
    }
  };
  const options={
    open:async()=>({}),clock:()=>1000,effectGate:()=>true,
    storeFactory:()=>store,
    stageFactory:()=>({getFull:async slug=>{
      visited.push(slug);
      return {ok:true,record:{slug,state:'SOURCE_VERIFIED',revision:1,personaUid:slug}};
    }}),
    guard:()=>({runNativeAiStep:async()=>{throw Error('SHOULD_NOT_RUN')},
      getSafeRouteReadiness:async()=>({ready:false,code:'ROUTE_UNVERIFIED'})})
  };
  const first=createAiBoundary(api,options);
  assert.equal((await first.tick()).code,'ROUTE_UNVERIFIED');
  assert.deepEqual(visited,['a-older']);
  assert.equal(saved[0].until,121000);
  assert.equal(saved[0].code,'AI_WAKE_ROUTE_UNVERIFIED');
  // Reconstruct controller instance: volatile tickBusy memory is gone.
  const cold=createAiBoundary(api,options);
  assert.equal((await cold.tick()).code,'ROUTE_UNVERIFIED');
  assert.deepEqual(visited,['a-older','z-newer']);
  assert.equal((await cold.tick()).code,'AI_NO_ELIGIBLE_WORK');
  assert.equal(saved.length,2);
  assert.equal(jobs['a-older'].native.state,'DISPATCH_POSSIBLE');
  assert.equal(jobs['z-newer'].native.state,'DISPATCH_POSSIBLE');
});
test('I10 X virtual clock and failed canonical defer never imply successful scheduling',async()=>{
  const {api}=apiFixture();
  const bad=createAiBoundary(api,{open:async()=>({}),effectGate:()=>true,
    clock:()=>NaN,storeFactory:()=>({
      list:async()=>({ok:true,jobs:[],truncated:false})
    })});
  assert.equal((await bad.tick()).code,'AI_SCHEDULER_CLOCK_UNVERIFIED');
});
