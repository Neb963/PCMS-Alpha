function fakeDonor(relays,{n=0,made=0}={}){
  const effects=[],profiles=new Map(),routes=new Map();
  const faults={},tabs=new Set(),leases=new Set(),live=new Set();
  const exitOf=routeId=>relays.find(r=>r.host===routes.get(routeId)?.host);
  const evidence=(routeId,relay)=>{
    live.add(routeId); // a probe (re)prepares the route's native forwarder
    if(faults.host)return {ok:false,code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE',failure:'HOST'};
    if(relay.down)return {ok:false,code:'ROUTE_CONNECTION_FAILED',failure:'ROUTE'};
    return {ok:true,source:'DONOR_ROUTE_PROBE',evidenceId:'evidence_'+(++n).toString().padStart(6,'0'),
      routeId,ipv4:{state:'OBSERVED',address:relay.v4},
      ipv6:relay.v6==='BLOCKED'?{state:'BLOCKED_VERIFIED',basis:'RELAY_REPORTED_IPV6_UNREACHABLE'}:
        relay.v6?{state:'OBSERVED',address:relay.v6}:{state:'UNKNOWN'},
      dns:'VERIFIED_PROTECTED',observedAtMs:Date.now()+n};
  };
  const bound=bindingId=>[...profiles.entries()].filter(([,p])=>p.pcmsBindingId===bindingId);
  const byUid=uid=>[...profiles.entries()].filter(([,p])=>p.personaUid===uid);
  const donor={
    async tagExistingPersona({bindingId,personaUid}){
      const already=bound(bindingId);
      if(already.length)return {ok:true,personaUid:already[0][1].personaUid,contextId:already[0][0],routeId:already[0][1].routeId};
      const f=byUid(personaUid);
      if(f.length!==1)return {ok:false,code:f.length?'PERSONA_AMBIGUOUS':'PERSONA_NOT_FOUND'};
      const [contextId,p]=f[0];
      if(p.pcmsBindingId)return {ok:false,code:'PERSONA_BOUND_TO_OTHER_ACCOUNT'};
      p.pcmsBindingId=bindingId;effects.push({kind:'TAG',bindingId});
      if(faults.lostTagAck){faults.lostTagAck=false;return {ok:false,code:'PERSONA_TAG_UNCONFIRMED'};}
      return {ok:true,personaUid,contextId,routeId:p.routeId};
    },
    async inspectRouteUse({personaUid}){
      const f=byUid(personaUid);
      if(f.length!==1)return {ok:false,code:f.length?'PERSONA_AMBIGUOUS':'PERSONA_NOT_FOUND'};
      const [contextId,p]=f[0];
      const inUse=tabs.has(contextId)||leases.has(contextId);
      if(!routes.has(p.routeId))return {ok:true,releasable:false,reason:'NO_ROUTE_RESOURCE',routeId:p.routeId,inUse};
      if([...profiles.values()].some(o=>o!==p&&o.routeId===p.routeId))return {ok:true,releasable:false,reason:'RESOURCE_SHARED',inUse};
      if(inUse)return {ok:true,releasable:false,reason:'RESOURCE_IN_USE',inUse};
      return {ok:true,releasable:true,routeId:p.routeId,contextId,inUse};
    },
    async releaseIdleRoute({personaUid,routeId}){
      const [contextId,p]=byUid(personaUid)[0]||[];
      if(!p||p.routeId!==routeId)return {ok:false,code:'ROUTE_CHANGED'};
      if(leases.has(contextId)||tabs.has(contextId))return {ok:false,code:'RESOURCE_IN_USE'};
      if(faults.host)return {ok:false,code:'RELEASE_UNCONFIRMED'};
      effects.push({kind:'RELEASE',routeId});
      if(faults.nativeGoneOnRelease){faults.nativeGoneOnRelease=false;
        if(faults.releaseApplied)live.delete(routeId);return {ok:false,code:'RELEASE_UNCONFIRMED'};}
      const was=live.delete(routeId);return {ok:true,released:was};
    },
    async observeRouteReleased({routeId}){
      if(faults.host)return {ok:false,code:'NATIVE_UNAVAILABLE'};
      return {ok:true,released:!live.has(routeId)};
    },
    async boundPersona({bindingId}){
      const f=bound(bindingId);
      if(f.length!==1)return {ok:false,code:f.length?'BINDING_PERSONA_AMBIGUOUS':'BINDING_PERSONA_ABSENT'};
      const [contextId,p]=f[0];return {ok:true,personaUid:p.personaUid,contextId,routeId:p.routeId};
    },
    async createBoundPersona({bindingId}){
      if(!bound(bindingId).length){
        const contextId='firefox-container-'+(++made).toString().padStart(4,'0');
        profiles.set(contextId,{personaUid:'persona-'+contextId.slice(-4)+'-uid0',pcmsBindingId:bindingId,routeId:'__block__'});
        effects.push({kind:'PERSONA_CREATE',bindingId});
        if(faults.lostCreateAck){faults.lostCreateAck=false;return {ok:false,code:'PERSONA_CREATE_UNCONFIRMED'};}
      }
      return donor.boundPersona({bindingId});
    },
    async candidateRoutes({bindingId,excludeRouteIds=[]}){
      const used=new Set([...profiles.values()].filter(p=>p.pcmsBindingId!==bindingId).map(p=>p.routeId));
      const own=bound(bindingId)[0]?.[1]?.routeId;
      const existing=[...routes.keys()].filter(id=>!used.has(id)&&!excludeRouteIds.includes(id))
        .sort((x,y)=>(x===own?0:1)-(y===own?0:1)).map(routeId=>({kind:'ROUTE',routeId}));
      const hosts=new Set([...routes.values()].map(r=>r.host));
      const taggedBindings=[...profiles.values()].map(p=>p.pcmsBindingId).filter(id=>id!==bindingId);
      return {ok:true,taggedBindings,candidates:[...existing,...relays.filter(r=>!hosts.has(r.host))
        .map(r=>({kind:'RELAY',relay:{ipv4_address:r.host,port:1080}}))]};
    },
    async ensureRoute(c){
      if(c.kind==='ROUTE')return {ok:true,routeId:c.routeId};
      const same=[...routes.entries()].find(([,r])=>r.host===c.relay.ipv4_address);
      if(same)return {ok:true,routeId:same[0]};
      const id='mullvad-'+(routes.size+1).toString().padStart(4,'0');
      routes.set(id,{host:c.relay.ipv4_address});effects.push({kind:'ROUTE_CREATE',id});
      return {ok:true,routeId:id};
    },
    async probeCandidate({routeId}){effects.push({kind:'PROBE',routeId});return evidence(routeId,exitOf(routeId));},
    async probeAssigned({bindingId,contextId,routeId}){
      const p=profiles.get(contextId);
      if(p?.pcmsBindingId!==bindingId||p.routeId!==routeId)return {ok:false,code:'ASSIGNED_ROUTE_CHANGED',failure:'ROUTE'};
      effects.push({kind:'PROBE_ASSIGNED',routeId});return evidence(routeId,exitOf(routeId));
    },
    async assignRoute({bindingId,contextId,routeId}){
      const p=profiles.get(contextId);
      if(p?.pcmsBindingId!==bindingId)return {ok:false,code:'BINDING_PERSONA_CHANGED'};
      if(p.routeId!==routeId){p.routeId=routeId;effects.push({kind:'ASSIGN',contextId,routeId});}
      if(faults.lostAssignAck){faults.lostAssignAck=false;return {ok:false,code:'ROUTE_ASSIGN_UNCONFIRMED'};}
      return {ok:true};
    }
  };
  // An account bound by the pre-S01 manual flow: an untagged Persona on an
  // existing route created outside PCMS.
  const legacyPersona=(host)=>{
    const contextId='firefox-container-'+(++made).toString().padStart(4,'0');
    const routeId='legacy-route-'+(routes.size+1).toString().padStart(4,'0');
    routes.set(routeId,{host});
    const personaUid='persona-'+contextId.slice(-4)+'-uid0';
    profiles.set(contextId,{personaUid,pcmsBindingId:null,routeId});
    return {personaUid,contextId,routeId};
  };
  return {donor,effects,profiles,routes,faults,tabs,leases,live,legacyPersona,counters:()=>({n,made})};
}
export async function installJourneyFixture(){
 const {openCanonicalDatabase}=await import('./journal.mjs');
 const {createAccountBoundary}=await import('./account-boundary.mjs');
 const {createInventoryBoundary}=await import('./inventory-boundary.mjs');
 const {createAccountStore}=await import('./accounts.mjs');
 const {createExitLedger}=await import('./network-ledger.mjs');
 const pin=await import('./route-pin.mjs');
 const open=()=>openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-j01-ui-fixture',version)});
 const db=await open(),accounts=createAccountStore(db),ledger=createExitLedger(db);
 const key='j01UiFixtureOracle',raw=(await browser.storage.local.get(key))[key];
 const relays=Array.from({length:12},(_,i)=>({host:'10.124.0.'+(i+1),v4:'45.83.'+(i+1)+'.1',v6:'BLOCKED'}));
 const d=fakeDonor(relays,raw?.counters),sessions=new Map(raw?.sessions||[]),opened=raw?.opened||[],controls=raw?.controls||{inventoryFailure:false};
 if(raw){
  for(const [map,key] of [[d.profiles,'profiles'],[d.routes,'routes']])for(const [id,value] of raw[key]||[])map.set(id,value);
  d.effects.push(...raw.effects||[]);for(const id of raw.live||[])d.live.add(id);
 }
 // The synthetic donor is an independent durable effect oracle in storage.
 // Production canonical state remains in a distinct REAL Firefox IDB.
 const save=()=>browser.storage.local.set({[key]:{profiles:[...d.profiles],routes:[...d.routes],
  effects:d.effects,counters:d.counters(),live:[...d.live],sessions:[...sessions],opened,controls}});
 const donor=new Proxy(d.donor,{get:(target,name)=>{
  if(name==='removeAccountPersona')return async({personaUid})=>{
   for(const [id,p] of d.profiles)if(p.personaUid===personaUid){d.profiles.delete(id);d.effects.push({kind:'PERSONA_REMOVE',personaUid})}
   await save();return {ok:true,removed:true};
  };
  const fn=target[name];return typeof fn==='function'?async(...args)=>{try{return await fn(...args)}finally{await save()}}:fn;
 }});
 const profile=uid=>{const entry=[...d.profiles].find(([,p])=>p.personaUid===uid);
  return entry?{...entry[1],containerId:entry[0],managed:true,killSwitch:true}:null};
 pin.closeRoutePins();pin.configureRoutePinSource(()=>ledger.pins());await pin.reloadRoutePins();
 const guard={
  enrollmentDonor:donor,
  async getSafeRouteReadiness(uid){
   const p=profile(uid);if(!p)return {ready:false,code:'PERSONA_NOT_FOUND'};
   const admission=pin.inspectRoutePin(p);
   return admission.allow?{ready:true,personaUid:uid,cookieStoreId:p.containerId,routeId:p.routeId}:
    {ready:false,code:admission.reason};
  },
  async openHumanLogin(uid){
   const ready=await guard.getSafeRouteReadiness(uid);if(!ready.ready)return {ok:false,code:ready.code};
   opened.push({personaUid:uid,routeId:ready.routeId});await save();return {ok:true,opened:true};
  }
 };
 const api={runtime:browser.runtime,storage:browser.storage};
 const inventory=createInventoryBoundary(api,{open,guard:()=>guard,inventoryReader:async(ctx)=>{
  if(controls.inventoryFailure)return {ok:false,code:'INVENTORY_UNAVAILABLE'};
  return {source:'GUARDED_PERCHANCE_READBACK',complete:true,...ctx,observationId:'j01_inventory_'+crypto.randomUUID(),
   observedAt:Date.now(),generators:[{slug:'j01-owned-'+ctx.accountId.slice(-8),remoteId:'j01_remote_'+ctx.accountId.slice(-8),
    ownerResult:'IS_OWNER',ownerPrincipalFingerprint:ctx.principalFingerprint,
    ownerObservationId:'j01_owner_'+crypto.randomUUID(),visibility:'UNLISTED'}]};
 }});
 const boundary=createAccountBoundary(api,{open,guard:()=>guard,
  pins:{hold:pin.holdRoutePin,release:pin.releaseRoutePinHold,reload:pin.reloadRoutePins},
  identityReader:async(ctx)=>sessions.has(ctx.personaUid)?{
   source:'GUARDED_SESSION_READBACK',verified:true,personaUid:ctx.personaUid,
   principalFingerprint:sessions.get(ctx.personaUid),observationId:'j01_identity_'+crypto.randomUUID()}:null,
  syncInventory:inventory.syncAccount,backupRequester:{requestFreshAfterRemoval:async()=>({ok:false,code:'FIXTURE_NO_DOWNLOAD'})}});
 const original=browser.runtime.connect.bind(browser.runtime),commands=[];
 const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#accounts'};
 const shim=function(...args){
  const name=args.at(-1)?.name;
  if(!['pcms-i03-accounts','pcms-i04-inventory'].includes(name))return original(...args);
  const messageListeners=new Set(),disconnectListeners=new Set();let closed=false;
  const port={onMessage:{addListener:fn=>messageListeners.add(fn)},onDisconnect:{addListener:fn=>disconnectListeners.add(fn)},
   disconnect(){closed=true},
   postMessage(message){
    commands.push({name,type:message.type,params:message.params});
    Promise.resolve((name==='pcms-i03-accounts'?boundary:inventory).run(message,sender)).then(value=>{
     if(!closed)for(const fn of messageListeners)fn(value);
    }).catch(()=>{if(!closed)for(const fn of disconnectListeners)fn()});
   }};
  return port;
 };
 browser.runtime.connect=shim;
 if(browser.runtime.connect!==shim)throw Error('J01_TEST_PORT_INJECTION_UNAVAILABLE');
 window.__j01={
  async inspect(){return {accounts:(await accounts.list()).accounts,ledger:(await ledger.read()).ledger,
    effects:structuredClone(d.effects),profiles:[...d.profiles.values()],opened:structuredClone(opened),commands:structuredClone(commands)}},
  async session(accountId,principal){const a=(await accounts.get(accountId)).account;
   if(principal)sessions.set(a.personaUid,principal);else sessions.delete(a.personaUid);await save()},
  async inventoryFailure(value){controls.inventoryFailure=value;await save()},
  async helperFailure(value){d.faults.host=value;await save()},
  async legacy(){const p=d.legacyPersona('10.124.0.12'),accountId='j01_legacy_account';
   const enrolled=await accounts.apply({type:'ENROLL',accountId,personaUid:p.personaUid,expectedRevision:0});
   const verified=await accounts.apply({type:'VERIFY',accountId,expectedRevision:enrolled.account.revision,
    proof:{source:'GUARDED_SESSION_READBACK',verified:true,personaUid:p.personaUid,principalFingerprint:'c'.repeat(64),observationId:'j01_legacy_identity'}});
   if(!verified.ok)throw Error('LEGACY_SEED_FAILED');sessions.set(p.personaUid,'c'.repeat(64));await save();return accountId},
  async dropPersona(accountId){const a=(await accounts.get(accountId)).account;
   for(const [id,p] of d.profiles)if(p.personaUid===a.personaUid)d.profiles.delete(id);await save()}
 };
 return {ok:true,scope:'B_OFFLINE_DONOR_AND_PROVIDER_FIXTURE_REAL_PRODUCTION_BOUNDARIES_IDB'};
}
