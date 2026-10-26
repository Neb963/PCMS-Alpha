import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedReadinessCoordinator,READINESS_RECEIPT,publishNativeReadiness,subscribeProtectedReadiness} from '../src/runtime/protected-readiness.mjs';
function fixture(count=3,{saved=null,check=async()=>({ok:true}),host={installed:true,compatible:true,ready:true}}={}){
 let now=100000,listener;const data=saved?{[READINESS_RECEIPT]:saved}:{},alarms=new Map(),holds=[],calls=[];
 const accounts=Array.from({length:count},(_,i)=>({accountId:'account_'+String(i).padStart(5,'0'),personaUid:'persona-'+String(i).padStart(5,'0'),
  bindingId:'binding_'+String(i).padStart(5,'0'),state:'VERIFIED',route:{status:'PINNED'}}));
 const event={addListener(){}};
 const api={storage:{local:{get:async k=>({[k]:structuredClone(data[k])}),set:async v=>Object.assign(data,structuredClone(v))},onChanged:event},
  alarms:{get:async k=>alarms.get(k),create:async(k,v)=>alarms.set(k,{scheduledTime:v.when}),onAlarm:event},runtime:{onStartup:event,onInstalled:event}};
 const coordinator=createProtectedReadinessCoordinator(api,{clock:()=>now,list:async()=>({ok:true,accounts}),
  connection:async()=>host,check:async id=>{calls.push(id);return check(id)},hold:id=>holds.push(id),subscribe:fn=>{listener=fn;return ()=>{}}});
 return {coordinator,accounts,data,alarms,holds,calls,host,advance:ms=>now+=ms,event:e=>listener(e)};
}
test('F1 readiness: delayed donor stays closed; compatible stopped donor starts one account at a time; all 50 independent accounts get a turn',async()=>{
 let active=0,max=0;const h=fixture(50,{host:{installed:false,compatible:false,ready:false,code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE'},
  check:async id=>{active++;max=Math.max(max,active);await new Promise(r=>setImmediate(r));active--;return id.endsWith('00001')?{ok:false,code:'EXIT_DRIFT_CONFLICT'}:{ok:true}}});
 assert.equal((await h.coordinator.turn()).ok,false);assert.equal(h.calls.length,0);
 assert.equal(h.data[READINESS_RECEIPT].pending.length,50);assert.equal(h.data[READINESS_RECEIPT].checkpoint,'WAITING_FOR_DONOR');
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
