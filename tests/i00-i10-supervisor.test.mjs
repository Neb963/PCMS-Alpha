import test from 'node:test';
import assert from 'node:assert/strict';
import {planAiStep} from '../src/runtime/ai-supervisor.mjs';
const H='a'.repeat(64),J='b'.repeat(64),S1='1'.repeat(64),S2='2'.repeat(64);
const chat=(sid,tests={})=>({sessionDigest:sid,tests,state:sid?'RUNNING':'PENDING'});
const job=(props={})=>({slug:'unit-generator',revision:6,state:'TESTS_UNVERIFIED',
  sourceFingerprint:H,prompt:{revision:1,tests:['default_generator_smoke']},
  chat1:chat(S1),chat2:null,optionalTesting:null,
  native:{step:'CHAT1_SEND',state:'CHAT1_OBSERVED_IDLE',sessionDigest:S1},
  finalSource:{fingerprint:H},...props});
const pass=(fingerprint=H)=>({result:'PASS',sourceFingerprint:fingerprint});
test('P52-05 F: one step at a time and never auto-replay possible native effect',()=>{
  assert.deepEqual(planAiStep(job({native:null})),{
    ok:true,type:'BEGIN_NATIVE',step:'CHAT1_SEND',revision:6});
  assert.deepEqual(planAiStep(job({native:{state:'DISPATCH_POSSIBLE'}})),{
    ok:true,type:'PROBE_NATIVE',revision:6,effect:'READ_ONLY_RECONCILE'});
  assert.equal(planAiStep(job({native:{state:'STOP_OBSERVED'}})).code,
    'AI_NATIVE_SESSION_RECONCILIATION_REQUIRED');
  assert.equal(planAiStep(job({state:'HELD_NO_PROGRESS'})).ok,false);
  assert.equal(planAiStep(job({executionSlotReleased:true})).code,'AI_VERIFIED_REVIEW_REQUIRED');
});
test('P52-05 F: only observed source and recognized independent assertions advance',()=>{
  assert.equal(planAiStep(job({finalSource:null})).type,'PROBE_NATIVE');
  assert.equal(planAiStep(job()).type,'RUN_TESTS');
  assert.equal(planAiStep(job({prompt:{tests:['unknown_unobservable']}})).code,
    'UNSUPPORTED_REQUIRED_ASSERTIONS');
  assert.equal(planAiStep(job({native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:S2}})).code,
    'AI_SESSION_IDENTITY_MISMATCH');
  assert.equal(planAiStep(job({state:'TESTS_VERIFIED'})).code,'AI_VERIFIED_REVIEW_REQUIRED');
});
test('P52-06 F: fresh Chat 2 starts only after exact final Chat 1 test PASS',()=>{
  const base=job({optionalTesting:{sha256:'c'.repeat(64),
    tests:['default_generator_smoke']},chat2:chat(null)});
  const first=planAiStep(base);assert.equal(first.type,'RUN_TESTS');
  const done=job({...base,chat1:chat(S1,{default_generator_smoke:pass()})});
  const reset=planAiStep(done);assert.equal(reset.step,'CHAT2_RESET');
  const pending=planAiStep(job({...done,native:{step:'CHAT2_RESET',
    state:'CHAT2_RESET_OBSERVED',sessionDigest:null}}));
  assert.equal(pending.step,'CHAT2_SEND');
  const invalid=planAiStep(job({...done,native:{step:'CHAT2_RESET',
    state:'CHAT2_RESET_OBSERVED',sessionDigest:null},chat2:chat(S1)}));
  assert.equal(invalid.code,'AI_FRESH_CHAT_RECONCILIATION_REQUIRED');
});
test('P52-06 X: final Chat2 source changes force Chat1 retest on F, not stale pass',()=>{
  const n={step:'CHAT2_SEND',state:'CHAT2_OBSERVED_IDLE',sessionDigest:S2};
  const j=job({sourceFingerprint:J,finalSource:{fingerprint:J},
    native:n,chat1:chat(S1,{default_generator_smoke:pass(H)}),
    chat2:{...chat(S2),state:'FRESH_VERIFIED'},
    optionalTesting:{tests:['default_generator_smoke']}});
  let step=planAiStep(j);assert.equal(step.type,'RUN_TESTS');assert.equal(step.chat,1);
  step=planAiStep({...j,chat1:chat(S1,{default_generator_smoke:pass(J)})});
  assert.equal(step.type,'RUN_TESTS');assert.equal(step.chat,2);
  const known=planAiStep({...j,state:'KNOWN_FAILURE'});assert.equal(known.step,'CHAT2_REPAIR');
});

test('P52-06 X: distinct native Chat2 SID without independent OPFS isolation cannot test, PASS or release',()=>{
  const unfinished=job({sourceFingerprint:J,finalSource:{fingerprint:J},
    native:{step:'CHAT2_SEND',state:'CHAT2_OBSERVED_IDLE',sessionDigest:S2},
    chat1:chat(S1,{default_generator_smoke:pass(H)}),
    chat2:{...chat(S2),state:'FRESH_OBSERVED'},
    optionalTesting:{tests:['default_generator_smoke']}});
  const policy=planAiStep(unfinished);
  assert.equal(policy.type,'RUN_TESTS');
  assert.equal(policy.chat,1);
  const afterChat1={...unfinished,chat1:chat(S1,{
    default_generator_smoke:pass(J)})};
  const next=planAiStep(afterChat1);
  assert.equal(next.type,'VERIFY_FRESH_CHAT2');
  assert.equal(next.effect,'GATED_READ_ONLY_HISTORY');
  assert.equal(next.step,undefined);
  assert.equal(planAiStep({...unfinished,executionSlotReleased:true}).code,
    'AI_VERIFIED_REVIEW_REQUIRED');
});
