// This facade shares donor Management Integration's actual control-lease
// registry. Nothing here can execute a browser/native/provider mutation at I01.
let installed = null;
const HOLD = code => Object.freeze({ ready: false, code });
const BAD_PROXY = new Set(['controlled_by_other_extensions', 'not_controllable']);

export function createPersonaGuard({ initialize, securityState, shared, getRouteTest,
  listPersonas, listProtectedRoutes, createPersona, openHumanLogin }) {
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
      // A configured proxy is not evidence of a working protected route.
      // This is the donor's context-fenced cached test, never a new network probe.
      const evidence = await getRouteTest(current.cookieStoreId);
      if (evidence?.ok !== true) return HOLD('PROTECTED_ROUTE_UNVERIFIED');
      return Object.freeze({
        ready: true, code: 'GUARD_READY',
        personaUid: current.personaUid, cookieStoreId: current.cookieStoreId,
        routeId: current.routeId
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

  return Object.freeze({
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
      admission: 'HELD_UNTIL_OWNER_VERIFICATION'
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
