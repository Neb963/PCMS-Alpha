import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createAccountStore} from '../src/runtime/accounts.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {createExitLedger,LEDGER_KEY} from '../src/runtime/network-ledger.mjs';
import {createEnrollment} from '../src/runtime/enrollment.mjs';
import {configureRoutePinSource,closeRoutePins,reloadRoutePins,holdRoutePin,
  releaseRoutePinHold,inspectRoutePin} from '../src/runtime/route-pin.mjs';
globalThis.crypto??=webcrypto;

// Fake PersonaMonkey honouring the same adapter contract as the production
// overlay adapter: state-read reconciliation, no hidden retries. Its effect
// log is the independent oracle for duplicate/blind effects.
function fakeDonor(relays){
  const effects=[],profiles=new Map(),routes=new Map();
  const faults={},tabs=new Set(),leases=new Set(),live=new Set();let n=0,made=0;
  const exitOf=routeId=>relays.find(r=>r.host===routes.get(routeId)?.host);
  const evidence=(routeId,relay)=>{
    live.add(routeId); // a probe (re)prepares the route's native forwarder
    if(faults.host)return {ok:false,code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE',failure:'HOST'};
    if(relay.down)return {ok:false,code:'ROUTE_CONNECTION_FAILED',failure:'ROUTE'};
    return {ok:true,source:'DONOR_ROUTE_PROBE',evidenceId:'evidence_'+(++n).toString().padStart(6,'0'),
      routeId,ipv4:{state:'OBSERVED',address:relay.v4},
      ipv6:relay.v6==='BLOCKED'?{state:'BLOCKED_VERIFIED',basis:'RELAY_REPORTED_IPV6_UNREACHABLE'}:
        relay.v6?{state:'OBSERVED',address:relay.v6}:{state:'UNKNOWN'},
      dns:'VERIFIED_PROTECTED',observedAtMs:1000+n};
  };
  const bound=bindingId=>[...profiles.entries()].filter(([,p])=>p.pcmsBindingId===bindingId);
  const byUid=uid=>[...profiles.entries()].filter(([,p])=>p.personaUid===uid);
  const donor={
    async inspectPreparation(){return {ok:true,settled:true,source:'SIMULATED_NATIVE_READBACK'};},
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
  return {donor,effects,profiles,routes,faults,tabs,leases,live,legacyPersona};
}
const fp=c=>c.repeat(64);
function setup({relays,...options}){
  const db=fakeDatabase(),accounts=createAccountStore(db),ledger=createExitLedger(db);
  const d=fakeDonor(relays),opened=[],synced=[],order=[];
  const sessions=new Map(); // personaUid -> principal fingerprint (real session oracle)
  closeRoutePins();configureRoutePinSource(()=>ledger.pins());
  const pins={hold:b=>{order.push('HOLD');holdRoutePin(b);},release:releaseRoutePinHold,reload:reloadRoutePins};
  const assign=async x=>{order.push('ASSIGN');return d.donor.assignRoute(x);};
  const wrapped=new Proxy(d.donor,{get:(t,k)=>k==='assignRoute'?assign:t[k]});
  const flow=createEnrollment({accounts,ledger,donor:wrapped,pins,
    openLogin:async personaUid=>{opened.push(personaUid);return {ok:true};},
    identify:async personaUid=>sessions.has(personaUid)?{ok:true,proof:{source:'GUARDED_SESSION_READBACK',
      verified:true,personaUid,principalFingerprint:sessions.get(personaUid),
      observationId:'identity_'+crypto.randomUUID().replaceAll('-','')}}:{ok:false,code:'NO_PAGE_SESSION'},
    ...options,syncInventory:async(accountId,revision)=>{
      synced.push(accountId);const account=(await accounts.get(accountId)).account;
      return createInventoryStore(db).applyObservation(account,{
        source:'GUARDED_PERCHANCE_READBACK',complete:true,accountId,personaUid:account.personaUid,
        accountRevision:revision,bindingVersion:account.bindingVersion,
        principalFingerprint:account.identity.principalFingerprint,
        observationId:'inventory_'+crypto.randomUUID(),observedAt:Date.now()+synced.length,generators:[]});}});
  const profileOf=account=>{
    const [contextId,p]=[...d.profiles.entries()].find(([,x])=>x.pcmsBindingId===account.bindingId);
    return {...p,containerId:contextId,managed:true,killSwitch:true};
  };
  return {db,accounts,ledger,flow,...d,opened,synced,order,sessions,profileOf};
}
const relay=(host,v4,v6)=>({host,v4,v6});
test('Issue60: Open accepted during bounded inventory waits for its owner to settle, then uses ordinary protected admission',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h);
 let started,finish;const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>finish=resolve);const opened=[];
 const flow=createEnrollment({accounts:h.accounts,ledger:h.ledger,donor:h.donor,
  pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},identify:async()=>({ok:false}),
  syncInventory:async()=>{started();await gate;return {ok:true}},openLogin:async uid=>{opened.push(uid);return {ok:true,opened:true}}});
 const syncing=flow.syncInventory(a.accountId);await entered;
 const opening=flow.openLogin(a.accountId);await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(opened,[]);
 finish();assert.equal((await syncing).ok,true);assert.equal((await opening).opened,true);assert.deepEqual(opened,[a.personaUid]);
});
test('Issue60: human route command cancels automatic observation at its boundary; another account progresses independently',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.1','BLOCKED')]}),a=await enroll(h),b=await enroll(h);
 let enter;const entered=new Promise(resolve=>enter=resolve),original=h.donor.probeAssigned;let first=true,active=0,max=0;
 h.donor.probeAssigned=async p=>{
  if(p.bindingId!==a.bindingId)return original(p);
  active++;max=Math.max(max,active);
  try{if(first){first=false;enter();return await new Promise(resolve=>p.signal.addEventListener('abort',()=>resolve({ok:false,code:'ROUTE_OBSERVATION_CANCELLED',failure:'HOST'}),{once:true}))}return await original(p)}finally{active--;}
 };
 const background=h.flow.verifyRoute(a.accountId,{automatic:true});await entered;
 assert.equal(h.flow.activity(a.accountId).cancellable,true);
 assert.equal((await h.flow.verifyRoute(b.accountId)).ok,true);
 const operator=h.flow.verifyRoute(a.accountId);
 assert.equal((await background).code,'ROUTE_OBSERVATION_CANCELLED');assert.equal((await operator).ok,true);
 assert.equal(max,1,'never overlap donor commands for the same account');
 assert.equal(h.flow.running(a.accountId),false);assert.equal((await h.ledger.binding(a.bindingId)).binding.pin,'ACTIVE');
 assert.equal(h.effects.filter(x=>x.kind==='ASSIGN').length,2,'only original enrollments assigned routes');
});
test('Issue60: an incompatible active human command remains owned until its donor effect settles',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h),original=h.donor.probeAssigned;
 let enter,release,observedSignal;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 h.donor.probeAssigned=async p=>{observedSignal=p.signal;enter();await gate;return original(p)};
 const checking=h.flow.verifyRoute(a.accountId);await entered;
 assert.equal((await h.flow.confirm(a.accountId)).code,'ACCOUNT_BUSY');assert.equal(h.flow.running(a.accountId),true);
 assert.equal(observedSignal.aborted,false);release();assert.equal((await checking).ok,true);
});
test('Issue60: verified accounts with missing initial inventory retry guarded identity/inventory after connection recovery',async()=>{
 let missing=false;
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')],inventoryNeeded:async()=>missing}),a=await enroll(h);
 h.sessions.set(a.personaUid,fp('a'));assert.equal((await h.flow.confirm(a.accountId)).ok,true);
 const baseline=h.synced.length;missing=true;h.faults.host=true;await h.flow.upkeep();assert.equal(h.synced.length,baseline);
 h.faults.host=false;await h.flow.upkeep();assert.equal(h.synced.length,baseline+1);
 assert.equal((await h.accounts.get(a.accountId)).account.boundPrincipal,fp('a'));
});
test('Issue60: missing inventory cannot preempt a legacy account route upgrade or its human-use fence',async()=>{
 for(const busy of [false,true]){
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')],inventoryNeeded:async()=>true});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  if(busy)h.tabs.add(persona.contextId);
  const before=structuredClone(stored(h,account.accountId));
  await h.flow.upkeep();
  const after=stored(h,account.accountId);
  if(busy)assert.deepEqual(after,before,'human-used legacy account waits for explicit upgrade; unknown inventory grants no control');
  else{
   assert.equal(typeof after.bindingId,'string','protected binding is a prerequisite to automatic inventory confirmation');
   assert.equal(after.upgrade.phase,'COMPLETE');assert.equal(after.personaUid,account.personaUid);assert.equal(after.boundPrincipal,fp('a'));
   assert.equal(h.effects.filter(x=>x.kind==='TAG').length,1);
  }
 }
});
test('Issue60: known helper failure durably revokes current route admission; healthy same-route recovery retains identity/history',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h);
 h.sessions.set(a.personaUid,fp('a'));assert.equal((await h.flow.confirm(a.accountId)).ok,true);
 const original=(await h.accounts.get(a.accountId)).account;
 h.faults.host=true;assert.equal((await h.flow.verifyRoute(a.accountId,{automatic:true})).ok,false);
 assert.equal((await h.ledger.binding(a.bindingId)).binding.pin,'HELD');
 await reloadRoutePins();assert.equal(inspectRoutePin(h.profileOf(a)).allow,false,'restart cannot resurrect known failed route');
 h.faults.host=false;assert.equal((await h.flow.verifyRoute(a.accountId)).ok,true);
 const recovered=(await h.accounts.get(a.accountId)).account;
 assert.equal(recovered.boundPrincipal,original.boundPrincipal);assert.equal(recovered.personaUid,a.personaUid);
 assert.equal((await h.ledger.binding(a.bindingId)).binding.pin,'ACTIVE');
 assert.equal((await h.ledger.read()).ledger.owners['IPv4:45.83.1.1'],a.accountId);
 assert.equal(h.effects.filter(x=>x.kind==='ASSIGN').length,1);
});
async function enroll(h){
  const begun=await h.flow.begin();
  assert.equal(begun.ok,true,JSON.stringify(begun));
  await h.flow.prepare(begun.accountId);
  return (await h.accounts.get(begun.accountId)).account;
}
test('F1: a bounded observation reports durable timeout while retaining the actual account owner through late settlement',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h);
 let enter,finish;const entered=new Promise(r=>enter=r),gate=new Promise(r=>finish=r),original=h.donor.probeAssigned;
 h.donor.probeAssigned=async p=>{enter();await gate;return original(p)};
 const f=createEnrollment({accounts:h.accounts,ledger:h.ledger,donor:h.donor,
  pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},
  openLogin:async()=>({ok:true}),identify:async()=>({ok:false}),observationMs:30});
 const task=f.verifyRoute(a.accountId);await entered;
 try{
  const result=await Promise.race([task,new Promise(r=>setTimeout(()=>r({code:'TEST_STILL_WAITING'}),250))]);
  assert.equal(result.code,'ROUTE_OBSERVATION_TIMEOUT');assert.equal(f.running(a.accountId),true);
  assert.equal(f.activity(a.accountId).timedOut,true);
  assert.equal((await h.accounts.get(a.accountId)).account.route.code,'ROUTE_OBSERVATION_TIMEOUT');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,false);
  assert.equal((await f.verifyRoute(a.accountId,{change:true})).code,'ACCOUNT_BUSY');
  assert.equal(h.effects.filter(x=>x.kind==='ASSIGN').length,1);
 }finally{finish();await new Promise(r=>setTimeout(r,150));}
 assert.equal(f.running(a.accountId),false);
 assert.equal(inspectRoutePin(h.profileOf(a)).allow,false,'late canceled observation never reinstates admission');
 h.donor.probeAssigned=original;assert.equal((await h.flow.verifyRoute(a.accountId)).ok,true);
});
test('F1: same-exit helper recovery revalidates the original principal before clearing a stale account failure',async()=>{
 for(const changed of [false,true]){
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h);
  h.sessions.set(a.personaUid,fp('a'));assert.equal((await h.flow.confirm(a.accountId)).ok,true);
  const before=(await h.accounts.get(a.accountId)).account;
  h.faults.host=true;await h.flow.verifyRoute(a.accountId,{automatic:true});h.faults.host=false;
  if(changed)h.sessions.set(a.personaUid,fp('b'));
  const result=await h.flow.verifyRoute(a.accountId,{automatic:true});
  const after=(await h.accounts.get(a.accountId)).account;
  assert.equal(after.boundPrincipal,fp('a'));assert.equal(h.effects.filter(x=>x.kind==='ASSIGN').length,1);
  if(changed){assert.equal(result.ok,false);assert.equal(result.code,'IDENTITY_CHANGED');assert.notEqual(after.state,'VERIFIED');}
  else{assert.equal(result.identity,'VERIFIED');assert.equal(after.route.code,null);assert.equal(after.revision,before.revision);}
 }
});
test('F1: a transient guarded identity-read failure preserves the original principal and revision while keeping route admission held',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h);
 h.sessions.set(a.personaUid,fp('a'));await h.flow.confirm(a.accountId);
 const before=(await h.accounts.get(a.accountId)).account;
 await h.accounts.applyCurrent({type:'ROUTE_STATUS',accountId:a.accountId,status:'HELD',code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE'});
 const flow=createEnrollment({accounts:h.accounts,ledger:h.ledger,donor:h.donor,
  pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},openLogin:async()=>({ok:true}),
  identify:async()=>({ok:false,code:'PROTECTED_ROUTE_NOT_PINNED'})});
 assert.equal((await flow.verifyRoute(a.accountId)).code,'PROTECTED_ROUTE_NOT_PINNED');
 const after=(await h.accounts.get(a.accountId)).account;
 assert.equal(after.state,'VERIFIED');assert.equal(after.revision,before.revision);assert.equal(after.boundPrincipal,fp('a'));
 assert.equal(inspectRoutePin(h.profileOf(a)).allow,false);assert.equal((await h.ledger.binding(a.bindingId)).binding.pin,'HELD');
 assert.equal((await h.flow.verifyRoute(a.accountId)).identity,'VERIFIED');assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
});
test('F1: timeout during the final ledger commit cannot release admission from a late successful route observation',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),a=await enroll(h);
 let finish,enter;const gate=new Promise(r=>finish=r),entered=new Promise(r=>enter=r),base=h.ledger.observe;
 const ledger={...h.ledger,observe:async value=>{enter();await gate;return base(value)}};
 const flow=createEnrollment({accounts:h.accounts,ledger,donor:h.donor,
  pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},openLogin:async()=>({ok:true}),identify:async()=>({ok:false}),observationMs:60});
 const task=flow.verifyRoute(a.accountId);await entered;
 try{assert.equal((await task).code,'ROUTE_OBSERVATION_TIMEOUT');assert.equal(inspectRoutePin(h.profileOf(a)).allow,false);}
 finally{finish();await new Promise(r=>setTimeout(r,100));}
 assert.equal((await h.ledger.binding(a.bindingId)).binding.pin,'HELD');assert.equal(inspectRoutePin(h.profileOf(a)).allow,false);
});

