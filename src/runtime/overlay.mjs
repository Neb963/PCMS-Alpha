import { readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

function substituteOnce(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error('I01 donor overlay anchor mismatch: ' + label);
  return source.replace(needle, replacement);
}

// Modify ONLY the build staging copy. All pinned donor blobs remain verifiable
// against the frozen donor commit, and every splice has an exact single anchor.
export async function applyI01Overlay(root, stage) {
  const mgPath = path.join(stage, 'lib/management-integration.js');
  const bgPath = path.join(stage, 'background.js');
  let mg = await readFile(mgPath, 'utf8');
  mg = substituteOnce(mg, '    listControlLeases,\n    withLocalMutationFence,', `    listControlLeases,
    // Private same-XPI facade on the EXISTING donor control-lease registry.
    // Never exposed in external Integration API command descriptors.
    pcmsGuard: Object.freeze({
      resolve: async (uid) => {
        const { profile, state } = await resolvePersona(uid);
        return {
          personaUid: profile.personaUid, cookieStoreId: profile.containerId,
          routeId: profile.routeId, route: state.routes?.[profile.routeId] || null,
          archived: Boolean(profile.archivedAt),
          rotating: Boolean(profile.rotationRole || profile.rotationOperationId)
        };
      },
      acquire: (uid) => acquireControlLease('pcms-same-xpi', {
        operationId: crypto.randomUUID(),
        params: { personaUid: uid, purpose: 'PCMS guarded admission', ttlMs: 15000 }
      }),
      validate: async (uid, leaseId) => {
        const lease = await requireOwnedLease('pcms-same-xpi', uid, leaseId);
        return { personaUid: lease.personaUid, cookieStoreId: lease.cookieStoreId };
      },
      release: (leaseId) => mutateControlLease('pcms-same-xpi', {
        command: 'persona.control.release', params: { leaseId }
      })
    }),
    withLocalMutationFence,`, 'shared donor lease');
  await writeFile(mgPath, mg);
  let bg = await readFile(bgPath, 'utf8');
  bg = substituteOnce(bg, 'import { installRoutingHandlers } from "./lib/routing-gate.js";',
    'import { installRoutingHandlers } from "./lib/routing-gate.js";\nimport { attachPcmsGuard } from "./pcms/persona-guard.mjs";',
    'donor background import');
  bg = substituteOnce(bg, '\nfunction localMutationFence(profileIds, operation, mode = "block", options = {}) {',
    `
attachPcmsGuard({
  initialize, securityState,
  shared: managementIntegration.pcmsGuard,
  // Donor's currentTest validates the route-test context and invalidates
  // stale/rotated/failed route evidence; it does not trigger a network probe.
  getRouteTest: async (containerId) => currentTest(await getState(), containerId),
  listPersonas: async () => {
    const state=await getState();
    return Object.values(state.profiles||{})
      .filter(p=>p?.managed && !p.rotationRole && p.personaUid)
      .map(p=>({
        personaUid:p.personaUid,name:p.name,archived:p.status==='archived',
        routeProtected:p.routeId!=='direct' && p.routeId!=='block' &&
          state.routes?.[p.routeId]?.enabled!==false && !!state.routes?.[p.routeId]
      }));
  },
  listProtectedRoutes: async () => {
    const state=await getState();
    return Object.values(state.routes||{}).filter(r=>r?.id &&
      r.id!=='direct' && r.id!=='block' && r.enabled!==false)
      .map(r=>({routeId:r.id,name:r.name||'Protected route'}));
  },
  createPersona: async ({name,routeId}) => {
    const state=await getState();
    if(!state.routes?.[routeId] || state.routes[routeId].enabled===false ||
        routeId==='direct'||routeId==='block')throw Error('PROTECTED_ROUTE_REQUIRED');
    // Delegate to the original PersonaMonkey local mutation fence.
    return localMutationFence([],()=>personaPlatform.create({
      name,routeId,allowDirect:false
    }));
  },
  openHumanLogin: async ({personaUid,cookieStoreId,routeId}) =>
    localMutationFence(cookieStoreId,async()=>{
      const state=await getState(), p=state.profiles?.[cookieStoreId];
      if(!p || p.personaUid!==personaUid || p.routeId!==routeId ||
          routeId==='direct'||routeId==='block'||state.routes?.[routeId]?.enabled===false)
        throw Error('PERSONA_ROUTE_CHANGED');
      return personaPlatform.open(cookieStoreId,'https://perchance.org/',true);
    })
});

function localMutationFence(profileIds, operation, mode = "block", options = {}) {`,
    'donor guard host');
  await writeFile(bgPath, bg);
  for (const name of ['entry.mjs', 'wake.mjs', 'persona-guard.mjs', 'journal.mjs', 'command-boundary.mjs', 'notices.mjs', 'accounts.mjs', 'account-boundary.mjs']) {
    await cp(path.join(root, 'src/runtime', name), path.join(stage, 'pcms', name));
  }
}
