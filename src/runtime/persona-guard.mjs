import {admissionForI17Supply} from './legacy-quarantine.mjs';
import {validateNativeWitness} from './qualified-clock.mjs';
import {inspectRoutePin} from './route-pin.mjs';
// This facade shares donor Management Integration's actual control-lease
// registry. Nothing here can execute a browser/native/provider mutation at I01.
let installed = null;
const HOLD = code => Object.freeze({ ready: false, code });
const BAD_PROXY = new Set(['controlled_by_other_extensions', 'not_controllable']);
export async function cachedHealthDomain(evidence){
  // The donor already checked age, context and protected egress. Different
  // route IDs sharing an observed exit are one witness. No new route probe,
  // raw IP storage or network request. Unknown/noncanonical exit => no domain.
  const ip=evidence?.data?.ip;
  if(evidence?.ok!==true||typeof ip!=='string'||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)||
    !ip.split('.').every(p=>String(Number(p))===p&&Number(p)<=255))return null;
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pcms-provider-egress:'+ip));
  return 'egress_'+Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

export function createPersonaGuard({ initialize, securityState, shared, getRouteTest,
  listPersonas, listProtectedRoutes, createPersona, openHumanLogin, readIsolatedTab,
  supplyIsolatedTab, stageIsolatedTab, handoffStagingTab, inspectStageTab, inspectNoEditorTabs, aiNativeStep, releaseIsolatedTab, existingIsolatedTab, readRuntimeWitness, enrollmentDonor, pinGate = inspectRoutePin }) {
  if (typeof initialize !== 'function' || !shared?.resolve ||
      !shared?.acquire || !shared?.validate || !shared?.release ||
      typeof getRouteTest !== 'function') throw new TypeError('Donor guard dependencies unavailable');

  async function inspect(personaUid) {
    if (typeof personaUid !== 'string' || !/^[a-z0-9-]{8,128}$/i.test(personaUid))
      return HOLD('INVALID_PERSONA_UID');
    try {
      await initialize();
      if (securityState.ready !== true || securityState.privacySafe !== true ||
          BAD_PROXY.has(securityState.proxyControl)) return HOLD('DONOR_SECURITY_UNAVAILABLE');
      const current = await shared.resolve(personaUid);
      if (!current?.cookieStoreId || current.personaUid?.toLowerCase() !== personaUid.toLowerCase())
        return HOLD('PERSONA_IDENTITY_UNVERIFIED');
      if (current.archived || current.rotating) return HOLD('PERSONA_NOT_ACTIVE');
      if (current.routeId === 'direct') return HOLD('DIRECT_FORBIDDEN');
      if (!current.route || current.routeId === 'block' || current.route.enabled === false)
        return HOLD('PROTECTED_ROUTE_UNAVAILABLE');
      // Every PCMS effect requires the S01 route pin: an exit reserved in
      // the historical ledger for THIS binding on THIS route. Personas
      // without a PCMS binding tag are never PCMS-operable.
      if (typeof current.pcmsBindingId !== 'string') return HOLD('ROUTE_RESERVATION_REQUIRED');
      const pin = pinGate({ pcmsBindingId: current.pcmsBindingId, personaUid: current.personaUid,
        containerId: current.cookieStoreId, routeId: current.routeId, managed: true, killSwitch: true });
      if (!pin.allow) return HOLD('PROTECTED_ROUTE_NOT_PINNED');
      // A configured proxy is not evidence of a working protected route.
      // This is the donor's context-fenced cached test, never a new network probe.
      const evidence = await getRouteTest(current.cookieStoreId);
      if (evidence?.ok !== true) return HOLD('PROTECTED_ROUTE_UNVERIFIED');
      return Object.freeze({
        ready: true, code: 'GUARD_READY',
        personaUid: current.personaUid, cookieStoreId: current.cookieStoreId,
        routeId: current.routeId,healthDomain:await cachedHealthDomain(evidence)
      });
    } catch {
      // Do not disclose thrown storage/native/route errors (potential secrets).
      return HOLD('DONOR_READ_FAILED');
    }
  }

  async function acquireConflictGuard(personaUid) {
    const before = await inspect(personaUid);
    if (!before.ready) return before;
    let lease = null;
    let accepted = false;
    try {
      lease = await shared.acquire(personaUid);
      const after = await inspect(personaUid);
      if (!after.ready || after.cookieStoreId !== before.cookieStoreId ||
          after.routeId !== before.routeId) return HOLD('GUARD_CHANGED');
      const checked = await shared.validate(personaUid, lease.leaseId);
      if (checked.cookieStoreId !== before.cookieStoreId) return HOLD('PERSONA_CONTAINER_CHANGED');
      accepted = true;
      return Object.freeze({
        ...after, leaseId: lease.leaseId, expiresAt: lease.expiresAt
      });
    } catch {
      return HOLD('DONOR_LEASE_BUSY_OR_REVOKED');
    } finally {
      // A lease acquired but not returned to its caller must never survive.
      // Inspect failures do not confer authority.
      if (lease && !accepted) {
        try { await shared.release(lease.leaseId); } catch {}
      }
    }
  }

  async function inspectOwnedAction(receipt) {
    if (!receipt?.leaseId || !receipt?.personaUid || !receipt?.cookieStoreId)
      return HOLD('LEASE_MISSING');
    const current = await inspect(receipt.personaUid);
    if (!current.ready) return current;
    if (receipt.cookieStoreId !== current.cookieStoreId || receipt.routeId !== current.routeId)
      return HOLD('TARGET_CHANGED');
    try {
      const checked = await shared.validate(receipt.personaUid, receipt.leaseId);
      if (checked.cookieStoreId !== current.cookieStoreId) return HOLD('PERSONA_CONTAINER_CHANGED');
      return current;
    } catch { return HOLD('LEASE_REVOKED'); }
  }

  async function releaseConflictGuard(receipt) {
    if (!receipt?.leaseId) return HOLD('LEASE_MISSING');
    try { await shared.release(receipt.leaseId); return { released: true }; }
    catch { return HOLD('LEASE_ALREADY_LOST'); }
  }

  async function listAvailablePersonas() {
    try {
      await initialize();
      if (typeof listPersonas !== 'function') return [];
      const items = await listPersonas();
      if (!Array.isArray(items) || items.length > 1000) return [];
      return items.filter(p => typeof p?.personaUid === 'string' &&
        /^[a-z0-9-]{8,128}$/i.test(p.personaUid)).map(p=>({
        personaUid:p.personaUid, name:String(p.name||'Persona').slice(0,64),
        archived:p.archived===true, routeProtected:p.routeProtected===true
      }));
    } catch { return []; }
  }
  async function availableRoutes() {
    try {
      await initialize();
      if(typeof listProtectedRoutes!=='function')return [];
      const list=await listProtectedRoutes();
      return Array.isArray(list) ? list.slice(0,128)
        .filter(r=>typeof r?.routeId==='string' && /^[a-z0-9_-]{1,128}$/i.test(r.routeId))
        .map(r=>({routeId:r.routeId,name:String(r.name||'Protected route').slice(0,64)})) : [];
    }catch {return [];}
  }
  async function createProtectedPersona(name, routeId) {
    if (typeof name!=='string'||!name.trim()||name.length>64 ||
        typeof routeId!=='string' || !/^[a-z0-9_-]{1,128}$/i.test(routeId))
      return {ok:false,code:'INVALID_PERSONA_CREATE'};
    try {
      await initialize();
      if(securityState.ready!==true || securityState.privacySafe!==true ||
          BAD_PROXY.has(securityState.proxyControl)) return {ok:false,code:'DONOR_SECURITY_UNAVAILABLE'};
      if(!(await availableRoutes()).some(r=>r.routeId===routeId))
        return {ok:false,code:'PROTECTED_ROUTE_UNAVAILABLE'};
      if(typeof createPersona!=='function')return {ok:false,code:'DONOR_PERSONA_CREATE_UNAVAILABLE'};
      await createPersona({name:name.trim(),routeId});
      return {ok:true,created:true,providerEffects:'OFF'};
    }catch {return {ok:false,code:'PERSONA_CREATE_UNCONFIRMED'};}
  }
  async function openLogin(personaUid) {
    const before=await inspect(personaUid);
    if(!before.ready)return {ok:false,code:before.code};
    if(typeof openHumanLogin!=='function')return {ok:false,code:'DONOR_TAB_OPEN_UNAVAILABLE'};
    try {
      await openHumanLogin(before);
      return {ok:true,opened:true,kind:'HUMAN_LOGIN_ONLY'};
    }catch{return {ok:false,code:'HUMAN_TAB_OPEN_UNCONFIRMED'};}
  }

  async function observeReadOnly(personaUid, identityOnly=false, originalSlug=null) {
    if(typeof readIsolatedTab!=='function')return {ok:false,code:'OBSERVER_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)return {ok:false,code:leased?.code||'GUARD_UNAVAILABLE'};
    try {
      const packet=await readIsolatedTab(leased,{identityOnly:identityOnly===true,originalSlug});
      if(!packet?.ok)return {ok:false,code:packet?.code||'OBSERVER_UNVERIFIED'};
      const rechecked=await inspectOwnedAction(leased);
      if(!rechecked?.ready)return {ok:false,code:rechecked?.code||'GUARD_CHANGED'};
      return packet;
    }catch{return {ok:false,code:'OBSERVER_UNAVAILABLE'};}
    finally{await releaseConflictGuard(leased);}
  }

  // Fixed public feed/statistics GETs use the SAME donor lease and isolated
  // reader. Session proof is independently checked by the host around them.
  async function observeMonitoring(personaUid,request){
    if(!request||!['RECENT','STATISTIC'].includes(request.kind)||
      Object.keys(request).some(k=>!['kind','slug'].includes(k))||
      (request.kind==='STATISTIC'&&!/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug||''))||
      (request.kind==='RECENT'&&request.slug!=null))return {ok:false,code:'MONITOR_REQUEST_INVALID'};
    if(typeof readIsolatedTab!=='function')return {ok:false,code:'OBSERVER_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased.ready)return {ok:false,code:leased.code};
    try{
      const result=await readIsolatedTab(leased,{identityOnly:true,monitoringRequest:request});
      if(!(await inspectOwnedAction(leased)).ready)return {ok:false,code:'MONITOR_GUARD_CHANGED'};
      return result||{ok:false,code:'MONITOR_UNAVAILABLE'};
    }catch{return {ok:false,code:'MONITOR_UNAVAILABLE'};}
    finally{await releaseConflictGuard(leased);}
  }

  // Only the fixed same-XPI supply function is permitted. A donor lease
  // encloses admission and page execution; the postcheck never transforms
  // an unknown remote outcome into a safe retry.
  async function runSupplyStep(personaUid,request) {
    const quarantine=admissionForI17Supply(request?.kind,request);
    if(!quarantine.ok)return quarantine;
    if(typeof supplyIsolatedTab!=='function')return {ok:false,code:'SUPPLY_EXECUTOR_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)
      return {ok:false,code:leased?.code||'GUARD_UNAVAILABLE'};
    try {
      const before=await inspectOwnedAction(leased);
      if(!before?.ready)return {ok:false,code:before?.code||'GUARD_CHANGED'};
      const packet=await supplyIsolatedTab(leased,request);
      const after=await inspectOwnedAction(leased);
      if(!after?.ready)return {ok:false,code:'POST_EFFECT_GUARD_CHANGED'};
      return packet&&typeof packet==='object'?packet:{ok:false,code:'SUPPLY_PACKET_UNVERIFIED'};
    }catch{return {ok:false,code:'SUPPLY_EXECUTOR_UNAVAILABLE'};}
    finally{await releaseConflictGuard(leased);}
  }

  // I09: never obtain a second browser or native control path. The same donor
  // lease registry owns editor selection; a lost response is ambiguous.
  async function runStageStep(personaUid,request) {
    if(typeof stageIsolatedTab!=='function')return {ok:false,code:'STAGE_EXECUTOR_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)
      return {ok:false,code:leased?.code||'GUARD_UNAVAILABLE'};
    try {
      if(!(await inspectOwnedAction(leased)).ready)return {ok:false,code:'LEASE_UNVERIFIED'};
      const reply=await stageIsolatedTab(leased,request);
      if(!(await inspectOwnedAction(leased)).ready)return {ok:false,code:'POST_EFFECT_GUARD_CHANGED'};
      return reply&&typeof reply==='object'?reply:{ok:false,code:'STAGING_RESULT_UNVERIFIED'};
    }catch{return {ok:false,code:'STAGING_EXECUTOR_UNAVAILABLE'};}
    finally{await releaseConflictGuard(leased);}
  }

  // S05 has no PCMS-tagged stage tab before its first local candidate pin.
  // Under the same donor conflict lease, positively observe that the target
  // has no browser editor tab. This is only a local-browser preflight, never
  // authority about remote devices or later native collaboration state.
  async function inspectSourceEditorIdle(personaUid,slug) {
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
       typeof inspectNoEditorTabs!=='function')
      return {ok:false,code:'S05_EDITOR_INSPECTOR_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)
      return {ok:false,code:leased?.code||'GUARD_UNAVAILABLE'};
    try{
      if(!(await inspectOwnedAction(leased)).ready)
        return {ok:false,code:'S05_ROUTE_CHANGED'};
      const check=await inspectNoEditorTabs(leased,{slug});
      if(!(await inspectOwnedAction(leased)).ready)
        return {ok:false,code:'S05_POST_INSPECTION_ROUTE_CHANGED'};
      return check?.ok===true&&check.noEditors===true?
        {ok:true,source:'GUARDED_NO_LOCAL_EDITOR',clean:true}:
        {ok:false,code:check?.code||'S05_EDITOR_CONFLICT_UNKNOWN'};
    }catch{return {ok:false,code:'S05_EDITOR_INSPECTION_UNAVAILABLE'};}
    finally{await releaseConflictGuard(leased);}
  }
  async function inspectStageEditor(personaUid,slug,nonce) {
    if(typeof inspectStageTab!=='function')return {ok:false,code:'EDITOR_PROBE_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)
      return {ok:false,code:leased?.code||'GUARD_UNAVAILABLE'};
    try{
      const before=await inspectOwnedAction(leased);
      if(!before?.ready)return {ok:false,code:'GUARD_CHANGED'};
      const proof=await inspectStageTab(leased,{slug,nonce});
      const after=await inspectOwnedAction(leased);
      if(!after?.ready)return {ok:false,code:'POST_READBACK_GUARD_CHANGED'};
      return proof?.ok===true&&proof.clean===true?
        {ok:true,source:'GUARDED_EDITOR_CLEAN',clean:true}:
        {ok:false,code:proof?.code||'EDITOR_UNKNOWN'};
    }catch{return {ok:false,code:'EDITOR_UNKNOWN'};}
    finally{await releaseConflictGuard(leased);}
  }

  // I10 native AI executes only through the existing donor control lease.
  // Return packets describe observations/attempts, not independent test PASS.
  async function runNativeAiStep(personaUid,request){
    if(typeof aiNativeStep!=='function')return {ok:false,code:'NATIVE_AI_NOT_WIRED'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)
      return {ok:false,code:leased?.code||'PROTECTED_ROUTE_UNVERIFIED'};
    try{
      if(!(await inspectOwnedAction(leased)).ready)return {ok:false,code:'AI_LEASE_INVALID'};
      const result=await aiNativeStep(leased,request);
      if(!(await inspectOwnedAction(leased)).ready)
        return {ok:false,code:'AI_POST_EFFECT_GUARD_UNVERIFIED'};
      return result&&typeof result==='object'?result:
        {ok:false,code:'NATIVE_AI_RESULT_UNVERIFIED'};
    }catch{return {ok:false,code:'NATIVE_AI_OUTCOME_UNKNOWN'};}
    finally{await releaseConflictGuard(leased);}
  }

  // I13 existing-source effects share the single donor lease registry.
  async function runExistingStep(personaUid,request){
    if(typeof existingIsolatedTab!=='function')
      return {ok:false,code:'EXISTING_EXECUTOR_UNAVAILABLE'};
    const lease=await acquireConflictGuard(personaUid);
    if(!lease?.ready||!lease.leaseId)
      return {ok:false,code:lease?.code||'PROTECTED_ROUTE_UNVERIFIED'};
    try{
      if(!(await inspectOwnedAction(lease)).ready)
        return {ok:false,code:'EXISTING_LEASE_REVOKED'};
      const result=await existingIsolatedTab(lease,request);
      if(!(await inspectOwnedAction(lease)).ready)
        return {ok:false,code:'EXISTING_POST_EFFECT_ROUTE_CHANGED'};
      return result&&typeof result==='object'?result:
        {ok:false,code:'EXISTING_EFFECT_UNVERIFIED'};
    }catch{return {ok:false,code:'EXISTING_EFFECT_UNVERIFIED'};}
    finally{await releaseConflictGuard(lease);}
  }

  // S07 is a fixed PUBLIC HTML-marker action. Reuse the existing I13
  // single-source-writer native adapter and the SAME donor conflict lease.
  // Never expose this as an arbitrary page/effect command.
  async function runRefresherStep(personaUid,request){
    if(request?.action!=='REFRESH'||typeof request.slug!=='string'||
       !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
       !/^[a-f0-9]{32}$/.test(request.nonce||'')||
       !/^[A-Za-z0-9_-]{16,64}$/.test(request.markerId||'')||
       !Array.isArray(request.previousFiles)||!Array.isArray(request.targetFiles))
      return {ok:false,code:'REFRESH_INVALID_FIXED_REQUEST'};
    return runExistingStep(personaUid,request);
  }

  // I13 effectful listing flip is a fixed donor-leased path. The caller must
  // commit DISPATCH_POSSIBLE before admission; protected route loss is held.
  async function runReleaseStep(personaUid,request){
    if(typeof releaseIsolatedTab!=='function')
      return {ok:false,code:'RELEASE_EXECUTOR_UNAVAILABLE'};
    const leased=await acquireConflictGuard(personaUid);
    if(!leased?.ready||!leased.leaseId)
      return {ok:false,code:leased?.code||'PROTECTED_ROUTE_UNVERIFIED'};
    try{
      if(!(await inspectOwnedAction(leased)).ready)
        return {ok:false,code:'RELEASE_LEASE_INVALID'};
      const result=await releaseIsolatedTab(leased,request);
      if(!(await inspectOwnedAction(leased)).ready)
        return {ok:false,code:'RELEASE_POST_EFFECT_GUARD_CHANGED'};
      return result&&typeof result==='object'?result:
        {ok:false,code:'RELEASE_OUTCOME_UNKNOWN'};
    }catch{return {ok:false,code:'RELEASE_OUTCOME_UNKNOWN'};}
    finally{await releaseConflictGuard(leased);}
  }

  async function releaseStagingTab(personaUid,slug,nonce) {
    if(typeof handoffStagingTab!=='function')return {ok:false,code:'HANDOFF_UNAVAILABLE'};
    // Release a HUMAN handoff regardless of stale protected route, but only
    // the exact already-tagged tab may be relinquished; never create/close.
    try{return await handoffStagingTab({personaUid,slug,nonce});}
    catch{return {ok:false,code:'HANDOFF_UNVERIFIED'};}
  }

  async function sampleNativeWitness() {
    if(typeof readRuntimeWitness!=='function')return {ok:false,code:'NATIVE_WITNESS_UNAVAILABLE'};
    try {
      const native=await readRuntimeWitness();
      return validateNativeWitness(native);
    } catch { return {ok:false,code:'NATIVE_WITNESS_UNAVAILABLE'}; }
  }

  return Object.freeze({
    sampleNativeWitness,
    enrollmentDonor: enrollmentDonor || null,
    observeReadOnly,
    observeMonitoring,
    runSupplyStep,
    runStageStep,
    runNativeAiStep,
    runReleaseStep,
    runExistingStep,
    runRefresherStep,
    inspectStageEditor,
    inspectSourceEditorIdle,
    releaseStagingTab,
    listAvailablePersonas,
    listProtectedRoutes: availableRoutes,
    createProtectedPersona,
    openHumanLogin: openLogin,
    resolveUid: inspect,
    getSafeRouteReadiness: inspect,
    acquireConflictGuard,
    inspectOwnedAction,
    releaseConflictGuard,
    // I01 deliberately has no side-effect dispatcher. I02 adds the durable
    // journal and I03+ attach target/owner authorization before any effect.
    runBoundedOwnedAction: async () => HOLD('CAPABILITY_OFF'),
    cancelOwnedAction: async () => HOLD('CAPABILITY_OFF'),
    offerHumanHandoff: async () => HOLD('CAPABILITY_OFF'),
    getHealth: () => Object.freeze({
      donorReady: securityState.ready === true,
      privacySafe: securityState.privacySafe === true,
      providerEffects: 'OFF',
      admission: 'PER_ACCOUNT_ROUTE_PIN'
    })
  });
}

export function attachPcmsGuard(deps) {
  if (installed) throw new Error('PCMS guard already attached');
  installed = createPersonaGuard(deps);
}
export function getPcmsGuardHealth() {
  return installed ? installed.getHealth() : {
    donorReady: false, privacySafe: false, providerEffects: 'OFF',
    admission: 'HELD_DONOR_BOOTSTRAP'
  };
}
export function internalPcmsGuard() { return installed; }
