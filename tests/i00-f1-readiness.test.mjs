import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedReadinessCoordinator,READINESS_RECEIPT,BRIDGE_RECOVERY_RECEIPT,publishNativeReadiness,subscribeProtectedReadiness} from '../src/runtime/protected-readiness.mjs';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';
function fixture(count=3,{saved=null,check=async()=>({ok:true}),host={installed:true,compatible:true,ready:true},observationMs=40000}={}){
 let now=100000,listener;const data=saved?{[READINESS_RECEIPT]:saved}:{},alarms=new Map(),holds=[],holdFences=[],calls=[];
 const accounts=Array.from({length:count},(_,i)=>({accountId:'account_'+String(i).padStart(5,'0'),personaUid:'persona-'+String(i).padStart(5,'0'),
  bindingId:'binding_'+String(i).padStart(5,'0'),state:'VERIFIED',route:{status:'PINNED'}}));
 const event={addListener(){}};
 const api={storage:{local:{get:async k=>({[k]:structuredClone(data[k])}),set:async v=>Object.assign(data,structuredClone(v))},onChanged:event},
  alarms:{get:async k=>alarms.get(k),create:async(k,v)=>alarms.set(k,{scheduledTime:v.when}),onAlarm:event},runtime:{onStartup:event,onInstalled:event}};
 const coordinator=createProtectedReadinessCoordinator(api,{clock:()=>now,observationMs,list:async()=>({ok:true,accounts}),
  connection:async()=>host,check:async id=>{calls.push(id);return check(id)},hold:(id,code,accountId,current)=>{holds.push(id);holdFences.push(current)},subscribe:fn=>{listener=fn;return ()=>{}}});
 return {coordinator,accounts,data,alarms,holds,holdFences,calls,host,advance:ms=>now+=ms,event:e=>listener(e)};
}
test('F1 readiness: delayed donor stays closed; compatible stopped donor starts one account at a time; all 50 independent accounts get a turn',async()=>{
 let active=0,max=0;const h=fixture(50,{host:{installed:false,compatible:false,ready:false,code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE'},
  check:async id=>{active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return id.endsWith('00001')?{ok:false,code:'EXIT_DRIFT_CONFLICT'}:{ok:true}}});
 assert.equal((await h.coordinator.turn()).ok,false);assert.equal(h.calls.length,0);
 assert.equal(h.data[READINESS_RECEIPT].pending.length,50);assert.equal(h.data[READINESS_RECEIPT].checkpoint,'WAITING_FOR_DONOR');
 assert.equal(h.data[READINESS_RECEIPT].nextSafeRetry,101000,'cold donor setup gets a prompt read-only retry before long outage backoff');
 Object.assign(h.host,{installed:true,compatible:true});h.advance(60000);
 for(let i=0;i<13;i++)await h.coordinator.turn();
 assert.equal(new Set(h.calls).size,50);assert.equal(h.calls.length,50);assert.equal(max,1,'only donor may bring up the stopped tunnel, no burst');
 assert.equal(h.data[READINESS_RECEIPT].pending.length,0);
});
test('F1 readiness: idle stop remains idle with no due work; a protected demand safely requests its own account without dashboard or global polling',async()=>{
 const h=fixture();await h.coordinator.turn();assert.equal(h.calls.length,3);h.coordinator.register();await h.coordinator.turn();
 h.event({kind:'NATIVE_CHANGED',ready:false,idle:true});assert.equal(h.holds.length,3);
 await h.coordinator.wake({fallback:true});assert.equal(h.calls.length,3,'periodic idle checks do not keep tunnel alive');
 await h.coordinator.wake({personaUid:h.accounts[1].personaUid});assert.equal(h.calls.length,4);assert.equal(h.calls.at(-1),h.accounts[1].accountId);
 const saved=structuredClone(h.data[READINESS_RECEIPT]);
 const cold=fixture(3,{saved});cold.coordinator.register();await cold.coordinator.turn();
 cold.event({kind:'NATIVE_CHANGED',ready:false});await cold.coordinator.turn();assert.equal(cold.calls.length,0,'cold background preserves intentional idle stop');
});
test('F1 readiness: cold worker resumes durable pending checks without startup; concurrent wakeups coalesce and recovered host cannot clear unsafe account state',async()=>{
 let finish;const gate=new Promise(r=>finish=r);
 const h=fixture(1,{saved:{schema:1,lastSuccess:12,pending:[{accountId:'account_00000',attempts:2,nextRetry:0,lastAttempt:0}]},check:async()=>{await gate;return {ok:false,code:'EXIT_DRIFT_CONFLICT'}}});
 const first=h.coordinator.turn(),second=h.coordinator.turn();assert.equal(first,second);
 await new Promise(r=>setImmediate(r));finish();await first;
 assert.equal(h.calls.length,1);assert.equal(h.data[READINESS_RECEIPT].lastSuccess,12);
 assert.equal(h.data[READINESS_RECEIPT].failureCode,'EXIT_DRIFT_CONFLICT');assert.equal(h.data[READINESS_RECEIPT].scope,'account_00000');
});
test('F1 native wake bus coalesces meaningful changes and excludes native secrets and endpoint data',()=>{
 const events=[],off=subscribeProtectedReadiness(e=>events.push(e));
 try{
  const status={installed:true,compatible:true,ready:true,interface_up:true,base_proxy_reachable:true,
   active_exits:[{password:'private-token',local_port:5555}],error:'sensitive provider error'};
  publishNativeReadiness(status);publishNativeReadiness({...status,error:'other private error'});
  assert.equal(events.length,1);assert.equal(JSON.stringify(events).includes('private'),false);assert.equal(JSON.stringify(events).includes('5555'),false);
  publishNativeReadiness({...status,ready:false},{idle:true});assert.equal(events.length,2);assert.equal(events[1].idle,true);
 }finally{off()}
});
test('F1 readiness: a hung account observer remains owned while independent accounts progress and future wakes do not duplicate it',async()=>{
 let finish,calls=0;const gate=new Promise(r=>finish=r),h=fixture(3,{observationMs:20,
  check:async id=>{if(id==='account_00000'){calls++;await gate;}return {ok:true}}});
 try{
  const first=await h.coordinator.turn();assert.equal(first.checked,3);assert.equal(first.ok,false);
  assert.equal(h.data[READINESS_RECEIPT].failureCode,'ROUTE_OBSERVATION_TIMEOUT');assert.equal(h.data[READINESS_RECEIPT].pending.length,1);
  h.advance(60000);await h.coordinator.turn();assert.equal(calls,1,'actual timed-out work retains ownership');
 }finally{finish();await new Promise(r=>setImmediate(r));}
 h.advance(60000);await h.coordinator.turn();assert.equal(calls,2);assert.equal(h.data[READINESS_RECEIPT].pending.length,0);
});
test('F1 admission waits for existing readiness work and independently rechecks donor facts; a completed hint alone grants nothing',async()=>{
 let pinned=false,healthy=false,repair=true,wakes=0,finish;const gate=new Promise(r=>finish=r);
 const off=subscribeProtectedReadiness(e=>{
  if(e.kind!=='DEMAND')return;wakes++;return gate.then(()=>{if(repair){pinned=true;healthy=true;}});
 });
 const guard=createPersonaGuard({initialize:async()=>{},securityState:{ready:true,privacySafe:true},
  shared:{resolve:async personaUid=>({personaUid,cookieStoreId:'fixture-context',routeId:'fixture-route',pcmsBindingId:'binding_fixture',route:{enabled:true}}),
   acquire:async()=>{},validate:async()=>{},release:async()=>{}},pinGate:()=>({allow:pinned}),getRouteTest:async()=>({ok:healthy})});
 try{
  assert.equal((await guard.getSafeRouteReadiness('persona-fixture',{recover:false})).ready,false);assert.equal(wakes,0);
  const waiting=guard.getSafeRouteReadiness('persona-fixture');await new Promise(r=>setImmediate(r));assert.equal(wakes,1);
  finish();assert.equal((await waiting).ready,true);
  pinned=false;healthy=false;repair=false;assert.equal((await guard.getSafeRouteReadiness('persona-fixture')).ready,false);
 }finally{finish();off();}
});
test('F1 recovery generation: a delayed dependency-hold writer becomes stale when a newer native observation arrives',async()=>{
 const h=fixture(1);h.coordinator.register();await h.coordinator.turn();
 h.event({kind:'NATIVE_CHANGED',ready:false,idle:true});
 assert.equal(h.holdFences[0](),true);
 h.event({kind:'NATIVE_CHANGED',ready:true});assert.equal(h.holdFences[0](),false);
 await h.coordinator.turn();
});

test('F5 bridge loss: donor-only restart occurs once after two unhealthy observations and independent healthy readback',async()=>{
 const host={installed:true,compatible:true,ready:false,tunnelUp:true,
  proxyReachable:false,code:'MULLVAD_PROXY_UNREACHABLE'};
 const entries={},alarms=new Map();let restarted=0,checks=0;
 const api={storage:{local:{get:async k=>({[k]:entries[k]}),
  set:async values=>Object.assign(entries,structuredClone(values))}},
  alarms:{get:async k=>alarms.get(k),create:async(k,v)=>alarms.set(k,v)}};
 const c=createProtectedReadinessCoordinator(api,{
  clock:()=>100000,list:async()=>({ok:true,accounts:[{accountId:'account_fixture01',
   personaUid:'persona-fixture01',bindingId:'binding_fixture01',state:'VERIFIED',route:{status:'HELD'}}]}),
  connection:async()=>({...host}),check:async()=>{checks++;return {ok:true}},
  repairBridge:async()=>{restarted++;Object.assign(host,{ready:true,tunnelUp:true,proxyReachable:true,code:null});return {ok:true}}});
 const first=await c.turn();
 assert.equal(first.ok,true);assert.equal(restarted,1);assert.equal(checks,1);
 assert.equal(entries[BRIDGE_RECOVERY_RECEIPT].phase,'OBSERVED_RECOVERED');
 await c.turn();assert.equal(restarted,1,'healthy bridge is not restarted');
});
test('F5 ambiguous shared restart is fenced across cold workers, no blind second restart',async()=>{
 const store={},host={installed:true,compatible:true,ready:false,tunnelUp:false,
  proxyReachable:false,code:'MULLVAD_TUNNEL_UNAVAILABLE'};
 let mutations=0;
 const api={storage:{local:{get:async k=>({[k]:store[k]}),
  set:async values=>Object.assign(store,structuredClone(values))}},
  alarms:{get:async()=>null,create:async()=>{}}};
 const opts={clock:()=>100000,list:async()=>({ok:true,accounts:[{accountId:'account_fixture02',
  personaUid:'persona-fixture02',bindingId:'binding_fixture02',state:'VERIFIED',route:{status:'HELD'}}]}),
  connection:async()=>({...host}),check:async()=>{throw Error('must hold')},
  repairBridge:async()=>{mutations++;return {ok:false,code:'MULLVAD_RESTART_UNCONFIRMED'}}};
 assert.equal((await createProtectedReadinessCoordinator(api,opts).turn()).code,'MULLVAD_BRIDGE_RECOVERY_UNCERTAIN');
 assert.equal(mutations,1);assert.equal(store[BRIDGE_RECOVERY_RECEIPT].phase,'HELD');
 assert.equal((await createProtectedReadinessCoordinator(api,opts).turn()).code,'MULLVAD_BRIDGE_RECOVERY_UNCERTAIN');
 assert.equal(mutations,1);
});
