import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildI00} from '../scripts/build-i00.mjs';
import {trackPcmsWork} from '../src/runtime/work-checkpoint.mjs';
import * as pins from '../src/runtime/route-pin.mjs';
import {beforeDonorStateCommit,issueBoundPersonaCreatePermit,issueExistingPersonaTagPermit} from '../src/runtime/pcms-donor-fence.mjs';
globalThis.crypto??=webcrypto;

const route={id:'mullvad-0001',provider:'mullvad',host:'10.124.0.1',port:1080,type:'socks',enabled:true};
const tagged={pcmsBindingId:'binding_0001',personaUid:'persona-0001',routeId:route.id,
  containerId:'firefox-container-001',managed:true,status:'active',killSwitch:true,blockLocalNetwork:true};
const buildDirectory=await mkdtemp(path.join(tmpdir(),'pcms-routing-test-'));
after(()=>rm(buildDirectory,{recursive:true,force:true}));
let staged;
async function background(){
  staged??=(await buildI00({packageArchive:false,buildDirectory})).stage;
  return readFile(path.join(staged,'background.js'),'utf8');
}
const slice=(bg,begin,end)=>{
  const a=bg.indexOf(begin),b=bg.indexOf(end,a+begin.length);
  assert.ok(a>=0&&b>a,'production splice present: '+begin);
  return bg.slice(a,b);
};
// The exact staged donor gate + handlers, with real route-pin module.
function handlers(bg,{profile=tagged,mode='proxy',onResolve=()=>{}}={}){
  const blocks=[];let resolves=0;
  const state={global:{},routes:{[route.id]:route},profiles:{[profile.containerId]:profile}};
  const ctx={...pins,URL,crypto,setTimeout,BLACKHOLE_PROXY:{type:'socks',host:'127.0.0.1',port:9},
    initialize:async()=>{},getState:async()=>structuredClone(state),extensionBaseUrl:'moz-extension://x/',
    isExtensionOrigin:d=>d.extension===true,getRouteTestRequestOverride:()=>null,isRouteTestFetchUrl:()=>false,
    routeDecision:()=>({mode,route}),securityState:{privacySafe:true},recordBlock:(_d,r)=>blocks.push(r),
    buildProxyInfo:()=>({type:'socks',host:'127.0.0.1',port:4444}),proxyInfoMatches:()=>true,
    directInfoIsDirect:()=>true,
    mullvadRuntime:{resolve:async()=>{resolves++;onResolve(state);return route;}}};
  const gate=slice(bg,'function isPcmsProviderUrl(raw) {','void reloadRoutePins();');
  const fns=vm.runInNewContext(gate+'\n'+
    slice(bg,'async function handleProxyRequest(details) {','function recordBlock(details, reason) {')+
    slice(bg,'async function handleBeforeRequest(details) {','async function fetchMullvadRelays(')+
    '\n({proxy:handleProxyRequest,before:handleBeforeRequest});',ctx);
  return {...fns,blocks,state,resolves:()=>resolves,
    details:{tabId:3,cookieStoreId:profile.containerId,url:'https://perchance.org/',proxyInfo:{}}};
}
const pinned=async(list)=>{pins.closeRoutePins();pins.configureRoutePinSource(async()=>({ok:true,pins:list}));
  assert.equal(await pins.reloadRoutePins(),true);};
const pinOf=p=>({bindingId:p.pcmsBindingId,personaUid:p.personaUid,contextId:p.containerId,routeId:p.routeId});
const plain=v=>JSON.parse(JSON.stringify(v));

