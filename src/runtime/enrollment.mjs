// S01 Add Account / protected route orchestration. PersonaMonkey (donor) owns
// Personas, routes, probes and network enforcement; this module only orders
// those donor operations against PCMS's canonical account record and
// historical exit ledger. Every step is recorded before its effect and every
// donor effect is reconciled by reading donor state, never blindly replayed.
import {fail} from './journal.mjs';
import {normalizeRouteEvidence,exitSetDigest} from './network-ledger.mjs';

const MAX_CANDIDATES=8;
const rid=prefix=>prefix+crypto.randomUUID().replaceAll('-','');
// Codes shown to the operator; anything else is summarized generically.
export const SETUP_MESSAGES=Object.freeze({
  MULLVAD_LOCAL_SERVICE_UNAVAILABLE:'The PersonaMonkey Mullvad helper is not running or not installed on this computer.',
  DONOR_SECURITY_UNAVAILABLE:'Firefox privacy protections are not in a safe state; PersonaMonkey is holding all protected routes.',
  NO_UNIQUE_EXIT_AVAILABLE:'No available Mullvad exit was found that has not already been used by another managed account.',
  NO_ROUTE_CANDIDATES:'No Mullvad relay list or unused Mullvad route is available right now.',
  IPV6_EVIDENCE_UNVERIFIED:'The route\'s IPv6 behaviour could not be verified, so it was not used.',
  EXIT_DRIFT_CONFLICT:'This account\'s route now exits from an address recorded for another account. Its traffic is held.',
  ROUTE_CHANGED_OUTSIDE_PCMS:'The Persona\'s route was changed outside PCMS. Its traffic is held until PCMS verifies a route.',
  PERSONA_CREATE_UNCONFIRMED:'PersonaMonkey did not confirm the new Persona. Retry continues safely.',
  ROUTE_ASSIGN_UNCONFIRMED:'PersonaMonkey did not confirm the route assignment. Retry continues safely.',
  BINDING_PERSONA_AMBIGUOUS:'More than one Persona claims this account. Nothing was changed.',
  BINDING_PERSONA_ABSENT:'The dedicated Persona for this account is missing in PersonaMonkey.'
});

