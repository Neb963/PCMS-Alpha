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
    'import { installRoutingHandlers } from "./lib/routing-gate.js";\nimport { attachPcmsGuard } from "./pcms/persona-guard.mjs";\nimport { perchanceReadIsolated } from "./pcms/perchance-observer.mjs";\nimport { perchanceSupplyIsolated } from "./pcms/perchance-supply.mjs";\nimport { perchanceStageMain } from "./pcms/perchance-stage.mjs";\nimport { renderPcmsEditorStrip } from "./pcms/editor-strip.mjs";\nimport { perchanceEditorProbe } from "./pcms/perchance-editor-probe.mjs";\nimport { perchanceAiNative } from "./pcms/perchance-ai-native.mjs";\nimport { perchanceAiPreviewCheck } from "./pcms/perchance-ai-oracle.mjs";\nimport { perchanceAiOpfsProbe } from "./pcms/perchance-ai-opfs.mjs";\nimport { perchanceAiHistoryCredentials, perchanceAiHistoryIsolated } from "./pcms/perchance-ai-history.mjs";',
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

  // One donor-guarded, protected-container stage tab; never touch an
  // unrelated human editor or reuse a tab merely because its number matches.
  stageIsolatedTab: async ({personaUid,cookieStoreId,routeId},request) => {
    const valid=typeof request?.slug==='string'&&
      /^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)&&
      /^[a-f0-9]{32}$/.test(request.nonce)&&
      Array.isArray(request.candidate)&&request.candidate.length<=502;
    if(!valid)return {ok:false,code:'INVALID_STAGING_REQUEST'};
    const tagKey='pcmsI09Owned';
    const before=await getState(),profile=before.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||!before.routes?.[routeId]||
       before.routes[routeId].enabled===false)
      return {ok:false,code:'PERSONA_ROUTE_CHANGED'};
    const tabs=await browser.tabs.query({});
    const url='https://perchance.org/'+request.slug+'#edit';
    // A conflicting human/PCMS editor anywhere in this same container or
    // at this target is not safe to overwrite.
    if(tabs.some(t=>t?.url?.startsWith('https://perchance.org/'+request.slug)&&
        (t.cookieStoreId===cookieStoreId||t.url?.includes('#edit'))))
      return {ok:false,code:'HUMAN_OR_AMBIGUOUS_EDITOR'};
    const tab=await browser.tabs.create({url,cookieStoreId,active:false});
    if(!Number.isSafeInteger(tab?.id))return {ok:false,code:'TAB_CREATE_UNVERIFIED'};
    // An interruption before tagging leaves a HUMAN-PRESERVED unknown tab.
    await browser.sessions.setTabValue(tab.id,tagKey,{
      slug:request.slug,nonce:request.nonce,personaUid,cookieStoreId,
      createdBy:'PCMS_I09',humanIntent:false
    });
    const identity=await browser.sessions.getTabValue(tab.id,tagKey);
    const current=await browser.tabs.get(tab.id),again=await getState();
    if(identity?.nonce!==request.nonce||current?.cookieStoreId!==cookieStoreId||
       current?.url!==url||again.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       again.profiles?.[cookieStoreId]?.routeId!==routeId)
      return {ok:false,code:'TAB_CONTEXT_UNVERIFIED'};
    await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
      func:renderPcmsEditorStrip,args:[{
        slug:request.slug,nonce:request.nonce,
        accountId:'Verified account',personaUid
      }]
    });
    // Same-XPI fixed function; payload was byte-pinned in canonical IDB.
    // MAIN editor API is untrusted and must affirmatively prove safe/clean.
    const results=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceStageMain,
      args:[{slug:request.slug,files:request.candidate}]
    });
    const post=await browser.tabs.get(tab.id),receipt=await browser.sessions.getTabValue(tab.id,tagKey);
    const after=await getState();
    if(post?.url!==url||post.cookieStoreId!==cookieStoreId||
       receipt?.nonce!==request.nonce||receipt.humanIntent===true||
       after.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       after.profiles?.[cookieStoreId]?.routeId!==routeId)
      return {ok:false,code:'STAGING_TAB_OR_ROUTE_CHANGED'};
    if(results?.length!==1||results[0].frameId!==0||results[0].error||
       results[0].result?.ok!==true)
      return {ok:false,code:results?.[0]?.result?.code||'EDITOR_SAVE_UNKNOWN'};
    return {ok:true,code:'SAVE_ACK_ONLY',
      tab:{tabId:tab.id,cookieStoreId,ownershipNonce:request.nonce,location:url}};
  },
  // A current native editor clean/owner observation must accompany the
  // independent saved-byte readback before staged source is accepted.
  inspectStageTab: async ({personaUid,cookieStoreId,routeId},{slug,nonce}) => {
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
       typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce))
      return {ok:false,code:'INVALID_EDITOR_TARGET'};
    const expected='https://perchance.org/'+slug+'#edit';
    const tabs=await browser.tabs.query({cookieStoreId}),found=[];
    for(const t of tabs){
      if(t?.url!==expected||t.cookieStoreId!==cookieStoreId)continue;
      let tag;
      try{tag=await browser.sessions.getTabValue(t.id,'pcmsI09Owned');}catch{continue;}
      if(tag?.slug===slug&&tag.nonce===nonce&&tag.personaUid===personaUid&&
         tag.cookieStoreId===cookieStoreId&&tag.createdBy==='PCMS_I09')
        found.push(t);
    }
    if(found.length!==1)return {ok:false,code:'STAGING_TAB_OWNER_UNKNOWN'};
    const tab=found[0],before=await getState();
    if(before.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       before.profiles?.[cookieStoreId]?.routeId!==routeId)return {ok:false,code:'GUARD_CHANGED'};
    const out=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceEditorProbe,args:[slug]
    });
    const after=await browser.tabs.get(tab.id),tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');
    if(after.cookieStoreId!==cookieStoreId||after.url!==expected||
       tag?.nonce!==nonce||tag?.humanIntent===true)
      return {ok:false,code:'POST_EDITOR_CONTEXT_CHANGED'};
    if(out?.length!==1||out[0].frameId!==0||out[0].error)
      return {ok:false,code:'EDITOR_PROBE_FAILED'};
    return out[0].result;
  },
  // I10 fixed AI helper MAIN-world step. Exactly one I09-owned tab,
  // no arbitrary frame, URL, code, browser tab ID or human editor selection.
  aiNativeStep: async ({personaUid,cookieStoreId,routeId},request) => {
    if(typeof request?.slug!=='string'||
       !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
       typeof request?.nonce!=='string'||!/^[a-f0-9]{32}$/.test(request.nonce)||
       !['OBSERVE','SEND','NEW_CHAT','STOP','ORACLE_SMOKE','OBSERVE_OPFS','OBSERVE_HISTORY'].includes(request.action))
      return {ok:false,code:'AI_NATIVE_REQUEST_INVALID'};
    const expected='https://perchance.org/'+request.slug+'#edit';
    const state=await getState(),profile=state.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||(!state.routes?.[routeId]||state.routes[routeId].enabled===false))
      return {ok:false,code:'DONOR_PROTECTED_ROUTE_CHANGED'};
    const tabs=await browser.tabs.query({}),found=[];
    for(const tab of tabs){
      if(tab?.cookieStoreId!==cookieStoreId||tab.url!==expected)continue;
      let tag;
      try{tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');}catch{continue;}
      if(tag?.nonce===request.nonce&&tag.slug===request.slug&&
         tag.personaUid===personaUid&&tag.cookieStoreId===cookieStoreId&&
         tag.createdBy==='PCMS_I09'&&tag.humanIntent!==true)found.push(tab);
    }
    if(found.length!==1||tabs.some(t=>t.id!==found[0]?.id&&t.url===expected))
      return {ok:false,code:'AI_EDITOR_OWNERSHIP_AMBIGUOUS'};
    const tab=found[0];
    let result;
    if(request.action==='OBSERVE_HISTORY'){
      // Never trust MAIN-world fetch: the page can override it. MAIN is
      // used only to select the native current draft's ephemeral SID/key.
      // ISOLATED fetches/authenticates the real server and returns only
      // deidentified evidence. No transcript or secret enters PCMS state.
      const selector={slug:request.slug,nonce:request.nonce};
      const selected=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
        func:perchanceAiHistoryCredentials,args:[selector]
      });
      if(selected?.length!==1||selected[0].frameId!==0||
         selected[0].error||selected[0].result?.ok!==true)
        return {ok:false,code:selected?.[0]?.result?.code||'AI_HISTORY_CREDENTIALS_UNVERIFIED'};
      const handle=selected[0].result;
      if(typeof request.firstPrompt!=='string'||request.firstPrompt.length<1||
         request.firstPrompt.length>16000||
         !/^[a-f0-9]{64}$/.test(handle.sessionDigest||''))
        return {ok:false,code:'AI_HISTORY_CONTEXT_UNVERIFIED'};
      result=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
        func:perchanceAiHistoryIsolated,
        args:[{...selector,firstPrompt:request.firstPrompt,
          sessionId:handle.sessionId,routingKey:handle.routingKey,
          sessionDigest:handle.sessionDigest}]
      });
      const reselected=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
        func:perchanceAiHistoryCredentials,args:[selector]
      });
      const now=reselected?.[0]?.result;
      if(reselected?.length!==1||reselected[0].frameId!==0||
         reselected[0].error||!now?.ok||
         now.sessionId!==handle.sessionId||
         now.routingKey!==handle.routingKey||
         now.sessionDigest!==handle.sessionDigest)
        return {ok:false,code:'AI_HISTORY_CONTEXT_CHANGED'};
    }else{
      result=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},
        world:request.action==='ORACLE_SMOKE'?'ISOLATED':'MAIN',
        func:request.action==='ORACLE_SMOKE'?perchanceAiPreviewCheck:\n          request.action==='OBSERVE_OPFS'?perchanceAiOpfsProbe:perchanceAiNative,
        args:request.action==='ORACLE_SMOKE'?[request.slug,request.name]:[request]
      });
    }
    const after=await browser.tabs.get(tab.id);
    const tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');
    const again=await getState();
    if(after?.cookieStoreId!==cookieStoreId||after?.url!==expected||
       tag?.nonce!==request.nonce||tag?.humanIntent===true||
       again.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       again.profiles?.[cookieStoreId]?.routeId!==routeId||
       (!again.routes?.[routeId]||again.routes[routeId].enabled===false))
      return {ok:false,code:'AI_NATIVE_POST_GUARD_CHANGED'};
    if(result?.length!==1||result[0].frameId!==0||result[0].error)
      return {ok:false,code:'AI_NATIVE_EXECUTION_UNVERIFIED'};
    return result[0].result;
  },
  // A human handoff never closes/navigates a tab, and never releases donor
  // automation ownership or any unmatched/recycled tab.
  handoffStagingTab: async ({personaUid,slug,nonce}) => {
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
       typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce))
      return {ok:false,code:'HANDOFF_IDENTITY_INVALID'};
    const tabs=await browser.tabs.query({}),found=[];
    for(const t of tabs){
      if(!Number.isSafeInteger(t?.id))continue;
      let value;
      try{value=await browser.sessions.getTabValue(t.id,'pcmsI09Owned');}catch{continue;}
      if(value?.nonce===nonce&&value.slug===slug&&value.personaUid===personaUid)
        found.push({tab:t,tag:value});
    }
    if(found.length!==1||found[0].tab.url!=='https://perchance.org/'+slug+'#edit')
      return {ok:false,code:'HANDOFF_TAB_UNVERIFIED'};
    await browser.sessions.removeTabValue(found[0].tab.id,'pcmsI09Owned');
    return {ok:true,code:'HUMAN_TAB_RETAINED'};
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
  for (const name of ['entry.mjs', 'wake.mjs', 'persona-guard.mjs', 'journal.mjs', 'command-boundary.mjs', 'notices.mjs', 'accounts.mjs', 'account-boundary.mjs', 'inventory.mjs', 'inventory-boundary.mjs', 'perchance-readback.mjs', 'perchance-observer.mjs', 'git-source.mjs', 'source-boundary.mjs', 'supply-plan.mjs', 'supply-store.mjs', 'perchance-supply.mjs', 'supply-git.mjs', 'supply-boundary.mjs', 'adoption.mjs', 'adoption-store.mjs', 'adoption-git.mjs', 'adoption-boundary.mjs',
    'staging-core.mjs','staging-store.mjs','staging-boundary.mjs',
    'perchance-stage.mjs','editor-strip.mjs','perchance-editor-probe.mjs','perchance-ai-native.mjs','perchance-ai-oracle.mjs','perchance-ai-opfs.mjs','perchance-ai-history.mjs','ai-supervisor.mjs','ai-testing.mjs','ai-evidence.mjs','ai-store.mjs','ai-boundary.mjs',
    'git-writeback.mjs','writeback-store.mjs','writeback-boundary.mjs']) {
    await cp(path.join(root, 'src/runtime', name), path.join(stage, 'pcms', name));
  }
}
