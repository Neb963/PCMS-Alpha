import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefresherBoundary} from '../src/runtime/refresher-boundary.mjs';
const hash='a'.repeat(64);
function barrier(){let enter,release;return {entered:new Promise(r=>enter=r),
  wait:()=>{enter();return new Promise(r=>release=r)},release:()=>release()};}
function fixture(stage){
  const cut=barrier(),writes=[],alarms=new Map();let held=false,sequence=0,routeCalls=0;
  const accounts=Object.fromEntries([1,2].map(i=>['account_0'+i,{verifiedIdentity:true,
    personaUid:'persona_0'+i,bindingVersion:1,principalFingerprint:hash}]));
  const state={rows:[1,2].map(i=>({stableId:'stable_0'+i,slug:'fixture-'+i,
    accountId:'account_0'+i,personaUid:'persona_0'+i,identityHeld:false,ownerVerified:true,
    ordinal:i,metrics:{nextDueAt:0}})),accounts,
    recent:{nextDueAt:0,suspended:false},policy:{refreshEnabled:false}};
  const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
    storage:{local:{get:async key=>key==='pcmsRestoreInProgress'&&held?
      {[key]:{active:true,status:'PREPARING'}}:{},set:async()=>{}}},
    alarms:{get:async n=>alarms.get(n),create:async(n,p)=>alarms.set(n,{name:n,...p})}};
  let completed=0;
  const store={read:async()=>({ok:true,state}),turn:async()=>{
      writes.push('turn');return {ok:true,revision:2,state:{...state,nextWakeAt:2060000,diagnostics:{}}};},
    claim:async args=>{writes.push('claim');return {ok:true,claim:{...args,
      accountId:args.preferredAccountId||'account_02',
      personaUid:args.preferredAccountId?'persona_01':'persona_02',
      principalFingerprint:hash,startedAt:2000000}};},
    complete:async()=>{writes.push('complete');if(stage==='completion'&&++completed===1)await cut.wait();
      return {ok:true,accepted:true};}};
  const boundary=createRefresherBoundary(api,{open:async()=>{
      if(stage==='database')await cut.wait();return {};},
    storeFactory:()=>store,clock:()=>2000000,newId:()=> 'fixture_boot_'+(++sequence),
    browserClockGate:()=>stage==='clock',observationGate:()=>['observation','completion'].includes(stage),
    guard:()=>({getSafeRouteReadiness:async uid=>{
      if(++routeCalls===1&&['clock','observation'].includes(stage))await cut.wait();
      return {ready:true,personaUid:uid,cookieStoreId:'container_'+uid,routeId:'route_'+uid,healthDomain:uid};},
      observeMonitoring:async()=>({ok:true,complete:true,principalFingerprint:hash,items:[]})})});
  return {boundary,cut,writes,hold:()=>{held=true;}};
}
for(const stage of ['database','clock'])
 test('F1 restore beginning during Refresher '+stage+' acquisition prevents its later turn write',async()=>{
  const f=fixture(stage),pending=f.boundary.tick();
  await f.cut.entered;f.hold();f.cut.release();
  assert.equal((await pending).code,'RESTORE_HOLD');
  assert.deepEqual(f.writes,[]);
 });
test('F1 restore during fleet readiness prevents new canonical observation claims',async()=>{
 const f=fixture('observation'),pending=f.boundary.tick();
 await f.cut.entered;f.hold();f.cut.release();
 assert.equal((await pending).observation,'RESTORE_HOLD');
 assert.deepEqual(f.writes,['turn']);
});
test('F1 an admitted completion stays owned but restore prevents the next canonical completion',async()=>{
 const f=fixture('completion'),pending=f.boundary.tick();
 await f.cut.entered;f.hold();f.cut.release();
 assert.equal((await pending).observation,'RESTORE_HOLD');
 assert.deepEqual(f.writes,['turn','claim','claim','complete']);
});
test('F1 healthy Refresher still commits one turn and both independent observation receipts',async()=>{
 const f=fixture('healthy');assert.equal((await f.boundary.tick()).ok,true);
 assert.deepEqual(f.writes,['turn']);
 const observed=fixture('completion'),pending=observed.boundary.tick();
 await observed.cut.entered;observed.cut.release();assert.equal((await pending).ok,true);
 assert.deepEqual(observed.writes,['turn','claim','claim','complete','complete']);
});
