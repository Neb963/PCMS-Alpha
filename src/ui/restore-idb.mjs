// I16 atomic *local* canonical replacement under an out-of-store active
// restore sentinel. No provider or donor operations. One transaction covers all
// five stores; observed digest is verified in a fresh readonly transaction.
import {DB_STORES,snapshotCanonical,digest,deserializeClone,validatePcmsSnapshot} from './backup-core.mjs';
const refuse=c=>{throw Error(c);};
export async function applyCanonicalSnapshot(db,prepared,{assertHeld}={}){
  validatePcmsSnapshot(prepared);
  if(typeof assertHeld!=='function'||await assertHeld()!==true)
    refuse('RESTORE_GUARD_REQUIRED');
  await new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(DB_STORES,'readwrite');}
    catch{return reject(Error('RESTORE_CANONICAL_UNAVAILABLE'));}
    let failure=null;
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(Error(failure||'RESTORE_CANONICAL_TX_ABORTED'));
    try{
      for(const name of DB_STORES){
        const store=tx.objectStore(name);
        store.clear();
        for(const row of prepared.stores[name]){
          const value=deserializeClone(row.value);
          if(name==='events')store.put(value,row.key);
          else {
            const expected={
              entities:'id',operations:'operationId',meta:'key',observations:'id'
            }[name];
            if(JSON.stringify(value?.[expected])!==JSON.stringify(row.key)){
              failure='RESTORE_CANONICAL_KEY_MISMATCH';tx.abort();return;
            }
            store.put(value);
          }
        }
      }
    }catch{failure='RESTORE_CANONICAL_WRITE_FAILED';try{tx.abort();}catch{}}
  });
  // No code can claim an IndexedDB transaction was durable only by its callback.
  const observed=await snapshotCanonical(db);
  if(JSON.stringify(observed)!==JSON.stringify(prepared))
    refuse('RESTORE_CANONICAL_READBACK_MISMATCH');
  return {source:'INDEPENDENT_READBACK',
    digest:await digest(JSON.stringify(prepared)),rows:DB_STORES.reduce((n,k)=>n+prepared.stores[k].length,0)};
}
export async function observeCanonicalSnapshot(db,prepared){
  const actual=await snapshotCanonical(db);
  if(JSON.stringify(actual)!==JSON.stringify(prepared))return {ok:false,code:'RESTORE_CANONICAL_DIFFERENT'};
  return {ok:true,source:'INDEPENDENT_READBACK',
    digest:await digest(JSON.stringify(prepared))};
}
