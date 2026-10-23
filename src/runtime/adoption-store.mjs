import {fail} from './journal.mjs';
import {validateAdoptionIntent,continuity,publicAdoption} from './adoption.mjs';
import {planOriginalIdentityMigration} from './identity-reconciliation.mjs';
const key=slug=>'adoption:'+slug;
function tx(db,mode,cb){
  return new Promise((resolve,reject)=>{
    let result=fail('ADOPTION_TRANSACTION_INCOMPLETE'),t;
    try{t=db.transaction(mode==='readonly'?['meta','events']:['meta','events','operations'],mode);}catch{return reject(Error('IDB_UNAVAILABLE'));}
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
  function adopt({slug,expectedRevision,explicitPublicConsent,standingManagement},original){
    if(!original?.ok||original.source!=='INDEPENDENT_FULL_BYTE_READBACK')
      return Promise.resolve(fail('ORIGINAL_SOURCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('inventory:'+slug).onsuccess=ev=>{
        const row=ev.target.result?.generator;
        if(!row){done(fail('TARGET_NOT_OBSERVED'));return;}
        m.get('account:'+row.accountId).onsuccess=av=>{
          const account=av.target.result?.account;
          const eligible=validateAdoptionIntent(row,account,{slug,expectedRevision,
            explicitPublicConsent,standingManagement});
          if(!eligible.ok){done(eligible);return;}
          m.get('source-link:'+slug).onsuccess=lv=>{
            const link=lv.target.result?.link;
            const migration=planOriginalIdentityMigration(row,account,original,link);
            if(!migration.ok){done(fail(migration.code));return;}
            m.get(key(slug)).onsuccess=old=>{
              const prior=old.target.result?.adoption;
              const candidate={slug,accountId:row.accountId,personaUid:row.personaUid,
                bindingVersion:row.bindingVersion,accountRevision:account.revision,
                inventoryRevision:migration.record.revision,
                remotePublicId:original.remotePublicId,
                principalFingerprint:account.identity.principalFingerprint};
              const cont=continuity(prior,candidate);
              if(!cont.ok){done(cont);return;}
              if(prior){done({...publicAdoption(prior),duplicate:true});return;}
              const publish=()=>{
                const rec={...candidate,revision:1,archived:false,
                  visibility:row.visibility,consent:row.visibility!=='PUBLIC'?'AUTO_UNLISTED':
                    explicitPublicConsent===true?'OPERATOR_EXPLICIT_PUBLIC':'STANDING_ACCOUNT_MANAGEMENT',
                  management:row.visibility==='PUBLIC'?
                    'CONSENTED_ARCHIVE_PENDING':'DISCOVERED_ARCHIVE_PENDING',
                  original,archiveState:'ARCHIVE_PENDING',createdAt:original.observedAt};
                if(migration.changed){
                  m.put({key:'inventory:'+slug,generator:migration.record});
                  m.put({key:'identity-alias:'+slug,identity:migration.alias});
                  t.objectStore('events').add({stage:'INVENTORY_PUBLIC_ID_PROVEN',
                    slug,accountId:row.accountId,from:row.remoteId,
                    to:migration.alias.publicId,identitySchema:2,
                    fingerprint:original.fingerprint});
                }
                m.add({key:key(slug),adoption:rec});
                t.objectStore('events').add({stage:'ORIGINAL_CAPTURED',slug,
                  accountId:row.accountId,originalFingerprint:original.fingerprint,
                  files:original.files.length,visibility:row.visibility});
                done({...publicAdoption(rec),duplicate:false});
              };
              if(!migration.changed){publish();return;}
              // Local alias and remote-id collision checks are transactional.
              // Neither a second account nor a different slug may inherit
              // this provider immutable ID, even when source bytes match.
              const checkCollision=()=>{
                const cursor=m.openCursor();
                cursor.onsuccess=e=>{
                  const c=e.target.result;
                  if(!c){publish();return;}
                  const rowOther=c.value?.generator;
                  const aliasOther=c.value?.identity;
                  if((c.key.startsWith('inventory:')&&rowOther&&rowOther.slug!==slug&&
                     (rowOther.remoteId===original.remotePublicId||
                      rowOther.identityAliases?.includes(original.remotePublicId)))||
                     (c.key.startsWith('identity-alias:')&&aliasOther&&
                      aliasOther.slug!==slug&&aliasOther.publicId===original.remotePublicId)){
                    done(fail('IDENTITY_PUBLIC_ID_ALREADY_BOUND'));return;
                  }
                  c.continue();
                };
              };
              const checkOperations=()=>{
                const cursor=t.objectStore('operations').openCursor();
                cursor.onsuccess=e=>{
                  const c=e.target.result;
                  if(!c){checkCollision();return;}
                  const operation=c.value||{};
                  const scope=[operation.slug,operation.targetSlug,
                    operation.resourceSlug,operation.requestedSlug,
                    operation.metadata?.slug,operation.targetId];
                  if(scope.includes(slug)&&
                     !['CONFIRMED','ABORTED','REJECTED','COMPLETED'].includes(operation.status)){
                    done(fail('IDENTITY_UNCERTAIN_OPERATION_HELD'));return;
                  }
                  c.continue();
                };
              };
              m.get('identity-alias:'+slug).onsuccess=e=>{
                const oldAlias=e.target.result?.identity;
                if(oldAlias&&(oldAlias.publicId!==migration.alias.publicId||
                   oldAlias.previousId!==migration.alias.previousId)){
                  done(fail('IDENTITY_ALIAS_CONFLICT'));return;
                }
                checkOperations();
              };
            };
          };
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
              const folder=link?.folder||'generators/'+slug;
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
                    proof?.archiveRef!=='refs/tags/pcms-originals/'+
                      a.original.remotePublicId+'/'+a.original.fingerprint||
                    proof?.prefix!=='generators/'+slug||
                    proof?.fingerprint!==a.original.fingerprint||
                    !/^[a-f0-9]{40}$/.test(proof?.commit||''))){
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
                    archiveHead:proof.head,archiveCommit:proof.commit,
                    archiveRef:proof.archiveRef,
                    // A detached Git archive does NOT independently prove
                    // an authenticated, source-complete encrypted recovery.
                    management:'ORIGINAL_GIT_ARCHIVED_CHECKPOINT_PENDING'
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
  // S04/S02 internal handoff only: an independently recovered encrypted
  // source-bearing archive must be qualified before adopted original source
  // can become write-eligible. The Git archive alone is insufficient.
  function confirmCheckpoint({slug,expectedRevision,proof}){
    if(!proof||proof.source!=='INDEPENDENT_AUTHENTICATED_RECOVERY'||
       proof.verified!==true||typeof proof.receiptId!=='string'||
       !/^[A-Za-z0-9_-]{8,100}$/.test(proof.receiptId)||
       !/^[a-f0-9]{64}$/.test(proof.originalFingerprint||'')||
       !/^[a-f0-9]{64}$/.test(proof.archiveDigest||'')||
       !/^[a-f0-9]{40}$/.test(proof.archiveCommit||'')||
       typeof proof.archiveRef!=='string')
      return Promise.resolve(fail('INDEPENDENT_RECOVERY_PROOF_REQUIRED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slug)).onsuccess=e=>{
        const prior=e.target.result?.adoption;
        if(!prior||prior.revision!==expectedRevision){
          done(fail('STALE_REVISION'));return;
        }
        if(prior.archived||prior.archiveState!=='ARCHIVED_GIT_CONFIRMED'||
           prior.original?.fingerprint!==proof.originalFingerprint||
           prior.archiveCommit!==proof.archiveCommit||
           prior.archiveRef!==proof.archiveRef){
          done(fail('ORIGINAL_RECOVERY_NOT_ELIGIBLE'));return;
        }
        m.get('account:'+prior.accountId).onsuccess=a=>{
          const account=a.target.result?.account;
          if(account?.state!=='VERIFIED'||
             account.revision!==prior.accountRevision||
             account.bindingVersion!==prior.bindingVersion||
             account.identity?.principalFingerprint!==prior.principalFingerprint){
            done(fail('ACCOUNT_CONTEXT_CHANGED'));return;
          }
          const next={...prior,revision:prior.revision+1,
            originalCheckpoint:{receiptId:proof.receiptId,
              archiveDigest:proof.archiveDigest,
              fingerprint:proof.originalFingerprint,
              source:proof.source,qualified:true},
            management:'ORIGINAL_PROTECTED_CHECKPOINT_CONFIRMED'};
          m.put({key:key(slug),adoption:next});
          t.objectStore('events').add({stage:'S04_ORIGINAL_RECOVERY_QUALIFIED',
            slug,revision:next.revision,receiptId:proof.receiptId,
            fingerprint:proof.originalFingerprint});
          done(publicAdoption(next));
        };
      };
    });
  }
  return Object.freeze({get,list,adopt,archiveLocal,getFull,archiveStage,confirmCheckpoint});
}
