import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {qualifyRecoveredOriginals} from '../src/runtime/adoption-recovery-bridge.mjs';
const slug='s04-recovered-original';
const finger='a'.repeat(64),runId='s02_'+'b'.repeat(32),digest='c'.repeat(64),
  commit='d'.repeat(40),ref='refs/tags/pcms-originals/public_12345678/'+finger;
const account={accountId:'account_s04_restore',personaUid:'persona_s04_restore',
  revision:2,bindingVersion:1,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,
    principalFingerprint:'e'.repeat(64)}};
const source={slug,accountId:account.accountId,personaUid:account.personaUid,
  accountRevision:2,bindingVersion:1,revision:3,archived:false,
  remotePublicId:'public_12345678',
  original:{remotePublicId:'public_12345678',fingerprint:finger},
  archiveState:'ARCHIVED_GIT_CONFIRMED',archiveCommit:commit,
  archiveRef:ref,principalFingerprint:account.identity.principalFingerprint};
const audit={status:'SOURCE_BYTES_AUDITED_NOT_DISK_VERIFIED'};
async function fixture(a=source){
  const db=fakeDatabase(),tx=db.transaction(['meta'],'readwrite');
  tx.objectStore('meta').put({key:'account:'+account.accountId,account});
  tx.objectStore('meta').put({key:'adoption:'+slug,adoption:a});
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});
  return db;
}
const snapshot=(s=source)=>({schema:1,stores:{meta:[{
  key:'adoption:'+slug,value:{adoption:s}
}]}});
const work=(db,restored=snapshot(),sourceAudit=audit)=>
  qualifyRecoveredOriginals({db,recoveredPcms:restored,runId,
    ciphertextSha256:digest,preparedSha256:'f'.repeat(64),sourceAudit});
test('S04/S02 D: qualified disk reopened archive only releases identical current original',async()=>{
  const db=await fixture();
  const out=await work(db);
  assert.deepEqual({...out},{total:1,qualified:1,already:0,held:0,
    activation:'OFF',source:'QUALIFIED_DISK_REOPENED_SOURCE_READONLY'});
  const saved=db.read('meta','adoption:'+slug).adoption;
  assert.equal(saved.originalCheckpoint.receiptId,runId);
  assert.equal(saved.originalCheckpoint.archiveDigest,digest);
  assert.equal(saved.originalCheckpoint.fingerprint,finger);
  assert.equal(saved.originalCheckpoint.qualified,true);
  const repeat=await work(db);
  assert.equal(repeat.qualified,0);
  assert.equal(repeat.already,1);
});
test('S04/S02 D: remote ref, recovered revision, account rebind, or incomplete provenance hold',async()=>{
  for(const modified of [
    {...source,revision:4},{...source,archiveCommit:'f'.repeat(40)},
    {...source,remotePublicId:'public_other_01'},
    {...source,accountId:'account_elsewhere_01'}
  ]){
    const db=await fixture(modified);
    const result=await work(db);
    assert.equal(result.qualified,0);
    assert.equal(result.held,1);
  }
  const db=await fixture();
  await assert.rejects(work(db,snapshot(),{status:'BROWSER_ONLY'}),/S04_AUTHENTICATED_RECOVERY_REQUIRED/);
  assert.equal(db.read('meta','adoption:'+slug).adoption.originalCheckpoint,undefined);
});
test('S04/S02 D: source archive only, no recovered witness or invalid tag cannot qualify',async()=>{
  const db=await fixture();
  assert.equal((await work(db,{schema:1,stores:{meta:[]}})).total,0);
  await assert.rejects(work(db,snapshot({...source,archiveRef:'refs/heads/main'})),
    /S04_RECOVERED_ADOPTION_INVALID/);
  assert.equal(db.read('meta','adoption:'+slug).adoption.revision,3);
});
