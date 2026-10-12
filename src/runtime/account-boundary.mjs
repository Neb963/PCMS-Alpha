// I03: isolated same-XPI account port. Read-only Persona queries and strictly
// local account state; browser navigation is delegated to the donor guard.
import { openCanonicalDatabase, createRestoreSentinel, fail, isSafeId } from './journal.mjs';
import { createAccountStore, publicAccount } from './accounts.mjs';
import { internalPcmsGuard } from './persona-guard.mjs';
import { trustedExtensionPage } from './command-boundary.mjs';

export const ACCOUNT_PORT='pcms-i03-accounts';
const names=new Set(['LIST_ACCOUNTS','LIST_PERSONAS','LIST_ROUTES','ENROLL','ACK_LOGIN',
  'MANUAL_OVERRIDE','ARCHIVE','REBIND','OPEN_LOGIN','CREATE_PERSONA','CHECK_IDENTITY']);
const uid = value => typeof value==='string' && /^[a-z0-9-]{8,128}$/i.test(value);
export function validateAccountMessage(api,sender,m) {
  if(!trustedExtensionPage(api,sender)) return fail('UNTRUSTED_SENDER');
  if(!m||typeof m!=='object'||Array.isArray(m))return fail('INVALID_MESSAGE');
  let s;try{s=JSON.stringify(m);}catch{return fail('INVALID_MESSAGE');}
  if(!s||s.length>1800||Object.keys(m).length>2||!names.has(m.type))
    return fail('COMMAND_NOT_ALLOWED');
  if(m.params !== undefined && (!m.params||typeof m.params!=='object'||Array.isArray(m.params)||
      Object.keys(m.params).length>5))return fail('INVALID_PARAMS');
  const p=m.params||{};
  if(!['LIST_ACCOUNTS','LIST_PERSONAS','LIST_ROUTES'].includes(m.type)) {
    if(m.type==='CREATE_PERSONA') {
      if(typeof p.name!=='string'||p.name.length<1||p.name.length>64||
          !uid(p.routeId))return fail('INVALID_PARAMS');
    }else if(m.type==='ENROLL') {
      if(!isSafeId(p.accountId)||!uid(p.personaUid)||p.expectedRevision!==0)
        return fail('INVALID_PARAMS');
    }else if(!isSafeId(p.accountId)||!Number.isSafeInteger(p.expectedRevision)||
      p.expectedRevision<1) return fail('INVALID_PARAMS');
    if(m.type==='REBIND'&&(!uid(p.personaUid)||p.explicitRepair!==true))
      return fail('INVALID_PARAMS');
    if(m.type==='MANUAL_OVERRIDE'&&(
      p.acknowledgeLimitedAuthority!==true||typeof p.reason!=='string'))
      return fail('INVALID_PARAMS');
  }
  return {ok:true};
}
export function createAccountBoundary(api,{
  open=openCanonicalDatabase, guard=internalPcmsGuard,
  identityReader=async()=>null
}={}) {
  let dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const store=()=>dbPromise ||= open().then(db=>createAccountStore(db));
  async function run(message,sender) {
    const auth=validateAccountMessage(api,sender,message);
    if(!auth.ok)return auth;
    const g=guard();
    if(!g)return fail('GUARD_NOT_READY');
    const p=message.params||{};
    try {
      // Read-only queries are still possible during restore, but report the
      // explicit hold so UI cannot treat their values as operational authority.
      if(message.type==='LIST_PERSONAS')return {ok:true,personas:await g.listAvailablePersonas()};
      if(message.type==='LIST_ROUTES')return {ok:true,routes:await g.listProtectedRoutes()};
      if(message.type==='LIST_ACCOUNTS') {
        const restore=await sentinel.inspect();
        const out=await (await store()).list();
        return out.ok?{ok:true,accounts:out.accounts.map(publicAccount),
          truncated:out.truncated,held:restore.held,holdCode:restore.code}:out;
      }
      const restore=await sentinel.inspect();
      if(restore.held)return fail('RESTORE_HOLD');
      const accounts=await store();
      if(message.type==='CREATE_PERSONA') {
        // Donor's own mutation fence is authoritative. If acknowledgement is
        // lost, operator must refresh Persona inventory before retrying.
        return await g.createProtectedPersona(p.name.trim(),p.routeId);
      }
      if(message.type==='ENROLL'||message.type==='REBIND'){
        const available=await g.listAvailablePersonas();
        if(!available.some(x=>x.personaUid===p.personaUid&&!x.archived))
          return fail('PERSONA_NOT_AVAILABLE');
      }
      if(message.type==='OPEN_LOGIN'||message.type==='CHECK_IDENTITY') {
        const old=await accounts.get(p.accountId);
        if(!old.ok)return old;
        if(old.account.revision!==p.expectedRevision)return fail('STALE_REVISION');
        if(old.account.state==='ARCHIVED')return fail('ACCOUNT_ARCHIVED');
        if(message.type==='OPEN_LOGIN') return await g.openHumanLogin(old.account.personaUid);
        const readiness=await g.getSafeRouteReadiness(old.account.personaUid);
        if(!readiness.ready)return fail(readiness.code);
        // A mock/fixture can provide independently sourced proof, but a
        // user-controlled message can never submit proof or grant verification.
        const observed=await identityReader({personaUid:old.account.personaUid,
          cookieStoreId:readiness.cookieStoreId,routeId:readiness.routeId});
        if(!observed)return fail('SESSION_IDENTITY_UNOBSERVABLE');
        const result=await accounts.apply({type:'VERIFY',accountId:p.accountId,
          expectedRevision:p.expectedRevision,proof:observed});
        return result.ok?{ok:true,account:publicAccount(result.account)}:result;
      }
      const map={ENROLL:'ENROLL',ACK_LOGIN:'ACK_LOGIN',MANUAL_OVERRIDE:'MANUAL_OVERRIDE',
        ARCHIVE:'ARCHIVE',REBIND:'REBIND'};
      const out=await accounts.apply({...p,type:map[message.type]});
      return out.ok?{ok:true,account:publicAccount(out.account)}:out;
    }catch {
      // No browser/provider error strings, tokens or stack reach the UI.
      return fail('ACCOUNT_AUTHORITY_UNAVAILABLE');
    }
  }
  function register() {
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==ACCOUNT_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender))
          .then(value=>{try{port.postMessage(value);}catch{}})
          .catch(()=>{try{port.postMessage(fail('ACCOUNT_AUTHORITY_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createAccountBoundary(browser).register();
