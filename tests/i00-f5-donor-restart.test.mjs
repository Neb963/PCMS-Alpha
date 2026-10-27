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
const start=bg.indexOf('case "MULLVAD_RESTART"');
const end=bg.indexOf('case "MULLVAD_LIST_ENTRIES"',start);
assert.ok(start>=0&&end>start,'packaged donor restart case missing');
const invoke=vm.runInNewContext(`(async(message,env)=>{
 const {localMutationFence,allPersonaUids,mullvadRuntime,restartTunnel}=env;
 switch(message.type){${bg.slice(start,end)}default: throw Error('NOT_HANDLED')}
})`,{});

const status=()=>({installed:true,compatible:true,ready:false,interface_up:false,
 base_proxy_reachable:false,base_route_bound:false,pending_prepare_routes:[]});
function fixture(current=status()){
 let restarts=0,fences=0;
 const runtime={refreshStatus:async()=>structuredClone(current),
  clear(){},setStatus(value){current={...current,...value};return current}};
 const env={allPersonaUids:['persona_fixture'],mullvadRuntime:runtime,
  localMutationFence:async(personas,task)=>{assert.equal(personas.length,1);fences++;return task();},
  restartTunnel:async()=>{restarts++;return {ok:true,version:'0.3.0',ready:true,interface_up:true,
   base_proxy_reachable:true,base_route_bound:true,pending_prepare_routes:[]}}};
 return {call:async automatic=>invoke({type:'MULLVAD_RESTART',pcmsAutomatic:automatic},env),
  counts:()=>({restarts,fences}),set:next=>Object.assign(current,next)};
}
test('F5 packaged donor auto restart only after unhealthy observed bridge and native fence',async()=>{
 const f=fixture(),out=await f.call(true);
 assert.equal(out.restarted,true);assert.equal(out.status.ready,true);
 assert.deepEqual(f.counts(),{restarts:1,fences:1});
 const repeated=await f.call(true);assert.equal(repeated.restarted,false);
 assert.equal(f.counts().restarts,1,'healthy bridge must not be restarted');
});
test('F5 packaged donor refuses automatic restart with any unresolved native effect or missing status',async()=>{
 for(const change of [{pending_prepare_routes:['route_pending']},
  {pending_prepare_routes:undefined},{installed:false},{compatible:false},
  {ready:true,interface_up:true,base_proxy_reachable:true,base_route_bound:true}]){
  const f=fixture({...status(),...change}),out=await f.call(true);
  assert.equal(out.restarted,false,JSON.stringify(change));
  assert.equal(f.counts().restarts,0);
 }
});
test('F5 existing manual PersonaMonkey restart still follows donor lifecycle unchanged',async()=>{
 const f=fixture({...status(),ready:true,interface_up:true,
  base_proxy_reachable:true,base_route_bound:true});
 const out=await f.call(false);
 assert.equal(out.restarted,false,'manual result has no PCMS automatic receipt');
 assert.equal(f.counts().restarts,1,'manual operation preserved under donor fence');
});