export function createEnrollment({accounts,ledger,donor,pins,openLogin,identify,syncInventory,
  now=Date.now}={}){
  if(!accounts?.applyCurrent||!ledger?.reserve||!donor?.createBoundPersona||!pins?.hold||
     typeof openLogin!=='function'||typeof identify!=='function')
    throw new TypeError('Enrollment dependencies unavailable');
  const running=new Map();
  // One in-process run per account; a second request joins the first.
  function exclusive(accountId,task){
    if(running.has(accountId))return running.get(accountId);
    const run=Promise.resolve().then(task).catch(()=>fail('ENROLLMENT_INTERRUPTED'))
      .finally(()=>running.delete(accountId));
    running.set(accountId,run);
    return run;
  }
  const progress=(accountId,phase,code=null,extra={})=>
    accounts.applyCurrent({type:'SETUP_PROGRESS',accountId,phase,code,...extra});
  const routeStatus=(accountId,status,code=null)=>
    accounts.applyCurrent({type:'ROUTE_STATUS',accountId,status,code,at:now()});

  async function activate(bindingId,evidence,routeId){
    const n=normalizeRouteEvidence(evidence);
    if(!n.ok||n.routeId!==routeId)return n.ok?fail('ROUTE_CHANGED_DURING_PROBE'):n;
    const out=await ledger.observe({bindingId,routeId,exits:n.exits,
      exitSetDigest:await exitSetDigest(n.exits),observedAtMs:n.observedAtMs,activate:true});
    if(!out.ok)return out;
    pins.release(bindingId);
    await pins.reload();
    return {ok:true,routeId,changed:true};
  }
  // Verify the currently assigned route; on genuine route failure (never a
  // Perchance/Cloudflare response: probes only reach the fixed Mullvad echo)
  // or on operator request, pin a different unique exit.
  async function ensurePinnedRoute(account,{change=false}={}){
    const bindingId=account.bindingId;
    const persona=await donor.boundPersona({bindingId});
    if(!persona.ok)return persona;
    const prior=await ledger.binding(bindingId);
    const failed=[];
    if(prior.ok&&prior.binding.routeId===persona.routeId&&!change){
      const ev=await donor.probeAssigned({bindingId,contextId:persona.contextId,routeId:persona.routeId});
      if(ev.ok){
        const out=await activate(bindingId,ev,persona.routeId);
        if(out.ok)return {ok:true,routeId:persona.routeId,changed:false};
        if(out.code==='EXIT_DRIFT_CONFLICT'){pins.hold(bindingId);return out;}
        failed.push(persona.routeId);
      }else if(ev.failure==='HOST')return ev;
      else failed.push(persona.routeId);
    }else if(prior.ok&&prior.binding.routeId!==persona.routeId&&prior.binding.pin==='ACTIVE'&&!change){
      // Route edited outside PCMS: the donor pin already blocks this Persona.
      pins.hold(bindingId);
      await ledger.hold(bindingId,'ROUTE_CHANGED_OUTSIDE_PCMS');
    }
    if(change&&prior.ok)failed.push(prior.binding.routeId);
    // Withdraw first: synchronous donor hold BEFORE any ledger or route change.
    pins.hold(bindingId);
    if(prior.ok&&prior.binding.pin!=='HELD')await ledger.hold(bindingId,change?'OPERATOR_ROUTE_CHANGE':'ROUTE_REPAIR');
    const prefer=prior.ok?(prior.binding.history||[]).map(h=>h.routeId):[];
    const listed=await donor.candidateRoutes({bindingId,excludeRouteIds:failed,preferRouteIds:prefer});
    const candidates=listed.ok?listed.candidates.slice(0,MAX_CANDIDATES):[];
    let last=candidates.length?'NO_UNIQUE_EXIT_AVAILABLE':'NO_ROUTE_CANDIDATES';
    for(const candidate of candidates){
      const route=await donor.ensureRoute(candidate);
      if(!route.ok){last=route.code;continue;}
      const ev=await donor.probeCandidate({routeId:route.routeId});
      if(!ev.ok){if(ev.failure==='HOST')return ev;last=ev.code;continue;}
      const n=normalizeRouteEvidence(ev);
      if(!n.ok){last=n.code;continue;}
      const reserved=await ledger.reserve({accountId:account.accountId,bindingId,
        personaUid:persona.personaUid,contextId:persona.contextId,routeId:route.routeId,
        exits:n.exits,exitSetDigest:await exitSetDigest(n.exits),evidenceId:n.evidenceId,
        observedAtMs:n.observedAtMs,ipv6Disposition:n.ipv6Disposition});
      if(!reserved.ok){last=reserved.code==='EXIT_HISTORICALLY_OWNED'?'NO_UNIQUE_EXIT_AVAILABLE':reserved.code;continue;}
      const assigned=await donor.assignRoute({bindingId,personaUid:persona.personaUid,
        contextId:persona.contextId,routeId:route.routeId});
      // Unconfirmed assignment: the reservation is durable; the next run
      // reads the donor route and reconciles instead of assigning again.
      if(!assigned.ok)return assigned;
      const verified=await donor.probeAssigned({bindingId,contextId:persona.contextId,routeId:route.routeId});
      if(!verified.ok){if(verified.failure==='HOST')return verified;last=verified.code;failed.push(route.routeId);continue;}
      const out=await activate(bindingId,verified,route.routeId);
      if(out.ok)return out;
      if(out.code==='EXIT_DRIFT_CONFLICT')return out;
      last=out.code;
    }
    return fail(last);
  }

  async function prepare(accountId){
    let got=await accounts.get(accountId);
    if(!got.ok)return got;
    let account=got.account;
    if(account.state!=='PREPARING')return fail('INVALID_ACCOUNT_STATE');
    if(!account.personaUid){
      await progress(accountId,'PERSONA');
      const made=await donor.createBoundPersona({bindingId:account.bindingId,
        name:'PCMS account '+account.accountId.slice(-6)});
      if(!made.ok){await progress(accountId,'HELD',made.code);return made;}
      const moved=await progress(accountId,'ROUTE',null,{personaUid:made.personaUid});
      if(!moved.ok)return moved;
      account=moved.account;
    }else await progress(accountId,'ROUTE');
    const route=await ensurePinnedRoute(account);
    if(!route.ok){await progress(accountId,'HELD',route.code);return route;}
    await routeStatus(accountId,'PINNED');
    const done=await accounts.applyCurrent({type:'SETUP_COMPLETE',accountId});
    if(!done.ok)return done;
    const opened=await openLogin(done.account.personaUid);
    return {ok:true,state:'WAITING_LOGIN',loginTab:opened?.ok===true};
  }

  // Confirm: verify the pinned route, then the real session principal, then
  // the owned inventory. A UI click is never identity evidence.
  async function confirm(accountId,{silent=false}={}){
    const got=await accounts.get(accountId);
    if(!got.ok)return got;
    let account=got.account;
    if(!['WAITING_LOGIN','VERIFICATION_PENDING','REBIND_PENDING','VERIFIED'].includes(account.state)||
       typeof account.bindingId!=='string')return fail('INVALID_ACCOUNT_STATE');
    const route=await ensurePinnedRoute(account);
    if(!route.ok){await routeStatus(accountId,'HELD',route.code);return route;}
    await routeStatus(accountId,'PINNED');
    if(account.state==='WAITING_LOGIN'||account.state==='REBIND_PENDING'){
      const acked=await accounts.applyCurrent({type:'ACK_LOGIN',accountId});
      if(!acked.ok)return acked;
      account=acked.account;
    }
    const observed=await identify(account.personaUid);
    if(!observed.ok)return silent?{ok:false,code:observed.code,needsLogin:true}:observed;
    const verified=await accounts.applyCurrent({type:'VERIFY',accountId,proof:observed.proof});
    if(!verified.ok)return verified;
    const inventory=typeof syncInventory==='function'?await syncInventory(accountId,verified.account.revision):null;
    return {ok:true,state:'VERIFIED',inventory:inventory?.ok===true?'SYNCHRONIZED':(inventory?.code||'NOT_RUN')};
  }

  // Background/periodic or operator route check for one active account.
  async function verifyRoute(accountId,{change=false}={}){
    const got=await accounts.get(accountId);
    if(!got.ok)return got;
    const account=got.account;
    if(account.state==='ARCHIVED'||account.state==='PREPARING'||typeof account.bindingId!=='string')
      return fail('INVALID_ACCOUNT_STATE');
    const route=await ensurePinnedRoute(account,{change});
    if(!route.ok){await routeStatus(accountId,'HELD',route.code);return route;}
    await routeStatus(accountId,'PINNED');
    if(route.changed&&account.state==='VERIFIED'){
      // Revalidate the same principal on the new exit; no silent rebind.
      await accounts.applyCurrent({type:'REVERIFY',accountId});
      const again=await confirm(accountId,{silent:true});
      return {ok:true,changed:true,identity:again.ok?'VERIFIED':'LOGIN_REQUIRED'};
    }
    return {ok:true,changed:route.changed===true};
  }

  async function reactivate(accountId,expectedRevision){
    const out=await accounts.apply({type:'REACTIVATE',accountId,expectedRevision,explicitReactivation:true});
    if(!out.ok)return out;
    if(out.account.state==='PREPARING')return prepare(accountId);
    const again=await confirm(accountId,{silent:true});
    if(again.ok)return again;
    if(again.needsLogin)await openLogin(out.account.personaUid);
    return {ok:true,state:'WAITING_LOGIN',code:again.code};
  }

  return Object.freeze({
    async begin(){
      const accountId=rid('acct_'),bindingId=rid('bind_');
      const out=await accounts.applyCurrent({type:'BEGIN_SETUP',accountId,bindingId});
      if(!out.ok)return out;
      // Setup continues in the background; the operator watches progress.
      void exclusive(accountId,()=>prepare(accountId));
      return {ok:true,accountId};
    },
    resume:accountId=>exclusive(accountId,()=>prepare(accountId)),
    prepare:accountId=>exclusive(accountId,()=>prepare(accountId)),
    confirm:accountId=>exclusive(accountId,()=>confirm(accountId)),
    verifyRoute:(accountId,options)=>exclusive(accountId,()=>verifyRoute(accountId,options)),
    reactivate:(accountId,rev)=>exclusive(accountId,()=>reactivate(accountId,rev)),
    // Startup/alarm upkeep: unfinished operator-started setups resume; active
    // pinned accounts re-verify their route. Archived accounts are untouched.
    async upkeep(){
      const listed=await accounts.list();
      if(!listed.ok)return listed;
      const results=[];
      for(const a of listed.accounts){
        if(typeof a.bindingId!=='string'||a.state==='ARCHIVED')continue;
        if(a.state==='PREPARING'){
          if(a.setup?.phase!=='HELD')results.push(await exclusive(a.accountId,()=>prepare(a.accountId)));
        }else results.push(await exclusive(a.accountId,()=>verifyRoute(a.accountId)));
      }
      return {ok:true,checked:results.length};
    },
    running:accountId=>running.has(accountId)
  });
}
