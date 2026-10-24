import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {qualifiedCreationInventory} from '../src/runtime/creation-inventory.mjs';
import {selectS04Account} from '../src/runtime/creation-allocation.mjs';
import {previewCreation} from '../src/runtime/creation-preview.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createBatchStore,batchIntentId} from '../src/runtime/creation-batch.mjs';
import {I17_QUARANTINED_BATCH,I17_QUARANTINED_SLUG} from '../src/runtime/legacy-quarantine.mjs';
globalThis.crypto??=webcrypto;
const account={accountId:'account_j02_count',personaUid:'persona-j02-count',state:'VERIFIED',revision:4,bindingVersion:1,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
const row={slug:'existing-j02',accountId:account.accountId,personaUid:account.personaUid,accountRevision:3,bindingVersion:1,
 remoteId:'public_existing',revision:2,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',management:'MANAGED_CREATED',source:'SOURCE_PENDING'};
async function put(db,rows){const t=db.transaction(['meta'],'readwrite');for(const r of rows)t.objectStore('meta').put(r);
 await new Promise((res,rej)=>{t.oncomplete=res;t.onabort=rej});}
function observation(a,at,items){return {source:'GUARDED_PERCHANCE_READBACK',complete:true,
 accountId:a.accountId,personaUid:a.personaUid,accountRevision:a.revision,bindingVersion:a.bindingVersion,
 principalFingerprint:a.identity.principalFingerprint,observationId:'census_'+crypto.randomUUID(),observedAt:at,
 generators:items.map(r=>({...r,remoteId:r.remoteId||'slug-'+r.slug,
  ownerResult:r.ownerResult||'IS_OWNER',ownerPrincipalFingerprint:a.identity.principalFingerprint,ownerObservationId:'owner_'+crypto.randomUUID()}))};}
test('J02 complete current census count is independent of held historical identity; omission never deletes source',async()=>{
 const db=fakeDatabase(),s=createInventoryStore(db),at=Date.now();await put(db,[{key:'account:'+account.accountId,account},
  {key:'inventory:'+row.slug,generator:row}]);
 const first=await s.applyObservation(account,observation(account,at,[{slug:row.slug,visibility:'UNLISTED'}]));
 assert.equal(first.held,true);assert.equal(first.countsTrusted,true);
 const marker=db.read('meta','inventory-batch:'+account.accountId);assert.equal(marker.lastConfirmedCount,1);
 assert.equal(qualifiedCreationInventory(marker,account,at),true);
 const held=db.read('meta','inventory:'+row.slug).generator;assert.equal(held.ownerState,'IDENTITY_CONFLICT');
 assert.equal(held.remoteId,row.remoteId);assert.equal(held.management,'MANAGED_CREATED');
 // Even a later omission retains the old identity hold; it cannot fake a
 // repaired resource merely because no new conflict was discovered.
 await s.applyObservation(account,observation(account,at+1,[]));
 assert.equal(db.read('meta','inventory-batch:'+account.accountId).conflicts,1);
 assert.equal(db.read('meta','inventory-batch:'+account.accountId).lastConfirmedCount,0);
 assert.equal(db.read('meta','inventory:'+row.slug).generator.remoteId,row.remoteId);
});
test('J02 targeted current identity CAS repairs created/adopted context without changing source proof; wrong identity/owner/route context cannot',async()=>{
 for(const adopted of [false,true]){
 const db=fakeDatabase(),s=createInventoryStore(db);await put(db,[{key:'account:'+account.accountId,account},
  {key:'inventory:'+row.slug,generator:{...row,ownerState:'IDENTITY_CONFLICT',identityHold:'PUBLIC_ID_REVALIDATION_REQUIRED',originalProof:'KEEP'}},
  ...(adopted?[{key:'adoption:'+row.slug,adoption:{slug:row.slug,accountId:row.accountId,personaUid:row.personaUid,
    bindingVersion:1,accountRevision:3,remotePublicId:row.remoteId,principalFingerprint:account.identity.principalFingerprint,
    revision:5,original:{fingerprint:'b'.repeat(64)},archiveOperationId:'original_uncertain',archiveState:'HELD_UNCERTAIN'}}]:[])]);
 const proof={ok:true,source:'INDEPENDENT_TARGET_READBACK',state:'OWNED_VERIFIED',ownerMatches:true,
  slug:row.slug,remoteId:row.remoteId,visibility:'UNLISTED'};
 for(const patch of [{ownerMatches:false},{slug:'other'}])
  assert.equal((await s.confirmIdentity(row.slug,2,account,{...proof,...patch})).ok,false);
 assert.equal((await s.confirmIdentity(row.slug,1,account,proof)).code,'STALE_REVISION');
 assert.equal((await s.confirmIdentity(row.slug,2,{...account,revision:3},proof)).code,'ACCOUNT_CONTEXT_CHANGED');
 assert.equal((await s.confirmIdentity(row.slug,2,account,proof)).ok,true);
 const next=db.read('meta','inventory:'+row.slug).generator;assert.equal(next.accountRevision,4);
 assert.equal(next.originalProof,'KEEP');assert.equal(next.identityProof,undefined,'target ID is not full-source proof');
 if(adopted){const a=db.read('meta','adoption:'+row.slug).adoption;assert.equal(a.accountRevision,4);
  assert.equal(a.archiveOperationId,'original_uncertain');assert.equal(a.original.fingerprint,'b'.repeat(64));}
 assert.equal(db.keys('operations').length,0);
 }});
test('J02 unknown owner invalidates current count but preserves last confirmed planning snapshot; cross-account contradiction invalidates other current marker',async()=>{
 const db=fakeDatabase(),s=createInventoryStore(db),at=Date.now();await put(db,[{key:'account:'+account.accountId,account}]);
 await s.applyObservation(account,observation(account,at,[{slug:'one'}]));
 await s.applyObservation(account,observation(account,at+1,[{slug:'one',ownerResult:'UNKNOWN'}]));
 const marker=db.read('meta','inventory-batch:'+account.accountId);
 assert.equal(marker.countsTrusted,false);assert.equal(marker.lastConfirmedCount,1);
 assert.equal(qualifiedCreationInventory(marker,account,at+1),false);
 const planned=selectS04Account({intent:{slug:'new',state:'WAITING_CAPABILITY'},accounts:[{...account,inventoryComplete:true,inventoryCount:marker}],inventory:[],pending:[]});
 assert.equal(planned.owned,1);
 const b={...account,accountId:'account_j02_other',personaUid:'persona_j02_other',identity:{...account.identity,principalFingerprint:'c'.repeat(64)}};
 await put(db,[{key:'account:'+b.accountId,account:b}]);await s.applyObservation(b,observation(b,at+2,[{slug:'one'}]));
 assert.equal(db.read('meta','inventory-batch:'+account.accountId).countHold,'CROSS_ACCOUNT_OWNERSHIP_CONFLICT');
});
test('J02 1001 input preview balances offline account, adopts owner, coalesces duplicate; manifest pages actual per-input jobs with scoped I17 hold',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db),inv=createInventoryStore(db),at=Date.now();
 const b={...account,accountId:'account_j02_other',personaUid:'persona_j02_other'};
 await put(db,[{key:'account:'+account.accountId,account},{key:'account:'+b.accountId,account:b}]);
 await inv.applyObservation(account,observation(account,at,[]));await inv.applyObservation(b,observation(b,at,[]));
 await put(db,[{key:'account:'+b.accountId,account:{...b,state:'VERIFICATION_PENDING'}}]);
 const slugs=Array.from({length:1001},(_,i)=>'j02-plan-'+i);slugs[3]=slugs[2];slugs[4]=I17_QUARANTINED_SLUG;
 const plan=await previewCreation(db,{slugs});assert.equal(plan.ok,true);assert.equal(plan.items.length,1001);
 assert.equal(plan.items[3].action,'COALESCED');assert.equal(plan.items[4].action,'HELD');
 const counts=new Map();for(const r of plan.items)if(r.action==='CREATE')counts.set(r.accountId,(counts.get(r.accountId)||0)+1);
 assert.equal(counts.size,2);assert.ok(Math.abs([...counts.values()][0]-[...counts.values()][1])<=1);
 assert.equal(db.keys('operations').length,0);assert.equal(db.keys('meta').some(k=>k.startsWith('s00-create-intent:')),false);
 const batchId='batch_'+'7'.repeat(32);await s.beginBatch({batchId,total:slugs.length});
 for(let i=0;i<slugs.length;i+=32)await s.appendBatch({batchId,offset:i,slugs:slugs.slice(i,i+32)});
 await s.finalizeBatch({batchId});for(let i=0;i<slugs.length;i++)await s.processBatch({batchId});
 const page=await s.listBatchItems({batchId,offset:975,limit:25});assert.equal(page.total,1001);assert.equal(page.items[0].index,975);assert.equal(page.more,true);
 const held=await s.listBatchItems({batchId,status:'HELD'});assert.equal(held.total,1);assert.equal(held.items[0].slug,I17_QUARANTINED_SLUG);
 assert.equal(db.read('meta','s00-create-intent:'+batchIntentId(batchId,4)),undefined);
 assert.equal((await s.retryBatchHold({batchId,index:4})).ok,false);
 assert.equal((await s.beginBatch({batchId:I17_QUARANTINED_BATCH,total:1})).ok,false);
 const direct=await s.acceptCreate({intentId:batchIntentId(I17_QUARANTINED_BATCH,0),slug:'unrelated-name',origin:'OPERATOR'});assert.equal(direct.ok,false);
 assert.equal(db.keys('operations').length,0);
});

