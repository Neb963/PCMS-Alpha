import test from 'node:test';
import assert from 'node:assert/strict';
import {bindingTagChanges,beforeDonorStateCommit,issueBoundPersonaCreatePermit,issueExistingPersonaTagPermit} from '../src/runtime/pcms-donor-fence.mjs';

const state=()=>({global:{unmanagedPolicy:'block'},routes:{
 'route_001':{id:'route_001',enabled:true,host:'10.124.0.2'}},
 profiles:{'firefox-container-001':{
  pcmsBindingId:'binding_001',personaUid:'persona_001',routeId:'route_001',
  status:'active',managed:true,killSwitch:true,blockLocalNetwork:true},
  'firefox-container-002':{personaUid:'persona_002',routeId:'__direct__'}}});
const created=(s,overrides={})=>{
 const next=structuredClone(s);
 next.profiles['firefox-container-003']={pcmsBindingId:'binding_new_003',personaUid:'persona_003',
  routeId:'__block__',status:'active',managed:true,killSwitch:true,blockLocalNetwork:true,...overrides};
 return next;
};
test('S01 donor fence: ordinary edits and tagged route changes pass (the per-request pin enforces routes)',()=>{
 const old=state(),updated=structuredClone(old);
 updated.profiles['firefox-container-002'].routeId='__block__';
 updated.profiles['firefox-container-001'].routeId='route_other';
 assert.deepEqual(bindingTagChanges(old,updated),{ok:true});
 assert.doesNotThrow(()=>beforeDonorStateCommit(old,updated));
});
test('S01 donor fence: tag removal, transplant, insertion or Persona substitution is refused',()=>{
 const old=state();
 for(const change of [
   s=>{delete s.profiles['firefox-container-001'].pcmsBindingId;},
   s=>{s.profiles['firefox-container-001'].pcmsBindingId='binding_other_001';},
   s=>{delete s.profiles['firefox-container-001'];},
   s=>{s.profiles['firefox-container-002'].pcmsBindingId='binding_002';},
   s=>{s.profiles['firefox-container-001'].personaUid='persona_other';},
   s=>{Object.assign(s,created(s));}
 ]) {
   const modified=structuredClone(old);change(modified);
   assert.equal(bindingTagChanges(old,modified).code,'PCMS_BINDING_TAG_MUTATION_HELD');
   assert.throws(()=>beforeDonorStateCommit(old,modified),{code:'PCMS_BINDING_TAG_MUTATION_HELD'});
 }
});
test('S01 donor fence: one-shot permit creates exactly one NEW Block-routed tagged Persona and nothing else',()=>{
 const old=state();
 const permit=issueBoundPersonaCreatePermit({bindingId:'binding_new_003'});
 assert.deepEqual(beforeDonorStateCommit(old,created(old),permit),{ok:true,created:true});
 assert.throws(()=>beforeDonorStateCommit(old,created(old),permit),{code:'PCMS_BINDING_CREATE_UNAUTHORIZED'},'single use');
 for(const bad of [
   s=>created(s,{routeId:'route_001'}),          // must start on donor Block
   s=>created(s,{routeId:'__direct__'}),
   s=>created(s,{killSwitch:false}),
   s=>created(s,{pcmsBindingId:'binding_001'}),  // transplant existing binding
   s=>{const n=created(s);n.global.unmanagedPolicy='direct';return n;},
   s=>{const n=created(s);n.profiles['firefox-container-002'].routeId='route_001';return n;},
   s=>structuredClone(s)                          // nothing created
 ]){
   const p=issueBoundPersonaCreatePermit({bindingId:'binding_new_003'});
   assert.throws(()=>beforeDonorStateCommit(old,bad(old),p),{code:'PCMS_BINDING_CREATE_UNAUTHORIZED'});
 }
 assert.throws(()=>beforeDonorStateCommit(old,created(old),{bindingId:'binding_new_003'}),
   {code:'PCMS_BINDING_CREATE_UNAUTHORIZED'},'forged permit object');
});

test('S01 donor fence: in-place TAG permit adds one tag to one existing untagged Persona and changes nothing else',()=>{
 const old=state();old.profiles['firefox-container-002'].managed=true;
 const unmanaged=state();
 assert.throws(()=>beforeDonorStateCommit(unmanaged,(()=>{const n=structuredClone(unmanaged);
   n.profiles['firefox-container-002'].pcmsBindingId='binding_legacy_002';return n;})(),
   issueExistingPersonaTagPermit({bindingId:'binding_legacy_002',contextId:'firefox-container-002',personaUid:'persona_002'})),
   {code:'PCMS_BINDING_CREATE_UNAUTHORIZED'},'unmanaged Persona is never tagged');
 const tag=s=>{const n=structuredClone(s);n.profiles['firefox-container-002'].pcmsBindingId='binding_legacy_002';return n;};
 const permit=()=>issueExistingPersonaTagPermit({bindingId:'binding_legacy_002',contextId:'firefox-container-002',personaUid:'persona_002'});
 const p=permit();
 assert.deepEqual(beforeDonorStateCommit(old,tag(old),p),{ok:true,created:true});
 assert.throws(()=>beforeDonorStateCommit(old,tag(old),p),{code:'PCMS_BINDING_CREATE_UNAUTHORIZED'},'single use');
 for(const bad of [
   s=>{const n=tag(s);n.profiles['firefox-container-002'].routeId='route_001';return n;},
   s=>{const n=tag(s);n.global.unmanagedPolicy='direct';return n;},
   s=>{const n=structuredClone(s);n.profiles['firefox-container-001'].pcmsBindingId='binding_legacy_002';return n;},
   s=>{const n=tag(s);n.profiles['firefox-container-002'].personaUid='persona_x';return n;}
 ])assert.throws(()=>beforeDonorStateCommit(old,bad(old),permit()),{code:'PCMS_BINDING_CREATE_UNAUTHORIZED'});
 const wrongPersona=issueExistingPersonaTagPermit({bindingId:'binding_legacy_002',contextId:'firefox-container-002',personaUid:'persona_999'});
 assert.throws(()=>beforeDonorStateCommit(old,tag(old),wrongPersona),{code:'PCMS_BINDING_CREATE_UNAUTHORIZED'});
});
