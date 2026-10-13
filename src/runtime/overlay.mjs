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
    'import { installRoutingHandlers } from "./lib/routing-gate.js";\nimport { attachPcmsGuard } from "./pcms/persona-guard.mjs";\nimport { perchanceReadIsolated } from "./pcms/perchance-observer.mjs";\nimport { perchanceSupplyIsolated } from "./pcms/perchance-supply.mjs";',
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
  readIsolatedTab: async ({personaUid,cookieStoreId,routeId},{identityOnly=false,originalSlug=null}={}) => {
    // Donor-owned tab and protected-container selection. This is the SAME
    // combined-XPI browser authority, not a separate automation controller.
    const tabs=await browser.tabs.query({cookieStoreId});
    const matching=tabs.filter(tab=>tab.cookieStoreId===cookieStoreId &&
      typeof tab.url==='string' && (()=>{try{return new URL(tab.url).origin==='https://perchance.org';}catch{return false;}})());
    if(!matching.length)return {ok:false,code:'NO_PERCHANCE_TAB'};
    const tab=matching.find(item=>item.active)||matching[0];
    const current=await getState(),profile=current.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||!current.routes?.[routeId]||current.routes[routeId].enabled===false)
      return {ok:false,code:'PERSONA_ROUTE_CHANGED'};
    const results=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
      func:perchanceReadIsolated,args:[{identityOnly,originalSlug}]
    });
    const after=await browser.tabs.get(tab.id);
    if(after.cookieStoreId!==cookieStoreId ||
       !after.url?.startsWith('https://perchance.org/'))
      return {ok:false,code:'TAB_CONTEXT_CHANGED'};
    if(results?.length!==1||results[0].frameId!==0||results[0].error)
      return {ok:false,code:'ISOLATED_OBSERVER_FAILED'};
    return results[0].result;
  },
  supplyIsolatedTab: async ({personaUid,cookieStoreId,routeId},request) => {
    // Donor owns which Persona tab may perform this ONE fixed request.
    // No UI-controlled tab IDs, URL, world, script body or native calls.
    const before=await getState(),profile=before.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||before.routes?.[routeId]?.enabled===false)
      return {ok:false,code:'PERSONA_ROUTE_CHANGED'};
    const tabs=await browser.tabs.query({cookieStoreId});
    const matching=tabs.filter(t=>t.cookieStoreId===cookieStoreId&&
      typeof t.url==='string'&&(()=>{
        try{return new URL(t.url).origin==='https://perchance.org';}
        catch{return false;}
      })());
    if(!matching.length)return {ok:false,code:'NO_PERCHANCE_TAB'};
    const tab=matching.find(t=>t.active)||matching[0];
    const result=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
      func:perchanceSupplyIsolated,args:[request]
    });
    const after=await browser.tabs.get(tab.id),state=await getState();
    if(after.cookieStoreId!==cookieStoreId||
       !after.url?.startsWith('https://perchance.org/')||
       state.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       state.profiles?.[cookieStoreId]?.routeId!==routeId)
      return {ok:false,code:'POST_EFFECT_TAB_OR_ROUTE_CHANGED'};
    if(result?.length!==1||result[0].frameId!==0||result[0].error)
      return {ok:false,code:'SUPPLY_INJECTION_UNVERIFIED'};
    return result[0].result;
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
  for (const name of ['entry.mjs', 'wake.mjs', 'persona-guard.mjs', 'journal.mjs', 'command-boundary.mjs', 'notices.mjs', 'accounts.mjs', 'account-boundary.mjs', 'inventory.mjs', 'inventory-boundary.mjs', 'perchance-readback.mjs', 'perchance-observer.mjs', 'git-source.mjs', 'source-boundary.mjs', 'supply-plan.mjs', 'supply-store.mjs', 'perchance-supply.mjs', 'supply-git.mjs', 'supply-boundary.mjs', 'adoption.mjs', 'adoption-store.mjs', 'adoption-boundary.mjs']) {
    await cp(path.join(root, 'src/runtime', name), path.join(stage, 'pcms', name));
  }
}
