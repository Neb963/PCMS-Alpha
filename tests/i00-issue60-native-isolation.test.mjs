import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildI00} from '../scripts/build-i00.mjs';
import {collectPortableLocal,preparePortableLocalRestore} from '../src/runtime/portable-local.mjs';
import {withNativeReceiptLock,restoreNativeReceipt} from '../src/runtime/native-receipts.mjs';

const nativeCode=async path=>(await readFile(path,'utf8')).replace('../pcms/native-receipts.mjs',new URL('../src/runtime/native-receipts.mjs',import.meta.url).href);
const signal=()=>{const listeners=new Set();return {addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:x=>{for(const f of [...listeners])f(x)}}};
test('Issue60: native status observes independently of a pending forwarder command',async()=>{
 const {stage}=await buildI00({packageArchive:false,buildDirectory:'/tmp/pcms-issue60-native-d'});
 const ports=[],local={};let release,entered;
 const started=new Promise(resolve=>entered=resolve);
 globalThis.browser={storage:{local:{get:async key=>key===null?{...local}:{[key]:local[key]},set:async data=>Object.assign(local,data),remove:async key=>{delete local[key]}}},runtime:{connectNative(host){assert.equal(host,'com.persona.mullvad_router');
  const p={onMessage:signal(),onDisconnect:signal(),disconnect(){},postMessage(m){
   if(m.command==='prepare_exit'){release=()=>p.onMessage.emit({...m,ok:true,ready:true,local_host:'127.0.0.1',local_port:5501});entered();}
   else if(m.command==='status'){
    const reply=()=>p.onMessage.emit({id:m.id,ok:true,version:'0.3.0',interface_up:true,base_proxy_reachable:false,ready:false});
    if(ports[0]===p&&release){const prior=release;release=()=>{prior();reply()}}else queueMicrotask(reply);
   }
  }};ports.push(p);return p;}}};
 const code=await nativeCode(stage+'/lib/mullvad-native.js');
 const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const pending=native.prepareExit({id:'route_0001',host:'10.124.0.1',port:1080},true,'a'.repeat(64));
 await started;
 try{
  const status=await Promise.race([native.getNativeStatus(),new Promise(resolve=>setTimeout(()=>resolve({blocked:true}),40))]);
  assert.equal(status.installed,true,'status must not sit behind native mutation');
  assert.equal(status.base_proxy_reachable,false,'tunnel up is not SOCKS ready');
  assert.equal(ports.length,2);
 }finally{release?.();await pending;delete globalThis.browser;}
});

test('Issue60: uncertain prepare survives healthy status and cold module restart; only matching positive late ACK settles it',async()=>{
 const local={},ports=[],messages=[];
 const storage={get:async key=>key===null?{...local}:{[key]:local[key]},set:async data=>Object.assign(local,data),remove:async key=>{delete local[key]}};
 let reply=null,immediate=false;
 globalThis.browser={storage:{local:storage},runtime:{connectNative(){
  const p={onMessage:signal(),onDisconnect:signal(),disconnect(){},postMessage(m){messages.push(m.command);
   if(m.command==='prepare_exit'){
    const value={...m,ok:true,ready:true,local_host:'127.0.0.1',local_port:5501};
    if(immediate)queueMicrotask(()=>p.onMessage.emit(value));else reply=()=>p.onMessage.emit(value);
   }else if(m.command==='status')queueMicrotask(()=>p.onMessage.emit({id:m.id,ok:true,version:'0.3.0',ready:true}));
  }};ports.push(p);return p;
 }}};
 const original=await nativeCode('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js');
 // Accelerate only the developer test clock; packaged product retains45s.
 const code=original.replace('},45000,async late','},20,async late');
 const load=tag=>import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#'+tag);
 const route={id:'route_uncertain',host:'10.124.0.1',port:1080},token='e'.repeat(64);
 try{
  const native=await load('uncertain');
  await assert.rejects(native.prepareExit(route,true,token),e=>e.nativeOutcomeUncertain===true);
  assert.equal(messages.filter(x=>x==='prepare_exit').length,1);
  const portable=collectPortableLocal(local);
  assert.equal(JSON.stringify(portable).includes(token),false,'receipt export excludes the credential');
  assert.equal(Object.keys(portable).length,1,'uncertainty metadata remains portable');
  assert.deepEqual(preparePortableLocalRestore(portable,local,{mode:'replace'}),{},'restore never clobbers destination uncertainty or its private reconciliation credential');
  assert.equal((await native.getNativeStatus()).ready,true);
  assert.equal(JSON.stringify(await native.getNativeStatus()).includes(token),false);
  await assert.rejects(native.prepareExit(route,true,token),e=>e.nativeOutcomeUncertain===true);
  await assert.rejects(native.releaseExit(route.id),e=>e.nativeOutcomeUncertain===true);
  const cold=await load('cold');
  await assert.rejects(cold.prepareExit(route,true,token),e=>e.nativeOutcomeUncertain===true);
  assert.equal(messages.filter(x=>x==='prepare_exit').length,1,'no replay after restart');
  assert.equal(messages.includes('release_exit'),false,'no cleanup guesses');
  reply();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(local,{});immediate=true;
  assert.equal((await cold.prepareExit(route,true,token)).local_port,5501);
  assert.equal(messages.filter(x=>x==='prepare_exit').length,2);
 }finally{delete globalThis.browser;}
});