test('S01 AC-01 D: Add Account creates tagged Persona, pins a unique verified exit, opens login, Confirm verifies identity and syncs inventory',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','2a03:1b20:1::1')]});
  const a=await enroll(h);
  assert.equal(a.state,'WAITING_LOGIN');
  assert.deepEqual(h.opened,[a.personaUid]);
  assert.deepEqual(h.effects.filter(e=>e.kind!=='PROBE'&&e.kind!=='PROBE_ASSIGNED').map(e=>e.kind),
    ['PERSONA_CREATE','ROUTE_CREATE','ASSIGN']);
  // Independent oracle: committed ledger bytes, not module return values.
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],a.accountId);
  assert.equal(ledger.owners['IPv6:2a03:1b20:1::1'],a.accountId);
  assert.equal(ledger.bindings[a.bindingId].pin,'ACTIVE');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
  // Login click is not evidence; the real session principal is.
  assert.equal((await h.flow.confirm(a.accountId)).code,'NO_PAGE_SESSION');
  h.sessions.set(a.personaUid,fp('a'));
  const done=await h.flow.confirm(a.accountId);
  assert.equal(done.ok,true,JSON.stringify(done));
  assert.equal(done.inventory,'SYNCHRONIZED');
  assert.deepEqual(h.synced,[a.accountId]);
  const stored=h.db.read('meta','account:'+a.accountId).account;
  assert.equal(stored.state,'VERIFIED');assert.equal(stored.boundPrincipal,fp('a'));
});

