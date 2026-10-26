import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationWorkspace} from '../src/ui/faithful/presentation-workspace.mjs';
import {createPresentationBoundary} from '../src/runtime/presentation-boundary.mjs';
import {PRESENTATION_KEY,SELECTION_KEY,normalizePresentation,normalizeSelection,createPresentationPreferences} from '../src/runtime/presentation-preferences.mjs';
const reordered=value=>Array.isArray(value)?value.map(reordered):value&&typeof value==='object'?
 Object.fromEntries(Object.keys(value).sort().map(k=>[k,reordered(value[k])])):value;
test('queued filter persistence records the selected snapshot, not later mutable UI state',async()=>{
 const data={},api={runtime:{id:'presentation-f0',getURL:p=>'moz-extension://presentation-f0/'+p},
  storage:{local:{get:async k=>({[k]:structuredClone(data[k])}),set:async v=>Object.assign(data,structuredClone(v))}}};
 const boundary=createPresentationBoundary(api),sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
 const priorBrowser=globalThis.browser,priorMedia=globalThis.matchMedia;
 api.runtime.connect=()=>{const listeners=new Set();return {onMessage:{addListener:f=>listeners.add(f)},
  onDisconnect:{addListener(){}},disconnect(){},postMessage:m=>void boundary.handle(m,sender).then(out=>{for(const f of listeners)f(out)})}};
 globalThis.browser=api;globalThis.matchMedia=()=>({matches:false,addEventListener(){}});
 try{
  const generator={source:'GIT'},root={host:{dataset:{}},querySelector:()=>null};
  const workspace=createPresentationWorkspace({root,generator,notify:()=>{},reload:async()=>{}});
  await workspace.ready;
  generator.source='GIT';workspace.rememberFilters();
  // A second filter choice can happen before the queued storage turn runs.
  // This call must still persist the first selected view's exact snapshot.
  generator.source='PROTECTED';
  await new Promise(r=>setImmediate(r));await workspace.preferences.update(v=>v);
  assert.equal(data[PRESENTATION_KEY].generator.filters.source,'GIT');
 }finally{globalThis.browser=priorBrowser;globalThis.matchMedia=priorMedia;}
});
test('presentation readback compares normalized display values across storage key order, while changed values still fail',async()=>{
 const data={};let corrupt=false;
 const storage={get:async k=>({[k]:reordered(structuredClone(data[k]))}),
  set:async value=>{Object.assign(data,structuredClone(value));if(corrupt)data[PRESENTATION_KEY].density='compact'}};
 const prefs=createPresentationPreferences(storage);await prefs.load();
 await prefs.update(v=>({...v,theme:'dark'}));assert.equal(prefs.get().theme,'dark');
 corrupt=true;await assert.rejects(prefs.update(v=>({...v,density:'comfortable'})),/PRESENTATION_SAVE_UNCONFIRMED/);
 assert.equal(prefs.get().density,'compact');
});
test('trusted presentation and selection boundary observes values across reordered browser storage',async()=>{
 const data={},api={runtime:{id:'display-order',getURL:p=>'moz-extension://display-order/'+p},
  storage:{local:{get:async k=>({[k]:reordered(structuredClone(data[k]))}),set:async value=>Object.assign(data,structuredClone(value))}}};
 const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')},boundary=createPresentationBoundary(api);
 const initial=normalizePresentation(),next=normalizePresentation({theme:'dark'});
 assert.equal((await boundary.handle({kind:'WORKSPACE',expected:initial,value:next},sender)).ok,true);
 const selected=normalizeSelection({items:[{slug:'display-order',accountId:'account_display_order',revision:1}]});
 assert.equal((await boundary.handle({kind:'SELECTION',expected:normalizeSelection(),value:selected},sender)).ok,true);
 assert.deepEqual(normalizeSelection(data[SELECTION_KEY]),selected);
 const stale=await boundary.handle({kind:'WORKSPACE',expected:initial,value:normalizePresentation({theme:'light'})},sender);
 assert.equal(stale.code,'PRESENTATION_STALE');
});
test('missing display records cannot certify a lost save of default values',async()=>{
 const initial=normalizePresentation({theme:'dark'}),data={[PRESENTATION_KEY]:initial};
 const storage={get:async k=>({[k]:data[k]}),set:async()=>{delete data[PRESENTATION_KEY]}};
 const prefs=createPresentationPreferences(storage);await prefs.load();
 await assert.rejects(prefs.update(()=>normalizePresentation()),/PRESENTATION_SAVE_UNCONFIRMED/);
 assert.equal(prefs.get().theme,'dark');
});
