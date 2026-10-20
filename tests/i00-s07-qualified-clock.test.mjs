import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyNativeOperatingInterval} from '../src/runtime/refresher-qualified-clock.mjs';
import {emptyShadow,reconcileShadow,advanceShadow,HOUR} from '../src/runtime/refresher-core.mjs';

const bootId='browser_boot_01',id='native_window_01',start=1000000,span=60000,H='a'.repeat(64);
const sample=(n,at,awake=at-start)=>({
  observerEpoch:'observer_001',systemBootId:'system_001',
  nativeLifetimeId:'native_001',observerConnectionId:'connection_001',
  sequence:n,observedAtMs:at,
  hostAwakeNs:String(2000000000+awake*1000000),
  hostBootNs:String(2000000000+awake*1000000)});
const certificate=(source,id,extra={})=>({
  source,id,validFromMs:start-100,validUntilMs:start+span+1000,
  generationValid:true,held:false,
  observerEpoch:'observer_001',systemBootId:'system_001',
  nativeLifetimeId:'native_001',observerConnectionId:'connection_001',
  ...extra});
const providerCoverages=[
  certificate('DONOR_CONTINUOUS_PROVIDER','provider_one_01',{
    accountId:'witness_account_01',domain:'exit_one_001',result:'HEALTHY',routeVerified:true}),
  certificate('DONOR_CONTINUOUS_PROVIDER','provider_two_01',{
    accountId:'witness_account_02',domain:'exit_two_001',result:'HEALTHY',routeVerified:true})];
const route=certificate('DONOR_CONTINUOUS_ROUTE','route_valid_001',{
  accountId:'account_01',personaUid:'persona_01',bindingVersion:1,protected:true,
  routeId:'protected_route_01',cookieStoreId:'firefox_container_01'});
const session=certificate('DONOR_CONTINUOUS_SESSION','session_valid_01',{
  accountId:'account_01',personaUid:'persona_01',bindingVersion:1,
  principalFingerprint:H,verified:true,
  routeId:'protected_route_01',cookieStoreId:'firefox_container_01'});
const accountCoverages=[{accountId:'account_01',personaUid:'persona_01',
  bindingVersion:1,principalFingerprint:H,route,session}];
const coverage={source:'DONOR_CONTINUOUS_COVERAGE',
  providers:providerCoverages,accounts:accountCoverages};
const previous=sample(1,start),next=sample(2,start+span);

test('S07 E04 D: native awake host and independent full-interval coverage produce bounded operational time',()=>{
  const proof=qualifyNativeOperatingInterval({previous,next,bootId,id,
    providerCoverages,accountCoverages});
  assert.equal(proof.ok,true,JSON.stringify(proof));
  assert.equal(proof.creditedMs,span-25);
  assert.equal(proof.receipt.from,start);
  assert.equal(proof.receipt.to,start+span-25);
  assert.equal(proof.receipt.accounts.length,1);
  assert.equal(proof.receipt.witnesses.length,2);
  assert.equal(proof.receipt.origin,'S07_NATIVE_CAUSAL_WINDOW');
});

test('S07 E04 X: route TTL, two endpoint checks, absent healthy session, lone exit, pause and gap never mint time',()=>{
  const args={previous,next,bootId,id,providerCoverages,accountCoverages};
  const probes=[
    {...args,providerCoverages:[]},
    {...args,providerCoverages:[providerCoverages[0]]},
    {...args,providerCoverages:[providerCoverages[0],{...providerCoverages[1],domain:'exit_one_001'}]},
    {...args,providerCoverages:[providerCoverages[0],{...providerCoverages[1],accountId:'witness_account_01'}]},
    {...args,providerCoverages:[providerCoverages[0],{...providerCoverages[1],nativeLifetimeId:'previous_native_01'}]},
    {...args,accountCoverages:[{...accountCoverages[0],route:{...route,observerConnectionId:'previous_connection_01'}}]},
    {...args,accountCoverages:[{...accountCoverages[0],route:{...route,cookieStoreId:'other_container_01'}}]},
    {...args,accountCoverages:[{...accountCoverages[0],session:{...session,routeId:'direct'}}]},
    {...args,providerCoverages:[providerCoverages[0],{...providerCoverages[1],validFromMs:start+1}]},
    {...args,accountCoverages:[]},
    {...args,accountCoverages:[{...accountCoverages[0],route:{...route,source:'CACHED_ROUTE_TEST'}}]},
    {...args,accountCoverages:[{...accountCoverages[0],session:{...session,verified:false}}]},
    {...args,accountCoverages:[{...accountCoverages[0],session:{...session,held:true}}]},
    {...args,accountCoverages:[{...accountCoverages[0],session:{...session,validFromMs:start+1}}]},
    {...args,next:{...next,nativeLifetimeId:'different_lifetime'}},
    {...args,next:{...next,sequence:4}},
    {...args,next:{...next,hostBootNs:String(BigInt(next.hostBootNs)+20000000000n)}},
    {...args,next:sample(2,start+13*3600000,13*3600000)},
  ];
  for(const item of probes){
    const receipt=qualifyNativeOperatingInterval(item);
    assert.equal(receipt.ok,false,JSON.stringify(item));
    assert.equal(receipt.creditedMs,0);
  }
});

