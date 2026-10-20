import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyBoundedObservedInterval} from '../src/runtime/refresher-qualified-clock.mjs';
import {emptyShadow,reconcileShadow,advanceShadow,validShadow,HOUR,MINUTE}
 from '../src/runtime/refresher-core.mjs';

const H='a'.repeat(64),T=2000000,boot='browser_boot_001';
const route={
 ready:true,accountId:'account_01',personaUid:'persona_01',bindingVersion:1,
 principalFingerprint:H,cookieStoreId:'firefox_container_01',
 routeId:'protected_route_01',healthDomain:'egress_'+ 'e'.repeat(64)
};
const sample=(sequence,now,options={})=>({
 observerEpoch:'observer_epoch_001',systemBootId:'system_boot_001',
 nativeLifetimeId:'native_lifetime_001',observerConnectionId:'native_pipe_001',
 sequence,observedAtMs:now,
 hostAwakeNs:String(3000000000+(now-T)*1000000),
 hostBootNs:String(3000000000+(now-T)*1000000),
 routes:[{...route}],...options
});
const recent={complete:true,suspended:false,observedAt:T+100};
const accounts=[{accountId:'account_01',personaUid:'persona_01',
 bindingVersion:1,principalFingerprint:H,verifiedIdentity:true,paused:false}];
const credit=(previous,next,changes={})=>qualifyBoundedObservedInterval({
 previous,next,recent,accounts,bootId:boot,id:'observed_window_001',...changes
});
test('S07 E04: real bounded feed/route/native observation counts awake minutes, not fabricated certificates',()=>{
 const before=sample(1,T),after=sample(2,T+MINUTE);
 const proof=credit(before,after);
 assert.equal(proof.ok,true,JSON.stringify(proof));
 assert.equal(proof.creditedMs,MINUTE-25);
 assert.equal(proof.receipt.origin,'S07_BOUNDED_OBSERVED');
 assert.deepEqual(proof.receipt.accounts.map(x=>x.accountId),['account_01']);
 const created=reconcileShadow(emptyShadow(),[{
   slug:'owned-generator',accountId:'account_01',personaUid:'persona_01',
   bindingVersion:1,remoteId:'generator_public_01',
   ownerVerified:true,accountVerified:true,principalFingerprint:H,
   releaseVerified:true,releaseFingerprint:H,listing:'PUBLIC'
 }]);
 assert.equal(created.ok,true);
 const state=created.state,r=state.rows[0];
 r.phase='ACTIVE';r.slot=true;r.activeRemaining=24*HOUR;
 state.recent={...state.recent,...recent};
 const first=advanceShadow(state,{now:T,bootId:boot,nativeClock:before});
 assert.equal(first.ok,true);
 const second=advanceShadow(first.state,{now:T+MINUTE,bootId:boot,nativeClock:after});
 assert.equal(second.ok,true);
 assert.equal(second.state.rows[0].activeRemaining,24*HOUR-MINUTE+25);
 assert.equal(second.state.timeline.at(-1).reason,'BOUNDED_GUARDED_ELIGIBILITY');
});
test('S07 E04: stale feed, route change, changed principal, pipe death, suspend and gap credit zero',()=>{
 const before=sample(1,T),after=sample(2,T+MINUTE);
 const bad=[
  {next:sample(2,T+MINUTE,{routes:[]})},
  {next:sample(2,T+MINUTE,{routes:[{...route,routeId:'other_protected_route'}]})},
  {next:sample(2,T+MINUTE,{routes:[{...route,principalFingerprint:'b'.repeat(64)}]})},
  {next:sample(2,T+MINUTE,{observerConnectionId:'native_pipe_changed'})},
  {next:sample(4,T+MINUTE)},
  {next:sample(2,T+MINUTE,{hostBootNs:String(3000000000+MINUTE*2000000)})},
  {next:sample(2,T+5*MINUTE,{hostAwakeNs:String(3000000000+5*MINUTE*1000000),
    hostBootNs:String(3000000000+5*MINUTE*1000000)})},
  {recent:{...recent,complete:false}},
  {recent:{...recent,observedAt:T-20*MINUTE}},
  {accounts:[{...accounts[0],paused:true}]}
 ];
 for(const change of bad){
   const result=credit(before,after,change);
   assert.equal(result.creditedMs,0,JSON.stringify(change));
 }
});

test('S07 state migration: pre-S07 saved scheduler policy has no implicit source mutation opt-in',()=>{
 const old=emptyShadow();
 delete old.policy.refreshEnabled;
 assert.equal(validShadow(old),true);
 assert.notEqual(old.policy.refreshEnabled,true);
 const turned=advanceShadow(old,{now:T,bootId:boot});
 assert.equal(turned.ok,true);
 assert.notEqual(turned.state.policy.refreshEnabled,true);
});

test('S07 E04: canonical feed receipts do not break native chain; explicit failed native observation does',()=>{
  const before=sample(1,T),after=sample(2,T+MINUTE);
  const s=emptyShadow();
  s.recent={...s.recent,complete:true,observedAt:T+10};
  const first=advanceShadow(s,{now:T,bootId:boot,nativeClock:before});
  assert.equal(first.ok,true);
  const unrelated=advanceShadow(first.state,{now:T+100,bootId:boot});
  assert.equal(unrelated.ok,true);
  assert.equal(unrelated.state.nativeClock.witness.sequence,1);
  const resumed=advanceShadow(unrelated.state,{now:T+MINUTE,
    bootId:boot,nativeClock:after});
  assert.equal(resumed.ok,true);
  assert.equal(resumed.state.nativeClock.witness.sequence,2);
  const lost=advanceShadow(first.state,{now:T+100,bootId:boot,nativeClock:null});
  assert.equal(lost.state.nativeClock,null);
});
