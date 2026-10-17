import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileV2,streamV2Frames,decodeAuthenticatedV2} from '../src/ui/backup-v2-codec.mjs';
import {digest,DB_STORES} from '../src/ui/backup-core.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from
  '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const enc=new TextEncoder();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const passphrase='synthetic-only-50-1000-password';
const concat=parts=>{
  const size=parts.reduce((sum,part)=>sum+part.byteLength,0),result=new Uint8Array(size);
  let cursor=0;
  for(const part of parts){result.set(part,cursor);cursor+=part.byteLength;}
  return result;
};
async function source(){
  const values=[['main.pjs',enc.encode('output="fleet exact";')],
    ['index.html',enc.encode('<h1>fleet</h1>')],
    ['src/shared.bin',Uint8Array.from([0,254,255,6,0,17])]];
  const files=await Promise.all(values.map(async([path,bytes])=>({
    path,size:bytes.length,sha256:await digest(bytes)
  })));
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const blobs=files.map(f=>({path:f.path,base64:Buffer.from(
    values.find(x=>x[0]===f.path)[1]).toString('base64')}));
  const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+
    files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
  return {ok:true,files,blobs,fingerprint};
}
test('S02 synthetic 50 account / 1000 source-bearing row fleet: no missing history or duplicate payload',async()=>{
  const stamp=Date.now(),before=process.memoryUsage().heapUsed;
  const candidate=await source(),pcms={schema:1,stores:Object.fromEntries(
    DB_STORES.map(x=>[x,[]]))};
  for(let i=0;i<50;i++)pcms.stores.meta.push({
    key:'account:synthetic-'+i,value:{account:{state:'VERIFICATION_PENDING',
      accountId:'account-'+i}}});
  for(let i=0;i<1000;i++)pcms.stores.meta.push({
    key:'stage-history:synthetic-'+i,value:{record:{
      candidate,previous:candidate,run:'held-history-'+i}}});
  const donor=await encodeBackupEnvelope({
    payload:createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}}),
    password:passphrase
  });
  const plan=await compileV2(pcms,donor);
  assert.equal(plan.terminal.canonicalRows,1050);
  assert.equal(plan.terminal.uniqueBlobs,3,'dedup never loses source manifest references');
  assert.equal(plan.terminal.storeCounts.meta,1050);
  assert.equal(plan.refs.length,3);
  let total=0,fragments=0,peak=0;
  const plaintextFragments=[];
  for await(const data of streamV2Frames(plan)){
    assert.ok(data.length<=65536);
    total+=data.length;fragments++;
    peak=Math.max(peak,data.length);
    plaintextFragments.push(data);
  }
  assert.equal(total,plan.plaintextBytes);
  // Disposable D-tier filesystem readback: actual source-bearing 1,000-record
  // GCM encryption, two independent native decrypt/inventory passes and
  // WebCrypto cross-runtime decryption, then full JS donor/source restoration.
  const folder=await mkdtemp(path.join(tmpdir(),'pcms-s02-1000-'));
  let diskProof,restoredRows=0;
  try{
    const destination=path.join(folder,'source-heavy.encrypted');
    const python=[
      'import sys,json',
      'from native.backup_stream_v2 import EncryptedWriter,verify_two_pass,BUFFER',
      'raw=sys.stdin.buffer.read()',
      'w=EncryptedWriter(sys.argv[1],sys.argv[2],len(raw))',
      'for pos in range(0,len(raw),BUFFER):w.append(raw[pos:pos+BUFFER])',
      'w.finish()',
      'print(json.dumps(verify_two_pass(sys.argv[1],sys.argv[2])))'
    ].join('\n');
    const sealed=spawnSync('python3',['-c',python,destination,passphrase],{
      cwd:root,input:Buffer.from(concat(plaintextFragments)),
      timeout:60000,encoding:'utf8',maxBuffer:2*1024*1024});
    assert.equal(sealed.error,undefined);
    assert.equal(sealed.status,0,sealed.stderr);
    diskProof=JSON.parse(sealed.stdout);
    assert.equal(diskProof.status,'AUTHENTICATED_SOURCE_INVENTORY');
    assert.equal(diskProof.canonicalRows,1050);
    assert.equal(diskProof.uniqueBlobs,3);
    const ciphertext=await readFile(destination),header=ciphertext.subarray(0,50);
    const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),
      'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',
      iterations:250000,salt:header.subarray(14,30)},material,
      {name:'AES-GCM',length:256},false,['decrypt']);
    const opened=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',
      iv:header.subarray(30,42),additionalData:header,tagLength:128},
      key,ciphertext.subarray(50)));
    assert.deepEqual(opened,concat(plaintextFragments));
    const restored=await decodeAuthenticatedV2(opened,{
      password:passphrase,decodeDonor:decodeBackupEnvelope});
    restoredRows=restored.pcms.stores.meta.length;
    assert.equal(restoredRows,1050);
    assert.equal(restored.pcms.stores.meta.filter(row=>
      row.key.startsWith('stage-history:')).length,1000);
    assert.equal(restored.pcms.stores.meta.find(row=>
      row.key==='stage-history:synthetic-999').value.record.candidate.blobs[2].base64,
      candidate.blobs[2].base64);
  }finally{await rm(folder,{recursive:true,force:true});}
  const stats={accounts:50,records:1000,rows:plan.terminal.canonicalRows,
    blobCount:3,streamBytes:total,fragments,maxFragmentBytes:peak,
    restoredRows,nativeDiskInventory:diskProof.status,
    elapsedMs:Date.now()-stamp,heapDeltaBytes:process.memoryUsage().heapUsed-before};
  console.log('S02_D_SYNTHETIC_SOURCE_FLEET='+JSON.stringify(stats));
});
