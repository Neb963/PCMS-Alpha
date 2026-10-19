// S06: canonical output lineage is a *separate*, attributed Git fact.
// Never overwrite the frozen S05 declaration/READY input fingerprint.
const SHA40=/^[0-9a-f]{40}$/,SHA64=/^[0-9a-f]{64}$/;
const OP=/^writeback_[0-9a-f]{32}$/;
const fail=code=>({ok:false,code});
export function sealedS06OutputProof({ready,stage,writeback}={}){
  const r=ready?.record||ready,s=stage?.record||stage,
    w=writeback?.record||writeback;
  const active=r?.active;
  if(!r||!active||r.desired||r.hold||
     !s||s.slug!==r.slug||s.readyIdentifier!==active.identifier||
     s.readyInputFingerprint!==active.inputFingerprint||
     !w||w.state!=='CONFIRMED'||w.mode!=='S06'||
     w.folder!=='generators/'+r.slug||
     w.readyIdentifier!==active.identifier||
     w.readyInputFingerprint!==active.inputFingerprint||
     w.testingSha!==s.testingSha||
     !SHA64.test(w.sealedSource?.fingerprint||'')||
     w.sealedSource.fingerprint!==w.sourceFingerprint||
     !OP.test(w.operationId||'')||
     ![w.baseHead,w.expectedHead,w.commitSha].every(x=>SHA40.test(x||'')))
    return fail('S06_ATTRIBUTED_OUTPUT_NOT_AVAILABLE');
  return {ok:true,outputProof:{readyIdentifier:active.identifier,
    readyInputFingerprint:active.inputFingerprint,
    testingSha:w.testingSha,folder:w.folder,operationId:w.operationId,
    baseHead:w.baseHead,expectedHead:w.expectedHead,
    commitSha:w.commitSha,sealedSource:w.sealedSource}};
}
