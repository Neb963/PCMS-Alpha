// I10 deterministic verification policy. Neither helper prose nor a UI message is an oracle.
// Trusted callers independently check the native saved-source ledger and browser assertions.
import {fail} from './journal.mjs';
const HEX=/^[a-f0-9]{64}$/;
const testName=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(s);
const promptText=s=>typeof s==='string'&&s.length>0&&s.length<=16000&&!s.includes('\0');
const canonicalTests=a=>Array.isArray(a)&&a.length>0&&a.length<=64&&
  a.every(testName)&&new Set(a).size===a.length;
export const DEFAULT_AI_PROMPT='Test the current saved generator. Report observed failures, repair only main PJS and HTML, save, and retest. Do not assume text alone proves tests passed. Do not touch src assets, GitHub, account settings, publication or routing.';
export function validPromptRevision(revision){
  return revision&&Number.isSafeInteger(revision.revision)&&revision.revision>0&&
    promptText(revision.text)&&canonicalTests(revision.tests);
}
export function revisePrompt(history,{text,tests},expectedRevision){
  if(!Array.isArray(history)||history.length<1||history.length>200||
     !history.every(validPromptRevision)||history.at(-1).revision!==expectedRevision)
    return fail('PROMPT_REVISION_STALE');
  if(!promptText(text)||!canonicalTests(tests))return fail('PROMPT_INVALID');
  const revision=expectedRevision+1;
  if(!Number.isSafeInteger(revision))return fail('PROMPT_REVISION_OVERFLOW');
  return {ok:true,history:[...history,{revision,text,tests:[...tests]}]};
}
export function initialPrompt(){
  return [{revision:1,text:DEFAULT_AI_PROMPT,tests:['default_generator_smoke']}];
}
export function exportPrompt(history){
  if(!Array.isArray(history)||!history.every(validPromptRevision))return fail('PROMPT_INVALID');
  return {ok:true,format:'PCMS_AI_PROMPT_V1',history:structuredClone(history)};
}
export function importPrompt(history,envelope,expectedRevision){
  if(envelope?.format!=='PCMS_AI_PROMPT_V1'||!Array.isArray(envelope.history)||
     envelope.history.length<1||envelope.history.length>200||
     !envelope.history.every(validPromptRevision)||
     envelope.history.some((v,i)=>v.revision!==i+1))
    return fail('PROMPT_IMPORT_INVALID');
  const latest=envelope.history.at(-1);
  return revisePrompt(history,{text:latest.text,tests:latest.tests},expectedRevision);
}
export function beginAiJob({stage,prompt,optionalTesting=null}){
  if(stage?.state!=='SOURCE_VERIFIED'||!HEX.test(stage?.candidate?.fingerprint||'')||
     !HEX.test(stage?.previous?.fingerprint||'')||
     !validPromptRevision(prompt)||typeof stage.slug!=='string'||
     !Number.isSafeInteger(stage.revision)||stage.revision<1)
    return fail('VERIFIED_STAGED_SOURCE_REQUIRED');
  if(optionalTesting!==null&&
     (!HEX.test(optionalTesting.sha256||'')||!canonicalTests(optionalTesting.tests)||
      !promptText(optionalTesting.text)))return fail('TESTING_INPUT_INVALID');
  return {ok:true,job:{
    schema:1,slug:stage.slug,stageRevision:stage.revision,
    sourceFingerprint:stage.candidate.fingerprint,
    prompt:structuredClone(prompt),
    optionalTesting:optionalTesting&&structuredClone(optionalTesting),
    revision:1,state:'PENDING_NATIVE_SESSION',turns:0,
    chat1:{state:'PENDING',sessionDigest:null,tests:{}},
    chat2:optionalTesting?{state:'PENDING',sessionDigest:null,tests:{}}:null,
    changes:[],hold:'NATIVE_AI_ACTIVATION_NOT_PROVEN',verifiedFinal:null
  }};
}
const required=(j,c)=>c===1?j.prompt.tests:j.optionalTesting?.tests;
const allPass=(tests,requiredNames,fingerprint)=>
  Array.isArray(requiredNames)&&requiredNames.every(name=>
    tests[name]?.result==='PASS'&&tests[name]?.sourceFingerprint===fingerprint);
