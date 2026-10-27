import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {incidentDestination} from '../src/ui/faithful/attention.mjs';
import {groupNotices} from '../src/ui/attention-model.mjs';
import {createCatalogWatcher} from '../src/runtime/catalog-watch.mjs';
globalThis.crypto??=webcrypto;
test('F3 opaque scopes never become guessed account or operation identities',()=>{
 for(const code of ['ROUTE_UNAVAILABLE','ACCOUNT_UNVERIFIED','SOURCE_HELD','OPERATION_UNCERTAIN','GIT_FOLDER_MISSING','GIT_FOLDER_RENAME_REVIEW']){
  const n={code,scopeId:'opaque_scope_hash_001'};
  assert.deepEqual(incidentDestination(n),{kind:'CONTEXT',id:code});
 }
 assert.deepEqual(incidentDestination({code:'CANONICAL_UNAVAILABLE',scopeId:'opaque_scope_hash_001'}),{kind:'SETTINGS',id:'diagnostics'});
 const target={kind:'ACCOUNT',id:'original_account_01'};
 assert.deepEqual(incidentDestination({code:'ROUTE_UNAVAILABLE',target}),target);
});
test('F3 independent account failures stay separate; an explicit shared cause groups all members',()=>{
 const rows=Array.from({length:50},(_,i)=>({scopeId:'account_'+String(i).padStart(4,'0'),code:'ROUTE_UNAVAILABLE',cause:'ACCOUNT_ROUTE_UNAVAILABLE',severity:'ACTION_REQUIRED',revision:1,count:2,reviewed:i!==0}));
 assert.equal(groupNotices(rows).length,50);
 const shared=groupNotices(rows.map(n=>({...n,cause:'PERSONAMONKEY_HELPER_OUTAGE'})));
 assert.equal(shared.length,1);assert.equal(shared[0].scopes.length,50);assert.equal(shared[0].count,100);assert.equal(shared[0].reviewed,false);
});
const TOKEN='synthetic_browser_token_not_real';
function setup(kind){
 const values={pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'42'}},events=[];
 if(kind==='UNCONFIGURED')delete values.pcmsS03Git;
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async keys=>{if(kind==='READ_STORAGE'&&keys==='pcmsS03Git')throw Error('synthetic');
   const out=Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in values).map(k=>[k,structuredClone(values[k])]));
   if(kind==='BAD_READBACK'&&out.pcmsS03CatalogLastComplete)out.pcmsS03CatalogLastComplete.head='f'.repeat(40);
   return out;},
   set:async patch=>{assert.equal(JSON.stringify(patch).includes(TOKEN),false);if(kind==='WRITE_STORAGE'&&patch.pcmsS03CatalogLastComplete)throw Error('synthetic');Object.assign(values,structuredClone(patch));}}},
  alarms:{create:async()=>{}}};
 const native=async()=>kind==='MISSING'?{ok:false,code:'GIT_RECONNECT_REQUIRED'}:
   kind==='CREDENTIAL_STORAGE'?{ok:false,code:'GIT_LOCAL_STORAGE_UNAVAILABLE'}:{ok:true,credential:TOKEN};
 const scan=async()=>{if(kind==='NETWORK')throw Error('synthetic');
  if(kind==='HTTP401')return {ok:false,code:'GIT_ACCESS_DENIED',httpStatus:401,complete:false};
  if(kind==='HTTP403')return {ok:false,code:'GIT_ACCESS_DENIED',httpStatus:403,complete:false};
  return {ok:true,code:'CATALOG_COMPLETE',complete:true,repositoryId:kind==='IDENTITY'?'99':'42',
   head:'a'.repeat(40),rootTreeOid:'b'.repeat(40),generators:[],recognizedCount:0};};
 return {watcher:createCatalogWatcher(api,{native,scan,clock:()=>1000,incidents:async(kind,details)=>events.push({kind,details})}),values,events};
}
for(const [kind,code] of [['UNCONFIGURED','GIT_NOT_CONFIGURED'],['MISSING','GIT_CREDENTIAL_MISSING'],
 ['CREDENTIAL_STORAGE','GIT_LOCAL_STORAGE_UNAVAILABLE'],['HTTP401','GIT_CREDENTIAL_REJECTED'],
 ['HTTP403','GIT_ACCESS_DENIED'],['IDENTITY','GIT_IDENTITY_MISMATCH'],['NETWORK','GIT_NETWORK_UNAVAILABLE'],
 ['READ_STORAGE','GIT_LOCAL_STORAGE_UNAVAILABLE'],['WRITE_STORAGE','GIT_LOCAL_STORAGE_UNAVAILABLE'],['BAD_READBACK','GIT_LOCAL_STORAGE_UNAVAILABLE']]){
 test('F3 Git '+kind+' keeps the incident and reports its actual class without credential replacement',async()=>{
  const f=setup(kind),out=await f.watcher.tick();
  assert.equal(out.code,code);assert.equal(out.ok,false);
  assert.equal(f.events.some(e=>e.kind==='RESOLVE'),false);
  assert.equal(JSON.stringify(out).includes(TOKEN),false);
 });
}
test('F3 only complete identity-matched durable main readback resolves the Git connection',async()=>{
 const f=setup('HEALTHY'),out=await f.watcher.tick();
 assert.equal(out.ok,true);assert.equal(f.values.pcmsS03CatalogLastComplete.head,'a'.repeat(40));
 assert.deepEqual(f.events.map(e=>e.kind),['RESOLVE']);
});