test('S01 B-equivalent D: staged donor proxy AND blocking hooks block a tagged Persona with no committed pin',async()=>{
  const h=handlers(await background());
  await pinned([]);
  assert.equal((await h.proxy(h.details))[0].port,9);
  assert.deepEqual(plain(await h.before(h.details)),{cancel:true});
  assert.equal(h.resolves(),0,'native resolver never runs for unpinned managed traffic');
  assert.ok(h.blocks.includes('pcms-route-not-pinned'));
});
test('S01 positive D: a committed pin for exactly this Persona/container/route lets donor routing proceed',async()=>{
  const h=handlers(await background());
  await pinned([pinOf(tagged)]);
  assert.equal((await h.proxy(h.details)).port,4444);
  assert.deepEqual(plain(await h.before(h.details)),{});
  for(const wrong of [{routeId:'mullvad-other'},{contextId:'firefox-container-999'},{personaUid:'persona-other'}]){
    await pinned([{...pinOf(tagged),...wrong}]);
    assert.equal((await h.proxy(h.details))[0].port,9,JSON.stringify(wrong));
  }
});
test('S01 D: pin withdrawn or route changed while the donor resolver awaits is caught at the final check',async()=>{
  const bg=await background();
  await pinned([pinOf(tagged)]);
  const held=handlers(bg,{onResolve:()=>pins.holdRoutePin(tagged.pcmsBindingId)});
  assert.equal((await held.proxy(held.details))[0].port,9);
  pins.releaseRoutePinHold(tagged.pcmsBindingId);
  const moved=handlers(bg,{onResolve:s=>{s.profiles[tagged.containerId].routeId='mullvad-other';}});
  assert.deepEqual(plain(await moved.before(moved.details)),{cancel:true});
});
test('S01 D: pinned managed Persona can never go Direct; untagged ordinary Persona is unchanged',async()=>{
  const bg=await background();
  await pinned([pinOf(tagged)]);
  const direct=handlers(bg,{mode:'direct'});
  assert.equal((await direct.proxy(direct.details))[0].port,9);
  assert.deepEqual(plain(await direct.before(direct.details)),{cancel:true});
  pins.closeRoutePins(); // even with PCMS storage down
  const ordinary=handlers(bg,{profile:{...tagged,pcmsBindingId:null}});
  assert.equal((await ordinary.proxy(ordinary.details)).port,4444);
  assert.deepEqual(plain(await ordinary.before(ordinary.details)),{});
});
test('S01 review D: a pinned tagged Persona never takes the donor extension-Direct exemption for any host',async()=>{
  const h=handlers(await background());
  await pinned([pinOf(tagged)]);
  const ext={...h.details,extension:true,url:'https://user.uploads.dev/file/x'};
  assert.equal((await h.proxy(ext))[0].port,9);
  assert.deepEqual(plain(await h.before(ext)),{cancel:true});
});
test('S01 D: extension-origin Perchance requests never inherit the donor extension-Direct exemption',async()=>{
  const h=handlers(await background(),{profile:{...tagged,pcmsBindingId:null}});
  const provider={...h.details,extension:true,cookieStoreId:'firefox-default'};
  assert.equal((await h.proxy(provider))[0].port,9);
  assert.deepEqual(plain(await h.before(provider)),{cancel:true});
  assert.equal((await h.proxy({...provider,url:'https://github.com/'})).type,'direct');
});

