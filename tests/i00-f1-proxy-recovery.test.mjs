import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildI00} from '../scripts/build-i00.mjs';

const directory=await mkdtemp(path.join(tmpdir(),'pcms-f1-proxy-recovery-'));
after(()=>rm(directory,{recursive:true,force:true}));
const {stage}=await buildI00({packageArchive:false,buildDirectory:directory});
const [runtimeSource,background]=await Promise.all([
 readFile(path.join(stage,'lib/mullvad-runtime.js'),'utf8'),
 readFile(path.join(stage,'background.js'),'utf8')
]);
const createRuntime=vm.runInNewContext(runtimeSource.replace(/^export\s+/gm,'')+'\ncreateMullvadRuntime;',
 {crypto:webcrypto});
const first=background.indexOf('browser.proxy.onError.addListener('),
 last=background.indexOf('\nbrowser.webNavigation.onCommitted',first);
assert.ok(first>=0&&last>first,'exercise the actual packaged proxy-error handler');
const onErrorSource=background.slice(first,last);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const route={id:'route_f1_proxy',host:'10.124.0.7',port:1080,provider:'mullvad'};
const endpoint={route_id:route.id,relay_ip:route.host,relay_port:1080,
 local_host:'127.0.0.1',local_port:5501};
function fixture({duringPrepare=async()=>{}}={}){
 let now=100000,prepares=0,releases=0,statusReads=0;
 const status={installed:true,ready:true,version:'0.3.0',
  active_exits:[],pending_prepare_routes:[]};
 const runtime=createRuntime({now:()=>now,
  getState:async()=>({global:{mullvadNative:{autoStart:true}},
   routes:{[route.id]:route},profiles:{}}),
  browserApi:{tabs:{query:async()=>[]}},
  operations:{
   getStatus:async()=>{statusReads++;return structuredClone(status)},
   prepareExit:async(_route,start)=>{assert.equal(start,true);prepares++;await duringPrepare();
    status.active_exits=[endpoint];return endpoint},
   releaseExit:async()=>{releases++;return {ok:true,released:true}},
   stopTunnel:async()=>({ok:true})
  }});
 let onError;const evidence=new Map([['container',{}]]),generations=new Map();
 vm.runInNewContext(onErrorSource,{
  browser:{proxy:{onError:{addListener:fn=>onError=fn}}},
  securityState:{},nowIso:()=> 'fixture-time',mullvadRuntime:runtime,
  routeContexts:new Map([['container',{}]]),routeTestGenerations:generations,routeTests:evidence
 });
 assert.equal(typeof onError,'function');
 return {runtime,status,evidence,generations,error:()=>onError({message:'fixture unrelated authentication failure'}),
  counts:()=>({prepares,releases,statusReads}),advance:ms=>{now+=ms},now:()=>now};
}

test('F1 a proxy error withdraws route evidence and freshly observes the same authenticated endpoint without preparing it again',async()=>{
 const f=fixture(),initial=await f.runtime.resolve(route);
 assert.equal(f.counts().prepares,1);assert.equal(f.counts().statusReads,1);
 f.error();assert.equal(f.evidence.size,0);assert.equal(f.generations.get('container'),1);
 const observed=await f.runtime.resolve(route);
 assert.ok(observed);assert.equal(observed.password,initial.password);
 assert.equal(observed.host,'127.0.0.1');assert.equal(observed.proxyDNS,true);
 assert.deepEqual(f.counts(),{prepares:1,releases:0,statusReads:2},
  'a failed request is not authority to rotate a settled native credential');
});

test('F1 an independently reconciled lost-ACK credential survives a later proxy error without any new preparation',async()=>{
 const f=fixture(),token='e'.repeat(64);f.status.active_exits=[endpoint];
 const generation=f.runtime.recoveryGeneration(route.id);
 assert.equal(f.runtime.acceptObservedPreparation(route,endpoint,token,f.now(),generation),true);
 f.error();const observed=await f.runtime.resolve(route);
 assert.equal(observed.password,token);assert.equal(f.counts().prepares,0);
 assert.equal(f.counts().statusReads,1,'old cached admission cannot skip fresh native status');
 assert.equal(f.evidence.size,0,'native credential recovery does not restore provider route evidence');
});

test('F1 an unrelated proxy error cannot cancel or release an actually pending native preparation',async()=>{
 const entered=deferred(),release=deferred();
 const f=fixture({duringPrepare:async()=>{entered.resolve();await release.promise}});
 const pending=f.runtime.resolve(route);await entered.promise;
 const generation=f.runtime.recoveryGeneration(route.id);
 f.error();const same=f.runtime.resolve(route);release.resolve();
 const [a,b]=await Promise.all([pending,same]);
 assert.ok(a);assert.equal(a,b);assert.equal(f.counts().prepares,1);
 assert.equal(f.counts().releases,0,'the existing native owner remains responsible until settlement');
 assert.equal(f.runtime.recoveryGeneration(route.id).lifecycle,generation.lifecycle);
});

test('F1 missing helper after a proxy error holds admission and a recovered matching endpoint reuses its known credential',async()=>{
 const f=fixture(),initial=await f.runtime.resolve(route);f.error();
 f.status.installed=false;f.status.ready=false;
 assert.equal(await f.runtime.resolve(route),null);assert.equal(f.counts().prepares,1);
 f.status.installed=true;f.status.ready=true;
 assert.equal((await f.runtime.resolve(route)).password,initial.password);
 assert.equal(f.counts().prepares,1);assert.equal(f.counts().releases,0);
});

test('F1 an actually absent forwarder still permits one donor-owned fresh preparation after proxy failure',async()=>{
 const f=fixture(),initial=await f.runtime.resolve(route);f.error();f.status.active_exits=[];
 const renewed=await f.runtime.resolve(route);
 assert.ok(renewed);assert.notEqual(renewed.password,initial.password);
 assert.equal(f.counts().prepares,2);
 assert.equal((await f.runtime.resolve(route)).password,renewed.password);
 assert.equal(f.counts().prepares,2);
});

test('F1 explicit native lifecycle clear and route drop keep their original generation fences',async()=>{
 const f=fixture(),initial=await f.runtime.resolve(route);
 const old=f.runtime.recoveryGeneration(route.id);f.runtime.clear();
 assert.equal(f.runtime.recoveryCurrent(old),false);
 assert.equal(f.runtime.acceptObservedPreparation(route,endpoint,initial.password,f.now(),old),false);
 const next=await f.runtime.resolve(route);
 assert.notEqual(next.password,initial.password);assert.equal(f.counts().prepares,2);
 const routeGeneration=f.runtime.recoveryGeneration(route.id);f.runtime.drop(route.id);
 assert.equal(f.runtime.acceptObservedPreparation(route,endpoint,next.password,f.now(),routeGeneration),false);
});
