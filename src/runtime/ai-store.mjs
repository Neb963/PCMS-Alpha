// I10 canonical local prompt/job receipts. IDB transaction owns CAS and allocation.
// Native effects and assertions must execute outside any transaction.
import {fail} from './journal.mjs';
import {initialPrompt,revisePrompt,importPrompt,exportPrompt,beginAiJob,applyAiEvidence,evaluation} from './ai-evidence.mjs';
const key=s=>'ai-job:'+s;
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
// Interrupted, unknown or human-owned native sessions are NOT free execution
// slots. Even verified test results do not prove the helper session stopped.
const SAFE_STATES=new Set([]);
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
  provider:'NATIVE_AI_HELD_UNTIL_PROVEN',
  github:'NO_AI_WRITEBACK',publication:'OFF'}:fail('AI_JOB_NOT_FOUND');
export function createAiStore(db){
  const getPrompt=()=>tx(db,'readonly',(t,done)=>{
    t.objectStore('meta').get('ai-prompts').onsuccess=e=>{
      const history=e.target.result?.history||initialPrompt();
      done({ok:true,current:history.at(-1),history});
    };
  });
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
        // The same account cannot run parallel native helper jobs by default.
        // More concurrent work requires explicit later versioned configuration.
        const account=stage.accountId;
        let busy=false;
        m.openCursor().onsuccess=e=>{
          const c=e.target.result;
          if(c){
            if(typeof c.key==='string'&&c.key.startsWith('ai-job:')&&
              c.value?.accountId===account&&!SAFE_STATES.has(c.value.job.state))
              busy=true;
            c.continue();return;
          }
          if(busy){done(fail('AI_ACCOUNT_CONCURRENCY_HELD'));return;}
          m.get(key(stage.slug)).onsuccess=old=>{
            if(old.target.result){done(fail('AI_EXISTING_JOB_RECONCILE'));return;}
            // Fresh jobs always pin the current settings revision, never last
            // generator creation's prompt or a mutable global prompt reference.
            const job=started.job;
            m.add({key:key(stage.slug),accountId:account,job});
            t.objectStore('events').add({stage:'AI_JOB_CREATED',slug:stage.slug,
              sourceFingerprint:job.sourceFingerprint,promptRevision:prompt.revision});
            done(publicJob(job));
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
    if(!slug(slugName)||!['CHAT1_SEND','CHAT2_RESET','CHAT2_SEND','STOP'].includes(step))
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
        if(!j.native||j.native.state!=='DISPATCH_POSSIBLE')
          {done(fail('AI_NO_PENDING_NATIVE_EFFECT'));return;}
        const step=j.native.step,digest=observation.sessionDigest;
        let state;
        if(step==='CHAT1_SEND'||step==='CHAT2_SEND'){
          if(!digest||digest===j.native.previousSessionDigest)
            {done(fail('AI_SESSION_UNVERIFIED'));return;}
          state=observation.busy?'RUNNING_OBSERVED':
            step==='CHAT1_SEND'?'CHAT1_OBSERVED_IDLE':'CHAT2_OBSERVED_IDLE';
        }else if(step==='CHAT2_RESET'){
          if(digest!==null||observation.busy||observation.chatEntries>1)
            {done(fail('AI_CHAT2_RESET_NOT_PROVEN'));return;}
          state='CHAT2_RESET_OBSERVED';
        }else{
          if(observation.busy){done(fail('AI_STOP_NOT_OBSERVED'));return;}
          state='STOP_OBSERVED';
        }
        const next={...j,revision:j.revision+1,
          native:{...j.native,state,sessionDigest:digest,observedAt:Date.now()},
          state:'TESTS_UNVERIFIED',hold:'INDEPENDENT_BROWSER_TESTS_REQUIRED'};
        // Native session evidence is distinguished from proof of user-facing
        // test assertions: no success here comes from text or busy=false.
        if(step==='CHAT1_SEND'||step==='CHAT2_SEND'){
          const chat=step==='CHAT1_SEND'?next.chat1:next.chat2;
          chat.sessionDigest=digest;
          chat.state=step==='CHAT2_SEND'?'FRESH_VERIFIED':'RUNNING';
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
          finalSource:{fingerprint:snapshot.fingerprint,
            files:structuredClone(snapshot.files),blobs:structuredClone(snapshot.blobs),
            totalBytes:snapshot.totalBytes},
          verifiedFinal:null,hold:'INDEPENDENT_BROWSER_TESTS_REQUIRED',
          state:'TESTS_UNVERIFIED'};
        if(changed){
          next.chat1={...next.chat1,tests:{}};
          if(next.chat2)next.chat2={...next.chat2,tests:{}};
          next.changes=[...next.changes,{fingerprint:snapshot.fingerprint,
            kind:'GUARDED_NATIVE_FULL_SOURCE_READBACK'}];
          if(next.changes.length>256){
            next.state='HELD_NO_PROGRESS';next.hold='REPAIR_RESOURCE_BOUND';
          }
        }
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
    getPrompt,changePrompt,exportPrompt,getJob,getJobFull,list,start,record,
    armNative,observeNative,checkpointSource,recoverNative
  });
}
