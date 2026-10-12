// I04: independent, non-effecting inventory port. No HTTP, page scrape,
// native bridge, login replay or caller-provided ownership proof.
import { openCanonicalDatabase, createRestoreSentinel, fail, isSafeId } from './journal.mjs';
import { createAccountStore } from './accounts.mjs';
import { createInventoryStore, eligibleInventoryAccount } from './inventory.mjs';
import { internalPcmsGuard } from './persona-guard.mjs';
import { createReadOnlyInterpreter } from './perchance-readback.mjs';
import { trustedExtensionPage } from './command-boundary.mjs';

export const INVENTORY_PORT='pcms-i04-inventory';
const filterStates=new Set(['ALL','OBSERVED_OWNER','OWNER_UNVERIFIED','OWNER_DISPUTED',
  'UNOBSERVED','IDENTITY_CONFLICT','OWNER_CONFLICT']);

export function validateInventoryMessage(api,sender,message) {
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  if(!message||typeof message!=='object'||Array.isArray(message))return fail('INVALID_MESSAGE');
  let json;try{json=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!json||json.length>600||Object.keys(message).some(k=>!['type','params'].includes(k)))
    return fail('INVALID_MESSAGE');
  if(!['LIST_INVENTORY','SYNC_ACCOUNT'].includes(message.type))
    return fail('CAPABILITY_OFF');
  const p=message.params||{};
  if(typeof p!=='object'||!p||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='LIST_INVENTORY'?
    ['query','ownerState','accountId','offset','limit']:
    ['accountId','expectedRevision'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(message.type==='SYNC_ACCOUNT'){
    if(!isSafeId(p.accountId)||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1)
      return fail('INVALID_PARAMS');
  }else if((p.query!==undefined&&(typeof p.query!=='string'||p.query.length>80))||
    (p.ownerState!==undefined&&!filterStates.has(p.ownerState))||
    (p.accountId!==undefined&&p.accountId!==''&&!isSafeId(p.accountId))||
    (p.offset!==undefined&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>100000))||
    (p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100)))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function sameGuardContext(before,after) {
  return before?.ready===true&&after?.ready===true&&
    before.personaUid===after.personaUid&&
    before.cookieStoreId===after.cookieStoreId&&
    before.routeId===after.routeId;
}

export function createInventoryBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  // Fixed donor-owned guarded isolated-page observer; no page-supplied proof.
  inventoryReader=createReadOnlyInterpreter({
    readProtectedPage:async ctx=>internalPcmsGuard()?.observeReadOnly(ctx.personaUid,false)
  })
}={}) {
  let dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const store=()=>dbPromise ||= open().then(db=>({
    accounts:createAccountStore(db),inventory:createInventoryStore(db)
  }));
  async function run(message,sender) {
    const auth=validateInventoryMessage(api,sender,message);
    if(!auth.ok)return auth;
    const p=message.params||{};
    try{
      const s=await store();
      const restore=await sentinel.inspect();
      if(message.type==='LIST_INVENTORY'){
        const out=await s.inventory.list(p);
        return out.ok?{...out,restoreHeld:restore.held,
          holdCode:restore.code,remoteSync:'ON_DEMAND_GUARDED_READ_ONLY',
          providerWrites:'OFF'}:out;
      }
      if(restore.held)return fail('RESTORE_HOLD');
      const account=await s.accounts.get(p.accountId);
      if(!account.ok)return account;
      if(account.account.revision!==p.expectedRevision)return fail('STALE_REVISION');
      const allowed=eligibleInventoryAccount(account.account);
      if(!allowed.ok)return allowed;
      const g=guard();
      if(!g)return fail('GUARD_NOT_READY');
      const before=await g.getSafeRouteReadiness(account.account.personaUid);
      if(!before?.ready)return fail(before?.code||'PROTECTED_ROUTE_UNVERIFIED');
      // Separate identity and ownership readback occurs only on the donor-
      // guarded, account-bound adapter seam; a list/edit key is not a proof.
      const observed=await inventoryReader({
        accountId:account.account.accountId,
        accountRevision:account.account.revision,
        bindingVersion:account.account.bindingVersion,
        principalFingerprint:account.account.identity.principalFingerprint,
        personaUid:before.personaUid,cookieStoreId:before.cookieStoreId,
        routeId:before.routeId
      },account.account);
      if(!observed||observed.ok===false)return fail(observed?.code||'INVENTORY_OBSERVER_UNAVAILABLE');
      const after=await g.getSafeRouteReadiness(account.account.personaUid);
      if(!sameGuardContext(before,after))return fail('SESSION_CONTEXT_CHANGED');
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      return await s.inventory.applyObservation(account.account,observed);
    }catch{return fail('INVENTORY_AUTHORITY_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==INVENTORY_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender))
          .then(out=>{try{port.postMessage(out);}catch{}})
          .catch(()=>{try{port.postMessage(fail('INVENTORY_AUTHORITY_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createInventoryBoundary(browser).register();
