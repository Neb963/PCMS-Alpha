import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingTagChanges,beforeDonorStateCommit,installDonorAdmissionFence} from '../src/runtime/pcms-donor-fence.mjs';

const state=()=>({global:{unmanagedPolicy:'block'},routes:{
 'route_001':{id:'route_001',enabled:true,host:'192.0.2.2'}},
 profiles:{'firefox-container-001':{
  pcmsBindingId:'binding_001',personaUid:'persona_001',routeId:'route_001',
  status:'active',killSwitch:true,blockLocalNetwork:true},
  'firefox-container-002':{personaUid:'persona_002',routeId:'direct'}}});
test('S01 donor fence mutation selector preserves unconnected ordinary Persona edits',()=>{
 const old=state(),updated=structuredClone(old);
 updated.profiles['firefox-container-002'].routeId='block';
 updated.global.profileNamePrefix='New name';
 assert.deepEqual(bindingTagChanges(old,updated),{ok:true,held:[]});
 const security=structuredClone(old);
 security.global.webRTCMode='unchanged';
 assert.deepEqual(bindingTagChanges(old,security),{ok:true,held:['binding_001']});
 const policy=structuredClone(old);
 policy.profiles['firefox-container-001'].domainMode='allowlist';
 assert.deepEqual(bindingTagChanges(old,policy),{ok:true,held:['binding_001']});
});
test('S01 donor fence prevents tag removal, untrusted insertion or context substitution',()=>{
 const old=state();
 for(const change of [
   s=>{delete s.profiles['firefox-container-001'].pcmsBindingId;},
   s=>{s.profiles['firefox-container-001'].pcmsBindingId='binding_other_001';},
   s=>{delete s.profiles['firefox-container-001'];},
   s=>{s.profiles['firefox-container-002'].pcmsBindingId='binding_002';},
   s=>{s.profiles['firefox-container-001'].personaUid='persona_other';}
 ]) {
   const modified=structuredClone(old);change(modified);
   assert.equal(bindingTagChanges(old,modified).code,'PCMS_BINDING_TAG_MUTATION_HELD');
 }
});
test('S01 donor fence revokes synchronously before async write; failed write cannot reopen old grant',async()=>{
 const calls=[];
 installDonorAdmissionFence({invalidateNow:({bindingId,reason})=>calls.push({bindingId,reason})});
 const old=state(),next=structuredClone(old);
 next.routes.route_001.host='198.51.100.4';
 const gate=new Promise((resolve,reject)=>{
  beforeDonorStateCommit(old,next);
  assert.equal(calls.length,1);
  reject(new Error('SIMULATED_PERSIST_FAILURE'));
 });
 await assert.rejects(gate,/SIMULATED_PERSIST_FAILURE/);
 assert.deepEqual(calls,[{bindingId:'binding_001',reason:'ROUTE_DRIFT'}]);
 const wrong=structuredClone(old);wrong.profiles['firefox-container-001'].routeId='direct';
 beforeDonorStateCommit(old,wrong);
 assert.equal(calls.length,2);
});
