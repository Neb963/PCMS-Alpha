// I10 canonical local prompt/job receipts. IDB transaction owns CAS and allocation.
// Native effects and assertions must execute outside any transaction.
import {fail} from './journal.mjs';
import {initialPrompt,revisePrompt,importPrompt,exportPrompt,beginAiJob,applyAiEvidence,evaluation} from './ai-evidence.mjs';
const key=s=>'ai-job:'+s;
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const SAFE_STATES=new Set(['TESTS_VERIFIED','HELD_RECONCILE','HELD_NO_PROGRESS','HUMAN_OWNED']);
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
  return Object.freeze({
    getPrompt,changePrompt,exportPrompt,getJob,list,start,record
  });
}