export function evaluation(job){
  if(!job||!HEX.test(job.sourceFingerprint||''))return fail('JOB_INVALID');
  const required1=required(job,1),required2=required(job,2);
  const knownFailure=[job.chat1,job.chat2].filter(Boolean)
    .some(c=>Object.values(c.tests).some(t=>t.result==='FAIL'&&
      t.sourceFingerprint===job.sourceFingerprint));
  const chat1Pass=allPass(job.chat1.tests,required1,job.sourceFingerprint);
  const chat2Pass=!job.chat2||(
    job.chat2.state==='FRESH_VERIFIED' &&
    job.chat1.sessionDigest!==job.chat2.sessionDigest &&
    allPass(job.chat2.tests,required2,job.sourceFingerprint));
  return {ok:true,state:knownFailure?'KNOWN_FAILURE':
    chat1Pass&&chat2Pass?'TESTS_VERIFIED':'TESTS_UNVERIFIED',
    exactSource:job.sourceFingerprint,chat1Pass,chat2Pass,
    defaultPromptRevision:job.prompt.revision,
    optionalTestingSha:job.optionalTesting?.sha256||null};
}
// The transition function is pure; the privileged boundary may supply observations
// only after checking native tab ownership, session freshness and test execution.
export function applyAiEvidence(job,entry){
  if(!job||job.schema!==1||!entry||typeof entry!=='object')
    return fail('AI_EVIDENCE_INVALID');
  if(job.state==='HUMAN_OWNED')return fail('HUMAN_EDITOR_HOLD');
  // A Firefox restart/unknown native call invalidates confidence in the
  // in-memory helper session. A later prose/test reply cannot lift the hold.
  if(job.state==='HELD_RECONCILE')return fail('AI_NATIVE_SESSION_RECONCILIATION_REQUIRED');
  const j=structuredClone(job);
  const chat=entry.chat===1?j.chat1:entry.chat===2?j.chat2:null;
  if(!chat)return fail('CHAT_NOT_APPLICABLE');
  if(entry.type==='SESSION'){
    if(chat.sessionDigest||chat.state!=='PENDING'||!HEX.test(entry.sessionDigest||''))
      return fail('SESSION_ALREADY_STARTED');
    if(entry.chat===2&&(evaluation(j).chat1Pass!==true||
       entry.freshProof!==true||entry.resetObserved!==true||
       entry.sessionDigest===j.chat1.sessionDigest))
      return fail('FRESH_CHAT_UNVERIFIED');
    chat.sessionDigest=entry.sessionDigest;
    chat.state=entry.chat===2?'FRESH_VERIFIED':'RUNNING';
  }else if(entry.type==='SAVED_READBACK'){
    if(!chat.sessionDigest||!HEX.test(entry.sourceFingerprint||'')||
       entry.independentSource!=='GUARDED_NATIVE_FULL_SOURCE'||
       entry.cleanEditor!==true||entry.ownerVerified!==true)
      return fail('SOURCE_READBACK_UNVERIFIED');
    if(entry.sourceFingerprint!==j.sourceFingerprint){
      j.sourceFingerprint=entry.sourceFingerprint;
      j.chat1.tests={};if(j.chat2)j.chat2.tests={};
      j.changes.push({fingerprint:entry.sourceFingerprint,kind:'NATIVE_SOURCE_REPAIRED'});
      if(j.changes.length>256){j.state='HELD_NO_PROGRESS';j.hold='REPAIR_RESOURCE_BOUND';}
    }
  }else if(entry.type==='TEST'){
    if(!chat.sessionDigest||!testName(entry.name)||
       !required(j,entry.chat)?.includes(entry.name)||
       entry.sourceFingerprint!==j.sourceFingerprint||
       entry.independentSource!=='INDEPENDENT_BROWSER_ASSERTION'||
       !Number.isSafeInteger(entry.observedAt)||entry.observedAt<=0||
       (entry.result!=='PASS'&&entry.result!=='FAIL'))
      return fail('INDEPENDENT_TEST_EVIDENCE_REQUIRED');
    chat.tests[entry.name]={result:entry.result,sourceFingerprint:entry.sourceFingerprint,
      observedAt:entry.observedAt};
  }else if(entry.type==='INTERRUPT'){
    j.state='HELD_RECONCILE';j.hold='RECHECK_NATIVE_SOURCE_AND_SESSION';
    j.revision++;return {ok:true,job:j,decision:evaluation(j)};
  }else return fail('AI_EVIDENCE_INVALID');
  if(j.state!=='HELD_NO_PROGRESS'){
    const decision=evaluation(j);
    j.state=decision.state;
    j.hold=decision.state==='TESTS_VERIFIED'?null:
      decision.state==='KNOWN_FAILURE'?'KNOWN_FAILURE':'TESTS_UNVERIFIED';
    j.verifiedFinal=decision.state==='TESTS_VERIFIED'?j.sourceFingerprint:null;
  }
  j.revision++;
  return {ok:true,job:j,decision:evaluation(j)};
}