test('S01 C-05/C-06 D: second account skips a relay sharing the first account\'s exit and pins a different one',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),
    relay('10.124.0.2','45.83.1.1','BLOCKED'),relay('10.124.0.3','45.83.2.2','BLOCKED')]});
  const a=await enroll(h),b=await enroll(h);
  assert.equal(b.state,'WAITING_LOGIN');
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],a.accountId);
  assert.equal(ledger.owners['IPv4:45.83.2.2'],b.accountId);
  assert.notEqual(ledger.bindings[a.bindingId].routeId,ledger.bindings[b.bindingId].routeId);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,true);
});

test('S01 C-06 D: exhausted unique exits hold ONLY the new enrollment; IPv6 UNKNOWN is never used',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),
    relay('10.124.0.2','45.83.1.1','BLOCKED'),relay('10.124.0.3','45.83.3.3',null)]});
  const a=await enroll(h),b=await enroll(h);
  assert.equal(b.state,'PREPARING');
  assert.equal(b.setup.phase,'HELD');
  assert.ok(['NO_UNIQUE_EXIT_AVAILABLE','IPV6_EVIDENCE_UNVERIFIED'].includes(b.setup.code),b.setup.code);
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.3.3'],undefined,'unknown-IPv6 candidate never reserved');
  assert.equal(ledger.bindings[b.bindingId],undefined);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true,'unrelated account keeps working');
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,false,'held Persona stays blocked, never Direct');
  assert.deepEqual(h.opened,[a.personaUid],'no login tab for held enrollment');
});

test('S01 D: host-wide Mullvad helper loss holds without rotating or creating routes',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  h.faults.host=true;
  const b=await enroll(h);
  assert.equal(b.setup.code,'MULLVAD_LOCAL_SERVICE_UNAVAILABLE');
  assert.equal(h.effects.filter(e=>e.kind==='ROUTE_CREATE').length,1,'stops at first host failure');
  assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,0);
});

test('S01 lost ACK D: Persona create and route assignment ACK loss reconcile without duplicate effects',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  h.faults.lostCreateAck=true;
  let a=await enroll(h);
  assert.equal(a.setup.code,'PERSONA_CREATE_UNCONFIRMED');
  await h.flow.prepare(a.accountId);
  a=(await h.accounts.get(a.accountId)).account;
  assert.equal(a.state,'WAITING_LOGIN');
  assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,1);
  const h2=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  h2.faults.lostAssignAck=true;
  let b=await enroll(h2);
  assert.equal(b.setup.code,'ROUTE_ASSIGN_UNCONFIRMED');
  assert.equal(inspectRoutePin(h2.profileOf(b)).allow,false,'reserved-but-unconfirmed route is not pinned');
  await h2.flow.prepare(b.accountId);
  b=(await h2.accounts.get(b.accountId)).account;
  assert.equal(b.state,'WAITING_LOGIN');
  assert.equal(h2.effects.filter(e=>e.kind==='ASSIGN').length,1,'no second assignment after lost ACK');
  assert.equal(h2.effects.filter(e=>e.kind==='ROUTE_CREATE').length,1);
});

test('S01 AC-02/C-08 D: genuine route failure repairs to a new unique exit; history and principal preserved',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h);
  h.sessions.set(a.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(a.accountId)).ok,true);
  h.order.length=0;
  relays[0].down=true;
  const out=await h.flow.verifyRoute(a.accountId);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.changed,true);assert.equal(out.identity,'VERIFIED');
  const assignment=h.order.indexOf('ASSIGN');
  assert.ok(assignment>0&&h.order.slice(0,assignment).every(x=>x==='HOLD'),'pin withdrawn before route mutation');
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],a.accountId,'old exit stays reserved to A');
  assert.equal(ledger.owners['IPv4:45.83.2.2'],a.accountId);
  assert.equal(ledger.bindings[a.bindingId].history.length,1);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
});

test('S01 C-09 D: a provider challenge/login failure never rotates routes',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h);
  const before=h.effects.filter(e=>['ROUTE_CREATE','ASSIGN'].includes(e.kind)).length;
  const challenged=await h.flow.confirm(a.accountId); // no session: e.g. Cloudflare page
  assert.equal(challenged.ok,false);
  assert.equal(h.effects.filter(e=>['ROUTE_CREATE','ASSIGN'].includes(e.kind)).length,before);
});

test('S01 AC-02 D: exit drift onto another account\'s exit holds only the drifted account',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h),b=await enroll(h);
  relays[1].v4='45.83.1.1'; // B's relay now exits from A's recorded address
  const out=await h.flow.verifyRoute(b.accountId);
  assert.equal(out.code,'EXIT_DRIFT_CONFLICT');
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,false);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
  assert.equal(h.db.read('meta','account:'+b.accountId).account.route.status,'HELD');
  assert.equal(h.db.read('meta',LEDGER_KEY).owners['IPv4:45.83.1.1'],a.accountId);
});

test('S01 identity D: changed credentials or another bound principal can never rebind an account',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h),b=await enroll(h);
  h.sessions.set(a.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(a.accountId)).ok,true);
  h.sessions.set(b.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(b.accountId)).code,'IDENTITY_ALREADY_BOUND');
  h.sessions.set(a.personaUid,fp('c'));
  assert.equal((await h.accounts.applyCurrent({type:'REVERIFY',accountId:a.accountId})).ok,true);
  assert.equal((await h.flow.confirm(a.accountId)).code,'IDENTITY_CHANGED');
});

test('S01 AC-03 D: archive preserves exit history and Persona; reactivation verifies the same principal',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h);
  h.sessions.set(a.personaUid,fp('a'));
  await h.flow.confirm(a.accountId);
  let current=(await h.accounts.get(a.accountId)).account;
  const archived=await h.accounts.apply({type:'ARCHIVE',accountId:a.accountId,expectedRevision:current.revision});
  assert.equal(archived.ok,true);
  const b=await enroll(h);
  assert.notEqual(h.db.read('meta',LEDGER_KEY).bindings[b.bindingId].exits[0].address,'45.83.1.1',
    'archived account exit is not reallocated');
  const out=await h.flow.reactivate(a.accountId,archived.account.revision);
  assert.equal(out.ok,true,JSON.stringify(out));
  current=(await h.accounts.get(a.accountId)).account;
  assert.equal(current.state,'VERIFIED');assert.equal(current.personaUid,a.personaUid);
});

test('S01 concurrency D: simultaneous Add Account requests cannot share an exit',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const [x,y]=await Promise.all([h.flow.begin(),h.flow.begin()]);
  await Promise.all([h.flow.prepare(x.accountId),h.flow.prepare(y.accountId)]);
  const ledger=h.db.read('meta',LEDGER_KEY);
  const owners=Object.values(ledger.owners);
  assert.deepEqual(new Set(owners),new Set([x.accountId,y.accountId]));
  const states=[(await h.accounts.get(x.accountId)).account,(await h.accounts.get(y.accountId)).account];
  assert.deepEqual(states.map(s=>s.state),['WAITING_LOGIN','WAITING_LOGIN']);
  assert.notEqual(ledger.bindings[states[0].bindingId].routeId,ledger.bindings[states[1].bindingId].routeId);
});