// Production enrollment adapter from the staged background, over fake donor primitives.
function adapter(bg,{relays=[],v6='OBSERVED',nativeError=null,routeTestFails=false,tabs=new Map(),leased=new Set(),
  jobs=[],activeExits=['mullvad-7'],releaseFails=false,relayRead=null,timerSet=setTimeout,timerClear=clearTimeout,nativeStatus=null,nativeResolve=null}={}){
  const effects=[];
  let state={global:{},routes:{},profiles:{}};
  const securityState={ready:true,privacySafe:true};
  const commit=(next,permit=null)=>{beforeDonorStateCommit(state,next,permit);state=next;};
  const echo=url=>url.includes('ipv6')?(v6==='OBSERVED'?{ip:'2a03:1b20::1',mullvad_exit_ip:true}:null):
    url.includes('dnsleak')?[{ip:'10.64.0.1',mullvad_dns:true}]:{ip:'45.83.1.1',mullvad_exit_ip:true};
  const ctx={URL,crypto,AbortController,trackPcmsWork,setTimeout:timerSet,clearTimeout:timerClear,Uint32Array,JSON,Object,Array,Number,String,Promise,Set,Map,routeTestTargetLocks:new Map(),
    ...pins,issueBoundPersonaCreatePermit,issueExistingPersonaTagPermit,BLOCK_ROUTE_ID:'__block__',
    browser:{tabs:{query:async({cookieStoreId})=>tabs.get(cookieStoreId)||[]}},
    listActiveProfileIds:async()=>jobs,
    managementIntegration:{listControlLeases:async()=>[...leased].map(ctx=>({personaUid:
      Object.values(state.profiles).find(p=>p.containerId===ctx)?.personaUid}))},
    async releaseExit(routeId){effects.push('RELEASE_EXIT:'+routeId);if(releaseFails)throw Error('native host disconnected');
      const had=activeExits.includes(routeId);activeExits.splice(activeExits.indexOf(routeId)>>>0,had?1:0);return {ok:true,released:had};},
    getNativeStatus:async()=>nativeError==='HOST'?{installed:false}:{installed:true,active_exits:activeExits.map(route_id=>({route_id}))},
    MULLVAD_IPV4_CHECK_URL:'https://ipv4.am.i.mullvad.net/json',
    PCMS_IPV6_CHECK_URL:'https://ipv6.am.i.mullvad.net/json',routeTestRequests:new Map(),
    securityState,initialize:async()=>{},getState:async()=>structuredClone(state),
    allPersonaUids:()=>[],localMutationFence:async(ids,op)=>{
      // Donor fence semantics: an active control lease on a target refuses.
      if([].concat(ids).some(id=>leased.has(id)))throw Error('PERSONA_CONTROL_BUSY');return op();},
    personaPlatform:{
      async create(input,options){
        const next=structuredClone(state),id='firefox-container-'+(Object.keys(next.profiles).length+1);
        next.profiles[id]={...input.profile,routeId:input.routeId,personaUid:'persona-'+id.slice(-1)+'-0000',
          containerId:id,managed:true,status:'active'};
        effects.push('PERSONA_CREATE');commit(next,options?.pcmsStagePermit??null);
      },
      async assignRoute(id,routeId){const next=structuredClone(state);next.profiles[id].routeId=routeId;
        effects.push('ASSIGN');commit(next);}
    },
    stateManager:{async authorizePreview(id,delta){effects.push('AUTHORIZE:'+delta.length);},
      async mutate(fn,options){const next=structuredClone(state);await fn(next);effects.push('MUTATE');
        commit(next,options?.pcmsStagePermit??null);}},
    async createMullvadRoute(relay,authorizationId){
      if(!authorizationId)return {previewId:'preview_0001',delta:[{kind:'proxy-destination-added',
        after:{scheme:'socks',host:relay.ipv4_address,port:1080}}]};
      const next=structuredClone(state),id='mullvad-'+relay.ipv4_address.split('.').pop();
      next.routes[id]={id,provider:'mullvad',host:relay.ipv4_address,port:1080,type:'socks',enabled:true};
      effects.push('ROUTE_CREATE');commit(next);
    },
    fetchMullvadRelays:relayRead|| (async()=>relays),
    pcmsInspectPendingPreparation:async()=>null,
    mullvadRuntime:{resolve:nativeResolve|| (async r=>nativeError==='HOST'?null:r),drop:id=>effects.push('DROP:'+id),
      getStatus:()=>({}),recoveryGeneration:routeId=>({routeId}),
      refreshStatus:async()=>nativeStatus||(nativeError==='HOST'?{installed:false}:{installed:true,compatible:true,ready:true,interface_up:true,base_proxy_reachable:true,base_route_bound:true,pending_prepare_routes:[]})},
    async fetchJsonThroughRouteTest(_iso,_route,url){
      effects.push('PROBE:'+new URL(url).hostname.split('.')[0]);
      if(routeTestFails)throw Error('Route check timed out');
      const body=echo(url);if(!body)throw Error('NetworkError');return body;
    },
    async testProfile(id){effects.push('TEST_PROFILE');
      return routeTestFails?{ok:false,error:'Connection check failed'}:{ok:true,data:echo('ipv4')};},
    async pcmsFetchViaExit(){effects.push('NATIVE_V6_CHECK');
      if(nativeError)throw Error(nativeError);return {ok:true};}
  };
  const code=slice(bg,'function isPcmsProviderUrl(raw) {','\nasync function handleProxyRequest(details) {')
    .replace('void reloadRoutePins();','');
  const lock=slice(bg,'async function withRouteTestTargetLock(target, task, signal = null) {','async function fetchJsonThroughRouteTest(');
  const donor=vm.runInNewContext(lock+code+'\ncreatePcmsEnrollmentDonor();',ctx);
  return {donor,effects,state:()=>state,set:next=>{state=next;}};
}
const relayList=[{hostname:'se-sto-wg-socks5-001',ipv4_address:'10.124.0.7',port:1080},
  {hostname:'bad',ipv4_address:'192.168.1.1',port:1080},{hostname:'bad-port',ipv4_address:'10.124.0.8',port:9050}];

