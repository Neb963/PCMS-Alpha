// I13 canonical release journal. No provider effect may occur in an IDB
// transaction. A lost dispatch reply is always uncertain, never retried.
import {fail} from './journal.mjs';
import {cleanBulkAuthorization} from './clean-bulk-authority.mjs';
import {matchesApproval,releaseContext,releaseTestContext,
  releaseCandidateTestContext} from './release-core.mjs';
import {REFRESHER_KEY,validShadow} from './refresher-core.mjs';
const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x);
const key=s=>'release:'+s;
// The same IndexedDB transaction must pin READY and independently attributed
// Git F when approving or marking a possible provider publication.
function withoutPendingChild(m,stage,done,commit){
  m.get('s06-change:'+stage.slug).onsuccess=e=>{
    const request=e.target.result?.record;
    if(request?.state==='REQUESTED'&&
       request.parentStageRevision===stage.revision){
      done(fail('S06_UNRESOLVED_REQUEST_CHANGES'));return;
    }
    m.get('s06-human:'+stage.slug).onsuccess=h=>{
      const human=h.target.result?.record;
      if(human?.state==='DEFERRED'&&
         human.parentStageRevision===stage.revision){
        done(fail('S06_HUMAN_REVIEW_DEFERRED'));return;
      }
      commit();
    };
  };
}
function withS06Candidate(m,stage,job,done,commit,approval=null){
  if(job?.operatorPaused){done(fail('AI_OPERATOR_PAUSED'));return;}
  if(!stage?.readyIdentifier){commit();return;}
  m.get('s05-ready:'+stage.slug).onsuccess=rr=>{
    const ready=rr.target.result?.record;
    if(!ready?.active||ready.desired||ready.hold||
       ready.active.identifier!==stage.readyIdentifier||
       ready.active.inputFingerprint!==stage.readyInputFingerprint){
      done(fail('S06_REVIEW_READY_SUPERSEDED'));return;
    }
    m.get('writeback:'+stage.slug).onsuccess=wb=>{
     m.get('s06-exception:'+stage.slug).onsuccess=ex=>{
      const git=wb.target.result?.record,exception=ex.target.result?.record;
      const admitted=releaseCandidateTestContext(stage,job,{ready,exception});
      const special=admitted.mode==='EXCEPTION_MANUAL_REVIEW',
        sourceFingerprint=special?job?.sourceFingerprint:job?.verifiedFinal;
      if(!admitted.ok||
         git?.state!=='CONFIRMED'||git.mode!==(special?'S06_EXCEPTION':'S06')||
         (special&&(git.exceptionRevision!==admitted.revision||
           approval?.exceptionRevision!==admitted.revision||
           approval?.testEvidenceMode!==admitted.evidenceMode||
           approval?.aiVerified!==false))||
         (!special&&approval&&approval.aiVerified!==true)||
         git.readyIdentifier!==ready.active.identifier||
         git.readyInputFingerprint!==ready.active.inputFingerprint||
         (git.testingSha??null)!==(stage.testingSha??null)||
         !/^[a-f0-9]{40}$/.test(git.commitSha||'')||
         git.stageRevision!==stage.revision||
         git.jobRevision!==job?.revision||
         git.sourceFingerprint!==sourceFingerprint){
        done(fail('S06_REVIEW_GIT_PROOF_CHANGED'));return;
      }
      commit();
     };
    };
  };
}
const display=r=>r?{
  ok:true,slug:r.slug,revision:r.revision,state:r.state,
  releaseId:r.releaseId,kind:r.kind,sourceFingerprint:r.approval.sourceFingerprint,
  previousFingerprint:r.approval.previousFingerprint,
  fileCount:r.approval.files.length,
  accountId:r.approval.accountId,observedAt:r.observedAt||null,
  reason:r.progressHold||r.reason||null,dispatchPossible:r.dispatchPossible===true,
  publication:r.state==='CONFIRMED_PUBLIC'?'INDEPENDENTLY_VERIFIED':'HELD_OR_UNVERIFIED',
  review:r.state==='APPROVED'?'SOURCE_BOUND_APPROVAL':'READ_ONLY_RECOVERY'
}:fail('RELEASE_NOT_FOUND');
function transact(db,mode,callback){
  return new Promise((resolve,reject)=>{
    let tx,result=fail('RELEASE_TRANSACTION_INCOMPLETE');
    try{tx=db.transaction(mode==='readonly'?['meta']:['meta','events','operations'],mode);}
    catch{return reject(Error('RELEASE_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(Error('RELEASE_DB_ABORTED'));
    tx.onerror=()=>{};
    try{callback(tx,value=>{result=value;});}catch{try{tx.abort();}catch{}}
  });
}
export function createReleaseStore(db){
  const getFull=name=>!slug(name)?Promise.resolve(fail('INVALID_SLUG')):transact(db,'readonly',(t,done)=>{
    t.objectStore('meta').get(key(name)).onsuccess=e=>{
      const release=e.target.result?.release;
      done(release?{ok:true,record:release}:fail('RELEASE_NOT_FOUND'));
    };
  });
  const get=async name=>{
    const result=await getFull(name);
    return result.ok?display(result.record):result;
  };
  const list=({after='',limit=200,states=null}={})=>{
   if(typeof after!=='string'||after.length>100||!Number.isInteger(limit)||limit<1||limit>200||
      (states!==null&&(!Array.isArray(states)||states.some(s=>!['APPROVED','DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD','CONFIRMED_PUBLIC','CANCELED'].includes(s)))))return Promise.resolve(fail('RELEASE_PAGE_INVALID'));
   return transact(db,'readonly',(t,done)=>{
    const items=[];
    t.objectStore('meta').openCursor().onsuccess=e=>{
      const cur=e.target.result;
      const finish=()=>{const more=items.length>limit,page=items.slice(0,limit);done({ok:true,items:page,truncated:more,more,nextCursor:more?page.at(-1).slug:null})};
      if(!cur){finish();return;}
      if(typeof cur.key==='string'&&cur.key.startsWith('release:')&&cur.value?.release){
        const r=cur.value.release;if(r.slug>after&&(!states||states.includes(r.state)))items.push(display(r));
        if(items.length>limit){finish();return;}
      }
      cur.continue();
    };
   });
  };
  function recordProgress(name,expectedRevision,code){
   return transact(db,'readwrite',(t,done)=>{const m=t.objectStore('meta');m.get(key(name)).onsuccess=e=>{const r=e.target.result?.release;
    if(!r||r.state!=='APPROVED'||r.revision!==expectedRevision){done(fail('STALE_RELEASE'));return}
    if(!/^[A-Z0-9_]{1,90}$/.test(code||'')){done(fail('RELEASE_PROGRESS_INVALID'));return}
    m.put({key:key(name),release:{...r,progressHold:code,progressAt:Date.now()}});done(display({...r,progressHold:code}));
   }});
  }
  function approve({approval,stage,job,account,inventory,source,previous,releaseId,kind,bulkAuthorization=null}){
    if(!approval?.ok||!slug(stage?.slug)||stage.slug!==job?.slug||
       stage.slug!==inventory?.slug||stage.accountId!==account?.accountId||
       kind!=='PRIVATE_NEW'&&kind!=='EXISTING_UPDATE'||
       !/^release_[a-f0-9]{32}$/.test(releaseId||'')||
       !source?.ok||!previous?.ok||
       source.fingerprint!==approval.tuple.sourceFingerprint||
       previous.fingerprint!==approval.tuple.previousFingerprint)
      return Promise.resolve(fail('RELEASE_PREPARE_INVALID'));
    return transact(db,'readwrite',(t,done)=>{
      const meta=t.objectStore('meta');
      meta.get(key(stage.slug)).onsuccess=e=>{
        const old=e.target.result?.release;
        if(old){
          const published=old.state==='CONFIRMED_PUBLIC'&&
            kind==='EXISTING_UPDATE'&&
            old.approval.sourceFingerprint===previous.fingerprint;
          const canceled=old.state==='CANCELED'&&
            old.approval.previousFingerprint===previous.fingerprint;
          if(!(published||canceled)||
             old.approval.accountId!==account.accountId||
             old.approval.remotePublicId!==inventory.remoteId||
             old.approval.personaUid!==stage.personaUid||
             old.approval.bindingVersion!==stage.bindingVersion){
            done(fail('EXISTING_RELEASE_REQUIRES_REVIEW'));return;
          }
        }
        meta.get('stage:'+stage.slug).onsuccess=s=>{
          meta.get('ai-job:'+stage.slug).onsuccess=j=>{
            meta.get('account:'+stage.accountId).onsuccess=a=>{
              meta.get('inventory:'+stage.slug).onsuccess=i=>{
                const liveStage=s.target.result?.record,liveJob=j.target.result?.job,
                  liveAccount=a.target.result?.account,liveInventory=i.target.result?.generator;
                if(liveStage?.revision!==stage.revision||
                   liveStage.state!=='SOURCE_VERIFIED'||
                   liveJob?.revision!==job.revision||
                   !(liveJob.state==='TESTS_VERIFIED'||
                     (approval.tuple.aiVerified===false&&
                      liveJob.finalSource?.fingerprint===liveJob.sourceFingerprint))||
                   liveAccount?.revision!==account.revision||
                   liveAccount?.bindingVersion!==stage.bindingVersion||
                   liveInventory?.revision!==inventory.revision||
                   liveInventory?.remoteId!==stage.remotePublicId||
                   liveInventory?.ownerState!=='OBSERVED_OWNER'||
                   !releaseContext(liveStage,liveAccount,liveInventory).ok||
                   !(releaseTestContext(liveStage,liveJob).ok||
                     approval.tuple.aiVerified===false)||
                   !matchesApproval(approval.tuple,{
                     ...approval.tuple,stageRevision:liveStage.revision,
                     jobRevision:liveJob.revision,
                     sourceFingerprint:approval.tuple.aiVerified===false?
                       liveJob.sourceFingerprint:liveJob.verifiedFinal,
                     accountRevision:liveAccount.revision,
                     remotePublicId:liveInventory.remoteId
                   }).ok){
                  done(fail('RELEASE_CONTEXT_CHANGED'));return;
                }
                const commit=()=>{
                const write=bulk=>{
                const record={slug:stage.slug,kind,revision:old?old.revision+1:1,releaseId,
                  state:'APPROVED',approval:structuredClone(approval.tuple),
                  sealedSource:structuredClone(source),previousSource:structuredClone(previous),
                  approvedAt:Date.now(),changedAt:Date.now(),
                  dispatchPossible:false,reason:null};
                if(bulk)record.cleanBulkSetId=bulk.id;
                if(old){
                  meta.put({key:'release-history:'+stage.slug+':'+old.releaseId,
                    release:structuredClone(old)});
                  meta.put({key:key(stage.slug),release:record});
                }else meta.put({key:key(stage.slug),release:record});
                t.objectStore('events').add({stage:'RELEASE_APPROVED',
                  slug:stage.slug,releaseId,sourceFingerprint:source.fingerprint,
                  kind,accountId:stage.accountId});
                done(display(record));
                };
                if(bulkAuthorization===null){write(null);return;}
                const bulk=cleanBulkAuthorization(bulkAuthorization);if(!bulk){done(fail('CLEAN_BULK_AUTHORITY_INVALID'));return;}
                meta.get('clean-bulk:'+bulk.id).onsuccess=br=>{const set=br.target.result?.record,item=set?.items?.[bulk.index];
                  if(set?.state!=='APPROVED'||set.digest!==bulk.digest||!set.approvedAt||item?.state!=='APPROVAL_REQUESTED'||item.slug!==stage.slug||
                    item.snapshot.readyIdentifier!==stage.readyIdentifier||item.snapshot.readyInputFingerprint!==stage.readyInputFingerprint||
                    !matchesApproval(item.snapshot.tuple,approval.tuple).ok){done(fail('CLEAN_BULK_AUTHORITY_REVOKED'));return}
                  write(bulk);
                };
                };
                withS06Candidate(meta,liveStage,liveJob,done,()=>
                  withoutPendingChild(meta,liveStage,done,commit),approval.tuple);
              };
            };
          };
        };
      };
    });
  }
  // Explicit cancellation is possible ONLY before possible provider effects.
  // History remains immutable; a canceled approval is not a publish receipt.
  function cancelApproved(name,revision){
    if(!slug(name)||!Number.isSafeInteger(revision)||revision<1)
      return Promise.resolve(fail('INVALID_CANCEL'));
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(name)).onsuccess=e=>{
        const r=e.target.result?.release;
        if(!r||r.revision!==revision){done(fail('STALE_RELEASE'));return;}
        if(r.state!=='APPROVED'||r.dispatchPossible===true){
          done(fail('CANNOT_CANCEL_POSSIBLE_PUBLICATION'));return;
        }
        const next={...r,state:'CANCELED',reason:'OPERATOR_CANCELED_UNSENT',
          revision:r.revision+1,changedAt:Date.now()};
        m.put({key:key(name),release:next});
        t.objectStore('events').add({stage:'RELEASE_CANCELED',slug:name,
          releaseId:r.releaseId,sourceFingerprint:r.approval.sourceFingerprint});
        done(display(next));
      };
    });
  }

  // All authority state and immutable approval are CAS checked in the same
  // journal transaction immediately before DISPATCH_POSSIBLE.
  function markDispatch(name,expectedRevision,tuple){
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(name)).onsuccess=e=>{
        const r=e.target.result?.release;
        if(!r||r.revision!==expectedRevision){done(fail('STALE_RELEASE'));return;}
        if(r.state!=='APPROVED'||!matchesApproval(r.approval,tuple).ok){
          done(fail('APPROVAL_STALE_OR_SPENT'));return;
        }
        m.get('stage:'+name).onsuccess=s=>{
          m.get('ai-job:'+name).onsuccess=j=>{
            m.get('account:'+r.approval.accountId).onsuccess=a=>{
              m.get('inventory:'+name).onsuccess=i=>{
                const stage=s.target.result?.record,job=j.target.result?.job,
                  account=a.target.result?.account,inventory=i.target.result?.generator;
                if(stage?.revision!==r.approval.stageRevision||
                   stage.state!=='SOURCE_VERIFIED'||
                   job?.revision!==r.approval.jobRevision||
                   !(job.state==='TESTS_VERIFIED'||
                     (r.approval.aiVerified===false&&
                      job.finalSource?.fingerprint===job.sourceFingerprint))||
                   !(releaseTestContext(stage,job).ok||
                     r.approval.aiVerified===false)||
                   !releaseContext(stage,account,inventory).ok||
                   (r.approval.aiVerified===false?job.sourceFingerprint:
                     job.verifiedFinal)!==r.approval.sourceFingerprint||
                   account?.revision!==r.approval.accountRevision||
                   account.bindingVersion!==r.approval.bindingVersion||
                   account.identity?.principalFingerprint!==r.approval.principalFingerprint||
                   account.state!=='VERIFIED'||inventory?.remoteId!==r.approval.remotePublicId||
                   inventory.ownerState!=='OBSERVED_OWNER'||
                   inventory.visibility!=='UNLISTED'||inventory.bindingVersion!==r.approval.bindingVersion){
                  done(fail('RELEASE_REVALIDATION_FAILED'));return;
                }
                function mark(){
                  const next={...r,revision:r.revision+1,
                    state:'DISPATCH_POSSIBLE',progressHold:null,dispatchPossible:true,changedAt:Date.now()};
                  m.put({key:key(name),release:next});
                  t.objectStore('operations').add({operationId:r.releaseId,
                    targetId:'release_'+name,fingerprint:r.approval.sourceFingerprint,
                    status:'DISPATCH_POSSIBLE',effectType:'publish_exact_f_v1',revision:1});
                  t.objectStore('events').add({stage:'RELEASE_DISPATCH_POSSIBLE',
                    slug:name,releaseId:r.releaseId,sourceFingerprint:r.approval.sourceFingerprint});
                  done(display(next));
                }
                const guardedMark=()=>withS06Candidate(m,stage,job,done,()=>
                  withoutPendingChild(m,stage,done,mark),r.approval);
                if(r.kind==='EXISTING_UPDATE'){
                  m.get('existing-update:'+name).onsuccess=ex=>{
                    const update=ex.target.result?.record;
                    if(update?.state!=='STAGE_CONFIRMED'||
                       update.nonce!==stage.nonce||
                       update.remotePublicId!==r.approval.remotePublicId||
                       update.bindingVersion!==r.approval.bindingVersion||
                       update.stagedFingerprint!==r.approval.sourceFingerprint||
                       update.previousFingerprint!==r.approval.previousFingerprint||
                       update.recovery?.fingerprint!==r.approval.previousFingerprint){
                      done(fail('EXISTING_RECOVERY_OR_STAGE_CHANGED'));return;
                    }
                    m.get(REFRESHER_KEY).onsuccess=sh=>{
                      const state=sh.target.result?.state,
                        row=state?.rows?.find(z=>z.slug===name);
                      if(!validShadow(state)||!row||row.phase!=='SLEEPING'||
                         row.slot===true||row.paused===true||
                         row.remoteId!==r.approval.remotePublicId||
                         row.bindingVersion!==r.approval.bindingVersion||
                         state.globalPause===true||
                         state.accounts?.[r.approval.accountId]?.paused===true){
                        done(fail('EXISTING_SLEEP_REVOKED'));return;
                      }
                      guardedMark();
                    };
                  };
                }else if(r.kind==='PRIVATE_NEW')guardedMark();
                else done(fail('RELEASE_KIND_INVALID'));
              };
            };
          };
        };
      };
    });
  }
  function settle(name,expectedRevision,{proof=null,reason='PUBLICATION_UNCERTAIN'}={}){
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta'),ops=t.objectStore('operations');
      m.get(key(name)).onsuccess=e=>{
        const r=e.target.result?.release;
        if(!r||r.revision!==expectedRevision){done(fail('STALE_RELEASE'));return;}
        if(!['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(r.state))
          {done(fail('RELEASE_NOT_RECONCILABLE'));return;}
        const verified=proof?.ok===true&&
          proof.source==='INDEPENDENT_PUBLICATION_READBACK'&&
          proof.sourceFingerprint===r.approval.sourceFingerprint&&
          typeof proof.observationId==='string'&&
          /^observed_[a-f0-9]{32}$/.test(proof.observationId)&&
          Number.isSafeInteger(proof.observedAt)&&
          proof.observedAt>=r.changedAt&&proof.observedAt<=Date.now();
        ops.get(r.releaseId).onsuccess=o=>{
          const operation=o.target.result;
          if(!operation||operation.fingerprint!==r.approval.sourceFingerprint||
             operation.targetId!=='release_'+name){done(fail('RELEASE_JOURNAL_CONFLICT'));return;}
          const next={...r,revision:r.revision+1,
            state:verified?'CONFIRMED_PUBLIC':'PUBLICATION_UNCERTAIN',
            source:verified?'INDEPENDENT_PUBLICATION_READBACK':null,
            sourceFingerprint:verified?r.approval.sourceFingerprint:null,
            accountId:r.approval.accountId,personaUid:r.approval.personaUid,
            bindingVersion:r.approval.bindingVersion,
            principalFingerprint:r.approval.principalFingerprint,
            remoteId:r.approval.remotePublicId,
            observationId:verified?proof.observationId:null,
            observedAt:verified?proof.observedAt:null,
            reason:verified?null:(
              /^[A-Z][A-Z0-9_]{2,79}$/.test(reason)?reason:'PUBLICATION_UNCERTAIN'
            ),changedAt:Date.now()};
          m.put({key:key(name),release:next});
          ops.put({...operation,status:verified?'CONFIRMED':'HELD_UNCERTAIN',revision:operation.revision+1});
          t.objectStore('events').add({stage:'RELEASE_'+next.state,
            slug:name,releaseId:r.releaseId,sourceFingerprint:r.approval.sourceFingerprint});
          done(display(next));
        };
      };
    });
  }
  return Object.freeze({get,getFull,list,approve,cancelApproved,markDispatch,settle,recordProgress});
}
