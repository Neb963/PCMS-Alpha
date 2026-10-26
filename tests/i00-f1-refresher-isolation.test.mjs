import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createRefresherStore} from '../src/runtime/refresher-store.mjs';
const now=100000,boot='synthetic_model_boot',hash='b'.repeat(64);
async function fixture(){
  const db=fakeDatabase();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('meta','readwrite'),meta=tx.objectStore('meta');
    const account={accountId:'fixture_account',personaUid:'fixture_persona',bindingVersion:1,
      state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:hash}};
    const generator={slug:'fixture-generator',accountId:account.accountId,personaUid:account.personaUid,
      bindingVersion:1,remoteId:'fixture_remote',ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',lastObservedAt:now,revision:1};
    meta.put({key:'account:'+account.accountId,account});
    meta.put({key:'inventory:'+generator.slug,generator});
    meta.put({key:'release:'+generator.slug,release:{slug:generator.slug,accountId:account.accountId,
      personaUid:account.personaUid,bindingVersion:1,remoteId:generator.remoteId,state:'CONFIRMED_PUBLIC',
      source:'INDEPENDENT_PUBLICATION_READBACK',sourceFingerprint:hash,principalFingerprint:hash,
      observationId:'fixture_observation',observedAt:now}});
    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('fixture aborted'));
  });
  const store=createRefresherStore(db);
  assert.equal((await store.turn({now,bootId:boot})).ok,true);
  return store;
}
const packet={ok:true,complete:true,observedAt:now,principalFingerprint:hash,
  items:[{slug:'fixture-generator',views:42}]};
test('F1/I12: another boot on the shared database correctly invalidates the model observation',async()=>{
  const store=await fixture();
  const claim=await store.claim({kind:'RECENT',now,bootId:boot,claimId:'fixture_claim_shared'});
  assert.equal(claim.ok,true);
  const background=await store.turn({now:now+1,bootId:'actual_background_boot'});
  assert.equal(background.ok,true);
  assert.equal(background.state.inflight.length,0);
  const result=await store.complete(claim.claim.claimId,packet,now+2);
  assert.equal(result.code,'OBSERVATION_CLAIM_EXPIRED');
  assert.equal((await store.read()).state.rows[0].metrics.latest,null);
});
test('F1/I12: a separate model database retains its claim while the background database advances',async()=>{
  const model=await fixture(),background=await fixture();
  const claim=await model.claim({kind:'RECENT',now,bootId:boot,claimId:'fixture_claim_isolated'});
  assert.equal(claim.ok,true);
  assert.equal((await background.turn({now:now+1,bootId:'actual_background_boot'})).ok,true);
  const result=await model.complete(claim.claim.claimId,packet,now+2);
  assert.equal(result.ok,true);assert.equal(result.accepted,true);
  const state=(await model.read()).state;
  assert.equal(state.bootId,boot);assert.equal(state.inflight.length,0);
  assert.equal(state.rows[0].metrics.latest.views,42);
  assert.equal((await background.read()).state.rows[0].metrics.latest,null);
});