test('Issue60: delayed retired-port disconnect cannot reject a new connection request',async()=>{
 const ports=[];let failPost=true;
 globalThis.browser={runtime:{connectNative(){
  const p={onMessage:signal(),onDisconnect:signal(),disconnect(){},postMessage(m){p.last=m;if(failPost){failPost=false;throw Error('old connection send failed')}}};
  ports.push(p);return p;
 }}};
 const code=await nativeCode('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js');
 const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#retired');
 try{
  await assert.rejects(native.nativeRequest('ping',{},1000));
  const current=native.nativeRequest('ping',{},1000);
  ports[0].onDisconnect.emit();
  ports[1].onMessage.emit({id:ports[1].last.id,ok:true,version:'0.3.0'});
  assert.equal((await current).version,'0.3.0');
 }finally{delete globalThis.browser;}
});

test('Issue60: cold reconciliation validates the private receipt, endpoint, host and expiry; restore cannot manufacture no-dispatch',async()=>{
 const routeId='route_recovery',key='personaMullvadPendingPrepare:'+routeId;
 const row={schema:2,phase:'DISPATCH_POSSIBLE',nonce:crypto.randomUUID(),routeId,relayIp:'10.124.0.7',relayPort:1080,password:'a'.repeat(64),createdAtMs:Date.now()};
 const local={[key]:row},endpoint={route_id:routeId,relay_ip:row.relayIp,relay_port:1080,local_host:'127.0.0.1',local_port:5501};
 const status={installed:true,ready:true,version:'0.3.0',active_exits:[endpoint]};
 globalThis.browser={storage:{local:{get:async k=>k===null?{...local}:{[k]:local[k]},set:async v=>Object.assign(local,v),remove:async k=>{delete local[k]}}}};
 const code=await nativeCode('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js');
 const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#validation');
 try{
  assert.equal((await native.inspectPendingPreparation(routeId,status)).password,row.password);
  for(const bad of [{...status,ready:false},{...status,version:'0.3.1'},{...status,active_exits:[endpoint,endpoint]},
   {...status,active_exits:[{...endpoint,relay_ip:'10.124.0.8'}]},{...status,active_exits:[{...endpoint,local_host:'192.168.1.1'}]}])
   assert.equal(await native.inspectPendingPreparation(routeId,bad),null);
  local[key]={...row,createdAtMs:Date.now()-3600001};assert.equal(await native.inspectPendingPreparation(routeId,status),null);
  local[key]={...row,password:undefined};assert.equal(await native.inspectPendingPreparation(routeId,status),null);
  const restored=preparePortableLocalRestore(collectPortableLocal({[key]:{...row,phase:'PREPARED'}}),{});
  assert.equal(restored[key].phase,'RESTORED_UNCONFIRMED');local[key]=restored[key];
  await assert.rejects(native.prepareExit({id:routeId,host:row.relayIp,port:1080},true,row.password),e=>e.nativeOutcomeUncertain===true);
 }finally{delete globalThis.browser;}
});

