import test from 'node:test';
import assert from 'node:assert/strict';
import {closeQualifiedWindow,validateNativeWitness} from '../src/runtime/qualified-clock.mjs';
const sample=(sequence=1,awake=1000000000,boot=1000000000,at=1000)=>({
 observerEpoch:'observer_001',nativeLifetimeId:'native_001',
 observerConnectionId:'connection_001',systemBootId:'system_001',
 sequence,hostAwakeNs:String(awake),hostBootNs:String(boot),observedAtMs:at});
const coverage=[{id:'route_proof_001',validFromMs:900,validUntilMs:3000,generationValid:true},
 {id:'account_owner_001',validFromMs:800,validUntilMs:3000,generationValid:true}];
const conf={maxGapMs:1000,uncertaintyMs:5,coverage};
test('S01 E04 D: conservative intersection clips expiry and measured uncertainty',()=>{
 const r=closeQualifiedWindow(sample(),sample(2,1600000000,1600000000,1600),conf);
 assert.equal(r.reason,'QUALIFIED');assert.equal(r.creditedMs,595);
 const exp=closeQualifiedWindow(sample(),sample(2,1600000000,1600000000,1600),{
  ...conf,coverage:[{...coverage[0],validUntilMs:1300},coverage[1]]});
 assert.equal(exp.creditedMs,295);
});
test('S01 E04 D: no credit across suspension, process/pipe restart, sequence loss or unknown gaps',()=>{
 const base=sample();
 for(const current of [
  sample(2,1100000000,1900000000,1900),
  {...sample(2,1600000000,1600000000,1600),nativeLifetimeId:'native_002'},
  {...sample(2,1600000000,1600000000,1600),observerConnectionId:'connection_002'},
  sample(3,1600000000,1600000000,1600),
  sample(2,3500000000,3500000000,3500),
  sample(2,600000000,600000000,1600)
 ])assert.equal(closeQualifiedWindow(base,current,conf).creditedMs,0);
});
test('S01 E04 D: fresh endpoint cannot backdate eligibility; zero unknown coverage, replay not credited',()=>{
 const a=sample(),b=sample(2,1600000000,1600000000,1600);
 assert.equal(closeQualifiedWindow(a,b,{...conf,coverage:[]}).creditedMs,0);
 assert.equal(closeQualifiedWindow(a,b,{...conf,coverage:[{...coverage[0],validFromMs:1100}]}).creditedMs,0);
 assert.equal(closeQualifiedWindow(a,b,{...conf,coverage:[{...coverage[0],held:true}]}).creditedMs,0);
 assert.equal(closeQualifiedWindow(a,b,{...conf,coverage:[{...coverage[0],generationValid:false}]}).creditedMs,0);
 assert.equal(closeQualifiedWindow(b,b,conf).creditedMs,0);
});

test('S01 E04: reject malformed live native witnesses and never infer qualification from one sample',()=>{
 const good={
  ok:true,schema:1,
  clockSemantics:'LINUX_MONOTONIC_EXCLUDES_SUSPEND_BOOTTIME_INCLUDES_SUSPEND',
  observerConnectionId:'connection_001',nativeLifetimeId:'native_001',
  systemBootId:'system_001',observerEpoch:'observer_001',
  sequence:1,hostAwakeNs:'1000000000',hostBootNs:'1000000001'
 };
 assert.equal(validateNativeWitness(good).ok,true);
 for(const modification of [
  {schema:2},{sequence:0},{nativeLifetimeId:'invalid!'},{hostAwakeNs:'-5'},
  {hostAwakeNs:'2000000000'},{clockSemantics:'WALL_CLOCK'},
  {observerConnectionId:''},{ok:false}
 ])assert.equal(validateNativeWitness({...good,...modification}).ok,false);
});
