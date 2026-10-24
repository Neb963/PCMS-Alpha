// C37: provisional counts never authorize a CREATE from stale inventory.
import {fail} from './journal.mjs';
export const CREATION_INVENTORY_MAX_AGE_MS=5*60*1000;
export function qualifiedCreationInventory(marker,account,at=Date.now()){
 return !!marker&&marker.source==='GUARDED_PERCHANCE_READBACK'&&marker.complete===true&&
  typeof marker.observationId==='string'&&marker.observationId.length>0&&
  marker.accountRevision===account.revision&&marker.bindingVersion===account.bindingVersion&&
  marker.countsTrusted===true&&Number.isSafeInteger(marker.lastConfirmedCount)&&marker.lastConfirmedCount>=0&&Number.isSafeInteger(marker.observedAt)&&marker.observedAt>0&&
  marker.observedAt<=at&&at-marker.observedAt<=CREATION_INVENTORY_MAX_AGE_MS;
}
export function readCreationInventory(db,accountId){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readonly');
  const request=tx.objectStore('meta').get('inventory-batch:'+accountId);
  request.onsuccess=()=>resolve(request.result||null);
  request.onerror=()=>reject(Error('INVENTORY_CHECKPOINT_UNAVAILABLE'));
 });
}
export async function ensureCreationInventory({db,account,syncInventory,now=Date.now}){
 const before=await readCreationInventory(db,account.accountId);
 if(qualifiedCreationInventory(before,account,now()))return {ok:true,observationId:before.observationId};
 if(typeof syncInventory!=='function')return fail('CURRENT_INVENTORY_REQUIRED');
 const refreshed=await syncInventory(account.accountId,account.revision);
 if(!refreshed?.ok)return fail(refreshed?.code||'INVENTORY_REFRESH_UNAVAILABLE');
 const after=await readCreationInventory(db,account.accountId);
 if(!qualifiedCreationInventory(after,account,now())||after.observationId===before?.observationId)
  return fail('CURRENT_INVENTORY_REQUIRED');
 return {ok:true,observationId:after.observationId};
}
