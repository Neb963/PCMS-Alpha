import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildI00} from '../scripts/build-i00.mjs';

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
