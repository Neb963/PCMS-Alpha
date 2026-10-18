// R2 regression: v2 is not a bounded legacy v1 64MiB JSON export.
// Exercise the real v2 IndexedDB cursor reader with a source-heavy synthetic
// transaction, and compile exact source after deduplication. D, not host H.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES,MAX_ARCHIVE_BYTES,snapshotCanonicalV2,verifyCanonicalV2Unchanged,digest}
  from '../src/ui/backup-core.mjs';
import {compileV2} from '../src/ui/backup-v2-codec.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope}
  from '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
function disposableDB(rows){
  return {
    objectStoreNames:{contains:name=>DB_STORES.includes(name)},
    transaction(names,mode){
      assert.deepEqual([...names],DB_STORES);
      assert.equal(mode,'readonly');
      let finished=0;
      const tx={oncomplete:null,onabort:null,onerror:null,
        objectStore(name){return {openCursor(){
          const request={onsuccess:null},part=rows[name]||[];
          let i=0;
          function next(){
            const row=part[i++];
            if(row){
              const cursor={key:structuredClone(row.key),value:structuredClone(row.value),
                continue(){queueMicrotask(next)}};
              request.onsuccess({target:{result:cursor}});
            }else{
              request.onsuccess({target:{result:null}});
              if(++finished===DB_STORES.length)
                queueMicrotask(()=>tx.oncomplete());
            }
          }
          queueMicrotask(next);
          return request;
        }}}
      };
      return tx;
    }
  };
}
test('R2 production v2 cursor cut exceeds 64MiB before dedup; no history omission',async()=>{
  const raw=new Uint8Array(420000).fill(77);
  const sha256=await digest(raw);
  const files=[{path:'index.html',size:raw.length,sha256},
    {path:'main.pjs',size:raw.length,sha256}];
  const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+
    files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
  const source={ok:true,files,fingerprint,
    blobs:files.map(f=>({path:f.path,base64:Buffer.from(raw).toString('base64')}))};
  const rows=Object.fromEntries(DB_STORES.map(k=>[k,[]]));
  for(let i=0;i<76;i++)rows.meta.push({
    key:'stage-history:review-'+String(i).padStart(4,'0'),
    value:{record:{candidate:source,previous:source}}
  });
  const initial=process.memoryUsage();
  const cut=await snapshotCanonicalV2(disposableDB(rows));
  // Incremental raw-row byte count: do not allocate a second 170 MiB
  // whole-snapshot JSON merely to measure the pre-dedup corpus.
  const size=cut.stores.meta.reduce((sum,row)=>
    sum+Buffer.byteLength(JSON.stringify(row)),0);
  assert.ok(size>MAX_ARCHIVE_BYTES,{preDedupBytes:size,legacyCap:MAX_ARCHIVE_BYTES});
  assert.equal(cut.stores.meta.length,76);
  const pass='review-only-disposable-v2-password';
  const donor=await encodeBackupEnvelope({payload:createPortableBackupPayload({
    state:{},containers:[],selection:{kind:'full'}}),password:pass});
  const plan=await compileV2(cut,donor);
  assert.equal(plan.terminal.uniqueBlobs,1);
  assert.equal(plan.terminal.canonicalRows,76);
  assert.ok(plan.plaintextBytes<size/16,{
    preDedupBytes:size,archivePlaintextBytes:plan.plaintextBytes});
  assert.equal(cut.stores.meta.at(-1).key,'stage-history:review-0075');
  const checked=await verifyCanonicalV2Unchanged(disposableDB(rows),cut);
  assert.equal(checked.ok,true);
  assert.equal(checked.storeCounts.meta,76);
  const altered={...rows,meta:rows.meta.map(row=>row)};
  altered.meta[altered.meta.length-1]={...rows.meta.at(-1),
    key:'stage-history:changed-during-capture'};
  await assert.rejects(
    verifyCanonicalV2Unchanged(disposableDB(altered),cut),
    /BACKUP_SOURCE_CUT_CHANGED/);
  await assert.rejects(
    verifyCanonicalV2Unchanged(disposableDB({...rows,meta:rows.meta.slice(0,-1)}),cut),
    /BACKUP_SOURCE_CUT_CHANGED/);
  const peak=process.memoryUsage();
  console.log('S02_R2_64M_SOURCE_MEASURE='+JSON.stringify({
    preDedupBytes:size,uniqueBlobs:plan.terminal.uniqueBlobs,
    afterDedupBytes:plan.plaintextBytes,
    heapDeltaBytes:peak.heapUsed-initial.heapUsed,
    rssDeltaBytes:peak.rss-initial.rss,rows:76}));
});


test('S02 v2 canonical cut detects byte-level structured-clone drift',async()=>{
  const rows=Object.fromEntries(DB_STORES.map(store=>[store,[]]));
  rows.meta.push({key:'typed-cut',
    value:{binary:new Uint8Array([0,1,255]).buffer,
      view:new Uint8Array([0,1,255]),notDefined:undefined,
      negativeZero:-0,when:new Date('2026-10-18T00:00:00.000Z')}});
  const original=await snapshotCanonicalV2(disposableDB(rows));
  assert.equal((await verifyCanonicalV2Unchanged(disposableDB(rows),original)).ok,true);
  const mutated=structuredClone(rows);
  mutated.meta[0].value.binary=new Uint8Array([0,1,254]).buffer;
  await assert.rejects(verifyCanonicalV2Unchanged(disposableDB(mutated),original),
    /BACKUP_SOURCE_CUT_CHANGED/);
  const withoutUndefined=structuredClone(rows);
  delete withoutUndefined.meta[0].value.notDefined;
  await assert.rejects(verifyCanonicalV2Unchanged(disposableDB(withoutUndefined),original),
    /BACKUP_SOURCE_CUT_CHANGED/);
  const negativeZero=structuredClone(rows);
  negativeZero.meta[0].value.negativeZero=0;
  await assert.rejects(verifyCanonicalV2Unchanged(disposableDB(negativeZero),original),
    /BACKUP_SOURCE_CUT_CHANGED/);
  const changedViewType=structuredClone(rows);
  changedViewType.meta[0].value.view=new Int8Array([0,1,-1]);
  await assert.rejects(verifyCanonicalV2Unchanged(disposableDB(changedViewType),original),
    /BACKUP_SOURCE_CUT_CHANGED/);
  const changedDate=structuredClone(rows);
  changedDate.meta[0].value.when=new Date('2026-10-19T00:00:00.000Z');
  await assert.rejects(verifyCanonicalV2Unchanged(disposableDB(changedDate),original),
    /BACKUP_SOURCE_CUT_CHANGED/);
});
