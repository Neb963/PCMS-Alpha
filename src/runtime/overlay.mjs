import { readFile, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import {repairNativeTransport} from './native-transport-overlay.mjs';
import {repairNativePrepare,repairMullvadRuntime} from './native-prepare-overlay.mjs';
import {repairRouteProbes} from './route-probe-overlay.mjs';

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
function pcmsConnectionCode(status,routeId=null){
  if(status?.pending_prepare_routes?.includes(routeId)||status?.pending_prepare_routes?.includes('OBSERVATION_UNAVAILABLE'))return 'MULLVAD_ROUTE_UNCONFIRMED';
  if(status?.observation==='TIMED_OUT')return 'MULLVAD_STATUS_TIMEOUT';
  if(status?.installed!==true)return 'MULLVAD_LOCAL_SERVICE_UNAVAILABLE';
  if(status.compatible!==true)return 'MULLVAD_HELPER_INCOMPATIBLE';
  if(status.interface_up===false)return 'MULLVAD_TUNNEL_UNAVAILABLE';
  if(status.interface_up===true&&status.base_route_bound===false)return 'MULLVAD_TUNNEL_ROUTE_UNAVAILABLE';
  if(status.interface_up===true&&status.base_proxy_reachable===false)return 'MULLVAD_PROXY_UNREACHABLE';
  return status.ready===true?null:'MULLVAD_CONNECTION_UNVERIFIED';
}
async function pcmsProbeFailure(fallback,routeId){
  const code=pcmsConnectionCode(await mullvadRuntime.refreshStatus(),routeId);
  return pcmsFailure(code||fallback,code?'HOST':'ROUTE');
}
async function pcmsDnsProtected(isolationId,effective,signal){
  const servers=[],used=new Set();
  for(let i=0;i<3;i++){
    let target;
    do { target='https://'+crypto.randomUUID()+'.dnsleak.am.i.mullvad.net/'; }
    while(used.has(target)||routeTestRequests.has(target));
    used.add(target);
    const body=await fetchJsonThroughRouteTest(isolationId,effective,target,15000,signal);
    if(Array.isArray(body))servers.push(...body);
    else if(body&&typeof body==='object')servers.push(body);
  }
  return servers.length>0&&servers.every(s=>s?.mullvad_dns===true);
}
// Positive relay-side statement only: the SOCKS relay itself reports the
// IPv6 network unreachable (RFC 1928 reply 3) or address type unsupported (8).
async function pcmsIpv6Blocking(route,signal){
  const blocked={state:'BLOCKED_VERIFIED',basis:'RELAY_REPORTED_IPV6_UNREACHABLE'};
  const positive=text=>/SOCKS connect failed with code (3|8)\b/.test(String(text||''));
  try{
    const out=await pcmsFetchViaExit(route,{url:PCMS_IPV6_CHECK_URL,method:'GET',headers:{},
      max_redirects:0,timeout_seconds:10,
      network_policy:{block_local_network:true,domain_mode:'allowlist',
        allowed_domains:['ipv6.am.i.mullvad.net'],blocked_domains:[]},
      connect_policy:{page_url:PCMS_IPV6_CHECK_URL,rules:[]}},20000,signal);
    return out?.ok===false&&positive(out.error)?blocked:{state:'UNKNOWN'};
  }catch(error){return positive(error?.message||error)?blocked:{state:'UNKNOWN'};}
}
// Cookie-free fixed Mullvad echo probes through the donor's existing
// route-test override. A candidate is probed unassigned; an assigned Persona
// is probed through the donor's own testProfile (which also caches the
// donor route evidence used by every guarded PCMS effect).
const pcmsProbeFlights=new Map();
async function pcmsProbeExits(args,outerSignal=null){
  if(outerSignal?.aborted)return pcmsFailure('ROUTE_OBSERVATION_CANCELLED','HOST');
  if(pcmsProbeFlights.has(args.routeId))return pcmsFailure('MULLVAD_ROUTE_UNCONFIRMED','HOST');
  const controller=new AbortController(),abort=()=>controller.abort();
  outerSignal?.addEventListener('abort',abort,{once:true});
  if(outerSignal?.aborted)abort();
  const state={prepared:false};
  const pending=trackPcmsWork(Promise.resolve().then(()=>pcmsProbeExitsWithinDeadline(args,controller.signal,state))
    .catch(()=>pcmsFailure('MULLVAD_ROUTE_UNCONFIRMED','HOST')));
  pcmsProbeFlights.set(args.routeId,pending);
  void pending.finally(()=>{if(pcmsProbeFlights.get(args.routeId)===pending)pcmsProbeFlights.delete(args.routeId);});
  let stop;
  const stopped=new Promise(resolve=>{
    stop=()=>resolve(pcmsFailure(outerSignal?.aborted?'ROUTE_OBSERVATION_CANCELLED':'ROUTE_OBSERVATION_TIMEOUT','HOST'));
    controller.signal.addEventListener('abort',stop,{once:true});
    if(controller.signal.aborted)stop();
  });
  const timer=setTimeout(abort,30000);
  try{
    const result=await Promise.race([pending,stopped]);
    return {...(controller.signal.aborted?pcmsFailure(outerSignal?.aborted?'ROUTE_OBSERVATION_CANCELLED':'ROUTE_OBSERVATION_TIMEOUT','HOST'):result),preparationSettled:state.prepared};
  }finally{clearTimeout(timer);outerSignal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',stop);}
}
async function pcmsProbeExitsWithinDeadline({routeId,profileId=null,reconcileOnly=false},signal,probe){
  await initialize();
  const before=await getState(),route=before.routes?.[routeId];
  if(!route||route.enabled===false||route.provider!=='mullvad')return pcmsFailure('MULLVAD_ROUTE_REQUIRED','ROUTE');
  if(securityState.ready!==true||securityState.privacySafe!==true)return pcmsFailure('DONOR_SECURITY_UNAVAILABLE','HOST');
  if(profileId){
    const p=before.profiles?.[profileId];
    if(!p?.pcmsBindingId||p.routeId!==routeId)return pcmsFailure('ASSIGNED_ROUTE_CHANGED','ROUTE');
  }
  if(signal.aborted)return pcmsFailure('ROUTE_OBSERVATION_CANCELLED','HOST');
  let effective=reconcileOnly?null:await mullvadRuntime.resolve(route,{fresh:true}),recovery=null,recoveryGeneration=null;
  probe.prepared=!!effective;
  // Native preparation is allowed to settle; its timeout is not proof that
  // an effect was canceled. Only the following read-only probe is abortable.
  if(signal.aborted)return pcmsFailure('ROUTE_OBSERVATION_CANCELLED','HOST');
  if(!effective){
    recoveryGeneration=mullvadRuntime.recoveryGeneration(routeId);
    const held=mullvadRuntime.getStatus().preparationHeld===true;
    const status=await mullvadRuntime.refreshStatus();
    const code=pcmsConnectionCode(status,routeId)||(held?'MULLVAD_PREPARATION_UNAVAILABLE':null);
    if(code==='MULLVAD_ROUTE_UNCONFIRMED'){
      recovery=await pcmsInspectPendingPreparation(routeId,status);
      if(recovery&&recovery.relayIp===route.host&&recovery.relayPort===Number(route.port||1080))effective={...route,
        host:recovery.endpoint.local_host,port:recovery.endpoint.local_port,type:'socks',proxyDNS:true,
        username:'persona',password:recovery.password,_relayHost:route.host,_relayPort:route.port};
    }
    if(!effective)return pcmsFailure(code||'ROUTE_CONNECTION_FAILED',code?'HOST':'ROUTE');
  }
  // A unique connection must authenticate THIS preparation's fresh token;
  // reusing an old established SOCKS tunnel would not prove its completion.
  const isolationId=recovery?'pcms-recovery-'+recovery.nonce+'-'+crypto.randomUUID():profileId||('pcms-probe-'+routeId);
  let v4;
  try{
    if(profileId&&!recovery){
      const tested=await testProfile(profileId,signal);
      if(tested?.ok!==true)return tested?.dns?.leaking===true?pcmsFailure('DNS_LEAK_DETECTED','ROUTE'):
        await pcmsProbeFailure('ROUTE_CONNECTION_FAILED',routeId);
      v4=tested.data;
    }else{
      v4=await fetchJsonThroughRouteTest(isolationId,effective,MULLVAD_IPV4_CHECK_URL,15000,signal);
      if(!(await pcmsDnsProtected(isolationId,effective,signal)))return pcmsFailure('DNS_LEAK_DETECTED','ROUTE');
    }
  }catch{return signal.aborted?pcmsFailure('ROUTE_OBSERVATION_CANCELLED','HOST'):await pcmsProbeFailure('ROUTE_CONNECTION_FAILED',routeId);}
  if(v4?.mullvad_exit_ip!==true||typeof v4.ip!=='string')return pcmsFailure('NOT_A_MULLVAD_EXIT','ROUTE');
  let ipv6;
  try{
    const d=await fetchJsonThroughRouteTest(isolationId,effective,PCMS_IPV6_CHECK_URL,15000,signal);
    ipv6=d?.mullvad_exit_ip===true&&typeof d.ip==='string'&&d.ip.includes(':')?
      {state:'OBSERVED',address:d.ip}:{state:'UNKNOWN'};
  }catch{ipv6=signal.aborted?{state:'UNKNOWN'}:await pcmsIpv6Blocking(route,signal);}
  const after=await getState();
  if(JSON.stringify(after.routes?.[routeId])!==JSON.stringify(route)||
     (profileId&&after.profiles?.[profileId]?.routeId!==routeId))
    return pcmsFailure('ROUTE_CHANGED_DURING_PROBE','ROUTE');
  if(recovery){
    if(signal.aborted||!mullvadRuntime.recoveryCurrent(recoveryGeneration)||!['OBSERVED','BLOCKED_VERIFIED'].includes(ipv6.state)||
       !await pcmsSettleObservedPreparation(recovery))return pcmsFailure('MULLVAD_ROUTE_UNCONFIRMED','HOST');
    if(!mullvadRuntime.acceptObservedPreparation(route,recovery.endpoint,recovery.password,recovery.createdAtMs,recoveryGeneration))
      return pcmsFailure('ROUTE_CHANGED_DURING_PROBE','ROUTE');
    probe.prepared=true;
    if(profileId){
      const health=await testProfile(profileId,signal);
      if(!health?.ok||health.data?.ip!==v4.ip)return pcmsFailure('ROUTE_CHANGED_DURING_PROBE','ROUTE');
    }
    if(!mullvadRuntime.recoveryCurrent(recoveryGeneration))return pcmsFailure('ROUTE_CHANGED_DURING_PROBE','ROUTE');
  }
  return {ok:true,source:'DONOR_ROUTE_PROBE',evidenceId:'evidence_'+crypto.randomUUID().replaceAll('-',''),
    routeId,ipv4:{state:'OBSERVED',address:v4.ip},ipv6,dns:'VERIFIED_PROTECTED',observedAtMs:Date.now()};
}
// Private same-XPI donor operations for PCMS Add Account / route repair.
// Every mutation goes through the donor's own mutation fence and is
// reconcilable by reading donor state; nothing here accepts a raw endpoint.
function createPcmsEnrollmentDonor(){
  return Object.freeze({
    async inspectPreparation({routeId}){
      await initialize();
      if(pcmsProbeFlights.has(routeId))return pcmsFailure('MULLVAD_ROUTE_UNCONFIRMED','HOST');
      const status=await mullvadRuntime.refreshStatus();
      if(status.installed!==true||status.compatible!==true)return pcmsFailure(pcmsConnectionCode(status),'HOST');
      if(!Array.isArray(status.pending_prepare_routes)||
         status.pending_prepare_routes.includes('OBSERVATION_UNAVAILABLE'))return pcmsFailure('MULLVAD_ROUTE_UNCONFIRMED','HOST');
      if(!status.pending_prepare_routes.includes(routeId))return {ok:true,settled:true};
      // Authenticated fixed-echo recovery only. This path never invokes
      // resolve/prepare and cannot rotate or assign any account route.
      const result=await pcmsProbeExits({routeId,reconcileOnly:true});
      return result.ok&&result.preparationSettled?{ok:true,settled:true}:pcmsFailure('MULLVAD_ROUTE_UNCONFIRMED','HOST');
    },
    async inspectConnection(){
      await initialize();
      const status=await mullvadRuntime.refreshStatus();
      return {ok:true,code:pcmsConnectionCode(status),observedAtMs:Date.now(),
        installed:status.installed===true,compatible:status.compatible===true,ready:status.ready===true,
        tunnelUp:status.interface_up===true,proxyReachable:status.base_proxy_reachable===true};
    },
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
      const catalogAbort=new AbortController(),catalogTimer=setTimeout(()=>catalogAbort.abort(),10000);
      try{relays=await fetchMullvadRelays({signal:catalogAbort.signal});}catch{relayList='UNAVAILABLE';}
      finally{clearTimeout(catalogTimer);}
      const hosts=new Set(Object.values(state.routes||{}).map(r=>String(r?.host)+':'+Number(r?.port||0)));
      relays=relays.filter(r=>PCMS_RELAY_NET.test(r.ipv4_address)&&Number(r.port)===1080&&
        !hosts.has(r.ipv4_address+':1080'));
      for(let i=relays.length-1;i>0;i--){
        const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);
        [relays[i],relays[j]]=[relays[j],relays[i]];
      }
      return {ok:true,relayList,taggedBindings,candidates:[
        ...usable.map(r=>({kind:'ROUTE',routeId:r.id})),
        ...relays.map(r=>({kind:'RELAY',relay:{hostname:r.hostname,ipv4_address:r.ipv4_address,
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
    probeCandidate:({routeId,signal})=>withRouteTestTargetLock('pcms-candidate-'+routeId,async()=>{
      const evidence=await pcmsProbeExits({routeId},signal);
      if(evidence.failure==='HOST'&&!evidence.preparationSettled)return evidence;
      // A catalog probe must not accumulate an idle native forwarder for
      // every rejected relay. The donor's admission lock serializes this
      // unassigned-route cleanup against ordinary Persona route changes.
      try{
        const released=await localMutationFence([],async()=>{
          const state=await getState();
          if(Object.values(state.profiles||{}).some(p=>p?.routeId===routeId))return true;
          if(state.routes?.[routeId]?.provider!=='mullvad')return false;
          mullvadRuntime.drop(routeId);
          try{await releaseExit(routeId);return true;}catch{return false;}
        });
        if(!released)return pcmsFailure('CANDIDATE_RELEASE_UNCONFIRMED','HOST');
      }catch{return pcmsFailure('CANDIDATE_RELEASE_UNCONFIRMED','HOST');}
      return evidence;
    },signal),
    probeAssigned:async({bindingId,contextId,routeId,signal})=>{
      const p=(await getState()).profiles?.[contextId];
      if(p?.pcmsBindingId!==bindingId)return pcmsFailure('BINDING_PERSONA_CHANGED','ROUTE');
      return pcmsProbeExits({routeId,profileId:contextId},signal);
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
    async activePersonaUids(){
      await initialize();
      const state=await getState(),tabs=await browser.tabs.query({}),jobs=await listActiveProfileIds(),leases=await managementIntegration.listControlLeases();
      const contexts=new Set([...tabs.map(t=>t.cookieStoreId),...jobs]);
      const leased=new Set(leases.map(l=>String(l?.personaUid||'').toLowerCase()));
      return {ok:true,personas:Object.values(state.profiles||{}).filter(p=>typeof p?.pcmsBindingId==='string'&&
        (contexts.has(p.containerId)||leased.has(String(p.personaUid).toLowerCase()))).map(p=>p.personaUid)};
    },
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
      if(status?.pending_prepare_routes?.includes(routeId)||status?.pending_prepare_routes?.includes('OBSERVATION_UNAVAILABLE'))
        return {ok:false,code:'RELEASE_UNCONFIRMED'};
      if(status?.installed!==true||!Array.isArray(status.active_exits))return {ok:false,code:'NATIVE_UNAVAILABLE'};
      return {ok:true,released:!status.active_exits.some(e=>e?.route_id===routeId)};
    },
    // C-60 permanent local removal of an archived account's dedicated Persona
    // (container + its session cookies) through the donor's own DELETE_PERSONA
    // path. Refused while any tab, donor job or control lease uses it.
    async removeAccountPersona({personaUid}){
      await initialize();
      const state=await getState(),found=pcmsProfileByUid(state,personaUid);
      if(found.code==='PERSONA_NOT_FOUND')return {ok:true,removed:false,absent:true};
      if(found.code)return {ok:false,code:found.code};
      const p=found.profile;
      const leases=await managementIntegration.listControlLeases();
      if((await browser.tabs.query({cookieStoreId:p.containerId})).length||
         (await listActiveProfileIds()).includes(p.containerId)||
         leases.some(l=>String(l?.personaUid||'').toLowerCase()===String(p.personaUid).toLowerCase()))
        return {ok:false,code:'PERSONA_IN_USE'};
      try{
        return await localMutationFence(p.containerId,async()=>
          {
          if((await browser.tabs.query({cookieStoreId:p.containerId})).length||
             (await listActiveProfileIds()).includes(p.containerId))
            return {ok:false,code:'PERSONA_IN_USE'};
          const current=await getState(),target=current.profiles?.[p.containerId];
          if(target?.personaUid!==p.personaUid||target?.pcmsBindingId!==p.pcmsBindingId)
            return {ok:false,code:'PERSONA_CHANGED'};
          const permit=target.pcmsBindingId?issueBoundPersonaDeletePermit({
            bindingId:target.pcmsBindingId,contextId:p.containerId,personaUid:p.personaUid}):null;
          // The donor checks this revision BEFORE deleting the actual Firefox
          // container. The one-use permit allows only its exact cleanup commit.
          await personaPlatform.remove(p.containerId,{
            expectedRevision:current.__stateMeta.revision,expectedBootId:current.__stateMeta.bootId,
            ...(permit?{pcmsStagePermit:permit}:{})});
          const after=await getState();
          if(Object.values(after.profiles||{}).some(x=>String(x?.personaUid||'').toLowerCase()===String(personaUid).toLowerCase()))
            return {ok:false,code:'PERSONA_REMOVAL_UNCONFIRMED'};
          return {ok:true,removed:true};
        });
      }catch{return {ok:false,code:'PERSONA_REMOVAL_UNCONFIRMED'};}
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
  const nativePath=path.join(stage,'lib/mullvad-native.js');
  await writeFile(nativePath,repairNativePrepare(repairNativeTransport(await readFile(nativePath,'utf8'))));
  const mullvadPath=path.join(stage,'lib/mullvad-runtime.js');
  await writeFile(mullvadPath,repairMullvadRuntime(await readFile(mullvadPath,'utf8')));
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
      }),
      renew: (leaseId) => mutateControlLease('pcms-same-xpi', {
        command: 'persona.control.renew',operationId:crypto.randomUUID(),params:{leaseId,ttlMs:15000}
      })
    }),
    withLocalMutationFence,`, 'shared donor lease');
  await writeFile(mgPath, mg);
  let bg = repairRouteProbes(await readFile(bgPath, 'utf8'));
  bg = substituteOnce(bg, 'import { installRoutingHandlers } from "./lib/routing-gate.js";',
    'import { installRoutingHandlers } from "./lib/routing-gate.js";\nimport { inspectRoutePin, routePinsReady, reloadRoutePins } from "./pcms/route-pin.mjs";\nimport { issueBoundPersonaCreatePermit, issueExistingPersonaTagPermit, issueBoundPersonaDeletePermit } from "./pcms/pcms-donor-fence.mjs";\nimport { nativeRequest, inspectPendingPreparation as pcmsInspectPendingPreparation, settleObservedPreparation as pcmsSettleObservedPreparation, fetchViaExit as pcmsFetchViaExit } from "./lib/mullvad-native.js";\nimport { attachPcmsGuard } from "./pcms/persona-guard.mjs";\nimport { trackPcmsWork } from "./pcms/work-checkpoint.mjs";\nimport { publishNativeReadiness } from "./pcms/protected-readiness.mjs";\nimport { attachPcmsBackupDonor } from "./pcms/backup-auto-donor.mjs";\nimport { attachPcmsRestoreDonor } from "./pcms/restore-donor.mjs";\nimport { preserveUnselectedDonorSources } from "./pcms/restore-preserve.mjs";\nimport { destinationOwnedPortable } from "./pcms/restore-identities.mjs";\nimport { buildImportedState } from "./lib/backup-import.js";\nimport { perchanceReadIsolated } from "./pcms/perchance-observer.mjs";\nimport { perchanceReleaseMain } from "./pcms/perchance-release.mjs";\nimport { perchanceExistingMain, perchanceRefresherCleanMain } from "./pcms/perchance-existing.mjs";\nimport { choosePrivateStageAdapter } from "./pcms/ready-native-source.mjs";\nimport { perchanceMonitorIsolated } from "./pcms/perchance-monitor.mjs";\nimport { perchanceSupplyIsolated } from "./pcms/perchance-supply.mjs";\nimport { perchanceStageMain } from "./pcms/perchance-stage.mjs";\nimport { renderPcmsEditorStrip } from "./pcms/editor-strip.mjs";\nimport { perchanceEditorProbe } from "./pcms/perchance-editor-probe.mjs";\nimport { perchanceAiNative } from "./pcms/perchance-ai-native.mjs";\nimport { perchanceAiPreviewCheck } from "./pcms/perchance-ai-oracle.mjs";\nimport { perchanceAiOpfsProbe } from "./pcms/perchance-ai-opfs.mjs";\nimport { perchanceAiHistoryCredentials, perchanceAiHistoryIsolated, perchanceAiTerminalHistoryIsolated } from "./pcms/perchance-ai-history.mjs";\nimport { createHumanEditorBridge, handoffHumanEditor } from "./pcms/human-editor-bridge.mjs";\nimport { createManualEditorBridge } from "./pcms/manual-editor-bridge.mjs";\nimport { createStageEditorBridge } from "./pcms/stage-editor-bridge.mjs";',
    'donor background import');
  bg = substituteOnce(bg, '\nfunction localMutationFence(profileIds, operation, mode = "block", options = {}) {',
    `
attachPcmsGuard({
  initialize, securityState,
  humanReviewTab:createHumanEditorBridge({browser,getState}),
  manualEditorTab:createManualEditorBridge({browser,getState}),
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
    // Donor-owned exact protected-container admission. When no provider tab
    // exists, ONLY the fixed read-only monitor may create a tagged transient
    // Perchance tab; no editor/AI/source operation inherits this permission.
    const current=await getState(),profile=current.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||!current.routes?.[routeId]||
       current.routes[routeId].enabled===false)
      return {ok:false,code:'PERSONA_ROUTE_CHANGED'};
    const tabs=await browser.tabs.query({cookieStoreId});
    const matching=tabs.filter(tab=>tab.cookieStoreId===cookieStoreId &&
      typeof tab.url==='string'&&(()=>{
        try{return new URL(tab.url).origin==='https://perchance.org';}
        catch{return false;}
      })());
    let tab=matching.find(item=>item.active)||matching[0]||null;
    let disposableNonce=null,humanTouched=false,activationListener=null;
    try{
      if(!tab){
        // Fixed account identity/inventory reads can reopen their protected
        // session after restart. This grants no page command or editor effect.
        const fixedSource=!identityOnly&&originalSlug!==null&&
          typeof originalSlug==='string'&&
          /^[a-z0-9][a-z0-9-]{0,99}$/.test(originalSlug);
        const fixedAccountRead=originalSlug===null&&typeof identityOnly==='boolean';
        if(!monitoringRequest&&!fixedSource&&!fixedAccountRead)
          return {ok:false,code:'NO_PERCHANCE_TAB'};
        disposableNonce=crypto.randomUUID().replaceAll('-','');
        tab=await browser.tabs.create({
          url:'https://perchance.org/',cookieStoreId,active:false
        });
        if(!Number.isSafeInteger(tab?.id))
          return {ok:false,code:'MONITOR_TAB_NOT_CREATED'};
        activationListener=info=>{if(info?.tabId===tab.id)humanTouched=true;};
        browser.tabs.onActivated.addListener(activationListener);
        await browser.sessions.setTabValue(tab.id,'pcmsS07Monitor',{
          createdBy:'PCMS_S07_MONITOR',nonce:disposableNonce,
          personaUid,cookieStoreId,routeId
        });
        let loaded=false;
        for(let attempt=0;attempt<24;attempt++){
          const check=await browser.tabs.get(tab.id);
          if(check.cookieStoreId!==cookieStoreId||
             (check.url&&!check.url.startsWith('https://perchance.org/')&&
              check.url!=='about:blank'))
            return {ok:false,code:'MONITOR_TAB_ROUTE_CHANGED'};
          if(check.status==='complete'&&check.url?.startsWith('https://perchance.org/')){
            loaded=true;break;
          }
          await new Promise(done=>setTimeout(done,250));
        }
        if(!loaded)return {ok:false,code:'MONITOR_TAB_NOT_READY'};
      }

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
    }finally{
      if(activationListener)
        try{browser.tabs.onActivated.removeListener(activationListener);}catch{}
      if(disposableNonce&&tab?.id&&!humanTouched){
        try{
          const latest=await browser.tabs.get(tab.id),
            tag=await browser.sessions.getTabValue(tab.id,'pcmsS07Monitor');
          // A tab taken over/activated by a human is retained, never closed.
          if(latest.cookieStoreId===cookieStoreId&&latest.active===false&&
             latest.url==='https://perchance.org/'&&
             tag?.createdBy==='PCMS_S07_MONITOR'&&tag.nonce===disposableNonce&&
             tag.personaUid===personaUid&&tag.cookieStoreId===cookieStoreId&&
             tag.humanIntent!==true)
            await browser.tabs.remove(tab.id);
        }catch{/* uncertain transient tab is held; never close an untagged tab */}
      }
    }
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
    let tab=matching.find(t=>t.active)||matching[0],nonce=null,humanTouched=false,activation=null;
    try{
    if(!tab){
      // The intent/possible-dispatch journal and donor lease are already
      // admitted by the caller. Reopen only its fixed protected session;
      // closing a human login tab must not disable background creation.
      nonce=crypto.randomUUID();
      tab=await browser.tabs.create({url:'https://perchance.org/',cookieStoreId,active:false});
      if(!Number.isSafeInteger(tab?.id))return {ok:false,code:'SUPPLY_SESSION_UNCONFIRMED'};
      activation=info=>{if(info?.tabId===tab.id)humanTouched=true;};
      browser.tabs.onActivated.addListener(activation);
      await browser.sessions.setTabValue(tab.id,'pcmsSupplySession',{nonce,personaUid,cookieStoreId,routeId});
      let loaded=false;
      for(let i=0;i<32;i++){
        const current=await browser.tabs.get(tab.id);
        if(current.cookieStoreId!==cookieStoreId||
           !['about:blank','https://perchance.org/'].includes(current.url))return {ok:false,code:'SUPPLY_SESSION_CHANGED'};
        if(current.status==='complete'&&current.url==='https://perchance.org/'){loaded=true;break;}
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      if(!loaded)return {ok:false,code:'SUPPLY_SESSION_NOT_READY'};
    }
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
    }finally{
      if(activation)browser.tabs.onActivated.removeListener(activation);
      if(nonce&&tab?.id&&!humanTouched)try{
        const current=await browser.tabs.get(tab.id),tag=await browser.sessions.getTabValue(tab.id,'pcmsSupplySession');
        if(current.cookieStoreId===cookieStoreId&&current.url==='https://perchance.org/'&&current.active===false&&
           tag?.nonce===nonce&&tag.personaUid===personaUid&&tag.cookieStoreId===cookieStoreId&&tag.routeId===routeId&&tag.humanIntent!==true)
          await browser.tabs.remove(tab.id);
      }catch{/* Uncertain or human-touched tab is retained. */}
    }
  },

  // One donor-guarded, protected-container stage tab; never touch an
  // unrelated human editor or reuse a tab merely because its number matches.
  stageIsolatedTab:createStageEditorBridge({browser,getState}),
  // A current native editor clean/owner observation must accompany the
  // independent saved-byte readback before staged source is accepted.
  // S05 local preflight: read-only source/editor conflict check, guarded by
  // the donor's lease and protected-route generation. It is NOT a native
  // collaboration or provider-source snapshot and cannot authorize a save.
  inspectNoEditorTabs: async ({personaUid,cookieStoreId,routeId},{slug}) => {
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
      return {ok:false,code:'S05_INVALID_EDITOR_TARGET'};
    const profile=async()=>{
      const state=await getState(),p=state.profiles?.[cookieStoreId];
      return p?.personaUid===personaUid&&p.routeId===routeId&&
        routeId!=='direct'&&routeId!=='block'&&state.routes?.[routeId]?.enabled!==false;
    };
    try{
      if(!(await profile()))return {ok:false,code:'S05_ROUTE_CHANGED'};
      async function sample(){
        const tabs=await browser.tabs.query({});
        if(!Array.isArray(tabs))return {ok:false,code:'S05_TAB_LIST_UNVERIFIED'};
        for(const t of tabs){
          if(typeof t?.url!=='string')continue;
          let u;try{u=new URL(t.url);}catch{continue;}
          if(u.protocol==='https:'&&u.hostname==='perchance.org'&&
             u.pathname==='/'+slug&&u.hash==='#edit')
            return {ok:false,code:'S05_EDITOR_TAB_PRESENT'};
        }
        return {ok:true};
      }
      const one=await sample();
      if(!one.ok)return one;
      if(!(await profile()))return {ok:false,code:'S05_ROUTE_CHANGED'};
      const two=await sample();
      if(!two.ok||!(await profile()))
        return {ok:false,code:two.code||'S05_POST_INSPECTION_ROUTE_CHANGED'};
      return {ok:true,noEditors:true,source:'LOCAL_BROWSER_TAB_OBSERVATION'};
    }catch{return {ok:false,code:'S05_TAB_INSPECTION_UNAVAILABLE'};}
  },
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
    if(!['UNLIST','STAGE','RESTORE','REFRESH'].includes(request?.action)||
       typeof request.slug!=='string'||
       !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
       typeof request.nonce!=='string'||!/^[a-f0-9]{32}$/.test(request.nonce)||
       !Array.isArray(request.previousFiles)||request.previousFiles.length<2||
       request.previousFiles.length>502||
       (request.action==='REFRESH'&&!/^[A-Za-z0-9_-]{16,64}$/.test(request.markerId||''))||
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
    if(request.action==='UNLIST'||request.action==='REFRESH'){
      if(tabs.some(t=>t?.url?.startsWith('https://perchance.org/'+request.slug)&&
        (t.cookieStoreId===cookieStoreId||t.url?.includes('#edit'))))
        return {ok:false,code:'HUMAN_OR_AMBIGUOUS_EDITOR'};
      tab=await browser.tabs.create({url,cookieStoreId,active:false});
      if(!Number.isSafeInteger(tab?.id))return {ok:false,code:'EXISTING_TAB_CREATE_UNKNOWN'};
      // Crash before session tag is ambiguous; tab is preserved for human.
      await browser.sessions.setTabValue(tab.id,'pcmsI09Owned',{
        slug:request.slug,nonce:request.nonce,personaUid,cookieStoreId,
        createdBy:request.action==='REFRESH'?'PCMS_S07':'PCMS_I13',
        humanIntent:false
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
       tagged?.nonce!==request.nonce||
       tagged?.createdBy!==(request.action==='REFRESH'?'PCMS_S07':'PCMS_I13')||
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
  // S07 releases ONLY a verified, clean, PCMS_S07-created editor tab.
  // This is local tab cleanup, not provider unlisting or source mutation.
  refresherCleanupTab: async ({personaUid,cookieStoreId,routeId},{slug,nonce})=>{
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
       !/^[a-f0-9]{32}$/.test(nonce||''))
      return {ok:false,code:'REFRESH_CLEANUP_INVALID'};
    const before=await getState(),profile=before.profiles?.[cookieStoreId];
    if(!profile||profile.personaUid!==personaUid||profile.routeId!==routeId||
       routeId==='direct'||routeId==='block'||!before.routes?.[routeId]||
       before.routes[routeId].enabled===false)
      return {ok:false,code:'REFRESH_CLEANUP_ROUTE_CHANGED'};
    const url='https://perchance.org/'+slug+'#edit';
    const tabs=await browser.tabs.query({}),matches=[];
    for(const tab of tabs)if(tab.cookieStoreId===cookieStoreId&&tab.url===url){
      const tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');
      if(tag?.createdBy==='PCMS_S07'&&tag.slug===slug&&
         tag.nonce===nonce&&tag.personaUid===personaUid&&
         tag.cookieStoreId===cookieStoreId&&tag.humanIntent!==true)matches.push(tab);
    }
    if(matches.length===0)return {ok:true,closed:false,source:'S07_TAB_ALREADY_ABSENT'};
    if(matches.length!==1)return {ok:false,code:'REFRESH_CLEANUP_TAB_NOT_UNIQUE'};
    const tab=matches[0];
    const check=await browser.scripting.executeScript({
      target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceRefresherCleanMain,args:[slug]
    });
    if(check?.length!==1||check[0].frameId!==0||check[0].error||
       check[0].result?.ok!==true)
      return {ok:false,code:'REFRESH_CLEANUP_EDITOR_UNVERIFIED'};
    const again=await browser.tabs.get(tab.id),
      tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned'),
      latest=await getState();
    if(again.cookieStoreId!==cookieStoreId||again.url!==url||
       tag?.createdBy!=='PCMS_S07'||tag.nonce!==nonce||
       tag.humanIntent===true||
       latest.profiles?.[cookieStoreId]?.personaUid!==personaUid||
       latest.profiles?.[cookieStoreId]?.routeId!==routeId||
       latest.routes?.[routeId]?.enabled===false)
      return {ok:false,code:'REFRESH_CLEANUP_CONTEXT_CHANGED'};
    await browser.tabs.remove(tab.id);
    return {ok:true,closed:true,source:'OWN_S07_TAB_CLOSED'};
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
  handoffStagingTab: ({personaUid,slug,nonce})=>handoffHumanEditor(browser,{personaUid,slug,nonce}),
  openHumanLogin: async ({personaUid,cookieStoreId,routeId,slug}) =>
    localMutationFence(cookieStoreId,async()=>{
      const state=await getState(), p=state.profiles?.[cookieStoreId];
      if(!p || p.personaUid!==personaUid || p.routeId!==routeId ||
          routeId==='direct'||routeId==='block'||state.routes?.[routeId]?.enabled===false)
        throw Error('PERSONA_ROUTE_CHANGED');
      if(slug!==undefined&&(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)))
        throw Error('INVALID_GENERATOR_SLUG');
      return personaPlatform.open(cookieStoreId,'https://perchance.org/'+(slug||''),true);
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
    const portable=destinationOwnedPortable(payload,snap.state,mappings);
    const imported=await buildImportedState({payload:portable,currentState:snap.state,
      profileBindings:bindings,mode});
    if(regeneratePersonaUids){
      const seen=new Set();
      for(const p of payload.personas||[]){
        const target=imported.maps.personaUid.get(p.key);
        if(typeof target!=='string'||!target||
           seen.has(target))
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
    preserveUnselectedDonorSources(imported,snap.state,targetIds);
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
      bindingId:imported.state.profiles?.[bindings.get(p.key)]?.pcmsBindingId||null,
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
  bg = substituteOnce(bg, 'const mullvadRuntime = createMullvadRuntime({\n  getState,',
    'const mullvadRuntime = createMullvadRuntime({\n  getState, onReadiness:publishNativeReadiness,', 'F1 donor readiness hints');
  bg = substituteOnce(bg, "\nasync function handleProxyRequest(details) {", "\n" + PCMS_ROUTE_GATE + "\nasync function handleProxyRequest(details) {", "S01 donor route pin gate");
  bg = substituteOnce(bg, "async function handleProxyRequest(details) {\n  await initialize();\n  const state = await getState();", "async function handleProxyRequest(details) {\n  await initialize();\n  const state = await getState();\n  const pcmsContext = await pcmsRouteGate(state.profiles?.[details.cookieStoreId]);\n  if(pcmsContext.managed && !pcmsContext.allow)\n    return [{...BLACKHOLE_PROXY,connectionIsolationKey:details.cookieStoreId||'pcms-held'},null];", "S01 proxy initial pin");
  bg = substituteOnce(bg, "    return buildProxyInfo(effectiveRoute, details.cookieStoreId || `tab-${details.tabId}`);", "    const latestPcmsState = pcmsContext.managed ? await getState() : state;\n    if(pcmsContext.managed &&\n        (!inspectRoutePin(latestPcmsState.profiles?.[details.cookieStoreId]).allow ||\n         decision.route?.id !== latestPcmsState.profiles?.[details.cookieStoreId]?.routeId))\n      return [{...BLACKHOLE_PROXY,connectionIsolationKey:details.cookieStoreId||'pcms-stale'},null];\n    return buildProxyInfo(effectiveRoute, details.cookieStoreId || `tab-${details.tabId}`);", "S01 proxy final pin");
  bg = substituteOnce(bg, "async function handleBeforeRequest(details) {\n  await initialize();\n  const state = await getState();", "async function handleBeforeRequest(details) {\n  await initialize();\n  const state = await getState();\n  const pcmsContext = await pcmsRouteGate(state.profiles?.[details.cookieStoreId]);\n  if(pcmsContext.managed && !pcmsContext.allow) {\n    recordBlock(details,'pcms-route-not-pinned');return {cancel:true};\n  }", "S01 blocking initial pin");
  bg = substituteOnce(bg, "  return {};\n}\n\nasync function fetchMullvadRelays()", "  const latestPcmsState = pcmsContext.managed ? await getState() : state;\n  if(pcmsContext.managed &&\n     (decision.mode!=='proxy' ||\n      !inspectRoutePin(latestPcmsState.profiles?.[details.cookieStoreId]).allow ||\n      decision.route?.id !== latestPcmsState.profiles?.[details.cookieStoreId]?.routeId)) {\n    recordBlock(details,'pcms-route-pin-changed');return {cancel:true};\n  }\n  return {};\n}\n\nasync function fetchMullvadRelays()", "S01 blocking final pin");
  // Reject ordinary protected-Persona deletion before its Firefox effect;
  // the state tag fence alone runs after the frozen donor's container call.
  bg=substituteOnce(bg,
    'case "DELETE_PERSONA": return localMutationFence(message.profileId, async () => ({ removed: await personaPlatform.remove(message.profileId) }));',
    `case "DELETE_PERSONA": return localMutationFence(message.profileId, async () => {
      const state=await getState();
      if(state.profiles?.[message.profileId]?.pcmsBindingId)
        throw Error("Remove this managed account in PCMS before deleting its protected Persona.");
      return {removed:await personaPlatform.remove(message.profileId,{
        expectedRevision:state.__stateMeta.revision,expectedBootId:state.__stateMeta.bootId})};
    });`,'protected Persona ordinary delete preflight');
  // Only PCMS enrollment supplies a deadline. Ordinary donor callers keep
  // their existing behavior; frozen donor source remains untouched.
  bg=substituteOnce(bg,'async function fetchMullvadRelays() {\n  const response = await fetch(MULLVAD_SOCKS_API, { cache: "no-store" });',
    'async function fetchMullvadRelays({signal}={}) {\n  const response = await fetch(MULLVAD_SOCKS_API, { cache: "no-store", signal });','S01 bounded PCMS relay catalog read');

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
  bg = substituteOnce(bg,"attachPcmsGuard({\n  initialize, securityState,\n  humanReviewTab:createHumanEditorBridge({browser,getState}),\n  manualEditorTab:createManualEditorBridge({browser,getState}),\n  shared:",
  "attachPcmsGuard({\n  initialize, securityState,\n  readRuntimeWitness:()=>nativeRequest('pcms.runtime_witness',{},6000),\n  humanReviewTab:createHumanEditorBridge({browser,getState}),\n  manualEditorTab:createManualEditorBridge({browser,getState}),\n  shared:",
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
  for (const name of ['protected-readiness.mjs','native-receipts.mjs','legacy-quarantine.mjs','creation-intake.mjs','creation-batch.mjs','creation-preview.mjs','creation-allocation.mjs','creation-authority.mjs','creation-inventory.mjs','creation-import-authority.mjs','creation-effects.mjs','creation-git.mjs','creation-git-owner.mjs','creation-git-runner.mjs','creation-runner.mjs','creation-watch.mjs','coordinator-core.mjs','coordinator-store.mjs','coordinator-boundary.mjs','s08-cleanup-boundary.mjs','diagnostic-startup.mjs','operator-record-boundary.mjs','pcms-donor-fence.mjs','network-ledger.mjs','route-pin.mjs','enrollment.mjs','qualified-clock.mjs','entry.mjs', 'wake.mjs', 'dashboard-action.mjs', 'persona-guard.mjs', 'operation-context.mjs', 'journal.mjs', 'command-boundary.mjs', 'notices.mjs', 'accounts.mjs', 'account-boundary.mjs', 'inventory.mjs', 'inventory-boundary.mjs', 'perchance-readback.mjs', 'perchance-observer.mjs', 'git-source.mjs', 'source-boundary.mjs', 'git-catalog.mjs', 'git-local-secret.mjs', 'identity-reconciliation.mjs', 'git-prompt.mjs', 'catalog-bootstrap.mjs', 'catalog-import.mjs', 'catalog-import-preview.mjs', 'catalog-prompt-store.mjs', 'catalog-resume.mjs', 'catalog-declaration.mjs', 'catalog-ready-store.mjs', 'ready-planner.mjs', 'ready-git-prompt.mjs', 'ready-git-source.mjs', 'ready-native-source.mjs', 'ai-declarative-assertion.mjs', 'ready-ai-gate.mjs', 'ready-source-safety.mjs','restored-source.mjs', 'ready-store.mjs', 'ready-intake.mjs', 'ready-operator.mjs', 'ready-development.mjs', 's06-output-proof.mjs', 's06-writeback-progress.mjs','s06-publication-progress.mjs','clean-bulk-authority.mjs','clean-bulk-release.mjs','clean-bulk-boundary.mjs', 's06-review-queue.mjs', 's06-request-changes.mjs', 's06-human-review.mjs', 's06-exception-review.mjs','exception-idle.mjs', 's06-standing-authority.mjs','s06-authority-bootstrap.mjs', 'readiness-boundary.mjs','catalog-boundary.mjs', 'catalog-identity-review.mjs','folder-existing-rename.mjs','folder-rename-link.mjs','folder-rename-safety.mjs','folder-identity-boundary.mjs', 'creation-catalog.mjs', 'catalog-watch.mjs', 'supply-plan.mjs', 'supply-store.mjs', 'perchance-supply.mjs', 'supply-git.mjs', 'supply-boundary.mjs', 'adoption.mjs', 'adoption-store.mjs', 'adoption-git.mjs', 'original-archive.mjs','adoption-recovery.mjs','adoption-recovery-bridge.mjs', 'adoption-boundary.mjs',
    'staging-core.mjs','staging-store.mjs','staging-boundary.mjs',
    'human-editor-bridge.mjs','manual-editor-bridge.mjs','stage-editor-bridge.mjs','perchance-stage.mjs','editor-strip.mjs','perchance-editor-probe.mjs','perchance-ai-native.mjs','perchance-ai-oracle.mjs','perchance-ai-opfs.mjs','perchance-ai-history.mjs','ai-supervisor.mjs','ai-testing.mjs','ai-evidence.mjs','ai-store.mjs','ai-boundary.mjs',
    'git-credential.mjs','diagnostic-ready-git.mjs','git-writeback.mjs','writeback-store.mjs','writeback-boundary.mjs',
    'update-window.mjs','release-core.mjs','release-store.mjs','release-boundary.mjs','source-review.mjs','perchance-release.mjs',
    'existing-update-core.mjs','existing-update-store.mjs','existing-update-boundary.mjs','perchance-existing.mjs',
    'backup-auto-donor.mjs','backup-donor-port.mjs','restore-donor.mjs','restore-preserve.mjs','restore-identities.mjs','restore-exits.mjs','restore-v2-candidate.mjs','restore-boundary.mjs','restore-observation.mjs','work-checkpoint.mjs','restore-reconcile.mjs','backup-auto-core.mjs','backup-auto-store.mjs','backup-auto-download.mjs',
    'backup-auto-retention.mjs','backup-auto-export.mjs','portable-archive.mjs','portable-local.mjs','presentation-preferences.mjs','presentation-boundary.mjs','functional-restore.mjs','portable-cut.mjs','portable-runner.mjs','portable-originals.mjs','portable-restore-stage.mjs','portable-restore-plan.mjs','source-cut-retry.mjs','backup-v2-verify.mjs','backup-auto-run.mjs','backup-auto-boundary.mjs',
    'refresher-native.mjs','refresher-qualified-clock.mjs','refresher-browser-clock.mjs','refresher-adopted.mjs','refresher-admission.mjs','refresher-effect-core.mjs','refresher-core.mjs','refresher-store.mjs','refresher-boundary.mjs','perchance-monitor.mjs']) {
    await cp(path.join(root, 'src/runtime', name), path.join(stage, 'pcms', name));
  }
}
