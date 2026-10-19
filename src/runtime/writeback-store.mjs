// I11 canonical Git-only writeback receipts. The UI never handles sealed
// blobs, Git parent, commit refs or proof. No tokens are persisted.
import {fail} from './journal.mjs';
import {evaluation} from './ai-evidence.mjs';
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const key=s=>'writeback:'+s;
const settingsKey='writeback-settings';
const historyKey=(name,id)=>'writeback-history:'+name+':'+id;
// Atomic current-candidate admission, evaluated inside the same IDB
// transaction as DISPATCH_POSSIBLE (not solely in the background planner).
function s06ReadyMatches(stage,job,ready){
  const candidate=ready?.active;
  return !!(ready&&candidate&&!ready.hold&&!ready.desired&&
    stage?.readyIdentifier===candidate.identifier&&
    stage?.readyInputFingerprint===candidate.inputFingerprint&&
    job?.stageRevision===stage?.revision&&
    job?.verifiedFinal===job?.sourceFingerprint);
}
const fresh=()=>({revision:1,autoEnabled:false});
const show=r=>r?{ok:true,slug:r.slug,revision:r.revision,state:r.state,
  mode:r.mode,operationId:r.operationId,sourceFingerprint:r.sourceFingerprint,
  expectedHead:r.expectedHead,folder:r.folder,commitSha:r.commitSha||null,
  reason:r.reason||null,attribution:r.attribution||'UNVERIFIED',
  changedAt:r.changedAt,publication:'NOT_AUTHORIZED'}:fail('WRITEBACK_NOT_FOUND');
