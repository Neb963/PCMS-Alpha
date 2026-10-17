// R2 regression: v2 is not a bounded legacy v1 64MiB JSON export.
// Exercise the real v2 IndexedDB cursor reader with a source-heavy synthetic
// transaction, and compile exact source after deduplication. D, not host H.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES,MAX_ARCHIVE_BYTES,snapshotCanonicalV2,consistentOrThrow,digest}
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
              const cursor={key:row.key,value:row.value,
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
  const initial=process.memoryUsage().heapUsed;
  const raw=new Uint8Array(420000).fill(77);
  const sha256=await digest(raw);
  const files=[{path:'main.pjs',size:raw.length,sha256}];
  const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+
    files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
  const source={ok:true,files,fingerprint,
    blobs:[{path:'main.pjs',base64:Buffer.from(raw).toString('base64')}]};
  const rows=Object.fromEntries(DB_STORES.map(k=>[k,[]]));
  for(let i=0;i<76;i++)rows.meta.push({
    key:'stage-history:review-'+String(i).padStart(4,'0'),
    value:{record:{candidate:source,previous:source}}
  });
  const cut=await snapshotCanonicalV2(disposableDB(rows));
  const size=Buffer.byteLength(JSON.stringify(cut));
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
  const reread=await snapshotCanonicalV2(disposableDB(rows));
  consistentOrThrow(cut,reread);
  reread.stores.meta.at(-1).value.record.candidate.files[0].size++;
  assert.throws(()=>consistentOrThrow(cut,reread),/BACKUP_LOCAL_DRIFT/);
  const peak=process.memoryUsage().heapUsed;
  console.log('S02_R2_64M_SOURCE_MEASURE='+JSON.stringify({
    preDedupBytes:size,uniqueBlobs:plan.terminal.uniqueBlobs,
    afterDedupBytes:plan.plaintextBytes,
    heapDeltaBytes:peak-initial,rows:76}));
});
