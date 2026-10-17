import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createProtectedAdmission} from '../src/runtime/protected-admission.mjs';
import {createCommittedNetworkObserver,createProtectedJoin} from '../src/runtime/network-join.mjs';
globalThis.crypto??=webcrypto;

// Disposable deterministic IDB with independent committed backing ledger.
// Writes are staged, visible only after tx.oncomplete, never through the join cache.
function database(){
 const data=new Map(),commits=[];
 let rejectCommit=false;
 function transaction(_name,mode){
  const pending=new Map(),deletes=new Set();
  let requests=0,drainPending=false;
  const tx={oncomplete:null,onabort:null,onerror:null,abort(){rejectCommit=true}};
  function finish(){
   if(drainPending||requests)return;
   drainPending=true;
   setImmediate(()=>{
     drainPending=false;
     if(requests)return;
     if(rejectCommit){rejectCommit=false;tx.onabort?.();return;}
     for(const [k,v] of pending)data.set(k,structuredClone(v));
     for(const k of deletes)data.delete(k);
     commits.push({mode,writes:[...pending.keys()],deletes:[...deletes]});
     tx.oncomplete?.();
   });
  }
  const store={
   get(key){
    requests++;
    const req={onsuccess:null,onerror:null,result:undefined};
    setImmediate(()=>{
      req.result=pending.has(key)?pending.get(key):data.get(key);
      requests--;req.onsuccess?.({target:req});finish();
    });
    return req;
   },
   put(value){
    if(mode==='readonly')throw Error('readonly');
    pending.set(value.key,structuredClone(value));finish();
   },
   delete(key){deletes.add(key);finish();}
  };
  tx.objectStore=()=>store;
  // Empty tx always completes even if no put.
  setImmediate(finish);
  return tx;
 }
 return {transaction,data,commits,failNextCommit(){rejectCommit=true}};
}
const input={
 operationId:'operation_001',bindingId:'binding_001',accountId:'account_001',
 personaUid:'persona_001',contextId:'context_001',routeId:'route_001',
 requestFingerprint:'fingerprint_001',reservationId:'reservation_001'
};
const evidence={
 source:'DONOR_FIXED_PROBE',evidenceId:'evidence_001',
 routeId:input.routeId,contextId:input.contextId,
 nativeLifetimeId:'native_001',
 ipv4:{state:'VERIFIED',address:'45.66.77.88'},
 ipv6:{state:'BLOCKED_VERIFIED',verifiedBlocking:true,blockEvidenceId:'block_001'},
 protection:'READY',dns:'VERIFIED_PROTECTED',
 observedAtMs:1000,validUntilMs:5000
};
function fixture({compatible=true,age=1000}={}){
 const db=database(),effects=[];
 let now=1200,observer,gate;
 observer=createCommittedNetworkObserver({onInvalidate:({bindingId})=>gate?.invalidateNow({bindingId})});
 gate=createProtectedAdmission({donorBootId:'boot_001',now:()=>now,
   readCommitted:key=>observer.readCommitted(key)});
 const donor={
  prepareBlocked:async i=>{effects.push('prepare');return {
   ok:true,blocked:true,candidateId:'candidate_001',personaUid:i.personaUid,
   routeId:i.routeId,contextId:i.contextId};},
  verifyFixedProbe:async()=>{effects.push('probe');return evidence;},
  stageBlocked:async({key})=>{effects.push('stage');return {
   blocked:true,assignmentEpoch:key.assignmentEpoch,
   personaUid:key.personaUid,contextId:key.contextId,
   routeId:key.routeId,routeRevision:1};},
  inspectBlocked:async({donorReceipt})=>{effects.push('inspect');return donorReceipt;}
 };
 const join=createProtectedJoin({db,observer,gate,donor,pcmsEpoch:'pcms_epoch_001',
   nativeCompatible:compatible,measuredMaximumAgeMs:age,now:()=>now});
 return {db,effects,join,gate,observer,donor,time:n=>{now=n}};
}
test('S01 GB01: unproved native/TTL capabilities always block before effects and intent',async()=>{
 for(const opts of [{compatible:false},{age:0}]){
  const f=fixture(opts);
  const x=await f.join.prepare(input);
  assert.equal(x.ok,false);
  assert.equal(x.code,'E01_NATIVE_FAMILY_PROOF_UNAVAILABLE');
  assert.equal(f.effects.length,0);
  assert.equal(f.db.commits.length,0);
 }
});
test('S01 GB01: prepare intent before native effect, then exclusive reserve/stage/commit/volatile admit',async()=>{
 const f=fixture();
 const result=await f.join.prepare(input);
 assert.equal(result.ok,true);
 assert.deepEqual(f.effects,['prepare','probe']);
 assert.ok(f.db.commits[0].writes.includes('network:s01:intent:binding_001'));
 const reused=await f.join.prepare(input);
 assert.equal(reused.code,'OBSERVE_EXISTING_OPERATION');
 assert.equal(f.effects.length,2);
 const reserved=await f.join.reserve(input,result.evidence,0);
 assert.equal(reserved.ok,true);
 assert.equal(reserved.reservation.allocationRevision,1);
 const key={
  bindingId:input.bindingId,assignmentEpoch:'assignment_001',
  personaUid:input.personaUid,contextId:input.contextId,routeId:input.routeId,
  routeRevision:1,evidenceId:evidence.evidenceId,reservationId:input.reservationId,
  allocationRevision:reserved.reservation.allocationRevision,
  ledgerEpoch:reserved.reservation.ledgerEpoch,exitSetDigest:reserved.reservation.exitSetDigest,
  grantRevision:1,pcmsEpoch:'pcms_epoch_001'
 };
 const staged=await f.join.stage({intent:result.intent,evidence,
  reservation:reserved.reservation,candidateId:result.candidateId,key});
 assert.equal(staged.ok,true);
 const joined=await f.join.commitJoined({intent:staged.intent,
  reservation:reserved.reservation,evidence,donorReceipt:staged.receipt,
  key,expectedSafetyGeneration:0});
 assert.equal(joined.ok,true);
 assert.equal(f.db.data.get('network:s01:join:binding_001').phase,'LEDGER_COMMITTED');
 const profile={pcmsBindingId:key.bindingId,personaUid:key.personaUid,
  containerId:key.contextId,routeId:key.routeId,managed:true,
  status:'active',killSwitch:true,blockLocalNetwork:true};
 assert.equal(f.gate.inspect(profile).allow,false); // canonical commit is not automatic grant
 const admit=f.join.admit({key,joined,evidenceValidUntil:5000,
  expectedSafetyGeneration:0,routeRevision:1});
 assert.equal(admit.ok,true);
 assert.equal(f.gate.inspect(profile).allow,true);
 await f.join.holdBinding(key.bindingId,'ARCHIVE');
 assert.equal(f.gate.inspect(profile).allow,false);
 assert.equal(f.db.data.has('network:s01:join:binding_001'),false);
 assert.equal(f.db.data.get('network:s01:exit-ownership-v1').owners['IPv4:45.66.77.88'],'account_001');
});
test('S01 GB01: missing/uncertain native effect never retries and never allows staged join',async()=>{
 const f=fixture();
 f.donor.prepareBlocked=async()=>{throw Error('lost ACK');};
 const prepared=await f.join.prepare(input);
 assert.equal(prepared.code,'NATIVE_PREPARE_OUTCOME_UNCERTAIN');
 assert.equal((await f.join.inspect(input.bindingId)).state,'DISPATCH_POSSIBLE');
 assert.equal((await f.join.prepare(input)).code,'OBSERVE_EXISTING_OPERATION');
 assert.equal(f.db.data.has('network:s01:exit-ownership-v1'),false);
});
test('S01 GB01: no stale committed callback after observer failure, and boot never auto-hydrates grant',async()=>{
 const f=fixture();
 assert.equal(f.observer.readCommitted({bindingId:'invalid'}).allow,false);
 f.observer.close();
 assert.equal(f.observer.publish({bindingId:'binding_001'}),false);
 assert.equal((await f.join.prepare(input)).ok,true); // native candidate may prepare while runtime joined observer held
 const status=await f.join.inspect(input.bindingId);
 assert.equal(status.state,'RESERVED');
 assert.equal(f.observer.isClosed(),true);
});