test('S01 D: route edited outside PCMS is blocked at once, then PCMS re-pins a verified route',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h);
  const [contextId,p]=[...h.profiles.entries()].find(([,x])=>x.pcmsBindingId===a.bindingId);
  h.routes.set('manual-route-01',{host:'10.124.0.2'});
  p.routeId='manual-route-01';
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,false,'manual reassignment is never silently adopted');
  const out=await h.flow.verifyRoute(a.accountId);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
  assert.equal(h.profiles.get(contextId).routeId,h.db.read('meta',LEDGER_KEY).bindings[a.bindingId].routeId);
});

test('S01 restart D: pins start empty each boot and come back only from the committed ledger',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);
  closeRoutePins(); // new background lifetime
  assert.equal(inspectRoutePin(h.profileOf(a)).reason,'PCMS_PINS_NOT_LOADED');
  assert.equal(await reloadRoutePins(),true);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
  configureRoutePinSource(async()=>({ok:false,code:'EXIT_LEDGER_CORRUPT'}));
  assert.equal(await reloadRoutePins(),false);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,false,'corrupt/unavailable store closes pins');
});

test('S01 review D: unattended upkeep never rotates on one failed check; a second consecutive failure repairs',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h);
  const assigns=()=>h.effects.filter(e=>e.kind==='ASSIGN').length;
  relays[0].down=true;
  await h.flow.upkeep();
  let stored=h.db.read('meta','account:'+a.accountId).account;
  assert.equal(stored.route.status,'CHECKING');assert.equal(stored.route.code,'ROUTE_CHECK_FAILED');
  assert.equal(assigns(),1,'no rotation after a single failed unattended check');
  assert.equal(h.db.read('meta',LEDGER_KEY).owners['IPv4:45.83.2.2'],undefined,'no new exit consumed');
  relays[0].down=false;
  await h.flow.upkeep();
  stored=h.db.read('meta','account:'+a.accountId).account;
  assert.equal(stored.route.status,'PINNED','recovered route clears the failure');
  relays[0].down=true;
  await h.flow.upkeep();await h.flow.upkeep();
  assert.equal(assigns(),2,'second consecutive failure repairs to a new exit');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
});

test('S01 review D: pin is withdrawn before an observation that commits a drift hold',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h),b=await enroll(h);
  relays[1].v4='45.83.1.1';
  const seen=[];
  const ledger={...h.ledger,observe:async x=>{seen.push(inspectRoutePin(h.profileOf(b)).allow);return h.ledger.observe(x);}};
  const flow=createEnrollment({accounts:h.accounts,ledger,donor:h.donor,
    pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},
    openLogin:async()=>({ok:true}),identify:async()=>({ok:false,code:'NO_PAGE_SESSION'})});
  assert.equal((await flow.verifyRoute(b.accountId)).code,'EXIT_DRIFT_CONFLICT');
  assert.deepEqual(seen,[false]);
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,false);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
});

test('S01 review D: a missing exit ledger with surviving tagged Personas holds instead of forgetting history',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  await enroll(h);
  // Simulate PCMS IndexedDB loss: a fresh ledger/accounts store, donor state kept.
  const db=fakeDatabase();
  const flow=createEnrollment({accounts:createAccountStore(db),ledger:createExitLedger(db),donor:h.donor,
    pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},
    openLogin:async()=>({ok:true}),identify:async()=>({ok:false,code:'NO_PAGE_SESSION'})});
  const begun=await flow.begin();
  await flow.prepare(begun.accountId);
  assert.equal(db.read('meta','account:'+begun.accountId).account.setup.code,'EXIT_LEDGER_MISSING');
});

test('S01 review D: principals of archived or pre-S01 accounts are never reused by another account',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const legacy=await h.accounts.apply({type:'ENROLL',accountId:'legacy_account_01',personaUid:'persona-legacy-0001',expectedRevision:0});
  const proof=(personaUid)=>({source:'GUARDED_SESSION_READBACK',verified:true,personaUid,
    principalFingerprint:fp('d'),observationId:'identity_legacy_0001'});
  const v=await h.accounts.apply({type:'VERIFY',accountId:'legacy_account_01',expectedRevision:legacy.account.revision,
    proof:proof('persona-legacy-0001')});
  await h.accounts.apply({type:'ARCHIVE',accountId:'legacy_account_01',expectedRevision:v.account.revision});
  // Pre-S01 record shape: no boundPrincipal field, identity only in history.
  const raw=h.db.read('meta','account:legacy_account_01');delete raw.account.boundPrincipal;
  await new Promise(r=>{const tx=h.db.transaction(['meta'],'readwrite');tx.objectStore('meta').put(raw);tx.oncomplete=r;});
  const a=await enroll(h);
  h.sessions.set(a.personaUid,fp('d'));
  assert.equal((await h.flow.confirm(a.accountId)).code,'IDENTITY_ALREADY_BOUND');
});

// ---- Correction 1: in-place upgrade of accounts bound before S01 ----
const proofFor=(personaUid,f,id='identity_legacy_0001')=>({source:'GUARDED_SESSION_READBACK',verified:true,
  personaUid,principalFingerprint:f,observationId:id});
async function legacyAccount(h,host,principal,{accountId='legacy_account_01',verify=true}={}){
  const persona=h.legacyPersona(host);
  let r=await h.accounts.apply({type:'ENROLL',accountId,personaUid:persona.personaUid,expectedRevision:0});
  // Pre-S01 record shape written as stored by the old build: verified
  // identity, no binding and no boundPrincipal (old data may even collide).
  const raw=h.db.read('meta','account:'+accountId);delete raw.account.boundPrincipal;
  if(verify)Object.assign(raw.account,{state:'VERIFIED',revision:2,identity:{principalFingerprint:principal,
    observationId:'identity_legacy_0001',source:'GUARDED_SESSION_READBACK',bindingVersion:1}});
  await new Promise(done=>{const tx=h.db.transaction(['meta'],'readwrite');tx.objectStore('meta').put(raw);tx.oncomplete=done;});
  return {persona,account:raw.account};
}
const stored=(h,id)=>h.db.read('meta','account:'+id).account;

test('S01 C-59 D: a verified pre-S01 account is upgraded IN PLACE — same ID, Persona, principal and revision',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.sessions.set(persona.personaUid,fp('a'));
  const out=await h.flow.upgrade(account.accountId);
  assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.identity,'VERIFIED');
  const after=stored(h,account.accountId);
  assert.equal(after.personaUid,persona.personaUid);
  assert.equal(after.state,'VERIFIED');assert.equal(after.boundPrincipal,fp('a'));
  assert.equal(after.revision,account.revision,'revision unchanged: generator/source associations stay valid');
  assert.equal(after.bindingVersion,account.bindingVersion);
  assert.equal(after.identity.principalFingerprint,fp('a'));
  assert.equal(after.upgrade.phase,'COMPLETE');assert.equal(after.upgrade.priorExitHistory,'UNOBSERVED');
  assert.deepEqual(h.effects.filter(e=>!e.kind.startsWith('PROBE')).map(e=>e.kind),['TAG'],
    'no Persona creation, no route change when the current route is permissible');
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],account.accountId);
  assert.equal(ledger.bindings[after.bindingId].routeId,persona.routeId);
  assert.equal(inspectRoutePin(h.profileOf(after)).allow,true);
  assert.equal((await h.accounts.list()).accounts.length,1,'no duplicate account');
  // Repeating the migration is a no-op.
  const before=h.effects.length;
  assert.equal((await h.flow.upgrade(account.accountId)).already,true);
  await h.flow.upkeep();
  assert.equal(h.effects.filter(e=>e.kind==='TAG').length,1);
  assert.equal(h.effects.slice(before).filter(e=>!e.kind.startsWith('PROBE')).length,0);
});

