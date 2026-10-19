import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRefresherBoundary,validateRefresherMessage,REFRESHER_ALARM} from '../src/runtime/refresher-boundary.mjs';
import {perchanceMonitorIsolated} from '../src/runtime/perchance-monitor.mjs';
import {createSafeReport} from '../src/ui/safe-report.mjs';
import {cachedHealthDomain} from '../src/runtime/persona-guard.mjs';
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
function fixture({gate=false,dbFail=false,ackLost=false}={}){
  const callbacks={},alarms=new Map(),diag=[];let turns=0,reads=0,release;
  const blocker=new Promise(r=>{release=r;});
  const event=name=>({addListener:cb=>{callbacks[name]=cb;}});
  const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p,
    onStartup:event('startup'),onInstalled:event('installed'),onConnect:event('connect')},
    alarms:{onAlarm:event('alarm'),create:async(name,p)=>{alarms.set(name,{name,...p});if(ackLost)throw Error('lost');},
      get:async name=>alarms.get(name)},storage:{local:{get:async()=>({}),set:async x=>diag.push(x)}}};
  const boundary=createRefresherBoundary(api,{open:async()=>{if(dbFail)throw Error('quota');return {};},
    newId:()=> 'synthetic_boot_01',clock:()=>100000,observationGate:()=>gate,
    storeFactory:()=>({turn:async()=>{turns++;await blocker;
      return {ok:true,revision:2,state:{nextWakeAt:160000,diagnostics:{turns}}};},
      read:async()=>({ok:true,state:{rows:[],recent:{nextDueAt:200000}}})}),
    guard:()=>({observeMonitoring:async()=>{reads++;}})});
  return {api,boundary,callbacks,alarms,diag,release,stats:()=>({turns,reads})};
}
test('P51-07/P54-07 F/X: synchronous registration, four wake sources coalesce, one alarm, lost ACK observed',async()=>{
  const f=fixture({ackLost:true});f.boundary.register();
  assert.deepEqual(Object.keys(f.callbacks).sort(),['alarm','connect','installed','startup']);
  f.callbacks.startup();f.callbacks.installed();f.callbacks.alarm({name:REFRESHER_ALARM});
  const finish=f.boundary.tick();f.release();const r=await finish;
  assert.equal(r.ok,true);assert.equal(r.alarmHeld,false);assert.equal(f.stats().turns,1);
  assert.equal(f.alarms.size,1);assert.equal(f.stats().reads,0);
  assert.equal(r.observation,'MONITOR_ACTIVATION_HELD');
});
test('P54-07 F/X: real canonical open failure has no empty healthy queue, alarm or provider effect',async()=>{
  const f=fixture({dbFail:true});assert.equal((await f.boundary.tick()).ok,false);
  assert.equal(f.alarms.size,0);assert.equal(f.stats().reads,0);
  assert.equal(f.diag.at(-1).pcmsI12Status.code,'CANONICAL_UNAVAILABLE');
});
test('I12 F/X: forged web senders and injected interval/owner/release/native parameters denied',()=>{
  const f=fixture();
  assert.equal(validateRefresherMessage(f.api,{...sender,url:'https://perchance.org/'},{type:'GET_REFRESHER'}).code,'UNTRUSTED_SENDER');
  for(const type of ['REFRESH','UNLIST','PUBLISH','SUBMIT_INTERVAL','CONFIRM_RELEASE'])
    assert.equal(validateRefresherMessage(f.api,sender,{type}).ok,false);
  for(const params of [{receipt:{healthy:true}},{limit:1000},{query:'x'.repeat(81)},{accountId:'../x'}])
    assert.equal(validateRefresherMessage(f.api,sender,{type:'GET_REFRESHER',params}).ok,false);
  assert.equal(validateRefresherMessage(f.api,sender,{type:'SET_POLICY',params:{expectedRevision:1,policy:{},proof:{}}}).ok,false);
});
test('I12 activation F: forced operator observation cannot bypass the off gate',async()=>{
  const f=fixture();
  const result=await f.boundary.run({type:'OBSERVE_NOW'},sender);
  assert.equal(result.code,'MONITOR_ACTIVATION_HELD');assert.equal(f.stats().reads,0);
});
async function withTransport(payload,request={kind:'RECENT'},status=200){
  const original={fetch:globalThis.fetch,location:globalThis.location};let requests=[];
  globalThis.location={origin:'https://perchance.org'};
  globalThis.fetch=async(url,options)=>{
    requests.push({url,options});return new Response(JSON.stringify(payload),{
      status,headers:{'Content-Type':'application/json','Retry-After':'3600'}});
  };
  try{return {result:await perchanceMonitorIsolated(request),requests};}
  finally{globalThis.fetch=original.fetch;if(original.location===undefined)delete globalThis.location;else globalThis.location=original.location;}
}
test('P54-10 F: fixed Discovery v3 recent-first GET exposes only slug/views; no title/session/source',async()=>{
  const packet=await withTransport({status:'success',generators:[
    {name:'test-recent',views:1200,metaData:{title:'SECRET_CANARY'},sessionToken:'SECRET_CANARY'},
    {name:'test-second',views:900}]});
  assert.deepEqual(packet.result,{ok:true,complete:true,items:[{slug:'test-recent',views:1200},{slug:'test-second',views:900}]});
  assert.equal(packet.requests[0].url,'https://perchance.org/api/getGeneratorList');
  assert.equal(packet.requests[0].options.method,'GET');assert.equal(packet.requests[0].options.redirect,'error');
  assert.equal(JSON.stringify(packet.result).includes('SECRET_CANARY'),false);
});
test('P54-08/10 X: schema drift, duplicate slug, credential URL, rate limit and oversized streamed bytes held',async()=>{
  for(const payload of [{status:'success',generators:[{name:'x',views:1},{name:'x',views:2}]},
    {status:'success',generators:[{name:'../x',views:1}]},{status:'success',generators:[{name:'x',views:-1}]},
    {status:'success',generators:[],secret:'X'.repeat(1048576)}])
    assert.equal((await withTransport(payload)).result.ok,false);
  const bad=await withTransport({},{kind:'STATISTIC',slug:'https://evil.invalid'});assert.equal(bad.requests.length,0);
  const limited=await withTransport({},undefined,429);assert.equal(limited.result.code,'RATE_LIMITED');
  assert.equal(limited.result.retryAfterMs,HOUR);
  const outage=await withTransport({},undefined,503);assert.equal(outage.result.code,'PROVIDER_UNAVAILABLE');
});
const HOUR=3600000;
test('P54-10 F: unsupported stats shape stays unknown; corrections remain absolute numbers',async()=>{
  const metric=await withTransport({status:'success',views:900},{kind:'STATISTIC',slug:'test-recent'});
  assert.deepEqual(metric.result,{ok:true,views:900,unit:'VIEWS',source:'GUARDED_READ_ONLY'});
  const unknown=await withTransport({status:'success',count:900},{kind:'STATISTIC',slug:'test-recent'});
  assert.equal(unknown.result.code,'STATISTIC_SCHEMA_UNVERIFIED');
});
test('I12 diagnostics F/X: fixed counts only, secret/source/route/IDs excluded even in nested forged heartbeat',()=>{
  const report=createSafeReport({refresher:{mode:'SHADOW_ONLY',code:'SECRET_CANARY',turns:4,
    reads:2,mutations:999,queuePeak:1250,readPeak:2,source:'SECRET_CANARY',token:'SECRET_CANARY'}});
  assert.equal(report.refresher.mutations,0);assert.equal(report.refresher.code,'UNKNOWN');
  assert.equal(JSON.stringify(report).includes('SECRET_CANARY'),false);
});
test('I12 packaging F: static graph/guarded fixed executor/view available; no direct native or privilege smuggling',async()=>{
  const overlay=await readFile('src/runtime/overlay.mjs','utf8');
  for(const n of ['refresher-core.mjs','refresher-store.mjs','refresher-boundary.mjs','perchance-monitor.mjs'])assert.ok(overlay.includes(n));
  assert.match(overlay,/func:perchanceMonitorIsolated,args:\[monitoringRequest\]/);
  assert.match(overlay,/MONITOR_SESSION_CHANGED/);
  assert.match(await readFile('src/runtime/entry.mjs','utf8'),/import \{createRefresherBoundary\} from '\.\/refresher-boundary\.mjs'/);
  const entry=await readFile('src/runtime/entry.mjs','utf8');
  assert.match(entry,/createRefresherBoundary\(browser,\{qualificationFor:/);
  assert.match(entry,/refreshAdapter:native\}\).register\(\)/);
  assert.match(entry,/createRefresherNativeAdapter\(\)/);
  assert.equal((entry.match(/createRefresherBoundary\(browser/g)||[]).length,1);
  assert.match(await readFile('src/ui/index.html','utf8'),/refresher-view\.mjs/);
});
test('P54-08 X: current donor egress hashes, never route names, determine witness independence',async()=>{
  const same=await cachedHealthDomain({ok:true,data:{ip:'203.0.113.9'}});
  assert.equal(same,await cachedHealthDomain({ok:true,data:{ip:'203.0.113.9'}}));
  assert.notEqual(same,await cachedHealthDomain({ok:true,data:{ip:'203.0.113.10'}}));
  assert.equal(same.includes('203.0.113'),false);
  assert.equal(await cachedHealthDomain({ok:false,data:{ip:'203.0.113.9'}}),null);
  assert.equal(await cachedHealthDomain({ok:true,data:{ip:'999.0.113.9'}}),null);
  assert.equal(await cachedHealthDomain({ok:true,data:{ip:'203.00.113.9'}}),null);
  assert.equal(await cachedHealthDomain({ok:true,data:{ip:'::1'}}),null);
});
