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
  if(!json||json.length>(message?.type==='INSPECT_GENERATORS'?16000:600)||Object.keys(message).some(k=>!['type','params'].includes(k)))
    return fail('INVALID_MESSAGE');
  if(!['LIST_INVENTORY','INSPECT_GENERATORS','OPEN_GENERATOR','RECHECK_GENERATOR','SYNC_ACCOUNT'].includes(message.type))
    return fail('CAPABILITY_OFF');
  const p=message.params||{};
  if(typeof p!=='object'||!p||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='LIST_INVENTORY'?
    ['query','ownerState','accountId','offset','limit','sort','workspace','status','source']:
    message.type==='INSPECT_GENERATORS'?['slugs']:
    ['OPEN_GENERATOR','RECHECK_GENERATOR'].includes(message.type)?['slug','expectedRevision']:['accountId','expectedRevision'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(message.type==='INSPECT_GENERATORS'){
    if(!Array.isArray(p.slugs)||p.slugs.length<1||p.slugs.length>100||
       p.slugs.some(s=>typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s)))
      return fail('INVALID_INVENTORY_SELECTION');
  }else if(['OPEN_GENERATOR','RECHECK_GENERATOR'].includes(message.type)){
    if(typeof p.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(p.slug)||
       !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1)return fail('INVALID_PARAMS');
  }else if(message.type==='SYNC_ACCOUNT'){
    if(!isSafeId(p.accountId)||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1)
      return fail('INVALID_PARAMS');
  }else if((p.query!==undefined&&(typeof p.query!=='string'||p.query.length>80))||
    (p.ownerState!==undefined&&!filterStates.has(p.ownerState))||
    (p.accountId!==undefined&&p.accountId!==''&&!isSafeId(p.accountId))||
    (p.offset!==undefined&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>100000))||
    (p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100))||
    (p.workspace!==undefined&&typeof p.workspace!=='boolean')||
    (p.status!==undefined&&!['ALL','PUBLISHED','DEVELOPING','REVIEW','HELD','IDLE'].includes(p.status))||
    (p.source!==undefined&&!['ALL','GIT','PROTECTED','ORIGINAL_SAVED','CAPTURING','PENDING'].includes(p.source))||
    (p.sort!==undefined&&!['fleet','name','account'].includes(p.sort)))
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
    return perform(message);
  }
  async function perform(message) {
    const p=message.params||{};
    try{
      const s=await store();
      const restore=await sentinel.inspect();
      if(message.type==='LIST_INVENTORY'){
        const out=await (p.workspace?s.inventory.workspace(p):s.inventory.list(p));
        return out.ok?{...out,restoreHeld:restore.held,
          holdCode:restore.code,remoteSync:'ON_DEMAND_GUARDED_READ_ONLY',
          providerWrites:'OFF'}:out;
      }
      if(message.type==='INSPECT_GENERATORS'){
        const out=await s.inventory.inspect(p.slugs);
        return {...out,restoreHeld:restore.held,holdCode:restore.code,providerWrites:'OFF'};
      }
      if(restore.held)return fail('RESTORE_HOLD');
      if(message.type==='RECHECK_GENERATOR'){
        const found=await s.inventory.getCurrent(p.slug),row=found.generator;
        if(!found.ok||!row)return fail('TARGET_NOT_OBSERVED');
        if(row.revision!==p.expectedRevision)return fail('STALE_REVISION');
        const read=await s.accounts.get(row.accountId),account=read.account;
        if(!read.ok||account.state!=='VERIFIED'||account.personaUid!==row.personaUid||
           account.bindingVersion!==row.bindingVersion)return fail('ACCOUNT_CONTEXT_CHANGED');
        const g=guard(),before=await g?.getSafeRouteReadiness(account.personaUid);
        if(!before?.ready)return fail(before?.code||'PROTECTED_ROUTE_UNVERIFIED');
        const proof=await g.runSupplyStep(account.personaUid,{kind:'READ_TARGET',slug:row.slug,
          principalFingerprint:account.identity.principalFingerprint});
        const after=await g.getSafeRouteReadiness(account.personaUid);
        if(!sameGuardContext(before,after)||(await sentinel.inspect()).held)return fail('SESSION_CONTEXT_CHANGED');
        return s.inventory.confirmIdentity(row.slug,row.revision,account,proof);
      }
      if(message.type==='OPEN_GENERATOR'){
        const found=await s.inventory.getCurrent(p.slug),row=found.generator;
        if(!found.ok||!row)return fail('TARGET_NOT_OBSERVED');
        if(row.revision!==p.expectedRevision)return fail('STALE_REVISION');
        const account=await s.accounts.get(row.accountId);
        if(!account.ok||account.account.state==='ARCHIVED'||account.account.removed)
          return fail('ACCOUNT_ARCHIVED');
        if(account.account.personaUid!==row.personaUid||
           account.account.bindingVersion!==row.bindingVersion)return fail('ACCOUNT_CONTEXT_CHANGED');
        const g=guard();
        return g?.openHumanGenerator?await g.openHumanGenerator(account.account.personaUid,row.slug):
          fail('GUARD_NOT_READY');
      }
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
      const applied=await s.inventory.applyObservation(account.account,observed);
      if(!applied.ok)return applied;
      if(account.account.state==='INVENTORY_PENDING'&&applied.countsTrusted===true){
        const completed=await s.accounts.confirmInventory(account.account.accountId,account.account.revision);
        if(!completed.ok)return completed;
      }
      void recoverIdentities();
      return applied;
    }catch{return fail('INVENTORY_AUTHORITY_UNAVAILABLE');}
  }
  let recoveryBusy=false;
  async function recoverIdentities(){
    if(recoveryBusy)return;recoveryBusy=true;
    try{
      const s=await store(),hint=(await api.storage.local.get('pcmsInventoryRecoveryCursor'))?.pcmsInventoryRecoveryCursor;
      const page=await s.inventory.list({ownerState:'IDENTITY_CONFLICT',limit:100,sort:'name'});
      if(!page.ok)return;
      // Persistent cursor scans the complete fleet, including beyond page 1.
      let offset=0,rows=[];
      do{const part=offset===0?page:await s.inventory.list({ownerState:'IDENTITY_CONFLICT',limit:100,sort:'name',offset});
        if(!part.ok)break;rows.push(...part.items);offset+=100;if(offset>=part.total)break;
      }while(offset<100000);
      rows=rows.filter(r=>r.identityHold==='PUBLIC_ID_REVALIDATION_REQUIRED');
      const start=hint?rows.findIndex(r=>r.slug>hint):0;
      const ordered=[...rows.slice(start<0?0:start),...rows.slice(0,start<0?0:start)];
      for(const row of ordered.slice(0,8)){
        await perform({type:'RECHECK_GENERATOR',params:{slug:row.slug,expectedRevision:row.revision}});
        await api.storage.local.set({pcmsInventoryRecoveryCursor:row.slug});
      }
    }catch{}finally{recoveryBusy=false;}
  }
  function register(){
    try{void Promise.resolve(api.alarms?.create('pcms-inventory-identity',{periodInMinutes:1})).catch(()=>{});}catch{}
    api.alarms?.onAlarm?.addListener(e=>{if(e?.name==='pcms-inventory-identity')void recoverIdentities();});
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
  // Same guarded path, invoked by the Add Account Confirm step after identity
  // verification (not a separate UI authority).
  const syncAccount=(accountId,expectedRevision)=>
    perform({type:'SYNC_ACCOUNT',params:{accountId,expectedRevision}});
  return Object.freeze({register,run,syncAccount,recoverIdentities,
    recheckGenerator:(slug,expectedRevision)=>perform({type:'RECHECK_GENERATOR',params:{slug,expectedRevision}})});
}
export const inventoryBoundary=typeof browser!=='undefined'?createInventoryBoundary(browser):null;
inventoryBoundary?.register();
