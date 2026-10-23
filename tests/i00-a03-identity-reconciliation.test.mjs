// A03 historical slug-locator -> public ID migration. Pure and durable oracles
// use only exact protected full-source readback fixtures; never provider effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {planOriginalIdentityMigration} from '../src/runtime/identity-reconciliation.mjs';
import {createAdoptionStore} from '../src/runtime/adoption-store.mjs';
const slug='a03-identity-fixture',accountId='account_fixture_01',personaUid='persona_fixture_01';
const principal='a'.repeat(64),id='public_provider_0001';
const account={accountId,personaUid,revision:3,bindingVersion:2,state:'VERIFIED',
 identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:principal,bindingVersion:2}};
const row={slug,remoteId:'slug-'+slug,accountId,personaUid,
 bindingVersion:2,accountRevision:3,revision:4,ownerState:'OBSERVED_OWNER',
 visibility:'UNLISTED',management:'OBSERVED_ONLY',source:'SOURCE_PENDING'};
const original={ok:true,source:'INDEPENDENT_FULL_BYTE_READBACK',remotePublicId:id,
 fingerprint:'f'.repeat(64),observedAt:1234,files:[],blobs:[],visibility:'UNLISTED'};
async function seed(db,{withOther=false,linked=null,withPending=false}={}){
 const tx=db.transaction(['meta','operations'],'readwrite');
 await new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;tx.onabort=()=>reject(Error('SEED_ABORT'));
  const m=tx.objectStore('meta');
  m.put({key:'account:'+accountId,account});
  m.put({key:'inventory:'+slug,generator:row});
  if(linked)m.put({key:'source-link:'+slug,link:linked});
  if(withOther)m.put({key:'inventory:other-fixture',
    generator:{...row,slug:'other-fixture',remoteId:id}});
  if(withPending)tx.objectStore('operations').put({
    operationId:'operation_a03_active_01',slug,status:'DISPATCH_POSSIBLE'});
 });
}
const args={slug,expectedRevision:4,standingManagement:true};
test('A03 protected original-source readback is necessary for slug alias promotion',()=>{
 const p=planOriginalIdentityMigration(row,account,original);
 assert.equal(p.ok,true);assert.equal(p.changed,true);
 assert.equal(p.record.remoteId,id);
 assert.equal(p.record.revision,5);
 assert.deepEqual(p.record.identityAliases,['slug-'+slug]);
 assert.equal(p.alias.previousId,'slug-'+slug);
 assert.equal(p.alias.originalFingerprint,original.fingerprint);
 assert.equal(planOriginalIdentityMigration(row,account,
  {...original,source:'UNVERIFIED_PAGE_TEXT'}).code,'IDENTITY_PROOF_UNVERIFIED');
 assert.equal(planOriginalIdentityMigration({...row,ownerState:'OWNER_UNVERIFIED'},account,
  original).code,'IDENTITY_PROOF_UNVERIFIED');
 assert.equal(planOriginalIdentityMigration({...row,remoteId:'public_different'},account,
  original).code,'IDENTITY_PUBLIC_ID_CONFLICT');
 assert.equal(planOriginalIdentityMigration(row,account,original,{
  slug,accountId,personaUid,bindingVersion:2,remoteId:'public_different'}).code,
  'IDENTITY_SOURCE_LINK_CONFLICT');
 assert.equal(planOriginalIdentityMigration(row,account,original,{
  slug,accountId,personaUid,bindingVersion:2,remoteId:id}).ok,true);
});
test('A03 adoption atomically preserves source and stores versioned reversible alias',async()=>{
 const db=fakeDatabase();await seed(db);
 const result=await createAdoptionStore(db).adopt(args,original);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.duplicate,false);
 const inventory=db.read('meta','inventory:'+slug).generator;
 const alias=db.read('meta','identity-alias:'+slug).identity;
 const adopted=db.read('meta','adoption:'+slug).adoption;
 assert.equal(inventory.remoteId,id);assert.equal(inventory.revision,5);
 assert.equal(alias.schema,2);assert.equal(alias.publicId,id);
 assert.equal(adopted.remotePublicId,id);
 assert.equal(adopted.original.fingerprint,original.fingerprint);
 assert.equal(adopted.inventoryRevision,5);
 assert.equal(db.keys('operations').length,0,'identity cannot dispatch remote effects');
 assert.ok(db.keys('events').length===2);
});
test('A03 duplicate public identity, in-flight effect and divergent source association stay held',async()=>{
 for(const [name,fixture,code] of [
  ['collision',{withOther:true},'IDENTITY_PUBLIC_ID_ALREADY_BOUND'],
  ['pending',{withPending:true},'IDENTITY_UNCERTAIN_OPERATION_HELD'],
  ['source',{linked:{slug,accountId,personaUid,bindingVersion:2,
    remoteId:'public_conflict'}},'IDENTITY_SOURCE_LINK_CONFLICT']
 ]){
  const db=fakeDatabase();await seed(db,fixture);
  const before=db.read('meta','inventory:'+slug);
  const got=await createAdoptionStore(db).adopt(args,original);
  assert.equal(got.code,code,name+': '+JSON.stringify(got));
  assert.deepEqual(db.read('meta','inventory:'+slug),before);
  assert.equal(db.read('meta','identity-alias:'+slug),undefined);
  assert.equal(db.read('meta','adoption:'+slug),undefined);
 }
});
test('A03 failed atomic commit leaves legacy inventory and original bytes untouched',async()=>{
 const db=fakeDatabase();await seed(db);
 db.failNextCommit();
 await assert.rejects(createAdoptionStore(db).adopt(args,original));
 assert.equal(db.read('meta','inventory:'+slug).generator.remoteId,'slug-'+slug);
 assert.equal(db.read('meta','identity-alias:'+slug),undefined);
 assert.equal(db.read('meta','adoption:'+slug),undefined);
});