test('J02 newer targeted positive/negative owner evidence invalidates conflicting current census without erasing last confirmed count',async()=>{
 for(const state of ['OWNED_VERIFIED','MISSING_VERIFIED','COLLISION']){
  const db=fakeDatabase(),s=createInventoryStore(db),owned=state!=='OWNED_VERIFIED';
  await put(db,[{key:'account:'+account.accountId,account},
   {key:'inventory:'+row.slug,generator:{...row,ownerState:'IDENTITY_CONFLICT',identityHold:'PUBLIC_ID_REVALIDATION_REQUIRED'}},
   {key:'inventory-batch:'+account.accountId,countsTrusted:true,lastConfirmedCount:owned?1:0,ownedSlugs:owned?[row.slug]:[]}]);
  await s.confirmIdentity(row.slug,row.revision,account,{ok:true,source:'INDEPENDENT_TARGET_READBACK',state,
   ownerMatches:state==='OWNED_VERIFIED',slug:row.slug,remoteId:row.remoteId,visibility:'UNLISTED'});
  const marker=db.read('meta','inventory-batch:'+account.accountId);assert.equal(marker.countsTrusted,false,state);
  assert.equal(marker.lastConfirmedCount,owned?1:0);assert.equal(marker.countHold,'TARGET_OWNERSHIP_CENSUS_CHANGED');
  assert.equal(db.read('meta','inventory:'+row.slug).generator.remoteId,row.remoteId);
 }
});

