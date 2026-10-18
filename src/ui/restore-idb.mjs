// I16: atomic, destination-fenced local recovery. Every initial cursor and
// replacing write executes in one IndexedDB readwrite transaction, so a
// concurrent Core writer cannot slip between revision check and deletion.
import {DB_STORES,snapshotCanonicalV2,digest,deserializeClone,
  serializeClone,validatePcmsSnapshot} from './backup-core.mjs';
const refuse=c=>{throw Error(c);};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function applyCanonicalSnapshot(db,prepared,{assertHeld,expectedBefore}={}){
  validatePcmsSnapshot(prepared);
  validatePcmsSnapshot(expectedBefore);
  if(typeof assertHeld!=='function'||await assertHeld()!==true)
    refuse('RESTORE_GUARD_REQUIRED');
  await new Promise((resolve,reject)=>{
    let tx,code='RESTORE_CANONICAL_TX_ABORTED',pending=DB_STORES.length,rows=0;
    const previous={schema:1,stores:Object.fromEntries(DB_STORES.map(n=>[n,[]]))};
    try{tx=db.transaction(DB_STORES,'readwrite');}
    catch{return reject(Error('RESTORE_CANONICAL_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(Error(code));
    const abort=reason=>{code=reason;try{tx.abort();}catch{}};
    const replace=()=>{
      try{
        validatePcmsSnapshot(previous);
        if(!equal(previous,expectedBefore))return abort('RESTORE_DESTINATION_DRIFT');
        for(const name of DB_STORES){
          const store=tx.objectStore(name);
          store.clear();
          for(const row of prepared.stores[name]){
            const value=deserializeClone(row.value);
            if(name==='events')store.put(value,row.key);
            else {
              const key={entities:'id',operations:'operationId',
                meta:'key',observations:'id'}[name];
              if(!equal(value?.[key],row.key))return abort('RESTORE_CANONICAL_KEY_MISMATCH');
              store.put(value);
            }
          }
        }
      }catch{abort('RESTORE_CANONICAL_WRITE_FAILED');}
    };
    try{
      for(const name of DB_STORES){
        tx.objectStore(name).openCursor().onsuccess=e=>{
          const cursor=e.target.result;
          if(!cursor){if(--pending===0)replace();return;}
          if(++rows>100000)return abort('RESTORE_TOO_MANY_ROWS');
          try{previous.stores[name].push({
            key:serializeClone(cursor.key),value:serializeClone(cursor.value)
          });}catch{return abort('RESTORE_UNSUPPORTED_ROW');}
          cursor.continue();
        };
      }
    }catch{abort('RESTORE_CANONICAL_READ_FAILED');}
  });
  // V2 can exceed v1's 64 MiB export cap; keep an exact serialized
  // independent postcommit readback rather than rejecting valid restored data.
  const observed=await snapshotCanonicalV2(db,{serializedValues:true});
  if(!equal(observed,prepared))refuse('RESTORE_CANONICAL_READBACK_MISMATCH');
  return {source:'INDEPENDENT_READBACK',
    digest:await digest(JSON.stringify(prepared)),
    rows:DB_STORES.reduce((n,k)=>n+prepared.stores[k].length,0)};
}
export async function observeCanonicalSnapshot(db,prepared){
  const actual=await snapshotCanonicalV2(db,{serializedValues:true});
  if(!equal(actual,prepared))return {ok:false,code:'RESTORE_CANONICAL_DIFFERENT'};
  return {ok:true,source:'INDEPENDENT_READBACK',
    digest:await digest(JSON.stringify(prepared))};
}