test('S01 C-59 D: upgrade revalidates the ORIGINAL principal; a different login never rebinds',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.sessions.set(persona.personaUid,fp('e'));
  const out=await h.flow.upgrade(account.accountId);
  assert.equal(out.identity,'IDENTITY_CHANGED');
  const after=stored(h,account.accountId);
  assert.equal(after.state,'VERIFICATION_PENDING');assert.equal(after.boundPrincipal,fp('a'));
  assert.equal((await h.flow.confirm(account.accountId)).code,'IDENTITY_CHANGED');
  h.sessions.set(persona.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(account.accountId)).ok,true);
});

test('S01 C-56/C-59 D: an archived pre-S01 account is upgraded on reactivation through the SAME record',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  const arch=await h.accounts.apply({type:'ARCHIVE',accountId:account.accountId,expectedRevision:account.revision});
  assert.equal(arch.ok,true);
  await h.flow.upkeep();
  assert.equal(stored(h,account.accountId).bindingId,undefined,'archived legacy records are not touched by upkeep');
  h.sessions.set(persona.personaUid,fp('a'));
  const out=await h.flow.reactivate(account.accountId,arch.account.revision);
  assert.equal(out.ok,true,JSON.stringify(out));
  const after=stored(h,account.accountId);
  assert.equal(after.state,'VERIFIED');assert.equal(after.personaUid,persona.personaUid);
  assert.equal(after.boundPrincipal,fp('a'),'principal recovered from the archive history');
  h.sessions.set(persona.personaUid,fp('b'));
  await h.accounts.applyCurrent({type:'REVERIFY',accountId:account.accountId});
  assert.equal((await h.flow.confirm(account.accountId)).code,'IDENTITY_CHANGED');
});

test('S01 D: upgrade holds on a principal already bound to another account; no donor mutation',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h);h.sessions.set(a.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(a.accountId)).ok,true);
  const {account}=await legacyAccount(h,'10.124.0.2',fp('a'));
  const out=await h.flow.upgrade(account.accountId);
  assert.equal(out.code,'IDENTITY_ALREADY_BOUND');
  assert.equal(h.effects.filter(e=>e.kind==='TAG').length,0);
  assert.equal(stored(h,account.accountId).bindingId,undefined);
});

test('S01 C-06 D: a legacy route exiting through another account\'s recorded exit is replaced, never pinned',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED'),
    relay('10.124.0.3','45.83.1.1','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h);
  const {persona,account}=await legacyAccount(h,'10.124.0.3',fp('b'));
  h.sessions.set(persona.personaUid,fp('b'));
  const out=await h.flow.upgrade(account.accountId);
  assert.equal(out.ok,true,JSON.stringify(out));
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],a.accountId,'other account keeps its exit');
  assert.equal(ledger.owners['IPv4:45.83.2.2'],account.accountId);
  assert.notEqual(h.profiles.get(persona.contextId).routeId,persona.routeId,'moved to a permissible route');
  assert.equal(stored(h,account.accountId).personaUid,persona.personaUid,'same Persona kept');
});

test('S01 D: missing Persona holds the upgrade; explicit replacement keeps account, principal and history',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.profiles.delete(persona.contextId); // Persona deleted in PersonaMonkey
  let out=await h.flow.upgrade(account.accountId);
  assert.equal(out.code,'PERSONA_NOT_FOUND');
  let rec=stored(h,account.accountId);
  assert.equal(rec.upgrade.phase,'HELD');assert.equal(rec.state,'VERIFIED');
  out=await h.flow.replacePersona(account.accountId,rec.revision);
  assert.equal(out.ok,true,JSON.stringify(out)+JSON.stringify(stored(h,account.accountId)));
  rec=stored(h,account.accountId);
  assert.equal(rec.accountId,account.accountId);assert.equal(rec.state,'REBIND_PENDING');
  assert.notEqual(rec.personaUid,persona.personaUid);assert.equal(rec.boundPrincipal,fp('a'));
  assert.equal(rec.history.at(-1).event,'PERSONA_REPLACED');
  h.sessions.set(rec.personaUid,fp('c'));
  assert.equal((await h.flow.confirm(account.accountId)).code,'IDENTITY_CHANGED');
  h.sessions.set(rec.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(account.accountId)).ok,true);
  assert.equal((await h.accounts.list()).accounts.length,1);
  assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,1);
});

test('S01 D: legacy Persona on a non-Mullvad or unknown-IPv6 route is moved to a fully verified exit',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1',null),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.sessions.set(persona.personaUid,fp('a'));
  const out=await h.flow.upgrade(account.accountId);
  assert.equal(out.ok,true,JSON.stringify(out));
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],undefined,'unknown-IPv6 route never reserved');
  assert.equal(ledger.owners['IPv4:45.83.2.2'],account.accountId);
});

test('S01 lost ACK/crash D: interrupted upgrade resumes without duplicate tag or Persona effects',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.sessions.set(persona.personaUid,fp('a'));
  h.faults.lostTagAck=true;
  assert.equal((await h.flow.upgrade(account.accountId)).code,'PERSONA_TAG_UNCONFIRMED');
  // Crash mid-route-phase: the donor stops answering after the tag.
  const probe=h.donor.probeCandidate;h.donor.probeCandidate=async()=>{throw Error('background suspended');};
  assert.equal((await h.flow.upgrade(account.accountId)).code,'ENROLLMENT_INTERRUPTED');
  assert.equal(stored(h,account.accountId).upgrade.phase,'ROUTE');
  h.donor.probeCandidate=probe;
  await h.flow.upkeep(); // automatic resume after restart
  const after=stored(h,account.accountId);
  assert.equal(after.upgrade.phase,'COMPLETE');assert.equal(after.state,'VERIFIED');
  assert.equal(h.effects.filter(e=>e.kind==='TAG').length,1);
  assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,0);
});

// ---- Correction 2: Archive releases only this account's safe idle resources ----
test('S01 C-58 D: Archive of an idle account releases ONLY its own forwarder and keeps history',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h),b=await enroll(h);
  const routeA=h.db.read('meta',LEDGER_KEY).bindings[a.bindingId].routeId;
  const routeB=h.db.read('meta',LEDGER_KEY).bindings[b.bindingId].routeId;
  assert.ok(h.live.has(routeA)&&h.live.has(routeB));
  const out=await h.flow.archive(a.accountId,stored(h,a.accountId).revision);
  assert.equal(out.release,'RELEASED');
  assert.deepEqual(h.effects.filter(e=>e.kind==='RELEASE').map(e=>e.routeId),[routeA]);
  assert.equal(h.live.has(routeA),false);assert.equal(h.live.has(routeB),true,'other account untouched');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,false,'released archived Persona carries no traffic');
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,true);
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(ledger.owners['IPv4:45.83.1.1'],a.accountId,'exit history survives release');
  assert.equal(ledger.bindings[a.bindingId].routeId,routeA,'route identity kept for reactivation');
  assert.equal(stored(h,a.accountId).personaUid,a.personaUid);
  // Background upkeep never re-probes (and so never re-prepares) the released forwarder.
  const probesOfA=()=>h.effects.filter(e=>e.kind.startsWith('PROBE')&&e.routeId===routeA).length;
  const before=probesOfA();
  await h.flow.upkeep();await h.flow.upkeep();
  assert.equal(probesOfA(),before,'no probe of the released archived route');
  assert.equal(h.live.has(routeA),false);
  // A new account never receives the archived account's exit.
  const c=await enroll(h);
  assert.equal(c.setup.phase,'HELD');
  assert.ok(['NO_UNIQUE_EXIT_AVAILABLE','NO_ROUTE_CANDIDATES'].includes(c.setup.code),c.setup.code);
  assert.equal(Object.values(h.db.read('meta',LEDGER_KEY).owners).includes(c.accountId),false);
});

