// C37: provisional counts never authorize a CREATE from stale inventory.
import {fail} from './journal.mjs';
import {createAccountStore} from './accounts.mjs';
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

// Pre-allocation census repair. Missing first-time counts are not zero.
// Refresh at most ONE verified account per call; the caller's existing
// bounded wake/fairness loop may resume after the durable observation.
// Never change the allocation or an uncertain remote-operation record here.
const inFlightCensuses=new WeakMap();
function oneCensusPerAccount(db,accountId,start){
 let active=inFlightCensuses.get(db);
 if(!active){active=new Map();inFlightCensuses.set(db,active)}
 if(active.has(accountId))return active.get(accountId);
 const task=Promise.resolve().then(start).finally(()=>{
  if(active.get(accountId)===task)active.delete(accountId);
 });
 active.set(accountId,task);
 return task;
}
export async function recoverMissingCreationCensus({db,accountId=null,syncInventory}={}){
 const census=await createAccountStore(db).list();
 if(!census?.ok||census.truncated===true)return fail('ACCOUNT_CENSUS_UNAVAILABLE');
 const managed=census.accounts.filter(a=>a.state!=='ARCHIVED'&&
   (!accountId||a.accountId===accountId)).sort((a,b)=>a.accountId.localeCompare(b.accountId));
 if(!managed.length)return fail(accountId?'PINNED_ACCOUNT_UNAVAILABLE':'NO_MANAGED_ACCOUNTS');
 for(const account of managed){
  const marker=await readCreationInventory(db,account.accountId);
  if(marker?.source==='GUARDED_PERCHANCE_READBACK'&&marker.complete===true&&
     Number.isSafeInteger(marker.lastConfirmedCount)&&marker.lastConfirmedCount>=0&&
     marker.observationId&&marker.countsTrusted===true)continue;
  if(!['VERIFIED','INVENTORY_PENDING'].includes(account.state)||
     account.identity?.source!=='GUARDED_SESSION_READBACK'||
     account.identity?.bindingVersion!==account.bindingVersion)
    return fail('INITIAL_INVENTORY_ACCOUNT_UNVERIFIED');
  if(typeof syncInventory!=='function')return fail('INITIAL_INVENTORY_SYNCHRONIZER_UNAVAILABLE');
  const refreshed=await oneCensusPerAccount(db,account.accountId,()=>syncInventory(account.accountId,account.revision));
  if(refreshed?.ok!==true)return fail(refreshed?.code||'INITIAL_INVENTORY_SYNC_FAILED');
  const after=await readCreationInventory(db,account.accountId);
  if(after?.source!=='GUARDED_PERCHANCE_READBACK'||after.complete!==true||
     after.countsTrusted!==true||after.observationId===marker?.observationId||
     !Number.isSafeInteger(after.lastConfirmedCount)||after.lastConfirmedCount<0||
     after.accountRevision!==account.revision||after.bindingVersion!==account.bindingVersion)
    return fail('INITIAL_INVENTORY_UNVERIFIED');
  return {ok:true,refreshed:true,accountId:account.accountId,
    observationId:after.observationId,providerEffects:'NONE'};
 }
 // Allocation failed despite every expected census being present. Do not
 // paper over a concurrent account/revision change or weaken its admission.
 return fail('INITIAL_INVENTORY_SNAPSHOT_CHANGED');
}
