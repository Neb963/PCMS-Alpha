import { readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';

// S01 donor-side route pin gate and private enrollment adapter, spliced into
// the BUILD COPY of donor background.js. Reuses donor route tests, Persona
// platform, route assignment and mutation fence; no new router.
const PCMS_ROUTE_GATE = String.raw`function isPcmsProviderUrl(raw) {
  try {
    const host=new URL(raw).hostname.toLowerCase();
    return host==='perchance.org'||host.endsWith('.perchance.org');
  } catch { return false; }
}
// Tagged Personas wait (bounded) for the committed pin table, then decide
// synchronously. Untagged Personas never wait on PCMS storage.
async function pcmsRouteGate(profile) {
  if(typeof profile?.pcmsBindingId!=='string'||!profile.pcmsBindingId)return {managed:false,allow:true};
  await routePinsReady(2000);
  return inspectRoutePin(profile);
}
void reloadRoutePins();
const PCMS_RELAY_NET=/^10\.124\.(25[0-5]|2[0-4]\d|1?\d?\d)\.(25[0-5]|2[0-4]\d|1?\d?\d)$/;
function pcmsBoundProfile(state,bindingId){
  const found=Object.values(state.profiles||{}).filter(p=>p?.pcmsBindingId===bindingId);
  return found.length===1?found[0]:(found.length?false:null);
}
// Host-wide native/tunnel loss is never route-specific failure evidence and
// never authorizes rotating to another exit.
function pcmsFailure(code,scope){return {ok:false,code,failure:scope};}
async function pcmsDnsProtected(isolationId,effective){
  const servers=[],used=new Set();
  for(let i=0;i<3;i++){
    let target;
    do { target='https://'+crypto.randomUUID()+'.dnsleak.am.i.mullvad.net/'; }
    while(used.has(target)||routeTestRequests.has(target));
    used.add(target);
    const body=await fetchJsonThroughRouteTest(isolationId,effective,target,15000);
    if(Array.isArray(body))servers.push(...body);
    else if(body&&typeof body==='object')servers.push(body);
  }
  return servers.length>0&&servers.every(s=>s?.mullvad_dns===true);
}
// Positive relay-side statement only: the SOCKS relay itself reports the
// IPv6 network unreachable (RFC 1928 reply 3) or address type unsupported (8).
async function pcmsIpv6Blocking(route){
  const blocked={state:'BLOCKED_VERIFIED',basis:'RELAY_REPORTED_IPV6_UNREACHABLE'};
  const positive=text=>/SOCKS connect failed with code (3|8)\b/.test(String(text||''));
  try{
    const out=await pcmsFetchViaExit(route,{url:PCMS_IPV6_CHECK_URL,method:'GET',headers:{},
      max_redirects:0,timeout_seconds:10,
      network_policy:{block_local_network:true,domain_mode:'allowlist',
        allowed_domains:['ipv6.am.i.mullvad.net'],blocked_domains:[]},
      connect_policy:{page_url:PCMS_IPV6_CHECK_URL,rules:[]}},20000);
    return out?.ok===false&&positive(out.error)?blocked:{state:'UNKNOWN'};
  }catch(error){return positive(error?.message||error)?blocked:{state:'UNKNOWN'};}
}
// Cookie-free fixed Mullvad echo probes through the donor's existing
// route-test override. A candidate is probed unassigned; an assigned Persona
// is probed through the donor's own testProfile (which also caches the
// donor route evidence used by every guarded PCMS effect).
async function pcmsProbeExits({routeId,profileId=null}){
  await initialize();
  const before=await getState(),route=before.routes?.[routeId];
  if(!route||route.enabled===false||route.provider!=='mullvad')return pcmsFailure('MULLVAD_ROUTE_REQUIRED','ROUTE');
  if(securityState.ready!==true||securityState.privacySafe!==true)return pcmsFailure('DONOR_SECURITY_UNAVAILABLE','HOST');
  if(profileId){
    const p=before.profiles?.[profileId];
    if(!p?.pcmsBindingId||p.routeId!==routeId)return pcmsFailure('ASSIGNED_ROUTE_CHANGED','ROUTE');
  }
  const effective=await mullvadRuntime.resolve(route);
  if(!effective)return pcmsFailure('MULLVAD_LOCAL_SERVICE_UNAVAILABLE','HOST');
  const isolationId=profileId||('pcms-probe-'+routeId);
  let v4;
  try{
    if(profileId){
      const tested=await testProfile(profileId);
      if(tested?.ok!==true)return pcmsFailure(tested?.dns?.leaking===true?'DNS_LEAK_DETECTED':'ROUTE_CONNECTION_FAILED','ROUTE');
      v4=tested.data;
    }else{
      v4=await fetchJsonThroughRouteTest(isolationId,effective,MULLVAD_IPV4_CHECK_URL,15000);
      if(!(await pcmsDnsProtected(isolationId,effective)))return pcmsFailure('DNS_LEAK_DETECTED','ROUTE');
    }
  }catch{return pcmsFailure('ROUTE_CONNECTION_FAILED','ROUTE');}
  if(v4?.mullvad_exit_ip!==true||typeof v4.ip!=='string')return pcmsFailure('NOT_A_MULLVAD_EXIT','ROUTE');
  let ipv6;
  try{
    const d=await fetchJsonThroughRouteTest(isolationId,effective,PCMS_IPV6_CHECK_URL,15000);
    ipv6=d?.mullvad_exit_ip===true&&typeof d.ip==='string'&&d.ip.includes(':')?
      {state:'OBSERVED',address:d.ip}:{state:'UNKNOWN'};
  }catch{ipv6=await pcmsIpv6Blocking(route);}
  const after=await getState();
  if(JSON.stringify(after.routes?.[routeId])!==JSON.stringify(route)||
     (profileId&&after.profiles?.[profileId]?.routeId!==routeId))
    return pcmsFailure('ROUTE_CHANGED_DURING_PROBE','ROUTE');
  return {ok:true,source:'DONOR_ROUTE_PROBE',evidenceId:'evidence_'+crypto.randomUUID().replaceAll('-',''),
    routeId,ipv4:{state:'OBSERVED',address:v4.ip},ipv6,dns:'VERIFIED_PROTECTED',observedAtMs:Date.now()};
}
// Private same-XPI donor operations for PCMS Add Account / route repair.
// Every mutation goes through the donor's own mutation fence and is
// reconcilable by reading donor state; nothing here accepts a raw endpoint.
function createPcmsEnrollmentDonor(){
  return Object.freeze({
    async boundPersona({bindingId}){
      await initialize();
      const p=pcmsBoundProfile(await getState(),bindingId);
      if(p===false)return {ok:false,code:'BINDING_PERSONA_AMBIGUOUS'};
      return p?{ok:true,personaUid:p.personaUid,contextId:p.containerId,routeId:p.routeId}:{ok:false,code:'BINDING_PERSONA_ABSENT'};
    },
    async createBoundPersona({bindingId,name}){
      await initialize();
      const prior=pcmsBoundProfile(await getState(),bindingId);
      if(prior===false)return {ok:false,code:'BINDING_PERSONA_AMBIGUOUS'};
      if(!prior){
        const permit=issueBoundPersonaCreatePermit({bindingId});
        try{
          await localMutationFence([],()=>personaPlatform.create({name,routeId:BLOCK_ROUTE_ID,allowDirect:false,
            profile:{killSwitch:true,blockLocalNetwork:true,pcmsBindingId:bindingId}},{pcmsStagePermit:permit}));
        }catch{}
      }
      const made=pcmsBoundProfile(await getState(),bindingId);
      return made?{ok:true,personaUid:made.personaUid,contextId:made.containerId,routeId:made.routeId,existing:!!prior}:
        {ok:false,code:made===false?'BINDING_PERSONA_AMBIGUOUS':'PERSONA_CREATE_UNCONFIRMED'};
    },
    async candidateRoutes({bindingId,excludeRouteIds=[],preferRouteIds=[]}={}){
      await initialize();
      const state=await getState(),exclude=new Set(excludeRouteIds);
      const used=new Set(Object.values(state.profiles||{})
        .filter(p=>p?.pcmsBindingId!==bindingId).map(p=>p?.routeId));
      const usable=Object.values(state.routes||{}).filter(r=>r?.provider==='mullvad'&&
        r.enabled!==false&&PCMS_RELAY_NET.test(String(r.host))&&Number(r.port)===1080&&
        !used.has(r.id)&&!exclude.has(r.id));
      // Tagged Personas of OTHER bindings: a missing PCMS ledger must not be
      // mistaken for an empty exit history while they exist.
      const taggedBindings=Object.values(state.profiles||{})
        .map(p=>p?.pcmsBindingId).filter(id=>id&&id!==bindingId).slice(0,1000);
      const own=Object.values(state.profiles||{}).find(p=>p?.pcmsBindingId===bindingId)?.routeId;
      const rank=r=>r.id===own?0:preferRouteIds.includes(r.id)?1:2;
      usable.sort((a,b)=>rank(a)-rank(b));
      let relays=[],relayList='AVAILABLE';
      try{relays=await fetchMullvadRelays();}catch{relayList='UNAVAILABLE';}
      const hosts=new Set(Object.values(state.routes||{}).map(r=>String(r?.host)+':'+Number(r?.port||0)));
      relays=relays.filter(r=>PCMS_RELAY_NET.test(r.ipv4_address)&&Number(r.port)===1080&&
        !hosts.has(r.ipv4_address+':1080'));
      for(let i=relays.length-1;i>0;i--){
        const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);
        [relays[i],relays[j]]=[relays[j],relays[i]];
      }
      return {ok:true,relayList,taggedBindings,candidates:[
        ...usable.slice(0,8).map(r=>({kind:'ROUTE',routeId:r.id})),
        ...relays.slice(0,8).map(r=>({kind:'RELAY',relay:{hostname:r.hostname,ipv4_address:r.ipv4_address,
          port:1080,country:r.country,city:r.city}}))]};
    },
    // Adds one Mullvad relay route. The donor security preview must contain
    // exactly that one new Mullvad SOCKS destination; anything else is refused.
    async ensureRoute(candidate){
      await initialize();
      const state=await getState();
      if(candidate?.kind==='ROUTE'){
        const r=state.routes?.[candidate.routeId];
        return r?.provider==='mullvad'&&r.enabled!==false&&PCMS_RELAY_NET.test(String(r.host))&&
          Number(r.port)===1080?{ok:true,routeId:r.id}:{ok:false,code:'ROUTE_UNAVAILABLE'};
      }
      const relay=candidate?.relay;
      if(candidate?.kind!=='RELAY'||!PCMS_RELAY_NET.test(relay?.ipv4_address||'')||Number(relay.port)!==1080)
        return {ok:false,code:'RELAY_INVALID'};
      const existing=Object.values(state.routes||{}).find(r=>r?.provider==='mullvad'&&
        r.host===relay.ipv4_address&&Number(r.port)===1080&&r.enabled!==false);
      if(existing)return {ok:true,routeId:existing.id,existing:true};
      try{
        const preview=await createMullvadRoute(relay,null);
        const d=preview?.delta;
        if(!Array.isArray(d)||d.length!==1||d[0].kind!=='proxy-destination-added'||
           d[0].after?.scheme!=='socks'||d[0].after?.host!==relay.ipv4_address||d[0].after?.port!==1080)
          return {ok:false,code:'ROUTE_PREVIEW_UNEXPECTED'};
        await stateManager.authorizePreview(preview.previewId,d);
        await localMutationFence(allPersonaUids,()=>createMullvadRoute(relay,preview.previewId));
      }catch{}
      const made=Object.values((await getState()).routes||{}).find(r=>r?.provider==='mullvad'&&
        r.host===relay.ipv4_address&&Number(r.port)===1080);
      return made?{ok:true,routeId:made.id}:{ok:false,code:'ROUTE_CREATE_UNCONFIRMED'};
    },
    probeCandidate:({routeId})=>pcmsProbeExits({routeId}),
    probeAssigned:async({bindingId,contextId,routeId})=>{
      const p=(await getState()).profiles?.[contextId];
      if(p?.pcmsBindingId!==bindingId)return pcmsFailure('BINDING_PERSONA_CHANGED','ROUTE');
      return pcmsProbeExits({routeId,profileId:contextId});
    },
    async assignRoute({bindingId,personaUid,contextId,routeId}){
      await initialize();
      const p=(await getState()).profiles?.[contextId];
      if(p?.pcmsBindingId!==bindingId||p.personaUid!==personaUid)return {ok:false,code:'BINDING_PERSONA_CHANGED'};
      if(p.routeId!==routeId){
        try{await localMutationFence(contextId,()=>personaPlatform.assignRoute(contextId,routeId,{allowDirect:false}));}
        catch{}
      }
      const after=(await getState()).profiles?.[contextId];
      return after?.routeId===routeId&&after.pcmsBindingId===bindingId?{ok:true}:{ok:false,code:'ROUTE_ASSIGN_UNCONFIRMED'};
    },
    // Legacy account upgrade: tag the account's EXISTING Persona in place.
    // Its route, container, cookies and session are untouched; tagging only
    // makes its traffic depend on a PCMS pin (fail closed until pinned).
    async tagExistingPersona({bindingId,personaUid}){
      await initialize();
      const state=await getState();
      const prior=pcmsBoundProfile(state,bindingId);
      if(prior===false)return {ok:false,code:'BINDING_PERSONA_AMBIGUOUS'};
      if(prior)return String(prior.personaUid).toLowerCase()===String(personaUid).toLowerCase()?
        {ok:true,personaUid:prior.personaUid,contextId:prior.containerId,routeId:prior.routeId,existing:true}:
        {ok:false,code:'BINDING_PERSONA_CONFLICT'};
      const found=pcmsProfileByUid(state,personaUid);
      if(found.code)return {ok:false,code:found.code};
      const p=found.profile;
      if(p.pcmsBindingId)return {ok:false,code:'PERSONA_BOUND_TO_OTHER_ACCOUNT'};
      if(p.status==='archived'||p.rotationRole||p.rotationOperationId)return {ok:false,code:'PERSONA_NOT_ACTIVE'};
      const permit=issueExistingPersonaTagPermit({bindingId,contextId:p.containerId,personaUid:p.personaUid});
      try{
        await localMutationFence(p.containerId,()=>stateManager.mutate(draft=>{
          const item=draft.profiles?.[p.containerId];
          if(!item||item.pcmsBindingId||item.personaUid!==p.personaUid)throw Error('PERSONA_CHANGED');
          item.pcmsBindingId=bindingId;
        },{pcmsStagePermit:permit}));
      }catch{}
      const made=pcmsBoundProfile(await getState(),bindingId);
      return made?{ok:true,personaUid:made.personaUid,contextId:made.containerId,routeId:made.routeId}:
        {ok:false,code:made===false?'BINDING_PERSONA_AMBIGUOUS':'PERSONA_TAG_UNCONFIRMED'};
    },
    // Observation only: is this account's own route resource in use?
    async inspectRouteUse({personaUid}){
      await initialize();
      const state=await getState(),found=pcmsProfileByUid(state,personaUid);
      if(found.code)return {ok:false,code:found.code};
      const p=found.profile,route=state.routes?.[p.routeId];
      // In use: any tab in the container, a running donor job, or ANY donor
      // control lease (in-flight PCMS or external work) on this Persona.
      const tabs=await browser.tabs.query({cookieStoreId:p.containerId});
      const jobs=await listActiveProfileIds();
      const leases=await managementIntegration.listControlLeases();
      const inUse=tabs.length>0||jobs.includes(p.containerId)||leases.some(l=>
        String(l?.personaUid||'').toLowerCase()===String(p.personaUid).toLowerCase());
      if(!route||route.provider!=='mullvad')
        return {ok:true,releasable:false,reason:'NO_ROUTE_RESOURCE',routeId:p.routeId,inUse};
      if(Object.values(state.profiles||{}).some(o=>o!==p&&o?.routeId===p.routeId))
        return {ok:true,releasable:false,reason:'RESOURCE_SHARED',routeId:p.routeId,inUse};
      if(inUse)return {ok:true,releasable:false,reason:'RESOURCE_IN_USE',routeId:p.routeId,inUse};
      return {ok:true,releasable:true,routeId:p.routeId,contextId:p.containerId,inUse};
    },
    // Release ONLY this Persona's own idle Mullvad forwarder. The donor
    // mutation fence refuses while any control lease exists; tabs, jobs and
    // sharing are re-checked inside it. The global tunnel is never stopped.
    async releaseIdleRoute({personaUid,routeId}){
      await initialize();
      const state=await getState(),found=pcmsProfileByUid(state,personaUid);
      if(found.code)return {ok:false,code:found.code};
      const p=found.profile;
      if(p.routeId!==routeId)return {ok:false,code:'ROUTE_CHANGED'};
      try{
        return await localMutationFence(p.containerId,async()=>{
          const now=await getState();
          if(now.profiles?.[p.containerId]?.routeId!==routeId)return {ok:false,code:'ROUTE_CHANGED'};
          if(Object.values(now.profiles||{}).some(o=>o?.containerId!==p.containerId&&o?.routeId===routeId))
            return {ok:false,code:'RESOURCE_SHARED'};
          if((await browser.tabs.query({cookieStoreId:p.containerId})).length||
             (await listActiveProfileIds()).includes(p.containerId))return {ok:false,code:'RESOURCE_IN_USE'};
          mullvadRuntime.drop(routeId);
          try{const out=await releaseExit(routeId);
            return {ok:true,released:out?.released===true};}
          catch{return {ok:false,code:'RELEASE_UNCONFIRMED'};}
        });
      }catch{return {ok:false,code:'RESOURCE_IN_USE'};}
    },
    // Read-only native inventory: is a forwarder for this route still live?
    async observeRouteReleased({routeId}){
      const status=await getNativeStatus();
      if(status?.installed!==true||!Array.isArray(status.active_exits))return {ok:false,code:'NATIVE_UNAVAILABLE'};
      return {ok:true,released:!status.active_exits.some(e=>e?.route_id===routeId)};
    },
    reloadPins:()=>reloadRoutePins()
  });
}
function pcmsProfileByUid(state,personaUid){
  const uid=String(personaUid||'').toLowerCase();
  const found=Object.values(state.profiles||{}).filter(p=>p?.managed&&
    String(p.personaUid||'').toLowerCase()===uid);
  // A Persona mid-rotation exists: never report it missing (that would
  // offer a replacement while the original and its session still exist).
  if(found.some(p=>p.rotationRole||p.rotationOperationId))return {code:'PERSONA_NOT_ACTIVE'};
  if(found.length!==1)return {code:found.length?'PERSONA_AMBIGUOUS':'PERSONA_NOT_FOUND'};
  return {profile:found[0]};
}
`;

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
          routeId: profile.routeId, pcmsBindingId: profile.pcmsBindingId || null, route: state.routes?.[profile.routeId] || null,
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
    'import { installRoutingHandlers } from "./lib/routing-gate.js";\nimport { inspectRoutePin, routePinsReady, reloadRoutePins } from "./pcms/route-pin.mjs";\nimport { issueBoundPersonaCreatePermit, issueExistingPersonaTagPermit } from "./pcms/pcms-donor-fence.mjs";\nimport { nativeRequest, fetchViaExit as pcmsFetchViaExit } from "./lib/mullvad-native.js";\nimport { attachPcmsGuard } from "./pcms/persona-guard.mjs";\nimport { attachPcmsBackupDonor } from "./pcms/backup-auto-donor.mjs";\nimport { attachPcmsRestoreDonor } from "./pcms/restore-donor.mjs";\nimport { buildImportedState } from "./lib/backup-import.js";\nimport { perchanceReadIsolated } from "./pcms/perchance-observer.mjs";\nimport { perchanceReleaseMain } from "./pcms/perchance-release.mjs";\nimport { perchanceExistingMain } from "./pcms/perchance-existing.mjs";\nimport { perchanceMonitorIsolated } from "./pcms/perchance-monitor.mjs";\nimport { perchanceSupplyIsolated } from "./pcms/perchance-supply.mjs";\nimport { perchanceStageMain } from "./pcms/perchance-stage.mjs";\nimport { renderPcmsEditorStrip } from "./pcms/editor-strip.mjs";\nimport { perchanceEditorProbe } from "./pcms/perchance-editor-probe.mjs";\nimport { perchanceAiNative } from "./pcms/perchance-ai-native.mjs";\nimport { perchanceAiPreviewCheck } from "./pcms/perchance-ai-oracle.mjs";\nimport { perchanceAiOpfsProbe } from "./pcms/perchance-ai-opfs.mjs";\nimport { perchanceAiHistoryCredentials, perchanceAiHistoryIsolated, perchanceAiTerminalHistoryIsolated } from "./pcms/perchance-ai-history.mjs";',
    'donor background import');
  bg = substituteOnce(bg, '\nfunction localMutationFence(profileIds, operation, mode = "block", options = {}) {',
    `
attachPcmsGuard({
  initialize, securityState,
  shared: managementIntegration.pcmsGuard,
  // Donor's currentTest validates the route-test context and invalidates
  // stale/rotated/failed route evidence; it does not trigger a network probe.
  getRouteTest: async (containerId) => currentTest(await getState(), containerId),
  enrollmentDonor: createPcmsEnrollmentDonor(),
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
  readIsolatedTab: async ({personaUid,cookieStoreId,routeId},{identityOnly=false,originalSlug=null,monitoringRequest=null}={}) => {
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
    let results;
    if(monitoringRequest){
      const identity=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
        func:perchanceReadIsolated,args:[{identityOnly:true}]
      });
      if(identity?.length!==1||identity[0].frameId!==0||identity[0].error||
         !identity[0].result?.ok)return {ok:false,code:'MONITOR_SESSION_UNVERIFIED'};
      results=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
        func:perchanceMonitorIsolated,args:[monitoringRequest]
      });
      const recheck=await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
        func:perchanceReadIsolated,args:[{identityOnly:true}]
      });
      if(recheck?.length!==1||recheck[0].frameId!==0||recheck[0].error||
         !recheck[0].result?.ok||recheck[0].result.principalFingerprint!==
         identity[0].result.principalFingerprint)return {ok:false,code:'MONITOR_SESSION_CHANGED'};
      if(results?.length===1&&results[0].result)
        results[0].result={...results[0].result,
          principalFingerprint:identity[0].result.principalFingerprint};
    }else results=await browser.scripting.executeScript({
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
         tag.cookieStoreId===cookieStoreId&&['PCMS_I09','PCMS_I13'].includes(tag.createdBy))
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
       !['OBSERVE','SEND','NEW_CHAT','STOP','ORACLE_SMOKE','OBSERVE_OPFS','OBSERVE_HISTORY','OBSERVE_TERMINAL'].includes(request.action))
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
         ['PCMS_I09','PCMS_I13'].includes(tag.createdBy)&&tag.humanIntent!==true)found.push(tab);
    }
    if(found.length!==1||tabs.some(t=>t.id!==found[0]?.id&&t.url===expected))
      return {ok:false,code:'AI_EDITOR_OWNERSHIP_AMBIGUOUS'};
    const tab=found[0];
    let result;
    if(request.action==='OBSERVE_HISTORY'||request.action==='OBSERVE_TERMINAL'){
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
        func:request.action==='OBSERVE_TERMINAL'?
          perchanceAiTerminalHistoryIsolated:perchanceAiHistoryIsolated,
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
  // I13 unlist creates exactly one owned tab. Subsequent update/restore
  // requires that exact tagged tab; missing or ambiguous state never opens
  // another or acquires human-owned editor authority.
  existingIsolatedTab: async ({personaUid,cookieStoreId,routeId},request)=>{
    if(!['UNLIST','STAGE','RESTORE'].includes(request?.action)||
       typeof request.slug!=='string'||
       !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
       typeof request.nonce!=='string'||!/^[a-f0-9]{32}$/.test(request.nonce)||
       !Array.isArray(request.previousFiles)||request.previousFiles.length<2||
       request.previousFiles.length>502||
       (request.action!=='UNLIST'&&(!Array.isArray(request.targetFiles)||
         request.targetFiles.length<2||request.targetFiles.length>502)))
      return {ok:false,code:'INVALID_EXISTING_REQUEST'};
    const before=await getState(),profile=before.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||!before.routes?.[routeId]||
       before.routes[routeId].enabled===false)
      return {ok:false,code:'EXISTING_PROTECTED_ROUTE_CHANGED'};
    const url='https://perchance.org/'+request.slug+'#edit',tabs=await browser.tabs.query({});
    let tab;
    if(request.action==='UNLIST'){
      if(tabs.some(t=>t?.url?.startsWith('https://perchance.org/'+request.slug)&&
        (t.cookieStoreId===cookieStoreId||t.url?.includes('#edit'))))
        return {ok:false,code:'HUMAN_OR_AMBIGUOUS_EDITOR'};
      tab=await browser.tabs.create({url,cookieStoreId,active:false});
      if(!Number.isSafeInteger(tab?.id))return {ok:false,code:'EXISTING_TAB_CREATE_UNKNOWN'};
      // Crash before session tag is ambiguous; tab is preserved for human.
      await browser.sessions.setTabValue(tab.id,'pcmsI09Owned',{
        slug:request.slug,nonce:request.nonce,personaUid,cookieStoreId,
        createdBy:'PCMS_I13',humanIntent:false
      });
      const matched=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');
      if(matched?.nonce!==request.nonce)
        return {ok:false,code:'EXISTING_TAB_TAG_UNVERIFIED'};
      await browser.scripting.executeScript({
        target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
        func:renderPcmsEditorStrip,args:[{
          slug:request.slug,nonce:request.nonce,
          accountId:'Verified account',personaUid
        }]
      });
    }else{
      const matching=[];
      for(const t of tabs) {
        if(t.cookieStoreId!==cookieStoreId||t.url!==url)continue;
        let tag;try{tag=await browser.sessions.getTabValue(t.id,'pcmsI09Owned');}
        catch{continue;}
        if(tag?.slug===request.slug&&tag.nonce===request.nonce&&
           tag.personaUid===personaUid&&tag.cookieStoreId===cookieStoreId&&
           tag.createdBy==='PCMS_I13'&&tag.humanIntent!==true)matching.push(t);
      }
      if(matching.length!==1||tabs.some(t=>t.id!==matching[0]?.id&&t.url===url))
        return {ok:false,code:'EXISTING_EDITOR_NOT_EXCLUSIVELY_OWNED'};
      tab=matching[0];
    }
    const selected=await browser.tabs.get(tab.id);
    const tagged=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');
    if(selected.url!==url||selected.cookieStoreId!==cookieStoreId||
       tagged?.nonce!==request.nonce||tagged?.createdBy!=='PCMS_I13'||
       tagged?.humanIntent===true)
      return {ok:false,code:'EXISTING_TAB_CONTEXT_CHANGED'};
    const result=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceExistingMain,args:[request]
    });
    const after=await browser.tabs.get(tab.id),
      tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned'),
      last=await getState();
    if(after.cookieStoreId!==cookieStoreId||after.url!==url||
       tag?.nonce!==request.nonce||tag?.humanIntent===true||
       last.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       last.profiles?.[cookieStoreId]?.routeId!==routeId||
       !last.routes?.[routeId]||last.routes[routeId].enabled===false)
      return {ok:false,code:'EXISTING_POST_EFFECT_CONTEXT_CHANGED'};
    if(result?.length!==1||result[0].frameId!==0||result[0].error)
      return {ok:false,code:'EXISTING_NATIVE_OUTCOME_UNKNOWN'};
    return result[0].result;
  },
  // I13 fixed publication path, never a generic script or tab dispatcher.
  releaseIsolatedTab: async ({personaUid,cookieStoreId,routeId},request) => {
    if(request?.action!=='PUBLISH'||typeof request.slug!=='string'||
       !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
       typeof request.nonce!=='string'||!/^[a-f0-9]{32}$/.test(request.nonce)||
       !Array.isArray(request.files)||request.files.length<2||request.files.length>502)
      return {ok:false,code:'INVALID_RELEASE_REQUEST'};
    const state=await getState(),profile=state.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||!state.routes?.[routeId]||
       state.routes[routeId].enabled===false)
      return {ok:false,code:'RELEASE_PROTECTED_ROUTE_CHANGED'};
    const expected='https://perchance.org/'+request.slug+'#edit';
    const tabs=await browser.tabs.query({}),found=[];
    for(const tab of tabs) {
      if(tab.cookieStoreId!==cookieStoreId||tab.url!==expected)continue;
      let tag;
      try{tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');}
      catch{continue;}
      if(tag?.nonce===request.nonce&&tag.slug===request.slug&&
         tag.personaUid===personaUid&&tag.cookieStoreId===cookieStoreId&&
         ['PCMS_I09','PCMS_I13'].includes(tag.createdBy)&&tag.humanIntent!==true)found.push(tab);
    }
    if(found.length!==1||tabs.some(t=>t.id!==found[0].id&&t.url===expected))
      return {ok:false,code:'RELEASE_EDITOR_OWNERSHIP_AMBIGUOUS'};
    const tab=found[0];
    const prior=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceEditorProbe,args:[request.slug]
    });
    if(prior?.length!==1||prior[0].frameId!==0||prior[0].error||
       prior[0].result?.ok!==true||prior[0].result?.clean!==true)
      return {ok:false,code:'RELEASE_EDITOR_DIRTY_OR_UNKNOWN'};
    const result=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceReleaseMain,args:[request]
    });
    const after=await browser.tabs.get(tab.id),
      tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned'),
      again=await getState();
    if(after?.cookieStoreId!==cookieStoreId||after?.url!==expected||
       tag?.nonce!==request.nonce||tag?.humanIntent===true||
       again.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       again.profiles?.[cookieStoreId]?.routeId!==routeId||
       !again.routes?.[routeId]||again.routes[routeId].enabled===false)
      return {ok:false,code:'RELEASE_POST_EFFECT_CONTEXT_CHANGED'};
    if(result?.length!==1||result[0].frameId!==0||result[0].error)
      return {ok:false,code:'RELEASE_NATIVE_OUTCOME_UNKNOWN'};
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
  bg = substituteOnce(bg, '\nfunction localMutationFence(profileIds, operation, mode = "block", options = {}) {',
    `\nattachPcmsBackupDonor({ snapshot: () => getSnapshot(), cookies: id => cookieService.list(id) });\nattachPcmsRestoreDonor({
  snapshot:()=>getSnapshot(),
  cookies:id=>cookieService.list(id),
  containers:()=>personaManager.listContainers(),
  createContainer:async ({name,color,icon})=>localMutationFence([],async()=>{
    const made=await personaPlatform.create({name,color,icon,routeId:BLOCK_ROUTE_ID,
      allowDirect:false,profile:{killSwitch:true,blockLocalNetwork:true}});
    return {cookieStoreId:made?.container?.cookieStoreId,
      personaUid:made?.profile?.personaUid};
  }),
  prepare:async ({payload,mappings,mode,regeneratePersonaUids=false})=>{
    const snap=await getSnapshot(), bindings=new Map(Object.entries(mappings));
    // The pinned donor's ordinary importer intentionally preserves a valid
    // source UID. Fresh v2 recovery must NOT make an imported UID current
    // authority: give each created Persona a new UID, while retaining the
    // authenticated source UID solely for canonical historical remapping.
    const portable=regeneratePersonaUids?
      {...payload,personas:(payload.personas||[]).map(p=>({
        ...p,profile:{...p.profile,personaUid:null}
      }))}:payload;
    const imported=await buildImportedState({payload:portable,currentState:snap.state,
      profileBindings:bindings,mode});
    if(regeneratePersonaUids){
      const seen=new Set();
      for(const p of payload.personas||[]){
        const target=imported.maps.personaUid.get(p.key);
        if(typeof target!=='string'||!target||
           target===p.profile?.personaUid||seen.has(target))
          throw Error('RESTORE_FRESH_PERSONA_UID_NOT_REGENERATED');
        seen.add(target);
      }
    }
    // Restored bytes are archived facts; imported network execution, new proxy
    // endpoints, global privileges and formerly approved jobs have NO authority.
    imported.state.global=structuredClone(snap.state.global);
    imported.state.routes=structuredClone(snap.state.routes);
    // Replacing portable donor data must never orphan a destination
    // contextual identity into the local unmanaged/Direct routing policy.
    // Unselected destination Personas remain owned and unchanged.
    const targetIds=new Set(bindings.values());
    for(const [id,profile] of Object.entries(snap.state.profiles||{})){
      if(!targetIds.has(id))
        imported.state.profiles[id]=structuredClone(profile);
    }
    for(const [key,containerId] of bindings){
      const p=imported.state.profiles?.[containerId];
      if(!p||!p.managed)throw Error('RESTORE_PERSONA_MAPPING_INVALID');
      p.routeId=BLOCK_ROUTE_ID;p.killSwitch=true;p.blockLocalNetwork=true;
      p.rotationRole=null;p.rotationOperationId=null;
    }
    for(const id of imported.maps.script.values()){
      const script=imported.state.scripts?.[id];
      if(script){script.enabled=false;script.autoRun=false;}
    }
    for(const id of imported.maps.workflow.values()){
      const workflow=imported.state.workflows?.[id];
      if(workflow)workflow.enabled=false;
    }
    imported.state.__stateMeta=structuredClone(snap.state.__stateMeta);
    return {candidate:imported.state,sourcePersonas:(payload.personas||[]).map(p=>({
      sourceUid:p.profile?.personaUid||null,
      targetUid:imported.maps.personaUid.get(p.key)||null,
      sourceId:p.sourceId||null,
      containerId:bindings.get(p.key)})),
      cookieMap:Object.fromEntries([...imported.maps.profile]),
      scriptMap:Object.fromEntries([...imported.maps.script]),
      workflowMap:Object.fromEntries([...imported.maps.workflow])};
  },
  commit:async candidate=>localMutationFence(allPersonaUids,async()=>{
    const preview=await stateManager.previewState(candidate,{requireMetadata:true});
    if(preview.delta?.length)throw Error('RESTORE_DONOR_SECURITY_REVIEW_REQUIRED');
    const result=await stateManager.commitPreview(preview.previewId);
    return {ok:true,revision:result.revision};
  }),
  importCookies:async (id,rows)=>localMutationFence(id,()=>cookieService.importRecords(id,rows,'merge'))
});
\nfunction localMutationFence(profileIds, operation, mode = "block", options = {}) {`,
    'I15 donor backup read seam');
  const donorManagerPath=path.join(stage,'lib/state-manager.js');
  let donorManager=await readFile(donorManagerPath,'utf8');
  donorManager=substituteOnce(donorManager,"import { BLOCK_ROUTE_ID, DIRECT_ROUTE_ID } from \"./constants.js\";","import { BLOCK_ROUTE_ID, DIRECT_ROUTE_ID } from \"./constants.js\";\nimport { beforeDonorStateCommit } from \"../pcms/pcms-donor-fence.mjs\";","state manager import");
  donorManager=substituteOnce(donorManager,"    assertSecurityAuthorization(sanitized, authorization);\n    const saved = await save(sanitized);","    assertSecurityAuthorization(sanitized, authorization);\n    beforeDonorStateCommit(cache, sanitized, authorization.pcmsStagePermit??null);\n    const saved = await save(sanitized);","revocation before async save");
  donorManager=substituteOnce(donorManager,"      cache = incoming;\n      revision += 1;","      try { beforeDonorStateCommit(cache, incoming); }\n      catch { await save(cache); return {state:snapshot(cache),accepted:false,revision,bootId}; }\n      cache = incoming;\n      revision += 1;","external storage rollback");
  await writeFile(donorManagerPath,donorManager);
  // S01 donor route pin: a Persona carrying a durable pcmsBindingId may use
  // the network only while PCMS's committed exit ledger pins this exact
  // binding/Persona/container/route. Untagged ordinary Personas are unchanged.
  // The pin table starts EMPTY each boot, so tagged Personas start blocked.
  bg = substituteOnce(bg, "\nasync function handleProxyRequest(details) {", "\n" + PCMS_ROUTE_GATE + "\nasync function handleProxyRequest(details) {", "S01 donor route pin gate");
  bg = substituteOnce(bg, "async function handleProxyRequest(details) {\n  await initialize();\n  const state = await getState();", "async function handleProxyRequest(details) {\n  await initialize();\n  const state = await getState();\n  const pcmsContext = await pcmsRouteGate(state.profiles?.[details.cookieStoreId]);\n  if(pcmsContext.managed && !pcmsContext.allow)\n    return [{...BLACKHOLE_PROXY,connectionIsolationKey:details.cookieStoreId||'pcms-held'},null];", "S01 proxy initial pin");
  bg = substituteOnce(bg, "    return buildProxyInfo(effectiveRoute, details.cookieStoreId || `tab-${details.tabId}`);", "    const latestPcmsState = pcmsContext.managed ? await getState() : state;\n    if(pcmsContext.managed &&\n        (!inspectRoutePin(latestPcmsState.profiles?.[details.cookieStoreId]).allow ||\n         decision.route?.id !== latestPcmsState.profiles?.[details.cookieStoreId]?.routeId))\n      return [{...BLACKHOLE_PROXY,connectionIsolationKey:details.cookieStoreId||'pcms-stale'},null];\n    return buildProxyInfo(effectiveRoute, details.cookieStoreId || `tab-${details.tabId}`);", "S01 proxy final pin");
  bg = substituteOnce(bg, "async function handleBeforeRequest(details) {\n  await initialize();\n  const state = await getState();", "async function handleBeforeRequest(details) {\n  await initialize();\n  const state = await getState();\n  const pcmsContext = await pcmsRouteGate(state.profiles?.[details.cookieStoreId]);\n  if(pcmsContext.managed && !pcmsContext.allow) {\n    recordBlock(details,'pcms-route-not-pinned');return {cancel:true};\n  }", "S01 blocking initial pin");
  bg = substituteOnce(bg, "  return {};\n}\n\nasync function fetchMullvadRelays()", "  const latestPcmsState = pcmsContext.managed ? await getState() : state;\n  if(pcmsContext.managed &&\n     (decision.mode!=='proxy' ||\n      !inspectRoutePin(latestPcmsState.profiles?.[details.cookieStoreId]).allow ||\n      decision.route?.id !== latestPcmsState.profiles?.[details.cookieStoreId]?.routeId)) {\n    recordBlock(details,'pcms-route-pin-changed');return {cancel:true};\n  }\n  return {};\n}\n\nasync function fetchMullvadRelays()", "S01 blocking final pin");
  bg = substituteOnce(bg,
    "  const decision = routeDecision(state, details);\n  if (decision.mode === \"block\") {\n    return [{ ...BLACKHOLE_PROXY",
    `  const decision = routeDecision(state, details);
  if(pcmsContext.managed && decision.mode!=='proxy')
    return [{...BLACKHOLE_PROXY,connectionIsolationKey:details.cookieStoreId||'pcms-nonproxy'},null];
  if (decision.mode === "block") {
    return [{ ...BLACKHOLE_PROXY`,
    'S01 proxy Direct denial');
  bg = substituteOnce(bg, "  const decision = routeDecision(state, details);\n  if (decision.mode === \"block\") {\n    recordBlock(details, decision.reason);",
    `  const decision = routeDecision(state, details);
  if(pcmsContext.managed && decision.mode!=='proxy'){
    recordBlock(details,'pcms-nonproxy');return {cancel:true};
  }
  if (decision.mode === "block") {
    recordBlock(details, decision.reason);`,
    'S01 blocking Direct denial');
  // Account/provider requests from the extension origin have no implicit
  // cookieStoreId binding. Do not let the donor's generic extension-Direct
  // exemption become a PCMS provider routing bypass.
  bg = substituteOnce(bg, "  if (extensionRequest) {\n    // Route verification requests generated by PersonaMonkey must never silently", "  if (extensionRequest) {\n    if(pcmsContext.managed||isPcmsProviderUrl(details.url))\n      return [{...BLACKHOLE_PROXY,connectionIsolationKey:'pcms-unbound-extension'},null];\n    // Route verification requests generated by PersonaMonkey must never silently", "S01 extension account proxy bypass denied");
  bg = substituteOnce(bg, "  if (extensionRequest) {\n    if (isRouteTestFetchUrl(details.url)) {", "  if (extensionRequest) {\n    if(pcmsContext.managed||isPcmsProviderUrl(details.url)){\n      recordBlock(details,'pcms-unbound-extension-provider');return {cancel:true};\n    }\n    if (isRouteTestFetchUrl(details.url)) {", "S01 extension account blocking bypass denied");
  // The donor's existing route-test override additionally admits the fixed
  // Mullvad IPv6 echo endpoint, under the same single-request binding.
  bg = substituteOnce(bg, "    || target === canonicalNetworkUrl(MULLVAD_IPV4_CHECK_URL)\n", "    || target === canonicalNetworkUrl(MULLVAD_IPV4_CHECK_URL)\n    || target === canonicalNetworkUrl(PCMS_IPV6_CHECK_URL)\n", "S01 IPv6 route-test endpoint");
  bg = substituteOnce(bg, 'const MULLVAD_IPV4_CHECK_URL = "https://ipv4.am.i.mullvad.net/json";', 'const MULLVAD_IPV4_CHECK_URL = "https://ipv4.am.i.mullvad.net/json";\nconst PCMS_IPV6_CHECK_URL = "https://ipv6.am.i.mullvad.net/json";', "S01 IPv6 echo constant");
  bg = substituteOnce(bg,"attachPcmsGuard({\n  initialize, securityState,\n  shared:",
  "attachPcmsGuard({\n  initialize, securityState,\n  readRuntimeWitness:()=>nativeRequest('pcms.runtime_witness',{},6000),\n  shared:",
  'S01 guard native witness binding');
  // Preserve donor's normalized durable binding tag in the BUILD COPY only.
  const donorStoragePath = path.join(stage, 'lib/storage.js');
  let donorStorage = await readFile(donorStoragePath,'utf8');
  donorStorage = substituteOnce(donorStorage,
    '    managed: profile.managed !== false,',
    "    managed: profile.managed !== false,\n    pcmsBindingId: typeof profile.pcmsBindingId === 'string' &&\n      /^[a-z0-9_-]{8,128}$/i.test(profile.pcmsBindingId) ? profile.pcmsBindingId : null,",
    'S01 durable donor binding');
  await writeFile(donorStoragePath,donorStorage);

  await writeFile(bgPath, bg);
  for (const name of ['legacy-quarantine.mjs','creation-intake.mjs','creation-allocation.mjs','creation-effects.mjs','creation-git.mjs','creation-git-owner.mjs','creation-git-runner.mjs','creation-runner.mjs','creation-watch.mjs','coordinator-core.mjs','coordinator-store.mjs','coordinator-boundary.mjs','pcms-donor-fence.mjs','network-ledger.mjs','route-pin.mjs','enrollment.mjs','qualified-clock.mjs','entry.mjs', 'wake.mjs', 'persona-guard.mjs', 'journal.mjs', 'command-boundary.mjs', 'notices.mjs', 'accounts.mjs', 'account-boundary.mjs', 'inventory.mjs', 'inventory-boundary.mjs', 'perchance-readback.mjs', 'perchance-observer.mjs', 'git-source.mjs', 'source-boundary.mjs', 'git-catalog.mjs', 'git-prompt.mjs', 'catalog-bootstrap.mjs', 'catalog-import.mjs', 'catalog-prompt-store.mjs', 'catalog-resume.mjs', 'catalog-declaration.mjs', 'catalog-ready-store.mjs', 'ready-planner.mjs', 'ready-git-prompt.mjs', 'ready-git-source.mjs', 'ready-source-safety.mjs', 'ready-store.mjs', 'ready-intake.mjs', 'ready-operator.mjs', 'catalog-boundary.mjs', 'creation-catalog.mjs', 'catalog-watch.mjs', 'supply-plan.mjs', 'supply-store.mjs', 'perchance-supply.mjs', 'supply-git.mjs', 'supply-boundary.mjs', 'adoption.mjs', 'adoption-store.mjs', 'adoption-git.mjs', 'original-archive.mjs','adoption-recovery.mjs','adoption-recovery-bridge.mjs', 'adoption-boundary.mjs',
    'staging-core.mjs','staging-store.mjs','staging-boundary.mjs',
    'perchance-stage.mjs','editor-strip.mjs','perchance-editor-probe.mjs','perchance-ai-native.mjs','perchance-ai-oracle.mjs','perchance-ai-opfs.mjs','perchance-ai-history.mjs','ai-supervisor.mjs','ai-testing.mjs','ai-evidence.mjs','ai-store.mjs','ai-boundary.mjs',
    'git-writeback.mjs','writeback-store.mjs','writeback-boundary.mjs',
    'release-core.mjs','release-store.mjs','release-boundary.mjs','perchance-release.mjs',
    'existing-update-core.mjs','existing-update-store.mjs','existing-update-boundary.mjs','perchance-existing.mjs',
    'backup-auto-donor.mjs','backup-donor-port.mjs','restore-donor.mjs','restore-boundary.mjs','restore-reconcile.mjs','backup-auto-core.mjs','backup-auto-store.mjs','backup-auto-download.mjs',
    'backup-auto-retention.mjs','backup-auto-export.mjs','source-cut-retry.mjs','backup-v2-verify.mjs','backup-auto-run.mjs','backup-auto-boundary.mjs','restore-v2-candidate.mjs',
    'refresher-effect-core.mjs','refresher-core.mjs','refresher-store.mjs','refresher-boundary.mjs','perchance-monitor.mjs']) {
    await cp(path.join(root, 'src/runtime', name), path.join(stage, 'pcms', name));
  }
}