test('Issue60: confirmed native credentials survive status renewal; a real new preparation uses fresh entropy and pending work prevents idle stop',async()=>{
 const code=await readFile('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-runtime.js','utf8');
 const {createMullvadRuntime}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#renewal');
 const route={id:'route_stable',host:'10.124.0.7',port:1080,provider:'mullvad'};let now=100000,prepares=0,stops=0;
 const endpoint={route_id:route.id,relay_ip:route.host,relay_port:1080,local_host:'127.0.0.1',local_port:5501};
 const status={installed:true,ready:true,version:'0.3.0',active_exits:[],pending_prepare_routes:[]};
 const runtime=createMullvadRuntime({now:()=>now,getState:async()=>({global:{mullvadNative:{autoStopMinutes:1}},routes:{[route.id]:route},profiles:{}}),
  browserApi:{tabs:{query:async()=>[]}},operations:{getStatus:async()=>structuredClone(status),
   prepareExit:async()=>{prepares++;status.active_exits=[endpoint];return endpoint},stopTunnel:async()=>{stops++;return {ok:true}}}});
 const first=await runtime.resolve(route);assert.equal(prepares,1);
 now+=9000;const renewed=await runtime.resolve(route,{fresh:true});assert.equal(renewed.password,first.password);assert.equal(prepares,1);
 status.active_exits=[];now+=9000;const next=await runtime.resolve(route,{fresh:true});assert.notEqual(next.password,first.password);assert.equal(prepares,2);
 status.pending_prepare_routes=[route.id];now+=120000;assert.equal(await runtime.maybeStopIdle(),false);assert.equal(stops,0);
 const old=runtime.recoveryGeneration(route.id);runtime.clear();
 assert.equal(runtime.acceptObservedPreparation(route,endpoint,first.password,now,old),false);
 const nextGeneration=runtime.recoveryGeneration(route.id);runtime.drop(route.id);
 assert.equal(runtime.acceptObservedPreparation(route,endpoint,first.password,now,nextGeneration),false);
});

test('Issue60: restore apply serializes with native receipt creation and never overwrites its private nonce or credential',async()=>{
 const key='personaMullvadPendingPrepare:restore_race',local={},storage={get:async k=>({[k]:local[k]}),set:async value=>Object.assign(local,value)};
 let finish,entered;const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>finish=resolve);
 const live={schema:2,nonce:'live-nonce',password:'e'.repeat(64),phase:'DISPATCH_POSSIBLE'};
 const writing=withNativeReceiptLock(key,async()=>{entered();await gate;await storage.set({[key]:live});});
 await started;const restoring=restoreNativeReceipt(storage,key,{schema:2,nonce:'archived',phase:'PREPARED'});
 finish();await writing;assert.equal((await restoring).preserved,true);assert.deepEqual(local[key],live);
 delete local[key];assert.equal((await restoreNativeReceipt(storage,key,{schema:2,phase:'PREPARED'})).preserved,false);
 assert.equal(local[key].phase,'RESTORED_UNCONFIRMED');
});

test('Issue60: queued release timeout cannot authorize prepare/release replay or be cleared by healthy status',async()=>{
 const local={},messages=[];let late;
 globalThis.browser={storage:{local:{get:async k=>k===null?{...local}:{[k]:local[k]},set:async v=>Object.assign(local,v),remove:async k=>{delete local[k]}}},runtime:{connectNative(){
  const p={onMessage:signal(),onDisconnect:signal(),disconnect(){},postMessage(m){messages.push(m.command);
   if(m.command==='release_exit')late=()=>p.onMessage.emit({id:m.id,ok:true,released:true});
   if(m.command==='status')queueMicrotask(()=>p.onMessage.emit({id:m.id,ok:true,version:'0.3.0',ready:true,active_exits:[]}));
  }};return p;
 }}};
 const code=(await nativeCode('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js')).replace('{route_id:routeId},6000,async late','{route_id:routeId},20,async late');
 const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#release');
 try{
  await assert.rejects(native.releaseExit('route_delayed'),e=>e.nativeOutcomeUncertain===true);
  assert.equal((await native.getNativeStatus()).active_exits.length,0);
  assert.deepEqual((await native.getNativeStatus()).pending_prepare_routes,['route_delayed']);
  await assert.rejects(native.prepareExit({id:'route_delayed',host:'10.124.0.7',port:1080},true,'a'.repeat(64)));
  await assert.rejects(native.releaseExit('route_delayed'));
  assert.deepEqual(messages.filter(x=>x!=='status'),['release_exit']);
  late();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(local,{});
 }finally{delete globalThis.browser;}
});

