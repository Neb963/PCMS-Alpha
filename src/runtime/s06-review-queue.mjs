// S06 operator queue: cursor-paged canonical READ ONLY projection. Not an
// approval/effect authority. Every listed status is derived from persisted
// READY, exact staged/tested F, Git lineage and release state on this read.
import {createReadyStore} from './ready-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createReleaseStore} from './release-store.mjs';
import {planS06Writeback} from './s06-writeback-progress.mjs';
const fail=code=>({ok:false,code});
export function s06ReviewStatus({decision,release,sourceFingerprint}={}){
  const r=release?.record||release;
  // An uncertain release cannot be reapproved from a new queue projection.
  if(r&&['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN',
      'RECOVERY_HOLD'].includes(r.state))
    return {state:'PUBLICATION_UNCERTAIN',code:'RECONCILE_ONLY'};
  if(r?.state==='APPROVED')
    return r.approval?.sourceFingerprint===sourceFingerprint?
      {state:'APPROVED',code:'HUMAN_APPROVAL_HELD_FOR_DISPATCH'}:
      {state:'BLOCKED',code:'PRIOR_APPROVAL_SOURCE_CHANGED'};
  if(r?.state==='CONFIRMED_PUBLIC'&&r.approval?.sourceFingerprint===sourceFingerprint)
    return {state:'CONFIRMED_PUBLIC',code:'INDEPENDENT_PUBLIC_READBACK'};
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
    releaseStore=createReleaseStore(db);
  async function list({after='',limit=50}={}){
    if(typeof after!=='string'||after.length>100||
       !Number.isSafeInteger(limit)||limit<1||limit>100)
      return fail('S06_REVIEW_PAGE_INVALID');
    const snapshot=await readyStore.list({after,limit});
    if(!snapshot.ok)return snapshot;
    const items=[];
    for(const item of snapshot.items){
      const [ready,stage,job,writeback,release]=await Promise.all([
        readyStore.get(item.slug),stageStore.getFull(item.slug),
        aiStore.getJobFull(item.slug),writebackStore.getFull(item.slug),
        releaseStore.getFull(item.slug)
      ]);
      if(!ready.ok||ready.record.revision!==item.revision)
        return fail('S06_QUEUE_CHANGED_DURING_READ');
      const decision=planS06Writeback({
        ready,stage,job,writeback:writeback.ok?writeback:null});
      const sourceFingerprint=job.ok?job.job.verifiedFinal:null;
      const status=s06ReviewStatus({decision,
        release:release.ok?release:null,sourceFingerprint});
      items.push({slug:item.slug,revision:item.revision,
        state:status.state,code:status.code,
        sourceFingerprint:decision.ok&&decision.type==='REVIEW'?
          decision.sourceFingerprint:null,
        sourceVerified:decision.ok&&decision.type==='REVIEW',
        releaseRevision:release.ok?release.record.revision:null,
        releaseId:release.ok?release.record.releaseId:null});
    }
    return {ok:true,items,more:snapshot.more,
      nextCursor:snapshot.nextCursor};
  }
  return Object.freeze({list});
}
