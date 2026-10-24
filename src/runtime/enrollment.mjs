// S01 Add Account / protected route orchestration. PersonaMonkey (donor) owns
// Personas, routes, probes and network enforcement; this module only orders
// those donor operations against PCMS's canonical account record and
// historical exit ledger. Every step is recorded before its effect and every
// donor effect is reconciled by reading donor state, never blindly replayed.
import {fail} from './journal.mjs';
import {normalizeRouteEvidence,exitSetDigest} from './network-ledger.mjs';

// Hold codes that a later automatic attempt may clear without operator input.
const TRANSIENT=new Set(['MULLVAD_LOCAL_SERVICE_UNAVAILABLE','DONOR_SECURITY_UNAVAILABLE',
  'PERSONA_TAG_UNCONFIRMED','ROUTE_ASSIGN_UNCONFIRMED','NO_ROUTE_CANDIDATES','ENROLLMENT_INTERRUPTED']);
const rid=prefix=>prefix+crypto.randomUUID().replaceAll('-','');
// Codes shown to the operator; anything else is summarized generically.
export const SETUP_MESSAGES=Object.freeze({
  MULLVAD_LOCAL_SERVICE_UNAVAILABLE:'The PersonaMonkey Mullvad helper is not running or not installed on this computer.',
  DONOR_SECURITY_UNAVAILABLE:'Firefox privacy protections are not in a safe state; PersonaMonkey is holding all protected routes.',
  NO_UNIQUE_EXIT_AVAILABLE:'No available Mullvad exit was found that has not already been used by another managed account.',
  NO_ROUTE_CANDIDATES:'No Mullvad relay list or unused Mullvad route is available right now.',
  IPV6_EVIDENCE_UNVERIFIED:'The route\'s IPv6 behaviour could not be verified, so it was not used.',
  ROUTE_CHECK_FAILED:'The last route check failed. PCMS checks again shortly and moves to another unique exit only if it fails again.',
  EXIT_LEDGER_MISSING:'PCMS\'s record of used exits is missing while PersonaMonkey still has managed Personas. New routes are held so no exit is reused.',
  EXIT_DRIFT_CONFLICT:'This account\'s route now exits from an address recorded for another account. Its traffic is held.',
  ROUTE_CHANGED_OUTSIDE_PCMS:'The Persona\'s route was changed outside PCMS. Its traffic is held until PCMS verifies a route.',
  PERSONA_CREATE_UNCONFIRMED:'PersonaMonkey did not confirm the new Persona. Retry continues safely.',
  ROUTE_ASSIGN_UNCONFIRMED:'PersonaMonkey did not confirm the route assignment. Retry continues safely.',
  BINDING_PERSONA_AMBIGUOUS:'More than one Persona claims this account. Nothing was changed.',
  BINDING_PERSONA_ABSENT:'The dedicated Persona for this account is missing in PersonaMonkey. Use Create replacement Persona.',
  PERSONA_NOT_FOUND:'This account\'s Persona no longer exists in PersonaMonkey. Use Create replacement Persona; the account, its generators and history are kept.',
  PERSONA_AMBIGUOUS:'More than one PersonaMonkey Persona matches this account. Nothing was changed.',
  PERSONA_NOT_ACTIVE:'This account\'s Persona is archived or being rotated in PersonaMonkey. Restore it there, then retry the upgrade.',
  PERSONA_BOUND_TO_OTHER_ACCOUNT:'This account\'s Persona is already bound to another managed account. Nothing was changed.',
  PERSONA_TAG_UNCONFIRMED:'PersonaMonkey did not confirm the protection marker for this Persona. The upgrade retries safely.',
  IDENTITY_ALREADY_BOUND:'This account\'s Perchance login is already recorded for another managed account. Nothing was changed.',
  UPGRADE_IN_PROGRESS:'This account is being upgraded to a reserved protected exit; it keeps its Persona, login and generators.',
  RESOURCE_IN_USE:'The account\'s route is still in use (open tab or running work); it will be released once idle.',
  RESOURCE_SHARED:'The account\'s route is shared with another Persona, so it is not released.',
  CANDIDATE_RELEASE_UNCONFIRMED:'A temporary route check could not confirm releasing its unused resources. Check the Mullvad helper, then resume.',
  RELEASE_UNCONFIRMED:'PersonaMonkey did not confirm releasing the route; PCMS will check and retry safely.'
});

