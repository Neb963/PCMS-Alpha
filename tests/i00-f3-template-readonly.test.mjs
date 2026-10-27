import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
import {createSupplyBoundary} from '../src/runtime/supply-boundary.mjs';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {validateCommand} from '../src/runtime/command-boundary.mjs';
import {fakeDatabase} from './fake-idb.mjs';
import {I17_QUARANTINED_BATCH,I17_QUARANTINED_SLUG} from '../src/runtime/legacy-quarantine.mjs';
const EMAIL='template-fixture@example.test',TOKEN='synthetic_template_session_not_real';
const FP=createHash('sha256').update(EMAIL).digest('hex');
async function isolated(kind='AVAILABLE'){
 const calls=[],local=new Map([['app-storage',JSON.stringify({user:{loggedIn:true,email:EMAIL,sessionToken:TOKEN}})],['sessionTokenLastChangeTime','1']]);
 const packet={kind:'READ_TEMPLATE',slug:I17_QUARANTINED_SLUG,
  principalFingerprint:kind==='WRONG_PRINCIPAL'?'f'.repeat(64):FP};
 const generator={name:'minimal',isPrivate:false,modelText:'PRIVATE_TEMPLATE_SOURCE_CANARY',outputTemplate:'<main>template</main>',srcManifest:[]};
 if(kind==='BAD_SCHEMA')generator.outputTemplate=null;
 const context={packet,location:{origin:'https://perchance.org'},
  localStorage:{getItem:k=>local.get(k)},crypto:webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout,
  fetch:async(url,options)=>{
   const endpoint=url.split('/').at(-1),body=JSON.parse(options.body);calls.push({endpoint,name:body.generatorName});
   assert.ok(['getGeneratorPageData','checkGeneratorOwnership'].includes(endpoint),'no census/save/rename/other endpoint');
   assert.equal(body.generatorName,'minimal');assert.equal(options.method,'POST');
   if(kind==='SESSION_CHANGE'&&calls.length===1)local.set('sessionTokenLastChangeTime','2');
   return {status:200,headers:{get:()=> 'application/json'},json:async()=>endpoint==='getGeneratorPageData'?
    kind==='MISSING'?{status:'generator-does-not-exist'}:{status:'success',generator}:
    {status:kind==='OWNER_DENIED'?'not-logged-in':kind==='OWNED'?'is-owner':'is-not-owner'}};
  }};
 const result=await runInNewContext('('+perchanceSupplyIsolated.toString()+')(packet)',context);
 assert.equal(JSON.stringify(result).includes(TOKEN),false);
 assert.equal(JSON.stringify(result).includes(EMAIL),false);
 assert.equal(JSON.stringify(result).includes('PRIVATE_TEMPLATE_SOURCE_CANARY'),false);
 return {result,calls,generator};
}
test('F3 current template inspection reads only fixed minimal, before owned inventory, and returns a source fingerprint without source bytes',async()=>{
 const f=await isolated();
 assert.equal(f.result.ok,true);assert.equal(f.result.source,'INDEPENDENT_TEMPLATE_READBACK');
 assert.equal(f.result.state,'AVAILABLE');assert.equal(f.result.ownership,'NOT_OWNED');
 assert.equal(f.result.fingerprint,createHash('sha256').update(JSON.stringify(f.generator)).digest('hex'));
 assert.deepEqual(f.calls.map(x=>x.endpoint),['getGeneratorPageData','checkGeneratorOwnership']);
 const owned=await isolated('OWNED');assert.equal(owned.result.ownership,'OWNED');
 assert.equal(owned.result.state,'AVAILABLE','present ownership is a fact, never CREATE authority');
});
test('F3 missing, owner denial, invalid schema, session change and wrong principal remain honest read-only outcomes',async()=>{
 const expected={MISSING:'MISSING_VERIFIED',OWNER_DENIED:'TEMPLATE_OWNER_UNVERIFIED',
  BAD_SCHEMA:'TEMPLATE_SCHEMA_UNVERIFIED',SESSION_CHANGE:'SESSION_CHANGED',WRONG_PRINCIPAL:'PRINCIPAL_CHANGED'};
 for(const [kind,code] of Object.entries(expected)){
  const f=await isolated(kind);assert.equal(f.result.state||f.result.code,code);
  assert.equal(f.calls.length,kind==='WRONG_PRINCIPAL'?0:2);
  if(kind!=='MISSING')assert.equal(f.result.ok,false);
 }
});
async function boundaryFixture({accountChange=false,missingScope=false,denied=false,restoreDuring=false}={}){
 const db=fakeDatabase(),data={},calls=[];
 const op={operationId:'historical_template_op',targetId:I17_QUARANTINED_BATCH+'_000',
  effectType:'supply_create_v1',status:'PREFLIGHT_FAILED',revision:2,effectBoundary:'NOT_DISPATCHED',
  firstFailure:{code:'TEMPLATE_UNVERIFIED',stage:'CREATE_PREFLIGHT',effectBoundary:'NOT_DISPATCHED',at:1000}};
 const item={itemId:op.targetId,requestedSlug:I17_QUARANTINED_SLUG,createOperationId:op.operationId,
  state:'CREATE_PREFLIGHT_FAILED',revision:2};
 const batch={batchId:I17_QUARANTINED_BATCH,accountId:'template_account_01',
  personaUid:missingScope?undefined:'template_persona_01',bindingVersion:1,accountRevision:1,items:[item]};
 const account={accountId:batch.accountId,personaUid:'template_persona_01',bindingVersion:1,
  revision:3,state:'VERIFIED',boundPrincipal:FP,
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:FP}};
 await new Promise(resolve=>{const tx=db.transaction(['meta','operations','events'],'readwrite');tx.oncomplete=resolve;
  tx.objectStore('meta').put({key:'supply-batch:'+batch.batchId,batch});
  tx.objectStore('meta').put({key:'account:'+account.accountId,account});
  tx.objectStore('operations').put(op);
  tx.objectStore('events').add({stage:'SUPPLY_CREATE_PREFLIGHT_FAILED',operationId:op.operationId});
 });
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async key=>({[key]:data[key]})}}};
 const guard={
  getSafeRouteReadiness:async uid=>({ready:true,personaUid:uid,cookieStoreId:'template_container',routeId:'template_route'}),
  runSupplyStep:async(uid,packet)=>{
   calls.push({uid,packet});assert.equal(packet.kind,'READ_TEMPLATE');assert.equal(uid,account.personaUid);
   assert.equal(packet.slug,I17_QUARANTINED_SLUG);
   if(accountChange)await new Promise(resolve=>{const tx=db.transaction(['meta'],'readwrite');tx.oncomplete=resolve;
    tx.objectStore('meta').put({key:'account:'+account.accountId,account:{...account,revision:4}});
   });
   if(restoreDuring)data.pcmsRestoreInProgress={status:'PREPARING'};
   return denied?{ok:false,code:'TEMPLATE_OWNER_UNVERIFIED'}:{
    ok:true,source:'INDEPENDENT_TEMPLATE_READBACK',template:'minimal',state:'AVAILABLE',
    ownership:'NOT_OWNED',schemaVerified:true,fingerprint:'b'.repeat(64)};
  }};
 const boundary=createSupplyBoundary(api,{open:async()=>db,guard:()=>guard,effectGate:()=>false,clock:()=>2000});
 const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
 return {db,op,batch,item,account,calls,boundary,sender,run:params=>boundary.run({type:'READ_TEMPLATE',params},sender)};
}
test('F3 historical template read derives original I17 account, tolerates repaired revision and never rewrites failed journal or dispatches CREATE/RENAME',async()=>{
 const f=await boundaryFixture();
 const before={op:structuredClone(f.db.read('operations',f.op.operationId)),
  batch:structuredClone(f.db.read('meta','supply-batch:'+f.batch.batchId)),events:f.db.keys('events').length};
 const out=await f.run({operationId:f.op.operationId});
 assert.equal(out.ok,true);assert.equal(out.providerEffects,'NONE');assert.equal(out.replayAllowed,false);
 assert.equal(out.historicalStatus,'PREFLIGHT_FAILED');assert.equal(out.historicalReason,'TEMPLATE_UNVERIFIED');
 assert.equal(out.templateObservation.observedAt,2000);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].packet.principalFingerprint,FP);
 assert.deepEqual(f.db.read('operations',f.op.operationId),before.op);
 assert.deepEqual(f.db.read('meta','supply-batch:'+f.batch.batchId),before.batch);
 assert.equal(f.db.keys('events').length,before.events);
});
test('F3 historical read holds missing original scope, later account change, restore and owner denial without replay or invented recovery',async()=>{
 for(const [options,code] of [
  [{missingScope:true},'HISTORICAL_SCOPE_UNVERIFIED'],
  [{accountChange:true},'ORIGINAL_ACCOUNT_CONTEXT_CHANGED'],
  [{restoreDuring:true},'RESTORE_HOLD'],
  [{denied:true},'TEMPLATE_OWNER_UNVERIFIED']
 ]){
  const f=await boundaryFixture(options),before=structuredClone(f.db.read('operations',f.op.operationId));
  const out=await f.run({operationId:f.op.operationId});
  assert.equal(out.ok,false);assert.equal(out.code,code);
  assert.equal(f.calls.length,options.missingScope?0:1);
  assert.deepEqual(f.db.read('operations',f.op.operationId),before);
 }
 const f=await boundaryFixture();
 for(const params of [{operationId:f.op.operationId,accountId:'other_account_01'},
  {operationId:f.op.operationId,template:'https://example.test'},{operationId:'bad target'}])
  assert.equal((await f.run(params)).ok,false);
 assert.equal(f.calls.length,0);
});

