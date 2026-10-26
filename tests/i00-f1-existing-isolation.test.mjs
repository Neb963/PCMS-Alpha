import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {sealPrevious} from '../src/runtime/existing-update-core.mjs';
import {createExistingStore} from '../src/runtime/existing-update-store.mjs';
import {createRefresherStore} from '../src/runtime/refresher-store.mjs';
import {emptyShadow,REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const slug='fixture-existing-isolation',hash='e'.repeat(64);
async function fixture(){
 const db=fakeDatabase(),original=await exactSource([
  {path:'main.pjs',base64:'b3JpZ2luYWw='},
  {path:'index.html',base64:'PHA+UDwvcD4='},
  {path:'src/binary.bin',base64:'AP8I'}]);
 assert.equal(original.ok,true);
 const seal=await sealPrevious(original),account={accountId:'fixture_account',personaUid:'fixture_persona',
  revision:4,bindingVersion:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',
   bindingVersion:1,principalFingerprint:hash}};
 const inventory={slug,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,
  revision:2,remoteId:'fixture_remote',ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
 const adoption={slug,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,
  accountRevision:4,principalFingerprint:hash,remotePublicId:inventory.remoteId,revision:6,
  archiveState:'ARCHIVED_GIT_CONFIRMED',original:{source:'INDEPENDENT_FULL_BYTE_READBACK',
   fingerprint:original.fingerprint,blobs:original.blobs}};
 const state=emptyShadow();
 state.rows.push({stableId:'fixture_existing_row',slug,accountId:account.accountId,
  personaUid:account.personaUid,bindingVersion:1,remoteId:inventory.remoteId,
  phase:'SLEEPING',sleepRemaining:72*3600000,activeRemaining:0,ordinal:1,paused:false,
  slot:false,identityHeld:false,ownerVerified:true,releaseVerified:true,reviewHeld:false,
  metrics:{raw:[],latest:null,nextDueAt:0,failures:0}});
 state.accounts[account.accountId]={personaUid:account.personaUid,bindingVersion:1,paused:false};
 await new Promise((resolve,reject)=>{
  const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
  for(const row of [{key:'account:'+account.accountId,account},{key:'inventory:'+slug,generator:inventory},
   {key:'adoption:'+slug,adoption},{key:REFRESHER_KEY,state}])m.put(row);
  t.oncomplete=resolve;t.onabort=()=>reject(Error('fixture aborted'));
 });
 const store=createExistingStore(db),args={context:{ok:true,originalArchiveFingerprint:original.fingerprint},
  original,seal,remote:{ok:true,remotePublicId:inventory.remoteId,ownerResult:'IS_OWNER',
   visibility:'PUBLIC',source:original},shadow:state.rows[0],account,inventory,adoption};
 return {db,store,args,original};
}
test('F1/I13: real background derivation on a shared database correctly rejects stale synthetic update authority',async()=>{
 const f=await fixture(),background=await createRefresherStore(f.db).turn({
  now:2000000,bootId:'fixture_actual_background'});
 assert.equal(background.ok,true);
 const prepared=await f.store.prepare(f.args);
 assert.equal(prepared.code,'EXISTING_CONTEXT_CHANGED');
 assert.equal(f.db.keys('operations').length,0);
});
test('F1/I13: isolated model keeps one real-IDB-style CAS winner and never replays an uncertain unlist',async()=>{
 const model=await fixture(),background=await fixture();
 assert.equal((await createRefresherStore(background.db).turn({
  now:2000000,bootId:'fixture_actual_background'})).ok,true);
 const first=await model.store.prepare(model.args);
 assert.equal(first.ok,true);assert.equal((await model.store.prepare(model.args)).code,'EXISTING_ALREADY_PREPARED');
 const raced=await Promise.all([model.store.move(slug,first.revision,'UNLIST_DISPATCH'),
  model.store.move(slug,first.revision,'UNLIST_DISPATCH')]);
 const winners=raced.filter(x=>x.ok);assert.equal(winners.length,1);
 assert.equal(model.db.keys('operations').length,1);
 const uncertain=await model.store.move(slug,winners[0].revision,'UNLIST_UNCERTAIN',{reason:'LOST_ACK'});
 assert.equal(uncertain.state,'UNLIST_UNCERTAIN');
 assert.equal((await model.store.move(slug,uncertain.revision,'UNLIST_DISPATCH')).code,'EXISTING_RECONCILIATION_REQUIRED');
 assert.equal(model.db.keys('operations').length,1);
 assert.deepEqual((await model.store.getFull(slug)).record.priorSource.blobs,model.original.blobs);
});
