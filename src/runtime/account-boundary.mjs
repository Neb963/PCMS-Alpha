import {checkpointed} from './work-checkpoint.mjs';
// I03/S01: isolated same-XPI account port. Add Account, Confirm and route
// repair orchestrate donor-owned Persona/route operations through the
// enrollment module; this port accepts only operator intents, never proofs,
// Persona IDs, route IDs or endpoints from the page.
import { openCanonicalDatabase, createRestoreSentinel, fail, isSafeId } from './journal.mjs';
import { createAccountStore, publicAccount } from './accounts.mjs';
import { createExitLedger } from './network-ledger.mjs';
import { createEnrollment, SETUP_MESSAGES } from './enrollment.mjs';
import { holdRoutePin, releaseRoutePinHold, reloadRoutePins, routePinSummary } from './route-pin.mjs';
import { internalPcmsGuard } from './persona-guard.mjs';
import { inventoryBoundary } from './inventory-boundary.mjs';
import { createInventoryStore } from './inventory.mjs';
import { trustedExtensionPage } from './command-boundary.mjs';

export const ACCOUNT_PORT='pcms-i03-accounts';
export const ROUTE_UPKEEP_ALARM='pcms-s01-route-upkeep';
const READS=['INSPECT_CONNECTION','INSPECT_ACCOUNT','LIST_ACCOUNTS','LIST_PERSONAS','LIST_ROUTES','NETWORK_STATUS','WITNESS_STATUS','ADD_ACCOUNT'];
const permitted={
  INSPECT_CONNECTION:[],INSPECT_ACCOUNT:['accountId'],LIST_ACCOUNTS:[],LIST_PERSONAS:[],LIST_ROUTES:[],NETWORK_STATUS:[],WITNESS_STATUS:[],ADD_ACCOUNT:[],
  RESUME_SETUP:['accountId','expectedRevision'],CONFIRM_LOGIN:['accountId','expectedRevision'],
  SYNC_ACCOUNT:['accountId','expectedRevision'],CHECK_IDENTITY:['accountId','expectedRevision'],VERIFY_ROUTE:['accountId','expectedRevision'],
  CHANGE_ROUTE:['accountId','expectedRevision'],UPGRADE_ACCOUNT:['accountId','expectedRevision'],
  REPLACE_PERSONA:['accountId','expectedRevision','explicitReplacement'],
  ACK_LOGIN:['accountId','expectedRevision'],OPEN_LOGIN:['accountId','expectedRevision'],
  ARCHIVE:['accountId','expectedRevision'],
  REMOVE_ACCOUNT:['accountId','expectedRevision','explicitRemoval','deletePersona'],
  MANUAL_OVERRIDE:['accountId','expectedRevision','reason','acknowledgeLimitedAuthority'],
  REACTIVATE:['accountId','expectedRevision','explicitReactivation']
};
export function validateAccountMessage(api,sender,m) {
  if(!trustedExtensionPage(api,sender)) return fail('UNTRUSTED_SENDER');
  if(!m||typeof m!=='object'||Array.isArray(m))return fail('INVALID_MESSAGE');
  let s;try{s=JSON.stringify(m);}catch{return fail('INVALID_MESSAGE');}
  if(!s||s.length>1800||Object.keys(m).length>2||!Object.hasOwn(permitted,m.type))
    return fail('COMMAND_NOT_ALLOWED');
  if(m.params !== undefined && (!m.params||typeof m.params!=='object'||Array.isArray(m.params)||
      Object.keys(m.params).length>5))return fail('INVALID_PARAMS');
  const p=m.params||{};
  if(Object.keys(p).some(k=>!permitted[m.type].includes(k)))return fail('INVALID_PARAMS');
  if(m.type==='INSPECT_ACCOUNT'&&!isSafeId(p.accountId))return fail('INVALID_PARAMS');
  if(!READS.includes(m.type)) {
    if(!isSafeId(p.accountId)||!Number.isSafeInteger(p.expectedRevision)||
      p.expectedRevision<1) return fail('INVALID_PARAMS');
    if(m.type==='REACTIVATE'&&p.explicitReactivation!==true)return fail('INVALID_PARAMS');
    if(m.type==='REMOVE_ACCOUNT'&&(p.explicitRemoval!==true||typeof p.deletePersona!=='boolean'))
      return fail('INVALID_PARAMS');
    if(m.type==='REPLACE_PERSONA'&&p.explicitReplacement!==true)return fail('INVALID_PARAMS');
    if(m.type==='MANUAL_OVERRIDE'&&(
      p.acknowledgeLimitedAuthority!==true||typeof p.reason!=='string'))
      return fail('INVALID_PARAMS');
  }
  return {ok:true};
}
// The guard is checked before and after any asynchronous identity observation.
// A correct session readback under a stale/rotated Persona context is NOT
// allowed to revalidate the old account binding.
export async function guardedIdentityRead(guard,personaUid,identityReader) {
  const before=await guard.getSafeRouteReadiness(personaUid);
  if(!before.ready)return fail(before.code);
  const proof=await identityReader({personaUid:before.personaUid,
    cookieStoreId:before.cookieStoreId,routeId:before.routeId});
  if(!proof)return fail('SESSION_IDENTITY_UNOBSERVABLE');
  const after=await guard.getSafeRouteReadiness(personaUid);
  if(!after.ready||before.personaUid!==after.personaUid||
      before.cookieStoreId!==after.cookieStoreId||
      before.routeId!==after.routeId)return fail('SESSION_CONTEXT_CHANGED');
  if(proof.source!=='GUARDED_SESSION_READBACK'||proof.verified!==true||
      proof.personaUid!==personaUid)return fail('INDEPENDENT_IDENTITY_PROOF_REQUIRED');
  return {ok:true,proof};
}

