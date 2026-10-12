// This facade shares donor Management Integration's actual control-lease
// registry. Nothing here can execute a browser/native/provider mutation at I01.
let installed = null;
const HOLD = code => Object.freeze({ ready: false, code });
const BAD_PROXY = new Set(['controlled_by_other_extensions', 'not_controllable']);

export function createPersonaGuard({ initialize, securityState, shared, getRouteTest }) {
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

  return Object.freeze({
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
      admission: 'HELD_UNTIL_DURABLE_JOURNAL'
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