test('S01 C-58 D: in-flight work (lease) or an open human tab defers release; upkeep releases once idle',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h),b=await enroll(h);
  const ctxA=h.profileOf(a).containerId,ctxB=h.profileOf(b).containerId;
  h.leases.add(ctxA); // e.g. a dispatched provider save still holding its donor lease
  let out=await h.flow.archive(a.accountId,stored(h,a.accountId).revision);
  assert.equal(out.release,'RELEASE_DEFERRED');
  assert.equal(stored(h,a.accountId).state,'ARCHIVED','automation stops immediately');
  assert.equal(h.effects.filter(e=>e.kind==='RELEASE').length,0);
  h.tabs.add(ctxB);
  out=await h.flow.archive(b.accountId,stored(h,b.accountId).revision);
  assert.equal(out.release,'RELEASE_DEFERRED');
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,true,'open human tab keeps working');
  h.leases.delete(ctxA);
  await h.flow.upkeep();
  assert.equal(stored(h,a.accountId).route.status,'RELEASED');
  assert.equal(stored(h,b.accountId).route.status,'RELEASE_DEFERRED');
  h.tabs.delete(ctxB);await h.flow.upkeep();
  assert.equal(stored(h,b.accountId).route.status,'RELEASED');
});

test('S01 C-58 D: native loss during release is UNCONFIRMED and reconciled by observation, not replay',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);
  h.faults.nativeGoneOnRelease=true;h.faults.releaseApplied=true; // release happened, ACK lost
  const out=await h.flow.archive(a.accountId,stored(h,a.accountId).revision);
  assert.equal(out.release,'RELEASE_UNCONFIRMED');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,false);
  await h.flow.upkeep();
  assert.equal(stored(h,a.accountId).route.status,'RELEASED');
  assert.equal(h.effects.filter(e=>e.kind==='RELEASE').length,1,'observed released: no second release');
  // Native still unavailable: stays unconfirmed, nothing invented.
  const h2=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const b=await enroll(h2);
  h2.faults.nativeGoneOnRelease=true;
  await h2.flow.archive(b.accountId,stored(h2,b.accountId).revision);
  h2.faults.host=true;await h2.flow.upkeep();
  assert.notEqual(stored(h2,b.accountId).route.status,'RELEASED');
});

test('S01 C-59 D: reactivation restores a verified pin and principal; repeated cycles leak nothing',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);h.sessions.set(a.personaUid,fp('a'));
  assert.equal((await h.flow.confirm(a.accountId)).ok,true);
  for(let i=0;i<3;i++){
    const arch=await h.flow.archive(a.accountId,stored(h,a.accountId).revision);
    assert.equal(arch.release,'RELEASED');
    assert.equal(h.live.size,0);
    const re=await h.flow.reactivate(a.accountId,stored(h,a.accountId).revision);
    assert.equal(re.ok,true,JSON.stringify(re));
    assert.equal(stored(h,a.accountId).state,'VERIFIED');
    assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
  }
  const ledger=h.db.read('meta',LEDGER_KEY);
  assert.equal(Object.keys(ledger.bindings).length,1);
  assert.equal(h.live.size,1,'exactly one forwarder after the last reactivation');
  assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,1);
  assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,1,'same route restored, never re-assigned');
});

test('S01 C-58 D: a route shared with another Persona or without a Mullvad resource is never released',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);
  const routeA=h.profileOf(a).routeId;
  h.profiles.set('firefox-container-ordinary',{personaUid:'persona-ordinary-0001',pcmsBindingId:null,routeId:routeA});
  const out=await h.flow.archive(a.accountId,stored(h,a.accountId).revision);
  assert.equal(out.release,'RELEASE_DEFERRED');
  assert.equal(stored(h,a.accountId).route.code,'RESOURCE_SHARED');
  assert.equal(h.effects.filter(e=>e.kind==='RELEASE').length,0);
  assert.equal(h.live.has(routeA),true,'ordinary Persona keeps its forwarder');
});

// ---- Second independent review: regression tests ----
async function rawPut(h,account){
  await new Promise(done=>{const tx=h.db.transaction(['meta'],'readwrite');
    tx.objectStore('meta').put({key:'account:'+account.accountId,account});tx.oncomplete=done;});
}
test('S01 review2 D: upgrade refuses a principal preserved only in ANOTHER account\'s history',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {account}=await legacyAccount(h,'10.124.0.1',fp('9'));
  // Archived pre-S01 account A holds P only in its archive history.
  await rawPut(h,{accountId:'legacy_archived_a1',personaUid:'persona-old-0001',state:'ARCHIVED',revision:3,
    bindingVersion:1,identity:null,override:null,history:[{event:'ARCHIVED',revision:3,
      priorIdentity:{principalFingerprint:fp('9'),source:'GUARDED_SESSION_READBACK'}}]});
  const out=await h.flow.upgrade(account.accountId);
  assert.equal(out.code,'IDENTITY_ALREADY_BOUND',JSON.stringify(out));
  assert.equal(h.effects.filter(e=>e.kind==='TAG').length,0);
});
test('S01 review2 D: a pre-S01 record naming two different principals is held as ambiguous',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  const raw=stored(h,account.accountId);
  raw.history=[{event:'REBIND',priorIdentity:{principalFingerprint:fp('b'),source:'GUARDED_SESSION_READBACK'}}];
  await rawPut(h,raw);
  assert.equal((await h.flow.upgrade(account.accountId)).code,'IDENTITY_AMBIGUOUS');
});
test('S01 review2 D: accounts archived before release existed (or interrupted) are released by upkeep',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);
  const routeA=h.profileOf(a).routeId;
  // v1.0-style archive: state ARCHIVED, route status still PINNED, no release.
  const raw=stored(h,a.accountId);raw.state='ARCHIVED';raw.route={status:'PINNED',code:null};
  await rawPut(h,raw);
  await h.flow.upkeep();
  assert.equal(stored(h,a.accountId).route.status,'RELEASED');
  assert.equal(h.live.has(routeA),false);
  // Store-level ARCHIVE persists the release intent before any effect.
  const h2=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const b=await enroll(h2);
  await h2.accounts.apply({type:'ARCHIVE',accountId:b.accountId,expectedRevision:stored(h2,b.accountId).revision});
  assert.equal(stored(h2,b.accountId).route.code,'RELEASE_PENDING');
  await h2.flow.upkeep();
  assert.equal(stored(h2,b.accountId).route.status,'RELEASED');
});
test('S01 review2 D: a stale upkeep snapshot never releases an account reactivated meanwhile',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);h.sessions.set(a.personaUid,fp('a'));
  await h.flow.confirm(a.accountId);
  h.leases.add(h.profileOf(a).containerId);
  await h.flow.archive(a.accountId,stored(h,a.accountId).revision);
  const snapshot=stored(h,a.accountId); // what upkeep listed
  h.leases.clear();
  await h.flow.reactivate(a.accountId,snapshot.revision);
  assert.equal(stored(h,a.accountId).state,'VERIFIED');
  const before=h.effects.filter(e=>e.kind==='RELEASE').length;
  // Upkeep iterating an old list: the record is re-read inside releaseIdle.
  const flow=createEnrollment({accounts:{...h.accounts,list:async()=>({ok:true,accounts:[snapshot]})},
    ledger:h.ledger,donor:h.donor,pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},
    openLogin:async()=>({ok:true}),identify:async()=>({ok:false,code:'NO_PAGE_SESSION'})});
  await flow.upkeep();
  assert.equal(h.effects.filter(e=>e.kind==='RELEASE').length,before);
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
});
test('S01 review2 D: deferred archived account still in human use is observed for drift (no rotation)',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h),b=await enroll(h);
  h.tabs.add(h.profileOf(b).containerId);
  await h.flow.archive(b.accountId,stored(h,b.accountId).revision);
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,true);
  relays[1].v4='45.83.1.1';
  const assigns=h.effects.filter(e=>e.kind==='ASSIGN').length;
  await h.flow.upkeep();
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,false,'drift onto A\'s exit holds the archived Persona');
  assert.deepEqual([stored(h,b.accountId).route.status,stored(h,b.accountId).route.code],['HELD','EXIT_DRIFT_CONFLICT']);
  assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,assigns,'never rotated');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
});
test('S01 review2 D: automatic upgrade never starts while the legacy Persona is in use; transient holds retry',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.sessions.set(persona.personaUid,fp('a'));
  h.tabs.add(persona.contextId);
  await h.flow.upkeep();
  assert.equal(h.effects.filter(e=>e.kind==='TAG').length,0,'open human tab: upgrade not started automatically');
  h.tabs.clear();h.faults.host=true;
  await h.flow.upkeep();
  assert.equal(stored(h,account.accountId).upgrade.code,'MULLVAD_LOCAL_SERVICE_UNAVAILABLE');
  h.faults.host=false;
  await h.flow.upkeep();
  assert.equal(stored(h,account.accountId).upgrade.phase,'COMPLETE','transient hold retried automatically');
});
test('S01 review2 D: an uncommitted replacement Persona is never adopted by upkeep; the explicit action completes it',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const a=await enroll(h);
  const [ctx]=[...h.profiles.entries()].find(([,p])=>p.pcmsBindingId===a.bindingId);
  h.profiles.delete(ctx);
  // Crash after the donor created the replacement, before REPLACE_PERSONA committed.
  await h.donor.createBoundPersona({bindingId:a.bindingId});
  assert.equal((await h.flow.verifyRoute(a.accountId)).code,'BINDING_PERSONA_CONFLICT');
  assert.equal(Object.values(h.db.read('meta',LEDGER_KEY).bindings)[0].personaUid,a.personaUid,
    'binding not moved to an unrecorded Persona');
  const out=await h.flow.replacePersona(a.accountId,stored(h,a.accountId).revision);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,2,'adopted, not created a third time');
});
test('S01 review2 D: reactivating a pre-S01 record with a principal conflict returns it to Archive',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED')]});
  const a=await enroll(h);h.sessions.set(a.personaUid,fp('a'));
  await h.flow.confirm(a.accountId);
  const {account}=await legacyAccount(h,'10.124.0.2',fp('a'),{accountId:'legacy_account_02'});
  const raw=stored(h,account.accountId);raw.state='ARCHIVED';
  raw.history=[{event:'ARCHIVED',priorIdentity:raw.identity}];raw.identity=null;await rawPut(h,raw);
  assert.equal((await h.flow.reactivate(account.accountId,raw.revision)).code,'IDENTITY_ALREADY_BOUND');
  assert.equal(stored(h,account.accountId).state,'ARCHIVED');
});

