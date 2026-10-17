// S00: IndexedDB intent ownership. All writes are short atomic transactions
// on the existing canonical meta/event stores; no schema or donor state edit.
import {fail,isSafeId} from './journal.mjs';
import {transitionCreateIntent} from './coordinator-core.mjs';
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
  function acceptCreate(intent){
    const incoming=transitionCreateIntent(null,{type:'ACCEPT',intent});
    if(!incoming.ok)return Promise.resolve(incoming);
    return transact(db,'readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key(intent.intentId)).onsuccess=e=>{
        const current=e.target.result?.record;
        if(current){finish(transitionCreateIntent(current,{type:'ACCEPT',intent}));return;}
        meta.get(slugKey(intent.slug)).onsuccess=target=>{
          if(target.target.result){
            finish(fail('CREATE_INTENT_ALREADY_RESERVED'));return;
          }
          meta.add({key:key(intent.intentId),record:incoming.record});
          meta.add({key:slugKey(intent.slug),intentId:intent.intentId});
          tx.objectStore('events').add({
            stage:'S00_CREATE_INTENT_ACCEPTED',intentId:intent.intentId,
            revision:1,providerEffects:'OFF'});
          finish(incoming);
        };
      };
    });
  }
  function getCreate(intentId){
    if(!isSafeId(intentId))return Promise.resolve(fail('INVALID_INTENT_ID'));
    return transact(db,'readonly',(tx,finish)=>{
      tx.objectStore('meta').get(key(intentId)).onsuccess=e=>{
        const record=e.target.result?.record;
        finish(record?{ok:true,record}:fail('INTENT_NOT_FOUND'));
      };
    });
  }
  async function advanceCreate(intentId,expectedRevision){
    const got=await getCreate(intentId);
    if(!got.ok)return got;
    const decision=transitionCreateIntent(got.record,{
      type:'ADVANCE',intentId,expectedRevision
    });
    // S00 does not change the canonical state on a held transition. All
    // future effect admission must atomically recheck the pinned revision.
    return decision.ok ? {...decision,providerEffects:'OFF'} : decision;
  }
  return Object.freeze({acceptCreate,getCreate,advanceCreate});
}
