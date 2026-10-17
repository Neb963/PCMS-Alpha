// S01 GB-01: canonical network join. Real donor staging/verification adapters
// are supplied ONLY by the private same-XPI background composition.
// There is no page/port command and no authority inferred from a UI result.
import {isSafeId,fail} from './journal.mjs';
import {validAdmissionKey,admissionKeyOf} from './protected-admission.mjs';
import {proposeExitReservation,createExitLedger} from './network-ledger.mjs';

const KEY_PREFIX='network:s01:join:';
const INTENT_PREFIX='network:s01:intent:';
const status=new Set(['PREPARED','DISPATCH_POSSIBLE','RESERVED','STAGED','LEDGER_COMMITTED','ADMIT_POSSIBLE','HELD_UNKNOWN']);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const keyFor=(kind,id)=>(kind==='join'?KEY_PREFIX:INTENT_PREFIX)+id;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const cleanError=()=>fail('NETWORK_JOIN_UNAVAILABLE');
function transact(db,mode,handler){
 return new Promise((resolve,reject)=>{
  let tx;
  try{tx=db.transaction('meta',mode);}catch{return reject(new Error('NETWORK_JOIN_DB_UNAVAILABLE'));}
  let value=fail('NETWORK_JOIN_INCOMPLETE');
  tx.oncomplete=()=>resolve(value);
  tx.onabort=()=>reject(new Error('NETWORK_JOIN_DB_ABORTED'));
  tx.onerror=()=>{};
  try{handler(tx.objectStore('meta'),v=>{value=v;});}
  catch{try{tx.abort();}catch{}}
 });
}
// This cache is NOT hydrated into a live grant after browser restart.
// A successful IDB transaction and donor final admission are both required.
export function createCommittedNetworkObserver({onInvalidate}={}){
 const committed=new Map();
 let failed=false;
 function readCommitted(candidate){
  // Donor inspects both a bare admission key and the volatile runtime grant.
  // Runtime-only grantId/expiry/boot/generation fields are never ledger fields.
  const key=admissionKeyOf(candidate);
  if(failed || !validAdmissionKey(key))return {allow:false,reason:'OBSERVER_UNAVAILABLE'};
  const record=committed.get(key.bindingId);
  return record&&Object.keys(key).every(f=>record[f]===key[f])?
   {allow:true,committed:record}:{allow:false,reason:'RESERVATION_MISMATCH'};
 }
 function publish(record){
  if(failed||!validAdmissionKey(admissionKeyOf(record))||
     record.authority!=='BOUND_ACCOUNT_NETWORK'||
     !Number.isSafeInteger(record.publicationSafetyGeneration)||
     record.publicationSafetyGeneration<0||!positive(record.snapshotValidUntil))return false;
  committed.set(record.bindingId,Object.freeze({...record}));
  return true;
 }
 function invalidate(bindingId,reason='CONFLICT'){
  if(bindingId)committed.delete(bindingId);
  else committed.clear();
  try{onInvalidate?.({bindingId,reason});}catch{failed=true;committed.clear();}
 }
 function close(){
  failed=true;invalidate(undefined,'CONFLICT');
 }
 return Object.freeze({readCommitted,publish,invalidate,close,isClosed:()=>failed});
}
export function createProtectedJoin({db,observer,gate,donor,now=Date.now,
   nativeCompatible=false,measuredMaximumAgeMs=0,pcmsEpoch}={}){
 if(!db||!observer||!gate||!donor||typeof donor.prepareBlocked!=='function'||
   typeof donor.verifyFixedProbe!=='function'||typeof donor.stageBlocked!=='function'||
   typeof donor.inspectBlocked!=='function'||typeof gate.admit!=='function'||
   typeof gate.publishCommitted!=='function'||!isSafeId(pcmsEpoch))
  throw new TypeError('Trusted same-XPI S01 dependencies required');
 // Gate B holds real activation until the host supports *positive*, compatible
 // dual-family fixed-probe verification and the age bound has H validation.
 const operational=nativeCompatible===true&&positive(measuredMaximumAgeMs);
 const ledger=createExitLedger(db);
 const hold=(code='E01_NATIVE_FAMILY_PROOF_UNAVAILABLE')=>fail(code);
 async function writeIntent({operationId,bindingId,accountId,personaUid,contextId,routeId,
   requestFingerprint}={}){
  if(![operationId,bindingId,accountId,personaUid,contextId,routeId,requestFingerprint]
       .every(isSafeId))return fail('NETWORK_INTENT_INVALID');
  const intent={key:keyFor('intent',bindingId),schema:1,operationId,bindingId,
    accountId,personaUid,contextId,routeId,requestFingerprint,
    state:'PREPARED',pcmsEpoch};
  return transact(db,'readwrite',(meta,done)=>{
    meta.get(intent.key).onsuccess=e=>{
      const prior=e.target.result;
      if(prior) return done(prior.operationId===operationId&&
        same(prior.requestFingerprint,requestFingerprint)&&
        prior.bindingId===bindingId&&prior.personaUid===personaUid?
        {ok:true,intent:prior,existing:true}:fail('NETWORK_INTENT_CONFLICT'));
      meta.put(intent);done({ok:true,intent,existing:false});
    };
  });
 }
 async function moveIntent(intent,expected,next){
  if(!status.has(expected)||!status.has(next))return fail('NETWORK_PHASE_INVALID');
  return transact(db,'readwrite',(meta,done)=>{
    meta.get(intent.key).onsuccess=e=>{
      const old=e.target.result;
      if(!old||old.operationId!==intent.operationId||
        old.pcmsEpoch!==pcmsEpoch||old.state!==expected)
        return done(fail('NETWORK_PHASE_CHANGED'));
      const changed={...old,state:next};meta.put(changed);
      done({ok:true,intent:changed});
    };
  });
 }
 async function inspect(bindingId){
  if(!isSafeId(bindingId))return fail('NETWORK_INTENT_INVALID');
  return transact(db,'readonly',(meta,done)=>{
    meta.get(keyFor('intent',bindingId)).onsuccess=e=>{
      const value=e.target.result;
      done(value?{ok:true,state:value.state,operationId:value.operationId,
        bindingId:value.bindingId,pcmsEpoch:value.pcmsEpoch}:fail('NETWORK_INTENT_ABSENT'));
    };
  });
 }
 // The caller cannot assert native verification. The donor owns the fixed
 // probe and may return a signed/attributed evidence receipt only after
 // actual selected-route/protection/family observations.
 async function prepare(input){
  if(!operational)return hold();
  const initial=await writeIntent(input);
  if(!initial.ok)return initial;
  if(initial.existing)return {ok:false,code:'OBSERVE_EXISTING_OPERATION',
    state:initial.intent.state};
  const marked=await moveIntent(initial.intent,'PREPARED','DISPATCH_POSSIBLE');
  if(!marked.ok)return marked;
  let candidate;
  try{candidate=await donor.prepareBlocked(input);}
  catch{return hold('NATIVE_PREPARE_OUTCOME_UNCERTAIN');}
  if(candidate?.ok!==true||candidate.blocked!==true||
     candidate.personaUid!==input.personaUid||candidate.contextId!==input.contextId||
     candidate.routeId!==input.routeId||!isSafeId(candidate.candidateId))
    return hold('NATIVE_PREPARE_OUTCOME_UNCERTAIN');
  let evidence;
  try{evidence=await donor.verifyFixedProbe({...candidate,operationId:input.operationId});}
  catch{return hold('NATIVE_PROBE_UNVERIFIED');}
  if(evidence?.source!=='DONOR_FIXED_PROBE'||
     evidence.routeId!==input.routeId||evidence.contextId!==input.contextId ||
     !evidence.nativeLifetimeId)return hold('NATIVE_PROBE_UNVERIFIED');
  const after=await moveIntent(marked.intent,'DISPATCH_POSSIBLE','RESERVED');
  if(!after.ok)return after;
  return {ok:true,intent:after.intent,evidence,candidateId:candidate.candidateId};
 }
 // One canonical exclusive-history reservation, independently committed BEFORE
 // any donor state is staged. Missing/unknown family never gets an exclusion.
 async function reserve(input,evidence,expectedLedgerRevision){
  if(!operational)return hold();
  const prior=await inspect(input.bindingId);
  if(!prior.ok||prior.state!=='RESERVED'||prior.operationId!==input.operationId)
    return fail('NETWORK_RESERVATION_PHASE_INVALID');
  const proposal=await proposeExitReservation({...input,evidence,
    expectedLedgerRevision,reservationId:input.reservationId},{nowMs:now});
  if(!proposal.ok)return proposal;
  let reserved;
  try{reserved=await ledger.reserve(proposal.proposal);}
  catch{return cleanError();}
  return reserved.ok?{ok:true,reservation:reserved.reservation,proposal:proposal.proposal}:reserved;
 }
 async function commitJoined({intent,reservation,evidence,donorReceipt,key,
   expectedSafetyGeneration}={}){
  if(!operational)return hold();
  if(!validAdmissionKey(key)||!intent||!reservation||!donorReceipt||
     !Number.isSafeInteger(expectedSafetyGeneration)||expectedSafetyGeneration<0||
     key.pcmsEpoch!==pcmsEpoch||
     key.bindingId!==intent.bindingId||key.personaUid!==intent.personaUid||
     key.routeId!==intent.routeId||key.contextId!==intent.contextId||
     key.reservationId!==reservation.reservationId||
     key.allocationRevision!==reservation.allocationRevision||
     key.ledgerEpoch!==reservation.ledgerEpoch||
     key.exitSetDigest!==reservation.exitSetDigest||
     key.evidenceId!==evidence?.evidenceId||
     key.routeRevision!==donorReceipt.routeRevision||
     donorReceipt.assignmentEpoch!==key.assignmentEpoch||
     donorReceipt.personaUid!==key.personaUid||
     donorReceipt.contextId!==key.contextId||
     donorReceipt.routeId!==key.routeId||
     donorReceipt.blocked!==true ||
     evidence?.nativeLifetimeId!==reservation.nativeLifetimeId)
    return fail('CROSS_STORE_JOIN_MISMATCH');
  const t=now(),deadline=Math.min(evidence.validUntilMs, t+measuredMaximumAgeMs);
  if(!positive(t)||!positive(deadline)||deadline<=t)
    return fail('JOIN_EVIDENCE_EXPIRED');
  const grantRecord=Object.freeze({...key,authority:'BOUND_ACCOUNT_NETWORK',
    publicationSafetyGeneration:expectedSafetyGeneration,snapshotValidUntil:deadline});
  // Re-validate actual donor-owned state after all awaits, while STILL blocked.
  let state;
  try{state=await donor.inspectBlocked({intent,reservation,donorReceipt});}
  catch{return hold('DONOR_STAGE_UNCONFIRMED');}
  if(state?.blocked!==true||state.assignmentEpoch!==key.assignmentEpoch||
    state.routeId!==key.routeId||state.contextId!==key.contextId||
    state.personaUid!==key.personaUid||state.routeRevision!==key.routeRevision||
    gate.generation(key.bindingId)!==expectedSafetyGeneration)
    return fail('DONOR_STAGE_CONFLICT');
  let result;
  try{
   result=await transact(db,'readwrite',(meta,done)=>{
     meta.get('network:s01:exit-ownership-v1').onsuccess=e=>{
       const r=e.target.result?.reservations?.[key.bindingId];
       if(!r||r.reservationId!==key.reservationId||
         r.allocationRevision!==key.allocationRevision||
         r.ledgerEpoch!==key.ledgerEpoch||r.exitSetDigest!==key.exitSetDigest||
         r.validUntilMs<t)return done(fail('RESERVATION_NOT_COMMITTED'));
       meta.get(intent.key).onsuccess=evt=>{
         const phase=evt.target.result;
         if(!phase||phase.state!=='STAGED'||
           phase.operationId!==intent.operationId||
           phase.pcmsEpoch!==pcmsEpoch)return done(fail('NETWORK_PHASE_CHANGED'));
         meta.get(keyFor('join',key.bindingId)).onsuccess=old=>{
           if(old.target.result)return done(fail('JOIN_ALREADY_EXISTS'));
           meta.put({key:keyFor('join',key.bindingId),schema:1,
             phase:'LEDGER_COMMITTED',intentId:intent.operationId,
             committed:grantRecord});
           meta.put({...phase,state:'LEDGER_COMMITTED'});
           done({ok:true,record:grantRecord});
         };
       };
     };
   });
  }catch{observer.invalidate(key.bindingId);return cleanError();}
  if(!result.ok)return result;
  // The DB commit ACK has occurred. Any intervening donor invalidation or
  // observer closure cannot be repaired by publishing a stale receipt.
  if(gate.generation(key.bindingId)!==expectedSafetyGeneration||
     !observer.publish(grantRecord))return fail('JOIN_PUBLICATION_HELD');
  const published=gate.publishCommitted(key,grantRecord);
  if(!published.ok){observer.invalidate(key.bindingId);return published;}
  return {ok:true,record:grantRecord};
 }
 async function stage({intent,evidence,reservation,candidateId,key}={}){
  if(!operational)return hold();
  const statusRow=await inspect(intent?.bindingId);
  if(!statusRow.ok||statusRow.state!=='RESERVED'||statusRow.operationId!==intent.operationId)
    return fail('NETWORK_PHASE_CHANGED');
  // Mark possibly dispatched before donor stage; never retry blindly.
  const pre=await moveIntent(intent,'RESERVED','DISPATCH_POSSIBLE');
  if(!pre.ok)return pre;
  let receipt;
  try{receipt=await donor.stageBlocked({intent,evidence,reservation,candidateId,key});}
  catch{return hold('DONOR_STAGE_OUTCOME_UNCERTAIN');}
  if(receipt?.blocked!==true||receipt.assignmentEpoch!==key?.assignmentEpoch||
    receipt.routeId!==intent.routeId||receipt.contextId!==intent.contextId)
    return hold('DONOR_STAGE_OUTCOME_UNCERTAIN');
  const recorded=await moveIntent(pre.intent,'DISPATCH_POSSIBLE','STAGED');
  if(!recorded.ok)return recorded;
  return {ok:true,receipt,intent:recorded.intent};
 }
 // Admission is never reconstituted from IDB on startup. An affirmative
 // canonical join permits only the final synchronous local grant install.
 function admit({key,joined,evidenceValidUntil,expectedSafetyGeneration,
    routeRevision}={}){
  if(!operational)return hold();
  if(!joined?.ok||!validAdmissionKey(key)||
     joined.record?.pcmsEpoch!==pcmsEpoch||
     observer.readCommitted(key).allow!==true)return fail('JOIN_NOT_PUBLISHED');
  return gate.admit(key,{evidenceValidUntil,expectedSafetyGeneration,routeRevision});
 }
 async function holdBinding(bindingId,reason='CONFLICT'){
  if(!isSafeId(bindingId))return fail('NETWORK_INTENT_INVALID');
  gate.invalidateNow({bindingId,reason});observer.invalidate(bindingId,reason);
  try{
   return await transact(db,'readwrite',(meta,done)=>{
     meta.delete(keyFor('join',bindingId));
     meta.get(keyFor('intent',bindingId)).onsuccess=e=>{
       const old=e.target.result;
       if(old)meta.put({...old,state:'HELD_UNKNOWN'});
       done({ok:true,held:true,historyPreserved:true});
     };
   });
  }catch{return cleanError();}
 }
 return Object.freeze({prepare,reserve,stage,commitJoined,admit,holdBinding,
   inspect,writeIntent,moveIntent,operational,observer});
}
