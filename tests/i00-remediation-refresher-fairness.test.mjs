import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefresherBoundary} from '../src/runtime/refresher-boundary.mjs';
const fp='c'.repeat(64);
function fixture(n,{rows=[],recentDue=false}={}){
  const accounts=Object.fromEntries(Array.from({length:n},(_,i)=>{
    const id='account_'+String(i).padStart(4,'0');
    return [id,{verifiedIdentity:true,personaUid:'persona_'+i,bindingVersion:1,principalFingerprint:fp}];}));
  const state={accounts,rows,recent:{suspended:false,nextDueAt:recentDue?0:Infinity,endpointBackoffUntil:0},
    policy:{refreshEnabled:false},nextWakeAt:0,diagnostics:{}};
  const turns=[],claims=[],readiness=[];
  const event=()=>({addListener(){}});
  const api={runtime:{id:'f',getURL:p=>p,onStartup:event(),onInstalled:event(),onConnect:event()},
    alarms:{onAlarm:event(),create:async()=>{},get:async()=>null},
    storage:{local:{get:async()=>({}),set:async()=>{}}}};
  const store={read:async()=>({ok:true,state}),
    turn:async args=>{turns.push(args);return {ok:true,revision:2,state:{...state,nextWakeAt:Date.now()+60000}};},
    claim:async c=>{const a=c.kind==='RECENT'?c.preferredAccountId:rows.find(r=>r.stableId===c.stableId).accountId;
      claims.push({kind:c.kind,accountId:a});
      return {ok:true,claim:{claimId:c.claimId,kind:c.kind,accountId:a,personaUid:accounts[a].personaUid,
        principalFingerprint:fp,startedAt:c.now,slug:'s'}};},
    complete:async()=>({ok:true,accepted:true,changes:[]})};
  const guard=()=>({
    getSafeRouteReadiness:async uid=>{readiness.push(uid);return {ready:true,personaUid:uid,
      cookieStoreId:'c_'+uid,routeId:'r_'+uid,healthDomain:'d_'+uid};},
    sampleNativeWitness:async()=>({ok:true,witness:{sequence:1}}),
    observeMonitoring:async()=>({ok:true,complete:true,items:[],principalFingerprint:fp})});
  const boundary=createRefresherBoundary(api,{open:async()=>({}),storeFactory:()=>store,guard,
    observationGate:()=>true,nativeClockGate:()=>true,newId:()=> 'id_'+Math.random().toString(16).slice(2,14)});
  return {boundary,turns,claims,readiness};
}
test('Refresher fairness: >100 accounts all receive native route witnesses (no first-100 starvation)',async()=>{
  const f=fixture(150);
  await f.boundary.tick();
  const routes=f.turns[0].nativeClock.routes.map(r=>r.accountId);
  assert.equal(routes.length,150);
  assert.ok(routes.includes('account_0149'));
  // Readiness computed once per turn and shared by the observer.
  assert.equal(f.readiness.length,150);
});
test('Refresher fairness: a due generator on account #150 is observed; recent feed rotates accounts',async()=>{
  const row={stableId:'stable_0149',slug:'late-gen',accountId:'account_0149',personaUid:'persona_149',
    identityHeld:false,ownerVerified:true,metrics:{suspended:false,nextDueAt:0,demandUntil:0},ordinal:1};
  const f=fixture(150,{rows:[row],recentDue:true});
  await f.boundary.tick();
  assert.ok(f.claims.some(c=>c.kind==='STATISTIC'&&c.accountId==='account_0149'));
  const firstRecent=f.claims.find(c=>c.kind==='RECENT').accountId;
  await f.boundary.tick();
  const recents=f.claims.filter(c=>c.kind==='RECENT').map(c=>c.accountId);
  assert.equal(recents.length,2);assert.notEqual(recents[1],firstRecent);
});
