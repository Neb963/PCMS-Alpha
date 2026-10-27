import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {createAccountStore} from '../src/runtime/accounts.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {readIncidentContext,validIncidentTarget} from '../src/ui/faithful/attention.mjs';
const targets={
 ROUTE_UNAVAILABLE:{kind:'ACCOUNT',id:'context_account_01'},
 ACCOUNT_UNVERIFIED:{kind:'ACCOUNT',id:'context_account_01'},
 SOURCE_HELD:{kind:'GENERATOR',id:'context-generator'},
 GIT_FOLDER_MISSING:{kind:'GENERATOR',id:'context-generator'},
 GIT_FOLDER_RENAME_REVIEW:{kind:'GENERATOR',id:'context-generator'},
 OPERATION_UNCERTAIN:{kind:'OPERATION',id:'context_operation_01'},
 RESTORE_IN_PROGRESS:{kind:'SETTINGS',id:'backups'},BACKUP_FAILED:{kind:'SETTINGS',id:'backups'},
 GIT_RECONNECT_REQUIRED:{kind:'SETTINGS',id:'connections'},
 CANONICAL_UNAVAILABLE:{kind:'SETTINGS',id:'diagnostics'},
 PROVIDER_OUTAGE:{kind:'SETTINGS',id:'refresher'}
};
async function fixture(){
 const db=fakeDatabase(),canonical=createCanonicalStore(db),accounts=createAccountStore(db),inventory=createInventoryStore(db);
 await new Promise(resolve=>{const tx=db.transaction(['meta','operations'],'readwrite');tx.oncomplete=resolve;
  tx.objectStore('meta').put({key:'account:context_account_01',account:{accountId:'context_account_01',revision:3,state:'VERIFIED',personaUid:'context_persona_01',bindingVersion:1}});
  tx.objectStore('meta').put({key:'inventory:context-generator',generator:{slug:'context-generator',revision:4,accountId:'context_account_01',ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'}});
  tx.objectStore('operations').put({operationId:'context_operation_01',targetId:'context_target_01',
   effectType:'supply_create_v1',status:'HELD_UNCERTAIN',revision:5});
 });
 const reads={
  getNotice:p=>canonical.inspectNotice(p),
  getAccount:accountId=>accounts.get(accountId),
  getGenerator:async slug=>{const out=await inventory.inspect([slug]);return {...out,generator:out.items.find(g=>g.slug===slug&&!g.missing)};},
  getOperation:operationId=>canonical.inspectOperationContext(operationId)
 };
 return {db,canonical,reads};
}
for(const [code,target] of Object.entries(targets))
 for(const reference of ['VALID','ABSENT','STALE'])
  for(const state of ['ACTIVE','REVIEWED','RESOLVED'])
   test('F3 actual canonical context '+code+' / '+reference+' / '+state,async()=>{
    const f=await fixture(),scopeId=('matrix_'+code+'_'+reference+'_'+state).toLowerCase();
    const selected=reference==='STALE'&&target.kind!=='SETTINGS'?
      {...target,id:target.kind==='GENERATOR'?'missing-context-generator':'missing_context_entity_01'}:target;
    if(reference==='STALE')assert.equal(validIncidentTarget(selected),true,'stale is a well-formed reference, not malformed input');
    await f.canonical.recordNotice({scopeId,code,revision:1,severity:'ACTION_REQUIRED',
      cause:'original_cause_'+code,reason:'ORIGINAL_CHECK_FAILED',...(reference==='ABSENT'?{}:{target:selected}),at:1000});
    if(state==='REVIEWED')await f.canonical.acknowledgeNotice({scopeId,code,expectedRevision:1});
    if(state==='RESOLVED')await f.canonical.resolveNotice({scopeId,code,evidence:'VERIFIED_RUNTIME_READBACK',at:2000});
    const snapshot=(await f.canonical.inspectNotice({scopeId,code})).notice;
    const before=structuredClone(f.db.read('meta','attention:'+scopeId+':'+code));
    const result=await readIncidentContext(snapshot,f.reads);
    assert.equal(result.ok,true);assert.equal(result.providerEffects,'NONE');
    assert.equal(result.notice.state,state==='RESOLVED'?'RESOLVED':'ACTIVE');
    assert.equal(result.notice.reviewed,state==='REVIEWED');
    assert.equal(result.notice.firstReason,'ORIGINAL_CHECK_FAILED');
    if(reference==='VALID'||reference==='STALE'&&target.kind==='SETTINGS'){
      assert.equal(result.targetState,'CURRENT');assert.deepEqual(result.destination,selected);
    }else{
      assert.equal(result.targetState,reference==='STALE'?'STALE':'ABSENT');
      assert.ok(['CONTEXT','SETTINGS'].includes(result.destination.kind));
      assert.notEqual(result.destination.id,scopeId,'opaque scope is never a guessed target/search');
    }
    assert.deepEqual(f.db.read('meta','attention:'+scopeId+':'+code),before,
      'context reads never rewrite first failure, review, resolution or effect state');
    if(state==='RESOLVED')assert.equal(result.notice.history.at(-1).evidence,'VERIFIED_RUNTIME_READBACK');
   });
test('F3 newest canonical target wins; mismatched notice/entity and failed reads cannot navigate to an inferred identity',async()=>{
 const f=await fixture(),scopeId='opaque_incident_scope',code='ROUTE_UNAVAILABLE';
 const first={scopeId,code,revision:1,severity:'ACTION_REQUIRED',target:{kind:'ACCOUNT',id:'old_missing_account'}};
 await f.canonical.recordNotice(first);
 await f.canonical.recordNotice({...first,revision:2,target:targets.ROUTE_UNAVAILABLE});
 const result=await readIncidentContext(first,f.reads);
 assert.equal(result.destination.id,'context_account_01');assert.equal(result.notice.revision,2);
 const wrong=await readIncidentContext(first,{...f.reads,getAccount:async()=>({ok:true,account:{accountId:'wrong_account_01',revision:4}})});
 assert.equal(wrong.targetState,'STALE');assert.equal(wrong.destination.kind,'CONTEXT');
 const unavailable=await readIncidentContext(first,{...f.reads,getAccount:async()=>{throw Error('offline')}});
 assert.equal(unavailable.targetState,'UNAVAILABLE');
 let lookups=0;
 const mismatched=await readIncidentContext(first,{...f.reads,
  getNotice:async()=>({ok:true,notice:{...first,scopeId:'different_scope_01'}}),
  getAccount:async()=>{lookups++;return {ok:true}}});
 assert.equal(mismatched.ok,false);assert.equal(lookups,0);assert.equal(mismatched.destination.kind,'CONTEXT');
 for(const target of [{kind:'URL',id:'https://example.test'},{kind:'ACCOUNT',id:'bad target'},{kind:'SETTINGS',id:'arbitrary'}]){
  const malformed=await readIncidentContext(first,{...f.reads,getNotice:async()=>({ok:true,notice:{...first,target}})});
  assert.equal(malformed.targetState,'ABSENT');assert.equal(malformed.destination.kind,'CONTEXT');
 }
});
