// S01 early E-04 arithmetic. This is NOT a clock host or an admission grant.
// Samples must be attributable to one continuous observed native connection.
// No fallback from a fresh endpoint, wall time, native uptime or unknown gaps.
const positive=n=>Number.isSafeInteger(n)&&n>=0;
const ns=v=>typeof v==='string'&&/^\d+$/.test(v)?BigInt(v):null;
const id=v=>typeof v==='string'&&/^[a-z0-9_-]{8,128}$/i.test(v);
export function closeQualifiedWindow(previous,next,{maxGapMs,uncertaintyMs=0,
  coverage=[]}={}) {
 const discard=reason=>({creditedMs:0,coveredMs:0,reason});
 if(!previous||!next||!positive(maxGapMs)||maxGapMs<1||
   !positive(uncertaintyMs)||!Array.isArray(coverage))
   return discard('MEASUREMENT_UNQUALIFIED');
 for(const field of ['observerEpoch','systemBootId','nativeLifetimeId','observerConnectionId']){
   if(!id(previous[field])||previous[field]!==next[field])
     return discard('WITNESS_LIFETIME_CHANGED');
 }
 if(!positive(previous.sequence)||next.sequence!==previous.sequence+1)
   return discard('WITNESS_SEQUENCE_GAP');
 const a=ns(previous.hostAwakeNs),b=ns(next.hostAwakeNs),
       c=ns(previous.hostBootNs),d=ns(next.hostBootNs);
 if(a===null||b===null||c===null||d===null||b<a||d<c)
   return discard('WITNESS_COUNTER_INVALID');
 const awake=b-a,boot=d-c,oneMs=1000000n;
 if(boot<awake||boot-awake>BigInt(uncertaintyMs)*oneMs)
   return discard('SUSPEND_OR_CLOCK_DISCONTINUITY');
 const observedMs=Number(awake/oneMs);
 if(!Number.isSafeInteger(observedMs)||observedMs<=0||observedMs>maxGapMs)
   return discard('UNKNOWN_OBSERVER_GAP');
 if(!positive(previous.observedAtMs)||!positive(next.observedAtMs)||
     next.observedAtMs<=previous.observedAtMs)
   return discard('OBSERVER_TIMESTAMP_INVALID');
 const start=previous.observedAtMs,limit=start+observedMs;
 // All required evidence must cover the START; a later receipt cannot
 // retroactively authorize the earlier interval.
 if(!coverage.length)return discard('NO_ELIGIBILITY_COVERAGE');
 let end=Math.min(next.observedAtMs,limit);
 for(const item of coverage){
   if(!id(item?.id)||!positive(item.validFromMs)||item.validFromMs>start||
      !positive(item.validUntilMs)||item.validUntilMs<=start||
      item.held===true||item.generationValid!==true)return discard('ELIGIBILITY_UNKNOWN');
   end=Math.min(end,item.validUntilMs);
 }
 const total=Math.max(0,end-start-uncertaintyMs);
 return {creditedMs:total,coveredMs:Math.max(0,end-start),
   reason:total?'QUALIFIED':'ELIGIBILITY_EXPIRED'};
}

const witnessInt=v=>Number.isSafeInteger(v)&&v>=1;
const witnessId=v=>typeof v==='string'&&/^[a-z0-9-]{8,128}$/i.test(v);
const positiveDecimal=v=>typeof v==='string'&&/^\d+$/.test(v)&&BigInt(v)>0n;
// The sample is an observation of the ORIGINAL, browser-owned native pipe;
// the returned counters alone never grant healthy time or route admission.
export function validateNativeWitness(sample){
 if(!sample||sample.ok!==true||sample.schema!==1||
    sample.clockSemantics!=='LINUX_MONOTONIC_EXCLUDES_SUSPEND_BOOTTIME_INCLUDES_SUSPEND'||
    !witnessInt(sample.sequence)||
    !['observerConnectionId','nativeLifetimeId','systemBootId','observerEpoch']
       .every(name=>witnessId(sample[name]))||
    !positiveDecimal(sample.hostAwakeNs)||!positiveDecimal(sample.hostBootNs)||
    BigInt(sample.hostBootNs)<BigInt(sample.hostAwakeNs))
   return {ok:false,code:'NATIVE_WITNESS_UNQUALIFIED'};
 return {ok:true,witness:{
   observerConnectionId:sample.observerConnectionId,
   nativeLifetimeId:sample.nativeLifetimeId,systemBootId:sample.systemBootId,
   observerEpoch:sample.observerEpoch,sequence:sample.sequence,
   hostAwakeNs:sample.hostAwakeNs,hostBootNs:sample.hostBootNs
 }};
}