test('J02 cancellation is limited to unsubmitted local manifest and can never stop or re-submit queued effects',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db),batchId='batch_'+'8'.repeat(32);
 await s.beginBatch({batchId,total:2});await s.appendBatch({batchId,offset:0,slugs:['saved-one']});
 assert.equal((await s.cancelBatch({batchId})).batch.state,'CANCELLED');
 assert.equal((await s.finalizeBatch({batchId})).batch.state,'CANCELLED');
 assert.equal((await s.processBatch({batchId})).code,'BATCH_NOT_QUEUED');
 const second='batch_'+'9'.repeat(32);await s.beginBatch({batchId:second,total:1});
 await s.appendBatch({batchId:second,offset:0,slugs:['saved-two']});await s.finalizeBatch({batchId:second});
 assert.equal((await s.cancelBatch({batchId:second})).code,'BATCH_ALREADY_SUBMITTED');
 assert.equal(db.keys('operations').length,0);
});

test('J02 direct current readback of a different immutable ID holds previously observed source without changing its owner count',async()=>{
 const db=fakeDatabase(),s=createInventoryStore(db);
 await put(db,[{key:'account:'+account.accountId,account},{key:'inventory:'+row.slug,generator:row},
  {key:'source-link:'+row.slug,link:{slug:row.slug,remoteId:row.remoteId,fingerprint:'b'.repeat(64)}},
  {key:'inventory-batch:'+account.accountId,countsTrusted:true,lastConfirmedCount:1,ownedSlugs:[row.slug]}]);
 const out=await s.confirmIdentity(row.slug,row.revision,account,{ok:true,source:'INDEPENDENT_TARGET_READBACK',
  slug:row.slug,state:'OWNED_VERIFIED',ownerMatches:true,remoteId:'public_replaced_j02',visibility:'PUBLIC'});
 assert.equal(out.ok,false);const held=db.read('meta','inventory:'+row.slug).generator;
 assert.equal(held.ownerState,'IDENTITY_CONFLICT');assert.equal(held.identityHold,'IMMUTABLE_PUBLIC_ID_CHANGED');
 assert.equal(held.remoteId,row.remoteId);assert.equal(db.read('meta','inventory-batch:'+account.accountId).countsTrusted,true);
 assert.equal(db.read('meta','source-link:'+row.slug).link.remoteId,row.remoteId);
 assert.equal(db.keys('operations').length,0);
});

