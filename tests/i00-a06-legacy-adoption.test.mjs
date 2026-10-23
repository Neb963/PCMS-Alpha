import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {certifyLegacyAdoptionOriginal,backfillLegacyAdoptions}
  from '../src/runtime/refresher-adopted.mjs';
globalThis.crypto ??= webcrypto;
const files=[
  {path:'main.pjs',base64:btoa('example = 17')},
  {path:'index.html',base64:btoa('<main>Unmodified</main>')},
  {path:'src/icon.txt',base64:btoa('original binary bytes')}];
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',v))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
async function fixture(){
  const staged=await exactSource(files);
  assert.equal(staged.ok,true);
  const sorted=[...staged.files].sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const fingerprint=await hash(new TextEncoder().encode('PCMS_ORIGINAL_V1\n'+
    sorted.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n')));
  const original={ok:true,source:'INDEPENDENT_FULL_BYTE_READBACK',
    remotePublicId:'remote_original_01',visibility:'PUBLIC',
    fingerprint,files:sorted,blobs:structuredClone(files)};
  const db=fakeDatabase();
  const write=await new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta'],'readwrite');
    tx.objectStore('meta').put({key:'adoption:alpha',adoption:{
      slug:'alpha',revision:4,accountId:'account_01',original}});
    tx.oncomplete=()=>resolve(true);tx.onabort=()=>reject(Error('write failed'));
  });
  assert.equal(write,true);
  return {db,original,staged};
}
test('A06 legacy adoption: complete source verified under both old and new domains before CAS',async()=>{
  const {db,original,staged}=await fixture();
  const proof=await certifyLegacyAdoptionOriginal(original);
  assert.equal(proof.ok,true);
  assert.equal(proof.stagedFingerprint,staged.fingerprint);
  const pass=await backfillLegacyAdoptions(db);
  assert.deepEqual(pass,{ok:true,migrated:1,held:0});
  const actual=db.read('meta','adoption:alpha').adoption;
  assert.equal(actual.revision,5);
  assert.equal(actual.original.fingerprint,original.fingerprint);
  assert.equal(actual.original.stagedFingerprint,staged.fingerprint);
  assert.equal(actual.original.sourceStage,'PCMS_STAGED_SOURCE_V1');
  assert.deepEqual(actual.original.blobs,original.blobs);
  assert.equal((await backfillLegacyAdoptions(db)).migrated,0);
});
test('A06 legacy adoption: corrupt source, forged old hash and transaction abort never get source authority',async()=>{
  const broken=await fixture();
  const altered=structuredClone(broken.original);
  altered.blobs[1].base64=btoa('<main>source silently changed</main>');
  assert.equal((await certifyLegacyAdoptionOriginal(altered)).ok,false);
  assert.equal((await certifyLegacyAdoptionOriginal({...broken.original,
    fingerprint:'f'.repeat(64)})).ok,false);
  const record=broken.db.read('meta','adoption:alpha');
  record.adoption.original=altered;
  await new Promise((resolve,reject)=>{
    const tx=broken.db.transaction(['meta'],'readwrite');
    tx.objectStore('meta').put(record);
    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('write failed'));
  });
  const held=await backfillLegacyAdoptions(broken.db);
  assert.equal(held.held,1);
  assert.equal(broken.db.read('meta','adoption:alpha').adoption.original.sourceStage,undefined);
  const {db}=await fixture();
  db.failNextCommit();
  const aborted=await backfillLegacyAdoptions(db);
  assert.equal(aborted.migrated,0);
  assert.equal(aborted.held,1);
  assert.equal(db.read('meta','adoption:alpha').adoption.revision,4);
  assert.equal(db.read('meta','adoption:alpha').adoption.original.sourceStage,undefined);
});
test('A06 legacy adoption: invalid migration batch cannot mutate canonical records',async()=>{
  const {db}=await fixture();
  assert.equal((await backfillLegacyAdoptions(db,{limit:999})).ok,false);
  assert.equal(db.read('meta','adoption:alpha').adoption.revision,4);
});
