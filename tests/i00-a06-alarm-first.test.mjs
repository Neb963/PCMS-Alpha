import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRefresherBoundary,REFRESHER_ALARM}
  from '../src/runtime/refresher-boundary.mjs';
globalThis.crypto ??= webcrypto;
const T=2_000_000_000,MINUTE=60_000;
test('A06 RED from installed Firefox: cold-start alarm rearms before blocked storage/route reconciliation',async()=>{
  const registered={startup:[],installed:[],alarm:[],connect:[]};
  const listener=(kind)=>({addListener:f=>registered[kind].push(f)});
  const reads=()=>new Promise(()=>{}); // deliberately unresolvable startup state
  let scheduled=null,created=0;
  const api={
    storage:{local:{get:reads,set:async()=>{}}},
    alarms:{onAlarm:listener('alarm'),get:async()=>scheduled,
      create:async(name,{when})=>{created++;scheduled={name,scheduledTime:when};}},
    runtime:{onStartup:listener('startup'),
      onInstalled:listener('installed'),onConnect:listener('connect')}};
  const boundary=createRefresherBoundary(api,{clock:()=>T,newId:()=> 'test_browser_boot_01',
    open:reads,browserClockGate:()=>true});
  boundary.register();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(scheduled?.name,REFRESHER_ALARM,
    'real background must have a wake alarm even when canonical IDB never becomes ready');
  assert.equal(scheduled.scheduledTime,T+MINUTE);
  assert.equal(created,1);
  // Double cold-start notification must not postpone an already pending alarm.
  registered.startup[0]();registered.installed[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(created,1);
  assert.equal(scheduled.scheduledTime,T+MINUTE);
});
