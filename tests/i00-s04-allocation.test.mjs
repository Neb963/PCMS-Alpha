import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {selectS04Account} from '../src/runtime/creation-allocation.mjs';
globalThis.crypto??=webcrypto;
const account=(i,state='VERIFIED')=>({
  accountId:'account_'+i,personaUid:'persona_'+i,revision:2,bindingVersion:1,
  state,identity:{source:'GUARDED_SESSION_READBACK',
    bindingVersion:1,principalFingerprint:'a'.repeat(64)}
});
const intent=(slug='test-allocation')=>({intentId:'intent_s04_allocate',
  slug,origin:'OPERATOR'});
async function put(db,items){
  const tx=db.transaction(['meta'],'readwrite');
  for(const x of items)tx.objectStore('meta').put(x);
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});
}
test('S04 allocation D: 50 account candidate set honors historic owned+pending even offline',()=>{
  const accounts=Array.from({length:50},(_,i)=>({...account(String(i).padStart(3,'0')),
    inventoryComplete:true}));
  const inventory=Array.from({length:80},(_,i)=>({
    slug:'known-'+i,accountId:i<40?'account_000':'account_001',ownerState:'OBSERVED_OWNER'
  }));
  const pending=[{accountId:'account_002',state:'OWNER_READBACK_PENDING'}];
  const selection=selectS04Account({intent:{...intent(),state:'WAITING_CAPABILITY'},
    accounts,inventory,pending});
  assert.equal(selection.ok,true);
  assert.equal(selection.accountId,'account_003');
  assert.equal(selectS04Account({intent:{...intent(),state:'WAITING_CAPABILITY',
    accountId:'account_001'},accounts,inventory,pending}).accountId,'account_001');
  assert.equal(selectS04Account({intent:{...intent(),state:'WAITING_CAPABILITY'},
    accounts:[{...accounts[0],inventoryComplete:false},...accounts.slice(1)],
    inventory,pending}).code,'INITIAL_INVENTORY_UNKNOWN');
  assert.equal(selectS04Account({intent:{...intent(),state:'WAITING_CAPABILITY'},
    accounts,inventory:[...inventory,{slug:'disputed',accountId:'account_004',
      ownerState:'OWNER_CONFLICT'}],pending}).code,'INVENTORY_COUNT_UNVERIFIED');
});
test('S04 allocation D: canonical IDB atomic pending counts and existing ownership',async()=>{
  const db=fakeDatabase(),store=createCoordinatorStore(db);
  await put(db,[...['000','001','002'].map(i=>({key:'account:account_'+i,
    account:account(i)})),...['000','001','002'].map(i=>({
      key:'inventory-batch:account_'+i,observationId:'obs_verified_'+i,observedAt:100})),
    {key:'inventory:known-gen',generator:{slug:'known-gen',accountId:'account_000',
      ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',remoteId:'public_12345678'}}]);
  const a=await store.acceptCreate(intent());
  assert.equal(a.ok,true);
  const planned=await store.allocateCreate(a.record.intentId,a.record.revision);
  assert.equal(planned.ok,true);
  assert.equal(planned.record.state,'OWNER_READBACK_PENDING');
  assert.equal(planned.record.accountId,'account_001');
  assert.equal(db.keys('operations').length,0);
  const next=await store.acceptCreate({...intent('second-allocation'),intentId:'intent_s04_more'});
  const p2=await store.allocateCreate(next.record.intentId,next.record.revision);
  assert.equal(p2.ok,true);
  assert.equal(p2.record.accountId,'account_002');
  assert.equal((await store.allocateCreate(a.record.intentId,a.record.revision)).code,
    'STALE_REVISION');
  const adopt=await store.acceptCreate({...intent('known-gen'),intentId:'intent_s04_adopt'});
  const chosen=await store.allocateCreate(adopt.record.intentId,adopt.record.revision);
  assert.equal(chosen.record.state,'ADOPTION_ORIGINAL_PENDING');
  assert.equal(chosen.record.accountId,'account_000');
  assert.equal(chosen.record.hold,'ADOPTION_REQUIRES_ORIGINAL_SOURCE_PROOF');
});
test('S04 allocation D: initial unknown or conflicting account never coerced to zero',async()=>{
  const db=fakeDatabase(),s=createCoordinatorStore(db);
  await put(db,[{key:'account:account_000',account:account('000')}]);
  const first=await s.acceptCreate(intent());
  assert.equal((await s.allocateCreate(first.record.intentId,1)).code,'INITIAL_INVENTORY_UNKNOWN');
  assert.equal(db.read('meta','s00-create-intent:'+first.record.intentId).record.revision,1);
  await put(db,[{key:'inventory-batch:account_000',observationId:'obs000',observedAt:1}]);
  assert.equal((await s.allocateCreate(first.record.intentId,1)).ok,true);
});

test('J02 C36/C37: unavailable managed account receives a provisional balanced assignment without effect authority',()=>{
  const accounts=[{...account('000','VERIFICATION_PENDING'),identity:null,
    boundPrincipal:'a'.repeat(64),inventoryComplete:true},
    {...account('001'),inventoryComplete:true}];
  const inventory=[{slug:'already-owned',accountId:'account_001',ownerState:'OBSERVED_OWNER'}];
  const request={...intent(),state:'WAITING_CAPABILITY'};
  const selected=selectS04Account({intent:request,accounts,inventory,pending:[]});
  assert.equal(selected.ok,true);assert.equal(selected.accountId,'account_000');
  assert.equal(selected.readyForEffect,false);
  const pinned=selectS04Account({intent:{...request,accountId:'account_000'},accounts,inventory,pending:[]});
  assert.equal(pinned.ok,true);assert.equal(pinned.accountId,'account_000');assert.equal(pinned.readyForEffect,false);
  const only=selectS04Account({intent:request,accounts:[accounts[0]],inventory:[],pending:[]});
  assert.equal(only.ok,true);assert.equal(only.readyForEffect,false);
  assert.equal(selectS04Account({intent:request,accounts:[{...accounts[0],inventoryComplete:false}],
    inventory:[],pending:[]}).code,'INITIAL_INVENTORY_UNKNOWN');
});

test('J01 preserved attempted work on archived A cannot block allocation to healthy B',()=>{
 const a={...account('archived'),'state':'ARCHIVED'},b={...account('healthy'),inventoryComplete:true};
 const args={intent:{...intent(),state:'WAITING_CAPABILITY'},accounts:[a,b],inventory:[],
   pending:[{accountId:a.accountId,state:'CREATE_DISPATCH_POSSIBLE'}]};
 assert.equal(selectS04Account(args).accountId,b.accountId);
 assert.equal(selectS04Account({...args,pending:[{accountId:'account_unknown',state:'CREATE_UNCERTAIN'}]}).code,'PENDING_COUNT_UNVERIFIED');
});