test('A03 new slug-only owner poll holds proven public identity; protected recheck restores it without source rewrite',async()=>{
 const {reconcileInventory}=await import('../src/runtime/inventory.mjs');
 const db=fakeDatabase();await seed(db);
 const adopted=await createAdoptionStore(db).adopt(args,original);
 assert.equal(adopted.ok,true,JSON.stringify(adopted));
 const promoted=db.read('meta','inventory:'+slug).generator;
 const observation={source:'GUARDED_PERCHANCE_READBACK',complete:true,
   observationId:'a03_owner_readback_02',observedAt:5678,
   accountId,personaUid,accountRevision:account.revision,bindingVersion:account.bindingVersion,
   principalFingerprint:principal,generators:[{
     slug,remoteId:'slug-'+slug,ownerResult:'IS_OWNER',
     ownerPrincipalFingerprint:principal,ownerObservationId:'a03_owner_readback_02',
     visibility:'UNLISTED'}]};
 const reconciled=reconcileInventory([promoted],account,observation);
 assert.equal(reconciled.ok,true);
 const held=reconciled.rows[0];
 assert.equal(held.remoteId,id,'immutable ID must not be replaced by slug evidence');
 assert.equal(held.ownerState,'IDENTITY_CONFLICT');
 assert.equal(held.identityHold,'PUBLIC_ID_REVALIDATION_REQUIRED');
 await new Promise((resolve,reject)=>{
   const tx=db.transaction('meta','readwrite');
   tx.oncomplete=resolve;tx.onabort=()=>reject(Error('SEED_HOLD_ABORT'));
   tx.objectStore('meta').put({key:'inventory:'+slug,generator:held});
 });
 const store=createAdoptionStore(db);
 const wrong=await store.recheckIdentity(slug,held.revision,
   {...original,remotePublicId:'public_other_0001'});
 assert.equal(wrong.code,'IDENTITY_IMMUTABLE_ID_CHANGED');
 assert.equal(db.read('meta','inventory:'+slug).generator.ownerState,'IDENTITY_CONFLICT');
 const repaired=await store.recheckIdentity(slug,held.revision,original);
 assert.equal(repaired.ok,true,JSON.stringify(repaired));
 assert.equal(repaired.code,'IDENTITY_PUBLIC_ID_REVALIDATED');
 assert.equal(db.read('meta','inventory:'+slug).generator.ownerState,'OBSERVED_OWNER');
 assert.equal(db.read('meta','inventory:'+slug).generator.identityHold,null);
 assert.equal(db.read('meta','inventory:'+slug).generator.remoteId,id);
 assert.equal(db.read('meta','adoption:'+slug).adoption.original.fingerprint,original.fingerprint);
 assert.equal((await store.recheckIdentity(slug,held.revision,original)).code,'STALE_REVISION');
});
