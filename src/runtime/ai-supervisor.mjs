// I10 single-step, source-bound AI supervisor. Pure scheduling policy: every
// external attempt still goes through canonical armNative, the donor lease,
// and the separately authorized effect gate. A decision is not an effect or a
// test oracle. Unknown test semantics and uncertain AI dispatch always hold.
import {supportedDeclarativeAssertion} from './ai-declarative-assertion.mjs';
const idle = new Set(['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE']);
const actionable = new Set(['PENDING_NATIVE_SESSION','TESTS_UNVERIFIED','KNOWN_FAILURE']);
const sameF=(test,source)=>test?.result==='PASS'&&test.sourceFingerprint===source;
const chatReady=(job,n)=>n===1?!!job.chat1.sessionDigest:
  !!job.chat2?.sessionDigest&&job.chat2.state==='FRESH_VERIFIED'&&
  job.chat2.sessionDigest!==job.chat1?.sessionDigest;
export function planAiStep(job,{oracleNames=['default_generator_smoke']}={}){
  const hold=(code)=>({ok:false,code,effect:'NONE'});
  if(!job||!Number.isSafeInteger(job.revision)||job.revision<1||
     typeof job.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(job.slug)||
     !/^[a-f0-9]{64}$/.test(job.sourceFingerprint||'')||
     !job.prompt?.tests?.length||!job.chat1)
    return hold('AI_JOB_UNVERIFIED');
  if(job.operatorPaused===true){
    if(job.native?.state==='DISPATCH_POSSIBLE')return {ok:true,type:'PROBE_NATIVE',effect:'READ_ONLY_RECONCILE'};
    if(job.native?.state==='RUNNING_OBSERVED')return {ok:true,type:'BEGIN_NATIVE',step:'STOP'};
    if(idle.has(job.native?.state)&&!job.executionSlotReleased)return {ok:true,type:'PROBE_NATIVE',effect:'READ_ONLY_FULL_SOURCE'};
    return hold('AI_OPERATOR_PAUSED');
  }
  if(job.state==='HELD_NO_PROGRESS'||job.state==='HUMAN_OWNED')
    return hold(job.hold||'AI_TERMINAL_HOLD');
  if(job.exceptionFrozen)return hold('AI_EXCEPTION_REVIEW_FROZEN');
  if(job.awaitingExecutionSlot===true)return {ok:true,type:'ADMIT_JOB',revision:job.revision,effect:'LOCAL_CAPACITY_ONLY'};
  if(job.executionSlotReleased===true||job.state==='TESTS_VERIFIED')
    return hold('AI_VERIFIED_REVIEW_REQUIRED');
  if(!actionable.has(job.state)&&job.state!=='HELD_RECONCILE')
    return hold('AI_STATE_UNSUPPORTED');
  const native=job.native;
  if(!native)
    return {ok:true,type:'BEGIN_NATIVE',step:'CHAT1_SEND',revision:job.revision};
  if(native.state==='DISPATCH_POSSIBLE'||native.state==='RUNNING_OBSERVED')
    return {ok:true,type:'PROBE_NATIVE',revision:job.revision,
      effect:'READ_ONLY_RECONCILE'};
  if(native.state==='CHAT2_RESET_OBSERVED'){
    if(!job.chat1.sessionDigest||job.chat2?.sessionDigest)
      return hold('AI_FRESH_CHAT_RECONCILIATION_REQUIRED');
    return {ok:true,type:'BEGIN_NATIVE',step:'CHAT2_SEND',revision:job.revision};
  }
  if(!idle.has(native.state))return hold('AI_NATIVE_SESSION_RECONCILIATION_REQUIRED');
  const isolatedChat2Missing=native.state==='CHAT2_OBSERVED_IDLE'&&
    job.chat2?.state!=='FRESH_VERIFIED';
  const active=native.state==='CHAT2_OBSERVED_IDLE'?2:1;
  if(!native.sessionDigest||
     (!isolatedChat2Missing&&!chatReady(job,active))||
     native.sessionDigest!==(active===1?job.chat1:job.chat2).sessionDigest)
    return hold('AI_SESSION_IDENTITY_MISMATCH');
  if(!job.finalSource||job.finalSource.fingerprint!==job.sourceFingerprint)
    return {ok:true,type:'PROBE_NATIVE',revision:job.revision,
      effect:'READ_ONLY_FULL_SOURCE'};
  if(job.operatorInstruction?.status==='QUEUED'){
    if(isolatedChat2Missing)return hold('AI_CHAT2_ISOLATION_UNVERIFIED');
    return {ok:true,type:'BEGIN_NATIVE',step:active===1?'CHAT1_INSTRUCT':'CHAT2_INSTRUCT',revision:job.revision};
  }
  if(isolatedChat2Missing){
    // Browser-only reruns of Chat1 on the new final source are safe even
    // while fresh Chat2 OPFS/server isolation is unverified. Do not issue
    // any additional Chat2 provider actions or record Chat2 PASS.
    if(job.state==='KNOWN_FAILURE')return hold('AI_CHAT2_ISOLATION_UNVERIFIED');
    const pending=job.prompt.tests.filter(name=>
      !sameF(job.chat1.tests?.[name],job.sourceFingerprint));
    if(pending.some(name=>!oracleNames.includes(name)&&
      !supportedDeclarativeAssertion(name)))
      return hold('UNSUPPORTED_REQUIRED_ASSERTIONS');
    if(pending.length)return {ok:true,type:'RUN_TESTS',revision:job.revision,
      chat:1,effect:'BROWSER_OBSERVATION_ONLY'};
    return {ok:true,type:'VERIFY_FRESH_CHAT2',revision:job.revision,
      effect:'GATED_READ_ONLY_HISTORY'};
  }
  if(job.state==='KNOWN_FAILURE'){
    const step=active===1?'CHAT1_REPAIR':'CHAT2_REPAIR';
    return {ok:true,type:'BEGIN_NATIVE',step,revision:job.revision};
  }
  for(const chat of [1,2]){
    if(chat===2&&(!job.optionalTesting||!job.chat2?.sessionDigest))
      continue;
    const required=chat===1?job.prompt.tests:job.optionalTesting.tests;
    const actual=chat===1?job.chat1.tests:job.chat2.tests;
    const pending=required.filter(name=>!sameF(actual?.[name],job.sourceFingerprint));
    if(!pending.length)continue;
    // First chat can be retested under Chat2 after a source-changing
    // repair. The independent browser assertion runs against final F.
    if(chat===1&&!chatReady(job,1))return hold('AI_CHAT1_SESSION_MISSING');
    if(pending.some(name=>!oracleNames.includes(name)&&
      !supportedDeclarativeAssertion(name)))
      return hold('UNSUPPORTED_REQUIRED_ASSERTIONS');
    return {ok:true,type:'RUN_TESTS',revision:job.revision,
      chat, effect:'BROWSER_OBSERVATION_ONLY'};
  }
  if(job.optionalTesting&&active===1){
    if(!job.chat1.sessionDigest||!job.chat2||job.chat2.sessionDigest)
      return hold('AI_CHAT2_PRECONDITION_UNVERIFIED');
    return {ok:true,type:'BEGIN_NATIVE',step:'CHAT2_RESET',revision:job.revision};
  }
  if(job.optionalTesting&&active===2&&job.chat2.state!=='FRESH_VERIFIED')
    return hold('AI_CHAT2_FRESHNESS_UNPROVEN');
  return hold('TEST_EVIDENCE_OR_COMPLETION_UNVERIFIED');
}
