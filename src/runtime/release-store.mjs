// I13 canonical release journal. No provider effect may occur in an IDB
// transaction. A lost dispatch reply is always uncertain, never retried.
import {fail} from './journal.mjs';
import {matchesApproval,releaseContext,releaseTestContext} from './release-core.mjs';
import {REFRESHER_KEY,validShadow} from './refresher-core.mjs';
const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x);
const key=s=>'release:'+s;
const display=r=>r?{
  ok:true,slug:r.slug,revision:r.revision,state:r.state,
  releaseId:r.releaseId,kind:r.kind,sourceFingerprint:r.approval.sourceFingerprint,
  previousFingerprint:r.approval.previousFingerprint,
  fileCount:r.approval.files.length,
  accountId:r.approval.accountId,observedAt:r.observedAt||null,
  reason:r.reason||null,dispatchPossible:r.dispatchPossible===true,
  actionResult:r.actionResult||null,
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
  const list=()=>transact(db,'readonly',(t,done)=>{
    const items=[];let truncated=false;
    t.objectStore('meta').openCursor().onsuccess=e=>{
      const cur=e.target.result;
      if(!cur){done({ok:true,items,truncated});return;}
      if(typeof cur.key==='string'&&cur.key.startsWith('release:')&&cur.value?.release){
        if(items.length<200)items.push(display(cur.value.release));else truncated=true;
      }
      cur.continue();
    };
  });
  function approve({approval,stage,job,account,inventory,source,previous,releaseId,kind}){
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
                   liveJob?.revision!==job.revision||liveJob.state!=='TESTS_VERIFIED'||
                   liveAccount?.revision!==account.revision||
                   liveAccount?.bindingVersion!==stage.bindingVersion||
                   liveInventory?.revision!==inventory.revision||
                   liveInventory?.remoteId!==stage.remotePublicId||
                   liveInventory?.ownerState!=='OBSERVED_OWNER'||
                   !releaseContext(liveStage,liveAccount,liveInventory).ok||
                   !releaseTestContext(liveStage,liveJob).ok||
                   !matchesApproval(approval.tuple,{
                     ...approval.tuple,stageRevision:liveStage.revision,
                     jobRevision:liveJob.revision,
                     sourceFingerprint:liveJob.verifiedFinal,
                     accountRevision:liveAccount.revision,
                     remotePublicId:liveInventory.remoteId
                   }).ok){
                  done(fail('RELEASE_CONTEXT_CHANGED'));return;
                }
                const record={slug:stage.slug,kind,revision:old?old.revision+1:1,releaseId,
                  state:'APPROVED',approval:structuredClone(approval.tuple),
                  sealedSource:structuredClone(source),previousSource:structuredClone(previous),
                  approvedAt:Date.now(),changedAt:Date.now(),
                  dispatchPossible:false,reason:null};
                if(old){
                  meta.add({key:'release-history:'+stage.slug+':'+old.releaseId,
                    release:structuredClone(old)});
                  meta.put({key:key(stage.slug),release:record});
                }else meta.add({key:key(stage.slug),release:record});
                t.objectStore('events').add({stage:'RELEASE_APPROVED',
                  slug:stage.slug,releaseId,sourceFingerprint:source.fingerprint,
                  kind,accountId:stage.accountId});
                done(display(record));
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
                   job.state!=='TESTS_VERIFIED'||
                   !releaseTestContext(stage,job).ok||
                   !releaseContext(stage,account,inventory).ok||
                   job.verifiedFinal!==r.approval.sourceFingerprint||
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
                    state:'DISPATCH_POSSIBLE',dispatchPossible:true,changedAt:Date.now()};
                  m.put({key:key(name),release:next});
                  t.objectStore('operations').add({operationId:r.releaseId,
                    targetId:'release_'+name,fingerprint:r.approval.sourceFingerprint,
                    status:'DISPATCH_POSSIBLE',effectType:'publish_exact_f_v1',revision:1});
                  t.objectStore('events').add({stage:'RELEASE_DISPATCH_POSSIBLE',
                    slug:name,releaseId:r.releaseId,sourceFingerprint:r.approval.sourceFingerprint});
                  done(display(next));
                }
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
                      mark();
                    };
                  };
                }else if(r.kind==='PRIVATE_NEW')mark();
                else done(fail('RELEASE_KIND_INVALID'));
              };
            };
          };
        };
      };
    });
  }
  function settle(name,expectedRevision,{proof=null,reason='PUBLICATION_UNCERTAIN',attempt=null}={}){
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
            actionResult:attempt?{ack:attempt.ok===true?'UNVERIFIED_ACK':'UNKNOWN',
              code:/^[A-Z][A-Z0-9_]{2,79}$/.test(attempt.code||'')?attempt.code:'PUBLISH_RESPONSE_UNKNOWN',
              recordedAt:Date.now()}:r.actionResult||null,
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
  return Object.freeze({get,getFull,list,approve,cancelApproved,markDispatch,settle});
}
