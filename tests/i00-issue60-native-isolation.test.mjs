import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildI00} from '../scripts/build-i00.mjs';
import {collectPortableLocal,preparePortableLocalRestore} from '../src/runtime/portable-local.mjs';

const signal=()=>{const listeners=new Set();return {addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:x=>{for(const f of [...listeners])f(x)}}};
test('Issue60: native status observes independently of a pending forwarder command',async()=>{
 const {stage}=await buildI00({packageArchive:false,buildDirectory:'/tmp/pcms-issue60-native-d'});
 const ports=[],local={};let release,entered;
 const started=new Promise(resolve=>entered=resolve);
 globalThis.browser={storage:{local:{get:async key=>key===null?{...local}:{[key]:local[key]},set:async data=>Object.assign(local,data),remove:async key=>{delete local[key]}}},runtime:{connectNative(host){assert.equal(host,'com.persona.mullvad_router');
  const p={onMessage:signal(),onDisconnect:signal(),disconnect(){},postMessage(m){
   if(m.command==='prepare_exit'){release=()=>p.onMessage.emit({...m,ok:true,local_host:'127.0.0.1',local_port:5501});entered();}
   else if(m.command==='status'){
    const reply=()=>p.onMessage.emit({id:m.id,ok:true,version:'0.3.0',interface_up:true,base_proxy_reachable:false,ready:false});
    if(ports[0]===p&&release){const prior=release;release=()=>{prior();reply()}}else queueMicrotask(reply);
   }
  }};ports.push(p);return p;}}};
 const code=await readFile(stage+'/lib/mullvad-native.js','utf8');
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
    const value={...m,ok:true,local_host:'127.0.0.1',local_port:5501};
    if(immediate)queueMicrotask(()=>p.onMessage.emit(value));else reply=()=>p.onMessage.emit(value);
   }else if(m.command==='status')queueMicrotask(()=>p.onMessage.emit({id:m.id,ok:true,version:'0.3.0',ready:true}));
  }};ports.push(p);return p;
 }}};
 const original=await readFile('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js','utf8');
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
 const code=await readFile('/tmp/pcms-issue60-native-d/xpi-root/lib/mullvad-native.js','utf8');
 const native=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')+'#retired');
 try{
  await assert.rejects(native.nativeRequest('ping',{},1000));
  const current=native.nativeRequest('ping',{},1000);
  ports[0].onDisconnect.emit();
  ports[1].onMessage.emit({id:ports[1].last.id,ok:true,version:'0.3.0'});
  assert.equal((await current).version,'0.3.0');
 }finally{delete globalThis.browser;}
});
