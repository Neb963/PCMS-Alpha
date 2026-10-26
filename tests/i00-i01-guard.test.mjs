import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createPersonaGuard } from '../src/runtime/persona-guard.mjs';
import { createWakeService, WAKE_ALARM } from '../src/runtime/wake.mjs';

test('F1 cold health wake preserves an existing due alarm instead of postponing delivery',async()=>{
 const f=fakeBrowser(),created=[];
 const due={name:WAKE_ALARM,scheduledTime:6000};
 f.api.alarms.get=async name=>{assert.equal(name,WAKE_ALARM);return due};
 f.api.alarms.create=(...args)=>created.push(args);
 const wake=createWakeService(f.api);wake.register();
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.deepEqual(created,[],'cold evaluation must not replace the already scheduled wake');
 assert.equal(due.scheduledTime,6000);
});

test('F1 alarm reconstruction coalesces concurrent startup hints and reports failed inspection',async()=>{
 const f=fakeBrowser(),created=[];let release;
 f.api.alarms.get=()=>new Promise(r=>release=r);
 f.api.alarms.create=(...args)=>created.push(args);
 const wake=createWakeService(f.api);wake.register();
 f.listeners.startup[0]();f.listeners.installed[0]();
 for(let i=0;i<5;i++)await Promise.resolve();
 assert.deepEqual(created,[]);release(undefined);
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.deepEqual(created,[[WAKE_ALARM,{periodInMinutes:10}]]);
 f.api.alarms.get=async()=>{throw Error('private details must not escape')};
 f.listeners.startup[0]();
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(wake.getLocalReceipt().storageFailure,true);
 assert.equal(created.length,1,'unknown alarm state must not reset the existing schedule');
});

test('F1 health readback waits for the actual queued alarm receipt instead of reporting an unpersisted wake',async()=>{
 const f=fakeBrowser(),set=f.api.storage.local.set,replies=[];let release;
 const barrier=new Promise(r=>release=r);
 f.api.storage.local.set=async packet=>{await barrier;return set(packet)};
 const wake=createWakeService(f.api);wake.register();
 f.listeners.alarm[0]({name:WAKE_ALARM});
 f.listeners.connect[0]({name:'pcms-i01-health-readonly',
  sender:{id:f.api.runtime.id,url:f.api.runtime.getURL('pcms/index.html')},postMessage:v=>replies.push(v)});
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.deepEqual(replies,[],'health must not overtake the persisted alarm checkpoint');
 release();await new Promise(r=>setImmediate(r));
 assert.equal(replies[0].healthStorage,'BEST_EFFORT');
 assert.equal(replies[0].receiptPersisted,true);
 assert.equal(f.storage.pcmsI01WakeHealth.alarmCount,1);
});

function donorFixture() {
  const all = {
    aaaaaaaa: { personaUid:'aaaaaaaa', cookieStoreId:'firefox-container-1', routeId:'protected',
      route:{ enabled:true } },
    bbbbbbbb: { personaUid:'bbbbbbbb', cookieStoreId:'firefox-container-2', routeId:'protected',
      route:{ enabled:true } }
  };
  const active = new Map();
  let id = 0, forbiddenEffects = 0;
  const securityState={ready:true,privacySafe:true,proxyControl:'controlled_by_this_extension'};
  const shared={
    async resolve(uid) { if(!all[uid])throw Error('not found'); return {pcmsBindingId:'binding_'+uid,...all[uid]}; },
    async acquire(uid) {
      if(active.has(uid))throw Error('busy');
      const lease={leaseId:'lease-'+(++id),cookieStoreId:all[uid].cookieStoreId,expiresAt:'future'};
      active.set(uid,lease);
      return {...lease};
    },
    async validate(uid,leaseId) {
      const lease=active.get(uid);
      if(!lease||lease.leaseId!==leaseId) throw Error('revoked');
      return {cookieStoreId:all[uid].cookieStoreId};
    },
    async release(leaseId) {
      for(const [uid,lease] of active)if(lease.leaseId===leaseId){active.delete(uid);return;}
      throw Error('already revoked');
    }
  };
  const guard=createPersonaGuard({
    initialize:async()=>{},
    securityState,
    shared,
    getRouteTest:async()=>({ok:true,checkedAt:'fake-current'}),
    // S01 route pin modelled as committed for these fixtures.
    pinGate:()=>({allow:true})
  });
  return {guard,all,active,shared,securityState, forbiddenEffects:()=>forbiddenEffects,
    dispatch:()=>{forbiddenEffects++;}};
}

