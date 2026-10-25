// I10 canonical local prompt/job receipts. IDB transaction owns CAS and allocation.
// Native effects and assertions must execute outside any transaction.
import {fail} from './journal.mjs';
import {initialPrompt,revisePrompt,importPrompt,exportPrompt,beginAiJob,applyAiEvidence,evaluation} from './ai-evidence.mjs';
const key=s=>'ai-job:'+s;
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
// Interrupted, unknown or human-owned native sessions are NOT free execution
// slots. Even verified test results do not prove the helper session stopped.
const slotReleased=j=>j?.executionSlotReleased===true &&
  j.native?.state!=='DISPATCH_POSSIBLE';
// Shared admission includes existing-public reservations before any UNLIST.
// Once its own current AI job exists, count that job exactly once instead.
export function countAiCapacity(rows,accountId,excludeSlug=''){
 const jobs=rows.filter(r=>r.key?.startsWith('ai-job:')&&r.accountId===accountId&&r.job?.slug!==excludeSlug);
 let used=jobs.filter(r=>!slotReleased(r.job)).length;
 const own=rows.find(v=>v.key==='existing-update:'+excludeSlug&&v.record?.accountId===accountId)?.record;
 const order=(a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.slug.localeCompare(b.slug,'en');
 for(const row of rows){const r=row.record;if(!row.key?.startsWith('existing-update:')||!r||r.accountId!==accountId||r.slug===excludeSlug)continue;
  const queued=rows.find(v=>v.key==='s05-ready:'+r.slug)?.record,owner=rows.find(v=>v.key==='account:'+r.accountId)?.account;
  if(r.state==='PREPARED'&&(queued?.hold==='OPERATOR_PAUSED'||owner&&owner.state!=='VERIFIED'))continue;
  const published=rows.find(v=>v.key==='release:'+r.slug)?.release;
  if(published?.state==='CONFIRMED_PUBLIC'&&published.source==='INDEPENDENT_PUBLICATION_READBACK'&&published.accountId===r.accountId&&published.remoteId===r.remotePublicId&&published.bindingVersion===r.bindingVersion&&published.approval?.sourceFingerprint===r.stagedFingerprint)continue;
  const j=jobs.find(v=>v.job.slug===r.slug)?.job,stage=rows.find(v=>v.key==='stage:'+r.slug)?.record;
  const current=j&&stage?.nonce===r.nonce&&j.stageRevision===stage.revision;
  if(!current&&!(own&&order(r,own)>0))used++;
 }
 return used;
}
function tx(db,mode,fn){
  return new Promise((resolve,reject)=>{
    let t,result=fail('AI_TRANSACTION_INCOMPLETE');
    try{t=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
    catch{return reject(Error('AI_DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(result);
    t.onabort=()=>reject(Error('AI_DB_ABORTED'));
    t.onerror=()=>{};
    try{fn(t,x=>{result=x;});}catch{try{t.abort();}catch{}}
  });
}
// S05 cross-writer CAS: the READY ledger and AI write share one IDB
// transaction. A boundary read performed earlier can never authorize a
// native dispatch or test PASS after a later candidate has been queued.
function withCurrentReady(m,job,done,commit){
  if(job.operatorPaused===true){done(fail('AI_OPERATOR_PAUSED'));return;}
  if(!job.readyIdentifier){commit();return;}
  m.get('s05-ready:'+job.slug).onsuccess=e=>{
    const r=e.target.result?.record;
    if(!r?.active||r.desired||['READY_REVOKED_NOT_READY','OPERATOR_PAUSED'].includes(r.hold)||
       r.active.identifier!==job.readyIdentifier||
       r.active.inputFingerprint!==job.readyInputFingerprint){
      done(fail('AI_READY_CANDIDATE_CHANGED'));return;
    }
    commit();
  };
}
const publicJob=j=>j?{ok:true,slug:j.slug,revision:j.revision,state:j.state,
  sourceFingerprint:j.sourceFingerprint,promptRevision:j.prompt.revision,
  promptSource:j.prompt.source==='GIT_MAIN_CHAT1_PINNED'?
    'GIT_MAIN_CHAT1_PINNED':'LOCAL_SETTINGS',
  optionalTestingSha:j.optionalTesting?.sha256||null,
  evidence:evaluation(j),changes:j.changes,hold:j.hold,
  nativeState:j.native?.state||'NOT_STARTED',
  slotReleased:j.executionSlotReleased===true,
  schedulerDeferredUntil:Number.isSafeInteger(j.schedulerDeferredUntil)?
    j.schedulerDeferredUntil:null,
  schedulerHold:typeof j.schedulerHold==='string'?j.schedulerHold:null,
  chat2IsolationVerified:j.chat2?.state==='FRESH_VERIFIED',
  readyManaged:typeof j.readyIdentifier==='string',operatorJudgment:j.operatorJudgment||null,operatorPaused:j.operatorPaused===true,controlRevision:j.controlRevision||1,
  awaitingExecutionSlot:j.awaitingExecutionSlot===true,exceptionFrozen:j.exceptionFrozen===true,
  pendingInstruction:j.operatorInstruction?{id:j.operatorInstruction.id,
    text:j.operatorInstruction.text,status:j.operatorInstruction.status}:null,
  provider:'GUARDED_NATIVE_AI_DEVELOPMENT_GRANT',
  github:'NO_AI_WRITEBACK',publication:'OFF'}:fail('AI_JOB_NOT_FOUND');
export function createAiStore(db){
  function admitExecutionSlot(name,expectedRevision){
    if(!slug(name)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)return Promise.resolve(fail('AI_COMMAND_INVALID'));
    return tx(db,'readwrite',(t,done)=>{const m=t.objectStore('meta');m.get(key(name)).onsuccess=e=>{const row=e.target.result,j=row?.job;
      if(!j||j.revision!==expectedRevision){done(fail('STALE_REVISION'));return}
      if(j.exceptionFrozen){done(fail('AI_EXCEPTION_REVIEW_FROZEN'));return}
      if(j.awaitingExecutionSlot!==true||j.executionSlotReleased!==true||j.state==='TESTS_VERIFIED'){done(fail('AI_SLOT_ADMISSION_NOT_PENDING'));return}
      withCurrentReady(m,j,done,()=>m.get('stage:'+name).onsuccess=st=>{const s=st.target.result?.record;
       if(!s||s.state!=='SOURCE_VERIFIED'||s.revision!==j.stageRevision||s.humanReclaimPending){done(fail('AI_STAGE_OR_HUMAN_RECLAIM_PENDING'));return;}
       m.get('ai-concurrency').onsuccess=setting=>{const limit=setting.target.result?.setting?.perAccount||1;const capacityRows=[];
        m.openCursor().onsuccess=scan=>{const c=scan.target.result;if(c){capacityRows.push(c.value);c.continue();return}
          if(countAiCapacity(capacityRows,row.accountId,name)>=limit){done(fail('AI_ACCOUNT_CONCURRENCY_HELD'));return}
          const next={...j,awaitingExecutionSlot:false,executionSlotReleased:false,controlRevision:(j.controlRevision||1)+1};m.put({...row,job:next});
          t.objectStore('events').add({stage:'AI_EXECUTION_SLOT_RESERVED',slug:name,revision:j.revision});done(publicJob(next));
        };
       };
      });
    }});
  }
  function operatorControl(name,expectedRevision,expectedControlRevision,{paused,instructions,judgment}={}){
    if(!slug(name)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
       !Number.isSafeInteger(expectedControlRevision)||expectedControlRevision<1||
       (paused!==undefined&&typeof paused!=='boolean')||
       (judgment!==undefined&&(judgment!=='UNPRODUCTIVE'||paused!==true))||
       (instructions!==undefined&&(typeof instructions!=='string'||instructions.trim().length<3||instructions.length>4000||instructions.includes('\0')))||
       (paused===undefined)===(instructions===undefined))return Promise.resolve(fail('AI_CONTROL_INVALID'));
    return tx(db,'readwrite',(t,done)=>{const m=t.objectStore('meta');m.get(key(name)).onsuccess=e=>{
      const row=e.target.result,j=row?.job;if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
      if(j.revision!==expectedRevision||(j.controlRevision||1)!==expectedControlRevision){done(fail('STALE_REVISION'));return;}
      if(j.state==='HUMAN_OWNED'){done(fail('HUMAN_EDITOR_HOLD'));return;}
      if(instructions!==undefined&&(j.state==='TESTS_VERIFIED'||j.operatorInstruction||j.exceptionFrozen)){
        done(fail(j.operatorInstruction?'AI_INSTRUCTION_ALREADY_QUEUED':'AI_TESTED_CANDIDATE_REQUEST_CHANGES_REQUIRED'));return;
      }
      const next={...j,controlRevision:expectedControlRevision+1};
      if(instructions!==undefined)next.operatorInstruction={id:next.controlRevision,text:instructions.trim(),status:'QUEUED',stageRevision:j.stageRevision};
      if(paused!==undefined)next.operatorPaused=paused;
      if(judgment==='UNPRODUCTIVE')next.operatorJudgment={kind:judgment,sourceFingerprint:j.sourceFingerprint,at:Date.now()};
      if(paused===false)next.operatorJudgment=null;
      const idle=['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(j.native?.state)&&j.finalSource?.fingerprint===j.sourceFingerprint;
      if(paused===true&&idle)next.executionSlotReleased=true;
      const commit=()=>{m.put({...row,job:next});t.objectStore('events').add({stage:instructions!==undefined?'AI_OPERATOR_INSTRUCTION_QUEUED':'AI_OPERATOR_PAUSE_CHANGED',slug:name,
        controlRevision:next.controlRevision,jobRevision:j.revision,...(instructions!==undefined?{instructions:instructions.trim()}:{paused,judgment:judgment||null})});done(publicJob(next));};
      if(paused!==false||!j.executionSlotReleased||j.state==='TESTS_VERIFIED'||j.exceptionFrozen){commit();return;}
      // Resume records intent immediately; the existing supervisor reserves
      // capacity atomically before another native effect, without operator polling.
      next.awaitingExecutionSlot=true;next.executionSlotReleased=true;commit();
    }});
  }
  const getPrompt=()=>tx(db,'readonly',(t,done)=>{
    t.objectStore('meta').get('ai-prompts').onsuccess=e=>{
      const history=e.target.result?.history||initialPrompt();
      done({ok:true,current:history.at(-1),history});
    };
  });
  const getConcurrency=()=>tx(db,'readonly',(t,done)=>{
    t.objectStore('meta').get('ai-concurrency').onsuccess=e=>
      done({ok:true,setting:e.target.result?.setting||{revision:1,perAccount:1}});
  });
  function changeConcurrency(expectedRevision,perAccount){
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
       !Number.isSafeInteger(perAccount)||perAccount<1||perAccount>4)
      return Promise.resolve(fail('AI_CONCURRENCY_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('ai-concurrency').onsuccess=e=>{
        const old=e.target.result?.setting||{revision:1,perAccount:1};
        if(old.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        const setting={revision:expectedRevision+1,perAccount};
        m.put({key:'ai-concurrency',setting});
        t.objectStore('events').add({stage:'AI_CONCURRENCY_UPDATED',
          revision:setting.revision,perAccount});
        done({ok:true,setting});
      };
    });
  }
  function changePrompt(request,expectedRevision,imported=false){
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('ai-prompts').onsuccess=e=>{
        const history=e.target.result?.history||initialPrompt();
        const result=imported?
          importPrompt(history,request,expectedRevision):
          revisePrompt(history,request,expectedRevision);
        if(!result.ok){done(result);return;}
        m.put({key:'ai-prompts',history:result.history});
        t.objectStore('events').add({stage:'AI_PROMPT_REVISED',revision:result.history.at(-1).revision});
        done({ok:true,current:result.history.at(-1),history:result.history});
      };
    });
  }
  const getJob=s=>!slug(s)?Promise.resolve(fail('INVALID_SLUG')):
    tx(db,'readonly',(t,done)=>{
      t.objectStore('meta').get(key(s)).onsuccess=e=>{
        done(publicJob(e.target.result?.job));
      };
    });
  // A failed single-step wake is deferred without changing canonical test
  // evidence, the native DISPATCH_POSSIBLE marker or per-account admission.
  // This avoids starving another healthy account on a persistently held tab.
  function deferScheduler(slugName,expectedRevision,until,code){
    if(!slug(slugName)||!Number.isSafeInteger(expectedRevision)||
       !Number.isSafeInteger(until)||until<1||
       typeof code!=='string'||!/^AI_[A-Z0-9_]{2,80}$/.test(code))
      return Promise.resolve(fail('AI_SCHEDULER_DEFERRAL_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const row=e.target.result,j=row?.job;
        if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(j.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        const next={...j,revision:j.revision+1,
          schedulerDeferredUntil:until,schedulerHold:code};
        m.put({...row,job:next});
        t.objectStore('events').add({stage:'AI_SCHEDULER_DEFERRED',
          slug:slugName,revision:next.revision,until,code});
        done(publicJob(next));
      };
    });
  }
  const getJobFull=s=>!slug(s)?Promise.resolve(fail('INVALID_SLUG')):
    tx(db,'readonly',(t,done)=>{
      t.objectStore('meta').get(key(s)).onsuccess=e=>{
        const job=e.target.result?.job;
        done(job?{ok:true,job}:fail('AI_JOB_NOT_FOUND'));
      };
    });
  // S05 paginated listing; prior 200-job truncation silently hid eligible
  // work. Cursor is an ordinary ordered slug, not an effect/claim token.
  const list=({after='',limit=200,query='',status='ALL',legacyOnly=false}={})=>{
    if(typeof legacyOnly!=='boolean'||typeof query!=='string'||query.length>100||
       !['ALL','NEEDS_ACTION','RUNNING','WAITING','COMPLETED'].includes(status))
      return Promise.resolve(fail('AI_PAGE_INVALID'));
    if(typeof after!=='string'||after.length>100||
       !Number.isInteger(limit)||limit<1||limit>200)
      return Promise.resolve(fail('AI_PAGE_INVALID'));
    return tx(db,'readonly',(t,done)=>{
      const jobs=[];let truncated=false;
      t.objectStore('meta').openCursor().onsuccess=e=>{
        const cursor=e.target.result;
        if(!cursor){done({ok:true,jobs,truncated,more:truncated,
          nextCursor:truncated?jobs.at(-1)?.slug||null:null});return;}
        if(typeof cursor.key==='string'&&cursor.key.startsWith('ai-job:')&&
           cursor.value?.job){
          const slugName=cursor.key.slice('ai-job:'.length);
          if((!legacyOnly||!cursor.value.job.readyIdentifier)&&slugName>after&&slugName.toLowerCase().includes(query.toLowerCase())){
            const job=publicJob(cursor.value.job);
            const completed=job.state==='TESTS_VERIFIED'||job.slotReleased===true;
            const needs=['HELD_RECONCILE','KNOWN_FAILURE','HELD_NO_PROGRESS',
              'TESTS_UNVERIFIED','PENDING_NATIVE_SESSION'].includes(job.state);
            const running=job.nativeState==='RUNNING_OBSERVED';
            const matches=status==='ALL'||status==='NEEDS_ACTION'&&needs||
              status==='RUNNING'&&running||
              status==='WAITING'&&!needs&&!running&&!completed||
              status==='COMPLETED'&&completed;
            if(matches){
              if(jobs.length<limit)jobs.push(job);else truncated=true;
            }
          }
        }
        cursor.continue();
      };
    });
  };
  function start(stage,optionalTesting=null,promptOverride=null){
    if(!stage?.slug||!slug(stage.slug))return Promise.resolve(fail('INVALID_STAGE'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('ai-prompts').onsuccess=p=>{
        // S05's Git-owned Chat 1 prompt is supplied only through a trusted
        // pinned-main native-vault boundary; the UI cannot inject it here.
        const prompt=promptOverride||((p.target.result?.history||initialPrompt()).at(-1));
        const started=beginAiJob({stage,prompt,optionalTesting});
        if(!started.ok){done(started);return;}
        const account=stage.accountId;
        m.get('ai-concurrency').onsuccess=settingRequest=>{
          const limit=settingRequest.target.result?.setting?.perAccount||1;
          const capacityRows=[];
          m.openCursor().onsuccess=e=>{
            const cursor=e.target.result;
            if(cursor){
              capacityRows.push(cursor.value);
              cursor.continue();return;
            }
            if(countAiCapacity(capacityRows,account,stage.slug)>=limit){done(fail('AI_ACCOUNT_CONCURRENCY_HELD'));return;}
            m.get(key(stage.slug)).onsuccess=old=>{
              const previous=old.target.result?.job;
              const commit=()=>{
                if(previous?.operatorPaused){done(fail('AI_OPERATOR_PAUSED'));return;}
                const write=()=>{
                  const job={...started.job,revision:previous?previous.revision+1:1,
                    createdAt:Date.now(),
                    ...(stage.readyIdentifier?{
                      readyIdentifier:stage.readyIdentifier,
                      readyInputFingerprint:stage.readyInputFingerprint}:{})};
                  if(previous){
                    m.add({key:'ai-history:'+stage.slug+':'+previous.revision,
                      accountId:account,job:structuredClone(previous)});
                    m.put({key:key(stage.slug),accountId:account,job});
                  }else m.add({key:key(stage.slug),accountId:account,job});
                  t.objectStore('events').add({stage:'AI_JOB_CREATED',slug:stage.slug,
                    sourceFingerprint:job.sourceFingerprint,promptRevision:prompt.revision,
                    ...(job.readyIdentifier?{readyIdentifier:job.readyIdentifier}:{})});
                  done(publicJob(job));
                };
                if(!stage.readyIdentifier){write();return;}
                // The external donor check happened before this transaction.
                // Re-read the canonical SOURCE_VERIFIED stage *inside* the
                // committing IDB transaction, or stale caller snapshots could
                // create jobs after a newer READY or source-writer takeover.
                m.get('stage:'+stage.slug).onsuccess=sr=>{
                  const current=sr.target.result?.record;
                  if(!current||current.state!=='SOURCE_VERIFIED'||
                     current.revision!==stage.revision||
                     current.accountId!==stage.accountId||
                     current.personaUid!==stage.personaUid||
                     current.remotePublicId!==stage.remotePublicId||
                     current.bindingVersion!==stage.bindingVersion||
                     current.readyIdentifier!==stage.readyIdentifier||
                     current.readyInputFingerprint!==stage.readyInputFingerprint||
                     current.nonce!==stage.nonce||
                     current.candidate?.fingerprint!==stage.candidate?.fingerprint||
                     current.previous?.fingerprint!==stage.previous?.fingerprint||
                     !Number.isSafeInteger(current.verifiedAt)||
                     current.verifiedAt<1){
                    done(fail('AI_CANONICAL_STAGE_CHANGED'));return;
                  }
                  write();
                };
              };
              if(!previous){
                if(stage.readyIdentifier){
                  m.get('s05-ready:'+stage.slug).onsuccess=rr=>{
                    const ready=rr.target.result?.record;
                    if(!ready?.active||ready.desired||['READY_REVOKED_NOT_READY','OPERATOR_PAUSED'].includes(ready.hold)||
                       ready.active.identifier!==stage.readyIdentifier||
                       ready.active.inputFingerprint!==stage.readyInputFingerprint){
                      done(fail('AI_READY_CANDIDATE_CHANGED'));return;
                    }
                    commit();
                  };
                }else commit();
                return;
              }
              if(previous.stageRevision===stage.revision){
                done(fail('AI_EXISTING_JOB_RECONCILE'));return;
              }
              if(stage.readyIdentifier){
                m.get('s05-ready:'+stage.slug).onsuccess=rr=>{
                  const ready=rr.target.result?.record;
                  if(!ready?.active||ready.desired||['READY_REVOKED_NOT_READY','OPERATOR_PAUSED'].includes(ready.hold)||
                     ready.active.identifier!==stage.readyIdentifier||
                     ready.active.inputFingerprint!==stage.readyInputFingerprint){
                    done(fail('AI_READY_CANDIDATE_CHANGED'));return;
                  }
                  const native=previous.native?.state;
                  const provenIdle=previous.state==='PENDING_NATIVE_SESSION'&&!previous.native||
                    ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(native);
                  const saved=previous.finalSource?.fingerprint||
                    (previous.state==='PENDING_NATIVE_SESSION'?previous.sourceFingerprint:null);
                  if(!provenIdle||!stage.previous?.ok||
                     saved!==stage.previous.fingerprint||
                     ['HELD_RECONCILE','HUMAN_OWNED','HELD_NO_PROGRESS'].includes(previous.state)){
                    done(fail('AI_PREVIOUS_NATIVE_OR_SOURCE_NOT_QUIESCENT'));return;
                  }
                  m.get('release:'+stage.slug).onsuccess=re=>{
                    const state=re.target.result?.release?.state;
                    if(['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN',
                      'RECOVERY_HOLD','PUBLISHING'].includes(state)){
                      done(fail('AI_PREVIOUS_PUBLICATION_UNCERTAIN'));return;
                    }
                    commit();
                  };
                };
              }else{
                if(!slotReleased(previous)||previous.state!=='TESTS_VERIFIED'){
                  done(fail('AI_EXISTING_JOB_RECONCILE'));return;
                }
                m.get('release:'+stage.slug).onsuccess=re=>{
                  const release=re.target.result?.release;
                  if(release?.state!=='CONFIRMED_PUBLIC'||
                     release.source!=='INDEPENDENT_PUBLICATION_READBACK'||
                     release.approval?.jobRevision!==previous.revision||
                     release.approval?.sourceFingerprint!==previous.verifiedFinal||
                     release.approval?.accountId!==stage.accountId||
                     release.approval?.remotePublicId!==stage.remotePublicId){
                    done(fail('AI_PREVIOUS_RELEASE_NOT_CONFIRMED'));return;
                  }
                  commit();
                };
              }
            };
          };
        };
      };
    });
  }
  function record(slugName,expectedRevision,evidence){
    if(!slug(slugName)||!Number.isSafeInteger(expectedRevision))
      return Promise.resolve(fail('AI_COMMAND_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const prior=e.target.result;
        if(!prior?.job){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(prior.job.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        const result=applyAiEvidence(prior.job,evidence);
        if(!result.ok){done(result);return;}
        if(result.job.native?.state==='CHAT2_OBSERVED_IDLE'&&
           result.job.chat2?.state!=='FRESH_VERIFIED')
          result.job.hold='AI_CHAT2_ISOLATION_UNVERIFIED';
        // A truthful PASS does not itself prove native helper quiescence.
        // The same exact saved F and a separately observed idle session do.
        // Any newly observed FAIL, changed source or revoked evidence must
        // reoccupy the job's execution slot. A prior successful result is
        // never permanent scheduling authority for subsequent source.
        result.job.executionSlotReleased=Boolean(
          result.job.state==='TESTS_VERIFIED'&&
          result.job.finalSource?.fingerprint===result.job.verifiedFinal&&
          ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(result.job.native?.state));
        result.job.exceptionFrozen=false;
        if(prior.job.executionSlotReleased&&result.job.state!=='TESTS_VERIFIED'){
          result.job.awaitingExecutionSlot=true;result.job.executionSlotReleased=true;
        }
        const write=()=>{
          m.put({...prior,job:result.job});
          t.objectStore('events').add({stage:'AI_EVIDENCE_RECORDED',slug:slugName,
            revision:result.job.revision,kind:evidence.type,
            state:result.job.state});
          done(publicJob(result.job));
        };
        if(evidence.type==='INTERRUPT')write();
        else withCurrentReady(m,prior.job,done,write);
      };
    });
  }
  // Only the protected same-XPI boundary supplies both independently
  // observed native-server first-message history and session-local OPFS.
  // This does not claim test PASS or authorize writes/publication.
  function verifySecondChat(slugName,expectedRevision,history,workspace){
    if(!slug(slugName)||!Number.isSafeInteger(expectedRevision)||
       history?.ok!==true||
       history.code!=='AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED'||
       history.serverHistory!=='FIRST_USER_IS_T1'||
       workspace?.ok!==true||workspace.isolation!=='UNVERIFIED'||
       workspace.workspaceRootState!=='PRESENT_UNTRUSTED'||
       workspace.workerNamespace!=='CURRENT_SESSION_WORKER_INIT_LOCK'||
       history.sessionDigest!==workspace.sessionDigest||
       history.sessionDigest===undefined)
      return Promise.resolve(fail('AI_FRESH_CHAT_EVIDENCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const row=e.target.result,j=row?.job;
        if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(j.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(j.native?.state!=='CHAT2_OBSERVED_IDLE'||
           j.chat2?.state!=='FRESH_OBSERVED'||
           !j.optionalTesting||
           j.chat1?.sessionDigest===j.chat2.sessionDigest||
           history.sessionDigest!==j.chat2.sessionDigest||
           !j.finalSource||j.finalSource.fingerprint!==j.sourceFingerprint||
           j.state==='HELD_RECONCILE'||j.state==='HUMAN_OWNED'||
           j.state==='HELD_NO_PROGRESS')
          {done(fail('AI_FRESH_CHAT_CONTEXT_CHANGED'));return;}
        const existing=evaluation(j);
        const known=existing.state==='KNOWN_FAILURE';
        const next={...j,revision:j.revision+1,
          chat2:{...j.chat2,state:'FRESH_VERIFIED'},
          state:known?'KNOWN_FAILURE':'TESTS_UNVERIFIED',
          hold:known?'KNOWN_FAILURE':'INDEPENDENT_BROWSER_TESTS_REQUIRED',
          executionSlotReleased:false};
        withCurrentReady(m,j,done,()=>{
          m.put({...row,job:next});
          t.objectStore('events').add({
            stage:'AI_CHAT2_FRESHNESS_OBSERVED',slug:slugName,revision:next.revision,
            sessionDigest:next.chat2.sessionDigest,
            sourceFingerprint:next.sourceFingerprint
          });
          done(publicJob(next));
        });
      };
    });
  }
  // Durable external-effect marker. Firefox (or a disconnected response)
  // can die at any boundary; no code automatically retries this marker.
  function armNative(slugName,expectedRevision,step){
    if(!slug(slugName)||!['CHAT1_SEND','CHAT2_RESET','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR','CHAT1_INSTRUCT','CHAT2_INSTRUCT','STOP'].includes(step))
      return Promise.resolve(fail('AI_STEP_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const row=e.target.result,j=row?.job;
        if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(j.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(j.native?.state==='DISPATCH_POSSIBLE'){done(fail('AI_EFFECT_RECONCILIATION_REQUIRED'));return;}
        if(j.exceptionFrozen&&step!=='STOP'){done(fail('AI_EXCEPTION_REVIEW_FROZEN'));return;}
        if(j.executionSlotReleased&&step!=='STOP'){done(fail('AI_EXECUTION_SLOT_RELEASED'));return;}
        const decision=evaluation(j);
        if(step==='CHAT1_SEND'&&
           (j.chat1.sessionDigest!==null||j.native))
          {done(fail('AI_EXISTING_SESSION_RECONCILE'));return;}
        if(step==='CHAT2_RESET'&&
           (decision.chat1Pass!==true||!j.optionalTesting||
            !j.chat1.sessionDigest||j.native?.state!=='CHAT1_OBSERVED_IDLE'))
          {done(fail('AI_CHAT1_PROOF_REQUIRED'));return;}
        if(step==='CHAT2_SEND'&&
           (j.native?.state!=='CHAT2_RESET_OBSERVED'||
            j.chat2?.sessionDigest||!j.optionalTesting))
          {done(fail('AI_FRESH_CHAT_REQUIRED'));return;}
        if(step==='CHAT2_REPAIR'&&j.chat2?.state!=='FRESH_VERIFIED')
          {done(fail('AI_CHAT2_ISOLATION_UNVERIFIED'));return;}
        if(['CHAT1_REPAIR','CHAT2_REPAIR'].includes(step)){
          const chat=step==='CHAT1_REPAIR'?j.chat1:j.chat2;
          const idle=step==='CHAT1_REPAIR'?'CHAT1_OBSERVED_IDLE':'CHAT2_OBSERVED_IDLE';
          if(j.state!=='KNOWN_FAILURE'||j.native?.state!==idle||
             !chat?.sessionDigest||j.native.sessionDigest!==chat.sessionDigest||
             !j.finalSource||j.finalSource.fingerprint!==j.sourceFingerprint)
            {done(fail('AI_VERIFIED_FAILURE_AND_SESSION_REQUIRED'));return;}
        }
        if(step.endsWith('INSTRUCT')){
          const chat=step==='CHAT1_INSTRUCT'?j.chat1:j.chat2,idle=step==='CHAT1_INSTRUCT'?'CHAT1_OBSERVED_IDLE':'CHAT2_OBSERVED_IDLE';
          if(j.operatorInstruction?.status!=='QUEUED'||j.operatorInstruction.stageRevision!==j.stageRevision||
             j.state==='TESTS_VERIFIED'||j.native?.state!==idle||!chat?.sessionDigest||j.native.sessionDigest!==chat.sessionDigest||
             !j.finalSource||j.finalSource.fingerprint!==j.sourceFingerprint||(step==='CHAT2_INSTRUCT'&&chat.state!=='FRESH_VERIFIED')){
            done(fail('AI_INSTRUCTION_CONTEXT_CHANGED'));return;
          }
        }
        if(step==='STOP'&&j.native?.state!=='RUNNING_OBSERVED')
          {done(fail('AI_STOP_NOT_ADMISSIBLE'));return;}
        const next={...j,revision:j.revision+1,
          native:{step,state:'DISPATCH_POSSIBLE',
            previousSessionDigest:j.native?.sessionDigest||j.chat1.sessionDigest||null,
            stoppedChat:j.native?.step?.startsWith('CHAT2')?2:1,
            ...(step.endsWith('INSTRUCT')?{instructionId:j.operatorInstruction.id}:{}),
            armedAt:Date.now()},state:'HELD_RECONCILE',
          hold:'NATIVE_EFFECT_MAY_HAVE_OCCURRED'};
        const commit=()=>{
          if(step.endsWith('INSTRUCT')){next.operatorInstruction=null;t.objectStore('events').add({stage:'AI_OPERATOR_INSTRUCTION_DISPATCH_POSSIBLE',slug:slugName,instructionId:j.operatorInstruction.id,instructions:j.operatorInstruction.text,revision:next.revision});}
          m.put({...row,job:next});
          t.objectStore('events').add({stage:'AI_DISPATCH_POSSIBLE',
            slug:slugName,revision:next.revision,step});
          done(publicJob(next));
        };
        if(step==='STOP')commit();
        else withCurrentReady(m,j,done,commit);
      };
    });
  }
  // A *read-only* observation may release one uncertainty, never replay it.
  // The caller alone supplies an observation from its pinned donor-owned tab.
  function observeNative(slugName,expectedRevision,observation){
    if(!slug(slugName)||!Number.isSafeInteger(expectedRevision)||
       observation?.ok!==true||observation.slug!==slugName||
       !['boolean'].includes(typeof observation.busy)||
       (observation.sessionDigest!==null &&
        !/^[a-f0-9]{64}$/.test(observation.sessionDigest||'')))
      return Promise.resolve(fail('AI_NATIVE_OBSERVATION_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const row=e.target.result,j=row?.job;
        if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(j.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(!j.native||!['DISPATCH_POSSIBLE','RUNNING_OBSERVED'].includes(j.native.state))
          {done(fail('AI_NO_PENDING_NATIVE_EFFECT'));return;}
        const step=j.native.step,digest=observation.sessionDigest;
        let state;
        if(['CHAT1_SEND','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR','CHAT1_INSTRUCT','CHAT2_INSTRUCT'].includes(step)){
          // One static native greeting is *not* evidence that an armed
          // SEND actually entered the conversation. Require a separate
          // native message row before accepting a session/idle receipt.
          if(!digest||!Number.isSafeInteger(observation.chatEntries)||
             observation.chatEntries<2||
             (step.endsWith('REPAIR')||step.endsWith('INSTRUCT')?
               digest!==j.native.previousSessionDigest:
               digest===j.native.previousSessionDigest))
            {done(fail('AI_SESSION_UNVERIFIED'));return;}
          state=observation.busy?'RUNNING_OBSERVED':
            ['CHAT1_SEND','CHAT1_REPAIR','CHAT1_INSTRUCT'].includes(step)?'CHAT1_OBSERVED_IDLE':'CHAT2_OBSERVED_IDLE';
        }else if(step==='CHAT2_RESET'){
          // A session identifier reset alone cannot prove a new Chat2.
          // All old visible messages, draft input and queued work must also
          // have cleared; OPFS/server isolation still requires separate proof.
          if(digest!==null||observation.busy||
             !(observation.chatEntries===0||
               (observation.chatEntries===1&&observation.resetGreetingVisible===true))||
             observation.inputOccupied!==false||observation.hasQueue!==false||
             observation.attachmentsPending!==false)
            {done(fail('AI_CHAT2_RESET_NOT_PROVEN'));return;}
          state='CHAT2_RESET_OBSERVED';
        }else{
          if(observation.busy||!digest||digest!==j.native.previousSessionDigest){done(fail('AI_STOP_NOT_OBSERVED'));return;}
          state=j.native.stoppedChat===2?'CHAT2_OBSERVED_IDLE':'CHAT1_OBSERVED_IDLE';
        }
        const next={...j,revision:j.revision+1,
          native:{...j.native,state,sessionDigest:digest,observedAt:Date.now()},
          state:'TESTS_UNVERIFIED',hold:step==='CHAT2_SEND'||step==='CHAT2_REPAIR'?
            'AI_CHAT2_ISOLATION_UNVERIFIED':'INDEPENDENT_BROWSER_TESTS_REQUIRED'};
        // Native session evidence is distinguished from proof of user-facing
        // test assertions: no success here comes from text or busy=false.
        if(['CHAT1_SEND','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR','CHAT1_INSTRUCT','CHAT2_INSTRUCT'].includes(step)){
          const chat=['CHAT1_SEND','CHAT1_REPAIR','CHAT1_INSTRUCT'].includes(step)?next.chat1:next.chat2;
          chat.sessionDigest=digest;
          // A new hashed SID plus cleared UI is necessary but insufficient
          // to prove the native server/OPFS workspace is isolated. No
          // independent OPFS namespace oracle currently exists.
          if(!step.endsWith('INSTRUCT'))chat.state=['CHAT2_SEND','CHAT2_REPAIR'].includes(step)?'FRESH_OBSERVED':'RUNNING';
        }
        m.put({...row,job:next});
        t.objectStore('events').add({stage:'AI_NATIVE_OBSERVED',
          slug:slugName,revision:next.revision,observation:state});
        done(publicJob(next));
      };
    });
  }
  // Independently observed entire saved generator F. The native helper
  // may edit PJS, HTML and src/ assets (accepted F2 amendment). This receipt
  // never confers PASS and is not visible as full source through the UI port.
  function checkpointSource(slugName,expectedRevision,snapshot){
    if(!slug(slugName)||!Number.isSafeInteger(expectedRevision)||
       snapshot?.ok!==true||!/^[a-f0-9]{64}$/.test(snapshot.fingerprint||'')||
       !Array.isArray(snapshot.blobs)||!Array.isArray(snapshot.files)||
       snapshot.blobs.length>502||snapshot.files.length!==snapshot.blobs.length||
       snapshot.totalBytes>16*1024*1024)
      return Promise.resolve(fail('AI_FULL_SOURCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const row=e.target.result,j=row?.job;
        if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(j.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(!['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(j.native?.state))
          {done(fail('AI_NATIVE_IDLE_REQUIRED'));return;}
        const changed=j.sourceFingerprint!==snapshot.fingerprint;
        if(j.exceptionFrozen&&!changed){done(publicJob(j));return;}
        const next={...j,revision:j.revision+1,
          exceptionFrozen:changed?false:j.exceptionFrozen===true,
          sourceFingerprint:snapshot.fingerprint,
          executionSlotReleased:changed?false:j.executionSlotReleased===true,
          finalSource:{fingerprint:snapshot.fingerprint,
            files:structuredClone(snapshot.files),blobs:structuredClone(snapshot.blobs),
            totalBytes:snapshot.totalBytes},
          verifiedFinal:changed?null:j.verifiedFinal,
          hold:j.native?.state==='CHAT2_OBSERVED_IDLE'&&j.chat2?.state!=='FRESH_VERIFIED'?
            'AI_CHAT2_ISOLATION_UNVERIFIED':
            changed?'INDEPENDENT_BROWSER_TESTS_REQUIRED':j.hold,
          state:changed?'TESTS_UNVERIFIED':j.state};
        if(changed&&j.executionSlotReleased){next.awaitingExecutionSlot=true;next.executionSlotReleased=true;}
        if(changed){
          next.chat1={...next.chat1,tests:{}};
          if(next.chat2)next.chat2={...next.chat2,tests:{}};
          // This is a bounded recent-change index, not an iteration budget.
          // Complete source checkpoints remain in immutable history rows.
          next.changes=[...(next.changes||[]),{fingerprint:snapshot.fingerprint,
            kind:'GUARDED_NATIVE_FULL_SOURCE_READBACK'}].slice(-128);
        }
        // C-46: unchanged bytes or repeated failing assertions are NOT
        // evidence of subjective AI stagnation. Preserve genuine failure
        // without imposing a guessed iteration count or disabling repair.
        // Independent objective budgets and operator PAUSE are separate.
        if(evaluation(next).state==='KNOWN_FAILURE'){
          next.state='KNOWN_FAILURE';next.hold='KNOWN_FAILURE_RETEST_REQUIRED';
        }
        if(next.state==='HELD_NO_PROGRESS'&&
           ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(next.native?.state))
          next.executionSlotReleased=true;
        if(next.operatorPaused&&['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(next.native?.state))next.executionSlotReleased=true;
        const commit=prior=>{
          if(changed)m.add({key:'ai-history:'+slugName+':'+j.revision,
            accountId:row.accountId,job:{...structuredClone(j),finalSource:structuredClone(prior)},
            archivedAt:Date.now(),reason:'SOURCE_CHANGED'});
          m.put({...row,job:next});
          t.objectStore('events').add({stage:'AI_FULL_SOURCE_CHECKPOINT',
            slug:slugName,revision:next.revision,sourceFingerprint:snapshot.fingerprint,
            changed});
          done(publicJob(next));
        };
        if(!changed||j.finalSource?.fingerprint===j.sourceFingerprint){commit(j.finalSource);return;}
        // Before the first native edit, the exact old source lives in its
        // canonical stage. Archive it in the same transaction as the change.
        m.get('stage:'+slugName).onsuccess=sr=>{
          const s=sr.target.result?.record;
          if(s?.revision!==j.stageRevision||s.candidate?.fingerprint!==j.sourceFingerprint){
            done(fail('AI_PREVIOUS_SOURCE_CHECKPOINT_REQUIRED'));return;
          }
          commit(s.candidate);
        };
      };
    });
  }

  function recoverNative(){
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');let held=0;
      m.openCursor().onsuccess=e=>{
        const c=e.target.result;
        if(c){
          const j=c.value?.job;
          if(typeof c.key==='string'&&c.key.startsWith('ai-job:')&&
             j?.native?.state==='DISPATCH_POSSIBLE'&&
             j.native.recoveryObserved!==true){
            const next={...j,revision:j.revision+1,
              native:{...j.native,recoveryObserved:true},
              state:'HELD_RECONCILE',hold:'NATIVE_EFFECT_MAY_HAVE_OCCURRED'};
            c.update({...c.value,job:next});
            t.objectStore('events').add({stage:'AI_CRASH_HOLD',slug:j.slug,
              revision:next.revision});held++;
          }
          c.continue();return;
        }
        done({ok:true,held});
      };
    });
  }
  return Object.freeze({
    getPrompt,changePrompt,getConcurrency,changeConcurrency,exportPrompt,getJob,getJobFull,list,start,record,
    armNative,observeNative,checkpointSource,recoverNative,deferScheduler,verifySecondChat,operatorControl,admitExecutionSlot
  });
}
