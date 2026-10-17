// S02 independent interoperability: native maintained-library AES-GCM archive
// must decrypt with Firefox/Node WebCrypto, including authenticated AAD/header.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headerLength = 50;
test('S02 native GCM stream is independently decrypted by WebCrypto, header/tag tamper denied', async () => {
  const dir=await mkdtemp(path.join(tmpdir(),'pcms-s02-vector-'));
  try {
    const target=path.join(dir,'vector.pcms'),secret='S02 disposable test passphrase';
    const source=Uint8Array.from([0,255,16,42,33,0,127,10,11,12,13,14,251]);
    const py=[
      'import base64,sys',
      'from native.backup_stream_v2 import EncryptedWriter',
      'data=base64.b64decode(sys.argv[3])',
      'w=EncryptedWriter(sys.argv[1],sys.argv[2],len(data),',
      ' _test_entropy=(bytes(range(16)),bytes(range(12))))',
      'for i in range(0,len(data),3): w.append(data[i:i+3])',
      'w.finish()'
    ].join('\n');
    const result=spawnSync('python3',['-c',py,target,secret,
      Buffer.from(source).toString('base64')],{
      cwd:root,encoding:'utf8',timeout:30000
    });
    assert.equal(result.error,undefined,'native Python interpreter available');
    assert.equal(result.status,0,result.stderr);
    const raw=await readFile(target);
    const header=raw.subarray(0,headerLength);
    assert.equal(header.subarray(0,8).toString('hex'), '50434d53424b3200');
    assert.equal(header[8],2);
    assert.equal(header[9],1);
    assert.equal(header.readUInt32BE(10),250000);
    assert.equal(Number(header.readBigUInt64BE(42)),source.length);
    const basis=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
      'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({
      name:'PBKDF2',salt:header.subarray(14,30),
      hash:'SHA-256',iterations:250000
    },basis,{name:'AES-GCM',length:256},false,['decrypt']);
    const opts={name:'AES-GCM',iv:header.subarray(30,42),
      additionalData:header,tagLength:128};
    const decrypted=new Uint8Array(await crypto.subtle.decrypt(opts,key,
      raw.subarray(headerLength)));
    assert.deepEqual([...decrypted],[...source]);
    for (const index of [8,10,42,headerLength,raw.length-1]) {
      const bad=Buffer.from(raw);
      bad[index]^=1;
      await assert.rejects(crypto.subtle.decrypt({
        ...opts,additionalData:bad.subarray(0,headerLength)
      },key,bad.subarray(headerLength)));
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
