// I13 local existing-source mutation ledger. One independent step per command;
// never infer safe retry from absent ACK or restart. No remote effect in IDB.
import {updateWindowAvailable,operatorUpdateWindow} from './update-window.mjs';
import {countAiCapacity,compareUpdateReservations} from './ai-store.mjs';
import {releaseCandidateTestContext} from './release-core.mjs';
import {exactSource} from './staging-core.mjs';
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
// Admission consumes genuine AI capacity through review/publication, not
// merely while the helper runs. Count reservations atomically before UNLIST.
function withUpdateCapacity(m,accountId,target,done,commit){
 const rows=[];m.openCursor().onsuccess=e=>{const c=e.target.result;if(c){rows.push(c.value);c.continue();return;}
  const limit=rows.find(v=>v.key==='ai-concurrency')?.setting?.perAccount||1;
  const own=rows.find(v=>v.key==='existing-update:'+target)?.record;
  const inventories=rows.filter(v=>v.key?.startsWith('inventory:')).map(v=>v.generator).filter(Boolean);
  const holds=rows.filter(v=>v.key?.startsWith('existing-update:')&&v.record?.slug!==target).map(v=>v.record).filter(r=>{
   if(own?.state==='PREPARED'&&r.state==='PREPARED'&&compareUpdateReservations(r,own)>0)return false;
   const ready=rows.find(v=>v.key==='s05-ready:'+r.slug)?.record,owner=rows.find(v=>v.key==='account:'+r.accountId)?.account;
   if(r.state==='PREPARED'&&(ready?.hold==='OPERATOR_PAUSED'||owner&&owner.state!=='VERIFIED'))return false;
   const published=rows.find(v=>v.key==='release:'+r.slug)?.release;
   return !(published?.state==='CONFIRMED_PUBLIC'&&published.source==='INDEPENDENT_PUBLICATION_READBACK'&&published.accountId===r.accountId&&published.remoteId===r.remotePublicId&&published.bindingVersion===r.bindingVersion&&published.approval?.sourceFingerprint===r.stagedFingerprint);
  });
  if(countAiCapacity(rows,accountId,target)>=limit){done(fail('PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED'));return;}
  if(holds.length>=limit){done(fail('PUBLIC_UPDATE_MACHINE_VISIBILITY_RESERVED'));return;}
  if(holds.filter(r=>r.accountId===accountId).length>=limit){done(fail('PUBLIC_UPDATE_ACCOUNT_CAPACITY_RESERVED'));return;}
  // Do not reserve the last observed public generator while other public
  // updates are still held. A single-generator fleet can still update.
  const reserved=new Set(holds.map(r=>r.slug)),visible=inventories.filter(v=>v.ownerState==='OBSERVED_OWNER'&&v.visibility==='PUBLIC'&&!reserved.has(v.slug));
  if(visible.length<=1&&holds.length){done(fail('PUBLIC_UPDATE_VISIBILITY_RESERVED'));return;}
  commit();
 };
}
export const publicExisting=r=>r?{
  ok:true,slug:r.slug,revision:r.revision,state:r.state,
  accountId:r.accountId,priorFingerprint:r.previousFingerprint,
  recovery:r.recovery?.format==='PCMS_I13_P_PLAIN_V3'?'PLAIN_VERIFIED_SOURCE':'LEGACY_PASSWORD_CHECKPOINT_HELD',
  reason:r.reason||null,operationId:r.operationId,
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
        const prior=e.target.result?.record;
        if(prior&&(prior.state!=='STAGE_CONFIRMED'||
           prior.stagedFingerprint!==original.fingerprint)){
          done(fail('EXISTING_ALREADY_PREPARED'));return;
        }
        m.get('account:'+account.accountId).onsuccess=a=>{
          m.get('inventory:'+s).onsuccess=i=>{
            m.get('adoption:'+s).onsuccess=o=>{
              m.get(REFRESHER_KEY).onsuccess=sh=>{
                m.get('s05-ready:'+s).onsuccess=rr=>{
                const ready=rr.target.result?.record;
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
                     original,remote,windowOverride:operatorUpdateWindow(liveShadow,ready,{...liveAccount,principalFingerprint:liveAccount?.identity?.principalFingerprint,remotePublicId:liveInventory?.remoteId},original.fingerprint)&&updateWindowAvailable(state,liveShadow,ready,{...liveAccount,principalFingerprint:liveAccount?.identity?.principalFingerprint,remotePublicId:liveInventory?.remoteId},original.fingerprint)}).ok){
                  done(fail('EXISTING_CONTEXT_CHANGED'));return;
                }
                const commit=()=>{
                const record={slug:s,revision:prior?prior.revision+1:1,state:'PREPARED',
                  accountId:account.accountId,accountRevision:account.revision,
                  personaUid:account.personaUid,bindingVersion:account.bindingVersion,
                  principalFingerprint:account.identity.principalFingerprint,
                  remotePublicId:inventory.remoteId,inventoryRevision:inventory.revision,
                  adoptionRevision:adoption.revision,
                  previousFingerprint:original.fingerprint,priorSource:original,
                  recovery:seal,nonce:crypto.randomUUID().replaceAll('-',''),
                  operationId:'existing_'+crypto.randomUUID().replaceAll('-',''),
                  reason:null,createdAt:Date.now()};
                if(prior){
                  m.add({key:'existing-history:'+s+':'+prior.operationId,
                    record:structuredClone(prior)});
                  m.put({key:key(s),record});
                }else m.add({key:key(s),record});
                t.objectStore('events').add({stage:'EXISTING_PREPARED',slug:s,
                  operationId:record.operationId,previousFingerprint:original.fingerprint});
                done(publicExisting(record));
                };
                if(!prior){withUpdateCapacity(m,account.accountId,s,done,commit);return;}
                m.get('release:'+s).onsuccess=releaseRequest=>{
                  const released=releaseRequest.target.result?.release;
                  if(released?.state!=='CONFIRMED_PUBLIC'||
                     released.source!=='INDEPENDENT_PUBLICATION_READBACK'||
                     released.sourceFingerprint!==prior.stagedFingerprint||
                     released.approval?.sourceFingerprint!==original.fingerprint||
                     released.remoteId!==inventory.remoteId||
                     released.accountId!==account.accountId||
                     released.bindingVersion!==account.bindingVersion){
                    done(fail('PREVIOUS_RELEASE_NOT_CONFIRMED'));return;
                  }
                  withUpdateCapacity(m,account.accountId,s,done,commit);
                };
                };
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
            m.get('s05-ready:'+s).onsuccess=rr=>{
            const ready=rr.target.result?.record,state=sh.target.result?.state,row=state?.rows?.find(v=>v.slug===s);
            if(!validShadow(state)||!row||(
                 !['RESTORE_DISPATCH','RECOVERY_UNLIST_DISPATCH'].includes(event)&&
                 !updateWindowAvailable(state,row,ready,r,r.previousFingerprint,r)
               )||row.paused===true||state.globalPause===true||
               state.accounts?.[r.accountId]?.paused===true||
               row.bindingVersion!==r.bindingVersion||
               row.remoteId!==r.remotePublicId){
              done(fail('EXISTING_SLEEP_CHANGED'));return;
            }
            if(event==='UNLIST_DISPATCH'){
              const admission=operatorUpdateWindow(row,ready,r,r.previousFingerprint)?{...r,windowAdmission:{version:1,mode:'OPERATOR_EARLY_UPDATE',nonce:r.nonce,accountId:r.accountId,personaUid:r.personaUid,bindingVersion:r.bindingVersion,principalFingerprint:r.principalFingerprint,remotePublicId:r.remotePublicId,previousFingerprint:r.previousFingerprint,admittedAt:Date.now()}}:r;
              withUpdateCapacity(m,r.accountId,s,done,()=>commit(admission));
            }else commit(r);
            };
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
          if(['UNLIST_CONFIRMED','RECOVERY_UNLIST_CONFIRMED','RESTORE_CONFIRMED'].includes(event))m.get('inventory:'+s).onsuccess=iv=>{
            const i=iv.target.result?.generator;
            if(i?.accountId===current.accountId&&i.personaUid===current.personaUid&&i.remoteId===current.remotePublicId&&i.bindingVersion===current.bindingVersion&&i.ownerState==='OBSERVED_OWNER')
              m.put({key:'inventory:'+s,generator:{...i,revision:(i.revision||0)+1,visibility:'UNLISTED',lastObservedAt:Date.now()}});
          };
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
  function pinStage(s,revision,{candidate,source,previousForWrite=null}){
    if(!candidate?.ok||!source?.ok||source.ready!==true||
       source.sourceBytes?.length<2||
       (previousForWrite&&(!previousForWrite.ok||
         !Array.isArray(previousForWrite.blobs))))
      return Promise.resolve(fail('EXISTING_STAGE_SOURCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(s)).onsuccess=e=>{
        const old=e.target.result?.record;
        if(!old||old.revision!==revision||
           !['UNLIST_CONFIRMED','STAGE_CONFIRMED'].includes(old.state)){
          done(fail('EXISTING_STAGE_NOT_ADMISSIBLE'));return;
        }
        const successor=old.state==='STAGE_CONFIRMED',retained=old.state==='UNLIST_CONFIRMED'&&!!old.stagePreviousFingerprint;
        if(successor&&(!previousForWrite||
           previousForWrite.fingerprint!==old.stagedFingerprint||
           !old.stageSource||old.stageSource.fingerprint!==old.stagedFingerprint)){
          done(fail('EXISTING_SAVED_F_REQUIRED_FOR_SUCCESSOR'));return;
        }
        if(retained&&(!previousForWrite||previousForWrite.fingerprint!==old.stagePreviousFingerprint||
           old.stagePreviousSource?.fingerprint!==old.stagePreviousFingerprint)){
          done(fail('EXISTING_SAVED_F_REQUIRED_FOR_SUCCESSOR'));return;
        }
        const next={...old,revision:old.revision+1,
          state:'UNLIST_CONFIRMED',
          // Original encrypted P and previousFingerprint are deliberately
          // unchanged. A successor stages over the saved prior F, not over P.
          stagePreviousSource:successor||retained?structuredClone(previousForWrite):null,
          stagePreviousFingerprint:successor||retained?previousForWrite.fingerprint:null,
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
  async function setFinal(s,revision,source){
    if(!valid(s)||!source?.ok||!source.fingerprint||
       !Array.isArray(source.blobs))return Promise.resolve(fail('FINAL_F_INVALID'));
    const sealed=await exactSource(source.blobs);
    if(!sealed.ok||sealed.fingerprint!==source.fingerprint||JSON.stringify(sealed.files)!==JSON.stringify(source.files))return fail('FINAL_F_INVALID');
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(s)).onsuccess=e=>{
        const old=e.target.result?.record;
        if(!old||old.revision!==revision||old.state!=='STAGE_CONFIRMED'){
          done(fail('EXISTING_FINAL_CONTEXT_CHANGED'));return;
        }
        m.get('stage:'+s).onsuccess=st=>{
          m.get('ai-job:'+s).onsuccess=ai=>{
            m.get('s05-ready:'+s).onsuccess=rd=>{m.get('s06-exception:'+s).onsuccess=ex=>{
            const stage=st.target.result?.record,job=ai.target.result?.job,evidence=releaseCandidateTestContext(stage,job,{ready:rd.target.result?.record,exception:ex.target.result?.record});
            if(stage?.state!=='SOURCE_VERIFIED'||stage.nonce!==old.nonce||
               stage.accountId!==old.accountId||
               !evidence.ok||job.stageRevision!==stage.revision||
               job.sourceFingerprint!==source.fingerprint||
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
            };};
          };
        };
      };
    });
  }
  return Object.freeze({get,getFull,prepare,move,pinStage,setFinal});
}
