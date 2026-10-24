import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyShadow,reconcileShadow,advanceShadow,observeCapacity,effectiveCapacity,
  claimObservation,applyStatistic,classifyProvider,HOUR,MINUTE,validatePolicy,DEFAULT_POLICY} from '../src/runtime/refresher-core.mjs';
import {canonicalRefresherInputs} from '../src/runtime/refresher-store.mjs';
const boot='browser_boot_01',hash='b'.repeat(64),at=100000;
function fleet(n=1000,accounts=50){
  const inputs=Array.from({length:n},(_,i)=>({slug:'synthetic-'+String(i).padStart(4,'0'),
    accountId:'account_'+String(i%accounts).padStart(4,'0'),personaUid:'persona_'+i%accounts,
    bindingVersion:1,remoteId:'remote_'+String(i).padStart(8,'0'),
    ownerVerified:true,accountVerified:true,principalFingerprint:hash,
    releaseVerified:true,releaseFingerprint:hash,listing:'PUBLIC'}));
  const out=reconcileShadow(emptyShadow(),inputs);assert.equal(out.ok,true);
  return {s:out.state,inputs};
}
function receipt(s,from,to,{bad=[],provider='HEALTHY',id='receipt_interval_01',bootId=boot}={}){
  return {source:'GUARDED_OPERATIONAL_INTERVAL',browserRunning:true,complete:true,
    id,bootId,from,to,accounts:Object.entries(s.accounts).map(([accountId,a])=>({
      accountId,personaUid:a.personaUid,bindingVersion:a.bindingVersion,
      principalFingerprint:a.principalFingerprint,
      health:bad.includes(accountId)?'UNAVAILABLE':'HEALTHY',protected:true,sessionVerified:true})),
    witnesses:[0,1].map(i=>({accountId:'witness_'+i,domain:'independent_'+i,
      routeVerified:true,observedAt:to,result:provider==='HEALTHY'?'HEALTHY':
        provider==='OUTAGE'?'PROVIDER_UNAVAILABLE':'UNKNOWN'}))};
}
function advance(s,from,to,options={}){
  const x=advanceShadow(s,{now:to,bootId:options.bootId||boot,
    receipt:receipt(s,from,to,options)});assert.equal(x.ok,true);return x.state;
}
test('P54-01 F/X: 8 evidenced hours leaves exactly 16; shutdown and stale evidence freeze active only; wall rest continues',()=>{
  let {s}=fleet(2,2);s.rows[0].phase='ACTIVE';s.rows[0].slot=true;
  s.rows[1].phase='SLEEPING';s.rows[1].sleepRemaining=72*HOUR;
  s.rows[1].restCheckpointAt=at;
  s=advance(s,at,at+8*HOUR);
  assert.equal(s.rows[0].activeRemaining,16*HOUR);
  assert.equal(s.rows[1].sleepRemaining,64*HOUR);
  const remaining=s.rows.map(r=>[r.activeRemaining,r.sleepRemaining]);
  s=advanceShadow(s,{now:at+18*HOUR,bootId:'browser_boot_02'}).state;
  assert.equal(s.rows[0].activeRemaining,remaining[0][0]);
  assert.equal(s.rows[1].sleepRemaining,54*HOUR);
  s=advanceShadow(s,{now:at+18*HOUR+27*MINUTE,bootId:'browser_boot_02'}).state;
  assert.equal(s.rows[0].activeRemaining,remaining[0][0]);
  assert.equal(s.rows[1].sleepRemaining,54*HOUR-27*MINUTE);
  const stale=receipt(s,at+18*HOUR,at+19*HOUR,{bootId:boot});
  s=advanceShadow(s,{now:at+19*HOUR,bootId:'browser_boot_02',receipt:stale}).state;
  assert.equal(s.rows[0].activeRemaining,remaining[0][0]);
  assert.equal(s.rows[1].sleepRemaining,53*HOUR);
  assert.equal(s.timeline.at(-1).reason,'CLOCK_EVIDENCE_INCOMPLETE');
});
test('P54-01 F/X: replay/overlap/clock rollback cannot double-credit; continuous phase transitions exactly once',()=>{
  let {s}=fleet(2,2);s.rows[0].phase='ACTIVE';s.rows[0].slot=true;
  s.rows[0].activeRemaining=HOUR;s.rows[0].sleepMs=3*HOUR;
  s=advance(s,at,at+2*HOUR);
  assert.equal(s.rows[0].phase,'SLEEPING');assert.equal(s.rows[0].sleepRemaining,3*HOUR);
  assert.equal(s.rows[0].cycle,1);
  s=advance(s,at,at+2*HOUR);
  assert.equal(s.rows[0].sleepRemaining,3*HOUR);assert.equal(s.rows[0].cycle,1);
  s=advance(s,at+HOUR,at+3*HOUR);
  assert.equal(s.rows[0].sleepRemaining,2*HOUR);
  s=advanceShadow(s,{now:at+HOUR,bootId:boot,receipt:receipt(s,at,at+HOUR)}).state;
  assert.equal(s.rows[0].sleepRemaining,2*HOUR);assert.equal(s.rows[0].cycle,1);
});
test('P54-02 F/X: 12 slots expire only after 35+25 evidenced grace minutes; offline/outage do not expire',()=>{
  let {s}=fleet(60,5);s.policy.manualCap=30;s.policy.initialCap=30;
  const bad='account_0000';
  for(const r of s.rows.filter(r=>r.accountId===bad)){r.phase='ACTIVE';r.slot=true;r.activeRemaining=10*HOUR;}
  const old=s.rows.filter(r=>r.slot).map(r=>[r.stableId,r.ordinal,r.activeRemaining]);
  s=advance(s,at,at+35*MINUTE,{bad:[bad]});
  assert.equal(s.accounts[bad].graceUsed,35*MINUTE);assert.equal(s.rows.filter(r=>r.accountId===bad&&r.slot).length,12);
  s=advanceShadow(s,{now:at+35*MINUTE+4*HOUR,bootId:'browser_boot_02'}).state;
  s=advance(s,at+35*MINUTE+4*HOUR,at+65*MINUTE+4*HOUR,{bad:[bad],provider:'OUTAGE',bootId:'browser_boot_02'});
  assert.equal(s.accounts[bad].graceUsed,35*MINUTE);assert.equal(s.rows.filter(r=>r.accountId===bad&&r.slot).length,12);
  s=advance(s,at+65*MINUTE+4*HOUR,at+90*MINUTE+4*HOUR,{bad:[bad],bootId:'browser_boot_02'});
  assert.equal(s.accounts[bad].graceUsed,HOUR);assert.equal(s.rows.filter(r=>r.accountId===bad&&r.slot).length,0);
  assert.deepEqual(s.rows.filter(r=>r.accountId===bad).map(r=>[r.stableId,r.ordinal,r.activeRemaining]),old);
  assert.equal(s.diagnostics.graceReleases,12);
  const released=s.diagnostics.graceReleases;
  s=advance(s,at+65*MINUTE+4*HOUR,at+90*MINUTE+4*HOUR,{bad:[bad],bootId:'browser_boot_02'});
  assert.equal(s.diagnostics.graceReleases,released);
});
test('P54-03 / S6-I12-DISPATCH-STAGGER F: oldest eligible order, retained priority, one per account, bounded admissions',()=>{
  let {s,inputs}=fleet();s.rows[0].readyUpdate=true;s.rows[1].paused=true;
  s.rows.reverse();s=advance(s,at,at+MINUTE);
  const admitted=s.rows.filter(r=>r.slot).sort((a,b)=>a.ordinal-b.ordinal);
  assert.deepEqual(admitted.map(r=>r.ordinal),[3,4,5,6]);
  assert.deepEqual(admitted.map(r=>r.admittedAt),[at+MINUTE,at+MINUTE+1000,at+MINUTE+2000,at+MINUTE+3000]);
  const first=s.rows.find(r=>r.ordinal===1);assert.equal(first.slot,false);
  const preserved=s.rows.map(r=>[r.stableId,r.ordinal]).sort();
  s=reconcileShadow(s,[...inputs].reverse()).state;
  assert.deepEqual(s.rows.map(r=>[r.stableId,r.ordinal]).sort(),preserved);
});
test('P54-03 / P54-11 / S6-I12-SLEEP-LISTED F: per-target READY precedence does not stop wall-clock rest',()=>{
  let {s,inputs}=fleet(3,3);s.rows[0].phase='SLEEPING';s.rows[0].sleepRemaining=22*HOUR;
  s.rows[0].restCheckpointAt=at;
  inputs[0].readyUpdate=true;inputs[0].reviewHeld=true;inputs[0].listing='UNLISTED';
  s=reconcileShadow(s,inputs).state;s=advance(s,at,at+HOUR);
  assert.equal(s.rows[0].sleepRemaining,21*HOUR);assert.equal(s.rows[0].slot,false);
  assert.ok(s.rows.slice(1).some(r=>r.slot));
  inputs[0].reviewHeld=false;inputs[0].listing='PUBLIC';inputs[0].readyUpdate=false;
  s=reconcileShadow(s,inputs).state;s=advance(s,at+HOUR,at+2*HOUR);
  assert.equal(s.rows[0].sleepRemaining,20*HOUR);assert.equal(s.rows[0].listing,'PUBLIC');
});
test('P54-04 F/X: demand 250 is no slot promise; 195 incumbents survive cap 180; noise and stale windows labeled',()=>{
  let {s}=fleet();s.policy.manualCap=200;s.capacity.defensible=200;
  for(const r of s.rows.slice(0,195)){r.phase='ACTIVE';r.slot=true;}
  assert.equal(effectiveCapacity(s,at).demand,250);
  s=observeCapacity(s,{at,usablePositions:180,complete:true}).state;
  assert.equal(s.capacity.defensible,200);
  s=observeCapacity(s,{at:at+10*MINUTE,usablePositions:180,complete:true}).state;
  assert.equal(s.capacity.defensible,180);
  s=advance(s,at+10*MINUTE,at+11*MINUTE);
  assert.equal(s.rows.filter(r=>r.slot).length,195);
  assert.equal(effectiveCapacity(s,at+60*MINUTE).warning,'CAPACITY_STALE');
  assert.equal(observeCapacity(s,{at:at+10*MINUTE,usablePositions:283,complete:true}).code,'STALE_OBSERVATION');
  assert.equal(observeCapacity(s,{at:at+20*MINUTE,usablePositions:300,complete:false}).ok,false);
});
test('P54-08 F/X: one local bottleneck or 429 never corroborates provider-wide outage',()=>{
  const w={accountId:'account_test',routeVerified:true,domain:'same_local_proxy',observedAt:at,result:'PROVIDER_UNAVAILABLE'};
  assert.equal(classifyProvider([w,{...w,accountId:'account_other'}],at).state,'SUSPECT');
  assert.equal(classifyProvider([{...w,result:'RATE_LIMITED'},{...w,domain:'second_route',result:'LOCAL_ERROR'}],at).state,'UNKNOWN');
  assert.equal(classifyProvider([w,{...w,domain:'independent_route'}],at).state,'OUTAGE');
  assert.equal(classifyProvider([{...w,observedAt:at-1}],at).state,'UNKNOWN');
});
test('P54-10 F/X: absolute views 1200→1207→900; resets, stale replies, rebinding and bounded retention',()=>{
  let {s}=fleet(1,1);const r=s.rows[0],c={stableId:r.stableId,bindingVersion:1,personaUid:r.personaUid,remoteId:r.remoteId};
  for(const [i,views] of [1200,1207,900].entries()){
    const t=at+i*MINUTE;s=applyStatistic(s,{...c,startedAt:t},
      {views,observedAt:t,unit:'VIEWS',source:'GUARDED_READ_ONLY'},t).state;
  }
  assert.equal(s.rows[0].metrics.latest.views,900);assert.equal(s.rows[0].metrics.latest.correction,true);
  assert.equal(s.rows[0].metrics.latest.delta,null);assert.equal(s.rows[0].metrics.raw[1].delta,7);
  assert.equal(applyStatistic(s,{...c,startedAt:at},{views:9999,observedAt:at,unit:'VIEWS',source:'GUARDED_READ_ONLY'},at+3*MINUTE).ok,false);
  assert.equal(applyStatistic(s,{...c,bindingVersion:2,startedAt:at+3*MINUTE},{views:99,observedAt:at+3*MINUTE,unit:'VIEWS',source:'GUARDED_READ_ONLY'},at+3*MINUTE).ok,false);
  for(let i=3;i<50;i++){const t=at+i*MINUTE;s=applyStatistic(s,{...c,startedAt:t},
    {views:900+i,observedAt:t,unit:'VIEWS',source:'GUARDED_READ_ONLY'},t).state;}
  assert.equal(s.rows[0].metrics.raw.length,12);
});
test('P51-07 / P54-10 F/X: shared recent/statistics quota, target coalescing, per-account and global read caps',()=>{
  let {s}=fleet();s.bootId=boot;
  const first=claimObservation(s,{kind:'RECENT',now:at,bootId:boot,claimId:'claim_recent_01'});
  assert.equal(first.ok,true);s=first.state;
  assert.equal(claimObservation(s,{kind:'RECENT',now:at,bootId:boot,claimId:'claim_recent_02'}).code,'OBSERVATION_COALESCED');
  const same=s.rows.find(r=>r.accountId===first.claim.accountId);
  assert.equal(claimObservation(s,{kind:'STATISTIC',stableId:same.stableId,now:at,bootId:boot,claimId:'claim_metric_01'}).ok,false);
  const other=s.rows.find(r=>r.accountId!==first.claim.accountId);
  const second=claimObservation(s,{kind:'STATISTIC',stableId:other.stableId,now:at,bootId:boot,claimId:'claim_metric_02'});
  assert.equal(second.ok,true);
  assert.equal(claimObservation(second.state,{kind:'STATISTIC',stableId:s.rows[2].stableId,now:at,bootId:boot,claimId:'claim_metric_03'}).code,'READ_BACKPRESSURE');
  s=second.state;s.inflight=[];s.readWindow.used=s.policy.readBudget;
  assert.equal(claimObservation(s,{kind:'RECENT',now:at,bootId:boot,claimId:'claim_recent_03'}).code,'SHARED_READ_BUDGET');
});
test('P54-07 F/X: interrupted or overdue reads coalesce to cooldown, never replay a 250-item backlog',()=>{
  let {s}=fleet();s.bootId=boot;
  const claim=claimObservation(s,{kind:'RECENT',now:at,bootId:boot,claimId:'crashed_recent_01'});
  s=claim.state;s=advanceShadow(s,{now:at+10*HOUR,bootId:'restarted_event_page'}).state;
  assert.equal(s.inflight.length,0);assert.ok(s.recent.nextDueAt>=at+10*HOUR+MINUTE);
  assert.equal(s.diagnostics.reads,1);assert.equal(s.rows.filter(r=>r.slot).length,0);
  assert.equal(s.rows.every(r=>r.activeRemaining===24*HOUR),true);
  assert.equal(s.dueIndex.length,1000);
});
test('P54-11 F/X: all three manual Pause scopes survive route/provider recovery; rebind invalidates release',()=>{
  let {s,inputs}=fleet(3,3);s.globalPause=true;s.accounts['account_0000'].paused=true;s.rows[0].paused=true;
  s.rows[0].phase='ACTIVE';s.rows[0].slot=true;s.rows[0].activeRemaining=10*HOUR;
  s=advance(s,at,at+HOUR);assert.equal(s.rows[0].activeRemaining,10*HOUR);
  s.globalPause=false;s=advance(s,at+HOUR,at+2*HOUR);assert.equal(s.rows[0].activeRemaining,10*HOUR);
  s.accounts['account_0000'].paused=false;s=advance(s,at+2*HOUR,at+3*HOUR);assert.equal(s.rows[0].activeRemaining,10*HOUR);
  inputs[0].bindingVersion=2;inputs[0].personaUid='persona_replaced';
  s=reconcileShadow(s,inputs).state;assert.equal(s.rows[0].identityHeld,true);assert.equal(s.rows[0].releaseVerified,false);
  assert.equal(s.rows[0].paused,true);
});
test('I12 canonical seam: PUBLIC inventory, manual owner override and unconfirmed release never confer eligibility',()=>{
  const account={accountId:'account_test',personaUid:'persona_test',bindingVersion:1,state:'VERIFIED',
    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:hash}};
  const generator={slug:'test-gen',accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,
    remoteId:'remote_test',ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
  const records=[{key:'account:account_test',account},{key:'inventory:test-gen',generator}];
  assert.equal(canonicalRefresherInputs(records)[0].releaseVerified,false);
  const release={slug:'test-gen',accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,
    remoteId:generator.remoteId,state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',
    sourceFingerprint:hash,principalFingerprint:hash,observedAt:at,observationId:'observation_test'};
  records.push({key:'release:test-gen',release});assert.equal(canonicalRefresherInputs(records)[0].releaseVerified,true);
  account.state='OVERRIDDEN';assert.equal(canonicalRefresherInputs(records)[0].releaseVerified,false);
});
test('I12 X: policy prototype keys and fake protected interval cannot persist secrets or credit time',()=>{
  for(const k of ['constructor','__proto__','token']){
    const extra=JSON.parse('{"'+k+'":{"secret":"canary"}}');
    assert.equal(validatePolicy({...DEFAULT_POLICY,...extra}).ok,false);
  }
  let {s}=fleet(2,2);s.rows[0].phase='ACTIVE';s.rows[0].slot=true;
  const e=receipt(s,at,at+HOUR);e.accounts[0].protected=false;
  s=advanceShadow(s,{now:at+HOUR,bootId:boot,receipt:e}).state;
  assert.equal(s.rows[0].activeRemaining,24*HOUR);
});
test('I12 F/X 50-account/1250-generator measured fixture: stable bounded queue and evidence state; no production SLO claim',()=>{
  const start=performance.now(),before=process.memoryUsage().heapUsed;
  let {s}=fleet(1250,50);for(let i=0;i<8;i++)s=advance(s,at+i*MINUTE,at+(i+1)*MINUTE);
  assert.ok(s.rows.filter(r=>r.slot).length<=s.policy.initialCap);
  assert.equal(s.rows.length,1250);assert.ok(s.timeline.length<=64);assert.ok(s.inflight.length<=2);
  console.log('I12_SYNTHETIC_MEASUREMENTS',JSON.stringify({accounts:50,generators:1250,
    elapsedMs:Math.round(performance.now()-start),heapDeltaBytes:process.memoryUsage().heapUsed-before,
    serializedBytes:JSON.stringify(s).length,queuePeak:s.diagnostics.queuePeak}));
});
