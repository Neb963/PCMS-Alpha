import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationBoundary} from '../src/runtime/presentation-boundary.mjs';
import {normalizePresentation,PRESENTATION_KEY,SELECTION_KEY,normalizeSelection,createPresentationPreferences} from '../src/runtime/presentation-preferences.mjs';
import {settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
function fixture(){
 const data={},storage={get:async key=>({[key]:structuredClone(data[key])}),set:async patch=>Object.assign(data,structuredClone(patch))};
 const api={storage:{local:storage},runtime:{id:'pcms-test',getURL:path=>'moz-extension://pcms-test/'+path}};
 return {data,storage,api,sender:{id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')},boundary:createPresentationBoundary(api)};
}
test('J07 delayed display write/readback drains before restore safety copy; fresh and queued saves cannot overwrite restored state',async()=>{
 const f=fixture(),entered=deferred(),release=deferred(),original=normalizePresentation(),dark=normalizePresentation({theme:'dark'});
 f.storage.set=async value=>{entered.resolve();await release.promise;Object.assign(f.data,structuredClone(value))};
 const first=f.boundary.handle({expected:original,value:dark},f.sender);await entered.promise;
 const queued=f.boundary.handle({expected:dark,value:normalizePresentation({theme:'light'})},f.sender);
 f.data.pcmsRestoreInProgress={active:true,status:'PREPARING'};
 let drained=false;const drain=settlePcmsWork().then(()=>{drained=true});await new Promise(r=>setImmediate(r));assert.equal(drained,false);
 release.resolve();assert.equal((await first).ok,true);assert.equal((await queued).code,'RESTORE_HOLD');await drain;
 assert.deepEqual(f.data[PRESENTATION_KEY],dark,'safety copy observes the admitted save');
 f.data[PRESENTATION_KEY]=normalizePresentation({theme:'light',density:'comfortable'});
 assert.equal((await f.boundary.handle({expected:dark,value:original},f.sender)).code,'RESTORE_HOLD');
 assert.equal(f.data[PRESENTATION_KEY].density,'comfortable','restored data cannot be overwritten by a held UI');
 delete f.data.pcmsRestoreInProgress;
 assert.equal((await f.boundary.handle({expected:dark,value:original},f.sender)).code,'PRESENTATION_STALE');
});
test('J07 presentation boundary authenticates sender, narrows the key, CAS serializes dashboards and readback recovers lost ACK',async()=>{
 const f=fixture(),original=normalizePresentation(),dark=normalizePresentation({theme:'dark'}),message={expected:original,value:{...dark,credential:'never',grants:{publication:true}}};
 assert.equal((await f.boundary.handle(message,{id:'foreign',url:'https://example.test'})).code,'UNTRUSTED_SENDER');
 assert.equal((await f.boundary.handle({...message,key:'pcmsGrant'},f.sender)).code,'PRESENTATION_INVALID');
 f.storage.set=async value=>{Object.assign(f.data,structuredClone(value));throw Error('ACK_LOST')};
 assert.equal((await f.boundary.handle(message,f.sender)).ok,true);assert.deepEqual(Object.keys(f.data),[PRESENTATION_KEY]);assert.deepEqual(f.data[PRESENTATION_KEY],dark);
 const results=await Promise.all([f.boundary.handle({expected:dark,value:normalizePresentation({theme:'light'})},f.sender),f.boundary.handle({expected:dark,value:original},f.sender)]);
 assert.equal(results[0].ok,true);assert.equal(results[1].code,'PRESENTATION_STALE');
 const prefs=createPresentationPreferences(f.storage,{write:(value,expected)=>f.boundary.handle({value,expected},f.sender)});await prefs.load();
 f.data.pcmsRestoreInProgress={active:true,status:'PREPARING'};
 await assert.rejects(prefs.update(value=>({...value,density:'comfortable'})),/RESTORE_HOLD/);
 assert.equal(f.data[PRESENTATION_KEY].density,'compact');
});
test('J07 portable bulk selection uses the same tracked drain and cannot overwrite a restored selection or write arbitrary fields',async()=>{
 const f=fixture(),entered=deferred(),release=deferred(),empty=normalizeSelection(),selected=normalizeSelection({items:[{slug:'j07-selected',accountId:'account_j07_select',revision:3}]});
 f.storage.set=async value=>{entered.resolve();await release.promise;Object.assign(f.data,structuredClone(value))};
 const save=f.boundary.handle({kind:'SELECTION',expected:empty,value:{...selected,publicationApproval:true,items:[...selected.items,{slug:'../invalid',accountId:'wrong',revision:0}]}},f.sender);await entered.promise;
 f.data.pcmsRestoreInProgress={active:true,status:'PREPARING'};
 let drained=false;const drain=settlePcmsWork().then(()=>{drained=true});await new Promise(r=>setImmediate(r));assert.equal(drained,false);
 const queued=f.boundary.handle({kind:'SELECTION',expected:empty,value:empty},f.sender);
 release.resolve();assert.equal((await save).ok,true);assert.equal((await queued).code,'RESTORE_HOLD');await drain;
 assert.deepEqual(f.data[SELECTION_KEY],selected);assert.equal(f.data[PRESENTATION_KEY],undefined);
 f.data[SELECTION_KEY]=empty;delete f.data.pcmsRestoreInProgress;
 assert.equal((await f.boundary.handle({kind:'SELECTION',expected:selected,value:empty},f.sender)).code,'PRESENTATION_STALE');
 assert.deepEqual(f.data[SELECTION_KEY],empty);
});
