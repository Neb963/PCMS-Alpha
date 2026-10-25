// I03 canonical account authority. No provider tokens or raw browser/container IDs
// are stored. The donor remains the sole Persona, route and tab authority.
import { fail, isSafeId } from './journal.mjs';

const uid = v => typeof v === 'string' && /^[a-z0-9-]{8,128}$/i.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const active = a => a && a.state !== 'ARCHIVED';
const key = id => 'account:' + id;
const reasons = new Set(['IDENTITY_UNOBSERVABLE','CHALLENGE','SESSION_UNAVAILABLE']);
const allowed = new Set(['ENROLL','ACK_LOGIN','VERIFY','MANUAL_OVERRIDE','ARCHIVE','REACTIVATE','REBIND','REMOVE',
  'ROUTE_SEARCH_START','ROUTE_SEARCH_STEP','ROUTE_SEARCH_COMPLETE','BEGIN_SETUP','SETUP_PROGRESS','SETUP_COMPLETE','ROUTE_STATUS','REVERIFY',
  'BEGIN_UPGRADE','UPGRADE_PROGRESS','REPLACE_PERSONA']);
const code = v => v===null || (typeof v==='string' && /^[A-Z0-9_]{3,64}$/.test(v));
const phases = new Set(['START','PERSONA','ROUTE','LOGIN','HELD']);
const routeStatuses = new Set(['PINNED','HELD','CHECKING','RELEASED','RELEASE_DEFERRED','RELEASE_UNCONFIRMED']);
const upgradePhases = new Set(['START','PERSONA','ROUTE','IDENTITY','COMPLETE','HELD']);
// The account's original verified principal: explicit, else its current
// verified identity, else the identity preserved by its latest archive entry.
// Pre-S01 data naming two different principals is ambiguous and never
// silently resolved to one of them.
function originalPrincipal(a) {
  if (a.boundPrincipal) return a.boundPrincipal;
  const seen = new Set();
  if (a.identity?.source === 'GUARDED_SESSION_READBACK' && digest(a.identity.principalFingerprint))
    seen.add(a.identity.principalFingerprint);
  for (const h of Array.isArray(a.history) ? a.history : [])
    if (h?.priorIdentity?.source === 'GUARDED_SESSION_READBACK' && digest(h.priorIdentity.principalFingerprint))
      seen.add(h.priorIdentity.principalFingerprint);
  if (seen.size > 1) return 'AMBIGUOUS';
  return seen.size ? [...seen][0] : null;
}
// One cross-account rule for every path that binds a principal: any other
// account's bound, current or historically preserved principal is taken.
function principalHeldByOther(all, accountId, fingerprint) {
  return all.some(a => a && a.accountId !== accountId &&
    (a.boundPrincipal === fingerprint || a.identity?.principalFingerprint === fingerprint ||
     (Array.isArray(a.history) && a.history.some(h => h?.priorIdentity?.principalFingerprint === fingerprint))));
}
function withHistory(previous,entry) {
  return [...(Array.isArray(previous.history)?previous.history:[]),entry].slice(-32);
}