test('P51-02 F: stable Persona UID binds to fresh container and shared donor lease',async()=>{
  const f=donorFixture();
  const admitted=await f.guard.acquireConflictGuard('aaaaaaaa');
  assert.equal(admitted.ready,true,JSON.stringify(admitted));
  assert.equal(admitted.cookieStoreId,'firefox-container-1');
  assert.equal(f.active.size,1);
  assert.equal((await f.guard.acquireConflictGuard('aaaaaaaa')).ready,false);
  assert.equal((await f.guard.inspectOwnedAction(admitted)).ready,true);
  assert.deepEqual(await f.guard.releaseConflictGuard(admitted),{released:true});
  assert.equal(f.active.size,0);
  assert.equal(f.forbiddenEffects(),0);
});

test('Issue60: same-sender donor lease reuse cannot merge two independent PCMS owners or let a stale release revoke current work',async()=>{
 const f=donorFixture(),acquire=f.shared.acquire;
 let reused=0;f.shared.acquire=async uid=>{if(f.active.has(uid)){reused++;return {...f.active.get(uid)}}return acquire(uid)};
 const first=await f.guard.acquireConflictGuard('aaaaaaaa');
 assert.equal((await f.guard.acquireConflictGuard('aaaaaaaa')).code,'DONOR_LEASE_BUSY_OR_REVOKED');assert.equal(reused,0);
 await f.guard.releaseConflictGuard(first);const second=await f.guard.acquireConflictGuard('aaaaaaaa');
 assert.equal((await f.guard.releaseConflictGuard(first)).code,'LEASE_ALREADY_LOST');
 assert.equal((await f.guard.inspectOwnedAction(second)).ready,true);await f.guard.releaseConflictGuard(second);
});

test('P51-02 F negative: revocation, route drift, container rotation and no Direct fallback',async()=>{
  const f=donorFixture();
  const owned=await f.guard.acquireConflictGuard('aaaaaaaa');
  f.all.aaaaaaaa.cookieStoreId='firefox-container-rotated';
  assert.equal((await f.guard.inspectOwnedAction(owned)).code,'TARGET_CHANGED');
  f.all.aaaaaaaa.cookieStoreId='firefox-container-1';
  f.all.aaaaaaaa.routeId='direct';
  assert.equal((await f.guard.inspectOwnedAction(owned)).code,'DIRECT_FORBIDDEN');
  assert.equal((await f.guard.acquireConflictGuard('aaaaaaaa')).code,'DIRECT_FORBIDDEN');
  // Another Persona does not inherit the held Persona's route state.
  assert.equal((await f.guard.acquireConflictGuard('bbbbbbbb')).ready,true);
  assert.equal((await f.guard.runBoundedOwnedAction(owned, f.dispatch)).code,'CAPABILITY_OFF');
  assert.equal(f.forbiddenEffects(),0);
  await f.shared.release(owned.leaseId);
  f.all.aaaaaaaa.routeId='protected';
  assert.equal((await f.guard.inspectOwnedAction(owned)).code,'LEASE_REVOKED');
});

test('P51-02 F negative: donor bootstrap/privacy loss and changed route during admission release lease',async()=>{
  const f=donorFixture();
  f.securityState.ready=false;
  assert.equal((await f.guard.acquireConflictGuard('aaaaaaaa')).code,'DONOR_SECURITY_UNAVAILABLE');
  f.securityState.ready=true;
  f.securityState.proxyControl='controlled_by_other_extensions';
  assert.equal((await f.guard.acquireConflictGuard('aaaaaaaa')).code,'DONOR_SECURITY_UNAVAILABLE');
  f.securityState.proxyControl='controlled_by_this_extension';
  const acquire=f.shared.acquire;
  f.shared.acquire=async uid=>{const result=await acquire(uid);f.all[uid].routeId='block';return result;};
  assert.equal((await f.guard.acquireConflictGuard('aaaaaaaa')).code,'GUARD_CHANGED');
  assert.equal(f.active.size,0,'stale acquired donor lease must be released');
});