// ---- Owner source audit at 403ac53 ----
test('S01 audit D: a failed first pin load is retried by the request-ready path (deny until loaded)',async()=>{
  const {routePinsReady}=await import('../src/runtime/route-pin.mjs');
  const profile={pcmsBindingId:'binding_retry_01',personaUid:'persona-retry-0001',containerId:'firefox-container-r1',
    routeId:'mullvad-r1',managed:true,killSwitch:true};
  let calls=0;
  closeRoutePins();
  configureRoutePinSource(async()=>{calls++;
    if(calls===1)throw Error('canonical DB temporarily unavailable');
    return {ok:true,pins:[{bindingId:profile.pcmsBindingId,personaUid:profile.personaUid,
      contextId:profile.containerId,routeId:profile.routeId}]};});
  assert.equal(await routePinsReady(500),false);
  assert.equal(inspectRoutePin(profile).allow,false,'default deny while not loaded');
  assert.equal(await routePinsReady(500),true,'second request-ready call retries the load');
  assert.equal(calls,2);
  assert.equal(inspectRoutePin(profile).allow,true);
});
test('S01 audit D: unknown or failing idle inspection never starts automatic legacy tagging',async()=>{
  const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
  const {persona,account}=await legacyAccount(h,'10.124.0.1',fp('a'));
  h.tabs.add(persona.contextId);
  const real=h.donor.inspectRouteUse;
  for(const broken of [async()=>({ok:false,code:'NATIVE_UNAVAILABLE'}),async()=>{throw Error('donor not ready');},
      async()=>({ok:true,releasable:false,reason:'NO_ROUTE_RESOURCE'})]){
    h.donor.inspectRouteUse=broken;
    await h.flow.upkeep();
  }
  assert.equal(h.effects.filter(e=>e.kind==='TAG').length,0,'no tagging on unverified idle state');
  assert.equal(stored(h,account.accountId).bindingId,undefined,'no mutation of the record either');
  h.donor.inspectRouteUse=real;h.tabs.clear();h.sessions.set(persona.personaUid,fp('a'));
  await h.flow.upkeep();
  assert.equal(stored(h,account.accountId).upgrade.phase,'COMPLETE','retried later once positively idle');
});

test('S01 D: route-pin refresh reuses one monitored IndexedDB connection, invalidates on schema replacement',async()=>{
  const {routePinsReady,routePinSummary}=await import('../src/runtime/route-pin.mjs');
  const priorFactory=globalThis.indexedDB,connections=[];
  globalThis.indexedDB={open(){
    const db=fakeDatabase(),listeners={};
    const entry={db,listeners,closed:0};
    db.addEventListener=(kind,callback)=>{listeners[kind]=callback;};
    db.close=()=>{entry.closed++;};
    connections.push(entry);
    const request={result:db,onsuccess:null,onerror:null,onblocked:null};
    setImmediate(()=>request.onsuccess?.());
    return request;
  }};
  try{
    configureRoutePinSource(null);
    closeRoutePins();
    for(let i=0;i<4;i++)assert.equal(await reloadRoutePins(),true);
    assert.equal(connections.length,1,'repeated refresh cannot leak an IndexedDB connection per account');
    assert.equal(connections[0].closed,0,'keep monitored connection for versionchange');
    assert.equal(routePinSummary().loaded,true);
    connections[0].listeners.versionchange();
    assert.equal(routePinSummary().loaded,false,'schema change closes all network pins');
    assert.equal(connections[0].closed,1,'stale handle is closed');
    assert.equal(await routePinsReady(500),true,'next request reopens after safe invalidation');
    assert.equal(connections.length,2,'new clean handle replaces invalidated handle');
    assert.equal(await reloadRoutePins(),true);
    assert.equal(connections.length,2,'new handle is reused');
  }finally{
    globalThis.indexedDB=priorFactory;
    configureRoutePinSource(async()=>({ok:true,pins:[]}));
    closeRoutePins();
  }
});

