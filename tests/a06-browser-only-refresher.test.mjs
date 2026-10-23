import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyShadow,reconcileShadow,advanceShadow,HOUR,MINUTE}
  from '../src/runtime/refresher-core.mjs';
import {qualifyBrowserObservedInterval} from '../src/runtime/refresher-browser-clock.mjs';

const T=2_000_000_000, FP='a'.repeat(64);
const fixture=()=>reconcileShadow(emptyShadow(),[{
  slug:'a06-owned-public',accountId:'account_01',personaUid:'persona_01',
  bindingVersion:1,remoteId:'public_01',ownerVerified:true,
  accountVerified:true,principalFingerprint:FP,releaseVerified:true,
  releaseFingerprint:FP,listing:'PUBLIC'
}]).state;

test('A06 RED: legitimate 72h rest accrues after browser closes; no native witness required',()=>{
  const s=fixture(),r=s.rows[0];
  r.phase='SLEEPING';r.slot=false;r.sleepRemaining=72*HOUR;
  r.restCheckpointAt=T;
  const after=advanceShadow(s,{now:T+72*HOUR,bootId:'fresh_browser_epoch'});
  assert.equal(after.ok,true);
  assert.equal(after.state.rows[0].sleepRemaining,0,
    'rest must advance on elapsed wall time without native running intervals');
  assert.equal(after.state.rows[0].phase,'WAITING');
  assert.equal(after.state.rows[0].activeRemaining,24*HOUR);
});

test('A06 RED: wall-clock rollback must never manufacture rest credit',()=>{
  const s=fixture(),r=s.rows[0];
  r.phase='SLEEPING';r.slot=false;r.sleepRemaining=72*HOUR;
  r.restCheckpointAt=T;
  const after=advanceShadow(s,{now:T-MINUTE,bootId:'fresh_browser_epoch'});
  assert.equal(after.ok,true);
  assert.equal(after.state.rows[0].sleepRemaining,72*HOUR);
  assert.equal(after.state.rows[0].restCheckpointAt,T);
});

const route={
  ready:true,accountId:'account_01',personaUid:'persona_01',
  bindingVersion:1,principalFingerprint:FP,
  cookieStoreId:'firefox_container_01',
  routeId:'protected_route_01',healthDomain:'route_health_domain_01'
};
const sample=(at,mono=5_000,overrides={})=>({
  runtimeEpoch:'browser_epoch_01',observedAtMs:at,monotonicMs:mono,
  routes:[{...route}],...overrides
});
const credit=(before,after,more={})=>qualifyBrowserObservedInterval({
  previous:before,next:after,bootId:'browser_boot_01',id:'interval_0001',
  recent:{complete:true,suspended:false,observedAt:T},
  accounts:[{accountId:'account_01',personaUid:'persona_01',
    bindingVersion:1,principalFingerprint:FP,verifiedIdentity:true,
    paused:false}],...more
});

test('A06: Firefox monotonic and matching donor routes credit only observed active interval',()=>{
  const before=sample(T),after=sample(T+MINUTE,65_000);
  const proof=credit(before,after);
  assert.equal(proof.ok,true,JSON.stringify(proof));
  assert.equal(proof.receipt.origin,'A06_BROWSER_OBSERVED');
  assert.equal(proof.creditedMs,MINUTE);
  let s=fixture();
  s.rows[0].phase='ACTIVE';s.rows[0].slot=true;
  s.recent={...s.recent,complete:true,observedAt:T,suspended:false};
  const initial=advanceShadow(s,{now:T,bootId:'browser_boot_01',browserClock:before});
  assert.equal(initial.ok,true);
  const next=advanceShadow(initial.state,{now:T+MINUTE,bootId:'browser_boot_01',
    browserClock:after});
  assert.equal(next.ok,true);
  assert.equal(next.state.rows[0].activeRemaining,24*HOUR-MINUTE);
  assert.equal(next.state.timeline.at(-1).reason,'BROWSER_MONOTONIC_ELIGIBILITY');
});

test('A06: restart, suspension, route drift, incomplete feed and clock changes earn ZERO active time',()=>{
  const before=sample(T),after=sample(T+MINUTE,65_000);
  const cases=[
    credit(before,sample(T+MINUTE,65_000,{runtimeEpoch:'browser_epoch_02'})),
    credit(before,sample(T+MINUTE,65_000,{routes:[]})),
    credit(before,sample(T+MINUTE,65_000,{routes:[{...route,routeId:'protected_route_02'}]})),
    credit(before,sample(T+MINUTE,65_000,{routes:[{...route,
      principalFingerprint:'b'.repeat(64)}]})),
    credit(before,sample(T+MINUTE,5_000)),
    credit(before,sample(T+MINUTE,10_000)),
    credit(before,sample(T+91_000,96_000)),
    credit(before,after,{recent:{complete:false,observedAt:T}}),
    credit(before,after,{recent:{complete:true,observedAt:T+1}}),
    credit(before,after,{accounts:[{accountId:'account_01',personaUid:'persona_01',
      bindingVersion:1,principalFingerprint:FP,verifiedIdentity:true,paused:true}]})
  ];
  for(const [i,result] of cases.entries())assert.equal(result.creditedMs,0,
    'unsafe interval '+i+': '+JSON.stringify(result));

  const s=fixture();s.rows[0].phase='ACTIVE';s.rows[0].slot=true;
  s.recent={...s.recent,complete:true,observedAt:T,suspended:false};
  const initial=advanceShadow(s,{now:T,bootId:'browser_boot_01',
    browserClock:before});
  const cold=advanceShadow(initial.state,{now:T+72*HOUR,bootId:'new_browser_boot',
    browserClock:sample(T+72*HOUR,5000,{runtimeEpoch:'new_epoch_01'})});
  assert.equal(cold.ok,true);
  assert.equal(cold.state.rows[0].activeRemaining,24*HOUR);
});

test('A06: sleeping row keeps rest across interrupted/reopened turns, but never accumulates active time',()=>{
  const s=fixture();const r=s.rows[0];
  r.phase='SLEEPING';r.sleepRemaining=72*HOUR;r.restCheckpointAt=T;
  let turn=advanceShadow(s,{now:T+24*HOUR,bootId:'browser_boot_01'});
  assert.equal(turn.ok,true);
  assert.equal(turn.state.rows[0].sleepRemaining,48*HOUR);
  const replay=advanceShadow(turn.state,{now:T+24*HOUR,bootId:'browser_boot_01'});
  assert.equal(replay.state.rows[0].sleepRemaining,48*HOUR);
  turn=advanceShadow(replay.state,{now:T+72*HOUR,bootId:'browser_boot_02'});
  assert.equal(turn.ok,true);
  assert.equal(turn.state.rows[0].sleepRemaining,0);
  assert.equal(turn.state.rows[0].phase,'WAITING');
  assert.equal(turn.state.rows[0].activeRemaining,24*HOUR);
});