test('S01 adapter D: production adapter creates one tagged Block Persona and reconciles a repeated create',async()=>{
  const a=adapter(await background());
  const first=await a.donor.createBoundPersona({bindingId:'binding_0001',name:'PCMS account'});
  assert.equal(first.ok,true);assert.equal(first.routeId,'__block__');
  const again=await a.donor.createBoundPersona({bindingId:'binding_0001',name:'PCMS account'});
  assert.equal(again.existing,true);assert.equal(again.personaUid,first.personaUid);
  assert.deepEqual(a.effects,['PERSONA_CREATE']);
  const p=a.state().profiles[first.contextId];
  assert.equal(p.pcmsBindingId,'binding_0001');assert.equal(p.killSwitch,true);
});
test('S01 adapter D: only official Mullvad relays (10.124/16, port 1080) become routes, via one exact reviewed delta',async()=>{
  const a=adapter(await background(),{relays:relayList});
  const listed=await a.donor.candidateRoutes({bindingId:'binding_0001'});
  assert.deepEqual(plain(listed.candidates.map(c=>c.relay?.ipv4_address)),['10.124.0.7']);
  const made=await a.donor.ensureRoute(listed.candidates[0]);
  assert.equal(made.ok,true);
  assert.equal((await a.donor.ensureRoute(listed.candidates[0])).routeId,made.routeId,'idempotent by relay');
  assert.deepEqual(a.effects,['AUTHORIZE:1','ROUTE_CREATE']);
  assert.equal((await a.donor.ensureRoute({kind:'RELAY',relay:{ipv4_address:'1.2.3.4',port:1080}})).code,'RELAY_INVALID');
});
test('S01 adapter D: probe reports observed IPv4/IPv6; IPv6 blocking only from a relay SOCKS reply 3/8',async()=>{
  const bg=await background();
  for(const [opts,expected] of [
    [{},'OBSERVED'],
    [{v6:'FAIL',nativeError:'Mullvad SOCKS connect failed with code 3'},'BLOCKED_VERIFIED'],
    [{v6:'FAIL',nativeError:'Mullvad SOCKS connect failed with code 4'},'UNKNOWN'],
    [{v6:'FAIL',nativeError:'Route check timed out'},'UNKNOWN']]){
    const a=adapter(bg,{relays:relayList,...opts});
    const r=await a.donor.ensureRoute((await a.donor.candidateRoutes({bindingId:'binding_0001'})).candidates[0]);
    const ev=await a.donor.probeCandidate({routeId:r.routeId});
    assert.equal(ev.ok,true);assert.equal(ev.ipv6.state,expected,JSON.stringify(opts));
    assert.equal(ev.ipv4.address,'45.83.1.1');assert.equal(ev.dns,'VERIFIED_PROTECTED');
  }
});
test('S01 adapter D: native loss is HOST scope (no rotation); a failing route test is ROUTE scope',async()=>{
  const bg=await background();
  const host=adapter(bg,{relays:relayList,nativeError:'HOST'});
  const r=await host.donor.ensureRoute((await host.donor.candidateRoutes({bindingId:'binding_0001'})).candidates[0]);
  assert.equal((await host.donor.probeCandidate({routeId:r.routeId})).failure,'HOST');
  const down=adapter(bg,{relays:relayList,routeTestFails:true});
  const persona=await down.donor.createBoundPersona({bindingId:'binding_0001',name:'x'});
  const r2=await down.donor.ensureRoute((await down.donor.candidateRoutes({bindingId:'binding_0001'})).candidates[0]);
  assert.equal((await down.donor.assignRoute({bindingId:'binding_0001',personaUid:persona.personaUid,
    contextId:persona.contextId,routeId:r2.routeId})).ok,true);
  const probed=await down.donor.probeAssigned({bindingId:'binding_0001',contextId:persona.contextId,routeId:r2.routeId});
  assert.equal(probed.failure,'ROUTE');assert.equal(probed.code,'ROUTE_CONNECTION_FAILED');
  assert.ok(down.effects.includes('TEST_PROFILE'),'assigned check uses donor testProfile');
});

