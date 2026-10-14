import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionAccount} from '../src/runtime/accounts.mjs';
import {emptyShadow,reconcileShadow,advanceShadow,claimObservation,applyStatistic,
  admissionBlocks,classifyProvider,HOUR,MINUTE} from '../src/runtime/refresher-core.mjs';
import {releaseContext} from '../src/runtime/release-core.mjs';

const T=1_700_000_000_000;
const BOOT='i17_browser_boot';
const H='a'.repeat(64);
const account=i=>'account_'+String(i).padStart(4,'0');
const persona=i=>'persona_'+String(i).padStart(4,'0');
const fixture=()=>{
  const inputs=Array.from({length:50},(_,a)=>Array.from({length:12},(_,i)=>({
    slug:'fleet-'+String(a).padStart(2,'0')+'-'+String(i).padStart(2,'0'),
    accountId:account(a),personaUid:persona(a),bindingVersion:1,
    remoteId:'remote_'+String(a).padStart(2,'0')+'_'+String(i).padStart(2,'0'),
    ownerVerified:true,accountVerified:true,principalFingerprint:H,
    releaseVerified:true,releaseFingerprint:H,listing:'PUBLIC'
  }))).flat();
  let s=reconcileShadow(emptyShadow(),inputs).state;
  s.policy.manualCap=20;s.capacity.defensible=20;
  const target=account(17),other=account(18);
  for(const row of s.rows.filter(x=>x.accountId===target)){
    row.phase='ACTIVE';row.slot=true;row.activeRemaining=22*HOUR;
  }
  const peer=s.rows.find(x=>x.accountId===other);
  peer.phase='ACTIVE';peer.slot=true;peer.activeRemaining=22*HOUR;
  return {s,inputs,target,other,peerId:peer.stableId};
};
function receipt(s,from,to,{lost=[],provider='HEALTHY',boot=BOOT}={}){
  const status=provider==='OUTAGE'?'PROVIDER_UNAVAILABLE':'HEALTHY';
  return {source:'GUARDED_OPERATIONAL_INTERVAL',browserRunning:true,
    complete:true,id:'i17_interval_'+String(to),bootId:boot,from,to,
    accounts:Object.entries(s.accounts).map(([accountId,a])=>({
      accountId,personaUid:a.personaUid,bindingVersion:a.bindingVersion,
      health:lost.includes(accountId)?'UNAVAILABLE':'HEALTHY',
      protected:true,sessionVerified:true
    })),
    witnesses:[0,1].map(i=>({accountId:'witness_'+i,domain:'independent_'+i,
      routeVerified:true,observedAt:to,result:status}))
  };
}
const advance=(s,from,to,opts={})=>{
  const r=advanceShadow(s,{now:to,bootId:opts.boot||BOOT,
    receipt:receipt(s,from,to,opts)});
  assert.equal(r.ok,true,r.code);return r.state;
};
test('P56-02 / REQ-R01..10 F/X: 50 accounts, 12 affected slots, route loss, provider outage, rebind, peer progress',()=>{
  let {s,inputs,target,other,peerId}=fixture();
  const affected=s.rows.filter(x=>x.accountId===target);
  const original=affected.map(x=>({
    stableId:x.stableId,ordinal:x.ordinal,activeRemaining:x.activeRemaining
  }));
  assert.equal(affected.length,12);
  const otherBefore=s.rows.find(x=>x.stableId===peerId).activeRemaining;
  // Account 17 route fails. All 12 retain budget, healthy other account
  // progresses, and there are never provider-side effects in shadow mode.
  s=advance(s,T,T+35*MINUTE,{lost:[target]});
  assert.equal(s.accounts[target].graceUsed,35*MINUTE);
  assert.equal(s.rows.filter(x=>x.accountId===target&&x.slot).length,12);
  assert.equal(s.rows.find(x=>x.stableId===peerId).activeRemaining,otherBefore-35*MINUTE);
  assert.deepEqual(s.rows.filter(x=>x.accountId===target).map(x=>({
    stableId:x.stableId,ordinal:x.ordinal,activeRemaining:x.activeRemaining
  })),original);
  assert(admissionBlocks(s,s.rows.find(x=>x.accountId===target)).includes('ACCOUNT_UNAVAILABLE'));
  const noEffect=advanceShadow(s,{now:T+35*MINUTE+HOUR,bootId:'restarted_no_receipt'});
  assert.equal(noEffect.ok,true);
  s=noEffect.state;
  assert.equal(s.accounts[target].graceUsed,35*MINUTE);
  assert.equal(s.rows.find(x=>x.stableId===peerId).activeRemaining,otherBefore-35*MINUTE);
  // During independently corroborated global outage the grace counter
  // remains frozen. The clocks cannot use the browser's wall time alone.
  s=advance(s,T+35*MINUTE+HOUR,T+65*MINUTE+HOUR,
    {lost:[target],provider:'OUTAGE',boot:'restarted_no_receipt'});
  assert.equal(s.accounts[target].graceUsed,35*MINUTE);
  assert.equal(s.rows.filter(x=>x.accountId===target&&x.slot).length,12);
  assert.equal(s.provider.state,'OUTAGE');
  // Operator's Pause survives route recovery and later Persona rebinding.
  s.accounts[target].paused=true;
  s=advance(s,T+65*MINUTE+HOUR,T+90*MINUTE+HOUR,
    {lost:[target],provider:'HEALTHY',boot:'restarted_no_receipt'});
  assert.equal(s.accounts[target].graceUsed,HOUR);
  assert.equal(s.rows.filter(x=>x.accountId===target&&x.slot).length,0);
  assert.equal(s.diagnostics.graceReleases,12);
  assert.deepEqual(s.rows.filter(x=>x.accountId===target).map(x=>({
    stableId:x.stableId,ordinal:x.ordinal,activeRemaining:x.activeRemaining
  })),original);
  // Replaying an already consumed interval never rereleases or spends time.
  s=advance(s,T+65*MINUTE+HOUR,T+90*MINUTE+HOUR,
    {lost:[target],provider:'HEALTHY',boot:'restarted_no_receipt'});
  assert.equal(s.diagnostics.graceReleases,12);
  const before={accountId:target,personaUid:persona(17),revision:2,
    bindingVersion:1,state:'VERIFIED',identity:{
      source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:H
    },override:null,history:[]};
  const rebinding=transitionAccount(before,{
    type:'REBIND',accountId:target,expectedRevision:2,
    personaUid:'persona-repair-17',explicitRepair:true
  },[before]);
  assert.equal(rebinding.ok,true,rebinding.code);
  assert.equal(rebinding.account.bindingVersion,2);
  assert.equal(rebinding.account.identity,null);
  assert.equal(rebinding.account.state,'REBIND_PENDING');
  const stage={slug:affected[0].slug,accountId:target,personaUid:before.personaUid,
    bindingVersion:1,accountRevision:2,principalFingerprint:H,
    remotePublicId:affected[0].remoteId};
  const inventory={slug:stage.slug,accountId:stage.accountId,
    personaUid:stage.personaUid,bindingVersion:1,remoteId:stage.remotePublicId,
    ownerState:'OBSERVED_OWNER'};
  assert.equal(releaseContext(stage,before,inventory).ok,true);
  assert.equal(releaseContext(stage,rebinding.account,inventory).code,
    'RELEASE_OWNER_OR_BINDING_CHANGED');
  inputs=inputs.map(row=>row.accountId!==target?row:{
    ...row,personaUid:rebinding.account.personaUid,
    bindingVersion:2,accountVerified:false,ownerVerified:false,releaseVerified:false
  });
  s=reconcileShadow(s,inputs).state;
  assert(s.rows.filter(x=>x.accountId===target).every(x=>x.identityHeld&&
    !x.ownerVerified&&!x.releaseVerified&&!x.slot));
  assert(s.accounts[target].paused,'explicit operator Pause survives rebind');
  assert.equal(admissionBlocks(s,s.rows.find(x=>x.accountId===target)).includes('BINDING_CHANGED'),true);
  assert.equal(s.rows.find(x=>x.stableId===peerId).ownerVerified,true,
    'unaffected account retains independent authority');
  assert.equal(s.rows.find(x=>x.stableId===peerId).bindingVersion,1);
  const prevClaim={stableId:affected[0].stableId,bindingVersion:1,
    personaUid:before.personaUid,remoteId:affected[0].remoteId,
    startedAt:T+90*MINUTE+HOUR};
  assert.equal(applyStatistic(s,prevClaim,{views:7,
    observedAt:prevClaim.startedAt,unit:'VIEWS',source:'GUARDED_READ_ONLY'},
    prevClaim.startedAt).code,'STATISTIC_CONTEXT_CHANGED');
  assert.equal(s.mode,'SHADOW_ONLY');
  assert.equal(s.diagnostics.graceReleases,12);
});
test('P56-02 X: local route 429, same upstream or stale corroboration cannot become global outage',()=>{
  const w={accountId:account(17),domain:'protected_exit_17',routeVerified:true,
    observedAt:T,result:'PROVIDER_UNAVAILABLE'};
  assert.equal(classifyProvider([w,{...w,accountId:account(18)}],T).state,'SUSPECT');
  assert.equal(classifyProvider([w,{...w,accountId:account(18),
    domain:'protected_exit_18',result:'RATE_LIMITED'}],T).state,'SUSPECT');
  assert.equal(classifyProvider([w,{...w,accountId:account(18),
    domain:'protected_exit_18',observedAt:T-1}],T).state,'SUSPECT');
  assert.equal(classifyProvider([w,{...w,accountId:account(18),
    domain:'protected_exit_18',routeVerified:false}],T).state,'SUSPECT');
  assert.equal(classifyProvider([w,{...w,accountId:account(18),
    domain:'protected_exit_18'}],T).state,'OUTAGE');
});
