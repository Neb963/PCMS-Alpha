// S06 operator queue: cursor-paged canonical READ ONLY projection. Not an
// approval/effect authority. Every listed status is derived from persisted
// READY, exact staged/tested F, Git lineage and release state on this read.
import {createReadyStore} from './ready-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createReleaseStore} from './release-store.mjs';
import {createS06ChangeStore} from './s06-request-changes.mjs';
import {createS06HumanStore} from './s06-human-review.mjs';
import {createS06ExceptionStore} from './s06-exception-review.mjs';
import {planS06Writeback} from './s06-writeback-progress.mjs';
const fail=code=>({ok:false,code});
export function s06ReviewStatus({decision,release,change,human,exception,sourceFingerprint,stageRevision}={}){
  const r=release?.record||release;
  // An uncertain release cannot be reapproved from a new queue projection.
  if(r&&['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN',
      'RECOVERY_HOLD'].includes(r.state))
    return {state:'PUBLICATION_UNCERTAIN',code:'RECONCILE_ONLY'};
  if(human?.state==='DEFERRED'&&human.parentStageRevision===stageRevision)
    return {state:'HUMAN_DEFERRED',code:'PRESERVE_EDITOR_WORK_ADOPT_OR_DEFER'};
  if(human?.state==='ADOPTED_UNTESTED'&&
     human.childStageRevision===stageRevision&&!decision?.ok)
    return {state:'IN_DEVELOPMENT',code:'ADOPTED_HUMAN_SOURCE_RETEST_REQUIRED'};
  if(change?.state==='REQUESTED')
    return {state:'CHANGES_REQUESTED',code:'AWAITING_GUARDED_CHILD_ADMISSION'};
  // Child admission is not a permanent queue status. Once tests and the
  // independently attributed Git F are verified, the new F must become
  // reviewable under a NEW exact-source human approval, never the parent one.
  if(change?.state==='ADMITTED'&&change.childStageRevision===stageRevision&&
     !decision?.ok&&decision?.code==='S06_CANDIDATE_OR_TEST_EVIDENCE_UNVERIFIED')
    return {state:'IN_DEVELOPMENT',code:'REQUEST_CHILD_RETESTING'};
  if(r?.state==='APPROVED')
    return r.approval?.sourceFingerprint===sourceFingerprint?
      {state:'APPROVED',code:'HUMAN_APPROVAL_HELD_FOR_DISPATCH'}:
      {state:'BLOCKED',code:'PRIOR_APPROVAL_SOURCE_CHANGED'};
  if(r?.state==='CONFIRMED_PUBLIC'&&r.approval?.sourceFingerprint===sourceFingerprint)
    return {state:'CONFIRMED_PUBLIC',code:'INDEPENDENT_PUBLIC_READBACK'};
  if(exception?.state==='RECORDED'&&exception.stageRevision===stageRevision&&
     exception.sourceFingerprint===sourceFingerprint)
    return decision?.ok&&decision.type==='REVIEW'&&
      decision.mode==='S06_EXCEPTION'?
      {state:'EXCEPTION_READY_FOR_REVIEW',
        code:'EXACT_EXCEPTIONAL_GIT_F_INDIVIDUAL_APPROVAL_REQUIRED'}:
      {state:'EXCEPTION_HELD',
        code:'HUMAN_CHECKS_RECORDED_NOT_AI_VERIFIED_OR_GIT_CONFIRMED'};
  if(!decision?.ok)return {state:'BLOCKED',code:decision?.code||'CANDIDATE_UNVERIFIED'};
  if(decision.type==='REVIEW')
    return {state:'READY_FOR_REVIEW',code:'EXACT_TESTED_GIT_F_VERIFIED'};
  if(decision.type==='RECONCILE')
    return {state:'BLOCKED',code:'GIT_EFFECT_UNCERTAIN_RECONCILE'};
  if(decision.type==='COMMIT'||decision.type==='PREPARE')
    return {state:'WAITING_FOR_GIT',code:'EXACT_F_WRITEBACK_PENDING'};
  return {state:'BLOCKED',code:'UNKNOWN_REVIEW_STATE'};
}
export function createS06ReviewQueue(db){
  const readyStore=createReadyStore(db),stageStore=createStagingStore(db),
    aiStore=createAiStore(db),writebackStore=createWritebackStore(db),
    releaseStore=createReleaseStore(db),changeStore=createS06ChangeStore(db),
    humanStore=createS06HumanStore(db),
    exceptionStore=createS06ExceptionStore(db);
  async function list({after='',limit=50}={}){
    if(typeof after!=='string'||after.length>100||
       !Number.isSafeInteger(limit)||limit<1||limit>100)
      return fail('S06_REVIEW_PAGE_INVALID');
    const snapshot=await readyStore.list({after,limit});
    if(!snapshot.ok)return snapshot;
    const items=[];
    for(const item of snapshot.items){
      const [ready,stage,job,writeback,release,change,human,exception]=await Promise.all([
        readyStore.get(item.slug),stageStore.getFull(item.slug),
        aiStore.getJobFull(item.slug),writebackStore.getFull(item.slug),
        releaseStore.getFull(item.slug),changeStore.get(item.slug),
        humanStore.get(item.slug),exceptionStore.get(item.slug)
      ]);
      if(!ready.ok||ready.record.revision!==item.revision)
        return fail('S06_QUEUE_CHANGED_DURING_READ');
      const decision=planS06Writeback({
        ready,stage,job,writeback:writeback.ok?writeback:null,
        exception:exception.ok?exception:null});
      const sourceFingerprint=job.ok?
        (job.job.verifiedFinal||job.job.sourceFingerprint):null;
      const status=s06ReviewStatus({decision,
        release:release.ok?release:null,sourceFingerprint,
        change:change.ok?change:null,human:human.ok?human:null,
        exception:exception.ok?exception:null,
        stageRevision:stage.ok?stage.record.revision:null});
      items.push({slug:item.slug,revision:item.revision,
        state:status.state,code:status.code,
        sourceFingerprint:decision.ok&&decision.type==='REVIEW'?
          decision.sourceFingerprint:null,
        sourceVerified:decision.ok&&decision.type==='REVIEW',
        aiVerified:decision.ok&&decision.type==='REVIEW'&&
          decision.mode!=='S06_EXCEPTION',
        releaseRevision:release.ok?release.record.revision:null,
        releaseId:release.ok?release.record.releaseId:null});
    }
    return {ok:true,items,more:snapshot.more,
      nextCursor:snapshot.nextCursor};
  }
  return Object.freeze({list});
}
