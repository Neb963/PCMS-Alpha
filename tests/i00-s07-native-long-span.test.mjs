import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyShadow,reconcileShadow,advanceShadow,HOUR,MINUTE}
  from '../src/runtime/refresher-core.mjs';

const base=1000000,H='e'.repeat(64),boot='browser_boot_01';
const certificate=(source,id,rest={})=>({
 source,id,validFromMs:base-1,validUntilMs:base+6*24*HOUR,
 held:false,generationValid:true,...rest});
const coverage={
 source:'DONOR_CONTINUOUS_COVERAGE',
 providers:[
  certificate('DONOR_CONTINUOUS_PROVIDER','provider_interval_one',{
   domain:'provider_exit_001',accountId:'witness_account_01',result:'HEALTHY',routeVerified:true}),
  certificate('DONOR_CONTINUOUS_PROVIDER','provider_interval_two',{
   domain:'provider_exit_002',accountId:'witness_account_02',result:'HEALTHY',routeVerified:true})],
 accounts:[{accountId:'account_01',personaUid:'persona_01',
  bindingVersion:1,principalFingerprint:H,
  route:certificate('DONOR_CONTINUOUS_ROUTE','route_interval_01',{
    accountId:'account_01',personaUid:'persona_01',bindingVersion:1,protected:true}),
  session:certificate('DONOR_CONTINUOUS_SESSION','session_interval_01',{
    accountId:'account_01',personaUid:'persona_01',bindingVersion:1,
    principalFingerprint:H,verified:true})}]
};
const witness=i=>{
 const ns=BigInt(i)*BigInt(MINUTE)*1000000n+3000000000n;
 return {observerEpoch:'observer_epoch_01',nativeLifetimeId:'native_lifetime_01',
  systemBootId:'system_boot_01',observerConnectionId:'connection_01',
  sequence:i+1,observedAtMs:base+i*MINUTE,
  hostAwakeNs:String(ns),hostBootNs:String(ns)};
};
test('S07 E04 synthetic D: 24h active + 72h rest truly consume covered native awake time, not short request windows',()=>{
 let state=reconcileShadow(emptyShadow(),[{
  slug:'generator-one',accountId:'account_01',personaUid:'persona_01',
  bindingVersion:1,remoteId:'public_one',accountVerified:true,
  ownerVerified:true,principalFingerprint:H,releaseVerified:true,
  releaseFingerprint:H,listing:'PUBLIC'}]).state;
 state.rows[0].phase='ACTIVE';state.rows[0].slot=true;
 state.rows[0].activeRemaining=24*HOUR;state.rows[0].admittedAt=base;
 state.policy.activeMs=24*HOUR;state.policy.sleepMs=72*HOUR;
 // No credit is possible from the *first* native sample alone.
 state=advanceShadow(state,{now:base,bootId:boot,nativeClock:witness(0)}).state;
 let finishedActive=null,finishedSleep=null,qualified=0;
 for(let i=1;i<=5850;i++){
  const r=advanceShadow(state,{now:base+i*MINUTE,bootId:boot,
   nativeClock:witness(i),qualifiedCoverages:coverage});
  assert.equal(r.ok,true);
  state=r.state;
  if(state.timeline.at(-1).reason==='NATIVE_ELIGIBILITY_CONFIRMED')qualified++;
  const row=state.rows[0];
  if(finishedActive===null&&row.cycle===1&&row.phase==='SLEEPING')
    finishedActive=i;
  if(finishedActive!==null&&row.sleepRemaining===0&&row.cycle===1){
    finishedSleep=i;break;
  }
 }
 assert.ok(finishedActive>=1440&&finishedActive<=1443,finishedActive);
 assert.ok(finishedSleep>=5760&&finishedSleep<=5790,finishedSleep);
 assert.ok(qualified>=5750,qualified);
 assert.equal(state.rows[0].cycle,1);
 assert.equal(state.rows[0].sleepRemaining,0);
 // The actual elapsed span includes the explicitly debited monotonic uncertainty.
 assert.equal(state.timeline.at(-1).reason,'NATIVE_ELIGIBILITY_CONFIRMED');
});
