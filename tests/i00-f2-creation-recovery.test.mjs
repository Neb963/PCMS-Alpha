import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCreationItem} from '../src/ui/faithful/generator-batches.mjs';
const shown={intentId:'intent_recovery_01',slug:'recovered-source',expectedRevision:2};
test('F2 recovered batch check reads the current intent instead of a stale rendered revision',async()=>{
 let revision=3;const requests=[],effects=[];
 const call=async(type,p)=>{
  requests.push({type,...p});
  if(type==='GET_CREATE_INTENT')return {ok:true,record:{...shown,revision,state:'OWNER_READBACK_PENDING'}};
  if(p.expectedRevision!==revision)return {ok:false,code:'STALE_REVISION'};
  effects.push('INDEPENDENT_OWNER_READBACK');revision++;
  return {ok:true,record:{revision,state:'OWNER_MISSING_VERIFIED'}};
 };
 const out=await checkCreationItem(shown,call);
 assert.equal(out.ok,true);assert.equal(out.record.revision,4);
 assert.deepEqual(requests,[{type:'GET_CREATE_INTENT',intentId:shown.intentId},
  {type:'RUN_CREATE_STEP',intentId:shown.intentId,expectedRevision:3}]);
 assert.deepEqual(effects,['INDEPENDENT_OWNER_READBACK']);
});
test('F2 a race after fresh batch read preserves backend CAS and does not retry',async()=>{
 const effects=[];let calls=0;
 const out=await checkCreationItem(shown,async(type,p)=>{
  calls++;if(type==='GET_CREATE_INTENT')return {ok:true,record:{...shown,revision:3}};
  // Canonical work advanced to 4 after the read; only revision 4 could act.
  if(p.expectedRevision!==4)return {ok:false,code:'STALE_REVISION'};
  effects.push('UNEXPECTED_TRANSITION');return {ok:true};
 });
 assert.equal(out.code,'STALE_REVISION');assert.equal(calls,2);assert.deepEqual(effects,[]);
});
test('F2 a lost creation check reply is never automatically repeated',async()=>{
 let checks=0;
 await assert.rejects(checkCreationItem(shown,async type=>{
  if(type==='GET_CREATE_INTENT')return {ok:true,record:{...shown,revision:3,state:'CREATE_UNCERTAIN'}};
  checks++;throw Error('LOST_RESPONSE');
 }),/LOST_RESPONSE/);
 assert.equal(checks,1);
});
for(const record of [{slug:'another-source',revision:3},{slug:shown.slug,revision:0},null])
 test('F2 mismatched creation readback cannot invoke the selected intent '+JSON.stringify(record),async()=>{
  let calls=0;const out=await checkCreationItem(shown,async type=>{calls++;assert.equal(type,'GET_CREATE_INTENT');return {ok:true,record};});
  assert.equal(out.ok,false);assert.equal(calls,1);
 });
test('F2 a failed creation read and an already associated intent invoke no transition',async()=>{
 for(const response of [{ok:false,code:'CANONICAL_HOLD'},{ok:true,record:{...shown,revision:4,state:'ASSOCIATED_NOT_READY'}}]){
  let calls=0;const out=await checkCreationItem(shown,async type=>{calls++;assert.equal(type,'GET_CREATE_INTENT');return response;});
  assert.equal(calls,1);assert.equal(out.ok,response.ok);
 }
});

test('F2 actual J02 coordinator/runner resumes the recovered pinned account from a stale batch row',{timeout:20000},async()=>{
 const {readFile}=await import('node:fs/promises');
 const {fakeDatabase}=await import('./fake-idb.mjs');
 const {createCoordinatorStore}=await import('../src/runtime/coordinator-store.mjs');
 const {settlePcmsWork}=await import('../src/runtime/work-checkpoint.mjs');
 const runtimeRoot=new URL('../src/runtime/',import.meta.url),db=fakeDatabase(),saved={},host={};
 let source=await readFile(new URL('../scripts/fixtures/j02-ui.mjs',import.meta.url),'utf8');
 for(const [,name] of source.matchAll(/import\('\.\/([^']+)'\)/g))await import(new URL(name,runtimeRoot));
 source=source.replace(/import\('\.\/([^']+)'\)/g,(_,name)=>'import('+JSON.stringify(new URL(name,runtimeRoot).href)+')');
 const event={addListener(){}},api={
  runtime:{id:'fixture',getURL:p=>p.startsWith('pcms/')?new URL(p.slice(5),runtimeRoot).href:'moz-extension://fixture/'+p,
   connect(){throw Error('UNEXPECTED_REAL_PORT')},onConnect:event,onStartup:event,onInstalled:event},
  storage:{local:{get:async keys=>typeof keys==='string'?{[keys]:structuredClone(saved[keys])}:
   Object.fromEntries((Array.isArray(keys)?keys:Object.keys(saved)).map(k=>[k,structuredClone(saved[k])])),
   set:async values=>{for(const [k,v] of Object.entries(values))saved[k]=structuredClone(v);}},onChanged:event},
  alarms:{create:async()=>{},get:async()=>null,onAlarm:event},tabs:{query:async()=>[]}};
 const idb={open:()=>{const request={result:db};setImmediate(()=>request.onsuccess?.());return request;}};
 const install=Function('browser','window','indexedDB',
  source.replace('export async function','async function')+'\nreturn installGeneratorFixture;')(api,host,idb);
 await install();await host.__j02.tick(2);
 const store=createCoordinatorStore(db),before=await store.getCreate('intent_j02_waiting');
 assert.equal(before.ok,true);assert.equal(before.record.state,'OWNER_READBACK_PENDING');
 const displayed={intentId:before.record.intentId,slug:before.record.slug,expectedRevision:before.record.revision};
 const coalesced=await store.acceptCreate({intentId:'intent_ui_coalesced_01',slug:displayed.slug,origin:'OPERATOR'});
 assert.equal(coalesced.ok,true);
 const fresh=await store.getCreate(displayed.intentId);
 assert.ok(fresh.record.revision>displayed.expectedRevision);
 await host.__j02.recover();
 const requests=[],call=(type,params)=>new Promise((resolve,reject)=>{
  const port=api.runtime.connect({name:'pcms-s00-coordinator'});requests.push({type,...params});
  port.onMessage.addListener(out=>{port.disconnect();resolve(out)});
  port.onDisconnect.addListener(()=>reject(Error('DISCONNECTED')));port.postMessage({type,params});
 });
 // Reproduce the old rendered-row request at the same real boundary.
 const old=await call('RUN_CREATE_STEP',{intentId:displayed.intentId,expectedRevision:displayed.expectedRevision});
 assert.equal(old.code,'STALE_REVISION');
 assert.equal((await store.getCreate(displayed.intentId)).record.revision,fresh.record.revision);
 const checked=await checkCreationItem(displayed,call);await settlePcmsWork({timeoutMs:2000});
 assert.equal(checked.ok,true,JSON.stringify(checked));
 assert.equal(checked.record.state,'OWNER_MISSING_VERIFIED');
 assert.equal(checked.record.accountId,'account_j02_049');
 assert.equal(requests.filter(r=>r.type==='RUN_CREATE_STEP'&&r.expectedRevision===fresh.record.revision).length,1);
 assert.equal(requests.at(-1).expectedRevision,fresh.record.revision);
 assert.deepEqual((await host.__j02.inspect()).ledger.effects,[],'owner readback cannot CREATE or RENAME');
});