export function createEnrollment({accounts,ledger,donor,pins,openLogin,identify,syncInventory,
  now=Date.now}={}){
  if(!accounts?.applyCurrent||!ledger?.reserve||!donor?.createBoundPersona||!pins?.hold||
     typeof openLogin!=='function'||typeof identify!=='function')
    throw new TypeError('Enrollment dependencies unavailable');
  const running=new Map(),archiving=new Map();
  // Coalesce only the SAME intent. A different operator command must never
  // inherit a route probe's result and falsely claim it archived an account.
  function exclusive(accountId,kind,task){
    if(archiving.has(accountId))return Promise.resolve(fail('ACCOUNT_BUSY'));
    const prior=running.get(accountId);
    if(prior)return prior.kind===kind?prior.promise:Promise.resolve(fail('ACCOUNT_BUSY'));
    const promise=Promise.resolve().then(task).catch(()=>fail('ENROLLMENT_INTERRUPTED'))
      .finally(()=>running.delete(accountId));
    running.set(accountId,{kind,promise});
    return promise;
  }
  const progress=(accountId,phase,code=null,extra={})=>
    accounts.applyCurrent({type:'SETUP_PROGRESS',accountId,phase,code,...extra});
  const routeStatus=(accountId,status,code=null)=>
    accounts.applyCurrent({type:'ROUTE_STATUS',accountId,status,code,at:now()});

  // The pin is withdrawn BEFORE an observation that may hold it, and only
  // restored after the ACTIVE record is committed. HELD->ACTIVE on the SAME
  // pinned route is allowed after a clean assigned probe (e.g. a manual route
  // edit undone); an exit owned by another account can never re-activate.
  async function activate(bindingId,evidence,routeId,accountId,allowArchived=false){
    // A successful IPv4/DNS probe is not complete exit-family evidence.
    // Withdraw old admission BEFORE parsing the new observation.
    pins.hold(bindingId);
    const n=normalizeRouteEvidence(evidence);
    if(!n.ok||n.routeId!==routeId){
      const out=n.ok?fail('ROUTE_CHANGED_DURING_PROBE'):n;
      await ledger.hold(bindingId,out.code);
      return out;
    }
    const current=await accounts.get(accountId);
    if(!current.ok||current.account.bindingId!==bindingId||current.account.state==='ARCHIVED'&&!allowArchived){
      await ledger.hold(bindingId,'ACCOUNT_ARCHIVED');return fail('ACCOUNT_ARCHIVED');
    }
    const out=await ledger.observe({bindingId,routeId,exits:n.exits,
      exitSetDigest:await exitSetDigest(n.exits),observedAtMs:n.observedAtMs,activate:true});
    if(!out.ok)return out;
    const latest=await accounts.get(accountId);
    if(!latest.ok||latest.account.bindingId!==bindingId||latest.account.state==='ARCHIVED'&&!allowArchived){
      await ledger.hold(bindingId,'ACCOUNT_ARCHIVED');return fail('ACCOUNT_ARCHIVED');
    }
    pins.release(bindingId);
    await pins.reload();
    return {ok:true,routeId,changed:true};
  }
  // Verify the currently assigned route. Rotation to a different unique exit
  // happens only on operator request, or for unattended checks after a
  // SECOND consecutive failed check of the same route (never on a single
  // timeout, and never from a Perchance/Cloudflare response: probes only
  // reach the fixed Mullvad echo). rotate:false (archived) only observes.
  async function ensurePinnedRoute(account,{change=false,automatic=false,rotate=true}={}){
    const bindingId=account.bindingId;
    const persona=await donor.boundPersona({bindingId});
    if(!persona.ok)return persona;
    // The donor's tagged Persona must be the one the account record names;
    // a replacement is adopted only after REPLACE_PERSONA has committed.
    if(String(persona.personaUid).toLowerCase()!==String(account.personaUid).toLowerCase())
      return fail('BINDING_PERSONA_CONFLICT');
    const prior=await ledger.binding(bindingId);
    const failed=[];
    if(prior.ok&&prior.binding.routeId===persona.routeId&&!change){
      const ev=await donor.probeAssigned({bindingId,contextId:persona.contextId,routeId:persona.routeId});
      if(ev.ok){
        const out=await activate(bindingId,ev,persona.routeId,account.accountId,!rotate);
        if(out.ok){
          if(account.routeSearch?.active)await accounts.applyCurrent({type:'ROUTE_SEARCH_COMPLETE',accountId:account.accountId});
          return {ok:true,routeId:persona.routeId,changed:false};
        }
        if(['EXIT_DRIFT_CONFLICT','IPV4_EVIDENCE_UNVERIFIED','IPV6_EVIDENCE_UNVERIFIED',
            'PROTECTED_EVIDENCE_UNVERIFIED','ROUTE_CHANGED_DURING_PROBE'].includes(out.code))return out;
        if(!rotate)return out;
        if(automatic&&account.route?.code!=='ROUTE_CHECK_FAILED')return fail('ROUTE_CHECK_FAILED');
        failed.push(persona.routeId);
      }else if(ev.failure==='HOST')return ev;
      else{
        if(!rotate)return ev;
        if(automatic&&account.route?.code!=='ROUTE_CHECK_FAILED')return fail('ROUTE_CHECK_FAILED');
        failed.push(persona.routeId);
      }
    }else if(prior.ok&&prior.binding.routeId!==persona.routeId&&prior.binding.pin==='ACTIVE'&&!change){
      // Route edited outside PCMS: the donor pin already blocks this Persona.
      pins.hold(bindingId);
      await ledger.hold(bindingId,'ROUTE_CHANGED_OUTSIDE_PCMS');
      if(!rotate)return fail('ROUTE_CHANGED_OUTSIDE_PCMS');
    }else if(!rotate)return fail(prior.ok?'ROUTE_HELD':'BINDING_RESERVATION_ABSENT');
    if(change&&prior.ok)failed.push(prior.binding.routeId);
    // Withdraw first: synchronous donor hold BEFORE any ledger or route change.
    pins.hold(bindingId);
    if(prior.ok&&prior.binding.pin!=='HELD')await ledger.hold(bindingId,change?'OPERATOR_ROUTE_CHANGE':'ROUTE_REPAIR');
    const prefer=prior.ok?(prior.binding.history||[]).map(h=>h.routeId):[];
    const listed=await donor.candidateRoutes({bindingId,excludeRouteIds:failed,preferRouteIds:prefer});
    // A lost/replaced PCMS store is not an empty exit history: donor
    // Personas tagged for bindings PCMS has no record of hold allocation.
    if(listed.ok&&Array.isArray(listed.taggedBindings)&&listed.taggedBindings.length){
      const known=await accounts.list();
      if(!known.ok)return known;
      const ids=new Set(known.accounts.map(a=>a.bindingId).filter(Boolean));
      if(listed.taggedBindings.some(id=>!ids.has(id)))return fail('EXIT_LEDGER_MISSING');
    }
    const latest=await accounts.get(account.accountId);
    const attempted=new Set(latest.account?.routeSearch?.active?latest.account.routeSearch.attempted:[]);
    if(!latest.account?.routeSearch?.active)await accounts.applyCurrent({type:'ROUTE_SEARCH_START',accountId:account.accountId});
    const checked=async routeId=>{
      attempted.add(routeId);
      await accounts.applyCurrent({type:'ROUTE_SEARCH_STEP',accountId:account.accountId,routeId});
    };
    const candidates=listed.ok&&Array.isArray(listed.candidates)?listed.candidates:[];
    let last=candidates.length?'NO_UNIQUE_EXIT_AVAILABLE':'NO_ROUTE_CANDIDATES';
    for(const candidate of candidates){
      // The catalog is finite; visit its complete eligible set rather than
      // retrying the same colliding prefix forever. Only one probe/assignment
      // is in flight for this account; other accounts remain independent.
      const fresh=await accounts.get(account.accountId);
      if(!fresh.ok||fresh.account.state==='ARCHIVED')return fail('ACCOUNT_ARCHIVED');
      if(candidate.kind==='ROUTE'&&attempted.has(candidate.routeId))continue;
      const route=await donor.ensureRoute(candidate);
      if(!route.ok){last=route.code;continue;}
      const ev=await donor.probeCandidate({routeId:route.routeId});
      if(!ev.ok){if(ev.failure==='HOST')return ev;last=ev.code;await checked(route.routeId);continue;}
      const n=normalizeRouteEvidence(ev);
      if(!n.ok){last=n.code;await checked(route.routeId);continue;}
      const reserved=await ledger.reserve({accountId:account.accountId,bindingId,
        personaUid:persona.personaUid,contextId:persona.contextId,routeId:route.routeId,
        exits:n.exits,exitSetDigest:await exitSetDigest(n.exits),evidenceId:n.evidenceId,
        observedAtMs:n.observedAtMs,ipv6Disposition:n.ipv6Disposition,
        replacesPersona:prior.ok&&prior.binding.personaUid!==persona.personaUid});
      if(!reserved.ok){last=reserved.code==='EXIT_HISTORICALLY_OWNED'?'NO_UNIQUE_EXIT_AVAILABLE':reserved.code;await checked(route.routeId);continue;}
      const assigned=await donor.assignRoute({bindingId,personaUid:persona.personaUid,
        contextId:persona.contextId,routeId:route.routeId});
      // Unconfirmed assignment: the reservation is durable; the next run
      // reads the donor route and reconciles instead of assigning again.
      if(!assigned.ok)return assigned;
      const verified=await donor.probeAssigned({bindingId,contextId:persona.contextId,routeId:route.routeId});
      if(!verified.ok){if(verified.failure==='HOST')return verified;last=verified.code;failed.push(route.routeId);continue;}
      const out=await activate(bindingId,verified,route.routeId,account.accountId);
      if(out.ok){await accounts.applyCurrent({type:'ROUTE_SEARCH_COMPLETE',accountId:account.accountId});return out;}
      if(out.code==='EXIT_DRIFT_CONFLICT')return out;
      last=out.code;await checked(route.routeId);
    }
    await accounts.applyCurrent({type:'ROUTE_SEARCH_COMPLETE',accountId:account.accountId});
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
    if(!['WAITING_LOGIN','VERIFICATION_PENDING','REBIND_PENDING','VERIFIED','OVERRIDDEN','INVENTORY_PENDING'].includes(account.state)||
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
    if(!observed.ok){
      if(account.state==='VERIFIED')await accounts.applyCurrent({type:'REVERIFY',accountId});
      return silent?{ok:false,code:observed.code,needsLogin:true}:observed;
    }
    if(account.state==='VERIFIED'&&account.boundPrincipal!==observed.proof.principalFingerprint){
      await accounts.applyCurrent({type:'REVERIFY',accountId});
      return fail('IDENTITY_CHANGED');
    }
    // Same principal on an already verified record: nothing to rewrite, so
    // revision-bound generator/source associations stay valid.
    const verified=['VERIFIED','INVENTORY_PENDING'].includes(account.state)&&account.identity&&
      observed.proof.principalFingerprint===account.boundPrincipal&&
      account.identity.principalFingerprint===account.boundPrincipal?{ok:true,account}:
      await accounts.applyCurrent({type:'VERIFY',accountId,proof:observed.proof,requireInventory:true});
    if(!verified.ok)return verified;
    const inventory=typeof syncInventory==='function'?await syncInventory(accountId,verified.account.revision):null;
    if(!inventory?.ok)return {ok:false,identityConfirmed:true,state:verified.account.state,
      code:inventory?.code||'INVENTORY_UNAVAILABLE'};
    const complete=await accounts.confirmInventory(accountId,verified.account.revision);
    if(!complete.ok)return complete;
    return {ok:true,state:'VERIFIED',inventory:'SYNCHRONIZED'};
  }

  // Background/periodic or operator route check for one active account.
  async function verifyRoute(accountId,{change=false,automatic=false}={}){
    const got=await accounts.get(accountId);
    if(!got.ok)return got;
    const account=got.account;
    if(['PREPARING','ARCHIVED'].includes(account.state)||typeof account.bindingId!=='string')
      return fail('INVALID_ACCOUNT_STATE');
    const route=await ensurePinnedRoute(account,{change,automatic});
    if(!route.ok){
      await routeStatus(accountId,route.code==='ROUTE_CHECK_FAILED'?'CHECKING':'HELD',route.code);
      return route;
    }
    await routeStatus(accountId,'PINNED');
    if(route.changed&&account.state==='VERIFIED'){
      const identity=await revalidate(account);
      return {ok:true,changed:true,identity};
    }
    return {ok:true,changed:route.changed===true};
  }
  // Revalidate a VERIFIED account's ORIGINAL principal on its current Persona.
  // Same principal: no state change. Missing session or a different login:
  // the account waits for login and is never rebound.
  async function revalidate(account){
    const observed=await identify(account.personaUid);
    if(observed.ok&&observed.proof.principalFingerprint===account.boundPrincipal)return 'VERIFIED';
    await accounts.applyCurrent({type:'REVERIFY',accountId:account.accountId});
    return observed.ok?'IDENTITY_CHANGED':'LOGIN_REQUIRED';
  }

  // C-56-C-59 in-place upgrade of an account bound before S01: keep its ID,
  // Persona, session, principal, history, revision and associations; tag the
  // existing Persona, pin a permissible unique exit, revalidate the principal.
  async function upgrade(accountId){
    let got=await accounts.get(accountId);
    if(!got.ok)return got;
    let account=got.account;
    if(account.state==='ARCHIVED'||account.state==='PREPARING')return fail('INVALID_ACCOUNT_STATE');
    if(account.upgrade?.phase==='COMPLETE')return {ok:true,state:account.state,already:true};
    if(typeof account.bindingId!=='string'){
      const begun=await accounts.applyCurrent({type:'BEGIN_UPGRADE',accountId,bindingId:rid('bind_')});
      if(!begun.ok)return begun;
      account=begun.account;
    }else if(!account.upgrade)return {ok:true,state:account.state,already:true};
    const step=(phase,code=null)=>accounts.applyCurrent({type:'UPGRADE_PROGRESS',accountId,phase,code});
    await step('PERSONA');
    const tagged=await donor.tagExistingPersona({bindingId:account.bindingId,personaUid:account.personaUid});
    if(!tagged.ok){await step('HELD',tagged.code);return tagged;}
    await step('ROUTE');
    const route=await ensurePinnedRoute(account);
    if(!route.ok){await step('HELD',route.code);await routeStatus(accountId,'HELD',route.code);return route;}
    await routeStatus(accountId,'PINNED');
    await step('IDENTITY');
    got=await accounts.get(accountId);
    account=got.account;
    const identity=account.state==='VERIFIED'?await revalidate(account):'NOT_VERIFIED_BEFORE';
    await step('COMPLETE',identity==='VERIFIED'||identity==='NOT_VERIFIED_BEFORE'?null:identity);
    return {ok:true,upgraded:true,identity};
  }
  // Explicit operator recovery for a missing dedicated Persona.
  async function replacePersona(accountId,expectedRevision){
    const got=await accounts.get(accountId);
    if(!got.ok)return got;
    const account=got.account;
    if(account.revision!==expectedRevision)return fail('STALE_REVISION');
    if(account.state==='ARCHIVED'||typeof account.bindingId!=='string')return fail('INVALID_ACCOUNT_STATE');
    const present=await donor.boundPersona({bindingId:account.bindingId});
    if(present.ok&&present.personaUid===account.personaUid)return fail('PERSONA_STILL_PRESENT');
    if(!present.ok&&present.code!=='BINDING_PERSONA_ABSENT')return present;
    if(!present.ok){
      const legacy=await donor.inspectRouteUse({personaUid:account.personaUid});
      if(legacy.ok||legacy.code!=='PERSONA_NOT_FOUND')return fail('PERSONA_STILL_PRESENT');
    }
    pins.hold(account.bindingId);
    const made=present.ok?present:await donor.createBoundPersona({bindingId:account.bindingId,
      name:'PCMS account '+account.accountId.slice(-6)});
    if(!made.ok)return made;
    const moved=await accounts.applyCurrent({type:'REPLACE_PERSONA',accountId,personaUid:made.personaUid});
    if(!moved.ok)return moved;
    if(moved.account.upgrade)await accounts.applyCurrent({type:'UPGRADE_PROGRESS',accountId,phase:'COMPLETE',code:null});
    const route=await ensurePinnedRoute(moved.account);
    if(!route.ok){await routeStatus(accountId,'HELD',route.code);return route;}
    await routeStatus(accountId,'PINNED');
    await openLogin(made.personaUid);
    return {ok:true,state:'REBIND_PENDING'};
  }

  // C-56/C-58 Archive: durable state first (stops every new automation
  // effect), then release only this account's OWN idle forwarder when the
  // donor proves it unused. Uncertain dispatched work keeps its journal;
  // Persona, cookies, principal and exit history are untouched.
  function archive(accountId,expectedRevision){
    const prior=archiving.get(accountId);
    if(prior)return prior.revision===expectedRevision?prior.promise:Promise.resolve(fail('ACCOUNT_BUSY'));
    const inFlight=running.get(accountId)?.promise;
    const promise=(async()=>{
      const out=await accounts.apply({type:'ARCHIVE',accountId,expectedRevision});
      if(!out.ok)return out;
      // Suspend durably now; the running effect settles at its next safe boundary.
      if(inFlight)await inFlight;
      const release=await releaseIdle(out.account);
      return {ok:true,state:'ARCHIVED',release:release.status};
    })().finally(()=>archiving.delete(accountId));
    archiving.set(accountId,{revision:expectedRevision,promise});
    return promise;
  }
  async function releaseIdle(snapshot){
    const accountId=snapshot.accountId;
    // Act only on the CURRENT record: a reactivation in between wins.
    const fresh=await accounts.get(accountId);
    if(!fresh.ok||fresh.account.state!=='ARCHIVED')return {status:'NOT_ARCHIVED'};
    const account=fresh.account;
    const set=(status,code=null)=>routeStatus(accountId,status,code).then(()=>({status,code}));
    if(!account.personaUid)return set('RELEASED','NO_PERSONA');
    // Reconcile an earlier unconfirmed release by observation first.
    if(account.route?.status==='RELEASE_UNCONFIRMED'&&account.route.routeId){
      const seen=await donor.observeRouteReleased({routeId:account.route.routeId});
      if(seen.ok&&seen.released)return set('RELEASED');
    }
    const use=await donor.inspectRouteUse({personaUid:account.personaUid});
    if(!use.ok)return set('RELEASE_DEFERRED',use.code);
    if(!use.releasable){
      if(use.reason==='NO_ROUTE_RESOURCE')return set('RELEASED','NO_ROUTE_RESOURCE');
      // Still carrying human traffic: keep observing its exit (no rotation),
      // so drift onto another account's exit holds it as in active use.
      if(use.reason==='RESOURCE_IN_USE'&&typeof account.bindingId==='string'){
        const observed=await ensurePinnedRoute(account,{rotate:false});
        if(!observed.ok&&observed.code==='EXIT_DRIFT_CONFLICT')return set('HELD','EXIT_DRIFT_CONFLICT');
      }
      return set('RELEASE_DEFERRED',use.reason);
    }
    // Withdraw network authority before touching the resource; reactivation
    // re-verifies the exit before any traffic resumes.
    if(typeof account.bindingId==='string'){
      pins.hold(account.bindingId);
      const held=await ledger.hold(account.bindingId,'ARCHIVED_RELEASED');
      if(!held.ok&&held.code!=='BINDING_RESERVATION_ABSENT')return set('RELEASE_DEFERRED',held.code);
    }
    const released=await donor.releaseIdleRoute({personaUid:account.personaUid,routeId:use.routeId});
    if(released.ok)return set('RELEASED');
    if(released.code==='RELEASE_UNCONFIRMED'){
      await accounts.applyCurrent({type:'ROUTE_STATUS',accountId,status:'RELEASE_UNCONFIRMED',
        code:'RELEASE_UNCONFIRMED',at:now(),routeId:use.routeId});
      return {status:'RELEASE_UNCONFIRMED',code:released.code};
    }
    return set('RELEASE_DEFERRED',released.code);
  }

  async function reactivate(accountId,expectedRevision){
    const out=await accounts.apply({type:'REACTIVATE',accountId,expectedRevision,explicitReactivation:true});
    if(!out.ok)return out;
    if(out.account.state==='PREPARING')return prepare(accountId);
    // A pre-S01 record is upgraded in place through the SAME account.
    if(typeof out.account.bindingId!=='string'){
      const up=await upgrade(accountId);
      if(!up.ok){
        // An identity conflict cannot be resolved by reactivation: return the
        // record to Archive rather than leave it active and unusable.
        if(['IDENTITY_ALREADY_BOUND','IDENTITY_AMBIGUOUS'].includes(up.code)){
          const now=await accounts.get(accountId);
          if(now.ok)await accounts.apply({type:'ARCHIVE',accountId,expectedRevision:now.account.revision});
        }
        return up;
      }
    }
    const again=await confirm(accountId,{silent:true});
    if(again.ok)return again;
    if(!again.needsLogin)return again;
    if(again.needsLogin)await openLogin(out.account.personaUid);
    return {ok:true,state:'WAITING_LOGIN',code:again.code};
  }

  // C-60: permanent local removal of an ARCHIVED account. Optional deletion
  // of its dedicated Persona/session goes through the donor's own removal.
  async function remove(accountId,expectedRevision,{deletePersona=false}={}){
    const fresh=await accounts.get(accountId);
    if(!fresh.ok)return fresh;
    const a=fresh.account;
    if(a.revision!==expectedRevision)return fail('STALE_REVISION');
    if(a.state!=='ARCHIVED'||a.removed)return fail('ARCHIVE_BEFORE_REMOVAL');
    let personaDeleted=false;
    if(deletePersona&&a.personaUid){
      if(typeof donor.removeAccountPersona!=='function')return fail('PERSONA_REMOVAL_UNAVAILABLE');
      const out=await donor.removeAccountPersona({personaUid:a.personaUid});
      if(!out?.ok)return fail(out?.code||'PERSONA_REMOVAL_UNCONFIRMED');
      personaDeleted=true;
    }
    return accounts.apply({type:'REMOVE',accountId,expectedRevision,
      explicitRemoval:true,personaDeleted,at:now()});
  }
  return Object.freeze({
    remove:(accountId,expectedRevision,options)=>exclusive(accountId,'REMOVE:'+String(expectedRevision)+':'+String(options?.deletePersona===true),
      ()=>remove(accountId,expectedRevision,options)),
    async begin(){
      const accountId=rid('acct_'),bindingId=rid('bind_');
      const out=await accounts.applyCurrent({type:'BEGIN_SETUP',accountId,bindingId});
      if(!out.ok)return out;
      // Setup continues in the background; the operator watches progress.
      void exclusive(accountId,'SETUP',()=>prepare(accountId));
      return {ok:true,accountId};
    },
    resume:accountId=>exclusive(accountId,'SETUP',()=>prepare(accountId)),
    prepare:accountId=>exclusive(accountId,'SETUP',()=>prepare(accountId)),
    confirm:accountId=>exclusive(accountId,'CONFIRM',()=>confirm(accountId)),
    verifyRoute:(accountId,options)=>exclusive(accountId,'ROUTE:'+String(options?.change===true)+':'+String(options?.automatic===true),()=>verifyRoute(accountId,options)),
    reactivate:(accountId,rev)=>exclusive(accountId,'REACTIVATE',()=>reactivate(accountId,rev)),
    upgrade:accountId=>exclusive(accountId,'UPGRADE',()=>upgrade(accountId)),
    replacePersona:(accountId,rev)=>exclusive(accountId,'REPLACE_PERSONA',()=>replacePersona(accountId,rev)),
    archive:(accountId,rev)=>archive(accountId,rev),
    // Startup/alarm upkeep: resume operator-started setups and unfinished
    // upgrades, upgrade pre-S01 records in place, re-verify pinned routes.
    // Archived accounts are never probed (that would recreate a released
    // forwarder); only an incomplete release is retried.
    async upkeep(){
      const listed=await accounts.list();
      if(!listed.ok)return listed;
      const results=[];
      async function checkAccount(a){
        const id=a.accountId;
        if(a.state==='ARCHIVED'){
          // Includes accounts archived before release existed or interrupted
          // between the Archive commit and the release.
          if(a.route?.status!=='RELEASED')results.push(await exclusive(id,'RELEASE',()=>releaseIdle(a)));
          return;
        }
        if(a.state==='INVENTORY_PENDING'){
          results.push(await exclusive(id,'CONFIRM',()=>confirm(id,{silent:true})));
        }else if(a.state==='PREPARING'){
          if(typeof a.bindingId==='string'&&a.setup?.phase!=='HELD')
            results.push(await exclusive(id,'SETUP',()=>prepare(id)));
        }else if(typeof a.bindingId!=='string'||(a.upgrade&&a.upgrade.phase!=='COMPLETE'&&
            (a.upgrade.phase!=='HELD'||TRANSIENT.has(a.upgrade.code)))){
          // Never start tagging (which blocks the Persona until pinned) while
          // a human tab or running work uses it; the operator can still start it.
          // Unsolicited tagging needs POSITIVE idle evidence; unknown or
          // failed inspection retries later without any mutation.
          if(!a.upgrade){
            let use=null;
            try{use=await donor.inspectRouteUse({personaUid:a.personaUid});}catch{}
            if(use?.ok!==true||use.inUse!==false)return;
          }
          results.push(await exclusive(id,'UPGRADE',()=>upgrade(id)));
        }else if(!a.upgrade||a.upgrade.phase==='COMPLETE')
          results.push(await exclusive(id,'ROUTE:false:true',()=>verifyRoute(id,{automatic:true})));
      }
      // One slow inventory/search must not prevent another account's renewal.
      // Bound in-flight account tasks while allowing ready workers to advance.
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(4,listed.accounts.length)},async()=>{
        while(cursor<listed.accounts.length)await checkAccount(listed.accounts[cursor++]);
      }));
      return {ok:true,checked:results.length};
    },
    running:accountId=>running.has(accountId)||archiving.has(accountId)
  });
}
