import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {buildI00} from '../scripts/build-i00.mjs';

const temp=await mkdtemp(path.join(tmpdir(),'pcms-f5-bridge-'));
after(()=>rm(temp,{recursive:true,force:true}));
const {stage}=await buildI00({packageArchive:false,buildDirectory:temp});
const bg=await readFile(path.join(stage,'background.js'),'utf8');
const boundary=await readFile(path.join(stage,'pcms/account-boundary.mjs'),'utf8');
const start=bg.indexOf('async restartBridge(){');
const end=bg.indexOf('async boundPersona({bindingId})',start);
assert.ok(start>=0&&end>start,'packaged donor internal lifecycle adapter missing');
const code=bg.slice(start,end);
const make=vm.runInNewContext(`(env)=>{
 const {initialize,localMutationFence,allPersonaUids,mullvadRuntime,restartTunnel,pcmsConnectionCode}=env;
 return ({${code}}).restartBridge;
}`);
const status=()=>({installed:true,compatible:true,ready:false,interface_up:false,
 base_proxy_reachable:false,base_route_bound:false,pending_prepare_routes:[]});
function fixture(current=status()){
 let restarts=0,fences=0,initializations=0;
 const runtime={refreshStatus:async()=>structuredClone(current),
  clear(){},setStatus(value){current={...current,...value};return current}};
 const env={allPersonaUids:['persona_fixture'],mullvadRuntime:runtime,
  initialize:async()=>{initializations++;},
  pcmsConnectionCode:s=>s.ready?null:'MULLVAD_TUNNEL_UNAVAILABLE',
  localMutationFence:async(personas,task)=>{assert.equal(personas.length,1);fences++;return task();},
  restartTunnel:async()=>{restarts++;return {ok:true,version:'0.3.0',ready:true,interface_up:true,
   base_proxy_reachable:true,base_route_bound:true,pending_prepare_routes:[]}}};
 const restart=make(env);
 return {call:()=>restart(),counts:()=>({restarts,fences,initializations}),set:next=>Object.assign(current,next)};
}
test('F5 packaged donor background invokes native restart under shared Persona mutation fence, then verifies recovery',async()=>{
 const f=fixture(),out=await f.call();
 assert.equal(out.restarted,true);assert.equal(out.ok,true);
 assert.deepEqual(f.counts(),{restarts:1,fences:1,initializations:1});
 const repeat=await f.call();assert.equal(repeat.noDispatch,true);
 assert.equal(f.counts().restarts,1,'healthy bridge must not be restarted');
});
test('F5 donor refuses automatic bridge restart with unresolved native operations, invalid or healthy status',async()=>{
 for(const change of [{pending_prepare_routes:['route_pending']},
  {pending_prepare_routes:undefined},{installed:false},{compatible:false},
  {ready:true,interface_up:true,base_proxy_reachable:true,base_route_bound:true}]){
  const f=fixture({...status(),...change}),out=await f.call();
  assert.equal(out.noDispatch,true,JSON.stringify(change));
  assert.equal(f.counts().restarts,0);
 }
});
test('F5 same-frame PCMS invokes internal donor adapter; historical manual restart listener remains unchanged',()=>{
 assert.doesNotMatch(boundary,/runtime\.sendMessage\(\{type:'MULLVAD_(STATUS|RESTART)'/);
 assert.match(boundary,/enrollmentDonor\?\.restartBridge\?\.\(\)/);
 assert.match(bg,/case "MULLVAD_RESTART": return localMutationFence\(allPersonaUids, async \(\) => \{/);
 assert.doesNotMatch(bg,/message\.pcmsAutomatic/);
});
