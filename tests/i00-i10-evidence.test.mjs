import test from 'node:test';
import assert from 'node:assert/strict';
import {initialPrompt,revisePrompt,importPrompt,exportPrompt,beginAiJob,applyAiEvidence,evaluation} from '../src/runtime/ai-evidence.mjs';
const A='a'.repeat(64), B='b'.repeat(64), S1='1'.repeat(64),S2='2'.repeat(64);
const stage={slug:'private-one',revision:8,state:'SOURCE_VERIFIED',accountId:'account-1',
  candidate:{fingerprint:A},previous:{fingerprint:B}};
const prompt={revision:5,text:'Independent generator smoke',tests:['smoke','visible']};
const optional={sha256:'c'.repeat(64),text:'Independent injected checks',tests:['optional']};
const start=(second=false)=>beginAiJob({stage,prompt,optionalTesting:second?optional:null}).job;
const send=(job,e)=>{const r=applyAiEvidence(job,e);assert.equal(r.ok,true,r.code);return r.job};
const session=(chat,digest,extra={})=>({type:'SESSION',chat,sessionDigest:digest,...extra});
const pass=(chat,name,fp=A)=>({type:'TEST',chat,name,sourceFingerprint:fp,
  independentSource:'INDEPENDENT_BROWSER_ASSERTION',observedAt:1700000000000,result:'PASS'});
