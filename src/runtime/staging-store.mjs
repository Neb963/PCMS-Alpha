// I09 immutable private candidate and crash-safe editor handoff receipts.
// Never write a remote effect inside an IDB transaction.
import {fail} from './journal.mjs';
import {diffSource} from './staging-core.mjs';
import {evaluateStageSuccessor} from './ready-source-safety.mjs';
const key=s=>'stage:'+s;
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const changes={
  PINNED:['PREPARED','HANDOFF_REQUESTED'],
  PREPARED:['DISPATCH_POSSIBLE','PINNED','HANDOFF_REQUESTED'],
  DISPATCH_POSSIBLE:['HELD_UNCERTAIN','SAVED_UNVERIFIED','SOURCE_VERIFIED','HANDOFF_REQUESTED'],
  SAVED_UNVERIFIED:['HELD_UNCERTAIN','SOURCE_VERIFIED','HANDOFF_REQUESTED'],
  HELD_UNCERTAIN:['SOURCE_VERIFIED','HANDOFF_REQUESTED'],
  SOURCE_VERIFIED:['HANDOFF_REQUESTED'],
  HANDOFF_REQUESTED:['HUMAN_OWNED'],
  HUMAN_OWNED:[]
};
const publicView=r=>({
  ok:true,slug:r.slug,revision:r.revision,state:r.state,
  reason:r.reason||null,accountId:r.accountId,sourceHead:r.sourceHead,
  candidateFingerprint:r.candidate.fingerprint,
  priorFingerprint:r.previous.fingerprint,
  fileCount:r.candidate.files.length,
  diff:diffSource(r.previous,r.candidate).changes,
  tab:r.tab?{assigned:true,held:r.state==='HANDOFF_REQUESTED'||r.state==='HUMAN_OWNED'}:{assigned:false},
  publication:'OFF',providerEffects:'HELD_UNTIL_GUARDED_ACTIVATION'
});
function txn(db,mode,fn){
  return new Promise((resolve,reject)=>{
    let t,result=fail('STAGING_TRANSACTION_INCOMPLETE');
    try{t=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
    catch{return reject(Error('STAGING_DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(result);
    t.onabort=()=>reject(Error('STAGING_DB_ABORTED'));
    t.onerror=()=>{};
    try{fn(t,x=>{result=x;});}catch{try{t.abort();}catch{}}
  });
}
export function findEligibleSupply(db,slugName){
  if(!slug(slugName))return Promise.resolve(fail('INVALID_SLUG'));
  return txn(db,'readonly',(tx,done)=>{
    const m=tx.objectStore('meta'),matches=[];
    m.openCursor().onsuccess=e=>{
      const cursor=e.target.result;
      if(cursor){
        if(typeof cursor.key==='string'&&cursor.key.startsWith('supply-batch:')&&cursor.value?.batch){
          const b=cursor.value.batch;
          for(const item of b.items||[])if(item.requestedSlug===slugName &&
            ['PROVIDER_CONFIRMED','SOURCE_PENDING','CONFIRMED'].includes(item.state))
            matches.push({batch:b,item});
        }
        cursor.continue();return;
      }
      if(matches.length!==1){done(fail('PRIVATE_NEW_SUPPLY_REQUIRED'));return;}
      const {batch,item}=matches[0];
      if(!item.remoteId){done(fail('REMOTE_ID_UNVERIFIED'));return;}
      m.get('account:'+batch.accountId).onsuccess=a=>{
        const account=a.target.result?.account;
        if(!account||account.state!=='VERIFIED'||
           account.revision!==batch.accountRevision||
           account.bindingVersion!==batch.bindingVersion||
           account.personaUid!==batch.personaUid||
           account.identity?.source!=='GUARDED_SESSION_READBACK'||
           account.identity.bindingVersion!==batch.bindingVersion){
          done(fail('ACCOUNT_CONTEXT_CHANGED'));return;
        }
        m.get('source-link:'+slugName).onsuccess=l=>{
          const link=l.target.result?.link;
          if(!link||link.accountId!==account.accountId||
             link.bindingVersion!==account.bindingVersion ||
             link.remoteId!==item.remoteId ||
             link.personaUid!==account.personaUid)
            {done(fail('SOURCE_ASSOCIATION_STALE'));return;}
          done({ok:true,account,item,link});
        };
      };
    };
  });
}
// S05/S04 bridge: supply batches are not the sole source of newly created
// generators. S04 persists an independently confirmed private inventory row
// and a non-READY Git source link. This is a read-only eligibility lookup;
// the donor must still prove the current private-empty source and owner.
export async function findEligibleManagedSource(db,slugName){
  if(!slug(slugName))return fail('INVALID_SLUG');
  const legacy=await findEligibleSupply(db,slugName);
  if(legacy.ok||legacy.code!=='PRIVATE_NEW_SUPPLY_REQUIRED')return legacy;
  return txn(db,'readonly',(tx,done)=>{
    const m=tx.objectStore('meta');
    m.get('source-link:'+slugName).onsuccess=ls=>{
      const link=ls.target.result?.link;
      if(link?.source!=='S04_INDEPENDENT_NOT_READY_ASSOCIATION'||
         link.folder!=='generators/'+slugName||link.slug!==slugName){
        done(fail('S04_INDEPENDENT_ASSOCIATION_REQUIRED'));return;
      }
      m.get('inventory:'+slugName).onsuccess=iv=>{
        const item=iv.target.result?.generator;
        if(!item||item.slug!==slugName||
           item.ownerState!=='OBSERVED_OWNER'||
           item.visibility!=='UNLISTED'||
           item.management!=='MANAGED_CREATED'||
           !['SOURCE_PENDING','SOURCE_VERIFIED'].includes(item.source)||
           !item.remoteId||item.remoteId!==link.remoteId||
           item.accountId!==link.accountId||
           item.personaUid!==link.personaUid||
           item.bindingVersion!==link.bindingVersion){
          done(fail('S04_PRIVATE_CREATED_OWNER_UNVERIFIED'));return;
        }
        m.get('account:'+link.accountId).onsuccess=ar=>{
          const account=ar.target.result?.account;
          if(!account||account.state!=='VERIFIED'||
             account.accountId!==link.accountId||
             account.personaUid!==link.personaUid||
             account.bindingVersion!==link.bindingVersion||
             account.identity?.source!=='GUARDED_SESSION_READBACK'||
             account.identity?.bindingVersion!==link.bindingVersion||
             !/^[a-f0-9]{64}$/.test(account.identity?.principalFingerprint||'')){
            done(fail('S04_ACCOUNT_CONTEXT_CHANGED'));return;
          }
          done({ok:true,account,item,link,origin:'S04_CONFIRMED_CREATED'});
        };
      };
    };
  });
}
export function createStagingStore(db){
  const getFull=slugName=>!slug(slugName)?Promise.resolve(fail('INVALID_SLUG')):
    txn(db,'readonly',(tx,done)=>{
      tx.objectStore('meta').get(key(slugName)).onsuccess=e=>{
        const record=e.target.result?.record;
        done(record?{ok:true,record}:fail('STAGING_NOT_FOUND'));
      };
    });
  const get=async slugName=>{
    const x=await getFull(slugName);
    return x.ok?publicView(x.record):x;
  };
  const list=()=>txn(db,'readonly',(tx,done)=>{
    const items=[];let truncated=false;
    tx.objectStore('meta').openCursor().onsuccess=e=>{
      const c=e.target.result;
      if(!c){done({ok:true,items,truncated});return;}
      if(typeof c.key==='string'&&c.key.startsWith('stage:')&&c.value?.record){
        if(items.length<200)items.push(publicView(c.value.record));
        else truncated=true;
      }
      c.continue();
    };
  });
  function pin({slug:slugName,candidate,previous,source,eligibility,nonce}){
    if(!slug(slugName)||!candidate?.ok||!previous?.ok||
       !source?.ok||source.ready!==true||!source.sourceBytes||
       !eligibility?.ok||!/^[-_A-Za-z0-9]{16,100}$/.test(nonce||''))
      return Promise.resolve(fail('PIN_EVIDENCE_UNVERIFIED'));
    return txn(db,'readwrite',(tx,done)=>{
      const m=tx.objectStore('meta');
      m.get(key(slugName)).onsuccess=prior=>{
        const old=prior.target.result?.record;
        m.get('release:'+slugName).onsuccess=rv=>{
          const release=rv.target.result?.release;
          const legacy=(!old||(
            old.state==='SOURCE_VERIFIED'&&
            release?.state==='CONFIRMED_PUBLIC'&&
            release.source==='INDEPENDENT_PUBLICATION_READBACK'&&
            release.approval?.stageRevision===old.revision&&
            release.approval?.sourceFingerprint===previous.fingerprint&&
            release.approval?.accountId===old.accountId&&
            release.approval?.remotePublicId===old.remotePublicId&&
            release.approval?.personaUid===old.personaUid&&
            release.approval?.bindingVersion===old.bindingVersion));
          const proceed=()=>{
          m.get('source-link:'+slugName).onsuccess=l=>{
            const link=l.target.result?.link;
            m.get('account:'+eligibility.account.accountId).onsuccess=a=>{
              const account=a.target.result?.account;
              if(!link||link.folder!==source.folder||link.accountId!==account?.accountId||
                 !account||account.revision!==eligibility.account.revision||
                 account.bindingVersion!==eligibility.account.bindingVersion||
                 account.personaUid!==eligibility.account.personaUid){
                done(fail('READY_OR_ACCOUNT_CHANGED'));return;
              }
              const r={slug:slugName,revision:old?old.revision+1:1,state:'PINNED',
                accountId:account.accountId,accountRevision:account.revision,
                personaUid:account.personaUid,bindingVersion:account.bindingVersion,
                principalFingerprint:account.identity.principalFingerprint,
                remotePublicId:eligibility.item.remoteId,
                sourceFolder:source.folder,sourceHead:source.head,
                gitFingerprint:source.fingerprint,testingSha:source.testingSha,
                candidate,previous,nonce,tab:null,reason:null,sourceOrigin:eligibility.origin==='EXISTING_UPDATE'?'EXISTING_UPDATE':'PRIVATE_NEW',
                ...(source.gitReadyIdentifier?{
                  readyIdentifier:source.gitReadyIdentifier,
                  readyInputFingerprint:source.gitReadyInputFingerprint}: {})};
              if(old){
                m.put({key:'stage-history:'+slugName+':'+old.revision,
                  record:structuredClone(old)});
                m.put({key:key(slugName),record:r});
              }else m.put({key:key(slugName),record:r});
              tx.objectStore('events').add({stage:'CANDIDATE_PINNED',slug:slugName,
                candidateFingerprint:candidate.fingerprint,sourceHead:source.head,
                previousFingerprint:previous.fingerprint});
              done(publicView(r));
            };
          };
          };
          if(source.gitReadyIdentifier){
            m.get('s05-ready:'+slugName).onsuccess=rr=>{
              const ready=rr.target.result?.record;
              const src={...source,accountId:eligibility.account.accountId,
                remotePublicId:eligibility.item.remoteId,
                personaUid:eligibility.account.personaUid,
                bindingVersion:eligibility.account.bindingVersion};
              if(!ready?.active||ready.desired||['READY_REVOKED_NOT_READY','OPERATOR_PAUSED'].includes(ready.hold)||
                 ready.active.identifier!==source.gitReadyIdentifier||
                 ready.active.inputFingerprint!==source.gitReadyInputFingerprint){
                done(fail('READY_CANDIDATE_NOT_ADMITTED'));return;
              }
              m.get('ai-job:'+slugName).onsuccess=ar=>{
                m.get('existing-update:'+slugName).onsuccess=er=>{
                  const permitted=evaluateStageSuccessor({prior:old,previous,
                    job:ar.target.result?.job,existing:er.target.result?.record,
                    release,ready,source:src});
                  if(!permitted.ok){done(permitted);return;}
                  proceed();
                };
              };
            };
          }else if(legacy)proceed();
          else done(fail('EXISTING_STAGE_REQUIRES_REVIEW'));
        };
      };
    });
  }
  function move(slugName,revision,next,{reason=null,tab=null,verified=null}={}){
    if(!slug(slugName)||!Number.isSafeInteger(revision)||revision<1||
       !Object.hasOwn(changes,next))return Promise.resolve(fail('INVALID_STAGE'));
    return txn(db,'readwrite',(tx,done)=>{
      const m=tx.objectStore('meta');
      m.get(key(slugName)).onsuccess=e=>{
        const record=e.target.result?.record;
        if(!record){done(fail('STAGING_NOT_FOUND'));return;}
        if(record.revision!==revision){done(fail('STALE_REVISION'));return;}
        if(!changes[record.state]?.includes(next)) {done(fail('ILLEGAL_STAGE_TRANSITION'));return;}
        // Once a human takeover begins it cannot revert automatically.
        if(next==='SOURCE_VERIFIED'&&
           (!verified||verified.source!=='INDEPENDENT_FULL_BYTE_READBACK'||
             verified.fingerprint!==record.candidate.fingerprint))
          {done(fail('INDEPENDENT_READBACK_REQUIRED'));return;}
        if(tab!==null && (!Number.isSafeInteger(tab.tabId)||tab.tabId<1||
             tab.ownershipNonce!==record.nonce))
          {done(fail('TAB_OWNER_UNKNOWN'));return;}
        const updated={...record,revision:record.revision+1,state:next,
          reason:next==='SOURCE_VERIFIED'?null:reason||record.reason,
          tab:tab===null?record.tab:tab,
          ...(next==='SOURCE_VERIFIED'?{verifiedAt:Date.now()}: {})};
        if(next==='HANDOFF_REQUESTED'&&record.state==='SOURCE_VERIFIED'){
          updated.handoffParentRevision=record.revision;
          updated.handoffParentFingerprint=record.candidate.fingerprint;
          m.add({key:'stage-history:'+slugName+':'+record.revision,record:structuredClone(record)});
        }
        m.put({key:key(slugName),record:updated});
        tx.objectStore('events').add({stage:'CANDIDATE_'+next,
          slug:slugName,revision:updated.revision,
          ...(updated.reason?{reason:updated.reason}:{} )});
        done(publicView(updated));
      };
    });
  }
  function recover(){
    return txn(db,'readwrite',(tx,done)=>{
      const m=tx.objectStore('meta'),rows=[];
      m.openCursor().onsuccess=e=>{
        const c=e.target.result;
        if(c){
          const r=c.value?.record;
          if(typeof c.key==='string'&&c.key.startsWith('stage:')&&r &&
            ['DISPATCH_POSSIBLE','SAVED_UNVERIFIED'].includes(r.state)){
            const next={...r,revision:r.revision+1,state:'HELD_UNCERTAIN',
              reason:'RECONCILIATION_REQUIRED'};
            c.update({key:c.key,record:next});
            tx.objectStore('events').add({stage:'CANDIDATE_HELD_UNCERTAIN',slug:r.slug});
            rows.push(r.slug);
          }
          c.continue();return;
        }
        done({ok:true,held:rows.length});
      };
    });
  }
  return Object.freeze({get,getFull,list,pin,move,recover});
}
