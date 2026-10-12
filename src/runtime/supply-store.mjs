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
             !['CREATE_UNCERTAIN','RENAME_UNCERTAIN','SOURCE_PENDING','ABORT_PREPARED'].includes(event)){
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
  // Atomic I06 journal + item transition. This store is the sole writer of
  // provider dispatch receipts; the generic I02 operations summary sees them.
  function stage({batchId,itemId,expectedRevision,event,operationId,
    fingerprint,proof}) {
    if(!isSafeId(batchId)||!isSafeId(itemId)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      return Promise.resolve(fail('INVALID_ITEM'));
    const creating=['CREATE_PREPARED','RENAME_PREPARED','GIT_PREPARED'].includes(event);
    if(creating&&(!isSafeId(operationId)||!(/^[a-f0-9]{64}$/.test(fingerprint||''))))
      return Promise.resolve(fail('INVALID_FINGERPRINT'));
    return new Promise((resolve,reject)=>{
      let tx,out=fail('TRANSACTION_INCOMPLETE');
      try{tx=db.transaction(['meta','events','operations','entities'],'readwrite');}
      catch{return reject(Error('SUPPLY_DB_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(Error('SUPPLY_DB_ABORTED'));
      tx.onerror=()=>{};
      const m=tx.objectStore('meta'),ops=tx.objectStore('operations');
      m.get(batchKey(batchId)).onsuccess=b=>{
        const batch=b.target.result?.batch;
        const index=batch?.items.findIndex(x=>x.itemId===itemId)??-1;
        if(index<0){out=fail('ITEM_NOT_FOUND');return;}
        const prior=batch.items[index];
        if(prior.revision!==expectedRevision){out=fail('STALE_REVISION');return;}
        m.get('account:'+batch.accountId).onsuccess=a=>{
          const current=a.target.result?.account;
          if(!validateOwnerContext(batch,current).ok &&
             !['CREATE_UNCERTAIN','RENAME_UNCERTAIN','SOURCE_PENDING'].includes(event)){
            out=fail('ACCOUNT_STALE');return;
          }
          const opId=creating?operationId:
            event==='ABORT_PREPARED'?
              (prior.state==='CREATE_PREPARED'?prior.createOperationId:
               prior.state==='RENAME_PREPARED'?prior.renameOperationId:prior.gitOperationId):
            (event.startsWith('GIT_')||event==='SOURCE_CONFIRMED')?prior.gitOperationId:
            event.startsWith('CREATE_')?prior.createOperationId:prior.renameOperationId;
          if(!isSafeId(opId)&&event!=='SOURCE_PENDING'){ 
            out=fail('OPERATION_MISSING');return;
          }
          const entities=tx.objectStore('entities');
          entities.get(itemId).onsuccess=e=>{
            const entity=e.target.result;
            if(entity?.activeOperationId&&entity.activeOperationId!==opId){
              out=fail('ITEM_OPERATION_BUSY');return;
            }
            if(!creating&&event!=='SOURCE_PENDING'&&!entity){
              out=fail('OPERATION_MISSING');return;
            }
            if(event==='SOURCE_PENDING'){ 
              const moved=moveSupply(prior,event,proof);
              if(!moved.ok){out=moved;return;}
              const items=batch.items.slice();items[index]=moved.item;
              m.put({key:batchKey(batchId),batch:{...batch,items,revision:batch.revision+1}});
              tx.objectStore('events').add({stage:'SUPPLY_'+event,batchId,itemId});
              out={ok:true,item:moved.item};return;
            }
            ops.get(opId).onsuccess=o=>{
              const operation=o.target.result;
              if(creating&&operation){out=fail('OPERATION_ID_USED');return;}
              if(!creating&&(!operation||operation.targetId!==itemId)){
                out=fail('OPERATION_MISSING');return;
              }
              const expectedOpState={
                CREATE_DISPATCH_POSSIBLE:'PREPARED',RENAME_DISPATCH_POSSIBLE:'PREPARED',
                CREATE_OBSERVING:'DISPATCH_POSSIBLE',RENAME_OBSERVING:'DISPATCH_POSSIBLE',
                CREATE_CONFIRMED:'OBSERVING',PROVIDER_CONFIRMED:'OBSERVING',
                GIT_DISPATCH_POSSIBLE:'PREPARED',GIT_OBSERVING:'DISPATCH_POSSIBLE',
                SOURCE_CONFIRMED:'OBSERVING',ABORT_PREPARED:'PREPARED'
              }[event];
              if(expectedOpState&&operation.status!==expectedOpState&&
                 !(event.endsWith('_OBSERVING')&&operation.status==='HELD_UNCERTAIN')){
                out=fail('OPERATION_STATE_CHANGED');return;
              }
              const moved=moveSupply(prior,event,creating?{operationId}:proof);
              if(!moved.ok){out=moved;return;}
              let status;
              if(creating)status='PREPARED';
              else if(event.endsWith('_DISPATCH_POSSIBLE'))status='DISPATCH_POSSIBLE';
              else if(event.endsWith('_OBSERVING'))status='OBSERVING';
              else if(event.endsWith('_UNCERTAIN'))status='HELD_UNCERTAIN';
              else if(event==='ABORT_PREPARED')status='ABORTED';
              else status='CONFIRMED';
              const nextOp=creating?{operationId:opId,targetId:itemId,
                fingerprint,effectType:event==='CREATE_PREPARED'?
                  'supply_create_v1':event==='RENAME_PREPARED'?
                    'supply_rename_v1':'supply_git_marker_v1',status,revision:1}:
                {...operation,status,revision:operation.revision+1};
              const items=batch.items.slice();items[index]=moved.item;
              m.put({key:batchKey(batchId),batch:{...batch,items,revision:batch.revision+1}});
              ops.put(nextOp);
              const nextEntity=entity?{...entity,revision:entity.revision+1,
                activeOperationId:['CONFIRMED','ABORTED'].includes(status)?null:opId}:
                {id:itemId,revision:1,activeOperationId:opId};
              entities.put(nextEntity);
              tx.objectStore('events').add({stage:'SUPPLY_'+event,batchId,itemId,
                operationId:opId,operationRevision:nextOp.revision});
              out={ok:true,item:moved.item,operation:nextOp};
            };
          };
        };
      };
    });
  }
  return Object.freeze({freeze,get,advance,stage,list});
}
