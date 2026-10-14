import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefresherBoundary,validateRefresherMessage} from '../src/runtime/refresher-boundary.mjs';

const H='a'.repeat(64),events=[];
function fixture({gate=false,changeRoute=false,lostReadback=false}={}){
  const history=[],row={stableId:'target_01',slug:'fixture-generator',accountId:'account_01',
    personaUid:'persona_01',bindingVersion:1,remoteId:'remote_01',slot:true,
    phase:'ACTIVE',ownerVerified:true,releaseVerified:true,releaseFingerprint:H,
    listing:'PUBLIC',identityHeld:false,reviewHeld:false,
    refresh:{intent:null,suspended:false,nextAttemptAt:0},metrics:{nextDueAt:999999999}};
  const state={rows:[row],accounts:{account_01:{verifiedIdentity:true,principalFingerprint:H}},
    recent:{nextDueAt:999999999,suspended:false}};
  const store={
    turn:async()=>({ok:true,revision:2,state:{nextWakeAt:180000,diagnostics:{turns:1}}}),
    read:async()=>({ok:true,state}),
    reserveAttempt:async()=>{history.push('reserve');return {ok:true,claim:{
      stableId:'target_01',slug:row.slug,id:'attempt_01',accountId:row.accountId,
      personaUid:row.personaUid,bindingVersion:1,principalFingerprint:H,releaseFingerprint:H}};},
    markDispatch:async()=>{history.push('dispatch');return {ok:true};},
    settleAttempt:async(_stable,_id,receipt)=>{history.push('settle');return {
      ok:true,proof:{effectVerified:receipt.kind==='EFFECT_CHANGED'&&receipt.targetMatched}};}
  };
  const api={runtime:{id:'test',onConnect:{addListener(){}},onStartup:{addListener(){}},
    onInstalled:{addListener(){}}},alarms:{onAlarm:{addListener(){}},
      create:async()=>{},get:async name=>({name})},
    storage:{local:{get:async()=>({}),set:async()=>{}}}};
  let calls=0;
  const guard=()=>({getSafeRouteReadiness:async()=>{
    calls++;return {ready:true,cookieStoreId:'container',routeId:changeRoute&&calls>2?
      'different':'protected',healthDomain:'unique_domain'};},
    observeMonitoring:async()=>{history.push('read');return {ok:false,code:'NOT_DUE'};}});
  const adapter={execute:async()=>{history.push('execute');},
    readback:async()=>{history.push('readback');
      if(lostReadback)throw Error('lost ACK');
      return {kind:'EFFECT_CHANGED',sourceFingerprint:'b'.repeat(64),
        targetMatched:true,principalMatched:true};}};
  const boundary=createRefresherBoundary(api,{open:async()=>({}),storeFactory:()=>store,
    clock:()=>100000,newId:()=> 'attempt_01',observationGate:()=>true,
    refreshGate:()=>gate,qualificationFor:()=>({status:'SUPPORTED_AND_VERIFIED',
      method:'EXPLICIT_PROVIDER_REFRESH',allowedByProvider:true,
      version:'synthetic_v1',sourceFingerprint:H,evidenceId:'fixture',
      meaningfulEffectVerified:true}),refreshAdapter:adapter,guard});
  return {boundary,history,api};
}
test('P54-05 F/X: production default gating denies all effect calls, even with a configured adapter',async()=>{
  const f=fixture();const result=await f.boundary.tick();
  assert.equal(result.ok,true);assert.equal(result.refresh,'REFRESH_ACTIVATION_HELD');
  assert.deepEqual(f.history,[]);
  for(const type of ['REFRESH','QUALIFY_METHOD','ENABLE_MUTATION','SUBMIT_PROOF']){
    assert.equal(validateRefresherMessage(f.api,{id:'test'},{type}).ok,false);
  }
});
test('P54-05 F: synthetic guarded lane journals before effect, then independently reads back',async()=>{
  const f=fixture({gate:true});const result=await f.boundary.tick();
  assert.equal(result.refresh,'EFFECT_INDEPENDENTLY_PROVEN');
  assert.deepEqual(f.history,['reserve','dispatch','execute','readback','settle']);
});
test('P54-05 / S6-I14-BOUND-RETRY X: changed protected route cancels before any dispatch',async()=>{
  const f=fixture({gate:true,changeRoute:true});const result=await f.boundary.tick();
  assert.equal(result.refresh,'REFRESH_ROUTE_CHANGED');
  assert.deepEqual(f.history,['reserve']);
});
test('P54-05 X: lost response after dispatch never causes duplicate provider execute',async()=>{
  const f=fixture({gate:true,lostReadback:true});const result=await f.boundary.tick();
  assert.equal(result.refresh,'REFRESH_EFFECT_HELD');
  assert.deepEqual(f.history,['reserve','dispatch','execute','readback','settle']);
});