function transact(db,mode,run){
  return new Promise((resolve,reject)=>{
    let tx,result=fail('WRITEBACK_TRANSACTION_INCOMPLETE');
    try{tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
    catch{return reject(Error('WRITEBACK_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(Error('WRITEBACK_DB_ABORTED'));
    tx.onerror=()=>{};
    try{run(tx,x=>{result=x;});}catch{try{tx.abort();}catch{}}
  });
}
const eligible=(stage,job,origin)=>{
  if(!stage||stage.state!=='SOURCE_VERIFIED'||!stage.verifiedAt||
     !job||job.stageRevision!==stage.revision||
     job.slug!==stage.slug||!fp(stage.candidate?.fingerprint)||
     !fp(job.sourceFingerprint)||job.sourceFingerprint!==job.verifiedFinal||
     !job.finalSource||job.finalSource.fingerprint!==job.verifiedFinal||
     !['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.native?.state)||
     job.executionSlotReleased!==true||job.state!=='TESTS_VERIFIED'||
     evaluation(job).state!=='TESTS_VERIFIED')return fail('TESTED_FINAL_SOURCE_REQUIRED');
  if(origin?.sourceFingerprint!==job.sourceFingerprint||
     origin?.stageRevision!==stage.revision||
     origin?.jobRevision!==job.revision)return fail('WRITEBACK_CONTEXT_CHANGED');
  return {ok:true};
};
export function createWritebackStore(db){
  const settings=()=>transact(db,'readonly',(t,done)=>{
    t.objectStore('meta').get(settingsKey).onsuccess=e=>
      done({ok:true,setting:e.target.result?.setting||fresh()});
  });
  const changeSettings=(expectedRevision,autoEnabled)=>{
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
       typeof autoEnabled!=='boolean')return Promise.resolve(fail('INVALID_WRITEBACK_SETTINGS'));
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(settingsKey).onsuccess=e=>{
        const prior=e.target.result?.setting||fresh();
        if(prior.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        const next={revision:prior.revision+1,autoEnabled};
        m.put({key:settingsKey,setting:next});
        t.objectStore('events').add({stage:'GIT_AUTOMATIC_MODE_UPDATED',
          revision:next.revision,autoEnabled});
        done({ok:true,setting:next});
      };
    });
  };
  const getFull=name=>!slug(name)?Promise.resolve(fail('INVALID_SLUG')):
    transact(db,'readonly',(t,done)=>{
      t.objectStore('meta').get(key(name)).onsuccess=e=>{
        const r=e.target.result?.record;
        done(r?{ok:true,record:r}:fail('WRITEBACK_NOT_FOUND'));
      };
    });
  const get=async name=>{
    const x=await getFull(name);return x.ok?show(x.record):x;
  };
  const list=()=>transact(db,'readonly',(t,done)=>{
    const records=[];let truncated=false;
    t.objectStore('meta').openCursor().onsuccess=e=>{
      const c=e.target.result;
      if(!c){done({ok:true,items:records,truncated});return;}
      if(typeof c.key==='string'&&c.key.startsWith('writeback:')&&c.value?.record){
        if(records.length<200)records.push(show(c.value.record));
        else truncated=true;
      }
      c.continue();
    };
  });
  // Canonical CAS over AI, stage, auto-mode setting and writeback target.
  function prepare({name,stage,job,probe,mode,message,operationId}){
    if(!slug(name)||name!==stage?.slug||name!==job?.slug||
       !sha(probe?.head)||!sha(stage?.sourceHead)||!sha(probe?.baseHead)||
       probe.baseHead!==stage.sourceHead||probe.folder!==stage.sourceFolder||
       probe.folder!==job?.sourceFolder&&job?.sourceFolder!==undefined||
       !fp(job?.verifiedFinal)||!['MANUAL','AUTO','S06'].includes(mode)||
       typeof message!=='string'||message.length>120||
       !/^writeback_[a-f0-9]{32}$/.test(operationId||''))
      return Promise.resolve(fail('WRITEBACK_PREPARATION_INVALID'));
    const origin={sourceFingerprint:job.sourceFingerprint,
      stageRevision:stage.revision,jobRevision:job.revision};
    const check=eligible(stage,job,origin);
    if(!check.ok)return Promise.resolve(check);
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(name)).onsuccess=existing=>{
        const old=existing.target.result?.record;
        // An independently new S05 stage may succeed a confirmed commit.
        // Possible/uncertain effects are never reset or automatically retried.
        if(old&&old.state!=='CANCELED'&&!(old.state==='CONFIRMED'&&
           old.stageRevision!==stage.revision)){
          done(fail('WRITEBACK_ALREADY_EXISTS'));return;
        }
        m.get('stage:'+name).onsuccess=st=>{
          m.get('ai-job:'+name).onsuccess=ai=>{
            m.get(settingsKey).onsuccess=setting=>{
              const currentStage=st.target.result?.record,currentJob=ai.target.result?.job;
              const currentSettings=setting.target.result?.setting||fresh();
              if(!eligible(currentStage,currentJob,origin).ok||
                 currentStage.accountId!==stage.accountId||
                 currentStage.sourceHead!==stage.sourceHead||
                 currentStage.sourceFolder!==stage.sourceFolder||
                 (mode==='S06'&&(currentStage.readyIdentifier!==stage.readyIdentifier||
                   currentStage.readyInputFingerprint!==stage.readyInputFingerprint||
                   currentStage.testingSha!==stage.testingSha||
                   currentJob.readyIdentifier!==currentStage.readyIdentifier||
                   currentJob.readyInputFingerprint!==currentStage.readyInputFingerprint))||
                 (mode==='AUTO'&&!currentSettings.autoEnabled)){
                done(fail('WRITEBACK_CONTEXT_CHANGED'));return;
              }
              const r={slug:name,revision:old?old.revision+1:1,
                operationId,mode,message,state:'PREPARED',folder:stage.sourceFolder,baseHead:stage.sourceHead,
                expectedHead:probe.head,sourceFingerprint:job.sourceFingerprint,
                stageRevision:stage.revision,jobRevision:job.revision,
                ...(mode==='S06'?{readyIdentifier:stage.readyIdentifier,
                  readyInputFingerprint:stage.readyInputFingerprint,
                  testingSha:stage.testingSha??null}:{}),
                settingRevision:currentSettings.revision,
                accountId:stage.accountId,personaUid:stage.personaUid,
                principalFingerprint:stage.principalFingerprint,
                remotePublicId:stage.remotePublicId,
                // Persist immutable tested F in the SAME transaction as the
                // intent. An AI job may later change or disappear while a
                // Git acknowledgement remains unknown. Recovery compares
                // this snapshot, never whatever F happens to be current.
                sealedSource:structuredClone(currentJob.finalSource),
                commitSha:null,reason:null,attribution:'UNVERIFIED',changedAt:Date.now()};
              if(old)m.put({key:historyKey(name,old.operationId),
                 record:structuredClone(old)});

              m.put({key:key(name),record:r});
              t.objectStore('events').add({stage:'GIT_WRITEBACK_PREPARED',
                slug:name,operationId,sourceFingerprint:r.sourceFingerprint});
              done(show(r));
            };
          };
        };
      };
    });
  }
  // Only a PREPARED intent is provably free of Git effects. Archive a
  // redacted cancellation receipt and permit a new manually reviewed intent.
  // A DISPATCH_POSSIBLE/HELD_UNCERTAIN/CONFIRMED operation is never reset.
  function cancelPrepared(name,expectedRevision){
    if(!slug(name)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      return Promise.resolve(fail('WRITEBACK_CANCEL_INVALID'));
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(name)).onsuccess=e=>{
        const r=e.target.result?.record;
        if(!r){done(fail('WRITEBACK_NOT_FOUND'));return;}
        if(r.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(r.state!=='PREPARED'){
          done(fail('CANNOT_CANCEL_POSSIBLE_GIT_EFFECT'));return;
        }
        const next={...r,state:'CANCELED',revision:r.revision+1,
          reason:'UNSENT_PREPARATION_CANCELED',changedAt:Date.now()};
        m.put({key:key(name),record:next});
        t.objectStore('events').add({stage:'GIT_WRITEBACK_CANCELED',
          slug:name,operationId:r.operationId,revision:next.revision,
          sourceFingerprint:r.sourceFingerprint});
        done(show(next));
      };
    });
  }
  function arm(name,expectedRevision){
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(name)).onsuccess=prior=>{
        const r=prior.target.result?.record;
        if(!r){done(fail('WRITEBACK_NOT_FOUND'));return;}
        if(r.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(r.state!=='PREPARED'){done(fail('WRITEBACK_RECONCILIATION_REQUIRED'));return;}
        m.get('stage:'+name).onsuccess=st=>{
          m.get('ai-job:'+name).onsuccess=ai=>{
            m.get(settingsKey).onsuccess=setting=>{
              const stage=st.target.result?.record,job=ai.target.result?.job;
              const mode=setting.target.result?.setting||fresh();
              if(!eligible(stage,job,{stageRevision:r.stageRevision,
                  jobRevision:r.jobRevision,sourceFingerprint:r.sourceFingerprint}).ok||
                 stage.accountId!==r.accountId||stage.personaUid!==r.personaUid||
                 stage.principalFingerprint!==r.principalFingerprint||
                 stage.remotePublicId!==r.remotePublicId||
                 stage.sourceHead!==r.baseHead||stage.sourceFolder!==r.folder||
                 (r.mode==='S06'&&(job.readyIdentifier!==stage.readyIdentifier||
                   job.readyInputFingerprint!==stage.readyInputFingerprint))||
                 (r.mode==='AUTO'&&(!mode.autoEnabled||
                   r.settingRevision!==mode.revision))){
                done(fail('WRITEBACK_ADMISSION_REVOKED'));return;
              }
              const dispatch=()=>{
                 const next={...r,revision:r.revision+1,
                   state:'DISPATCH_POSSIBLE',changedAt:Date.now()};
                 m.put({key:key(name),record:next});
                 t.objectStore('events').add({stage:'GIT_WRITEBACK_DISPATCH_POSSIBLE',
                   slug:name,operationId:r.operationId,revision:next.revision});
                 done(show(next));
               };
               if(r.mode==='S06'){
                 m.get('s05-ready:'+name).onsuccess=ready=>{
                   if(!s06ReadyMatches(stage,job,ready.target.result?.record)){
                     done(fail('S06_READY_CHANGED_OR_SUPERSEDED'));return;
                   }
                   dispatch();
                 };
               }else dispatch();
            };
          };
        };
      };
    });
  }
  function finish(name,expectedRevision,{verified=false,commitSha=null,reason='WRITEBACK_UNCERTAIN'}={}){
    return transact(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(name)).onsuccess=e=>{
        const r=e.target.result?.record;
        if(!r){done(fail('WRITEBACK_NOT_FOUND'));return;}
        if(r.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(r.state!=='DISPATCH_POSSIBLE'&&r.state!=='HELD_UNCERTAIN')
          {done(fail('WRITEBACK_RECONCILIATION_REQUIRED'));return;}
        if(verified&&!sha(commitSha)){done(fail('GIT_PROOF_UNVERIFIED'));return;}
        const next={...r,revision:r.revision+1,
          state:verified?'CONFIRMED':'HELD_UNCERTAIN',
          attribution:verified?'COMMIT_AND_BYTE_READBACK_VERIFIED':'UNVERIFIED',
          commitSha:verified?commitSha:r.commitSha,
          reason:verified?null:reason,changedAt:Date.now()};
        m.put({key:key(name),record:next});
        t.objectStore('events').add({stage:'GIT_WRITEBACK_'+next.state,
          slug:name,operationId:r.operationId,revision:next.revision});
        done(show(next));
      };
    });
  }
  return Object.freeze({settings,changeSettings,get,getFull,list,prepare,
    cancelPrepared,arm,finish});
}