test('P52-05: prose success, SSE completion and arbitrary tool output cannot certify a single test',()=>{
  let j=start();
  assert.equal(evaluation(j).state,'TESTS_UNVERIFIED');
  for(const type of ['ASSISTANT_DONE','SETTLED_HISTORY','TOOL_OUTPUT','COMMIT_MESSAGE']){
    const r=applyAiEvidence(j,{type,chat:1,text:'ALL TESTS PASS'});
    assert.equal(r.ok,false);assert.equal(r.code,'AI_EVIDENCE_INVALID');
  }
  j=send(j,session(1,S1));
  assert.equal(evaluation(j).state,'TESTS_UNVERIFIED');
  assert.equal(applyAiEvidence(j,{...pass(1,'smoke'),independentSource:'AI_PROSE'}).ok,false);
  assert.equal(applyAiEvidence(j,{...pass(1,'unknown')}).ok,false);
  j=send(j,pass(1,'smoke'));
  assert.equal(evaluation(j).state,'TESTS_UNVERIFIED');
  j=send(j,pass(1,'visible'));
  assert.equal(evaluation(j).state,'TESTS_VERIFIED');
  assert.equal(j.verifiedFinal,A);
});
test('P52-05: known failure is not reclassified as an unavailable test',()=>{
  let j=send(start(),session(1,S1));
  j=send(j,{...pass(1,'smoke'),result:'FAIL'});
  assert.equal(evaluation(j).state,'KNOWN_FAILURE');
  assert.equal(applyAiEvidence(j,{...pass(1,'visible'),observedAt:0}).ok,false);
  j=send(j,pass(1,'visible'));
  assert.equal(evaluation(j).state,'KNOWN_FAILURE');
});
test('P52-06: Chat 2 requires Chat 1 tests and proven different reset session',()=>{
  let j=send(start(true),session(1,S1));
  assert.equal(applyAiEvidence(j,session(2,S2,{freshProof:true,resetObserved:true})).code,'FRESH_CHAT_UNVERIFIED');
  j=send(j,pass(1,'smoke'));j=send(j,pass(1,'visible'));
  assert.equal(evaluation(j).state,'TESTS_UNVERIFIED');
  assert.equal(applyAiEvidence(j,session(2,S1,{freshProof:true,resetObserved:true})).code,'FRESH_CHAT_UNVERIFIED');
  assert.equal(applyAiEvidence(j,session(2,S2,{freshProof:false,resetObserved:true})).code,'FRESH_CHAT_UNVERIFIED');
  j=send(j,session(2,S2,{freshProof:true,resetObserved:true}));
  j=send(j,pass(2,'optional'));
  assert.equal(evaluation(j).state,'TESTS_VERIFIED');
});
test('P52-06: a saved repair invalidates both chats and requires same final F',()=>{
  let j=send(start(true),session(1,S1));
  j=send(j,pass(1,'smoke'));j=send(j,pass(1,'visible'));
  j=send(j,session(2,S2,{freshProof:true,resetObserved:true}));
  j=send(j,pass(2,'optional'));
  assert.equal(evaluation(j).state,'TESTS_VERIFIED');
  j=send(j,{type:'SAVED_READBACK',chat:2,sourceFingerprint:B,
    independentSource:'GUARDED_NATIVE_FULL_SOURCE',cleanEditor:true,ownerVerified:true});
  assert.equal(evaluation(j).state,'TESTS_UNVERIFIED');
  assert.equal(j.verifiedFinal,null);
  assert.equal(j.changes.length,1);
  assert.equal(applyAiEvidence(j,pass(2,'optional',A)).ok,false);
  j=send(j,pass(2,'optional',B));
  assert.equal(evaluation(j).state,'TESTS_UNVERIFIED');
  j=send(j,pass(1,'smoke',B));
  j=send(j,pass(1,'visible',B));
  assert.equal(evaluation(j).state,'TESTS_VERIFIED');
  assert.equal(j.verifiedFinal,B);
});
test('P52-06: native interrupted session requires held reconciliation',()=>{
  let j=send(start(true),session(1,S1));
  j=send(j,{type:'INTERRUPT',chat:1});
  assert.equal(j.state,'HELD_RECONCILE');
  assert.equal(j.hold,'RECHECK_NATIVE_SOURCE_AND_SESSION');
  assert.equal(applyAiEvidence(j,{type:'SAVED_READBACK',chat:1,sourceFingerprint:B,
    independentSource:'AI_PROSE',cleanEditor:true,ownerVerified:true}).ok,false);
});
test('S6-I10 prompt import/export uses a new revision and pins running jobs',()=>{
  const old=initialPrompt(),before=beginAiJob({stage,prompt:old[0]}).job;
  assert.equal(before.prompt.revision,1);
  const revised=revisePrompt(old,{text:'Revision two',tests:['smoke']},1);
  assert.equal(revised.ok,true);
  const exported=exportPrompt(revised.history);
  assert.equal(exported.format,'PCMS_AI_PROMPT_V1');
  const imported=importPrompt(revised.history,exported,2);
  assert.equal(imported.ok,true);
  assert.equal(imported.history.at(-1).revision,3);
  assert.equal(before.prompt.revision,1);
  assert.equal(revisePrompt(imported.history,{text:'stale',tests:['x']},1).code,'PROMPT_REVISION_STALE');
  assert.equal(importPrompt(imported.history,{format:'PCMS_AI_PROMPT_V1',history:[{revision:1,text:'bad',tests:['x']},{revision:5,text:'oops',tests:['x']}]},3).code,'PROMPT_IMPORT_INVALID');
});
test('P52-05: no known invalid source, missing verified stage or arbitrary source proof admitted',()=>{
  assert.equal(beginAiJob({stage:{...stage,state:'PINNED'},prompt}).code,'VERIFIED_STAGED_SOURCE_REQUIRED');
  assert.equal(beginAiJob({stage,prompt,optionalTesting:{...optional,sha256:'bad'}}).code,'TESTING_INPUT_INVALID');
  let j=send(start(),session(1,S1));
  assert.equal(applyAiEvidence(j,{type:'SAVED_READBACK',chat:1,sourceFingerprint:B,
    independentSource:'GUARDED_NATIVE_FULL_SOURCE',cleanEditor:false,ownerVerified:true}).ok,false);
  assert.equal(applyAiEvidence(j,{type:'TEST',chat:1,name:'smoke',sourceFingerprint:B,
    independentSource:'INDEPENDENT_BROWSER_ASSERTION',observedAt:1,result:'PASS'}).ok,false);
});