test('F5 historical no-dispatch can be explicitly archived once without losing original failure or replaying creation',async()=>{
 const f=await boundaryFixture(),store=createCanonicalStore(f.db);
 const before=structuredClone(f.db.read('operations',f.op.operationId));
 const context=await store.inspectOperationContext(f.op.operationId);
 assert.equal(context.context.evidence,'RECORDED_NO_DISPATCH');
 const out=await store.archiveHistoricalNoDispatch({operationId:f.op.operationId,expectedRevision:before.revision});
 assert.deepEqual({ok:out.ok,archived:out.archived,providerEffects:out.providerEffects,replayAllowed:out.replayAllowed},
  {ok:true,archived:true,providerEffects:'NONE',replayAllowed:false});
 const after=f.db.read('operations',f.op.operationId);
 assert.equal(after.status,'ABORTED');assert.equal(after.originalStatus,'PREFLIGHT_FAILED');
 assert.equal(after.archivedNoDispatch,true);assert.deepEqual(after.firstFailure,before.firstFailure);
 assert.equal(after.revision,before.revision+1);
 assert.equal(f.db.read('meta','supply-batch:'+f.batch.batchId).batch.items[0].state,'CREATE_PREFLIGHT_FAILED');
 assert.equal((await store.inspectOperationContext(f.op.operationId)).context.evidence,'RECORDED_NO_DISPATCH');
 assert.equal((await store.inspectOperationContext(f.op.operationId)).context.archived,true);
 const needs=await store.listOperationPage({status:'NEEDS_ACTION'});
 const completed=await store.listOperationPage({status:'COMPLETED'});
 assert.equal(needs.items.some(x=>x.operationId===f.op.operationId),false);
 assert.equal(completed.items.some(x=>x.operationId===f.op.operationId),true);
 assert.equal((await store.archiveHistoricalNoDispatch({operationId:f.op.operationId,expectedRevision:after.revision})).code,'ARCHIVE_NOT_ADMISSIBLE');
 assert.equal(f.calls.length,0,'archival may never invoke the provider template or effects');
});
test('F5 archiving denies uncertain, inconsistent, stale and unsupported historical operations',async()=>{
 for(const change of [
  op=>{op.effectBoundary='DISPATCH_POSSIBLE'},
  op=>{op.status='HELD_UNCERTAIN'},
  op=>{op.firstFailure.effectBoundary='DISPATCH_POSSIBLE'},
  op=>{op.ack={ok:true}},
  op=>{op.effectType='s04_create'}
 ]){
  const f=await boundaryFixture();
  const op=structuredClone(f.op);change(op);
  await new Promise(resolve=>{const tx=f.db.transaction(['operations'],'readwrite');tx.oncomplete=resolve;
   tx.objectStore('operations').put(op);
  });
  const store=createCanonicalStore(f.db);
  const out=await store.archiveHistoricalNoDispatch({operationId:op.operationId,expectedRevision:op.revision});
  assert.equal(out.ok,false,JSON.stringify(op));
  assert.equal(f.db.read('operations',op.operationId).status,op.status);
 }
 const f=await boundaryFixture(),store=createCanonicalStore(f.db);
 assert.equal((await store.archiveHistoricalNoDispatch({operationId:f.op.operationId,expectedRevision:1})).code,'STALE_REVISION');
 const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p}};
 assert.equal(validateCommand(api,sender,{type:'ARCHIVE_HISTORICAL_NO_DISPATCH',params:{
  operationId:f.op.operationId,expectedRevision:2}}).ok,true);
 assert.equal(validateCommand(api,sender,{type:'ARCHIVE_HISTORICAL_NO_DISPATCH',params:{
  operationId:f.op.operationId,expectedRevision:2,force:true}}).ok,false);
 assert.equal(validateCommand(api,{id:'attacker',url:sender.url},{type:'ARCHIVE_HISTORICAL_NO_DISPATCH',params:{
  operationId:f.op.operationId,expectedRevision:2}}).ok,false);
});