test('J01 distinct intents do not join; Archive suspends at the current route effect checkpoint',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
 const a=await enroll(h);let release,entered;
 const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const probe=h.donor.probeAssigned;
 h.donor.probeAssigned=async p=>{entered();await gate;return probe(p)};
 const checking=h.flow.verifyRoute(a.accountId,{automatic:true});await started;
 const replacement=await h.flow.replacePersona(a.accountId,(await h.accounts.get(a.accountId)).account.revision);
 assert.equal(replacement.ok,false);assert.equal(replacement.code,'ACCOUNT_BUSY');
 const archiving=h.flow.archive(a.accountId,(await h.accounts.get(a.accountId)).account.revision);
 for(let i=0;i<20&&(await h.accounts.get(a.accountId)).account.state!=='ARCHIVED';i++)await new Promise(r=>setImmediate(r));
 assert.equal((await h.accounts.get(a.accountId)).account.state,'ARCHIVED');
 release();await checking;assert.equal((await archiving).state,'ARCHIVED');
 assert.equal((await h.accounts.get(a.accountId)).account.state,'ARCHIVED');
});
test('J01 unique ninth candidate is reached after eight historical collisions',async()=>{
 const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),
   ...Array.from({length:8},(_,i)=>relay('10.124.0.'+(i+2),'45.83.1.1','BLOCKED')),
   relay('10.124.0.10','45.83.1.10','BLOCKED')];
 const h=setup({relays}),a=await enroll(h);let b=await enroll(h);
 assert.equal(b.setup.code,'ROUTE_SEARCH_PENDING','large searches yield with durable progress');
 for(let i=0;i<4&&b.state==='PREPARING';i++){
   await h.flow.upkeep();b=(await h.accounts.get(b.accountId)).account;
 }
 assert.equal(a.state,'WAITING_LOGIN');assert.equal(b.state,'WAITING_LOGIN');
 const binding=await h.ledger.binding(b.bindingId);
 assert.equal(binding.binding.exits[0].address,'45.83.1.10');
 assert.equal((await h.ledger.read()).ledger.owners['IPv4:45.83.1.1'],a.accountId);
 assert.equal(b.routeSearch.attempted.length,8);
});
test('J01 unknown assigned IPv6 immediately holds admission and valid readback restores same route',async()=>{
 const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED')],h=setup({relays});
 const a=await enroll(h),profile=h.profileOf(a);
 assert.equal(inspectRoutePin(profile).allow,true);
 relays[0].v6=null;
 const result=await h.flow.verifyRoute(a.accountId,{automatic:true});
 assert.equal(result.code,'IPV6_EVIDENCE_UNVERIFIED');
 assert.equal(inspectRoutePin(profile).allow,false);
 const held=(await h.ledger.binding(a.bindingId)).binding;
 assert.equal(held.pin,'HELD');assert.equal(held.holdCode,'IPV6_EVIDENCE_UNVERIFIED');
 relays[0].v6='BLOCKED';
 assert.equal((await h.flow.verifyRoute(a.accountId)).ok,true);
 assert.equal(inspectRoutePin(profile).allow,true);
 assert.equal((await h.ledger.binding(a.bindingId)).binding.routeId,held.routeId);
});

test('J01 failed explicit login confirmation withdraws old identity readiness without rotating',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
 let a=await enroll(h);h.sessions.set(a.personaUid,fp('a'));
 assert.equal((await h.flow.confirm(a.accountId)).ok,true);
 const before=h.effects.filter(e=>e.kind==='ASSIGN').length;
 h.sessions.delete(a.personaUid);
 assert.equal((await h.flow.confirm(a.accountId)).code,'NO_PAGE_SESSION');
 a=(await h.accounts.get(a.accountId)).account;
 assert.notEqual(a.state,'VERIFIED');assert.equal(a.boundPrincipal,fp('a'));
 assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,before);
});
test('J01 assigned probe updates current IPv6 disposition and keeps historic public exits',async()=>{
 const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED')],h=setup({relays});
 const a=await enroll(h);
 relays[0].v6='2a03:1b20:1::1';
 assert.equal((await h.flow.verifyRoute(a.accountId)).ok,true);
 const observed=await h.ledger.binding(a.bindingId);
 assert.equal(observed.binding.ipv6Disposition,'OBSERVED');
 relays[0].v6='BLOCKED';assert.equal((await h.flow.verifyRoute(a.accountId)).ok,true);
 assert.equal((await h.ledger.binding(a.bindingId)).binding.ipv6Disposition,'BLOCKED_VERIFIED');
 assert.equal((await h.ledger.read()).ledger.owners['IPv6:2a03:1b20:1::1'],a.accountId);
});

test('J01 periodic recovery resumes transient Add setup without duplicate Persona or assignment',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
 h.faults.host=true;const a=await enroll(h);
 assert.equal(a.setup.code,'MULLVAD_LOCAL_SERVICE_UNAVAILABLE');
 assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,0);
 h.faults.host=false;
 assert.equal((await h.flow.upkeep()).ok,true);
 const ready=(await h.accounts.get(a.accountId)).account;
 assert.equal(ready.state,'WAITING_LOGIN');
 assert.equal(ready.personaUid,a.personaUid);
 await h.flow.upkeep();
 assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,1);
 assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,1);
 assert.equal((await h.ledger.inspect()).activePins,1);
});

test('J01 upkeep reconciles lost Persona-create ACK without requiring another Add or creating a duplicate',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]});
 h.faults.lostCreateAck=true;const a=await enroll(h);
 assert.equal(a.setup.code,'PERSONA_CREATE_UNCONFIRMED');
 assert.equal((await h.flow.upkeep()).ok,true);
 const ready=(await h.accounts.get(a.accountId)).account;
 assert.equal(ready.state,'WAITING_LOGIN');
 assert.equal(h.effects.filter(e=>e.kind==='PERSONA_CREATE').length,1);
 assert.equal(h.profiles.size,1);assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,1);
});

test('interrupted setup durably explains its hold and restart resumes the same donor Persona without duplicate creation',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),original=h.donor.createBoundPersona;
 let once=true;
 h.donor.createBoundPersona=async args=>{const made=await original(args);if(once){once=false;throw Error('lost response after Persona creation')}return made;};
 const started=await h.flow.begin();await h.flow.prepare(started.accountId);
 const held=(await h.accounts.get(started.accountId)).account;
 assert.equal(held.state,'PREPARING');assert.equal(held.setup.phase,'HELD');assert.equal(held.setup.code,'ENROLLMENT_INTERRUPTED');assert.equal(h.flow.running(started.accountId),false);
 assert.equal(h.effects.filter(x=>x.kind==='PERSONA_CREATE').length,1);
 const fresh=createEnrollment({accounts:h.accounts,ledger:h.ledger,donor:h.donor,pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},openLogin:async()=>({ok:true}),identify:async()=>({ok:false})});
 const recovered=await fresh.prepare(started.accountId);assert.equal(recovered.ok,true,recovered.code);
 const ready=(await h.accounts.get(started.accountId)).account;
 assert.equal(ready.state,'WAITING_LOGIN');assert.equal(ready.bindingId,held.bindingId);assert.equal(h.effects.filter(x=>x.kind==='PERSONA_CREATE').length,1);
});

test('a cold controller exposes interrupted setup without replaying its already-created Persona',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),id='cold_setup_account',bindingId='cold_setup_binding';
 await h.accounts.applyCurrent({type:'BEGIN_SETUP',accountId:id,bindingId});
 await h.accounts.applyCurrent({type:'SETUP_PROGRESS',accountId:id,phase:'PERSONA'});
 await h.donor.createBoundPersona({bindingId});const before=structuredClone(h.effects);
 const fresh=createEnrollment({accounts:h.accounts,ledger:h.ledger,donor:h.donor,pins:{hold:holdRoutePin,release:releaseRoutePinHold,reload:reloadRoutePins},openLogin:async()=>({ok:true}),identify:async()=>({ok:false})});
 assert.equal((await fresh.recoverInterrupted()).held,1);assert.deepEqual(h.effects,before);
 const interrupted=(await h.accounts.get(id)).account;assert.equal(interrupted.setup.code,'ENROLLMENT_INTERRUPTED');assert.equal(interrupted.bindingId,bindingId);
 assert.equal((await fresh.recoverInterrupted()).held,0,'known holds keep their reason and revision');
 assert.equal((await fresh.prepare(id)).ok,true);assert.equal(h.effects.filter(x=>x.kind==='PERSONA_CREATE').length,1);
});

test('restore beginning during cold recovery prevents subsequent canonical recovery writes',async()=>{
 const h=setup({relays:[relay('10.124.0.1','45.83.1.1','BLOCKED')]}),id='restore_race_setup';
 await h.accounts.applyCurrent({type:'BEGIN_SETUP',accountId:id,bindingId:'restore_race_binding'});
 const before=(await h.accounts.get(id)).account,events=h.db.keys('events').length;let checks=0;
 assert.equal((await h.flow.recoverInterrupted({canRecover:async()=>++checks<2})).code,'RESTORE_HOLD');
 assert.deepEqual((await h.accounts.get(id)).account,before);assert.equal(h.db.keys('events').length,events);assert.deepEqual(h.effects,[]);
});
