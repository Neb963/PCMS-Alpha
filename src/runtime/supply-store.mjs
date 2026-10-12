// I06 canonical batch ownership. A frozen request is not an effect dispatch.
// All durable acknowledgements occur only when IndexedDB transactions commit.
import {fail,isSafeId} from './journal.mjs';
import {freezeSupply,moveSupply,publicSupply,validateOwnerContext} from './supply-plan.mjs';
const batchKey=id=>'supply-batch:'+id;
const reservedKey=slug=>'supply-slug:'+slug.toLowerCase();
function transact(db,mode,schedule){
  return new Promise((resolve,reject)=>{
    let tx,out=fail('TRANSACTION_INCOMPLETE');
    try{tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
    catch{return reject(Error('SUPPLY_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(out);
    tx.onabort=()=>reject(Error('SUPPLY_DB_ABORTED'));
    tx.onerror=()=>{};
    try{schedule(tx,value=>{out=value;});}
    catch{try{tx.abort();}catch{}}
  });
}
export function createSupplyStore(db){
  function freeze(request){
    const planned=freezeSupply(request);
    if(!planned.ok)return Promise.resolve(planned);
    const batch=planned.batch;
    return transact(db,'readwrite',(tx,finish)=>{
      const m=tx.objectStore('meta');
      m.get(batchKey(batch.batchId)).onsuccess=previous=>{
        if(previous.target.result){finish(fail('BATCH_ID_USED'));return;}
        m.get('account:'+batch.accountId).onsuccess=a=>{
          const account=a.target.result?.account;
          const verified=validateOwnerContext(batch,account);
          if(!verified.ok){finish(verified);return;}
          // One transaction serializes every slug reservation, including
          // cross-account collision and historical inventory observations.
          const taken=new Set(),previousSlugs=new Set();
          m.openCursor().onsuccess=ev=>{
            const cursor=ev.target.result;
            if(cursor){
              if(typeof cursor.key==='string'){
                if(cursor.key.startsWith('supply-slug:'))taken.add(cursor.key.slice(12));
                if(cursor.key.startsWith('inventory:'))previousSlugs.add(cursor.key.slice(10));
              }
              cursor.continue();return;
            }
            const items=batch.items.map(item=>{
              if(item.state!=='FROZEN')return item;
              const slug=item.requestedSlug.toLowerCase();
              if(taken.has(slug)||previousSlugs.has(slug)){
                return {...item,state:'REJECTED',reason:'ALREADY_OWNED'};
              }
              taken.add(slug);
              return item;
            });
            const frozen={...batch,items};
            m.add({key:batchKey(batch.batchId),batch:frozen});
            for(const item of items.filter(x=>x.state==='FROZEN'))
              m.add({key:reservedKey(item.requestedSlug),batchId:batch.batchId,itemId:item.itemId});
            tx.objectStore('events').add({stage:'SUPPLY_FROZEN',
              batchId:batch.batchId,accountId:batch.accountId,
              total:items.length,admissible:items.filter(x=>x.state==='FROZEN').length});
            finish({ok:true,batch:publicSupply(frozen)});
          };
        };
      };
    });
  }
  function get(batchId){
    if(!isSafeId(batchId))return Promise.resolve(fail('INVALID_BATCH'));
    return transact(db,'readonly',(tx,finish)=>{
      tx.objectStore('meta').get(batchKey(batchId)).onsuccess=e=>{
        const b=e.target.result?.batch;
        finish(b?{ok:true,batch:b}:fail('BATCH_NOT_FOUND'));
      };
    });
  }
  function advance({batchId,itemId,expectedRevision,event,proof}){
    if(!isSafeId(batchId)||!isSafeId(itemId)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      return Promise.resolve(fail('INVALID_ITEM'));
    return transact(db,'readwrite',(tx,finish)=>{
      const m=tx.objectStore('meta');
      m.get(batchKey(batchId)).onsuccess=e=>{
        const batch=e.target.result?.batch;
        if(!batch){finish(fail('BATCH_NOT_FOUND'));return;}
        const index=batch.items.findIndex(x=>x.itemId===itemId);
        if(index<0){finish(fail('ITEM_NOT_FOUND'));return;}
        const previous=batch.items[index];
        if(previous.revision!==expectedRevision){
          finish(fail('STALE_REVISION'));return;
        }
        // Fail closed on rebind/archive/identity revision changes, even when
        // the UI still displays a prior plan. Reconciliation is read-only.
        m.get('account:'+batch.accountId).onsuccess=a=>{
          const account=a.target.result?.account;
          if(!validateOwnerContext(batch,account).ok &&
             !['CREATE_UNCERTAIN','RENAME_UNCERTAIN','SOURCE_PENDING'].includes(event)){
            finish(fail('ACCOUNT_STALE'));return;
          }
          const moved=moveSupply(previous,event,proof);
          if(!moved.ok){finish(moved);return;}
          const items=batch.items.slice();items[index]=moved.item;
          const next={...batch,items,revision:batch.revision+1};
          m.put({key:batchKey(batchId),batch:next});
          tx.objectStore('events').add({stage:'SUPPLY_'+event,
            batchId,itemId,revision:moved.item.revision});
          finish({ok:true,item:moved.item,batchRevision:next.revision});
        };
      };
    });
  }
  function list(limit=50){
    if(!Number.isSafeInteger(limit)||limit<1||limit>100)return Promise.resolve(fail('INVALID_LIMIT'));
    return transact(db,'readonly',(tx,finish)=>{
      const rows=[];let truncated=false;
      tx.objectStore('meta').openCursor().onsuccess=e=>{
        const cur=e.target.result;
        if(!cur){finish({ok:true,batches:rows,truncated});return;}
        if(typeof cur.key==='string'&&cur.key.startsWith('supply-batch:')&&cur.value?.batch){
          if(rows.length<limit)rows.push(publicSupply(cur.value.batch));
          else truncated=true;
        }
        cur.continue();
      };
    });
  }
  return Object.freeze({freeze,get,advance,list});
}
