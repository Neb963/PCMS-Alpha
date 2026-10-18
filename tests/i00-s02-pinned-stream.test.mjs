// The pinned stream API is exercised against a replayable, nonmaterialized cut.
// This is a D interface test; it does not prove canonical IndexedDB can yet
// supply an immutable cross-donor capture (the remaining B1 production hold).
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {digest,DB_STORES} from '../src/ui/backup-core.mjs';
import {compilePinnedV2,streamPinnedV2Frames}
  from '../src/ui/backup-v2-pinned-stream.mjs';
import {decodeAuthenticatedV2} from '../src/ui/backup-v2-codec.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope}
  from '../donor/personamonkey/extension/lib/backup-package.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const te=new TextEncoder();
const whole=parts=>{
  const size=parts.reduce((n,x)=>n+x.length,0),data=new Uint8Array(size);
  let offset=0;
  for(const bytes of parts){data.set(bytes,offset);offset+=bytes.length;}
  return data;
};
function rawFile(i,name,length=4096){
  if(name==='main.pjs')return te.encode('output = "source '+i+'";');
  if(name==='index.html')return te.encode('<main>source '+i+'</main>');
  const bytes=new Uint8Array(length);
  // Unique binary byte sequences, including zero, 0xff, and a non-text region.
  for(let k=0;k<length;k++)bytes[k]=(i*41+k*73+(k>>>3))&255;
  bytes[0]=i&255;bytes[1]=i>>>8;bytes[2]=255;bytes[3]=0;
  return bytes;
}
async function fixture(historyCount=12){
  let revision=1;
  const byHash=new Map(),data=[];
  for(let i=0;i<historyCount;i++){
    const names=['index.html','main.pjs','src/asset-'+i+'.bin'];
    const files=[];
    for(const name of names){
      const raw=rawFile(i,name),sha256=await digest(raw);
      files.push({path:name,size:raw.length,sha256});
      byHash.set(sha256,[i,name]);
    }
    const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+
      files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
    data.push({files,fingerprint});
  }
  function source(i){
    const {files,fingerprint}=data[i];
    return {ok:true,fingerprint,files,blobs:files.map(f=>
      ({path:f.path,base64:Buffer.from(rawFile(i,f.path)).toString('base64')}))};
  }
  const cut={
    async assertPinned(){return revision===1;},
    async *rows(){
      for(let i=0;i<historyCount;i++){
        const s=source(i);
        yield {store:'meta',row:{
          key:'stage-history:'+String(i).padStart(5,'0'),
          value:{record:{candidate:s,previous:s}}
        }};
      }
    },
    async blob(sha){
      const origin=byHash.get(sha);
      return origin?rawFile(...origin):null;
    },
    // Test-only mutation hook. Production caller must be a frozen IDB cut.
    expire(){revision++;}
  };
  const password='bounded source stream disposable password';
  const donor=await encodeBackupEnvelope({payload:createPortableBackupPayload({
    state:{},containers:[],selection:{kind:'full'}}),password});
  return {cut,password,donor,historyCount,byHash};
}
test('S02 pinned-cut plan stores only digests and length metadata and reconstructs exact source',async()=>{
  const f=await fixture();
  const plan=await compilePinnedV2(f.cut,f.donor);
  assert.equal(plan.terminal.canonicalRows,f.historyCount);
  assert.equal(plan.terminal.uniqueBlobs,f.byHash.size);
  assert.equal(plan.sourceAudit.manifests,f.historyCount*2);
  assert.ok(plan.rows.every(x=>typeof x.sha256==='string'&&
    !Object.hasOwn(x,'value')&&!Object.hasOwn(x,'base64')));
  assert.ok([...plan.blobs.values()].every(x=>Number.isSafeInteger(x)));
  const parts=[];
  for await(const piece of streamPinnedV2Frames(plan))parts.push(piece);
  const plaintext=whole(parts);
  assert.equal(plaintext.length,plan.plaintextBytes);
  const restored=await decodeAuthenticatedV2(plaintext,{
    password:f.password,decodeDonor:decodeBackupEnvelope});
  assert.equal(restored.pcms.stores.meta.length,f.historyCount);
  const value=restored.pcms.stores.meta[7].value.record.candidate;
  assert.match(value.fingerprint,/^[a-f0-9]{64}$/);
  assert.deepEqual(Buffer.from(value.blobs[2].base64,'base64'),
    Buffer.from(rawFile(7,'src/asset-7.bin')));
});
test('S02 pinned-cut rejects revoked snapshot and changed blobs before success',async()=>{
  const f=await fixture(4),plan=await compilePinnedV2(f.cut,f.donor);
  f.cut.expire();
  await assert.rejects((async()=>{
    for await(const b of streamPinnedV2Frames(plan))void b;
  })(),/BACKUP_V2_PINNED_CUT_CHANGED/);
  const next=await fixture(3),prepared=await compilePinnedV2(next.cut,next.donor);
  const original=next.cut.blob;
  next.cut.blob=async sha=>{
    const bytes=await original(sha);
    const changed=bytes.slice();changed[0]^=1;return changed;
  };
  await assert.rejects((async()=>{
    for await(const b of streamPinnedV2Frames(prepared))void b;
  })(),/BACKUP_V2_PINNED_BLOB_CHANGED/);
});
test('S02 pinned-cut enforces record ordering, missing source and bounded limits',async()=>{
  const {cut,donor}=await fixture(3);
  const bad={...cut,async *rows(){
    const entries=[];for await(const r of cut.rows())entries.push(r);
    yield entries[1];yield entries[0];yield entries[2];
  }};
  await assert.rejects(compilePinnedV2(bad,donor),
    /BACKUP_V2_PINNED_ROW_ORDER/);
  const missing={...cut,async *rows(){
    for await(const entry of cut.rows()){
      if(entry.store==='meta'&&entry.row.key.endsWith('00002'))
        delete entry.row.value.record.previous;
      yield entry;
    }
  }};
  await assert.rejects(compilePinnedV2(missing,donor),
    /BACKUP_SOURCE_INCOMPLETE_STAGE/);
  const fake={rows:cut.rows,blob:cut.blob,assertPinned:async()=>false};
  await assert.rejects(compilePinnedV2(fake,donor),
    /BACKUP_V2_PINNED_CUT_CHANGED/);
  assert.ok(DB_STORES.includes('meta'));
});
