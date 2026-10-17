import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';

const context={personaUid:'persona_001',cookieStoreId:'firefox-container-001',
 routeId:'protected_route_001',route:{id:'protected_route_001',enabled:true},
 archived:false,rotating:false};
function harness(){
 let state={...context},calls=0,mutation=false,proof={source:'DONOR_FIXED_PROBE',
   routeId:context.routeId,contextId:context.cookieStoreId,
   ipv4:{state:'VERIFIED',address:'45.66.77.88'},
   ipv6:{state:'VERIFIED',address:'2a01:4f8:1c1c::1'},dns:'VERIFIED_PROTECTED',
   protection:'READY',disposition:'HOLD_TTL_UNQUALIFIED'};
 const g=createPersonaGuard({initialize:async()=>{},securityState:{
  ready:true,privacySafe:true,proxyControl:'controllable'},shared:{
  resolve:async()=>{calls++;if(mutation&&calls===2)state={...state,routeId:'route_changed_001'};
    return state;},acquire:async()=>({}),validate:async()=>({}),release:async()=>({})},
  getRouteTest:async()=>({ok:false}),
  verifyFixedCandidate:async ({routeId,contextId})=>{
    assert.equal(routeId,context.routeId);assert.equal(contextId,context.cookieStoreId);
    return proof;
  }
 });
 return {g,mutate:()=>{mutation=true;},setProof:v=>{proof=v}};
}
test('S01 private donor fixed verifier reports dual-family measurement but never admission',async()=>{
 const h=harness();
 const result=await h.g.verifyProtectedCandidate({personaUid:context.personaUid,
   contextId:context.cookieStoreId,routeId:context.routeId});
 assert.deepEqual(result,{ok:true,familiesObserved:true,
   admission:'HELD_TTL_UNQUALIFIED',providerEffects:'OFF'});
 assert.equal(h.g.getHealth().admission,'HELD_UNTIL_OWNER_VERIFICATION');
});
test('S01 fixed candidate fails if native response is incomplete or route changes while awaiting',async()=>{
 const h=harness();
 h.setProof({source:'DONOR_FIXED_PROBE',routeId:context.routeId,
  contextId:context.cookieStoreId,ipv4:{state:'VERIFIED'},ipv6:{state:'UNKNOWN'}});
 assert.equal((await h.g.verifyProtectedCandidate({personaUid:context.personaUid,
  contextId:context.cookieStoreId,routeId:context.routeId})).code,'NATIVE_FAMILY_PROOF_INCOMPLETE');
 const late=harness();late.mutate();
 assert.equal((await late.g.verifyProtectedCandidate({personaUid:context.personaUid,
  contextId:context.cookieStoreId,routeId:context.routeId})).code,'NATIVE_CANDIDATE_CONTEXT_CHANGED');
});
