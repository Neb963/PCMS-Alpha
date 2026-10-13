import {fail} from './journal.mjs';
import {validateAdoptionIntent,continuity,publicAdoption} from './adoption.mjs';
const key=slug=>'adoption:'+slug;
function tx(db,mode,cb){
  return new Promise((resolve,reject)=>{
    let result=fail('ADOPTION_TRANSACTION_INCOMPLETE'),t;
    try{t=db.transaction(['meta','events'],mode);}catch{return reject(Error('IDB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(result);
    t.onabort=()=>reject(Error('IDB_ABORTED'));
    t.onerror=()=>{};
    try{cb(t,v=>{result=v;});}catch{try{t.abort();}catch{}}
  });
}
export function createAdoptionStore(db){
  function get(slug){
    return tx(db,'readonly',(t,done)=>{
      t.objectStore('meta').get(key(slug)).onsuccess=e=>{
        const rec=e.target.result?.adoption;
        done(rec?publicAdoption(rec):fail('ADOPTION_NOT_FOUND'));
      };
    });
  }
  function list(){
    return tx(db,'readonly',(t,done)=>{
      const items=[];let truncated=false;
      t.objectStore('meta').openCursor().onsuccess=e=>{
        const c=e.target.result;
        if(!c){done({ok:true,items,truncated});return;}
        if(typeof c.key==='string'&&c.key.startsWith('adoption:')&&c.value?.adoption){
          if(items.length<1000)items.push(publicAdoption(c.value.adoption));
          else truncated=true;
        }
        c.continue();
      };
    });
  }
  function adopt({slug,expectedRevision,explicitPublicConsent},original){
    if(!original?.ok||original.source!=='INDEPENDENT_FULL_BYTE_READBACK')
      return Promise.resolve(fail('ORIGINAL_SOURCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('inventory:'+slug).onsuccess=ev=>{
        const row=ev.target.result?.generator;
        if(!row){done(fail('TARGET_NOT_OBSERVED'));return;}
        m.get('account:'+row.accountId).onsuccess=av=>{
          const account=av.target.result?.account;
          const eligible=validateAdoptionIntent(row,account,{slug,expectedRevision,explicitPublicConsent});
          if(!eligible.ok){done(eligible);return;}
          m.get('source-link:'+slug).onsuccess=lv=>{
            const link=lv.target.result?.link;
            if(link&&(link.accountId!==row.accountId||link.remoteId!==row.remoteId||
               link.bindingVersion!==row.bindingVersion)){
              done(fail('SOURCE_ASSOCIATION_CONFLICT'));return;
            }
            m.get(key(slug)).onsuccess=old=>{
              const prior=old.target.result?.adoption;
              const candidate={slug,accountId:row.accountId,personaUid:row.personaUid,
                bindingVersion:row.bindingVersion,accountRevision:account.revision,
                inventoryRevision:row.revision,remotePublicId:original.remotePublicId,
                principalFingerprint:account.identity.principalFingerprint};
              const cont=continuity(prior,candidate);
              if(!cont.ok){done(cont);return;}
              if(prior){done({...publicAdoption(prior),duplicate:true});return;}
              const rec={...candidate,revision:1,archived:false,
                visibility:row.visibility,consent:row.visibility==='PUBLIC'?
                  'OPERATOR_EXPLICIT_PUBLIC':'AUTO_UNLISTED',
                management:row.visibility==='PUBLIC'?
                  'CONSENTED_ARCHIVE_PENDING':'DISCOVERED_ARCHIVE_PENDING',
                original,archiveState:'ARCHIVE_PENDING',createdAt:original.observedAt};
              m.add({key:key(slug),adoption:rec});
              t.objectStore('events').add({stage:'ORIGINAL_CAPTURED',slug,
                accountId:row.accountId,originalFingerprint:original.fingerprint,
                files:original.files.length,visibility:row.visibility});
              done({...publicAdoption(rec),duplicate:false});
            };
          };
        };
      };
    });
  }
  function archiveLocal(slug,expectedRevision){
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slug)).onsuccess=e=>{
        const a=e.target.result?.adoption;
        if(!a){done(fail('ADOPTION_NOT_FOUND'));return;}
        if(a.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(a.archived){done(publicAdoption(a));return;}
        if(!['ARCHIVE_PENDING','ARCHIVED_GIT_CONFIRMED'].includes(a.archiveState)){
          done(fail('ARCHIVE_RECONCILIATION_REQUIRED'));return;
        }
        const next={...a,revision:a.revision+1,archived:true,management:'ARCHIVED_TOMBSTONE'};
        m.put({key:key(slug),adoption:next});
        t.objectStore('events').add({stage:'ADOPTION_ARCHIVED_TOMBSTONE',slug,
          originalFingerprint:a.original.fingerprint});
        done(publicAdoption(next));
      };
    });
  }

  function getFull(slug){
    return tx(db,'readonly',(t,done)=>{
      t.objectStore('meta').get(key(slug)).onsuccess=e=>{
        const a=e.target.result?.adoption;
        done(a?{ok:true,record:a}:fail('ADOPTION_NOT_FOUND'));
      };
    });
  }
  // Independent remote effect journal. The operation record and canonical
  // archive fence commit in ONE IDB transaction before any Git ref attempt.
  function archiveStage(slug,expectedRevision,event,proof=null){
    if(!['PREPARE','MARK_DISPATCH','HELD_UNCERTAIN','CONFIRM','ABORT_PREPARED'].includes(event))
      return Promise.resolve(fail('CAPABILITY_OFF'));
    return new Promise((resolve,reject)=>{
      let result=fail('ARCHIVE_TRANSACTION_INCOMPLETE'),t;
      try{t=db.transaction(['meta','events','operations'],'readwrite');}
      catch{return reject(Error('IDB_UNAVAILABLE'));}
      t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('IDB_ABORTED'));
      t.onerror=()=>{};
      const m=t.objectStore('meta'),ops=t.objectStore('operations');
      m.get(key(slug)).onsuccess=e=>{
        const a=e.target.result?.adoption;
        if(!a){result=fail('ADOPTION_NOT_FOUND');return;}
        if(a.revision!==expectedRevision){result=fail('STALE_REVISION');return;}
        if(a.archived){result=fail('TOMBSTONE_HELD');return;}
        const allowed={
          PREPARE:['ARCHIVE_PENDING'],
          ABORT_PREPARED:['GIT_PREPARED'],
          MARK_DISPATCH:['GIT_PREPARED'],
          HELD_UNCERTAIN:['DISPATCH_POSSIBLE','HELD_UNCERTAIN'],
          CONFIRM:['DISPATCH_POSSIBLE','HELD_UNCERTAIN']
        };
        if(!allowed[event].includes(a.archiveState)){
          result=fail('ARCHIVE_RECONCILIATION_REQUIRED');return;
        }
        m.get('inventory:'+slug).onsuccess=iv=>{
          const row=iv.target.result?.generator;
          if(!row||row.accountId!==a.accountId||
             row.personaUid!==a.personaUid||
             row.bindingVersion!==a.bindingVersion||
             row.ownerState!=='OBSERVED_OWNER'){
            result=fail('OWNER_CONTEXT_CHANGED');return;
          }
          m.get('account:'+a.accountId).onsuccess=av=>{
            const account=av.target.result?.account;
            if(!account||account.state!=='VERIFIED'||
               account.personaUid!==a.personaUid||
               account.bindingVersion!==a.bindingVersion||
               account.identity?.source!=='GUARDED_SESSION_READBACK'||
             account.identity?.principalFingerprint!==a.principalFingerprint||
             account.identity?.bindingVersion!==a.bindingVersion||
             account.revision!==a.accountRevision){
              result=fail('ACCOUNT_CONTEXT_CHANGED');return;
            }
            m.get('source-link:'+slug).onsuccess=sl=>{
              const link=sl.target.result?.link;
              if(link&&(link.accountId!==a.accountId||
                 link.remoteId!==row.remoteId||
                 link.bindingVersion!==a.bindingVersion)){
                result=fail('SOURCE_ASSOCIATION_CONFLICT');return;
              }
              const folder=link?.folder||'gens/'+slug;
              if(event==='PREPARE'){
                const opId='archive_'+crypto.randomUUID().replaceAll('-','');
                const next={...a,archiveState:'GIT_PREPARED',revision:a.revision+1,
                  archiveOperationId:opId,archiveFolder:folder};
                ops.add({operationId:opId,targetId:'adoption_'+slug,
                  fingerprint:a.original.fingerprint,effectType:'original_git_archive_v1',
                  status:'PREPARED',revision:1});
                m.put({key:key(slug),adoption:next});
                t.objectStore('events').add({stage:'ADOPTION_GIT_PREPARED',slug,
                  operationId:opId,originalFingerprint:a.original.fingerprint});
                result={ok:true,record:next};return;
              }
              ops.get(a.archiveOperationId).onsuccess=ov=>{
                const operation=ov.target.result;
                if(!operation||operation.fingerprint!==a.original.fingerprint||
                   operation.targetId!=='adoption_'+slug){
                  result=fail('ARCHIVE_OPERATION_CONFLICT');return;
                }
                const required=['MARK_DISPATCH','ABORT_PREPARED'].includes(event)?'PREPARED':
                  event==='CONFIRM'?['DISPATCH_POSSIBLE','HELD_UNCERTAIN']:
                  ['DISPATCH_POSSIBLE','HELD_UNCERTAIN'];
                if(!(Array.isArray(required)?required.includes(operation.status):
                   operation.status===required)){
                  result=fail('ARCHIVE_OPERATION_CONFLICT');return;
                }
                if(event==='CONFIRM'&&
                   (proof?.source!=='INDEPENDENT_GIT_BYTE_READBACK'||
                    proof?.ready!==false||
                    proof?.prefix!=='originals/'+slug+'/'+a.original.fingerprint||
                    proof?.folder!==a.archiveFolder)){
                  result=fail('INDEPENDENT_GIT_PROOF_REQUIRED');return;
                }
                const state=event==='ABORT_PREPARED'?'ARCHIVE_PENDING':
                  event==='MARK_DISPATCH'?'DISPATCH_POSSIBLE':
                  event==='CONFIRM'?'ARCHIVED_GIT_CONFIRMED':'HELD_UNCERTAIN';
                const opStatus=event==='ABORT_PREPARED'?'ABORTED':
                  event==='CONFIRM'?'CONFIRMED':
                  event==='MARK_DISPATCH'?'DISPATCH_POSSIBLE':'HELD_UNCERTAIN';
                const next={...a,archiveState:state,revision:a.revision+1,
                  ...(event==='ABORT_PREPARED'?{archiveOperationId:null,archiveFolder:null}:{}),
                  ...(event==='CONFIRM'?{
                    archiveHead:proof.head,
                    management:a.visibility==='PUBLIC'?
                      'CONSENTED_ORIGINAL_PROTECTED':'DISCOVERED_ORIGINAL_PROTECTED'
                  }: {})};
                ops.put({...operation,status:opStatus,revision:operation.revision+1});
                m.put({key:key(slug),adoption:next});
                t.objectStore('events').add({stage:'ADOPTION_GIT_'+opStatus,slug,
                  operationId:a.archiveOperationId,originalFingerprint:a.original.fingerprint});
                result={ok:true,record:next};
              };
            };
          };
        };
      };
    });
  }
  return Object.freeze({get,list,adopt,archiveLocal,getFull,archiveStage});
}