export function transitionAccount(previous, action, all = []) {
  if (!action || !allowed.has(action.type) || !isSafeId(action.accountId))
    return fail('INVALID_ACCOUNT_COMMAND');
  if (action.type === 'BEGIN_SETUP') {
    // Operator Add Account: durable intent BEFORE any donor Persona/route effect.
    if (previous) return fail('ACCOUNT_ALREADY_EXISTS');
    if (action.expectedRevision !== 0 || !isSafeId(action.bindingId) ||
        all.some(a => a?.bindingId === action.bindingId)) return fail('INVALID_BINDING');
    return {ok:true, account:{ accountId:action.accountId, personaUid:null, bindingId:action.bindingId,
      state:'PREPARING', revision:1, bindingVersion:1, identity:null, override:null, history:[],
      setup:{phase:'START',code:null}, route:null, boundPrincipal:null }, event:'SETUP_STARTED'};
  }
  if (action.type === 'ENROLL') {
    if (previous) return fail('ACCOUNT_ALREADY_EXISTS');
    if (action.expectedRevision !== 0 || !uid(action.personaUid)) return fail('INVALID_BINDING');
    if (all.some(a => active(a) && a.personaUid?.toLowerCase() === action.personaUid.toLowerCase()))
      return fail('PERSONA_ALREADY_BOUND');
    return {ok:true, account:{ accountId:action.accountId, personaUid:action.personaUid,
      state:'WAITING_LOGIN', revision:1, bindingVersion:1, identity:null, override:null, history:[] },
      event:'ENROLLED'};
  }
  if (!previous) return fail('ACCOUNT_NOT_FOUND');
  if (!Number.isSafeInteger(action.expectedRevision) ||
      previous.revision !== action.expectedRevision) return fail('STALE_REVISION');
  if (action.type === 'ARCHIVE') {
    if (!active(previous)) return fail('ALREADY_ARCHIVED');
    return {ok:true,account:{...previous,state:'ARCHIVED',
      identity:null, override:null, revision:previous.revision+1,
      // Durable release intent: upkeep completes it even after a crash.
      route:{status:'RELEASE_DEFERRED',code:'RELEASE_PENDING',at:null,routeId:previous.route?.routeId ?? null},
      history:withHistory(previous,{event:'ARCHIVED',revision:previous.revision+1,
        priorPersonaUid:previous.personaUid,priorIdentity:previous.identity,
        priorOverride:previous.override})},event:'ARCHIVED'};
  }
  if (action.type === 'REMOVE') {
    // C-60: permanent LOCAL removal, separate from (and only after) Archive.
    // The record becomes a minimal tombstone: the account and binding IDs stay
    // so historical exit reservations (C-06) and generator provenance remain
    // attributable and an inspected restore can exclude it (C-74). Persona,
    // session identity, history and overrides are deleted. Remote generators,
    // originals, Git and backups are untouched.
    if (previous.state!=='ARCHIVED' || previous.removed) return fail('ARCHIVE_BEFORE_REMOVAL');
    if (action.explicitRemoval!==true) return fail('REMOVAL_NOT_CONFIRMED');
    if (previous.personaUid && previous.route?.status!=='RELEASED' &&
        action.personaDeleted!==true) return fail('ROUTE_RELEASE_PENDING');
    const revision=previous.revision+1;
    return {ok:true,account:{accountId:previous.accountId,
      bindingId:typeof previous.bindingId==='string'?previous.bindingId:null,
      state:'ARCHIVED',revision,bindingVersion:previous.bindingVersion,
      personaUid:null,identity:null,override:null,boundPrincipal:null,setup:null,
      route:{status:'RELEASED',code:'ACCOUNT_REMOVED',at:action.at ?? null,routeId:null},
      removed:{at:Number.isSafeInteger(action.at)?action.at:null,revision,
        personaDeleted:action.personaDeleted===true},
      history:[{event:'REMOVED',revision}]},event:'REMOVED'};
  }
  if (action.type === 'REACTIVATE') {
    if (previous.removed) return fail('ACCOUNT_REMOVED');
    if (previous.state!=='ARCHIVED'||action.explicitReactivation!==true)
      return fail('REACTIVATION_NOT_AUTHORIZED');
    if (previous.personaUid && all.some(a=>a && active(a) && a.accountId!==previous.accountId &&
      a.personaUid?.toLowerCase()===previous.personaUid.toLowerCase()))
      return fail('PERSONA_ALREADY_BOUND');
    // A setup archived before its Persona existed resumes setup, not login.
    const resumeSetup = !previous.personaUid;
    return {ok:true,account:{...previous,state:resumeSetup?'PREPARING':'WAITING_LOGIN',
      ...(resumeSetup?{setup:{phase:'START',code:null}}:{}),
      identity:null,override:null,revision:previous.revision+1,
      // Archive/reactivate retains the SAME Persona/principal binding.
      // Revision still changes, so old publication approvals stay invalid.
      bindingVersion:previous.bindingVersion,
      history:withHistory(previous,{event:'REACTIVATE',revision:previous.revision+1})},
      event:'REACTIVATE'};
  }
  if (action.type==='ROUTE_SEARCH_START'||action.type==='ROUTE_SEARCH_STEP'||action.type==='ROUTE_SEARCH_COMPLETE'){
    if(!active(previous))return fail('ACCOUNT_ARCHIVED');
    if(action.type==='ROUTE_SEARCH_STEP'&&!isSafeId(action.routeId))return fail('INVALID_ROUTE_SEARCH');
    const old=previous.routeSearch||{active:false,attempted:[]};
    const attempted=action.type==='ROUTE_SEARCH_START'?[]:
      action.type==='ROUTE_SEARCH_STEP'?[...new Set([...(old.attempted||[]),action.routeId])]:old.attempted;
    return {ok:true,account:{...previous,routeSearch:{active:action.type!=='ROUTE_SEARCH_COMPLETE',attempted}},event:action.type};
  }
  if (action.type === 'ROUTE_STATUS') {
    // Internal route projection: metadata only. It never changes the account
    // revision, so generator/source associations bound to it stay valid.
    if (!routeStatuses.has(action.status) || !code(action.code ?? null)) return fail('INVALID_ROUTE_STATUS');
    if (action.routeId !== undefined && !isSafeId(action.routeId)) return fail('INVALID_ROUTE_STATUS');
    return {ok:true,account:{...previous,route:{status:action.status,code:action.code ?? null,
      at:Number.isSafeInteger(action.at)?action.at:null,routeId:action.routeId ?? null}},event:'ROUTE_STATUS'};
  }
  if (action.type === 'UPGRADE_PROGRESS') {
    if (!previous.upgrade || !upgradePhases.has(action.phase) || !code(action.code ?? null))
      return fail('INVALID_UPGRADE_PHASE');
    return {ok:true,account:{...previous,upgrade:{...previous.upgrade,phase:action.phase,
      code:action.code ?? null}},event:'UPGRADE_PROGRESS'};
  }
  if (!active(previous)) return fail('ACCOUNT_ARCHIVED');
  if (action.type === 'SETUP_PROGRESS' || action.type === 'SETUP_COMPLETE') {
    if (previous.state !== 'PREPARING') return fail('INVALID_ACCOUNT_STATE');
    let personaUid = previous.personaUid;
    if (action.personaUid !== undefined && action.personaUid !== previous.personaUid) {
      if (previous.personaUid || !uid(action.personaUid)) return fail('INVALID_BINDING');
      if (all.some(a => active(a) && a.accountId !== previous.accountId &&
          a.personaUid?.toLowerCase() === action.personaUid.toLowerCase()))
        return fail('PERSONA_ALREADY_BOUND');
      personaUid = action.personaUid;
    }
    if (action.type === 'SETUP_COMPLETE') {
      if (!personaUid) return fail('INVALID_BINDING');
      return {ok:true,account:{...previous,personaUid,state:'WAITING_LOGIN',
        setup:{phase:'LOGIN',code:null},revision:previous.revision+1},event:'SETUP_COMPLETE'};
    }
    if (!phases.has(action.phase) || !code(action.code ?? null)) return fail('INVALID_SETUP_PHASE');
    return {ok:true,account:{...previous,personaUid,setup:{phase:action.phase,code:action.code ?? null},
      revision:previous.revision+1},event:'SETUP_PROGRESS'};
  }
  if (action.type === 'BEGIN_UPGRADE') {
    // In-place upgrade of a pre-S01 record: same account ID, Persona, state,
    // identity, history and revision. Only a binding ID is added; earlier
    // exits were never observed and are recorded as unknown, not unused.
    if (previous.bindingId) return {ok:true,account:previous,event:'UPGRADE_ALREADY_STARTED'};
    if (!uid(previous.personaUid) || !isSafeId(action.bindingId) ||
        all.some(a => a?.bindingId === action.bindingId)) return fail('INVALID_BINDING');
    const principal = originalPrincipal(previous);
    if (principal === 'AMBIGUOUS') return fail('IDENTITY_AMBIGUOUS');
    if (principal && principalHeldByOther(all, previous.accountId, principal))
      return fail('IDENTITY_ALREADY_BOUND');
    return {ok:true,account:{...previous,bindingId:action.bindingId,boundPrincipal:principal,
      upgrade:{phase:'START',code:null,priorExitHistory:'UNOBSERVED'}},event:'UPGRADE_STARTED'};
  }
  if (action.type === 'REPLACE_PERSONA') {
    // Explicit recovery when the dedicated Persona is gone: the SAME account
    // and principal move to a new tagged Persona; a fresh login must prove
    // the original principal before anything resumes.
    if (!previous.bindingId || !uid(action.personaUid) || action.personaUid === previous.personaUid)
      return fail('REPLACEMENT_NOT_AUTHORIZED');
    if (all.some(a => active(a) && a.accountId !== previous.accountId &&
        a.personaUid?.toLowerCase() === action.personaUid.toLowerCase()))
      return fail('PERSONA_ALREADY_BOUND');
    return {ok:true,account:{...previous,personaUid:action.personaUid,state:'REBIND_PENDING',
      bindingVersion:previous.bindingVersion+1,identity:null,override:null,
      boundPrincipal:previous.boundPrincipal,revision:previous.revision+1,
      history:withHistory(previous,{event:'PERSONA_REPLACED',revision:previous.revision+1,
        priorPersonaUid:previous.personaUid,priorIdentity:previous.identity})},event:'PERSONA_REPLACED'};
  }
  if (action.type === 'REVERIFY') {
    // A route change keeps the binding but requires fresh session evidence.
    if (previous.state !== 'VERIFIED') return fail('INVALID_ACCOUNT_STATE');
    return {ok:true,account:{...previous,state:'VERIFICATION_PENDING',identity:null,
      revision:previous.revision+1},event:'REVERIFY'};
  }
  let state, identity=previous.identity, override=previous.override, personaUid=previous.personaUid;
  let bindingVersion=previous.bindingVersion;
  switch (action.type) {
    case 'ACK_LOGIN':
      if (!['WAITING_LOGIN','REBIND_PENDING'].includes(previous.state)) return fail('INVALID_ACCOUNT_STATE');
      state='VERIFICATION_PENDING'; identity=null; override=null; break;
    case 'MANUAL_OVERRIDE':
      if (!['WAITING_LOGIN','VERIFICATION_PENDING','REBIND_PENDING','OVERRIDDEN','INVENTORY_PENDING'].includes(previous.state) ||
          !reasons.has(action.reason) || action.acknowledgeLimitedAuthority !== true)
        return fail('OVERRIDE_NOT_AUTHORIZED');
      state='OVERRIDDEN'; identity=null;
      override={source:'OPERATOR',reason:action.reason,consentRevision:previous.revision+1,
        reportedAt:action.reportedAt || null, routeAtReport:action.routeAtReport || null,
        grantsProviderMutation:false}; break;
    case 'VERIFY': {
      // This state transition is only invoked by a privileged readback adapter,
      // never directly by a UI message or a manual declaration.
      const proof=action.proof;
      if (!['WAITING_LOGIN','VERIFICATION_PENDING','OVERRIDDEN','REBIND_PENDING','VERIFIED','INVENTORY_PENDING'].includes(previous.state) ||
          proof?.source !== 'GUARDED_SESSION_READBACK' || proof.verified !== true ||
          proof.personaUid !== previous.personaUid || !digest(proof.principalFingerprint) ||
          !isSafeId(proof.observationId))
        return fail('INDEPENDENT_IDENTITY_PROOF_REQUIRED');
      if (all.some(a => active(a) && a.accountId !== action.accountId &&
          a.identity?.principalFingerprint === proof.principalFingerprint))
        return fail('IDENTITY_ALREADY_BOUND');
      // The first verified principal is permanent for this account: a later
      // different login (changed credentials, wrong account) never rebinds.
      if (previous.boundPrincipal && previous.boundPrincipal !== proof.principalFingerprint)
        return fail('IDENTITY_CHANGED');
      // Any other account's principal (including archived and pre-S01
      // records, and identities preserved in history) is never reused.
      if (principalHeldByOther(all, action.accountId, proof.principalFingerprint))
        return fail('IDENTITY_ALREADY_BOUND');
      identity={principalFingerprint:proof.principalFingerprint,observationId:proof.observationId,
        source:'GUARDED_SESSION_READBACK',bindingVersion};
      state=action.requireInventory===true?'INVENTORY_PENDING':'VERIFIED'; override=null; break;
    }
    case 'REBIND':
      if (!uid(action.personaUid) || action.personaUid === previous.personaUid ||
          action.explicitRepair !== true) return fail('REBIND_NOT_AUTHORIZED');
      if (all.some(a => active(a) && a.accountId !== action.accountId &&
          a.personaUid?.toLowerCase() === action.personaUid.toLowerCase()))
        return fail('PERSONA_ALREADY_BOUND');
      personaUid=action.personaUid; bindingVersion=previous.bindingVersion+1;
      state='REBIND_PENDING'; identity=null; override=null; break;
    default: return fail('INVALID_ACCOUNT_COMMAND');
  }
  const history=['MANUAL_OVERRIDE','REBIND'].includes(action.type)
    ? withHistory(previous,{
      event:action.type,revision:previous.revision+1,priorPersonaUid:previous.personaUid,
      priorIdentity:previous.identity,priorOverride:previous.override,
      ...(action.type==='MANUAL_OVERRIDE'?{reportedReason:action.reason,
        reportedAt:action.reportedAt || null,routeAtReport:action.routeAtReport || null}:{})
    }) : previous.history;
  const boundPrincipal = action.type==='VERIFY' ? (previous.boundPrincipal || identity.principalFingerprint)
    : (previous.boundPrincipal ?? null);
  return {ok:true,account:{...previous,personaUid,bindingVersion,state,identity,override,
    history,boundPrincipal,revision:previous.revision+1},event:action.type};
}

