import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyShadow,reconcileShadow,advanceShadow,HOUR,MINUTE}
  from '../src/runtime/refresher-core.mjs';

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
