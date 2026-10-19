import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAdoptionStore} from '../src/runtime/adoption-store.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
const slug='s04-existing-public',accountId='account_s04_existing';
const original={remotePublicId:'public_12345678',fingerprint:'b'.repeat(64),
  visibility:'PUBLIC',files:[{path:'main.pjs'},{path:'index.html'}]};
const account={accountId,personaUid:'persona_12345678',state:'VERIFIED',
  revision:4,bindingVersion:1,identity:{source:'GUARDED_SESSION_READBACK',
    bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
const base={slug,accountId,personaUid:account.personaUid,
  accountRevision:4,bindingVersion:1,revision:6,
  remotePublicId:original.remotePublicId,
  principalFingerprint:account.identity.principalFingerprint,
  archived:false,visibility:'PUBLIC',original,
  archiveState:'ARCHIVED_GIT_CONFIRMED',archiveCommit:'c'.repeat(40),
  archiveRef:'refs/tags/pcms-originals/'+original.remotePublicId+'/'+original.fingerprint};
async function seed(){
  const db=fakeDatabase(),tx=db.transaction(['meta'],'readwrite');
  tx.objectStore('meta').put({key:'account:'+accountId,account});
  tx.objectStore('meta').put({key:'adoption:'+slug,adoption:base});
  tx.objectStore('meta').put({key:'s00-create-intent:intent_s04_existing',
    record:{intentId:'intent_s04_existing',slug,accountId,
      personaUid:account.personaUid,accountRevision:4,bindingVersion:1,
      remoteId:original.remotePublicId,visibility:'PUBLIC',revision:2,
      state:'ADOPTION_ORIGINAL_PENDING',hold:'ADOPTION_REQUIRES_ORIGINAL_SOURCE_PROOF'}});
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});
  return db;
}
const proof={source:'INDEPENDENT_AUTHENTICATED_RECOVERY',
  verified:true,receiptId:'qualified_12345678',
  originalFingerprint:original.fingerprint,archiveDigest:'d'.repeat(64)};
test('S04 adoption D: Git-only original may not become write-eligible',async()=>{
  const db=await seed(),creation=createCoordinatorStore(db);
  const prior=db.read('meta','adoption:'+slug).adoption;
  assert.equal((await creation.confirmAdoption('intent_s04_existing',2,prior)).code,
    'ADOPTION_CHECKPOINT_UNVERIFIED');
  const store=createAdoptionStore(db);
  assert.equal((await store.confirmCheckpoint({slug,expectedRevision:6,proof:{
    ...proof,verified:false}})).code,'INDEPENDENT_RECOVERY_PROOF_REQUIRED');
  assert.equal(db.read('meta','adoption:'+slug).adoption.originalCheckpoint,undefined);
});
test('S04 adoption D: independently qualified complete original unlocks only local source association',async()=>{
  const db=await seed(),store=createAdoptionStore(db);
  const qualified=await store.confirmCheckpoint({slug,expectedRevision:6,proof});
  assert.equal(qualified.ok,true,qualified.code);
  const archive=db.read('meta','adoption:'+slug).adoption;
  assert.equal(archive.management,'ORIGINAL_PROTECTED_CHECKPOINT_CONFIRMED');
  const creation=createCoordinatorStore(db);
  const promoted=await creation.confirmAdoption('intent_s04_existing',2,archive);
  assert.equal(promoted.ok,true,promoted.code);
  assert.equal(promoted.record.state,'GIT_INIT_PENDING');
  assert.equal(promoted.record.originalCheckpointId,proof.receiptId);
  assert.equal(db.keys('operations').length,0);
  assert.equal((await creation.confirmAdoption('intent_s04_existing',2,archive)).code,'STALE_REVISION');
  assert.equal(db.read('meta','adoption:'+slug).adoption.visibility,'PUBLIC');
});
