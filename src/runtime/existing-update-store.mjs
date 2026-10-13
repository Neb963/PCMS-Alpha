// I13 local existing-source mutation ledger. One independent step per command;
// never infer safe retry from absent ACK or restart. No remote effect in IDB.
import {fail} from './journal.mjs';
import {REFRESHER_KEY,validShadow} from './refresher-core.mjs';
import {authorizeSleepingUpdate} from './existing-update-core.mjs';
const valid=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const key=s=>'existing-update:'+s;
function tx(db,mode,fn){
  return new Promise((resolve,reject)=>{
    let t,result=fail('EXISTING_TRANSACTION_INCOMPLETE');
    try{t=db.transaction(mode==='readonly'?['meta']:['meta','events','operations'],mode);}
    catch{return reject(Error('EXISTING_DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('EXISTING_DB_ABORTED'));
    t.onerror=()=>{};
    try{fn(t,x=>{result=x;});}catch{try{t.abort();}catch{}}
  });
}
export const publicExisting=r=>r?{
  ok:true,slug:r.slug,revision:r.revision,state:r.state,
  accountId:r.accountId,priorFingerprint:r.previousFingerprint,
  recovery:'ENCRYPTED_SNAPSHOT',reason:r.reason||null,operationId:r.operationId,
  providerEffect:['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN',
    'STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN',
    'RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN'].includes(r.state)?
    'POSSIBLE_NEVER_RETRY':'NO_NEW_EFFECT'
}:fail('EXISTING_NOT_FOUND');
export function createExistingStore(db){
  const getFull=s=>!valid(s)?Promise.resolve(fail('INVALID_SLUG')):tx(db,'readonly',(t,done)=>{
    t.objectStore('meta').get(key(s)).onsuccess=e=>
      done(e.target.result?.record?{ok:true,record:e.target.result.record}:
        fail('EXISTING_NOT_FOUND'));
  });
  const get=async s=>{const x=await getFull(s);return x.ok?publicExisting(x.record):x;};
  function prepare({context,original,seal,remote,shadow,account,inventory,adoption}){
    if(!context?.ok||!original?.ok||seal?.ok!==true||
       seal.fingerprint!==original.fingerprint||!valid(inventory?.slug))
      return Promise.resolve(fail('EXISTING_PREPARE_INVALID'));
    const s=inventory.slug;
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(s)).onsuccess=e=>{
        if(e.target.result){done(fail('EXISTING_ALREADY_PREPARED'));return;}
        m.get('account:'+account.accountId).onsuccess=a=>{
          m.get('inventory:'+s).onsuccess=i=>{
            m.get('adoption:'+s).onsuccess=o=>{
              m.get(REFRESHER_KEY).onsuccess=sh=>{
                const liveAccount=a.target.result?.account,
                  liveInventory=i.target.result?.generator,
                  liveAdoption=o.target.result?.adoption,
                  state=sh.target.result?.state,liveShadow=state?.rows?.find(v=>v.slug===s);
                if(!validShadow(state)||!liveAdoption||
                   liveAdoption.original?.fingerprint!==context.originalArchiveFingerprint||
                   liveAdoption.original?.source!=='INDEPENDENT_FULL_BYTE_READBACK'||
                   liveAccount?.revision!==account.revision||
                   liveInventory?.revision!==inventory.revision||
                   liveAdoption?.revision!==adoption.revision||
                   !liveShadow||liveShadow.phase!==shadow.phase||
                   liveShadow.sleepRemaining!==shadow.sleepRemaining||
                   state.globalPause===true||state.accounts?.[account.accountId]?.paused===true||
                   !authorizeSleepingUpdate({account:liveAccount,
                     inventory:liveInventory,adoption:liveAdoption,shadow:liveShadow,
                     original,remote}).ok){
                  done(fail('EXISTING_CONTEXT_CHANGED'));return;
                }
                const record={slug:s,revision:1,state:'PREPARED',
                  accountId:account.accountId,accountRevision:account.revision,
                  personaUid:account.personaUid,bindingVersion:account.bindingVersion,
                  principalFingerprint:account.identity.principalFingerprint,
                  remotePublicId:inventory.remoteId,inventoryRevision:inventory.revision,
                  adoptionRevision:adoption.revision,
                  previousFingerprint:original.fingerprint,priorSource:original,
                  recovery:seal,nonce:crypto.randomUUID().replaceAll('-',''),
                  operationId:'existing_'+crypto.randomUUID().replaceAll('-',''),
                  reason:null,createdAt:Date.now()};
                m.add({key:key(s),record});
                t.objectStore('events').add({stage:'EXISTING_PREPARED',slug:s,
                  operationId:record.operationId,previousFingerprint:original.fingerprint});
                done(publicExisting(record));
              };
            };
          };
        };
      };
    });
  }
  function move(s,revision,event,{proof=null,reason=null}={}){
    const allow={
      UNLIST_DISPATCH:['PREPARED'],
      UNLIST_UNCERTAIN:['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN'],
      UNLIST_CONFIRMED:['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN'],
      STAGE_DISPATCH:['UNLIST_CONFIRMED'],
      STAGE_UNCERTAIN:['STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN'],
      STAGE_CONFIRMED:['STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN'],
      RECOVERY_UNLIST_DISPATCH:['STAGE_CONFIRMED'],
      RECOVERY_UNLIST_UNCERTAIN:['RECOVERY_UNLIST_DISPATCH_POSSIBLE','RECOVERY_UNLIST_UNCERTAIN'],
      RECOVERY_UNLIST_CONFIRMED:['RECOVERY_UNLIST_DISPATCH_POSSIBLE','RECOVERY_UNLIST_UNCERTAIN'],
      RESTORE_DISPATCH:['STAGE_CONFIRMED','RECOVERY_UNLIST_CONFIRMED'],
      RESTORE_UNCERTAIN:['RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN'],
      RESTORE_CONFIRMED:['RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN']
    };
    if(!valid(s)||!Number.isSafeInteger(revision)||revision<1||!allow[event])
      return Promise.resolve(fail('INVALID_EXISTING_EVENT'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(s)).onsuccess=e=>{
        const r=e.target.result?.record;
        if(!r){done(fail('EXISTING_NOT_FOUND'));return;}
        if(r.revision!==revision){done(fail('STALE_REVISION'));return;}
        if(!allow[event].includes(r.state)){done(fail('EXISTING_RECONCILIATION_REQUIRED'));return;}
        const verified=['UNLIST_CONFIRMED','STAGE_CONFIRMED','RESTORE_CONFIRMED','RECOVERY_UNLIST_CONFIRMED'].includes(event);
        if(verified&&(proof?.source!=='INDEPENDENT_FULL_BYTE_READBACK'||
           proof.fingerprint!==(event==='STAGE_CONFIRMED'||event==='RECOVERY_UNLIST_CONFIRMED'?r.stagedFingerprint:r.previousFingerprint)||
           proof.visibility!=='UNLISTED'||proof.ownerResult!=='IS_OWNER'||
           proof.remotePublicId!==r.remotePublicId))
          {done(fail('EXISTING_INDEPENDENT_BYTES_REQUIRED'));return;}
        const dispatch=['UNLIST_DISPATCH','STAGE_DISPATCH','RESTORE_DISPATCH','RECOVERY_UNLIST_DISPATCH'].includes(event);
        if(dispatch) {
          m.get('account:'+r.accountId).onsuccess=av=>{
            const a=av.target.result?.account;
            if(a?.revision!==r.accountRevision||a.bindingVersion!==r.bindingVersion||
               a.personaUid!==r.personaUid||a.state!=='VERIFIED'||
               a.identity?.principalFingerprint!==r.principalFingerprint){
              done(fail('EXISTING_OWNER_CONTEXT_CHANGED'));return;
            }
            m.get('inventory:'+s).onsuccess=iv=>{
              const item=iv.target.result?.generator;
              if(item?.remoteId!==r.remotePublicId||
                 item.bindingVersion!==r.bindingVersion||
                 item.ownerState!=='OBSERVED_OWNER'){
                done(fail('EXISTING_REMOTE_IDENTITY_CHANGED'));return;
              }
              checkShadow(item);
            };
          };
          function checkShadow(item){
          m.get(REFRESHER_KEY).onsuccess=sh=>{
            const state=sh.target.result?.state,row=state?.rows?.find(v=>v.slug===s);
            if(!validShadow(state)||!row||(
                 !['RESTORE_DISPATCH','RECOVERY_UNLIST_DISPATCH'].includes(event)&&
                 (row.phase!=='SLEEPING'||row.slot===true)
               )||row.paused===true||state.globalPause===true||
               state.accounts?.[r.accountId]?.paused===true||
               row.bindingVersion!==r.bindingVersion||
               row.remoteId!==r.remotePublicId){
              done(fail('EXISTING_SLEEP_CHANGED'));return;
            }
            commit(r);
          };
          }
        }else commit(r);
        function commit(current){
          const nextState=dispatch?event.replace('_DISPATCH','_DISPATCH_POSSIBLE'):event;
          const effectId=dispatch?'existing_'+crypto.randomUUID().replaceAll('-',''):
            current.operationId;
          const next={...current,revision:current.revision+1,state:nextState,
            operationId:effectId,
            reason:verified?null:reason||current.reason,
            changedAt:Date.now()};
          m.put({key:key(s),record:next});
          if(event==='RESTORE_CONFIRMED'){
            m.get('release:'+s).onsuccess=lv=>{
              const release=lv.target.result?.release;
              if(release&&['CONFIRMED_PUBLIC','PUBLICATION_UNCERTAIN',
                  'RECOVERY_HOLD','DISPATCH_POSSIBLE'].includes(release.state)){
                m.put({key:'release:'+s,release:{...release,
                  revision:release.revision+1,state:'RESTORED_UNLISTED',
                  reason:'PREVIOUS_P_UNLISTED_FOR_HUMAN_REVIEW',
                  source:null,observationId:null,
                  changedAt:Date.now()}});
              }
            };
          }
          if(dispatch){
            t.objectStore('operations').add({operationId:effectId,
              targetId:'existing_'+s,fingerprint:current.previousFingerprint,
              effectType:'existing_'+event.toLowerCase(),status:'DISPATCH_POSSIBLE',
              revision:next.revision});
          }
          t.objectStore('events').add({stage:'EXISTING_'+nextState,slug:s,
            revision:next.revision,operationId:effectId});
          done(publicExisting(next));
        }
      };
    });
  }
  function pinStage(s,revision,{candidate,source}){
    if(!candidate?.ok||!source?.ok||source.ready!==true||
       source.sourceBytes?.length<2)
      return Promise.resolve(fail('EXISTING_STAGE_SOURCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(s)).onsuccess=e=>{
        const old=e.target.result?.record;
        if(!old||old.revision!==revision||old.state!=='UNLIST_CONFIRMED'){
          done(fail('EXISTING_STAGE_NOT_ADMISSIBLE'));return;
        }
        const next={...old,revision:old.revision+1,
          stagedFingerprint:candidate.fingerprint,stageSource:structuredClone(candidate),
          gitHead:source.head,gitTestingSha:source.testingSha,
          sourceFolder:source.folder};
        m.put({key:key(s),record:next});
        t.objectStore('events').add({stage:'EXISTING_STAGE_PINNED',
          slug:s,revision:next.revision,sourceFingerprint:candidate.fingerprint});
        done(publicExisting(next));
      };
    });
  }
  // Once AI has independently produced exact tested F, replace only the
  // recovery comparison candidate, never the original encrypted P.
  function setFinal(s,revision,source){
    if(!valid(s)||!source?.ok||!source.fingerprint||
       !Array.isArray(source.blobs))return Promise.resolve(fail('FINAL_F_INVALID'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(s)).onsuccess=e=>{
        const old=e.target.result?.record;
        if(!old||old.revision!==revision||old.state!=='STAGE_CONFIRMED'){
          done(fail('EXISTING_FINAL_CONTEXT_CHANGED'));return;
        }
        m.get('stage:'+s).onsuccess=st=>{
          m.get('ai-job:'+s).onsuccess=ai=>{
            const stage=st.target.result?.record,job=ai.target.result?.job;
            if(stage?.state!=='SOURCE_VERIFIED'||stage.nonce!==old.nonce||
               stage.accountId!==old.accountId||
               job?.state!=='TESTS_VERIFIED'||job.stageRevision!==stage.revision||
               job.verifiedFinal!==source.fingerprint||
               job.finalSource?.fingerprint!==source.fingerprint||
               job.executionSlotReleased!==true){
              done(fail('EXISTING_FINAL_TESTS_OR_STAGE_CHANGED'));return;
            }
            const next={...old,revision:old.revision+1,
              stagedFingerprint:source.fingerprint,stageSource:structuredClone(source)};
            m.put({key:key(s),record:next});
            t.objectStore('events').add({stage:'EXISTING_FINAL_F_PINNED',
              slug:s,revision:next.revision,sourceFingerprint:source.fingerprint});
            done(publicExisting(next));
          };
        };
      };
    });
  }
  return Object.freeze({get,getFull,prepare,move,pinStage,setFinal});
}
