import test from 'node:test';
import assert from 'node:assert/strict';
import {createStagingStore} from '../src/runtime/staging-store.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
const enc=s=>Buffer.from(s).toString('base64');
function db(){
  const objects=new Map();let pending=[];
  // Minimal transaction oracle: commits only after requested callbacks.
  // (Full IndexedDB crash/effect fixture belongs to packaged B integration.)
  return {objectStoreNames:{contains:()=>true},transaction(names,mode){
    let finish=false;
    const tx={oncomplete:null,onabort:null,onerror:null,objectStore(name){
      return {get(key){const req={onsuccess:null};queueMicrotask(()=>req.onsuccess?.({target:{result:objects.get(name+':'+key)}}));return req;},
        add(value){objects.set(name+':'+value.key,value);},
        put(value){objects.set(name+':'+value.key,value);},
        openCursor(){const req={onsuccess:null};const vals=[...objects].filter(([k])=>k.startsWith(name+':'));let i=0;
          const next=()=>queueMicrotask(()=>req.onsuccess?.({target:{result:i<vals.length?
            {key:vals[i][0].slice(name.length+1),value:vals[i++][1],
              update(v){objects.set(name+':'+v.key,v)},continue:next}:null}}));
          next();return req;}
      };
    },abort(){tx.onabort?.();}};
    queueMicrotask(()=>queueMicrotask(()=>tx.oncomplete?.()));return tx;},_data:objects};
}
test('I09 stage transitions reject premature evidence and handoff never resumes',async()=>{
  const store=createStagingStore(db());
  assert.equal((await store.move('stage-one',1,'DISPATCH_POSSIBLE')).code,'STAGING_NOT_FOUND');
  assert.equal((await store.pin({slug:'stage-one'})).code,'PIN_EVIDENCE_UNVERIFIED');
});
