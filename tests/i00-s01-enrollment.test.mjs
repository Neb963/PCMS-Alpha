import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createAccountStore} from '../src/runtime/accounts.mjs';
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
  const faults={};let n=0;
  const exitOf=routeId=>relays.find(r=>r.host===routes.get(routeId)?.host);
  const evidence=(routeId,relay)=>{
    if(faults.host)return {ok:false,code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE',failure:'HOST'};
    if(relay.down)return {ok:false,code:'ROUTE_CONNECTION_FAILED',failure:'ROUTE'};
    return {ok:true,source:'DONOR_ROUTE_PROBE',evidenceId:'evidence_'+(++n).toString().padStart(6,'0'),
      routeId,ipv4:{state:'OBSERVED',address:relay.v4},
      ipv6:relay.v6==='BLOCKED'?{state:'BLOCKED_VERIFIED',basis:'RELAY_REPORTED_IPV6_UNREACHABLE'}:
        relay.v6?{state:'OBSERVED',address:relay.v6}:{state:'UNKNOWN'},
      dns:'VERIFIED_PROTECTED',observedAtMs:1000+n};
  };
  const bound=bindingId=>[...profiles.entries()].filter(([,p])=>p.pcmsBindingId===bindingId);
  const donor={
    async boundPersona({bindingId}){
      const f=bound(bindingId);
      if(f.length!==1)return {ok:false,code:f.length?'BINDING_PERSONA_AMBIGUOUS':'BINDING_PERSONA_ABSENT'};
      const [contextId,p]=f[0];return {ok:true,personaUid:p.personaUid,contextId,routeId:p.routeId};
    },
    async createBoundPersona({bindingId}){
      if(!bound(bindingId).length){
        const contextId='firefox-container-'+(profiles.size+1).toString().padStart(4,'0');
        profiles.set(contextId,{personaUid:'persona-'+contextId.slice(-4)+'-uid0',pcmsBindingId:bindingId,routeId:'__block__'});
        effects.push({kind:'PERSONA_CREATE',bindingId});
        if(faults.lostCreateAck){faults.lostCreateAck=false;return {ok:false,code:'PERSONA_CREATE_UNCONFIRMED'};}
      }
      return donor.boundPersona({bindingId});
    },
    async candidateRoutes({bindingId,excludeRouteIds=[]}){
      const used=new Set([...profiles.values()].filter(p=>p.pcmsBindingId!==bindingId).map(p=>p.routeId));
      const existing=[...routes.keys()].filter(id=>!used.has(id)&&!excludeRouteIds.includes(id))
        .map(routeId=>({kind:'ROUTE',routeId}));
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
  return {donor,effects,profiles,routes,faults};
}
const fp=c=>c.repeat(64);
function setup({relays}){
  const db=fakeDatabase(),accounts=createAccountStore(db),ledger=createExitLedger(db);
  const d=fakeDonor(relays),opened=[],synced=[],order=[];
  const sessions=new Map(); // personaUid -> principal fingerprint (real session oracle)
  closeRoutePins();configureRoutePinSource(()=>ledger.pins());
  const pins={hold:b=>{order.push('HOLD');holdRoutePin(b);},release:releaseRoutePinHold,reload:reloadRoutePins};
  const wrapped={...d.donor,assignRoute:async x=>{order.push('ASSIGN');return d.donor.assignRoute(x);}};
  const flow=createEnrollment({accounts,ledger,donor:wrapped,pins,
    openLogin:async personaUid=>{opened.push(personaUid);return {ok:true};},
    identify:async personaUid=>sessions.has(personaUid)?{ok:true,proof:{source:'GUARDED_SESSION_READBACK',
      verified:true,personaUid,principalFingerprint:sessions.get(personaUid),
      observationId:'identity_'+crypto.randomUUID().replaceAll('-','')}}:{ok:false,code:'NO_PAGE_SESSION'},
    syncInventory:async(accountId)=>{synced.push(accountId);return {ok:true};}});
  const profileOf=account=>{
    const [contextId,p]=[...d.profiles.entries()].find(([,x])=>x.pcmsBindingId===account.bindingId);
    return {...p,containerId:contextId,managed:true,killSwitch:true};
  };
  return {db,accounts,ledger,flow,...d,opened,synced,order,sessions,profileOf};
}
const relay=(host,v4,v6)=>({host,v4,v6});
async function enroll(h){
  const begun=await h.flow.begin();
  assert.equal(begun.ok,true,JSON.stringify(begun));
  await h.flow.prepare(begun.accountId);
  return (await h.accounts.get(begun.accountId)).account;
}

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
  assert.deepEqual(h.order.slice(0,2),['HOLD','ASSIGN'],'pin withdrawn before route mutation');
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

test('S01 review D: archived accounts are observed for drift but never moved',async()=>{
  const relays=[relay('10.124.0.1','45.83.1.1','BLOCKED'),relay('10.124.0.2','45.83.2.2','BLOCKED'),
    relay('10.124.0.3','45.83.3.3','BLOCKED')];
  const h=setup({relays});
  const a=await enroll(h),b=await enroll(h);
  const cur=(await h.accounts.get(b.accountId)).account;
  await h.accounts.apply({type:'ARCHIVE',accountId:b.accountId,expectedRevision:cur.revision});
  const assigns=h.effects.filter(e=>e.kind==='ASSIGN').length;
  relays[1].down=true;
  await h.flow.upkeep();await h.flow.upkeep();
  assert.equal(h.effects.filter(e=>e.kind==='ASSIGN').length,assigns,'archived account never rotated');
  relays[1].down=false;relays[1].v4='45.83.1.1';
  await h.flow.upkeep();
  assert.equal(inspectRoutePin(h.profileOf(b)).allow,false,'drift on archived route holds');
  assert.equal(inspectRoutePin(h.profileOf(a)).allow,true);
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