// Same-binding recovery refreshes only current ownership headers after an
// independent identity verification. Bytes, candidate/test revisions, history
// and immutable release approvals remain unchanged. Old approvals still need
// their own current-account validation and can be canceled from primary UI.
function refreshOwnedContexts(meta,events,account){
 if(account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
    account.identity.bindingVersion!==account.bindingVersion||!account.boundPrincipal||account.boundPrincipal!==account.identity.principalFingerprint)return;
 let refreshed=0;meta.openCursor().onsuccess=e=>{const c=e.target.result;if(!c){if(refreshed)events.add({stage:'ACCOUNT_CONTEXTS_REFRESHED',accountId:account.accountId,accountRevision:account.revision,count:refreshed});return;}
  const v=c.value;let property=null;
  if(typeof c.key==='string'){
   if(c.key.startsWith('stage:')||c.key.startsWith('existing-update:'))property='record';
   else if(c.key.startsWith('adoption:'))property='adoption';
   else if(c.key.startsWith('supply-batch:'))property='batch';
   else if(c.key.startsWith('source-link:'))property='link';
  }
  const r=property&&v[property];
  if(r?.accountId===account.accountId&&r.personaUid===account.personaUid&&r.bindingVersion===account.bindingVersion&&
     Number.isSafeInteger(r.accountRevision)&&r.accountRevision<account.revision&&
     (!r.principalFingerprint||r.principalFingerprint===account.boundPrincipal)){
   meta.put({...v,[property]:{...r,accountRevision:account.revision}});refreshed++;
  }
  c.continue();
 };
}
export function createAccountStore(db) {
  function transact(mode, fn) {
    return new Promise((resolve,reject)=>{
      let tx, result=fail('TRANSACTION_INCOMPLETE');
      try { tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode); }
      catch {reject(new Error('ACCOUNT_DB_UNAVAILABLE'));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(new Error('ACCOUNT_DB_ABORTED'));
      tx.onerror=()=>{};
      try {fn(tx, value=>{result=value;});}
      catch {try{tx.abort();}catch{}}
    });
  }
  // One IndexedDB readwrite transaction scans the small account keyspace,
  // checks exclusivity, and writes the next account before commit acknowledgement.
  function apply(action) {
    if (!action || !isSafeId(action.accountId)) return Promise.resolve(fail('INVALID_ACCOUNT_COMMAND'));
    return transact('readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta'), all=[];
      meta.openCursor().onsuccess=e=>{
        const cur=e.target.result;
        if (cur) {
          if (typeof cur.key==='string' && cur.key.startsWith('account:'))
            all.push(cur.value?.account);
          cur.continue();return;
        }
        const previous=all.find(a=>a?.accountId===action.accountId)||null;
        const result=transitionAccount(previous,action,all);
        if (result.ok) {
          meta.put({key:key(action.accountId),account:result.account});
          if(result.event==='VERIFY')refreshOwnedContexts(meta,tx.objectStore('events'),result.account);
          // C-74 removal history, read by inspected restore: an archive holding
          // an older revision of this account is excluded unless re-reviewed.
          if (result.event==='REMOVED')
            meta.put({key:'removal:'+action.accountId,state:'REMOVED_ONLY_LOCALLY',
              accountId:action.accountId,revision:result.account.revision,
              removedAt:result.account.removed.at});
          tx.objectStore('events').add({stage:'ACCOUNT_'+result.event,
            accountId:action.accountId,revision:result.account.revision});
        }
        finish(result);
      };
    });
  }
  // Internal orchestrator transitions are evaluated against the CURRENT
  // committed revision inside the same transaction (no UI revision race).
  function applyCurrent(action) {
    if (!action || !isSafeId(action.accountId)) return Promise.resolve(fail('INVALID_ACCOUNT_COMMAND'));
    return transact('readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta'), all=[];
      meta.openCursor().onsuccess=e=>{
        const cur=e.target.result;
        if (cur) {
          if (typeof cur.key==='string' && cur.key.startsWith('account:')) all.push(cur.value?.account);
          cur.continue();return;
        }
        const previous=all.find(a=>a?.accountId===action.accountId)||null;
        const result=transitionAccount(previous,{...action,
          expectedRevision:previous?previous.revision:0},all);
        if (result.ok) {
          meta.put({key:key(action.accountId),account:result.account});
          if(result.event==='VERIFY')refreshOwnedContexts(meta,tx.objectStore('events'),result.account);
          tx.objectStore('events').add({stage:'ACCOUNT_'+result.event,
            accountId:action.accountId,revision:result.account.revision});
        }
        finish(result);
      };
    });
  }
  function list() {
    return transact('readonly',(tx,finish)=>{
      const rows=[];
      tx.objectStore('meta').openCursor().onsuccess=e=>{
        const cur=e.target.result;
        if (!cur) {finish({ok:true,accounts:rows.slice(0,1000),
          truncated:rows.length>1000});return;}
        if (typeof cur.key==='string' && cur.key.startsWith('account:') && cur.value?.account)
          rows.push(cur.value.account);
        cur.continue();
      };
    });
  }
  function get(accountId) {
    if (!isSafeId(accountId)) return Promise.resolve(fail('INVALID_ACCOUNT_COMMAND'));
    return transact('readonly',(tx,finish)=>{
      tx.objectStore('meta').get(key(accountId)).onsuccess=e=>{
        const account=e.target.result?.account;
        finish(account?{ok:true,account}:fail('ACCOUNT_NOT_FOUND'));
      };
    });
  }
  function confirmInventory(accountId,expectedRevision){
    if(!isSafeId(accountId)||!Number.isSafeInteger(expectedRevision))return Promise.resolve(fail('INVALID_ACCOUNT_COMMAND'));
    return transact('readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key(accountId)).onsuccess=e=>{
        const account=e.target.result?.account;
        if(!account||account.revision!==expectedRevision){finish(fail('STALE_REVISION'));return;}
        if(account.state==='VERIFIED'){finish({ok:true,account,already:true});return;}
        if(account.state!=='INVENTORY_PENDING'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
           account.identity.bindingVersion!==account.bindingVersion||
           account.identity.principalFingerprint!==account.boundPrincipal){
          finish(fail('INDEPENDENT_IDENTITY_PROOF_REQUIRED'));return;
        }
        meta.get('inventory-batch:'+accountId).onsuccess=seen=>{
          const marker=seen.target.result;
          if(!marker?.observationId||marker.accountRevision!==account.revision||
             marker.bindingVersion!==account.bindingVersion){finish(fail('CURRENT_INVENTORY_REQUIRED'));return;}
          // Completes the same identity verification revision atomically.
          const next={...account,state:'VERIFIED'};
          meta.put({key:key(accountId),account:next});
          refreshOwnedContexts(meta,tx.objectStore('events'),next);
          tx.objectStore('events').add({stage:'ACCOUNT_INVENTORY_CONFIRMED',accountId,revision:account.revision});
          finish({ok:true,account:next});
        };
      };
    });
  }
  return Object.freeze({apply,applyCurrent,list,get,confirmInventory});
}

