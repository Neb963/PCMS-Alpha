import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {compileV2,streamV2Frames,decodeAuthenticatedV2} from '../src/ui/backup-v2-codec.mjs';
import {digest,deserializeClone} from '../src/ui/backup-core.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope}
  from '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const te=new TextEncoder();
const source=async()=>{
  const raw=[['main.pjs',te.encode('output = "persist exact";')],
    ['index.html',te.encode('<h1>Native</h1>')],
    ['src/asset.bin',new Uint8Array([0,255,17,0,42])]];
  const files=await Promise.all(raw.map(async([path,b])=>({
    path,size:b.length,sha256:await digest(b)})));
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const blobs=files.map(f=>({path:f.path,base64:Buffer.from(raw.find(x=>x[0]===f.path)[1]).toString('base64')}));
  const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+files.map(
    f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
  return {ok:true,files,blobs,fingerprint};
};
const empty=()=>({schema:1,stores:{entities:[],operations:[],events:[],meta:[],observations:[]}});
const concat=parts=>{const len=parts.reduce((n,x)=>n+x.length,0),out=new Uint8Array(len);
  let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
async function fixture(){
  const payload=createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}});
  const password='long disposable recovery password';
  const donor=await encodeBackupEnvelope({payload,password});
  const src=await source(),pcms=empty();
  pcms.stores.meta.push({key:'stage:a',value:{record:{
    candidate:src,previous:src,reason:undefined,exactTime:new Date('2020-01-01T00:00:00Z')}}});
  pcms.stores.meta.push({key:'stage-history:a:1',value:{record:{candidate:src,previous:src}}});
  pcms.stores.operations.push({key:'op:one',value:{status:'HELD_UNCERTAIN',legacyBytes:{__pcmsType:'Bytes',
    data:Buffer.from([255,0,3]).toString('base64'),kind:'Uint8Array'}}});
  return {password,donor,pcms};
}
test('S02 frames are deterministic, deduplicate binary assets and losslessly restore historical rows',async()=>{
  const {password,donor,pcms}=await fixture();
  const plan=await compileV2(pcms,donor);
  assert.equal(plan.terminal.uniqueBlobs,3);
  assert.equal(plan.terminal.canonicalRows,3);
  assert.equal(plan.terminal.storeCounts.meta,2);
  const items=[];for await(const piece of streamV2Frames(plan))items.push(piece);
  const encoded=concat(items);
  assert.equal(encoded.length,plan.plaintextBytes);
  const restored=await decodeAuthenticatedV2(encoded,{decodeDonor:decodeBackupEnvelope,password});
  assert.deepEqual(restored.pcms,pcms);
  assert.deepEqual(restored.donor.personas,[]);
  const items2=[];for await(const piece of streamV2Frames(await compileV2(pcms,donor)))items2.push(piece);
  assert.deepEqual(concat(items2),encoded);
});
test('S02 malformed END, missing referenced blob, unknown type, duplicated frames and donor fail closed',async()=>{
  const {password,donor,pcms}=await fixture();
  const plan=await compileV2(pcms,donor);
  const items=[];for await(const part of streamV2Frames(plan))items.push(part);
  const encoded=concat(items);
  for(const mutate of [
    v=>{v[0]=44;},
    v=>{v[v.length-1]^=1;},
    v=>{v[8]=255;},
    v=>v.subarray(0,v.length-1),
    v=>concat([v,new Uint8Array(9)])
  ]){
    await assert.rejects(decodeAuthenticatedV2(mutate(Uint8Array.from(encoded)),
      {decodeDonor:decodeBackupEnvelope,password}),/BACKUP_V2_/);
  }
  await assert.rejects(decodeAuthenticatedV2(encoded,{decodeDonor:decodeBackupEnvelope,
    password:'different valid password'}),/BACKUP_V2_DONOR_AUTH_FAILED/);
});
test('S02 refuses incomplete source, unsupported donor or mutated source bytes before export',async()=>{
  const {pcms,donor}=await fixture();
  await assert.rejects(compileV2(pcms,'{}'),/BACKUP_V2_DONOR_INVALID/);
  const modified=structuredClone(pcms);
  modified.stores.meta[0].value.record.candidate.blobs.pop();
  await assert.rejects(compileV2(modified,donor),/BACKUP_SOURCE_INCOMPLETE/);
  const changed=structuredClone(pcms);
  changed.stores.meta[0].value.record.candidate.blobs[0].base64='AA==';
  await assert.rejects(compileV2(changed,donor),/BACKUP_SOURCE_BYTE_MISMATCH/);
});
