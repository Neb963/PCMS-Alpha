// S04: one canonical slug reservation for operator and verified Git-main intake.
// Side effects are NOT performed here. All origin merges and conflicts commit in
// one IndexedDB transaction; lost client ACK cannot create another slug intent.
import {fail,isSafeId} from './journal.mjs';
import {transitionCreateIntent} from './coordinator-core.mjs';
import {coalesceCreation,validateGitCreationWitness} from './creation-intake.mjs';
import {selectS04Account} from './creation-allocation.mjs';
import {advanceS04Effect} from './creation-effects.mjs';
const key=id=>'s00-create-intent:'+id;
const slugKey=slug=>'s00-create-slug:'+slug;
function transact(db,mode,schedule){
  return new Promise((resolve,reject)=>{
    let result=fail('TRANSACTION_INCOMPLETE'),tx;
    try{tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
    catch{return reject(Error('COORDINATOR_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(Error('COORDINATOR_DB_ABORTED'));
    tx.onerror=()=>{};
    try{schedule(tx,out=>{result=out;});}
    catch{try{tx.abort();}catch{}}
  });
}
export function createCoordinatorStore(db){
  function acceptSource(source){
    const checked=coalesceCreation(null,source);
    if(!checked.ok)return Promise.resolve(checked);
    const slug=checked.record.slug;
    return transact(db,'readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      const recordChange=(primary,previous)=>{
        const updated=coalesceCreation(previous,source);
        if(!updated.ok){finish(updated);return;}
        if(updated.changed){
          meta.put({key:key(primary),record:updated.record});
          if(source.type==='OPERATOR'&&primary!==source.intentId)
            meta.put({key:key(source.intentId),primaryId:primary,slug});
          tx.objectStore('events').add({
            stage:'S04_CREATION_ORIGIN_COALESCED',
            intentId:primary,slug,origin:source.type,revision:updated.record.revision,
            conflict:!!updated.conflict,providerEffects:'OFF',gitEffects:'OFF'});
        }
        finish(updated);
      };
      const resolveExisting=primary=>{
        meta.get(key(primary)).onsuccess=e=>{
          const found=e.target.result?.record;
          if(!found||found.slug!==slug){finish(fail('CREATION_RESERVATION_INCONSISTENT'));return;}
          recordChange(primary,found);
        };
      };
      meta.get(key(source.intentId)).onsuccess=e=>{
        const prior=e.target.result;
        if(prior){
          const original=prior.record;
          if(original){
            if(original.slug!==slug){finish(fail('INTENT_ID_CONFLICT'));return;}
            recordChange(original.intentId,original);
          }else if(prior.primaryId){
            if(prior.slug!==slug){finish(fail('INTENT_ID_CONFLICT'));return;}
            resolveExisting(prior.primaryId);
          }else finish(fail('CREATION_RESERVATION_INCONSISTENT'));
          return;
        }
        meta.get(slugKey(slug)).onsuccess=ev=>{
          const reserved=ev.target.result;
          if(reserved?.intentId){resolveExisting(reserved.intentId);return;}
          // Legacy I06 supply might have already attempted CREATE/RENAME.
          // Never synthesize a second new operation around its uncertain effects.
          meta.get('supply-slug:'+slug).onsuccess=old=>{
            if(old.target.result){
              finish(fail('LEGACY_SUPPLY_RESERVATION_RECONCILE_REQUIRED'));return;
            }
            const first=coalesceCreation(null,source);
            if(!first.ok){finish(first);return;}
            meta.put({key:key(first.record.intentId),record:first.record});
            meta.put({key:slugKey(slug),intentId:first.record.intentId});
            tx.objectStore('events').add({
              stage:'S04_CREATE_INTENT_ACCEPTED',intentId:first.record.intentId,
              slug,origin:source.type,revision:1,providerEffects:'OFF',gitEffects:'OFF'});
            finish(first);
          };
        };
      };
    });
  }
  function acceptCreate(intent){
    const checked=transitionCreateIntent(null,{type:'ACCEPT',intent});
    if(!checked.ok)return Promise.resolve(checked);
    return acceptSource({type:'OPERATOR',intentId:intent.intentId,
      slug:intent.slug,accountId:intent.accountId||null});
  }
  // Internal service only. No extension UI/content-script port exposes Git
  // origin injection. Caller must independently check complete pinned main,
  // repository identity and initial-import scope before invoking this method.
  function ingestVerifiedMain(witness){
    const valid=validateGitCreationWitness(witness);
    if(!valid.ok)return Promise.resolve(valid);
    return acceptSource({type:'GITHUB_MAIN',witness,
      intentId:'git_'+crypto.randomUUID().replaceAll('-','')});
  }
  function getCreate(intentId){
    if(!isSafeId(intentId))return Promise.resolve(fail('INVALID_INTENT_ID'));
    return transact(db,'readonly',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key(intentId)).onsuccess=e=>{
        const row=e.target.result;
        if(row?.record){finish({ok:true,record:row.record});return;}
        if(!row?.primaryId){finish(fail('INTENT_NOT_FOUND'));return;}
        meta.get(key(row.primaryId)).onsuccess=original=>{
          const found=original.target.result?.record;
          finish(found&&found.slug===row.slug?{ok:true,record:found}:
            fail('CREATION_RESERVATION_INCONSISTENT'));
        };
      };
    });
  }
  // Every count and chosen binding is read and committed in one canonical
  // transaction. No remote operation is implied by allocation.
  function allocateCreate(intentId,expectedRevision){
    if(!isSafeId(intentId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      return Promise.resolve(fail('INVALID_ALLOCATION'));
    return transact(db,'readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key(intentId)).onsuccess=e=>{
        const item=e.target.result?.record;
        if(!item){finish(fail('INTENT_NOT_FOUND'));return;}
        if(item.revision!==expectedRevision){finish(fail('STALE_REVISION'));return;}
        const accounts=[],inventory=[],pending=[],complete=new Set();
        meta.openCursor().onsuccess=ev=>{
          const c=ev.target.result;
          if(c){
            const k=String(c.key),v=c.value;
            if(k.startsWith('account:')&&v?.account)accounts.push(v.account);
            else if(k.startsWith('inventory:')&&v?.generator)inventory.push(v.generator);
            else if(k.startsWith('inventory-batch:')&&v?.observationId)
              complete.add(k.slice('inventory-batch:'.length));
            else if(k.startsWith('s00-create-intent:')&&v?.record&&
                v.record.intentId!==intentId&&
                v.record.accountId&&v.record.state!=='REJECTED')
              pending.push({state:v.record.state,accountId:v.record.accountId});
            else if(k.startsWith('supply-batch:')&&v?.batch)
              for(const legacy of v.batch.items||[]){
                if(legacy.state!=='REJECTED')
                  pending.push({state:legacy.state,accountId:v.batch.accountId});
              }
            c.continue();return;
          }
          // Positive existing ownership fixes the account before general
          // balancing. An explicit incompatible account pin is a scoped hold.
          const owned=inventory.find(row=>row.slug===item.slug&&
            row.ownerState==='OBSERVED_OWNER');
          const collision=inventory.find(row=>row.slug===item.slug&&
            row.ownerState!=='OBSERVED_OWNER');
          if(collision){finish(fail('TARGET_OWNERSHIP_AMBIGUOUS'));return;}
          if(owned&&item.accountId&&owned.accountId!==item.accountId){
            finish(fail('OWNED_TARGET_ACCOUNT_MISMATCH'));return;
          }
          const candidates=accounts.map(a=>({...a,inventoryComplete:complete.has(a.accountId)}));
          const plan=selectS04Account({intent:owned?{...item,accountId:owned.accountId}:item,
            accounts:candidates,inventory,pending});
          if(!plan.ok){finish(plan);return;}
          const target=owned?'ADOPTION_ORIGINAL_PENDING':'OWNER_READBACK_PENDING';
          const next={...item,state:target,
            hold:owned?'ADOPTION_REQUIRES_ORIGINAL_SOURCE_PROOF':
              'TARGET_MISSING_MUST_BE_INDEPENDENTLY_VERIFIED',
            accountId:owned?owned.accountId:plan.accountId,
            accountRevision:plan.accountRevision,
            personaUid:plan.personaUid,bindingVersion:plan.bindingVersion,
            allocation:{owned:plan.owned,pending:plan.pending,
              revision:item.revision+1},
            revision:item.revision+1};
          if(owned&&owned.accountId!==plan.accountId){
            finish(fail('OWNED_TARGET_ACCOUNT_MISMATCH'));return;
          }
          meta.put({key:key(intentId),record:next});
          tx.objectStore('events').add({stage:'S04_ALLOCATION_COMMITTED',
            intentId,slug:item.slug,state:next.state,accountId:next.accountId,
            revision:next.revision,providerEffects:'OFF'});
          finish({ok:true,record:next,providerEffects:'OFF'});
        };
      };
    });
  }
  function stageEffect({intentId,expectedRevision,event,proof={}}){
    if(!isSafeId(intentId)||!Number.isSafeInteger(expectedRevision)||
       expectedRevision<1)return Promise.resolve(fail('INVALID_STAGE_REQUEST'));
    return new Promise((resolve,reject)=>{
      let tx,result=fail('STAGE_UNCONFIRMED');
      try{tx=db.transaction(['meta','events','operations'],'readwrite');}
      catch{return reject(Error('S04_JOURNAL_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('S04_JOURNAL_ABORTED'));
      tx.onerror=()=>{};
      const m=tx.objectStore('meta'),ops=tx.objectStore('operations');
      m.get(key(intentId)).onsuccess=e=>{
        const previous=e.target.result?.record;
        if(!previous){result=fail('INTENT_NOT_FOUND');return;}
        if(previous.revision!==expectedRevision){result=fail('STALE_REVISION');return;}
        m.get('account:'+previous.accountId).onsuccess=a=>{
          const account=a.target.result?.account;
          if(!account||account.accountId!==previous.accountId||
             account.state!=='VERIFIED'||
             account.revision!==previous.accountRevision||
             account.personaUid!==previous.personaUid||
             account.bindingVersion!==previous.bindingVersion||
             account.identity?.source!=='GUARDED_SESSION_READBACK'||
             account.identity?.bindingVersion!==previous.bindingVersion){
            result=fail('ACCOUNT_CONTEXT_CHANGED');return;
          }
          const moved=advanceS04Effect(previous,event,proof);
          if(!moved.ok){result=moved;return;}
          const creating=['CREATE_PREPARE','RENAME_PREPARE'].includes(event);
          const create=event.startsWith('CREATE_')||
            (event==='PREPARED_ABORT'&&previous.state==='CREATE_PREPARED');
          const opId=creating?proof.operationId:
            create?previous.createOperationId:previous.renameOperationId;
          const needsOperation=event!=='TARGET_OBSERVED';
          if(needsOperation&&!isSafeId(opId)){
            result=fail('OPERATION_IDENTITY_MISSING');return;
          }
          const complete=(old)=>{
            if(creating&&old){result=fail('OPERATION_ID_REUSED');return;}
            if(!creating&&needsOperation&&
               (!old||old.targetId!==intentId||
                old.effectType!==(create?'s04_create':'s04_rename'))){
              result=fail('OPERATION_CONTEXT_CHANGED');return;
            }
            const required=creating?null:event==='PREPARED_ABORT'?'PREPARED':
              event.endsWith('_DISPATCH')?'PREPARED':
              event.endsWith('_CONFIRMED')?'OBSERVING':
              event.endsWith('_OBSERVING')?['DISPATCH_POSSIBLE','HELD_UNCERTAIN']:
              event.endsWith('_UNCERTAIN')?['DISPATCH_POSSIBLE','OBSERVING','HELD_UNCERTAIN']:null;
            if(needsOperation&&!creating&&required&&
              !(Array.isArray(required)?required.includes(old.status):old.status===required)){
              result=fail('OPERATION_STATUS_CHANGED');return;
            }
            const apply=()=>{
            if(needsOperation){
              const status=creating?'PREPARED':
                event==='PREPARED_ABORT'?'ABORTED':
                event.endsWith('_DISPATCH')?'DISPATCH_POSSIBLE':
                event.endsWith('_OBSERVING')?'OBSERVING':
                event.endsWith('_UNCERTAIN')?'HELD_UNCERTAIN':'CONFIRMED';
              ops.put(creating?{operationId:opId,targetId:intentId,
                effectType:create?'s04_create':'s04_rename',
                fingerprint:proof.fingerprint,status,revision:1}:
                {...old,status,revision:old.revision+1});
            }
            m.put({key:key(intentId),record:moved.record});
            tx.objectStore('events').add({stage:'S04_'+event,intentId,
              slug:previous.slug,operationId:needsOperation?opId:null,
              state:moved.record.state,revision:moved.record.revision});
            result={ok:true,record:moved.record,providerEffects:'NOT_EXECUTED_BY_STORE'};
            };
            if(event==='RENAME_CONFIRMED'){
              // A new provider identity becomes a canonical owned inventory
              // record only after independent owner/private/source readback.
              // Do not overwrite a previously observed different generator.
              m.get('inventory:'+previous.slug).onsuccess=inventory=>{
                const prior=inventory.target.result?.generator;
                if(prior&&(prior.remoteId!==moved.record.remoteId||
                  prior.accountId!==previous.accountId)){
                  result=fail('INVENTORY_IDENTITY_COLLISION');return;
                }
                const row={slug:previous.slug,remoteId:moved.record.remoteId,
                  accountId:previous.accountId,personaUid:previous.personaUid,
                  bindingVersion:previous.bindingVersion,
                  accountRevision:previous.accountRevision,
                  ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',
                  management:'MANAGED_CREATED',source:'SOURCE_PENDING',
                  lastObservationId:proof.observationId||'s04_confirmed_'+
                    previous.renameOperationId,
                  lastObservedAt:Date.now(),revision:(prior?.revision||0)+1};
                m.put({key:'inventory:'+previous.slug,generator:row});
                apply();
              };
            }else apply();
          };
          if(needsOperation)
            ops.get(opId).onsuccess=o=>complete(o.target.result);
          else complete(null);
        };
      };
    });
  }
  function confirmAdoption(intentId,expectedRevision,adoption){
    if(!isSafeId(intentId)||!Number.isSafeInteger(expectedRevision)||
       expectedRevision<1||!adoption||
       adoption.archiveState!=='ARCHIVED_GIT_CONFIRMED'||
       adoption.originalCheckpoint?.qualified!==true||
       adoption.originalCheckpoint.source!=='INDEPENDENT_AUTHENTICATED_RECOVERY'||
       adoption.originalCheckpoint.fingerprint!==adoption.original?.fingerprint||
       !/^[a-f0-9]{64}$/.test(adoption.original.fingerprint||''))
      return Promise.resolve(fail('ADOPTION_CHECKPOINT_UNVERIFIED'));
    return transact(db,'readwrite',(tx,finish)=>{
      const m=tx.objectStore('meta');
      m.get(key(intentId)).onsuccess=e=>{
        const current=e.target.result?.record;
        if(!current||current.revision!==expectedRevision){
          finish(fail('STALE_REVISION'));return;
        }
        if(current.state!=='ADOPTION_ORIGINAL_PENDING'||
           current.accountId!==adoption.accountId||
           current.personaUid!==adoption.personaUid||
           current.bindingVersion!==adoption.bindingVersion||
           current.remoteId!==adoption.remotePublicId||
           current.visibility!==adoption.visibility){
          finish(fail('ADOPTION_OWNERSHIP_CHANGED'));return;
        }
        m.get('adoption:'+current.slug).onsuccess=a=>{
          const saved=a.target.result?.adoption;
          if(!saved||saved.revision!==adoption.revision||
             saved.archiveCommit!==adoption.archiveCommit||
             saved.original?.fingerprint!==adoption.original.fingerprint||
             saved.originalCheckpoint?.receiptId!==
               adoption.originalCheckpoint.receiptId){
            finish(fail('ADOPTION_RECEIPT_STALE'));return;
          }
          m.get('account:'+current.accountId).onsuccess=accountValue=>{
            const account=accountValue.target.result?.account;
            if(account?.state!=='VERIFIED'||
               account.revision!==current.accountRevision||
               account.bindingVersion!==current.bindingVersion||
               account.identity?.principalFingerprint!==adoption.principalFingerprint){
              finish(fail('ACCOUNT_CONTEXT_CHANGED'));return;
            }
            const next={...current,revision:current.revision+1,
              state:'GIT_INIT_PENDING',hold:'GIT_ASSOCIATION_PENDING',
              originalFingerprint:adoption.original.fingerprint,
              originalArchiveRef:adoption.archiveRef,
              originalCheckpointId:adoption.originalCheckpoint.receiptId};
            m.put({key:key(intentId),record:next});
            tx.objectStore('events').add({stage:'S04_ADOPTION_ORIGINAL_PROTECTED',
              intentId,slug:current.slug,originalFingerprint:next.originalFingerprint,
              originalArchiveRef:next.originalArchiveRef});
            finish({ok:true,record:next,providerEffects:'OFF'});
          };
        };
      };
    });
  }
  function stageGit({intentId,expectedRevision,event,proof={}}){
    if(!isSafeId(intentId)||!Number.isSafeInteger(expectedRevision)||
       expectedRevision<1)return Promise.resolve(fail('INVALID_GIT_STAGE'));
    return new Promise((resolve,reject)=>{
      let tx,out=fail('GIT_STAGE_UNCONFIRMED');
      try{tx=db.transaction(['meta','events','operations'],'readwrite');}
      catch{return reject(Error('GIT_STAGE_DB_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(Error('GIT_STAGE_ABORTED'));
      tx.onerror=()=>{};
      const m=tx.objectStore('meta'),ops=tx.objectStore('operations');
      m.get(key(intentId)).onsuccess=e=>{
        const prior=e.target.result?.record;
        if(!prior){out=fail('INTENT_NOT_FOUND');return;}
        if(prior.revision!==expectedRevision){out=fail('STALE_REVISION');return;}
        m.get('account:'+prior.accountId).onsuccess=accountReply=>{
          const a=accountReply.target.result?.account;
          if(!a||a.state!=='VERIFIED'||a.revision!==prior.accountRevision||
             a.bindingVersion!==prior.bindingVersion||
             a.personaUid!==prior.personaUid||
             a.identity?.source!=='GUARDED_SESSION_READBACK'||
             a.identity?.bindingVersion!==prior.bindingVersion){
            out=fail('ACCOUNT_CONTEXT_CHANGED');return;
          }
        const validId=/^[1-9][0-9]{0,19}$/;
        const marker=/^[a-f0-9]{40}$/;
        const digest=/^[a-f0-9]{64}$/;
        const create=event==='PREPARE';
        const existing=event==='EXISTING';
        if((create||existing)&&prior.state!=='GIT_INIT_PENDING'){
          out=fail('GIT_NOT_ADMISSIBLE');return;
        }
        if(create&&(!isSafeId(proof.operationId)||
            !validId.test(proof.repositoryId||'')||
            !digest.test(proof.fingerprint||'')||
            !marker.test(proof.baseHead||'')||
            !marker.test(proof.markerOid||''))){
          out=fail('GIT_OPERATION_INVALID');return;
        }
        if(existing&&!(proof.source==='PINNED_MAIN_READ_ONLY'&&
            proof.folder==='generators/'+prior.slug&&marker.test(proof.markerOid||'')&&
            marker.test(proof.head||'')&&validId.test(proof.repositoryId||''))){
          out=fail('GIT_EXISTING_PROOF_REQUIRED');return;
        }
        if(!create&&!existing&&
           !['DISPATCH','OBSERVING','UNCERTAIN','CONFIRM','ABORT_PREPARED'].includes(event)){
          out=fail('GIT_NOT_ADMISSIBLE');return;
        }
        const before=prior.state;
        const allowed={
          DISPATCH:['GIT_PREPARED'],
          OBSERVING:['GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN'],
          UNCERTAIN:['GIT_DISPATCH_POSSIBLE','GIT_OBSERVING','GIT_UNCERTAIN'],
          CONFIRM:['GIT_OBSERVING'],
          ABORT_PREPARED:['GIT_PREPARED']
        };
        if(!create&&!existing&&!allowed[event]?.includes(before)){
          out=fail('GIT_NOT_ADMISSIBLE');return;
        }
        if(event==='CONFIRM'&&!(proof.source==='INDEPENDENT_GIT_BYTE_READBACK'&&
          proof.folder==='generators/'+prior.slug&&
          proof.repositoryId===prior.gitRepositoryId&&
          marker.test(proof.head||'')&&marker.test(proof.markerOid||'')&&
          proof.ready===false)){
          out=fail('INDEPENDENT_GIT_MARKER_REQUIRED');return;
        }
        const operationId=create?proof.operationId:prior.gitOperationId;
        const finishStage=operation=>{
          if(create&&operation){out=fail('GIT_OPERATION_ID_REUSED');return;}
          if(!create&&!existing&&(!operation||operation.targetId!==intentId||
            operation.effectType!=='s04_git_marker')){
            out=fail('GIT_OPERATION_MISSING');return;
          }
          const state=create?'GIT_PREPARED':existing||event==='CONFIRM'?
            'ASSOCIATED_NOT_READY':event==='DISPATCH'?'GIT_DISPATCH_POSSIBLE':
            event==='OBSERVING'?'GIT_OBSERVING':
            event==='UNCERTAIN'?'GIT_UNCERTAIN':'GIT_INIT_PENDING';
          const next={...prior,state,revision:prior.revision+1,
            hold:['GIT_UNCERTAIN','GIT_DISPATCH_POSSIBLE'].includes(state)?
              'GIT_EFFECT_OUTCOME_UNKNOWN':state==='ASSOCIATED_NOT_READY'?null:
              'GIT_ASSOCIATION_PENDING',
            ...(create?{gitRepositoryId:proof.repositoryId,
              gitOperationId:proof.operationId,gitBaseHead:proof.baseHead,
              gitExpectedMarkerOid:proof.markerOid}:{}),
            ...(state==='ASSOCIATED_NOT_READY'?{gitHead:proof.head,
              gitMarkerOid:proof.markerOid,sourceFolder:proof.folder}:{})};
          const finish=(link)=>{
            if(state==='ASSOCIATED_NOT_READY'){
              if(link&&(link.accountId!==prior.accountId||
                  link.remoteId!==prior.remoteId||
                  link.folder!=='generators/'+prior.slug)){
                out=fail('SOURCE_ASSOCIATION_CONFLICT');return;
              }
              if(!link){
                const sourceLink={slug:prior.slug,folder:'generators/'+prior.slug,
                  remoteId:prior.remoteId,accountId:prior.accountId,
                  personaUid:prior.personaUid,bindingVersion:prior.bindingVersion,
                  mainHead:proof.head,readyAtInspection:false,
                  fingerprint:proof.sourceFingerprint||null,testingSha:null,
                  revision:1,source:'S04_INDEPENDENT_NOT_READY_ASSOCIATION'};
                m.put({key:'source-link:'+prior.slug,link:sourceLink});
              }
            }
            if(!existing){
              const status=create?'PREPARED':event==='DISPATCH'?'DISPATCH_POSSIBLE':
                event==='OBSERVING'?'OBSERVING':event==='UNCERTAIN'?
                'HELD_UNCERTAIN':event==='CONFIRM'?'CONFIRMED':'ABORTED';
              ops.put(create?{operationId,targetId:intentId,
                effectType:'s04_git_marker',fingerprint:proof.fingerprint,
                status,revision:1}:
                {...operation,status,revision:operation.revision+1});
            }
            m.put({key:key(intentId),record:next});
            tx.objectStore('events').add({stage:'S04_GIT_'+event,
              intentId,slug:prior.slug,revision:next.revision,
              operationId:existing?null:operationId,gitEffects:'JOURNALED'});
            out={ok:true,record:next};
          };
          if(state==='ASSOCIATED_NOT_READY')
            m.get('source-link:'+prior.slug).onsuccess=e=>
              finish(e.target.result?.link);
          else finish(null);
        };
        if(create||existing)finishStage(null);
        else ops.get(operationId).onsuccess=e=>finishStage(e.target.result);
        };
      };
    });
  }
  function listCreate({after=null,limit=50}={}){
    if(after!==null&&!isSafeId(after))return Promise.resolve(fail('INVALID_CURSOR'));
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)
      return Promise.resolve(fail('INVALID_LIMIT'));
    return transact(db,'readonly',(tx,finish)=>{
      const items=[];let truncated=false,tail=null;
      tx.objectStore('meta').openCursor().onsuccess=e=>{
        const cursor=e.target.result;
        if(!cursor){
          finish({ok:true,items,truncated,next:truncated?tail:null,
            providerEffects:'OFF'});return;
        }
        const keyName=cursor.key;
        const record=cursor.value?.record;
        if(typeof keyName==='string'&&keyName.startsWith('s00-create-intent:')&&
           record&&(!after||keyName>'s00-create-intent:'+after)){
          if(items.length>=limit){
            truncated=true;cursor.continue();return;
          }
          items.push({intentId:record.intentId,slug:record.slug,
            accountId:record.accountId||null,state:record.state,
            hold:record.hold,revision:record.revision,
            conflict:record.pinConflict===true,
            origins:(record.sources||[]).map(s=>s.type)});
          tail=record.intentId;
        }
        cursor.continue();
      };
    });
  }
  async function advanceCreate(intentId,expectedRevision){
    const got=await getCreate(intentId);
    if(!got.ok)return got;
    const decision=transitionCreateIntent(got.record,{
      type:'ADVANCE',intentId:got.record.intentId,expectedRevision
    });
    // S04 cannot promote provider effects until owner/route/absence evidence
    // and separate real-effect authorization are integrated and verified.
    return decision.ok?{...decision,providerEffects:'OFF',
      code:'S04_CREATION_ACTIVATION_HELD'}:decision;
  }
  return Object.freeze({acceptCreate,ingestVerifiedMain,getCreate,listCreate,allocateCreate,stageEffect,stageGit,confirmAdoption,advanceCreate});
}
