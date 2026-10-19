import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {findEligibleManagedSource} from '../src/runtime/staging-store.mjs';
const slug='s04-ready-created',rid='remote-id-001',aid='account01',uid='persona01';
const account={accountId:aid,state:'VERIFIED',revision:3,personaUid:uid,
  bindingVersion:2,identity:{source:'GUARDED_SESSION_READBACK',
    bindingVersion:2,principalFingerprint:'a'.repeat(64)}};
const link={slug,folder:'generators/'+slug,remoteId:rid,accountId:aid,
  personaUid:uid,bindingVersion:2,source:'S04_INDEPENDENT_NOT_READY_ASSOCIATION'};
const inventory={slug,remoteId:rid,accountId:aid,personaUid:uid,bindingVersion:2,
  ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',
  management:'MANAGED_CREATED',source:'SOURCE_PENDING'};
async function seed(db,rows){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readwrite');
  tx.oncomplete=resolve;tx.onabort=()=>reject(Error('DB_ABORT'));
  for(const v of rows)tx.objectStore('meta').put(v);
 });
}
const facts=(db,patch={})=>seed(db,[
 {key:'source-link:'+slug,link:{...link,...patch.link}},
 {key:'inventory:'+slug,generator:{...inventory,...patch.inventory}},
 {key:'account:'+aid,account:{...account,...patch.account}}
]);
test('S05 I09 bridge recognizes independently confirmed S04 new private source',async()=>{
 const db=fakeDatabase();await facts(db);
 const found=await findEligibleManagedSource(db,slug);
 assert.equal(found.ok,true,JSON.stringify(found));
 assert.equal(found.origin,'S04_CONFIRMED_CREATED');
 assert.equal(found.item.remoteId,rid);
 assert.equal(found.account.identity.principalFingerprint,'a'.repeat(64));
});
test('S05 bridge refuses public, adopted, unproven, mismatched owner and counterfeit link',async()=>{
 for(const patch of [
  {inventory:{visibility:'PUBLIC'}},
  {inventory:{management:'ADOPTED'}},
  {inventory:{ownerState:'OWNER_DISPUTED'}},
  {inventory:{source:'READY'}},
  {inventory:{remoteId:'other'}},
  {link:{source:'OPERATOR_SUPPLIED'}},
  {link:{folder:'generators/different'}},
  {account:{state:'HELD'}},
  {account:{bindingVersion:99}},
  {account:{identity:{source:'UNVERIFIED'}}}
 ]){
  const db=fakeDatabase();await facts(db,patch);
  const found=await findEligibleManagedSource(db,slug);
  assert.equal(found.ok,false,JSON.stringify({patch,found}));
 }
});
test('S05 staging may not infer S04 source eligibility without complete canonical rows',async()=>{
 const db=fakeDatabase();
 assert.equal((await findEligibleManagedSource(db,slug)).ok,false);
 assert.equal((await findEligibleManagedSource(db,'../different')).ok,false);
 await seed(db,[{key:'source-link:'+slug,link}]);
 assert.equal((await findEligibleManagedSource(db,slug)).code,
   'S04_PRIVATE_CREATED_OWNER_UNVERIFIED');
});