function fleet(){
  const s=reconcileShadow(emptyShadow(),[{
    slug:'generator-a',accountId:'account_01',personaUid:'persona_01',
    bindingVersion:1,remoteId:'public_example',
    ownerVerified:true,accountVerified:true,principalFingerprint:H,
    releaseVerified:true,releaseFingerprint:H,listing:'PUBLIC'}]).state;
  const r=s.rows[0];r.phase='ACTIVE';r.slot=true;r.admittedAt=start;
  r.activeRemaining=HOUR;r.sleepRemaining=0;
  return s;
}
test('S07 E04 D: durable scheduler accrues healthy awake minutes across wake gaps, no extra reads',()=>{
  const before=fleet();
  const first=advanceShadow(before,{now:start,bootId,nativeClock:previous});
  assert.equal(first.ok,true);
  assert.equal(first.state.rows[0].activeRemaining,HOUR);
  assert.equal(first.state.nativeClock.witness.sequence,1);
  const second=advanceShadow(first.state,{now:start+span,bootId,nativeClock:next,
    qualifiedCoverages:coverage});
  assert.equal(second.ok,true);
  assert.equal(second.state.rows[0].activeRemaining,HOUR-span+25);
  assert.equal(second.state.timeline.at(-1).reason,'NATIVE_ELIGIBILITY_CONFIRMED');
  assert.equal(second.state.nativeClock.witness.sequence,2);
  // A replayed packet, even with the same account lease, cannot grant time.
  const replay=advanceShadow(second.state,{now:start+span+1000,bootId,
    nativeClock:next,qualifiedCoverages:coverage});
  assert.equal(replay.state.rows[0].activeRemaining,HOUR-span+25);
});
test('S07 E04 X: no eligibility or real pipe death freezes, event-page wake with original pipe remains creditable',()=>{
  const first=advanceShadow(fleet(),{now:start,bootId,nativeClock:previous}).state;
  const unknown=advanceShadow(first,{now:start+span,bootId,nativeClock:next}).state;
  assert.equal(unknown.rows[0].activeRemaining,HOUR);
  const stale=advanceShadow(first,{now:start+span,bootId,nativeClock:next,
    qualifiedCoverages:{...coverage,source:'CACHED_ROUTE_TEST'}}).state;
  assert.equal(stale.rows[0].activeRemaining,HOUR);
  // A Firefox event-page suspension is NOT native host death if the
  // original authenticated native pipe and eligibility coverage survived.
  const changedBoot=advanceShadow(first,{now:start+span,bootId:'browser_boot_02',
    nativeClock:next,qualifiedCoverages:coverage}).state;
  assert.equal(changedBoot.rows[0].activeRemaining,HOUR-span+25);
  // Actual native lifetime replacement is still an unknown interval.
  const pipeDied=advanceShadow(first,{now:start+span,bootId:'browser_boot_02',
    nativeClock:{...next,observerConnectionId:'new_connection_001'},
    qualifiedCoverages:coverage}).state;
  assert.equal(pipeDied.rows[0].activeRemaining,HOUR);
  const lost=advanceShadow(first,{now:start+span,bootId,
    nativeClock:{...next,sequence:8},qualifiedCoverages:coverage}).state;
  assert.equal(lost.rows[0].activeRemaining,HOUR);
  // A subsequent valid pair cannot retro-credit the missed previous minute.
  const another=advanceShadow(unknown,{now:start+span+1000,bootId,
    nativeClock:sample(3,start+span+1000,span+1000),qualifiedCoverages:coverage}).state;
  assert.equal(another.rows[0].activeRemaining,HOUR-975);
});


test('S07 E04 D: ten-minute wake gap accrues with genuinely continuous prospective coverage, partial coverage clips',()=>{
 const gap=10*60000;
 const extend=c=>({...c,validUntilMs:start+gap+1000});
 const longProviders=providerCoverages.map(extend);
 const longAccounts=accountCoverages.map(a=>({...a,
   route:extend(a.route),session:extend(a.session)}));
 const result=qualifyNativeOperatingInterval({
   previous,next:sample(2,start+gap,gap),bootId,id,
   providerCoverages:longProviders,accountCoverages:longAccounts});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.creditedMs,gap-25);
 // A misleading observed endpoint 10m later cannot extend an expiring
 // continuous eligibility window; only the certified prefix can count.
 const clipped=qualifyNativeOperatingInterval({
   previous,next:sample(2,start+gap,gap),bootId,id,
   providerCoverages,accountCoverages});
 assert.equal(clipped.ok,true,JSON.stringify(clipped));
 assert.equal(clipped.creditedMs,span+975);
});


test('S07 E04 X: corrupt persisted original-pipe counters cannot create CPU-heavy BigInt credit',()=>{
 const first=advanceShadow(fleet(),{now:start,bootId,nativeClock:previous}).state;
 first.nativeClock.witness.hostAwakeNs='9'.repeat(10000);
 const nextTurn=advanceShadow(first,{now:start+span,bootId,nativeClock:next,
   qualifiedCoverages:coverage});
 assert.equal(nextTurn.ok,true);
 assert.equal(nextTurn.state.rows[0].activeRemaining,HOUR);
 const response=qualifyNativeOperatingInterval({previous:{...previous,
   hostBootNs:'9'.repeat(10000)},next,bootId,id,
   providerCoverages,accountCoverages});
 assert.equal(response.ok,false);
 assert.equal(response.reason,'NATIVE_INTERVAL_INVALID');
});