const legacyState=()=>({global:{},routes:{'mullvad-7':{id:'mullvad-7',provider:'mullvad',host:'10.124.0.7',port:1080,type:'socks',enabled:true}},
  profiles:{'firefox-container-7':{containerId:'firefox-container-7',personaUid:'persona-legacy-0007',managed:true,
    status:'active',routeId:'mullvad-7',killSwitch:true,blockLocalNetwork:true,pcmsBindingId:null}}});
test('F1 donor observation: a never-settling native preparation times out visibly without releasing its route owner or probing after late settlement',async()=>{
 let finish,calls=0;const gate=new Promise(r=>finish=r),a=adapter(await background(),{
  timerSet:(fn,ms)=>setTimeout(fn,ms===30000?20:ms),nativeResolve:async route=>{calls++;await gate;return route}});
 const state=legacyState();state.profiles['firefox-container-7'].pcmsBindingId='binding_0007';a.set(state);
 const args={bindingId:'binding_0007',contextId:'firefox-container-7',routeId:'mullvad-7'};
 try{
  const out=await a.donor.probeAssigned(args);assert.equal(out.code,'ROUTE_OBSERVATION_TIMEOUT');assert.equal(out.preparationSettled,false);
  assert.equal((await a.donor.probeAssigned(args)).code,'MULLVAD_ROUTE_UNCONFIRMED');
  assert.equal((await a.donor.inspectPreparation({routeId:args.routeId})).ok,false);assert.equal(calls,1);
 }finally{finish();await new Promise(r=>setImmediate(r));}
 assert.equal(a.effects.some(x=>x.startsWith('PROBE:')||x==='TEST_PROFILE'),false,'aborted native observer cannot continue to network or cleanup');
 assert.equal((await a.donor.inspectPreparation({routeId:args.routeId})).settled,true);
 assert.equal((await a.donor.probeAssigned(args)).ok,true);assert.equal(calls,2);
});
test('F1 donor restart: an unresolved durable preparation is inspected without dispatching another prepare',async()=>{
 let calls=0;const a=adapter(await background(),{nativeResolve:async r=>{calls++;return r},
  nativeStatus:{installed:true,compatible:true,ready:true,pending_prepare_routes:['mullvad-7']}});
 a.set(legacyState());const out=await a.donor.inspectPreparation({routeId:'mullvad-7'});
 assert.equal(out.ok,false);assert.equal(out.code,'MULLVAD_ROUTE_UNCONFIRMED');assert.equal(calls,0);assert.deepEqual(a.effects,[]);
});

test('S01 upgrade adapter D: production adapter tags the EXISTING Persona in place (route/session untouched), idempotently',async()=>{
  const a=adapter(await background());a.set(legacyState());
  const out=await a.donor.tagExistingPersona({bindingId:'binding_0007',personaUid:'persona-legacy-0007'});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.contextId,'firefox-container-7');assert.equal(out.routeId,'mullvad-7');
  const p=a.state().profiles['firefox-container-7'];
  assert.equal(p.pcmsBindingId,'binding_0007');assert.equal(p.routeId,'mullvad-7');
  assert.equal((await a.donor.tagExistingPersona({bindingId:'binding_0007',personaUid:'persona-legacy-0007'})).ok,true);
  assert.deepEqual(plain(a.effects),['MUTATE'],'second call reconciles by state, no second mutation');
  assert.equal((await a.donor.tagExistingPersona({bindingId:'binding_other',personaUid:'persona-legacy-0007'})).code,
    'PERSONA_BOUND_TO_OTHER_ACCOUNT');
  assert.equal((await a.donor.tagExistingPersona({bindingId:'binding_0008',personaUid:'persona-missing-0001'})).code,
    'PERSONA_NOT_FOUND');
  const leased=adapter(await background(),{leased:new Set(['firefox-container-7'])});leased.set(legacyState());
  assert.equal((await leased.donor.tagExistingPersona({bindingId:'binding_0007',personaUid:'persona-legacy-0007'})).code,
    'PERSONA_TAG_UNCONFIRMED','donor lease blocks the tag; reported, not assumed');
});

