// A04 durable ingress. A finalized batch is an immutable manifest of bounded
// chunks, with a monotonic processing cursor. It has no provider/Git authority.
import {fail,isSafeId} from './journal.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';

const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const BATCH=/^batch_[0-9a-f]{32}$/;
const root=id=>'s04-batch:'+id;
const chunkKey=(id,offset)=>'s04-batch-chunk:'+id+':'+String(offset).padStart(16,'0');
const validTotal=n=>Number.isSafeInteger(n)&&n>0;
const validOffset=n=>Number.isSafeInteger(n)&&n>=0;
export const batchIntentId=(batchId,index)=>'batchitem_'+batchId.slice(6)+'_'+index.toString(36);

function transaction(db,mode,schedule){
 return new Promise((resolve,reject)=>{
  let tx,result=fail('BATCH_TRANSACTION_INCOMPLETE');
  try{tx=db.transaction(['meta','events'],mode);}
  catch{reject(Error('BATCH_DB_UNAVAILABLE'));return;}
  tx.oncomplete=()=>resolve(result);
  tx.onabort=()=>reject(Error('BATCH_TRANSACTION_ABORTED'));
  try{schedule(tx,out=>{result=out;});}catch{try{tx.abort();}catch{}}
 });
}
const view=row=>({batchId:row.batchId,accountId:row.accountId,
 total:row.total,appended:row.appended,processed:row.processed,
 state:row.state,revision:row.revision});