export function inspectAccountProjection(account,network,inventory){
  const ledger=network?.ok?network.ledger:null;
  const binding=ledger?.bindings?.[account.bindingId];
  const matches=binding?.accountId===account.accountId&&binding?.personaUid===account.personaUid;
  const historicalExits=ledger?Object.entries(ledger.owners).filter(([,owner])=>owner===account.accountId)
    .map(([key])=>({family:key.slice(0,key.indexOf(':')),address:key.slice(key.indexOf(':')+1)})):[];
  return {ok:true,account:publicAccount(account),inventory:inventory||null,
    protection:{state:matches?binding.pin:'UNVERIFIED',code:matches?binding.holdCode:(network?.code||null),
      routeId:matches?binding.routeId:null,verifiedAtMs:matches?binding.verifiedAtMs:null,
      exits:matches?binding.exits.map(x=>({family:x.family,address:x.address})):[],
      ipv6Disposition:matches?binding.ipv6Disposition:'UNKNOWN',historicalExits},
    history:(account.history||[]).map(x=>({event:x.event,revision:x.revision,
      reportedReason:x.reportedReason||null,reportedAt:x.reportedAt||null,
      routeAtReport:x.routeAtReport||null}))};
}

// Only unfinished setup/upgrade is current. A completed historical failure
// must not outrank a newer successful route observation indefinitely.
export function accountCurrentMessage(a){
  const code=a.state==='PREPARING'?a.setup?.code:
    a.upgrade&&a.upgrade.phase!=='COMPLETE'?a.upgrade.code:
    a.route?.status==='PINNED'?null:a.route?.code;
  return SETUP_MESSAGES[code]||null;
}

