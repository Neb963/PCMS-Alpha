// S04: one canonical slug reservation for operator and verified Git-main intake.
// Side effects are NOT performed here. All origin merges and conflicts commit in
// one IndexedDB transaction; lost client ACK cannot create another slug intent.
import {fail,isSafeId} from './journal.mjs';
import {transitionCreateIntent} from './coordinator-core.mjs';
import {coalesceCreation,validateGitCreationWitness} from './creation-intake.mjs';
import {selectS04Account} from './creation-allocation.mjs';
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
  return Object.freeze({acceptCreate,ingestVerifiedMain,getCreate,listCreate,allocateCreate,advanceCreate});
}
