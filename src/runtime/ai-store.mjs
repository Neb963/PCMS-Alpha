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
const publicJob=j=>j?{ok:true,slug:j.slug,revision:j.revision,state:j.state,
  sourceFingerprint:j.sourceFingerprint,promptRevision:j.prompt.revision,
  optionalTestingSha:j.optionalTesting?.sha256||null,
  evidence:evaluation(j),changes:j.changes,hold:j.hold,
  nativeState:j.native?.state||'NOT_STARTED',
  slotReleased:j.executionSlotReleased===true,
  chat2IsolationVerified:j.chat2?.state==='FRESH_VERIFIED',
  provider:'NATIVE_AI_HELD_UNTIL_PROVEN',
  github:'NO_AI_WRITEBACK',publication:'OFF'}:fail('AI_JOB_NOT_FOUND');
export function createAiStore(db){
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
  const list=()=>tx(db,'readonly',(t,done)=>{
    const jobs=[];let truncated=false;
    t.objectStore('meta').openCursor().onsuccess=e=>{
      const c=e.target.result;
      if(!c){done({ok:true,jobs,truncated});return;}
      if(typeof c.key==='string'&&c.key.startsWith('ai-job:')&&c.value?.job){
        if(jobs.length<200)jobs.push(publicJob(c.value.job));else truncated=true;
      }
      c.continue();
    };
  });
  function start(stage,optionalTesting=null){
    if(!stage?.slug||!slug(stage.slug))return Promise.resolve(fail('INVALID_STAGE'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('ai-prompts').onsuccess=p=>{
        const prompt=(p.target.result?.history||initialPrompt()).at(-1);
        const started=beginAiJob({stage,prompt,optionalTesting});
        if(!started.ok){done(started);return;}
        // Settings affect new admissions only; default one active job/account.
        const account=stage.accountId;
        m.get('ai-concurrency').onsuccess=settingRequest=>{
          const limit=settingRequest.target.result?.setting?.perAccount||1;
          let active=0;
          m.openCursor().onsuccess=e=>{
          const c=e.target.result;
          if(c){
            if(typeof c.key==='string'&&c.key.startsWith('ai-job:')&&
              c.value?.accountId===account&&!slotReleased(c.value.job))
              active++;
            c.continue();return;
          }
          if(active>=limit){done(fail('AI_ACCOUNT_CONCURRENCY_HELD'));return;}
          m.get(key(stage.slug)).onsuccess=old=>{
            if(old.target.result){done(fail('AI_EXISTING_JOB_RECONCILE'));return;}
            // Fresh jobs always pin the current settings revision, never last
            // generator creation's prompt or a mutable global prompt reference.
            const job={...started.job,createdAt:Date.now()};
            m.add({key:key(stage.slug),accountId:account,job});
            t.objectStore('events').add({stage:'AI_JOB_CREATED',slug:stage.slug,
              sourceFingerprint:job.sourceFingerprint,promptRevision:prompt.revision});
            done(publicJob(job));
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
        m.put({...prior,job:result.job});
        t.objectStore('events').add({stage:'AI_EVIDENCE_RECORDED',slug:slugName,
          revision:result.job.revision,kind:evidence.type,
          state:result.job.state});
        done(publicJob(result.job));
      };
    });
  }
  // Durable external-effect marker. Firefox (or a disconnected response)
  // can die at any boundary; no code automatically retries this marker.
  function armNative(slugName,expectedRevision,step){
    if(!slug(slugName)||!['CHAT1_SEND','CHAT2_RESET','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR','STOP'].includes(step))
      return Promise.resolve(fail('AI_STEP_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const row=e.target.result,j=row?.job;
        if(!j){done(fail('AI_JOB_NOT_FOUND'));return;}
        if(j.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(j.native?.state==='DISPATCH_POSSIBLE'){done(fail('AI_EFFECT_RECONCILIATION_REQUIRED'));return;}
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
        if(step==='STOP'&&j.native?.state!=='RUNNING_OBSERVED')
          {done(fail('AI_STOP_NOT_ADMISSIBLE'));return;}
        const next={...j,revision:j.revision+1,
          native:{step,state:'DISPATCH_POSSIBLE',
            previousSessionDigest:j.native?.sessionDigest||j.chat1.sessionDigest||null,
            armedAt:Date.now()},state:'HELD_RECONCILE',
          hold:'NATIVE_EFFECT_MAY_HAVE_OCCURRED'};
        m.put({...row,job:next});
        t.objectStore('events').add({stage:'AI_DISPATCH_POSSIBLE',
          slug:slugName,revision:next.revision,step});
        done(publicJob(next));
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
        if(['CHAT1_SEND','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR'].includes(step)){
          if(!digest||!Number.isSafeInteger(observation.chatEntries)||
             observation.chatEntries<1||
             (step.endsWith('REPAIR')?
               digest!==j.native.previousSessionDigest:
               digest===j.native.previousSessionDigest))
            {done(fail('AI_SESSION_UNVERIFIED'));return;}
          state=observation.busy?'RUNNING_OBSERVED':
            ['CHAT1_SEND','CHAT1_REPAIR'].includes(step)?'CHAT1_OBSERVED_IDLE':'CHAT2_OBSERVED_IDLE';
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
          if(observation.busy){done(fail('AI_STOP_NOT_OBSERVED'));return;}
          state='STOP_OBSERVED';
        }
        const next={...j,revision:j.revision+1,
          native:{...j.native,state,sessionDigest:digest,observedAt:Date.now()},
          state:'TESTS_UNVERIFIED',hold:step==='CHAT2_SEND'||step==='CHAT2_REPAIR'?
            'AI_CHAT2_ISOLATION_UNVERIFIED':'INDEPENDENT_BROWSER_TESTS_REQUIRED'};
        // Native session evidence is distinguished from proof of user-facing
        // test assertions: no success here comes from text or busy=false.
        if(['CHAT1_SEND','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR'].includes(step)){
          const chat=['CHAT1_SEND','CHAT1_REPAIR'].includes(step)?next.chat1:next.chat2;
          chat.sessionDigest=digest;
          // A new hashed SID plus cleared UI is necessary but insufficient
          // to prove the native server/OPFS workspace is isolated. No
          // independent OPFS namespace oracle currently exists.
          chat.state=['CHAT2_SEND','CHAT2_REPAIR'].includes(step)?
            'FRESH_OBSERVED':'RUNNING';
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
        const next={...j,revision:j.revision+1,
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
        if(changed){
          next.chat1={...next.chat1,tests:{}};
          if(next.chat2)next.chat2={...next.chat2,tests:{}};
          next.changes=[...next.changes,{fingerprint:snapshot.fingerprint,
            kind:'GUARDED_NATIVE_FULL_SOURCE_READBACK'}];
          if(next.changes.length>256){
            next.state='HELD_NO_PROGRESS';next.hold='REPAIR_RESOURCE_BOUND';
          }
        }
        if(changed)next.noProgressCount=0;
        else {
          // A verified failing assertion on identical F remains a KNOWN
          // FAILURE. Repeated native repair turns with no source movement
          // demonstrate lack of progress, not unavailable testing.
          const stillFailing=evaluation(next).state==='KNOWN_FAILURE';
          if(stillFailing){
            next.state='KNOWN_FAILURE';next.hold='KNOWN_FAILURE_RETEST_REQUIRED';
          }
          if(stillFailing&&['CHAT1_REPAIR','CHAT2_REPAIR'].includes(j.native.step)){
            next.noProgressCount=(j.noProgressCount||0)+1;
            if(next.noProgressCount>=2){
              next.state='HELD_NO_PROGRESS';
              next.hold='REPEATED_SAME_SOURCE_FAILED_REPAIR';
            }
          }
        }
        if(next.state==='HELD_NO_PROGRESS'&&
           ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(next.native?.state))
          next.executionSlotReleased=true;
        m.put({...row,job:next});
        t.objectStore('events').add({stage:'AI_FULL_SOURCE_CHECKPOINT',
          slug:slugName,revision:next.revision,sourceFingerprint:snapshot.fingerprint,
          changed});
        done(publicJob(next));
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
             j?.native?.state==='DISPATCH_POSSIBLE'){
            const next={...j,revision:j.revision+1,
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
    armNative,observeNative,checkpointSource,recoverNative,deferScheduler
  });
}