// Account command replies do not expose session fingerprints, cookieStoreIds,
// user names, cookies, or evidence IDs.
export function publicAccount(account) {
  return {accountId:account.accountId,...(typeof account.alias==='string'?{alias:account.alias.slice(0,80)}:{}),personaUid:account.personaUid,state:account.state,
    revision:account.revision,bindingVersion:account.bindingVersion,
    identity:account.identity?'VERIFIED':'UNVERIFIED',
    override:account.override?.reason||null,providerWrites:account.state==='VERIFIED'&&
      account.identity?.source==='GUARDED_SESSION_READBACK'&&
      typeof account.bindingId==='string'&&
      (!account.upgrade||account.upgrade.phase==='COMPLETE')?
        'OPERATION_GUARDED':'OFF',
    setup:account.setup||null,route:account.route||null,upgrade:account.upgrade||null,
    routeSearch:{active:account.routeSearch?.active===true,checked:account.routeSearch?.attempted?.length||0},
    removed:account.removed?{at:account.removed.at,personaDeleted:account.removed.personaDeleted===true}:null,
    protectedRoute:typeof account.bindingId!=='string'?'LEGACY_UNPINNED':
      account.upgrade&&account.upgrade.phase!=='COMPLETE'?'UPGRADING':'PCMS_PINNED'};
}
