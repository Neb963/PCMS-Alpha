import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createOperatorRecordBoundary} from '../src/runtime/operator-record-boundary.mjs';
import {createOperatorRecords} from '../src/ui/operator-records.mjs';
import {settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)}};
function fixture(){
 const data={},db=Object.assign(fakeDatabase(),{close(){}}),storage={get:async k=>({[k]:data[k]}),set:async v=>Object.assign(data,structuredClone(v)),remove:async k=>delete data[k]};
 const api={storage:{local:storage},runtime:{id:'pcms-test',getURL:path=>'moz-extension://pcms-test/'+path}};
 return {data,db,storage,api,sender:{id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')},boundary:createOperatorRecordBoundary(api,{open:async()=>db})};
}
test('canonical operator observations commit and CAS preserves concurrent input; restore hold denies a fresh write',async()=>{
 const f=fixture(),store=createOperatorRecords({open:async()=>f.db,storage:f.storage,admitted:true}),key='ui:operator-checklist:accepted-v1';
 const one=await store.put(key,{notes:'first'},{expectedRevision:0});assert.equal(one.row.revision,1);
 const stale=await store.put(key,{notes:'stale overwrite'},{expectedRevision:0});assert.equal(stale.code,'STALE_REVISION');
 assert.equal(f.db.read('meta',key).record.notes,'first');assert.equal((await store.get(key)).record.notes,'first');
 f.data.pcmsRestoreInProgress={active:true,status:'PREPARING'};
 await assert.rejects(()=>store.put(key,{notes:'held'}),/OPERATOR_RECORD_RESTORE_HOLD/);
 assert.equal(f.db.read('meta',key).revision,1);
});
test('preparation drains an already admitted canonical report AND its delayed local mirror before taking a copy',async()=>{
 const f=fixture(),entered=deferred(),release=deferred();
 f.storage.set=async value=>{entered.resolve();await release.promise;Object.assign(f.data,structuredClone(value))};
 const run={runId:'s08_1122334455667788',status:'HELD'};
 const write=f.boundary.handle({key:'ui:diagnostic-report:'+run.runId,record:{schema:1,run},expectedRevision:0,mirror:'RUN'},f.sender);
 await entered.promise;
 assert.equal(f.db.read('meta','ui:diagnostic-report:'+run.runId).record.run.status,'HELD');
 assert.equal(f.data.pcmsS08DiagnosticRun,undefined);
 f.data.pcmsRestoreInProgress={active:true,status:'PREPARING'};
 let drained=false;const drain=settlePcmsWork().then(()=>{drained=true});await new Promise(r=>setImmediate(r));assert.equal(drained,false);
 const denied=await f.boundary.handle({key:'ui:operator-checklist:accepted-v1',record:{notes:'late'},expectedRevision:0},f.sender);
 assert.equal(denied.code,'RESTORE_HOLD');assert.equal(f.db.read('meta','ui:operator-checklist:accepted-v1'),undefined);
 release.resolve();assert.equal((await write).ok,true);await drain;
 assert.equal(f.data.pcmsS08DiagnosticRun.runId,run.runId);assert.equal(drained,true);
});
test('untrusted sender and arbitrary local mirrors cannot write operator records',async()=>{
 const f=fixture(),message={key:'ui:diagnostic-report:configuration',record:{configuration:{}},expectedRevision:0,mirror:'CONFIG'};
 assert.equal((await f.boundary.handle(message,{id:'other',url:'https://example.test'})).code,'UNTRUSTED_SENDER');
 await assert.rejects(()=>f.boundary.handle({...message,mirror:'GRANT'},f.sender),/OPERATOR_RECORD_MIRROR_INVALID/);
 assert.deepEqual(f.db.keys('meta'),[]);assert.deepEqual(f.data,{});
});
