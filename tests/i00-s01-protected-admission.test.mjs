import test from 'node:test';
import assert from 'node:assert/strict';
import {createProtectedAdmission,validAdmissionKey} from '../src/runtime/protected-admission.mjs';

function fixture(){
 let t=1000, ledger=null;
 const key={bindingId:'binding_001',assignmentEpoch:'assignment_001',personaUid:'persona_001',
  routeId:'route_001',contextId:'firefox_container_001',routeRevision:1,
  evidenceId:'evidence_001',reservationId:'reservation_001',allocationRevision:1,
  ledgerEpoch:'ledger_001',exitSetDigest:'a'.repeat(64),grantRevision:1,
  pcmsEpoch:'pcms_epoch_001'};
 const gate=createProtectedAdmission({donorBootId:'boot_001',now:()=>t,
  readCommitted:()=>ledger?{allow:true,committed:ledger}:{allow:false}});
 const committed={...key,authority:'BOUND_ACCOUNT_NETWORK',publicationSafetyGeneration:0,snapshotValidUntil:2000};
 const profile={pcmsBindingId:key.bindingId,personaUid:key.personaUid,routeId:key.routeId,
  containerId:key.contextId,managed:true,status:'active',killSwitch:true,blockLocalNetwork:true};
 return {gate,key,committed,profile,ledger(v){ledger=v;},time(v){t=v}};
}
test('no startup, fixture route, missing ledger or forged allow can admit a managed Persona',()=>{
 const f=fixture();
 assert.equal(f.gate.inspect(f.profile).allow,false);
 assert.equal(f.gate.admit(f.key,{evidenceValidUntil:1500,routeRevision:1,expectedSafetyGeneration:0}).ok,false);
 assert.equal(f.gate.publishCommitted(f.key,f.committed).ok,true);
 assert.equal(f.gate.admit(f.key,{evidenceValidUntil:1500,routeRevision:1,expectedSafetyGeneration:0}).ok,false);
 assert.equal(f.gate.inspect(f.profile).allow,false);
});
test('matching committed grant permits only owned context and expires without timer',()=>{
 const f=fixture(); f.ledger(f.committed);
 assert.equal(validAdmissionKey(f.key),true);
 assert.equal(f.gate.publishCommitted(f.key,f.committed).ok,true);
 assert.equal(f.gate.admit(f.key,{evidenceValidUntil:1400,routeRevision:1,expectedSafetyGeneration:0}).ok,true);
 assert.equal(f.gate.inspect(f.profile).allow,true);
 assert.equal(f.gate.inspect({...f.profile,routeId:'direct'}).allow,false);
 assert.equal(f.gate.inspect({...f.profile,containerId:'another_container'}).allow,false);
 assert.equal(f.gate.inspect({...f.profile,killSwitch:false}).allow,false);
 assert.equal(f.gate.inspect({routeId:'unmanaged',managed:true}).managed,false);
 f.time(1400);assert.equal(f.gate.inspect(f.profile).allow,false);
});
test('withdrawal races final admit, old callback cannot revive, other binding unaffected',()=>{
 const a=fixture();a.ledger(a.committed);
 a.gate.publishCommitted(a.key,a.committed);
 a.gate.invalidateNow({bindingId:a.key.bindingId});
 assert.equal(a.gate.admit(a.key,{evidenceValidUntil:1400,routeRevision:1,expectedSafetyGeneration:0}).ok,false);
 assert.equal(a.gate.publishCommitted(a.key,a.committed).ok,false);
 assert.equal(a.gate.inspect(a.profile).allow,false);
});
test('restart loses grants, clock rollback closes grants, forged grant revision denied',()=>{
 const a=fixture();a.ledger(a.committed);
 a.gate.publishCommitted(a.key,a.committed);
 assert.equal(a.gate.admit(a.key,{evidenceValidUntil:1800,routeRevision:1,expectedSafetyGeneration:0}).ok,true);
 const reboot=createProtectedAdmission({donorBootId:'boot_002',now:()=>1000,readCommitted:()=>({allow:true,committed:a.committed})});
 assert.equal(reboot.inspect(a.profile).allow,false);
 a.time(900);assert.equal(a.gate.inspect(a.profile).allow,false);
 assert.equal(a.gate.isClockValid(),false);
 assert.equal(validAdmissionKey({...a.key,grantRevision:0}),false);
});