export function createAccountBoundary(api,{
  open=openCanonicalDatabase, guard=internalPcmsGuard,
  identityReader=async context=>{
    const out=await internalPcmsGuard()?.observeReadOnly(context.personaUid,true);
    if(!out?.ok||!(/^[a-f0-9]{64}$/).test(out.principalFingerprint))return null;
    return {source:'GUARDED_SESSION_READBACK',verified:true,
      personaUid:context.personaUid,principalFingerprint:out.principalFingerprint,
      observationId:'identity_'+crypto.randomUUID().replaceAll('-','')};
  },
  pins={hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},
  syncInventory=(accountId,revision)=>inventoryBoundary?inventoryBoundary.syncAccount(accountId,revision):
    Promise.resolve(fail('INVENTORY_UNAVAILABLE')),
  backupRequester=null
}={}) {
  let dbPromise,enrollment,enrollmentInit;
  const sentinel=createRestoreSentinel(api.storage.local);
  const connection=()=>dbPromise ||= open();
  const store=async()=>createAccountStore(await connection());
  const exitLedger=async()=>createExitLedger(await connection());
  // The SAME production instance serves the UI port and background upkeep.
  async function flow(){
    // Read-only account views remain available throughout restore.
    if((await sentinel.inspect()).held)return null;
    if(enrollment)return enrollment;
    if(enrollmentInit)return enrollmentInit;
    const g=guard();if(!g?.enrollmentDonor)return null;
    enrollmentInit=(async()=>{
      const created=createEnrollment({accounts:await store(),ledger:await exitLedger(),
        donor:g.enrollmentDonor,pins,mutationAllowed:async()=>!(await sentinel.inspect()).held,
        openLogin:personaUid=>g.openHumanLogin(personaUid),
        identify:personaUid=>guardedIdentityRead(g,personaUid,identityReader),syncInventory});
      const recovered=await created.recoverInterrupted({canRecover:async()=>!(await sentinel.inspect()).held});
      if(!recovered.ok){if(recovered.code==='RESTORE_HOLD')return null;throw Error('SETUP_RECOVERY_UNAVAILABLE');}
      if((await sentinel.inspect()).held)return null;
      enrollment=created;return enrollment;
    })().then(created=>{if(!created)enrollmentInit=null;return created;}).catch(error=>{enrollmentInit=null;throw error});
    return enrollmentInit;
  }
  const explain=code=>SETUP_MESSAGES[code]||null;
  async function current(accounts,p){
    const old=await accounts.get(p.accountId);
    if(!old.ok)return old;
    if(old.account.revision!==p.expectedRevision)return fail('STALE_REVISION');
    return old;
  }
  async function run(message,sender) {
    const auth=validateAccountMessage(api,sender,message);
    if(!auth.ok)return auth;
    const p=message.params||{};
    try {
      const g=guard();
      // Local records are readable while PersonaMonkey is still starting.
      if(!g&&!['LIST_ACCOUNTS','INSPECT_ACCOUNT','ARCHIVE','MANUAL_OVERRIDE','ACK_LOGIN'].includes(message.type))return fail('GUARD_NOT_READY');
      if(message.type==='LIST_PERSONAS')return {ok:true,personas:await g.listAvailablePersonas()};
      if(message.type==='INSPECT_CONNECTION'){
        const out=await g.enrollmentDonor?.inspectConnection?.();
        return out?{...out,message:explain(out.code)}:fail('CONNECTION_OBSERVER_UNAVAILABLE');
      }
      if(message.type==='LIST_ROUTES')return {ok:true,routes:await g.listProtectedRoutes()};
      if(message.type==='WITNESS_STATUS'){
        const result=await g.sampleNativeWitness?.();
        if(!result?.ok)return fail(result?.code||'NATIVE_WITNESS_UNAVAILABLE');
        // One timestamp pair proves a native observation, NOT continuous
        // Firefox/route health, restoration or eligible clock credit.
        return {ok:true,capability:'READ_ONLY_NATIVE_PAIR',qualifiedTime:false,
          sequence:result.witness.sequence,observedAtMs:Date.now()};
      }
      if(message.type==='NETWORK_STATUS'){
        // Redacted counts only. No IPs, routes or native endpoints.
        const out=await (await exitLedger()).inspect();
        return out.ok?{...out,pins:routePinSummary(),admission:'PER_ACCOUNT_ROUTE_PIN'}:out;
      }
      if(message.type==='INSPECT_ACCOUNT'){
        const db=await connection(),found=await (await store()).get(p.accountId);
        if(!found.ok)return found;
        const a=found.account,network=await (await exitLedger()).read();
        const summaries=await createInventoryStore(db).accountSummaries();
        const projection=inspectAccountProjection(a,network,summaries.summaries?.[a.accountId]);
        const f=await flow();
        projection.account.working=f?.running(a.accountId)===true;
        projection.account.activity=f?.activity(a.accountId)||null;
        projection.account.message=accountCurrentMessage(a);
        return projection;
      }
      if(message.type==='LIST_ACCOUNTS') {
        const restore=await sentinel.inspect();
        const out=await (await store()).list();
        const f=await flow();
        const inventory=await createInventoryStore(await connection()).accountSummaries().catch(()=>null);
        return out.ok?{ok:true,accounts:out.accounts.map(a=>({...publicAccount(a),
          inventory:inventory?.summaries?.[a.accountId]||null,
          working:f?.running(a.accountId)===true,
          activity:f?.activity(a.accountId)||null,message:accountCurrentMessage(a)})),
          truncated:out.truncated,held:restore.held,holdCode:restore.code,
          enrollment:f?'AVAILABLE':'DONOR_UNAVAILABLE'}:out;
      }
      const restore=await sentinel.inspect();
      if(restore.held)return fail('RESTORE_HOLD');
      const accounts=await store();
      if(message.type==='ADD_ACCOUNT'){
        const f=await flow();
        return f?await f.begin():fail('ENROLLMENT_UNAVAILABLE');
      }
      const old=await current(accounts,p);
      if(!old.ok)return old;
      const f=await flow();
      const pinned=typeof old.account.bindingId==='string';
      const upgraded=pinned&&(!old.account.upgrade||old.account.upgrade.phase==='COMPLETE');
      if(['RESUME_SETUP','SYNC_ACCOUNT','CONFIRM_LOGIN','CHECK_IDENTITY','VERIFY_ROUTE','CHANGE_ROUTE','OPEN_LOGIN',
          'UPGRADE_ACCOUNT','REPLACE_PERSONA'].includes(message.type)){
        if(old.account.state==='ARCHIVED')return fail('ACCOUNT_ARCHIVED');
        if(!f)return fail('ENROLLMENT_UNAVAILABLE');
      }
      if(message.type==='UPGRADE_ACCOUNT'){
        if(upgraded)return fail('ALREADY_UPGRADED');
        return await f.upgrade(p.accountId);
      }
      if(message.type==='REPLACE_PERSONA'){
        const out=await f.replacePersona(p.accountId,p.expectedRevision);
        return out.ok?out:{...out,message:explain(out.code)};
      }
      if(['SYNC_ACCOUNT','CONFIRM_LOGIN','CHECK_IDENTITY','VERIFY_ROUTE','CHANGE_ROUTE','OPEN_LOGIN'].includes(message.type)&&!upgraded){
        // A pre-S01 record is upgraded in place (same account), never recreated.
        void f.upgrade(p.accountId);
        return fail('UPGRADE_IN_PROGRESS');
      }
      if(message.type==='RESUME_SETUP'){
        if(old.account.state!=='PREPARING')return fail('INVALID_ACCOUNT_STATE');
        return await f.prepare(p.accountId);
      }
      if(['SYNC_ACCOUNT','CONFIRM_LOGIN','CHECK_IDENTITY'].includes(message.type)){
        const out=await f.confirm(p.accountId);
        return out.ok?out:{...out,message:explain(out.code)};
      }
      if(message.type==='VERIFY_ROUTE'||message.type==='CHANGE_ROUTE'){
        // Operator-requested; may take several probes, progress is listed.
        return await f.verifyRoute(p.accountId,{change:message.type==='CHANGE_ROUTE'});
      }
      if(message.type==='OPEN_LOGIN')return await f.openLogin(p.accountId);
      if(message.type==='REACTIVATE'){
        if(!f)return fail('ENROLLMENT_UNAVAILABLE');
        return await f.reactivate(p.accountId,p.expectedRevision);
      }
      if(message.type==='REMOVE_ACCOUNT'){
        if(!f)return fail('ENROLLMENT_UNAVAILABLE');
        const out=await f.remove(p.accountId,p.expectedRevision,{deletePersona:p.deletePersona});
        if(!out.ok)return {...out,message:explain(out.code)};
        // C-75: the removal is complete and stays in force whatever happens
        // to the follow-up protected backup attempt.
        let backup;
        try{
          // Same single registered backup coordinator (module instance shared
          // with entry.mjs); lazily loaded to keep this port's graph small.
          const requester=backupRequester||
            (await import('./backup-auto-boundary.mjs')).autoBackup?.runner;
          backup=await requester?.requestFreshAfterRemoval?.();
        }
        catch{backup=null;}
        return {ok:true,state:'REMOVED',account:publicAccount(out.account),
          backup:backup?.ok?'FRESH_BACKUP_REQUESTED':(backup?.code||'BACKUP_UNAVAILABLE')};
      }
      if(message.type==='ARCHIVE'){
        if(f){
          const out=await f.archive(p.accountId,p.expectedRevision);
          return out.ok?out:{...out,message:explain(out.code)};
        }
        // Donor not ready: archive now; the idle release is retried by upkeep.
        const out=await accounts.apply({...p,type:'ARCHIVE'});
        if(!out.ok)return out;
        await accounts.applyCurrent({type:'ROUTE_STATUS',accountId:p.accountId,
          status:'RELEASE_DEFERRED',code:'DONOR_UNAVAILABLE',at:Date.now()});
        return {ok:true,state:'ARCHIVED',release:'RELEASE_DEFERRED'};
      }
      const map={ACK_LOGIN:'ACK_LOGIN',MANUAL_OVERRIDE:'MANUAL_OVERRIDE'};
      const route=message.type==='MANUAL_OVERRIDE'&&old.account.bindingId?
        await (await exitLedger()).binding(old.account.bindingId):null;
      const out=await accounts.apply({...p,type:map[message.type],
        ...(message.type==='MANUAL_OVERRIDE'?{reportedAt:new Date().toISOString(),
          routeAtReport:route?.ok?{routeId:route.binding.routeId,pin:route.binding.pin,
            verifiedAtMs:route.binding.verifiedAtMs}:null}:{} )});
      return out.ok?{ok:true,account:publicAccount(out.account)}:out;
    }catch {
      // No browser/provider error strings, tokens or stack reach the UI.
      return fail('ACCOUNT_AUTHORITY_UNAVAILABLE');
    }
  }
  // Route upkeep: resume operator-started setups and re-verify pinned routes
  // without an open dashboard. Probes reach only the fixed Mullvad echo.
  async function upkeep(){
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const f=await flow();
      return f?await f.upkeep():fail('ENROLLMENT_UNAVAILABLE');
    }catch{return fail('ROUTE_UPKEEP_UNAVAILABLE');}
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
    // Donor route-test evidence expires after 15 minutes. Reuse the
    // existing bounded S01 upkeep, with its protected Mullvad echo probes,
    // before cache expiry; do not add a second Refresher route supervisor.
    const schedule=async()=>{try{
      // Repeated event-page evaluation must not postpone an existing alarm.
      if(api.alarms?.get&&await api.alarms.get(ROUTE_UPKEEP_ALARM))return;
      await api.alarms?.create(ROUTE_UPKEEP_ALARM,{delayInMinutes:1,periodInMinutes:10});
    }catch{}};
    void schedule();api.runtime.onStartup?.addListener(()=>void schedule());
    api.alarms?.onAlarm?.addListener(alarm=>{if(alarm?.name===ROUTE_UPKEEP_ALARM)void upkeep();});
  }
    run=checkpointed(api,run,{allowDuringRestore:message=>["INSPECT_CONNECTION","LIST_ACCOUNTS","INSPECT_ACCOUNT","LIST_PERSONAS","LIST_ROUTES","NETWORK_STATUS","WITNESS_STATUS"].includes(message?.type)});
  upkeep=checkpointed(api,upkeep);
  return Object.freeze({register,run,upkeep});
}
if(typeof browser!=='undefined')createAccountBoundary(browser).register();