test('J02 explicit healthy account selection is independent of another initial-unknown account while automatic/unknown selection and foreign ownership remain held',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db),inv=createInventoryStore(db),b={...account,accountId:'account_j02_initial_unknown',personaUid:'persona_j02_initial_unknown'};
 await put(db,[{key:'account:'+account.accountId,account},{key:'account:'+b.accountId,account:b},
  {key:'s00-create-intent:intent_unknown_possible',record:{intentId:'intent_unknown_possible',slug:'unknown-possible',
   accountId:b.accountId,state:'CREATE_UNCERTAIN',revision:7,createOperationId:'unknown_operation_kept',sources:[{type:'OPERATOR',accountId:b.accountId}]}}]);
 await inv.applyObservation(account,observation(account,Date.now(),[]));
 const marker=db.read('meta','inventory-batch:'+account.accountId);
 const input={intent:{slug:'j02-only-selected',state:'WAITING_CAPABILITY',accountId:account.accountId},
  accounts:[{...account,inventoryComplete:true,inventoryCount:marker},{...b,inventoryComplete:false}],
  inventory:[],pending:[{accountId:b.accountId,state:'CREATE_UNCERTAIN'}]};
 assert.equal(selectS04Account(input).accountId,account.accountId);
 assert.equal(selectS04Account({...input,intent:{...input.intent,accountId:null}}).code,'INITIAL_INVENTORY_UNKNOWN');
 assert.equal(selectS04Account({...input,intent:{...input.intent,accountId:b.accountId}}).code,'INITIAL_INVENTORY_UNKNOWN');
 for(const target of [null,b.accountId,account.accountId]){
  const preview=await previewCreation(db,{slugs:['j02-selected-preview'],accountId:target});
  assert.equal(preview.items[0].action,target===account.accountId?'CREATE':'HELD');
  assert.equal(preview.accounts.find(a=>a.accountId===b.accountId).initialKnown,false);
 }
 const accepted=await s.acceptCreate({intentId:'intent_j02_selected_only',slug:'j02-only-selected',accountId:account.accountId,origin:'OPERATOR'});
 const allocated=await s.allocateCreate(accepted.record.intentId,accepted.record.revision);
 assert.equal(allocated.ok,true,JSON.stringify(allocated));assert.equal(allocated.record.accountId,account.accountId);
 assert.equal(allocated.record.allocation.pending,0,'foreign uncertain work is not charged to selected A');
 const foreign={...row,slug:'j02-foreign-owned',accountId:b.accountId,personaUid:b.personaUid};await put(db,[{key:'inventory:'+foreign.slug,generator:foreign}]);
 const collision=await s.acceptCreate({intentId:'intent_j02_no_foreign_move',slug:foreign.slug,accountId:account.accountId,origin:'OPERATOR'});
 assert.equal((await s.allocateCreate(collision.record.intentId,collision.record.revision)).code,'OWNED_TARGET_ACCOUNT_MISMATCH');
 assert.equal((await previewCreation(db,{slugs:[foreign.slug],accountId:account.accountId})).items[0].action,'HELD');
 const retained=db.read('meta','s00-create-intent:intent_unknown_possible').record;assert.equal(retained.revision,7);
 assert.equal(retained.accountId,b.accountId);assert.equal(retained.createOperationId,'unknown_operation_kept');
 assert.equal(db.keys('operations').length,0);
});