function fakeBrowser({ failStorage=false }={}) {
  const listeners={message:[],connect:[],startup:[],installed:[],alarm:[]};
  const storage={};
  const api={
    runtime:{id:'persona-route-manager@local',getURL:p=>'moz-extension://fixed-test-uuid/'+p,
      onMessage:{addListener:fn=>listeners.message.push(fn)},
      onConnect:{addListener:fn=>listeners.connect.push(fn)},
      onStartup:{addListener:fn=>listeners.startup.push(fn)},
      onInstalled:{addListener:fn=>listeners.installed.push(fn)}},
    alarms:{created:[],create(name,settings){this.created.push([name,settings]);},
      onAlarm:{addListener:fn=>listeners.alarm.push(fn)}},
    storage:{local:{async get(key){return {[key]:storage[key]};},
      async set(changes){if(failStorage)throw Error('disk denied');Object.assign(storage,changes);}}}
  };
  return {api,listeners,storage};
}

test('P51-01 F: registers all wake sources synchronously, no dashboard, recovery await or provider work',async()=>{
  const f=fakeBrowser(), wake=createWakeService(f.api);
  wake.register();wake.register();
  assert.deepEqual(Object.fromEntries(Object.entries(f.listeners).map(([k,v])=>[k,v.length])),
    {message:1,connect:1,startup:1,installed:1,alarm:1});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.alarms.created.length,1);
  const trusted={id:f.api.runtime.id,url:f.api.runtime.getURL('pcms/index.html')};
  const replies=[];
  f.listeners.connect[0]({name:'pcms-i01-health-readonly',sender:trusted,
    postMessage:reply=>replies.push(reply)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(replies[0].providerEffects,'OFF');
  assert.equal(replies[0].donorReady,false);
  const denied=[];
  f.listeners.connect[0]({name:'pcms-i01-health-readonly',
    sender:{id:f.api.runtime.id,url:'https://perchance.org/pcms/index.html'},
    postMessage:reply=>denied.push(reply)});
  assert.equal(denied[0].code,'UNTRUSTED_SENDER');
  f.listeners.connect[0]({name:'legacy-donor-port',sender:trusted,postMessage:()=>{throw Error('wrong port')}});
  assert.equal(f.listeners.message[0]({type:'DONOR_MESSAGE'},trusted),undefined);
  assert.equal(f.listeners.message[0]({type:'PCMS_I01_WAKE'},trusted),undefined);
  assert.equal(wake.getLocalReceipt().lastEvent,'message');
  f.listeners.alarm[0]({name:'another-alarm'});
  assert.equal(wake.getLocalReceipt().eventCount,2);
  f.listeners.startup[0]();
  f.listeners.alarm[0]({name:WAKE_ALARM});
  assert.equal(wake.getLocalReceipt().lastEvent,'alarm');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.api.alarms.created.length,2,'startup/alarm hints coalesce reconstruction');
  assert.equal(f.storage.pcmsI01WakeHealth.lastWake,'alarm');
  assert.equal(f.storage.pcmsI01WakeHealth.alarmCount,1);
});

test('P51-01 F negative: storage fail does not fake success or allow effect dispatch',async()=>{
  const f=fakeBrowser({failStorage:true}), wake=createWakeService(f.api);
  wake.register();
  f.listeners.alarm[0]({name:WAKE_ALARM});
  await new Promise(resolve=>setImmediate(resolve));
  const replies=[];
  f.listeners.connect[0]({name:'pcms-i01-health-readonly',
    sender:{id:f.api.runtime.id,url:f.api.runtime.getURL('pcms/index.html')},
    postMessage:reply=>replies.push(reply)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(replies[0].healthStorage,'DEGRADED');
  assert.equal(replies[0].providerEffects,'OFF');
});

test('I01 static entry keeps donor gate first and overlay prevents separate native controller',async()=>{
  const entry=await readFile(new URL('../src/runtime/entry.mjs',import.meta.url),'utf8');
  const overlay=await readFile(new URL('../src/runtime/overlay.mjs',import.meta.url),'utf8');
  assert.ok(entry.indexOf('../lib/recovery-bootstrap.js')<entry.indexOf('./wake.mjs'));
  assert.match(overlay,/shared donor control-lease registry|EXISTING donor control-lease registry/i);
  assert.doesNotMatch(entry,/await\b|setTimeout/);
});
