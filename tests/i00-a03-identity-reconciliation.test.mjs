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
