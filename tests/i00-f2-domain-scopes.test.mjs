import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {createReadyDevelopment} from '../src/runtime/ready-development.mjs';
import {createS06PublicationProgress} from '../src/runtime/s06-publication-progress.mjs';
import {createRefresherBoundary} from '../src/runtime/refresher-boundary.mjs';
import {qualifyBrowserObservedInterval} from '../src/runtime/refresher-browser-clock.mjs';
import {settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';
const FP='a'.repeat(64);
function barrier(){let release;return {promise:new Promise(r=>release=r),release:()=>release()};}
function apiFixture(){
 const data=new Map(),alarms=new Map();
 return {data,api:{runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async key=>({[key]:data.get(key)}),
   set:async values=>{for(const [k,v] of Object.entries(values))data.set(k,structuredClone(v));}}},
  alarms:{get:async n=>alarms.get(n),create:async(n,p)=>alarms.set(n,{name:n,...p})}}};
}
const put=(db,rows)=>new Promise((resolve,reject)=>{
 const tx=db.transaction('meta','readwrite');for(const row of rows)tx.objectStore('meta').put(row);
 tx.oncomplete=resolve;tx.onabort=reject;
});
test('F2 a pending READY generator remains owned across publication while independent generators advance',async()=>{
 const f=apiFixture(),db=fakeDatabase(),held=barrier(),readyCalls=[],publicationCalls=[];
 for(const slug of ['f2-a-held','f2-b-ready']){
  assert.equal((await createReadyStore(db).observe({slug,repositoryId:'123',identifier:'rev-f2-scope',
   declarationCommit:'d'.repeat(40),markerOid:'e'.repeat(40),inputFingerprint:FP})).ok,true);
  await put(db,[{key:'inventory:'+slug,generator:{slug,visibility:'PUBLIC'}}]);
 }
 const ready=createReadyDevelopment(f.api,{open:async()=>db,effectGate:()=>true,observationMs:10,
  makeReady:()=>({}),makeStage:()=>({}),makeAi:()=>({}),
  makeExisting:()=>({runTrusted:async msg=>{
   readyCalls.push(msg.params.slug);if(msg.params.slug==='f2-a-held')await held.promise;
   return {ok:true,revision:2,code:'EXISTING_PREPARED'};
  }})});
 try{
  assert.equal((await ready.tick()).code,'SCOPE_OBSERVATION_PENDING');
  assert.equal((await ready.tick()).slug,'f2-b-ready');
  for(const slug of ['f2-a-held','f2-c-approved'])await put(db,[{key:'release:'+slug,
   release:{slug,revision:1,state:'APPROVED',approval:{files:[]}}}]);
  const publication=createS06PublicationProgress(f.api,{open:async()=>db,observationMs:10,
   makeRelease:()=>({runTrusted:async msg=>{publicationCalls.push(msg.params.slug);return {ok:true,revision:2};}})});
  assert.equal((await publication.tick()).slug,'f2-c-approved');
  assert.deepEqual(readyCalls,['f2-a-held','f2-b-ready']);
  assert.deepEqual(publicationCalls,['f2-c-approved']);
 }finally{held.release();}
 await settlePcmsWork({timeoutMs:2000});
});
function refresherFixture({hangFirst=false,observe=false}={}){
 const f=apiFixture(),held=barrier(),reads=[],completions=[],samples=[];
 let time=2_000_000,mono=1000,id=0,expired=false;
 const state={rows:[1,2,3].map(i=>({stableId:'stable_0'+i,slug:'f2-generator-'+i,
  accountId:'account_0'+i,personaUid:'persona_0'+i,identityHeld:false,ownerVerified:true,
  ordinal:i,metrics:{nextDueAt:0}})),accounts:Object.fromEntries([1,2,3].map(i=>['account_0'+i,{
   verifiedIdentity:true,personaUid:'persona_0'+i,bindingVersion:1,principalFingerprint:FP}])),
  recent:{nextDueAt:0,suspended:false,complete:true,observedAt:2_000_000},policy:{refreshEnabled:false}};
 const store={read:async()=>({ok:true,state}),turn:async args=>{
  if(args.browserClock)samples.push(structuredClone(args.browserClock));
  return {ok:true,revision:2,state:{...state,nextWakeAt:time+60000,diagnostics:{}}};
 },claim:async args=>({ok:true,claim:{...args,accountId:args.preferredAccountId||state.rows.find(r=>r.stableId===args.stableId).accountId,
  personaUid:args.preferredAccountId?'persona_'+args.preferredAccountId.slice(-2):
   state.rows.find(r=>r.stableId===args.stableId).personaUid,principalFingerprint:FP,startedAt:time}}),
 complete:async claimId=>{completions.push(claimId);return {ok:!expired,accepted:!expired,code:expired?'CLAIM_NOT_FOUND':'OBSERVED'};}};
 const boundary=createRefresherBoundary(f.api,{open:async()=>({}),storeFactory:()=>store,
  newId:()=> 'fixture_epoch_'+(++id),clock:()=>time,monotonicClock:()=>mono,
  observationGate:()=>observe,browserClockGate:()=>true,observationMs:10,
  guard:()=>({getSafeRouteReadiness:async uid=>({ready:true,personaUid:uid,
   cookieStoreId:'container_'+uid,routeId:'route_'+uid,healthDomain:'health_'+uid}),
   observeMonitoring:async uid=>{
    reads.push(uid);if(uid==='persona_01'&&hangFirst)await held.promise;
    return {ok:true,complete:true,principalFingerprint:FP,items:[]};
   }})});
 return {...f,boundary,state,reads,completions,samples,release:held.release,
  advance:ms=>{time+=ms;mono+=ms;},expire:()=>{expired=true;}};
}
test('F2 expired canonical observation claims cannot take over a still-running account read',async()=>{
 const f=refresherFixture({hangFirst:true,observe:true});
 try{
  assert.equal((await f.boundary.tick()).ok,true);
  assert.equal(f.reads.filter(uid=>uid==='persona_01').length,1);
  assert.ok(f.completions.length>=1,'healthy independent claim completed');
  f.advance(120000);f.expire();
  await f.boundary.tick();
  assert.equal(f.reads.filter(uid=>uid==='persona_01').length,1);
  assert.ok(f.reads.includes('persona_03'),'later healthy account remains reachable');
 }finally{f.release();}
 await settlePcmsWork({timeoutMs:2000});
 assert.equal(new Set(f.completions).size,f.completions.length,'late claim is completed at most once');
});
test('F2 short restore preparation and cancellation breaks prospective active-time evidence',async()=>{
 const f=refresherFixture();
 assert.equal((await f.boundary.tick()).ok,true);
 f.advance(30000);f.data.set('pcmsRestoreInProgress',{active:true,status:'PREPARING'});
 assert.equal((await f.boundary.tick()).code,'RESTORE_HOLD');
 f.data.delete('pcmsRestoreInProgress');f.advance(30000);
 assert.equal((await f.boundary.tick()).ok,true);
 const [previous,next]=f.samples;assert.notEqual(previous.runtimeEpoch,next.runtimeEpoch);
 const accounts=Object.entries(f.state.accounts).map(([accountId,a])=>({accountId,...a}));
 const held=qualifyBrowserObservedInterval({previous,next,bootId:'fixture_boot_01',id:'fixture_interval_01',
  recent:f.state.recent,accounts});
 assert.equal(held.creditedMs,0);
 // A new, actually observed matching interval can earn prospective credit.
 f.advance(60000);await f.boundary.tick();
 const resumed=qualifyBrowserObservedInterval({previous:next,next:f.samples[2],
  bootId:'fixture_boot_01',id:'fixture_interval_02',recent:f.state.recent,accounts});
 assert.equal(resumed.creditedMs,60000);
});
