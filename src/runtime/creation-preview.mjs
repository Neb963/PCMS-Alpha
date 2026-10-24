// Read-only allocation preview. The submitted manifest keeps these inputs;
// actual assignments are revalidated against canonical facts before effects.
import {selectS04Account} from './creation-allocation.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';
export function previewCreation(db,{slugs,accountId=null}={}){
 if(!Array.isArray(slugs)||!slugs.length||slugs.some(s=>typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s))||
    accountId!==null&&typeof accountId!=='string')return Promise.resolve({ok:false,code:'INVALID_PREVIEW'});
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readonly'),accounts=[],inventory=[],pending=[],counts=new Map(),known=new Map();
  let result;
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('PREVIEW_UNAVAILABLE'));
  tx.objectStore('meta').openCursor().onsuccess=e=>{
   const c=e.target.result;
   if(c){const k=String(c.key),v=c.value;
    if(k.startsWith('account:')&&v?.account)accounts.push(v.account);
    else if(k.startsWith('inventory:')&&v?.generator)inventory.push(v.generator);
    else if(k.startsWith('inventory-batch:'))counts.set(k.slice(16),v);
    else if(k.startsWith('s00-create-intent:')&&v?.record){const r=v.record;known.set(r.slug,r);
     if(r.accountId&&!['REJECTED','ABORTED','ARCHIVED'].includes(r.state))pending.push(r);}
    c.continue();return;
   }
   const items=[],planned=new Map();
   const candidates=accounts.map(a=>({...a,inventoryComplete:counts.has(a.accountId),inventoryCount:counts.get(a.accountId)}));
   for(const slug of slugs){
    if(isI17Quarantined({slug})){items.push({slug,action:'HELD',code:I17_QUARANTINE_CODE});continue;}
    const prior=planned.get(slug)||known.get(slug),owned=inventory.find(g=>g.slug===slug);
    if(prior){items.push({slug,action:'COALESCED',accountId:prior.accountId||null,
      code:accountId&&prior.accountId&&accountId!==prior.accountId?'EXPLICIT_ACCOUNT_CONFLICT':null});continue;}
    if(owned){const held=owned.ownerState!=='OBSERVED_OWNER'||accountId&&accountId!==owned.accountId;
     const row={slug,action:held?'HELD':'ADOPT',accountId:owned.accountId,
       code:held?'TARGET_OWNERSHIP_AMBIGUOUS':null};items.push(row);planned.set(slug,row);continue;}
    const plan=selectS04Account({intent:{slug,state:'WAITING_CAPABILITY',accountId},accounts:candidates,inventory,pending});
    const row={slug,action:plan.ok?'CREATE':'HELD',accountId:plan.accountId||null,
      waiting:plan.ok&&!plan.readyForEffect,code:plan.ok?null:plan.code};
    items.push(row);planned.set(slug,row);
    if(plan.ok)pending.push({slug,accountId:plan.accountId,state:'OWNER_READBACK_PENDING'});
   }
   result={ok:true,items,observedAt:Date.now(),accounts:candidates.map(a=>({accountId:a.accountId,
     state:a.state,owned:a.inventoryCount?.lastConfirmedCount??null})),providerEffects:'OFF'};
  };
 });
}