test('S01 release adapter D: only an idle, unshared, unleased forwarder is released; global tunnel untouched',async()=>{
  const bg=await background();
  const idle=adapter(bg);idle.set(legacyState());
  assert.equal((await idle.donor.inspectRouteUse({personaUid:'persona-legacy-0007'})).releasable,true);
  const out=await idle.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'});
  assert.deepEqual(plain(out),{ok:true,released:true});
  assert.deepEqual(plain(idle.effects),['DROP:mullvad-7','RELEASE_EXIT:mullvad-7']);
  assert.deepEqual(plain(await idle.donor.observeRouteReleased({routeId:'mullvad-7'})),{ok:true,released:true});
  assert.deepEqual(plain(await idle.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'})),
    {ok:true,released:false},'already released is reported, not re-invented');
  const tab=adapter(bg,{tabs:new Map([['firefox-container-7',[{id:1}]]])});tab.set(legacyState());
  assert.equal((await tab.donor.inspectRouteUse({personaUid:'persona-legacy-0007'})).reason,'RESOURCE_IN_USE');
  assert.equal((await tab.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'})).code,'RESOURCE_IN_USE');
  const job=adapter(bg,{jobs:['firefox-container-7']});job.set(legacyState());
  assert.equal((await job.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'})).code,'RESOURCE_IN_USE');
  const lease=adapter(bg,{leased:new Set(['firefox-container-7'])});lease.set(legacyState());
  assert.equal((await lease.donor.inspectRouteUse({personaUid:'persona-legacy-0007'})).reason,'RESOURCE_IN_USE',
    'a control lease is seen BEFORE the pin is withdrawn');
  assert.equal((await lease.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'})).code,'RESOURCE_IN_USE');
  const rotating=adapter(bg);const rs=legacyState();
  rs.profiles['firefox-container-7'].rotationRole='source';rotating.set(rs);
  assert.equal((await rotating.donor.inspectRouteUse({personaUid:'persona-legacy-0007'})).code,'PERSONA_NOT_ACTIVE',
    'a rotating Persona is never reported missing');
  const shared=adapter(bg);const st=legacyState();
  st.profiles['firefox-container-8']={...st.profiles['firefox-container-7'],containerId:'firefox-container-8',personaUid:'persona-other-0008'};
  shared.set(st);
  assert.equal((await shared.donor.inspectRouteUse({personaUid:'persona-legacy-0007'})).reason,'RESOURCE_SHARED');
  assert.equal((await shared.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'})).code,'RESOURCE_SHARED');
  for(const h of [tab,job,lease,shared])assert.equal(h.effects.some(e=>String(e).startsWith('RELEASE_EXIT')),false);
  const lost=adapter(bg,{releaseFails:true});lost.set(legacyState());
  assert.equal((await lost.donor.releaseIdleRoute({personaUid:'persona-legacy-0007',routeId:'mullvad-7'})).code,'RELEASE_UNCONFIRMED');
  const gone=adapter(bg,{nativeError:'HOST'});gone.set(legacyState());
  assert.equal((await gone.donor.observeRouteReleased({routeId:'mullvad-7'})).code,'NATIVE_UNAVAILABLE');
  assert.equal(bg.includes('stopTunnel()')&&slice(bg,'function createPcmsEnrollmentDonor(){','function pcmsProfileByUid').includes('stopTunnel'),false,
    'the adapter never stops the shared tunnel');
});

test('J01 donor candidate probes release unused forwarders and preserve assigned routes',async()=>{
 const bg=await background();
 const unused=adapter(bg,{relays:relayList});
 const c=(await unused.donor.candidateRoutes({bindingId:'binding_0001'})).candidates[0];
 const r=await unused.donor.ensureRoute(c);
 assert.equal((await unused.donor.probeCandidate({routeId:r.routeId})).ok,true);
 assert.ok(unused.effects.includes('DROP:'+r.routeId));
 assert.ok(unused.effects.includes('RELEASE_EXIT:'+r.routeId));
 const assigned=adapter(bg);assigned.set(legacyState());
 assert.equal((await assigned.donor.probeCandidate({routeId:'mullvad-7'})).ok,true);
 assert.ok(!assigned.effects.includes('DROP:mullvad-7'));
 assert.ok(!assigned.effects.includes('RELEASE_EXIT:mullvad-7'));
 const unavailable=adapter(bg,{relays:relayList,releaseFails:true});
 const r2=await unavailable.donor.ensureRoute((await unavailable.donor.candidateRoutes({bindingId:'binding_0001'})).candidates[0]);
 assert.equal((await unavailable.donor.probeCandidate({routeId:r2.routeId})).code,'CANDIDATE_RELEASE_UNCONFIRMED');
});

test('PCMS relay catalog timeout aborts the actual read and preserves existing route candidates without mutation',async()=>{
 const bg=await background(),timers=[];let observedSignal=null,cleared=false;
 const a=adapter(bg,{relayRead:({signal})=>new Promise((resolve,reject)=>{observedSignal=signal;signal.addEventListener('abort',()=>reject(signal.reason));}),
  timerSet:(fn,ms)=>{timers.push({fn,ms});return 19;},timerClear:id=>{assert.equal(id,19);cleared=true;}});
 a.set({global:{},profiles:{},routes:{[route.id]:route}});
 const result=a.donor.candidateRoutes({bindingId:'binding_timeout'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(timers.length,1);assert.equal(timers[0].ms,10000);assert.equal(observedSignal.aborted,false);
 timers[0].fn();const listed=await result;assert.equal(observedSignal.aborted,true);assert.equal(cleared,true);assert.equal(listed.relayList,'UNAVAILABLE');
 assert.deepEqual(Array.from(listed.candidates,c=>c.routeId),[route.id]);assert.deepEqual(a.effects,[]);
 assert.match(bg,/fetch\(MULLVAD_SOCKS_API, \{ cache: "no-store", signal \}\)/);
});

test('Issue60: tunnel-up/proxy-down is a host connection hold, not missing helper or a reason to rotate relays',async()=>{
 const a=adapter(await background(),{nativeError:'HOST',nativeStatus:{installed:true,compatible:true,interface_up:true,base_route_bound:true,base_proxy_reachable:false,ready:false}});
 const probe=await a.donor.probeCandidate({routeId:'mullvad-7'});
 // Install a route using the same donor-owned path before its observation.
 a.set({...legacyState(),profiles:{}});
 const out=await a.donor.probeCandidate({routeId:'mullvad-7'});
 assert.equal(out.code,'MULLVAD_PROXY_UNREACHABLE');assert.equal(out.failure,'HOST');
 assert.equal(a.effects.filter(x=>x==='ROUTE_CREATE'||x==='ASSIGN').length,0);
 assert.equal((await a.donor.inspectConnection()).tunnelUp,true);
 assert.equal((await a.donor.inspectConnection()).proxyReachable,false);
});
test('Issue60: aborting a queued verifier releases no successor before its original predecessor settles',async()=>{
 const bg=await background(),code=slice(bg,'async function withRouteTestTargetLock(target, task, signal = null) {','async function fetchJsonThroughRouteTest(');
 const lock=vm.runInNewContext(code+'\nwithRouteTestTargetLock',{routeTestTargetLocks:new Map()});
 const events=[];let release;const gate=new Promise(resolve=>release=resolve);
 const first=lock('fixed-echo',async()=>{events.push('first');await gate;events.push('settled')});
 await new Promise(resolve=>setImmediate(resolve));
 const abort=new AbortController(),second=lock('fixed-echo',async()=>{events.push('cancelled must not run')},abort.signal).catch(e=>({cancelled:/cancelled/.test(e.message)}));
 abort.abort();const third=lock('fixed-echo',async()=>{events.push('third')});
 try{
  const out=await Promise.race([second,new Promise(resolve=>setTimeout(()=>resolve({cancelled:false}),40))]);
  assert.equal(out.cancelled,true);assert.deepEqual(events,['first']);
 }finally{release();await first;await second;await third;}
 assert.deepEqual(events,['first','settled','third']);
});
