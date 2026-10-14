import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {beginAiJob,applyAiEvidence,evaluation} from '../src/runtime/ai-evidence.mjs';
import {releaseTestContext} from '../src/runtime/release-core.mjs';
globalThis.crypto??=webcrypto;
const F=(path,body)=>({path,base64:Buffer.from(body).toString('base64')});
const session='d'.repeat(64);
test('P56-07 F/X: Chat1 F1 PASS cannot authorize modified F2 or synthetic Chat2 identity',async()=>{
  const f1=await exactSource([F('main.pjs','original'),F('index.html','<p>old</p>'),
    F('src/datum.bin',Buffer.from([0,255,1]))]);
  const f2=await exactSource([F('main.pjs','repaired'),F('index.html','<p>new</p>'),
    F('src/datum.bin',Buffer.from([0,255,2]))]);
  assert(f1.ok&&f2.ok&&f1.fingerprint!==f2.fingerprint);
  const stage={state:'SOURCE_VERIFIED',slug:'test-ai-composite',revision:4,
    candidate:{fingerprint:f1.fingerprint},previous:{fingerprint:'a'.repeat(64)}};
  const prompt={revision:3,text:'Run independently observable tests',
    tests:['default_generator_smoke']};
  const begun=beginAiJob({stage,prompt,optionalTesting:{
    sha256:'b'.repeat(64),text:'Additional test',tests:['additional_check']}});
  assert.equal(begun.ok,true);
  let job=begun.job;
  const update=e=>{const result=applyAiEvidence(job,e);
    assert.equal(result.ok,true,result.code);job=result.job;};
  update({type:'SESSION',chat:1,sessionDigest:session});
  assert.equal(applyAiEvidence(job,{type:'TEST',chat:1,name:'default_generator_smoke',
    result:'PASS',sourceFingerprint:f1.fingerprint,
    independentSource:'AI_PROSE',observedAt:1700000000000}).ok,false);
  update({type:'TEST',chat:1,name:'default_generator_smoke',
    result:'PASS',sourceFingerprint:f1.fingerprint,
    independentSource:'INDEPENDENT_BROWSER_ASSERTION',observedAt:1700000000000});
  assert.equal(evaluation(job).chat1Pass,true);
  assert.equal(evaluation(job).state,'TESTS_UNVERIFIED');
  update({type:'SAVED_READBACK',chat:1,sourceFingerprint:f2.fingerprint,
    independentSource:'GUARDED_NATIVE_FULL_SOURCE',cleanEditor:true,
    ownerVerified:true});
  assert.equal(job.sourceFingerprint,f2.fingerprint);
  assert.deepEqual(job.chat1.tests,{});
  assert.equal(job.verifiedFinal,null);
  assert.equal(applyAiEvidence(job,{type:'TEST',chat:1,name:'default_generator_smoke',
    result:'PASS',sourceFingerprint:f1.fingerprint,
    independentSource:'INDEPENDENT_BROWSER_ASSERTION',observedAt:1700000000100}).ok,false);
  assert.equal(applyAiEvidence(job,{type:'SESSION',chat:2,
    sessionDigest:'e'.repeat(64)}).code,'AI_CHAT2_ISOLATION_UNVERIFIED');
  assert.equal(applyAiEvidence(job,{type:'TEST',chat:2,name:'additional_check',
    result:'PASS',sourceFingerprint:f2.fingerprint,
    independentSource:'INDEPENDENT_BROWSER_ASSERTION',
    observedAt:1700000000200}).code,'AI_CHAT2_ISOLATION_UNVERIFIED');
  assert.equal(evaluation(job).state,'TESTS_UNVERIFIED');
  assert.equal(releaseTestContext(stage,job).code,'RELEASE_TESTS_STALE_OR_UNVERIFIED');
  update({type:'INTERRUPT',chat:1});
  assert.equal(job.state,'HELD_RECONCILE');
  assert.equal(applyAiEvidence(job,{type:'TEST',chat:1,name:'default_generator_smoke',
    result:'PASS',sourceFingerprint:f2.fingerprint,
    independentSource:'INDEPENDENT_BROWSER_ASSERTION',
    observedAt:1700000000300}).code,'AI_NATIVE_SESSION_RECONCILIATION_REQUIRED');
});
