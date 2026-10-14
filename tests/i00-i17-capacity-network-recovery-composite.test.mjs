import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyShadow,reconcileShadow,observeCapacity,advanceShadow,claimObservation,
  effectiveCapacity,classifyProvider,HOUR,MINUTE} from '../src/runtime/refresher-core.mjs';
import {freezeSupply,moveSupply} from '../src/runtime/supply-plan.mjs';

const START=1700000000000;
const FINGERPRINT='c'.repeat(64);
const input=i=>{
  const a=String(i%50).padStart(3,'0');
  return {slug:'fleet-'+String(i).padStart(5,'0'),accountId:'account_'+a,
    personaUid:'persona_'+a,remoteId:'remote_'+String(i).padStart(8,'0'),
    bindingVersion:1,accountVerified:true,ownerVerified:true,
    releaseVerified:true,releaseFingerprint:FINGERPRINT,
    principalFingerprint:FINGERPRINT,listing:'PUBLIC'};
};
const take=(item,event,proof)=>{
  const next=moveSupply(item,event,proof);
  assert.equal(next.ok,true,next.code||event);
  return next.item;
};
test('P56-03 F/X: 1,000 fleet cap 200→180, 195 occupied, 429, cold wake and read budgets do not dispatch',()=>{
  const requests=Array.from({length:1000},(_,i)=>input(i));
  let state=reconcileShadow(emptyShadow(),requests).state;
  assert.equal(state.rows.length,1000);
  assert.equal(Object.keys(state.accounts).length,50);
  state.policy.manualCap=200;
  state.capacity.defensible=200;
  const occupiedIds=state.rows.slice(0,195).map(r=>r.stableId);
  for(const r of state.rows.slice(0,195)){
    r.slot=true;r.phase='ACTIVE';r.activeRemaining=24*HOUR;
  }
  const prior=state.rows.map(r=>[r.stableId,r.ordinal,r.activeRemaining]);
  for(const at of [START,START+10*MINUTE]){
    const observed=observeCapacity(state,{at,usablePositions:180,complete:true});
    assert.equal(observed.ok,true);
    state=observed.state;
  }
  assert.equal(state.capacity.defensible,180);
  const cap=effectiveCapacity(state,START+10*MINUTE);
  assert.equal(cap.cap,180);
  assert.equal(classifyProvider([
    {accountId:'account_001',domain:'route_001',routeVerified:true,observedAt:START,
      result:'RATE_LIMITED',retryAfterSeconds:3600},
    {accountId:'account_002',domain:'route_002',routeVerified:true,observedAt:START,
      result:'PROVIDER_UNAVAILABLE'}
  ],START).state,'SUSPECT');
  const wake=advanceShadow(state,{now:START+11*MINUTE,bootId:'cold_boot_0001'});
  assert.equal(wake.ok,true);
  state=wake.state;
  assert.equal(wake.providerEffects,'OFF');
  assert.equal(wake.changes.some(x=>x.code==='SHADOW_ADMITTED'),false);
  assert.equal(wake.occupied,195);
  assert.equal(state.diagnostics.admissions,0);
  assert.deepEqual(state.rows.map(r=>[r.stableId,r.ordinal,r.activeRemaining]),prior);
  assert.deepEqual(state.rows.filter(r=>r.slot).map(r=>r.stableId),occupiedIds);
  // Even a burst on a restart cannot create one read task per generator.
  const now=START+12*MINUTE;
  const admitted=claimObservation(state,{kind:'STATISTIC',
    stableId:state.rows[0].stableId,now,bootId:'cold_boot_0001',
    claimId:'read_claim_one'});
  assert.equal(admitted.ok,true,admitted.code);
  state=admitted.state;
  const second=claimObservation(state,{kind:'STATISTIC',
    stableId:state.rows[1].stableId,now,bootId:'cold_boot_0001',
    claimId:'read_claim_two'});
  assert.equal(second.ok,true,second.code);
  state=second.state;
  const blocked=claimObservation(state,{kind:'STATISTIC',
    stableId:state.rows[2].stableId,now,bootId:'cold_boot_0001',
    claimId:'read_claim_three'});
  assert.equal(blocked.code,'READ_BACKPRESSURE');
  assert.equal(state.inflight.length,2);
  const restarted=advanceShadow(state,{now:now+MINUTE,bootId:'cold_boot_0002'});
  assert.equal(restarted.ok,true);
  assert.equal(restarted.state.inflight.length,0);
  assert.equal(restarted.state.rows[0].metrics.nextDueAt>now+MINUTE,true);
  assert.equal(restarted.state.rows[1].metrics.nextDueAt>now+MINUTE,true);
  assert.equal(restarted.state.rows.filter(r=>r.slot).length,195);
  assert.equal(restarted.state.diagnostics.admissions,0);
  assert.equal(restarted.state.diagnostics.readPeak,2);
  assert.equal(restarted.providerEffects,'OFF');
});
test('P56-03 / P56-06 X: 40 frozen requests retain 18 confirmed remote identities through Git outage and 22 uncertain creates',()=>{
  const planned=freezeSupply({batchId:'batch_fleet_4001',
    accountId:'account_001',personaUid:'persona_001',
    accountRevision:2,bindingVersion:1,
    slugs:Array.from({length:40},(_,i)=>'planned-'+String(i).padStart(3,'0'))});
  assert.equal(planned.ok,true);
  let items=planned.batch.items;
  assert.equal(items.length,40);
  assert.equal(items.every(x=>x.state==='FROZEN'),true);
  const effectLedger=[],gitLedger=[];
  items=items.map((initial,i)=>{
    let item=take(initial,'CREATE_PREPARED',{operationId:'create_'+String(i).padStart(4,'0')});
    item=take(item,'CREATE_DISPATCH_POSSIBLE');
    effectLedger.push({itemId:item.itemId,kind:'CREATE',ack:i<18});
    if(i>=18){
      item=take(item,'CREATE_UNCERTAIN');
      return item;
    }
    item=take(item,'CREATE_OBSERVING');
    const temporarySlug='temp-'+String(i).padStart(3,'0');
    const remoteId='remote_created_'+String(i).padStart(4,'0');
    item=take(item,'CREATE_CONFIRMED',{source:'INDEPENDENT_READBACK',
      ownerMatches:true,privateEmpty:true,temporarySlug,remoteId});
    item=take(item,'RENAME_PREPARED',{operationId:'rename_'+String(i).padStart(4,'0')});
    item=take(item,'RENAME_DISPATCH_POSSIBLE');
    effectLedger.push({itemId:item.itemId,kind:'RENAME',ack:true});
    item=take(item,'RENAME_OBSERVING');
    item=take(item,'PROVIDER_CONFIRMED',{source:'INDEPENDENT_READBACK',
      ownerMatches:true,privateEmpty:true,slug:item.requestedSlug,
      previousSlug:temporarySlug,remoteId});
    item=take(item,'SOURCE_PENDING');
    item=take(item,'GIT_PREPARED',{operationId:'git_marker_'+String(i).padStart(4,'0')});
    item=take(item,'GIT_DISPATCH_POSSIBLE');
    gitLedger.push({itemId:item.itemId,action:'WRITE_POSSIBLE',ack:false});
    item=take(item,'GIT_UNCERTAIN');
    return item;
  });
  assert.equal(effectLedger.filter(x=>x.kind==='CREATE').length,40);
  assert.equal(effectLedger.filter(x=>x.kind==='RENAME').length,18);
  assert.equal(gitLedger.length,18);
  assert.equal(items.filter(x=>x.state==='GIT_UNCERTAIN').length,18);
  assert.equal(items.filter(x=>x.state==='CREATE_UNCERTAIN').length,22);
  assert(items.slice(0,18).every(x=>x.remoteId?.startsWith('remote_created_')&&
    x.folder===null));
  const replayed=items.map(item=>({
    id:item.itemId,
    createAttempt:moveSupply(item,'CREATE_PREPARED',{operationId:'replayed_0001'}),
    renameAttempt:moveSupply(item,'RENAME_PREPARED',{operationId:'replayed_0001'}),
    gitAttempt:moveSupply(item,'GIT_PREPARED',{operationId:'replayed_0001'})
  }));
  assert(replayed.every(row=>!row.createAttempt.ok&&!row.renameAttempt.ok&&!row.gitAttempt.ok));
  assert.equal(effectLedger.length,58,'no remote replay after arbitrary cold wake');
  assert.equal(gitLedger.length,18,'no duplicate marker writes after missing ACK');
});
