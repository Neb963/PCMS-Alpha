// The pinned stream API is exercised against a replayable, nonmaterialized cut.
// This is a D interface test; it does not prove canonical IndexedDB can yet
// supply an immutable cross-donor capture (the remaining B1 production hold).
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {digest,DB_STORES} from '../src/ui/backup-core.mjs';
import {compilePinnedV2,streamPinnedV2Frames}
  from '../src/ui/backup-v2-pinned-stream.mjs';
import {compileV2,streamV2Frames,decodeAuthenticatedV2}
  from '../src/ui/backup-v2-codec.mjs';
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
  const variant=name.includes('asset-b-')?7:0;
  for(let k=0;k<length;k++)bytes[k]=(i*41+variant*13+k*73+(k>>>3))&255;
  bytes[0]=i&255;bytes[1]=i>>>8;bytes[2]=255;bytes[3]=variant;
  return bytes;
}
async function fixture(historyCount=12,{assetBytes=4096,assetCount=1,accounts=0}={}){
  let revision=1;
  const byHash=new Map(),data=[];
  for(let i=0;i<historyCount;i++){
    const names=['index.html','main.pjs',
      ...(assetCount===1?['src/asset-'+i+'.bin']:
        ['src/asset-a-'+i+'.bin','src/asset-b-'+i+'.bin'])];
    const files=[];
    for(const name of names){
      const raw=rawFile(i,name,assetBytes),sha256=await digest(raw);
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
      ({path:f.path,base64:Buffer.from(rawFile(i,f.path,assetBytes)).toString('base64')}))};
  }
  const cut={
    async assertPinned(){return revision===1;},
    async counts(){return {entities:0,operations:0,events:0,
      meta:historyCount+accounts,observations:0};},
    async *rows(){
      for(let i=0;i<accounts;i++)
        yield {store:'meta',row:{
          key:'account:'+String(i).padStart(5,'0'),
          value:{account:{accountId:'account-'+i,state:'ARCHIVED'}}
        }};
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
      return origin?rawFile(origin[0],origin[1],assetBytes):null;
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
  const fake={...cut,assertPinned:async()=>false};
  await assert.rejects(compilePinnedV2(fake,donor),
    /BACKUP_V2_PINNED_CUT_CHANGED/);
  assert.ok(DB_STORES.includes('meta'));
});

test('S02 bounded pinned source framing is byte-for-byte compatible with frozen legacy v2',async()=>{
  const {cut,donor}=await fixture(6);
  const stores=Object.fromEntries(DB_STORES.map(store=>[store,[]]));
  for await(const {store,row} of cut.rows())stores[store].push(row);
  // Test oracle may materialize six rows; the real pinned-plan API must not.
  const legacy=await compileV2({schema:1,stores},donor);
  const incremental=await compilePinnedV2(cut,donor);
  const oldFrames=[],newFrames=[];
  for await(const part of streamV2Frames(legacy))oldFrames.push(part);
  for await(const part of streamPinnedV2Frames(incremental))newFrames.push(part);
  assert.deepEqual(whole(newFrames),whole(oldFrames));
  assert.equal(incremental.plaintextBytes,legacy.plaintextBytes);
  assert.deepEqual(incremental.terminal,legacy.terminal);
});

test('S02 pinned count witness rejects filtered or truncated source enumeration',async()=>{
  const {cut,donor}=await fixture(9);
  const shortened={...cut,async *rows(){
    let count=0;for await(const entry of cut.rows()){
      if(++count===9)break;yield entry;
    }
  }};
  await assert.rejects(compilePinnedV2(shortened,donor),
    /BACKUP_V2_PINNED_ROW_COUNT_MISMATCH/);
  const noWitness={...cut};delete noWitness.counts;
  await assert.rejects(compilePinnedV2(noWitness,donor),
    /BACKUP_V2_PINNED_CUT_REQUIRED/);
});

test('S02 50 accounts/1024 histories/2048 genuinely distinct binary assets exceed 64MiB unique',async()=>{
  const fixtureData=await fixture(1024,{accounts:50,assetCount:2,assetBytes:40960});
  const start=process.memoryUsage();
  let peakHeap=start.heapUsed,peakRss=start.rss,bytesEmitted=0,fragments=0;
  const sample=()=>{
    const m=process.memoryUsage();
    peakHeap=Math.max(peakHeap,m.heapUsed);
    peakRss=Math.max(peakRss,m.rss);
  };
  const started=Date.now();
  const plan=await compilePinnedV2(fixtureData.cut,fixtureData.donor);
  sample();
  assert.equal(plan.terminal.canonicalRows,1074);
  assert.equal(plan.sourceAudit.manifests,2048);
  assert.equal(plan.sourceAudit.references,8192);
  assert.ok(plan.sourceAudit.uniqueBytes>64*1024*1024,
    {uniqueBytes:plan.sourceAudit.uniqueBytes});
  assert.equal(plan.terminal.uniqueBlobs,fixtureData.byHash.size);
  assert.ok(plan.terminal.uniqueBlobs>=4096,
    {uniqueBlobs:plan.terminal.uniqueBlobs});
  for await(const part of streamPinnedV2Frames(plan)){
    bytesEmitted+=part.byteLength;fragments++;sample();
  }
  assert.equal(bytesEmitted,plan.plaintextBytes);
  const result={
    accounts:50,histories:1024,sourceReferences:plan.sourceAudit.references,
    uniqueBlobs:plan.terminal.uniqueBlobs,uniqueBytes:plan.sourceAudit.uniqueBytes,
    sourceBytesBeforeDedup:plan.sourceAudit.referencedBytes,
    plaintextBytes:plan.plaintextBytes,fragments,
    heapDeltaPeak:peakHeap-start.heapUsed,rssDeltaPeak:peakRss-start.rss,
    elapsedMs:Date.now()-started,
    process:process.version,arch:process.arch,platform:process.platform
  };
  console.log('S02_PINNED_HIGH_UNIQUE_MEASURE='+JSON.stringify(result));
  // This is a representative Node-only bounded-encoder budget, not the
  // cross-library/browser/donor/IDB/native cumulative resource guarantee.
  assert.ok(result.heapDeltaPeak<256*1024*1024,result);
  assert.ok(result.rssDeltaPeak<512*1024*1024,result);
});
