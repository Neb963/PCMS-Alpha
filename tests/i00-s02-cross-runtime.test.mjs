// Integration: real JS source+donor frame encoder -> maintained Python GCM
// writer -> independently reopened native inventory -> WebCrypto decrypt ->
// checked production v2 source/donor restorer. D only (disposable filesystem).
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {compileV2,streamV2Frames,decodeAuthenticatedV2} from '../src/ui/backup-v2-codec.mjs';
import {digest} from '../src/ui/backup-core.mjs';
import {prepareInactiveV2} from '../src/ui/restore-v2-prep.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope}
 from '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function concat(parts){const size=parts.reduce((n,v)=>n+v.length,0),out=new Uint8Array(size);
  let pos=0;for(const part of parts){out.set(part,pos);pos+=part.length;}return out;}
test('S02 actual JS source frames survive native encrypted disk and two independently verified crypto passes',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'pcms-s02-cross-'));
  try{
    const password='S02 cross runtime test secret',destination=path.join(temp,'archive.encrypted');
    const raw=[['main.pjs',new TextEncoder().encode('out="full source"')],
      ['index.html',new TextEncoder().encode('<b>full page</b>')],
      ['src/opaque.bin',Uint8Array.from([0,255,4,7,8,0])]];
    const files=await Promise.all(raw.map(async([p,body])=>({
      path:p,size:body.length,sha256:await digest(body)})));
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    const blobs=files.map(f=>({path:f.path,base64:Buffer.from(raw.find(v=>v[0]===f.path)[1]).toString('base64')}));
    const manifest={ok:true,files,blobs,fingerprint:await digest('PCMS_STAGED_SOURCE_V1\n'+
      files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'))};
    const pcms={schema:1,stores:{entities:[],operations:[{key:'possible',
      value:{state:'HELD_UNCERTAIN',source:manifest.fingerprint}}],events:[],
      meta:[{key:'stage:original',value:{record:{candidate:manifest,previous:manifest}}}],
      observations:[]}};
    const portable=createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}});
    const donor=await encodeBackupEnvelope({payload:portable,password});
    const compiled=await compileV2(pcms,donor);
    const chunks=[];for await(const frag of streamV2Frames(compiled))chunks.push(frag);
    const plain=concat(chunks);
    assert.equal(plain.length,compiled.plaintextBytes);
    const script=[
      'import sys,json',
      'from native.backup_stream_v2 import EncryptedWriter,verify_two_pass,BUFFER',
      'raw=sys.stdin.buffer.read()',
      'w=EncryptedWriter(sys.argv[1],sys.argv[2],len(raw),_test_entropy=(bytes(range(16)),bytes(range(12))))',
      'for i in range(0,len(raw),BUFFER):w.append(raw[i:i+BUFFER])',
      'w.finish()',
      'print(json.dumps(verify_two_pass(sys.argv[1],sys.argv[2]),sort_keys=True))'
    ].join('\n');
    const run=spawnSync('python3',['-c',script,destination,password],
      {cwd:root,input:Buffer.from(plain),encoding:null,timeout:60000,maxBuffer:4*1024*1024});
    assert.equal(run.error,undefined);
    assert.equal(run.status,0,run.stderr?.toString());
    const proof=JSON.parse(run.stdout.toString());
    assert.equal(proof.status,'AUTHENTICATED_SOURCE_INVENTORY');
    assert.equal(proof.uniqueBlobs,3);
    assert.equal(proof.canonicalRows,2);
    const ciphertext=await readFile(destination);
    assert.equal(ciphertext.includes(Buffer.from('full source')),false);
    const header=ciphertext.subarray(0,50);
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),
      'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({
      name:'PBKDF2',iterations:250000,hash:'SHA-256',
      salt:header.subarray(14,30)
    },base,{name:'AES-GCM',length:256},false,['decrypt']);
    const actual=new Uint8Array(await crypto.subtle.decrypt({
      name:'AES-GCM',iv:header.subarray(30,42),additionalData:header,tagLength:128
    },key,ciphertext.subarray(50)));
    assert.deepEqual(actual,plain);
    const opened=await decodeAuthenticatedV2(actual,{password,decodeDonor:decodeBackupEnvelope});
    assert.equal(opened.pcms.stores.meta[0].value.record.candidate.blobs[2].base64,
      blobs[2].base64);
    assert.equal(opened.pcms.stores.operations[0].value.state,'HELD_UNCERTAIN');
    assert.equal(opened.donor.personas.length,0);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('S02 native fixed-purpose host readback -> real v2 inactive sanitizer without activation',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'pcms-s02-restore-'));
  try{
    const password='S02 private disposable restore password';
    const sourceText='output = "restore exact"';
    const sourceBytes=new TextEncoder().encode(sourceText);
    const rootBytes=new TextEncoder().encode('<b>page</b>');
    const records=[['main.pjs',sourceBytes],['index.html',rootBytes],
      ['src/asset.bin',Uint8Array.from([0,255,8,3])]];
    const files=await Promise.all(records.map(async([name,bytes])=>({
      path:name,size:bytes.length,sha256:await digest(bytes)})));
    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
    const blobs=files.map(f=>({path:f.path,base64:Buffer.from(records.find(x=>x[0]===f.path)[1]).toString('base64')}));
    const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+files.map(
      f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
    const source={ok:true,fingerprint,files,blobs};
    const current={schema:1,stores:{entities:[],operations:[],events:[],meta:[],observations:[]}};
    const incoming=structuredClone(current);
    incoming.stores.meta.push({key:'stage:alpha',value:{record:{candidate:source,previous:source}}});
    incoming.stores.operations.push({key:'uncertain',value:{status:'HELD_UNCERTAIN'}});
    const portable=createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}});
    const donor=await encodeBackupEnvelope({payload:portable,password});
    const compiled=await compileV2(incoming,donor);
    const pieces=[];for await(const p of streamV2Frames(compiled))pieces.push(p);
    const raw=concat(pieces);
    const script=[
      'import sys,json,base64,hashlib',
      'from native.backup_v2_host import V2ArchiveHost',
      'from native.backup_stream_v2 import BUFFER',
      'data=sys.stdin.buffer.read()',
      'h=V2ArchiveHost(sys.argv[1],lambda:sys.argv[2])',
      "run='s02_'+'c'*32",
      "cut='a'*64",
      "assert h.action(dict(action='export.begin',runId=run,cutDigest=cut,expectedPlaintextBytes=len(data),keyRef='portable-recovery'))['ok']",
      'for seq,i in enumerate(range(0,len(data),BUFFER)):',
      ' part=data[i:i+BUFFER]',
      " assert h.action(dict(action='export.append',runId=run,sequence=seq,bytes=base64.b64encode(part).decode(),sha256=hashlib.sha256(part).hexdigest()))['ok']",
      'count=(len(data)+BUFFER-1)//BUFFER',
      "assert h.action(dict(action='export.finish',runId=run,sequence=count,cutDigest=cut))['ok']",
      "start=h.action(dict(action='restore.begin',runId=run,keyRef='portable-recovery'))",
      "assert start['ok'],start",
      'chunks=[];seq=0',
      'while True:',
      " result=h.action(dict(action='restore.read',runId=run,sequence=seq))",
      " assert result['ok'],result",
      " chunks.append(result['bytes'])",
      " if result['complete']:break",
      ' seq+=1',
      "print(json.dumps(dict(readback=result,plaintext=base64.b64encode(b''.join(base64.b64decode(x) for x in chunks)).decode()),separators=(',',':')))",
      'h.close()'
    ].join('\n');
    const run=spawnSync('python3',['-c',script,temp,password],
      {cwd:root,input:Buffer.from(raw),timeout:60000,maxBuffer:10*1024*1024});
    assert.equal(run.status,0,run.stderr?.toString());
    const output=JSON.parse(run.stdout.toString());
    assert.equal(output.readback.state,'AUTHENTICATED_SECOND_PASS');
    const decoded=new Uint8Array(Buffer.from(output.plaintext,'base64'));
    assert.deepEqual(decoded,raw);
    const prep=await prepareInactiveV2({authenticatedPlaintext:decoded,
      readback:output.readback,expectedCiphertextSha256:output.readback.sha256,
      password,decodeDonor:decodeBackupEnvelope,currentPcms:current,mode:'replace'});
    assert.equal(prep.status,'INACTIVE_PREPARED_NOT_APPLIED');
    assert.equal(prep.controller,'RESTORE_HELD');
    assert.equal(prep.activation,'OFF');
    assert.equal(prep.prepared.stores.meta[0].value.record.candidate.blobs[2].base64,
      blobs[2].base64);
    assert.equal(prep.prepared.stores.operations[0].value.status,'HELD_UNCERTAIN');
    await assert.rejects(prepareInactiveV2({authenticatedPlaintext:decoded,
      readback:{...output.readback,sha256:'0'.repeat(64)},
      expectedCiphertextSha256:output.readback.sha256,
      password,decodeDonor:decodeBackupEnvelope,currentPcms:current}),
      /RESTORE_V2_AUTHENTICATED_SOURCE_REQUIRED/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