export function createBatchStore(db,{acceptCreate}){
 function beginBatch({batchId,total,accountId=null}={}){
  if(!BATCH.test(batchId||'')||!validTotal(total)||
     (accountId!==null&&!isSafeId(accountId)))return Promise.resolve(fail('INVALID_BATCH'));
  return transaction(db,'readwrite',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=e=>{
    const existing=e.target.result?.batch;
    if(existing){
     done(existing.total===total&&existing.accountId===accountId?
      {ok:true,duplicate:true,batch:view(existing)}:fail('BATCH_ID_CONFLICT'));
     return;
    }
    const batch={batchId,total,accountId,appended:0,processed:0,
      chunkOffset:0,inChunk:0,revision:1,state:'INGESTING'};
    meta.put({key:root(batchId),batch});
    tx.objectStore('events').add({stage:'A04_BATCH_BEGUN',batchId,total});
    done({ok:true,batch:view(batch)});
   };
  });
 }
 function appendBatch({batchId,offset,slugs}={}){
  if(!BATCH.test(batchId||'')||!validOffset(offset)||
     !Array.isArray(slugs)||slugs.length<1||slugs.length>32||
     slugs.some(s=>!SLUG.test(s))||
     slugs.some(s=>isI17Quarantined({slug:s})))
    return Promise.resolve(fail(slugs?.some?.(s=>isI17Quarantined({slug:s}))?
      I17_QUARANTINE_CODE:'INVALID_BATCH_CHUNK'));
  return transaction(db,'readwrite',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=e=>{
    const batch=e.target.result?.batch;
    if(!batch){done(fail('BATCH_NOT_FOUND'));return;}
    meta.get(chunkKey(batchId,offset)).onsuccess=found=>{
     const saved=found.target.result?.chunk;
     if(saved){
      done(JSON.stringify(saved.slugs)===JSON.stringify(slugs)?
       {ok:true,duplicate:true,batch:view(batch)}:fail('BATCH_CHUNK_CONFLICT'));
      return;
     }
     if(batch.state!=='INGESTING'||offset!==batch.appended||
        offset+slugs.length>batch.total){
      done(fail('BATCH_OFFSET_CONFLICT'));return;
     }
     const next={...batch,appended:offset+slugs.length,revision:batch.revision+1};
     meta.put({key:chunkKey(batchId,offset),chunk:{offset,slugs}});
     meta.put({key:root(batchId),batch:next});
     done({ok:true,batch:view(next)});
    };
   };
  });
 }
 function finalizeBatch({batchId}={}){
  if(!BATCH.test(batchId||''))return Promise.resolve(fail('INVALID_BATCH'));
  return transaction(db,'readwrite',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=e=>{
    const batch=e.target.result?.batch;
    if(!batch){done(fail('BATCH_NOT_FOUND'));return;}
    if(batch.state!=='INGESTING'){
     done({ok:true,duplicate:true,batch:view(batch)});return;
    }
    if(batch.appended!==batch.total){done(fail('BATCH_INCOMPLETE'));return;}
    const next={...batch,state:'QUEUED',revision:batch.revision+1};
    meta.put({key:root(batchId),batch:next});
    tx.objectStore('events').add({stage:'A04_BATCH_FINALIZED',batchId,
       total:batch.total,providerEffects:'OFF'});
    done({ok:true,batch:view(next)});
   };
  });
 }
 function getBatch({batchId}={}){
  if(!BATCH.test(batchId||''))return Promise.resolve(fail('INVALID_BATCH'));
  return transaction(db,'readonly',(tx,done)=>{
   tx.objectStore('meta').get(root(batchId)).onsuccess=e=>{
    const batch=e.target.result?.batch;
    done(batch?{ok:true,batch:view(batch)}:fail('BATCH_NOT_FOUND'));
   };
  });
 }
 function listBatches({after=null,limit=30}={}){
  if(after!==null&&!BATCH.test(after)||!Number.isSafeInteger(limit)||
     limit<1||limit>100)return Promise.resolve(fail('INVALID_BATCH_CURSOR'));
  return transaction(db,'readonly',(tx,done)=>{
   const items=[];let more=false,last=null;
   tx.objectStore('meta').openCursor().onsuccess=e=>{
    const c=e.target.result;
    if(!c){done({ok:true,items,more,next:more?last:null});return;}
    const row=c.value?.batch;
    if(row&&typeof c.key==='string'&&c.key.startsWith('s04-batch:')&&
       (after===null||row.batchId>after)){
      if(items.length>=limit){more=true;}
      else{items.push(view(row));last=row.batchId;}
    }
    c.continue();
   };
  });
 }
 // Exactly one slug is acknowledged only after its canonical slug reservation
 // commits; crash before progress CAS replays the SAME deterministic intent ID.
 async function processBatch({batchId}={}){
  if(!BATCH.test(batchId||''))return fail('INVALID_BATCH');
  const current=await transaction(db,'readonly',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=e=>{
    const batch=e.target.result?.batch;
    if(!batch){done(fail('BATCH_NOT_FOUND'));return;}
    if(batch.state!=='QUEUED'){done(fail('BATCH_NOT_QUEUED'));return;}
    meta.get(chunkKey(batchId,batch.chunkOffset)).onsuccess=chunkResult=>{
     const chunk=chunkResult.target.result?.chunk;
     const slug=chunk?.slugs?.[batch.inChunk];
     done(typeof slug==='string'?{ok:true,batch,slug,chunkSize:chunk.slugs.length}:
      fail('BATCH_CHUNK_MISSING'));
    };
   };
  });
  if(!current.ok)return current;
  const b=current.batch;
  const accepted=await acceptCreate({intentId:batchIntentId(batchId,b.processed),
    slug:current.slug,accountId:b.accountId||undefined,origin:'OPERATOR'});
  if(!accepted?.ok)return accepted||fail('BATCH_ITEM_UNCONFIRMED');
  return transaction(db,'readwrite',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=e=>{
    const live=e.target.result?.batch;
    if(!live||live.revision!==b.revision||live.processed!==b.processed||
       live.state!=='QUEUED'){
      done(fail('BATCH_PROGRESS_CHANGED'));return;
    }
    const end=b.inChunk+1===current.chunkSize;
    const processed=b.processed+1;
    const next={...b,processed,revision:b.revision+1,
      inChunk:end?0:b.inChunk+1,
      chunkOffset:end?b.chunkOffset+current.chunkSize:b.chunkOffset,
      state:processed===b.total?'INTAKE_COMPLETE':'QUEUED'};
    meta.put({key:root(batchId),batch:next});
    if(processed===b.total)tx.objectStore('events').add({
     stage:'A04_BATCH_INTAKE_COMPLETE',batchId,total:b.total,
     providerEffects:'OFF'});
    done({ok:true,batch:view(next),slug:current.slug});
   };
  });
 }
 return Object.freeze({beginBatch,appendBatch,finalizeBatch,getBatch,listBatches,processBatch});
}
