// I10 deterministic *policy* for a trusted read-only native server-history
// observation. It deliberately knows no routing keys, session identifiers,
// network URLs, transcript bodies or browser globals. Only the same-XPI
// guarded runtime may call it; UI/model-provided proof is never accepted.
//
// An unacknowledged end of S1 is NOT by itself a failure: P52-06 requires
// distinct S2 plus observed S2 history isolation. Without independently
// obtained server facts, this policy reports a hold, not a fictitious PASS.
const HEX=/^[a-f0-9]{64}$/;
const fail=code=>({ok:false,code,release:false});
export function verifyNativeChat2History({
  chat1Digest,chat2Digest,firstPromptDigest,sourceFingerprint,observation
}={}){
  if(!HEX.test(chat1Digest||'')||!HEX.test(chat2Digest||'')||
     !HEX.test(firstPromptDigest||'')||!HEX.test(sourceFingerprint||''))
    return fail('AI_HISTORY_CONTEXT_UNVERIFIED');
  if(chat1Digest===chat2Digest)return fail('AI_CHAT2_SESSION_REUSED');
  if(!observation||observation.origin!=='INDEPENDENT_GUARDED_SERVER_HISTORY'||
     observation.sessionDigest!==chat2Digest||
     observation.sourceFingerprint!==sourceFingerprint||
     observation.firstUserPromptDigest!==firstPromptDigest||
     !Number.isSafeInteger(observation.entriesObserved)||
     observation.entriesObserved<1||observation.entriesObserved>512||
     observation.beforeFirstUserRolesValid!==true||
     observation.previousConversationTurns===undefined)
    return fail('AI_CHAT2_HISTORY_NOT_OBSERVED');
  if(observation.previousConversationTurns!==0)
    return fail('AI_CHAT2_HISTORY_INHERITED');
  if(observation.workspaceNamespace!=='INDEPENDENT_SESSION_PATH'||
     observation.workspaceSessionDigest!==chat2Digest)
    return fail('AI_CHAT2_WORKSPACE_UNVERIFIED');
  if(observation.workerInitialized!==true)
    return fail('AI_CHAT2_WORKER_NOT_OBSERVED');
  if(observation.humanEditorIntervened!==false)
    return fail('AI_CHAT2_HUMAN_INTERVENTION');
  return {ok:true,code:'AI_CHAT2_HISTORY_AND_WORKSPACE_OBSERVED',
    chat2Digest,sourceFingerprint,release:false,
    // This means eligible for *independent browser tests*, never PASS.
    testStatus:'TESTS_UNVERIFIED'};
}