test('Issue60: native receipt storage ACK cuts prevent dispatch; malformed positive ACK never clears a possible effect',async()=>{
 const code=await nativeCode('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js');
 for(const cut of ['before-first-write','after-first-write','after-second-write','malformed-ack']){
  const local={};let writes=0,dispatched=0;
  globalThis.browser={storage:{local:{get:async k=>k===null?{...local}:{[k]:local[k]},remove:async k=>{delete local[k]},set:async value=>{
   writes++;if(cut==='before-first-write'&&writes===1)throw Error('storage unavailable');Object.assign(local,value);
   if((cut==='after-first-write'&&writes===1)||(cut==='after-second-write'&&writes===2))throw Error('write ACK lost');
  }}},runtime:{connectNative(){const p={onMessage:signal(),onDisconnect:signal(),disconnect(){},postMessage(m){dispatched++;
   queueMicrotask(()=>p.onMessage.emit({...m,ok:true,local_host:'127.0.0.1',local_port:5501}));
  }};return p;}}};
  try{
   const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#cut-'+cut);
   await assert.rejects(native.prepareExit({id:'route_storage',host:'10.124.0.7',port:1080},true,'a'.repeat(64)),e=>e.nativeOutcomeUncertain===true);
   assert.equal(dispatched,cut==='malformed-ack'?1:0);
   if(['after-second-write','malformed-ack'].includes(cut)){
    assert.equal(local['personaMullvadPendingPrepare:route_storage'].phase,'DISPATCH_POSSIBLE');
    await assert.rejects(native.prepareExit({id:'route_storage',host:'10.124.0.7',port:1080},true,'b'.repeat(64)));
    assert.equal(dispatched,cut==='malformed-ack'?1:0);
   }
  }finally{delete globalThis.browser;}
 }
});

test('Issue60: present corrupt or foreign receipts never become absence or grant no-dispatch replay',async()=>{
 const route={id:'route_corrupt',host:'10.124.0.7',port:1080},key='personaMullvadPendingPrepare:'+route.id;
 const prepared={schema:2,phase:'PREPARED',nonce:crypto.randomUUID(),routeId:route.id,relayIp:route.host,relayPort:1080,password:'a'.repeat(64),createdAtMs:Date.now()};
 const code=await nativeCode('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js');let index=0;
 for(const bad of [null,false,0,{},[],{...prepared,schema:3},{...prepared,routeId:'foreign_route'},
  {...prepared,nonce:'------------------------------------'},{...prepared,operation:'RELEASE'},{...prepared,effectBoundary:'DISPATCH_POSSIBLE'}]){
  const local={[key]:bad};let commands=0;
  globalThis.browser={storage:{local:{get:async k=>k===null?{...local}:{[k]:local[k]},set:async v=>Object.assign(local,v),remove:async k=>{delete local[k]}}},runtime:{connectNative(){commands++;throw Error('unexpected command')}}};
  try{
   const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#corrupt-'+index++);
   await assert.rejects(native.prepareExit(route,true,'b'.repeat(64)),e=>e.nativeOutcomeUncertain===true);
   await assert.rejects(native.releaseExit(route.id),e=>e.nativeOutcomeUncertain===true);
   assert.equal(commands,0);assert.deepEqual(local[key],bad);
  }finally{delete globalThis.browser;}
 }
});
