import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {emptyShadow,reconcileShadow,advanceShadow,observeCapacity,effectiveCapacity,
 claimObservation,classifyProvider,MINUTE,HOUR} from '../src/runtime/refresher-core.mjs';
const hash='d'.repeat(64),start=1700000000000;
function input(i,n=50){const account=String(i%n).padStart(3,'0');
 return {slug:'fleet-'+String(i).padStart(5,'0'),accountId:'account_'+account,
   personaUid:'persona_'+account,remoteId:'remote_'+i,
   bindingVersion:1,ownerVerified:true,accountVerified:true,
   principalFingerprint:hash,releaseVerified:true,releaseFingerprint:hash,
   listing:'PUBLIC'};}
function timed(name,fn){
 const before=process.memoryUsage().heapUsed,at=performance.now(),value=fn();
 const ms=performance.now()-at,heap=process.memoryUsage().heapUsed-before;
 console.log('I17_F_X_METRIC '+JSON.stringify({name,elapsedMs:+ms.toFixed(3),
   heapDeltaBytes:heap,platform:'NODE_22_FIXTURE_NOT_PACKAGED_FIREFOX'}));
 return value;
}
test('P54-09 / P56-03 / S6-I17-FLEET-ROLL-OUT F/X: 50/1240 bounded in memory, stable ordinals, no phantom dispatch',()=>{
 const fixtures=Array.from({length:1240},(_,i)=>input(i));
 let s=timed('fleet_reconcile_1240',()=>reconcileShadow(emptyShadow(),fixtures));
 assert.equal(s.ok,true);s=s.state;
 assert.equal(s.rows.length,1240);assert.equal(Object.keys(s.accounts).length,50);
 assert.equal(new Set(s.rows.map(r=>r.ordinal)).size,1240);
 s.policy.manualCap=200;s.capacity.defensible=200;
 for(const r of s.rows.slice(0,195)){r.phase='ACTIVE';r.slot=true;}
 let change=observeCapacity(s,{at:start,usablePositions:180,complete:true});
 assert.equal(change.ok,true);s=change.state;
 change=observeCapacity(s,{at:start+10*MINUTE,usablePositions:180,complete:true});
 assert.equal(change.ok,true);s=change.state;
 assert.equal(s.capacity.defensible,180);
 const before=s.rows.slice(0,195).map(r=>[r.stableId,r.activeRemaining,r.ordinal]);
 const outage=timed('fleet_after_capacity_shock',()=>advanceShadow(s,{now:start+11*MINUTE,
   bootId:'boot_i17_b'}));
 assert.equal(outage.ok,true);s=outage.state;
 assert.equal(s.rows.filter(r=>r.slot).length,195);
 assert.deepEqual(s.rows.slice(0,195).map(r=>[r.stableId,r.activeRemaining,r.ordinal]),before);
 assert.equal(s.diagnostics.admissions,0);
 assert.equal(s.mode,'SHADOW_ONLY');
 assert(s.rows.every(r=>r.refresh&&r.refresh.attempts===undefined||r.refresh?.state!=='CONFIRMED'));
 const oldOrdinals=new Map(s.rows.map(r=>[r.slug,r.ordinal]));
 const reordered=timed('fleet_reconcile_reversed',()=>reconcileShadow(s,fixtures.toReversed()));
 assert.equal(reordered.ok,true);
 assert(reordered.state.rows.every(r=>oldOrdinals.get(r.slug)===r.ordinal));
 assert.equal(effectiveCapacity(reordered.state,start+11*MINUTE).warning,'OVERRIDE_ABOVE_OBSERVATION');
 // A nominal manual cap above observed positions is a HOLD warning, not usable capacity.
});
test('P56-02 / P56-03 F/X: one local failed dependency or rate limit never elevates to global outage',()=>{
 const witness=(accountId,domain,result)=>({accountId,domain,result,routeVerified:true,observedAt:start});
 assert.equal(classifyProvider([witness('account_001','same-hop','PROVIDER_UNAVAILABLE'),
   witness('account_002','same-hop','PROVIDER_UNAVAILABLE')],start).state,'SUSPECT');
 assert.equal(classifyProvider([witness('account_001','route-hop-a','RATE_LIMITED'),
   witness('account_002','route-hop-b','PROVIDER_UNAVAILABLE')],start).state,'SUSPECT');
 assert.equal(classifyProvider([witness('account_001','route-hop-a','PROVIDER_UNAVAILABLE'),
   witness('account_002','route-hop-b','PROVIDER_UNAVAILABLE')],start).state,'OUTAGE');
 assert.equal(classifyProvider([witness('account_001','route-hop-a','HEALTHY'),
   witness('account_002','route-hop-b','PROVIDER_UNAVAILABLE')],start).state,'SUSPECT');
});
test('P54-09 / P56-03 X: burst of 500 read requests after cold wake is coalesced or backpressured',()=>{
 const inputs=Array.from({length:1240},(_,i)=>input(i));let s=reconcileShadow(emptyShadow(),inputs).state;
 s.bootId='boot_i17_a';
 const counters=Object.create(null),perAccount=Object.create(null);
 timed('fleet_500_synthetic_read_admissions',()=>{
   for(let i=0;i<500;i++){
     const kind=i%10===0?'RECENT':'STATISTIC',r=s.rows[i%s.rows.length];
     const request=claimObservation(s,{kind,stableId:r.stableId,now:start,
       bootId:'boot_i17_a',claimId:'burst_'+String(i).padStart(4,'0')});
     const key=request.code||'ADMITTED';counters[key]=(counters[key]||0)+1;
     if(request.ok){s=request.state;perAccount[r.accountId]=(perAccount[r.accountId]||0)+1;}
   }
 });
 const admitted=counters.ADMITTED||0;
 assert(admitted<=2,'bounded inflight at one time');
 assert.equal(Object.values(counters).reduce((x,n)=>x+n,0),500);
 assert(Object.values(perAccount).every(n=>n<=1));
 assert(s.inflight.length<=2);
 assert.equal(s.mode,'SHADOW_ONLY');
 console.log('I17_F_X_BACKPRESSURE '+JSON.stringify({total:500,admitted,rejected:500-admitted,counters}));
});
