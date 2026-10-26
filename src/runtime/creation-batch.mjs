// A04 durable ingress. A finalized batch is an immutable manifest of bounded
// chunks, with a monotonic processing cursor. It has no provider/Git authority.
import {fail,isSafeId} from './journal.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';

const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const BATCH=/^batch_[0-9a-f]{32}$/;
const root=id=>'s04-batch:'+id;
const chunkKey=(id,offset)=>'s04-batch-chunk:'+id+':'+String(offset).padStart(16,'0');
const holdKey=(id,index)=>'s04-batch-hold:'+id+':'+String(index).padStart(16,'0');
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
 state:row.state,revision:row.revision,held:row.held||0,
 lastHold:row.lastHold||null,createdAt:row.createdAt||null});
export function createBatchStore(db,{acceptCreate}){
 function beginBatch({batchId,total,accountId=null}={}){
  if(isI17Quarantined({batchId}))return Promise.resolve(fail(I17_QUARANTINE_CODE));
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
      chunkOffset:0,inChunk:0,held:0,lastHold:null,createdAt:Date.now(),revision:1,state:'INGESTING'};
    meta.put({key:root(batchId),batch});
    tx.objectStore('events').add({stage:'A04_BATCH_BEGUN',batchId,total});
    done({ok:true,batch:view(batch)});
   };
  });
 }
 function appendBatch({batchId,offset,slugs}={}){
  if(!BATCH.test(batchId||'')||!validOffset(offset)||
     !Array.isArray(slugs)||slugs.length<1||slugs.length>32||
     slugs.some(s=>!SLUG.test(s)))
    return Promise.resolve(fail('INVALID_BATCH_CHUNK'));
  if(isI17Quarantined({batchId}))return Promise.resolve(fail(I17_QUARANTINE_CODE));
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
  if(isI17Quarantined({batchId}))return Promise.resolve(fail(I17_QUARANTINE_CODE));
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
 function cancelBatch({batchId}={}){
  if(isI17Quarantined({batchId}))return Promise.resolve(fail(I17_QUARANTINE_CODE));
  if(!BATCH.test(batchId||''))return Promise.resolve(fail('INVALID_BATCH'));
  return transaction(db,'readwrite',(tx,done)=>{
   const meta=tx.objectStore('meta');meta.get(root(batchId)).onsuccess=e=>{
    const batch=e.target.result?.batch;
    if(!batch){done(fail('BATCH_NOT_FOUND'));return;}
    if(batch.state==='CANCELLED'){done({ok:true,batch:view(batch)});return;}
    if(batch.state!=='INGESTING'||batch.processed!==0){done(fail('BATCH_ALREADY_SUBMITTED'));return;}
    const next={...batch,state:'CANCELLED',revision:batch.revision+1};
    meta.put({key:root(batchId),batch:next});
    tx.objectStore('events').add({stage:'J02_UNSUBMITTED_INPUT_CANCELLED',batchId,providerEffects:'OFF'});
    done({ok:true,batch:view(next)});
   };
  });
 }
 function getBatch({batchId}={}){
  if(isI17Quarantined({batchId}))return Promise.resolve(fail(I17_QUARANTINE_CODE));
  if(!BATCH.test(batchId||''))return Promise.resolve(fail('INVALID_BATCH'));
  return transaction(db,'readonly',(tx,done)=>{
   tx.objectStore('meta').get(root(batchId)).onsuccess=e=>{
    const batch=e.target.result?.batch;
    done(batch?{ok:true,batch:view(batch)}:fail('BATCH_NOT_FOUND'));
   };
  });
 }
 function listBatches({after=null,limit=30}={}){
  if(after!==null&&!BATCH.test(after)||!Number.isSafeInteger(limit)||limit<1||limit>100)
    return Promise.resolve(fail('INVALID_BATCH_CURSOR'));
  return transaction(db,'readonly',(tx,done)=>{
   const all=[];
   const prefix='s04-batch:',range=typeof IDBKeyRange==='undefined'?undefined:
    IDBKeyRange.bound(prefix,prefix+'\uffff');
   tx.objectStore('meta').openCursor(range).onsuccess=e=>{
    const c=e.target.result;
    if(c){if(typeof c.key==='string'&&c.key.startsWith('s04-batch:')&&c.value?.batch)
      all.push(view(c.value.batch));c.continue();return;}
    all.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)||a.batchId.localeCompare(b.batchId));
    const start=after===null?0:all.findIndex(x=>x.batchId===after)+1;
    if(after!==null&&start===0){done(fail('INVALID_BATCH_CURSOR'));return;}
    const items=all.slice(start,start+limit),more=start+limit<all.length;
    done({ok:true,items,more,next:more?items.at(-1).batchId:null});
   };
  });
 }
 function listBatchItems({batchId,offset=0,limit=25,query='',status='ALL'}={}){
  if(!BATCH.test(batchId||'')||!validOffset(offset)||!Number.isSafeInteger(limit)||limit<1||limit>100||
     typeof query!=='string'||query.length>80||!['ALL','HELD','WORKING','CONFIRMED'].includes(status))
    return Promise.resolve(fail('INVALID_BATCH_ITEM_QUERY'));
  return transaction(db,'readonly',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=found=>{
    const batch=found.target.result?.batch;if(!batch){done(fail('BATCH_NOT_FOUND'));return;}
    const chunks=[],records=new Map(),holds=new Map(),inventory=new Map();
    meta.openCursor().onsuccess=e=>{
     const c=e.target.result;
     if(c){
      const name=String(c.key),value=c.value;
      if(name.startsWith('s04-batch-chunk:'+batchId+':')&&value?.chunk)chunks.push(value.chunk);
      else if(name.startsWith('s04-batch-hold:'+batchId+':')&&value?.hold)holds.set(value.hold.index,value.hold);
      else if(name.startsWith('s00-create-intent:'))records.set(name.slice('s00-create-intent:'.length),value);
      else if(name.startsWith('inventory:')&&value?.generator)inventory.set(value.generator.slug,value.generator);
      c.continue();return;
     }
     chunks.sort((a,b)=>a.offset-b.offset);
     const matching=[],confirmedResources=new Set(),counts={total:batch.total,persisted:batch.appended,confirmed:0,confirmedInputs:0,held:0,working:0};
     for(const chunk of chunks)for(let n=0;n<chunk.slugs.length;n++){
      const index=chunk.offset+n,slug=chunk.slugs[n],inputId=batchIntentId(batchId,index);
      let stored=records.get(inputId),hops=0;const visited=new Set([inputId]);
      while(stored?.primaryId&&!visited.has(stored.primaryId)&&hops++<8){
       visited.add(stored.primaryId);stored=records.get(stored.primaryId);
      }
      const record=stored?.record,hold=holds.get(index),observed=inventory.get(slug);
      const cancelled=batch.state==='CANCELLED';
      const currentFailure=!!record?.lastAttempt&&record.lastAttempt.revision===record.revision&&record.lastAttempt.ok===false;
      const held=!cancelled&&(hold?.status==='HELD'||currentFailure||record?.pinConflict||record?.sourceDrift||
        ['TARGET_COLLISION_HELD','REJECTED','ABORTED'].includes(record?.state));
      const confirmed=!cancelled&&!!record&&observed?.ownerState==='OBSERVED_OWNER'&&
        observed.accountId===record.accountId&&observed.remoteId===record.remoteId&&
        (record.state.startsWith('GIT_')||record.state==='ASSOCIATED_NOT_READY');
      const category=cancelled?'CANCELLED':held?'HELD':confirmed?'CONFIRMED':'WORKING';
      if(confirmed){counts.confirmedInputs++;confirmedResources.add(JSON.stringify([record.accountId,record.remoteId]));}
      if(held)counts.held++;if(!confirmed&&!held&&!cancelled)counts.working++;
      const row={index,slug,inputId,intentId:record?.intentId||null,
        coalesced:!!record&&record.intentId!==inputId,
        revision:record?.revision||null,accountId:record?.accountId||batch.accountId||null,
        state:cancelled?'CANCELLED':hold?.status==='HELD'?'INTAKE_HELD':record?.state||
          (batch.state==='INGESTING'?'STAGED':'QUEUED'),
        hold:hold?.status==='HELD'?hold.code:currentFailure?record.lastAttempt.code:
          record?.pinConflict||record?.sourceDrift?record.hold:null,
        intakeHeld:hold?.status==='HELD',category,resourceConfirmed:confirmed,
        sourcePending:confirmed&&record.state!=='ASSOCIATED_NOT_READY',
        lastAttempt:record?.lastAttempt?{at:record.lastAttempt.at,ok:record.lastAttempt.ok,code:record.lastAttempt.code}:null};
      if((status==='ALL'||status==='HELD'&&held||status==='CONFIRMED'&&confirmed||status==='WORKING'&&!held&&!confirmed&&!cancelled)&&
         (!query||slug.includes(query.toLowerCase())))matching.push(row);
     }
     counts.confirmed=confirmedResources.size;
     done({ok:true,batch:view(batch),items:matching.slice(offset,offset+limit),total:matching.length,
       counts,more:offset+limit<matching.length,providerEffects:'OFF'});
    };
   };
  });
 }
 // Exactly one slug is acknowledged only after its canonical slug reservation
 // commits; crash before progress CAS replays the SAME deterministic intent ID.
 async function processBatch({batchId}={}){
  if(isI17Quarantined({batchId}))return fail(I17_QUARANTINE_CODE);
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
  const accepted=isI17Quarantined({slug:current.slug})?fail(I17_QUARANTINE_CODE):
    await acceptCreate({intentId:batchIntentId(batchId,b.processed),
    slug:current.slug,accountId:b.accountId||undefined,origin:'OPERATOR'});
  // A scoped conflict must not starve other healthy inputs in the same
  // batch. Persist its exact slug/index and reason rather than treating the
  // item as accepted. Only this local intake may later be retried.
  const held=accepted?.ok!==true;
  const holdCode=held&&/^[A-Z0-9_]{3,100}$/.test(accepted?.code||'')?
    accepted.code:'BATCH_ITEM_UNCONFIRMED';
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
    const heldCount=(b.held||0)+(held?1:0);
    const next={...b,processed,held:heldCount,
      lastHold:held?holdCode:b.lastHold,revision:b.revision+1,
      inChunk:end?0:b.inChunk+1,
      chunkOffset:end?b.chunkOffset+current.chunkSize:b.chunkOffset,
      state:processed===b.total?(heldCount?'INTAKE_HELD':'INTAKE_COMPLETE'):'QUEUED'};
    meta.put({key:root(batchId),batch:next});
    if(held){
      meta.put({key:holdKey(batchId,b.processed),hold:{
       index:b.processed,slug:current.slug,code:holdCode,status:'HELD'}});
      tx.objectStore('events').add({stage:'A04_BATCH_ITEM_HELD',
       batchId,index:b.processed,code:holdCode,providerEffects:'OFF'});
    }
    if(processed===b.total)tx.objectStore('events').add({
     stage:'A04_BATCH_INTAKE_COMPLETE',batchId,total:b.total,
     providerEffects:'OFF'});
    done({ok:true,batch:view(next),slug:current.slug,held,
       ...(held?{code:holdCode}:{})});
   };
  });
 }
 // Reconcile a single held intake only after the operator has repaired the
 // upstream reservation/identity issue. This never invokes a provider effect.
 async function retryBatchHold({batchId,index}={}){
  if(isI17Quarantined({batchId}))return fail(I17_QUARANTINE_CODE);
  if(!BATCH.test(batchId||'')||!validOffset(index))return fail('INVALID_BATCH_HOLD');
  const snapshot=await transaction(db,'readonly',(tx,done)=>{
   tx.objectStore('meta').get(holdKey(batchId,index)).onsuccess=e=>{
    const h=e.target.result?.hold;
    done(h?.status==='HELD'?{ok:true,hold:h}:fail('BATCH_HOLD_NOT_FOUND'));
   };
  });
  if(!snapshot.ok)return snapshot;
  if(isI17Quarantined({slug:snapshot.hold.slug}))return fail(I17_QUARANTINE_CODE);
  const accepted=await acceptCreate({intentId:batchIntentId(batchId,index),
    slug:snapshot.hold.slug,origin:'OPERATOR',
    accountId:(await getBatchInternalAccount(batchId))||undefined});
  if(!accepted?.ok)return fail(accepted?.code||'BATCH_HOLD_UNRESOLVED');
  return transaction(db,'readwrite',(tx,done)=>{
   const meta=tx.objectStore('meta');
   meta.get(root(batchId)).onsuccess=e=>{
    const b=e.target.result?.batch;
    if(!b){done(fail('BATCH_NOT_FOUND'));return;}
    meta.get(holdKey(batchId,index)).onsuccess=row=>{
     const h=row.target.result?.hold;
     if(h?.status!=='HELD'){done(fail('BATCH_HOLD_CHANGED'));return;}
     const next={...b,held:Math.max(0,b.held-1),revision:b.revision+1,
       state:b.processed===b.total&&b.held===1?'INTAKE_COMPLETE':b.state};
     meta.put({key:root(batchId),batch:next});
     meta.put({key:holdKey(batchId,index),hold:{...h,status:'RESOLVED'}});
     tx.objectStore('events').add({stage:'A04_BATCH_HOLD_RECONCILED',
       batchId,index,providerEffects:'OFF'});
     done({ok:true,batch:view(next)});
    };
   };
  });
 }
 async function getBatchInternalAccount(batchId){
  const row=await transaction(db,'readonly',(tx,done)=>{
   tx.objectStore('meta').get(root(batchId)).onsuccess=e=>{
    done({ok:true,accountId:e.target.result?.batch?.accountId||null});
   };
  });
  return row.accountId;
 }
 function listBatchHolds({batchId,after=null,limit=30}={}){
  if(!BATCH.test(batchId||'')||(after!==null&&!validOffset(after))||
     !Number.isSafeInteger(limit)||limit<1||limit>100)
    return Promise.resolve(fail('INVALID_BATCH_HOLD_CURSOR'));
  return transaction(db,'readonly',(tx,done)=>{
   const items=[];let more=false,last=null;
   tx.objectStore('meta').openCursor().onsuccess=e=>{
    const c=e.target.result;
    if(!c){done({ok:true,items,more,next:more?last:null});return;}
    const h=c.value?.hold;
    if(typeof c.key==='string'&&c.key.startsWith('s04-batch-hold:'+batchId+':')&&
       h?.status==='HELD'&&(after===null||h.index>after)){
      if(items.length>=limit)more=true;
      else{items.push(h);last=h.index;}
    }
    c.continue();
   };
  });
 }
 return Object.freeze({beginBatch,appendBatch,finalizeBatch,cancelBatch,getBatch,listBatches,
  processBatch,retryBatchHold,listBatchHolds,listBatchItems});
}
