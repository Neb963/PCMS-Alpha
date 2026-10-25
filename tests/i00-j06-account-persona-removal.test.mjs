import test from 'node:test';
import assert from 'node:assert/strict';
import {issueBoundPersonaDeletePermit,beforeDonorStateCommit} from '../src/runtime/pcms-donor-fence.mjs';
const bindingId='binding_fixture',personaUid='11111111-1111-4111-8111-111111111111',contextId='firefox-container-1';
const before=()=>({global:{unmanagedPolicy:'block'},profiles:{[contextId]:{pcmsBindingId:bindingId,personaUid},unrelated:{personaUid:'untouched'}},scripts:{s:{code:'EXACT SOURCE',profileIds:[contextId,'unrelated']}},workflows:{w:{steps:[{profileId:contextId},{profileId:'unrelated'}]}}});
const removal=value=>{const next=structuredClone(value);delete next.profiles[contextId];next.scripts.s.profileIds=['unrelated'];next.workflows.w.steps[0].profileId='';return next};
test('explicit account removal permit allows exactly donor cleanup once; ordinary import/tag deletion stays blocked',()=>{
 const a=before(),b=removal(a),permit=()=>issueBoundPersonaDeletePermit({bindingId,personaUid,contextId});
 assert.throws(()=>beforeDonorStateCommit(a,b),e=>e.code==='PCMS_BINDING_TAG_MUTATION_HELD');
 const once=permit();assert.equal(beforeDonorStateCommit(a,b,once).ok,true);
 assert.throws(()=>beforeDonorStateCommit(a,b,once),e=>e.code==='PCMS_BINDING_CREATE_UNAUTHORIZED');
 for(const change of [v=>v.profiles.unrelated.personaUid='changed',v=>v.scripts.s.code+=' altered',v=>v.global.unmanagedPolicy='direct',v=>v.workflows.w.steps[1].profileId='',v=>v.profiles.unrelated.pcmsBindingId=bindingId]){
  const altered=structuredClone(b);change(altered);assert.throws(()=>beforeDonorStateCommit(a,altered,permit()),e=>e.code==='PCMS_BINDING_CREATE_UNAUTHORIZED');
 }
 assert.throws(()=>beforeDonorStateCommit(a,b,issueBoundPersonaDeletePermit({bindingId:'wrong_binding',personaUid,contextId})),e=>e.code==='PCMS_BINDING_CREATE_UNAUTHORIZED');
});
