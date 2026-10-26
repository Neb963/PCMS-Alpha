// D regression uses the same offline external model as installed J04 B.
// Preview results here are an explicit source-based test seam; B still uses
// the real rendered iframe oracle. No live provider, Git, route or host effect.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fakeDatabase} from './fake-idb.mjs';
import {settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';

test('F2 actual catalog domain workers complete the shared J04 pipeline without starving a source', {timeout:20000}, async()=>{
 const root=new URL('../src/runtime/',import.meta.url);
 const fixture=await readFile(new URL('../scripts/fixtures/j04-pipeline.mjs',import.meta.url),'utf8');
 const model=await readFile(new URL('../scripts/fixtures/j03-git-model.mjs',import.meta.url),'utf8');
 // Load production modules in the ordinary Node environment (no browser
 // singleton registration); only the fixture's explicit API is substituted.
 for(const [,path] of fixture.matchAll(/module\('([^']+)'\)/g))await import(new URL(path,root));
 const db=fakeDatabase(),saved={},listeners=[],alarms=new Map(),host={};
 const storage={get:async keys=>{
  if(typeof keys==='string')return {[keys]:structuredClone(saved[keys])};
  if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,structuredClone(saved[k])]));
  return structuredClone(saved);
 },set:async values=>{for(const [key,value] of Object.entries(values))saved[key]=structuredClone(value);}};
 const api={storage:{local:storage},runtime:{id:'fixture',
  getURL:p=>p.startsWith('pcms/')?new URL(p.slice(5),root).href:'moz-extension://fixture/'+p,
  onStartup:{addListener(){}},onInstalled:{addListener(){}}},
  tabs:{query:async()=>[]},
  alarms:{get:async name=>alarms.get(name),
   create:async(name,options)=>{alarms.set(name,{name,...options});},
   onAlarm:{addListener:fn=>listeners.push(fn)}}};
 const idb={open:()=>{const request={result:db};setImmediate(()=>request.onsuccess?.());return request;}};
 const preview=async(_slug,name,html)=>({ok:true,source:'INDEPENDENT_BROWSER_ASSERTION',name,
  result:html.includes('perchance-error-indicator')?'FAIL':'PASS',observedAt:Date.now(),
  reason:'EXPLICIT_D_OFFLINE_PREVIEW_SEAM'});
 const install=Function('browser','window','indexedDB','j04ActualPreview',
  model.replace('export async function','async function')+'\n'+
  fixture.replace('export async function','async function')+'\nreturn installDevelopmentPipelineFixture;'
 )(api,host,idb,preview);
 assert.equal((await install()).ok,true);
 let state;
 for(let turn=0;turn<160;turn++){
  await settlePcmsWork({timeoutMs:2000});
  state=await host.__j04flow.inspect();
  if(state.writebacks.filter(row=>row.state==='CONFIRMED').length===4)break;
  for(const listener of listeners)listener({name:'pcms-s05-ready-progress'});
  await new Promise(resolve=>setImmediate(resolve));
 }
 await settlePcmsWork({timeoutMs:2000});state=await host.__j04flow.inspect();
 const compact={ready:state.ready.map(r=>({slug:r.slug,active:!!r.active,desired:!!r.desired,hold:r.hold})),
  stages:state.stages.map(r=>({slug:r.slug,state:r.state})),
  jobs:state.jobs.map(r=>({slug:r.slug,state:r.state,native:r.native?.state})),
  writebacks:state.writebacks.map(r=>({slug:r.slug,state:r.state})),
  events:state.events.slice(-10).map(e=>({name:e.name,code:e.result?.code,step:e.result?.step}))};
 assert.equal(state.writebacks.filter(row=>row.state==='CONFIRMED').length,4,JSON.stringify(compact));
 assert.ok(state.provider.assertions.some(row=>row.result==='FAIL'));
 assert.ok(state.provider.assertions.some(row=>row.result==='PASS'));
 assert.equal(state.provider.effects.filter(row=>row.kind==='STAGE').length,4);
 assert.equal(state.provider.effects.filter(row=>row.kind==='PUBLISH').length,0);
 assert.equal(state.provider.effects.some(row=>row.slug==='j04-flow-held'),false);
 assert.equal(state.git.effects.length,4);
 assert.equal(state.git.effects.some(row=>row.force),false);
});
