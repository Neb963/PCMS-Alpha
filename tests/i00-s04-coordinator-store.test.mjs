import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {I17_QUARANTINED_SLUG} from '../src/runtime/legacy-quarantine.mjs';
globalThis.crypto??=webcrypto;

const op=(intentId,slug='s04-private-reserved',accountId=undefined)=>({
  intentId,slug,origin:'OPERATOR',...(accountId?{accountId}:{})
});
const git=(slug='s04-private-reserved',markerOid='a'.repeat(40))=>({
  repository:'Neb963/per-gens',repositoryId:'1411034835',
  slug,head:'b'.repeat(40),markerOid,complete:true,verifiedMain:true
});
const p='s00-create-';
test('S04 canonical IDB: concurrent operator and approved Git origins share one reservation',async()=>{
  const db=fakeDatabase(),s=createCoordinatorStore(db);
  const [a,b]=await Promise.all([
    s.acceptCreate(op('operator_12345678')),
    s.ingestVerifiedMain(git())
  ]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  const key=db.read('meta',p+'slug:s04-private-reserved');
  assert.ok(key?.intentId);
  assert.equal(db.keys('meta').filter(k=>k.startsWith(p+'slug:')).length,1);
  const rec=db.read('meta',p+'intent:'+key.intentId).record;
  assert.equal(rec.sources.length,2);
  assert.equal(rec.state,'WAITING_CAPABILITY');
  assert.equal(rec.hold,'S04_ADMISSION_NOT_VERIFIED');
  assert.equal((await s.getCreate('operator_12345678')).record.slug,rec.slug);
  assert.equal((await s.advanceCreate(key.intentId,rec.revision)).admitted,false);
  assert.equal(db.keys('events').length,2);
  assert.equal(db.keys('operations').length,0,'never touch provider-effect store');
});
test('S04 canonical IDB: lost ACK retries same slug; changed Git OID updates provenance only',async()=>{
  const db=fakeDatabase(),s=createCoordinatorStore(db);
  const a=await s.ingestVerifiedMain(git());
  const b=await s.ingestVerifiedMain(git());
  assert.equal(b.duplicate,true);
  assert.equal(db.keys('events').length,1);
  assert.equal(db.keys('meta').filter(k=>k.startsWith(p+'slug:')).length,1);
  const c=await s.ingestVerifiedMain(git('s04-private-reserved','d'.repeat(40)));
  assert.equal(c.changed,true);
  assert.equal(c.record.sources.length,1);
  assert.equal(c.record.revision,2);
  assert.equal(db.keys('operations').length,0);
  assert.equal((await s.getCreate(a.record.intentId)).record.revision,2);
});
test('S04 canonical IDB: two explicit different pins hold one slug without reassignment',async()=>{
  const db=fakeDatabase(),s=createCoordinatorStore(db);
  const a=await s.acceptCreate(op('operator_12345678',undefined,'account_one1111'));
  const b=await s.acceptCreate(op('operator_87654321',undefined,'account_two2222'));
  assert.equal(b.ok,true);
  assert.equal(b.conflict,true);
  assert.equal(b.record.accountId,'account_one1111');
  assert.equal(b.record.hold,'ACCOUNT_PIN_CONFLICT');
  const c=await s.getCreate('operator_87654321');
  assert.equal(c.ok,true);assert.equal(c.record.intentId,a.record.intentId);
  assert.equal(db.keys('meta').filter(k=>k.startsWith(p+'slug:')).length,1);
});
test('S04 canonical IDB: legacy supply reservation or original I17 uncertainty is not reinterpreted',async()=>{
  const db=fakeDatabase(),s=createCoordinatorStore(db);
  const tx=db.transaction(['meta'],'readwrite');
  tx.objectStore('meta').put({key:'supply-slug:s04-legacy',itemId:'old-create'});
  await new Promise(resolve=>{tx.oncomplete=resolve;});
  const out=await s.ingestVerifiedMain(git('s04-legacy'));
  assert.equal(out.code,'LEGACY_SUPPLY_RESERVATION_RECONCILE_REQUIRED');
  assert.equal(db.read('meta',p+'slug:s04-legacy'),undefined);
  assert.equal((await s.ingestVerifiedMain(git(I17_QUARANTINED_SLUG))).ok,false);
  assert.equal(db.keys('operations').length,0);
});
test('S04 canonical IDB: aborted transaction cannot falsely reserve any slug or event',async()=>{
  const db=fakeDatabase(),s=createCoordinatorStore(db);
  db.failNextCommit();
  await assert.rejects(s.acceptCreate(op('operator_12345678')));
  assert.equal(db.keys('meta').length,0);
  assert.equal(db.keys('events').length,0);
  assert.equal((await s.acceptCreate(op('operator_12345678'))).ok,true);
  assert.equal(db.keys('events').length,1);
});
