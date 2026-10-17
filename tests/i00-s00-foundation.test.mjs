import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freezeSupply} from '../src/runtime/supply-plan.mjs';
import {
  I17_QUARANTINED_BATCH,I17_QUARANTINED_SLUG,I17_QUARANTINE_CODE,
  isI17Quarantined,admissionForI17Supply
} from '../src/runtime/legacy-quarantine.mjs';
import {validateCreateIntent,transitionCreateIntent} from '../src/runtime/coordinator-core.mjs';
import {createCoordinatorBoundary,validateCoordinatorMessage,COORDINATOR_PORT}
  from '../src/runtime/coordinator-boundary.mjs';

const intent={intentId:'intent_s00_0001',slug:'s00-disposable-local',
  origin:'OPERATOR',accountId:'account_s00_0001'};
const api={runtime:{id:'persona-route-manager@local',
  getURL:p=>'moz-extension://synthetic/'+p},storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};

test('S00 D: permanent I17 quarantine for batch and slug across intake origins',()=>{
  const target=I17_QUARANTINED_SLUG;
  assert.equal(isI17Quarantined({batchId:I17_QUARANTINED_BATCH}),true);
  assert.equal(isI17Quarantined({itemId:I17_QUARANTINED_BATCH+'_000'}),true);
  for(const field of ['slug','requestedSlug','targetSlug','originalSlug','candidateSlug']){
    assert.equal(isI17Quarantined({[field]:target}),true,field);
    assert.equal(isI17Quarantined({[field]:target.toUpperCase()}),true,field);
  }
  assert.equal(isI17Quarantined({slugs:['normal',target]}),true);
  assert.equal(isI17Quarantined({slug:'ordinary-s00'}),false);
  for(const kind of ['CREATE','RENAME','PREFLIGHT_CREATE','PREFLIGHT_RENAME']){
    const denied=admissionForI17Supply(kind,{slug:target});
    assert.equal(denied.code,I17_QUARANTINE_CODE);
    assert.equal(denied.effectBoundary,'NOT_DISPATCHED');
  }
  // Historical readback remains possible for investigation; it never
  // grants permission to repeat an uncertain remote effect.
  assert.equal(admissionForI17Supply('READ_CREATE',{slug:target}).ok,true);
  assert.equal(admissionForI17Supply('READ_RENAME',{slug:target}).ok,true);
});

test('S00 D: old operation never becomes a fresh frozen create or rename',()=>{
  const base={batchId:'batch_s00_0001',accountId:'account_s00_0001',
    personaUid:'persona-s00-0001',accountRevision:1,bindingVersion:1};
  const mixed=freezeSupply({...base,slugs:['ordinary-s00',I17_QUARANTINED_SLUG]});
  assert.equal(mixed.ok,true);
  assert.equal(mixed.batch.items[0].state,'FROZEN');
  assert.equal(mixed.batch.items[1].state,'REJECTED');
  assert.equal(mixed.batch.items[1].reason,I17_QUARANTINE_CODE);
  const prior=freezeSupply({...base,batchId:I17_QUARANTINED_BATCH,slugs:['ordinary-s00']});
  assert.equal(prior.batch.items[0].state,'REJECTED');
});

test('S00 D: fixed generator intent is durable-eligible but cannot dispatch',()=>{
  const first=transitionCreateIntent(null,{type:'ACCEPT',intent});
  assert.equal(first.ok,true);
  assert.equal(first.record.state,'WAITING_CAPABILITY');
  assert.equal(first.record.revision,1);
  assert.equal(first.record.hold,'S01_PROTECTED_ADMISSION_UNPROVEN');
  assert.equal(transitionCreateIntent(first.record,{type:'ACCEPT',intent}).duplicate,true);
  assert.equal(transitionCreateIntent(first.record,{type:'ACCEPT',
    intent:{...intent,slug:'conflicting'}}).code,'INTENT_ID_CONFLICT');
  assert.equal(transitionCreateIntent(first.record,{type:'ADVANCE',
    intentId:intent.intentId,expectedRevision:0}).code,'STALE_REVISION');
  const advanced=transitionCreateIntent(first.record,{type:'ADVANCE',
    intentId:intent.intentId,expectedRevision:1});
  assert.equal(advanced.ok,true);
  assert.equal(advanced.changed,false);
  assert.equal(advanced.admitted,false);
  assert.equal(advanced.record,first.record);
  assert.equal(validateCreateIntent({...intent,origin:'GITHUB'}).code,'INVALID_CREATE_INTENT');
  assert.equal(validateCreateIntent({...intent,slug:I17_QUARANTINED_SLUG}).code,I17_QUARANTINE_CODE);
  assert.equal(validateCreateIntent({...intent,batchId:I17_QUARANTINED_BATCH}).ok,false);
});

test('S00 D: same-extension-only coordinator port, no early effects',async()=>{
  const accepted=transitionCreateIntent(null,{type:'ACCEPT',intent});
  const fake={acceptCreate:async()=>accepted,getCreate:async()=>({ok:true,record:accepted.record}),
    advanceCreate:async()=>({...transitionCreateIntent(accepted.record,
      {type:'ADVANCE',intentId:intent.intentId,expectedRevision:1}),providerEffects:'OFF'})};
  let calls=0;
  const boundary=createCoordinatorBoundary(api,{open:async()=>{calls++;return {};},
    factory:()=>fake});
  assert.equal(COORDINATOR_PORT,'pcms-s00-coordinator');
  assert.equal(validateCoordinatorMessage(api,{...sender,url:'https://perchance.org/'},
    {type:'ACCEPT_CREATE_INTENT',params:intent}).code,'UNTRUSTED_SENDER');
  assert.equal(validateCoordinatorMessage(api,sender,
    {type:'ACCEPT_CREATE_INTENT',params:intent}).ok,true);
  assert.equal(validateCoordinatorMessage(api,sender,{type:'EXECUTE_PROVIDER',params:intent}).ok,false);
  const a=await boundary.run({type:'ACCEPT_CREATE_INTENT',params:intent},sender);
  const b=await boundary.run({type:'ADVANCE_CREATE_INTENT',params:{
    intentId:intent.intentId,expectedRevision:1}},sender);
  assert.equal(a.record.state,'WAITING_CAPABILITY');
  assert.equal(b.admitted,false);
  assert.equal(b.providerEffects,'OFF');
  assert.equal(calls,1);
});

test('S00 D: packaged entry and overlay include all fixed-function modules',async()=>{
  const [entry,overlay,boundary,guard]=await Promise.all([
    '../src/runtime/entry.mjs','../src/runtime/overlay.mjs',
    '../src/runtime/coordinator-boundary.mjs','../src/runtime/persona-guard.mjs'
  ].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
  for(const name of ['coordinator-boundary.mjs','coordinator-core.mjs',
    'coordinator-store.mjs','legacy-quarantine.mjs'])assert.match(overlay,new RegExp(name.replaceAll('.','\\.')));
  assert.match(entry,/coordinator-boundary\.mjs/);
  assert.match(guard,/admissionForI17Supply\(request\?\.kind,request\)/);
  assert.doesNotMatch(boundary,/runSupplyStep|sendNativeMessage|fetch\s*\(|XMLHttpRequest/);
});
