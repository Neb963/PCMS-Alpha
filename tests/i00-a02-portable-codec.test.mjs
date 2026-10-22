import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES,serializeClone,deserializeClone} from '../src/ui/backup-core.mjs';
import {encodePortableArchive,readPortableArchive,framedLines,
  isExcludedCredential} from '../src/runtime/portable-archive.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const baseline=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))});
const donor=()=>({version:1,settings:null,routes:[],personas:[],
  scripts:[],workflows:[],cookies:{},gmValues:{},automationHistory:[]});
async function decode(blob,opts){return readPortableArchive(blob,opts);}
test('A02 portable roundtrip: no password, exact canonical rows and donor',async()=>{
  const pcms=baseline();
  pcms.stores.meta.push({key:'snapshot',value:serializeClone({
    nonAscii:'Zażółć gęślą jaźń',date:new Date('2026-10-22T10:00:00Z'),
    array:new Uint8Array([0,127,255]),nested:{enabled:true}
  })});
  pcms.stores.operations.push({key:'pending_operation',value:serializeClone({
    status:'DISPATCH_POSSIBLE',targetId:'generator_0001',code:'POSSIBLE_WRITE'
  })});
  const built=await encodePortableArchive({pcms,donor:donor(),createdAt:'2026-10-22T00:00:00Z'});
  assert.equal(built.blob.type,'application/x-ndjson');
  assert.ok(built.bytes>0);
  assert.equal(built.rows,2);
  const restored=await decode(built.blob);
  assert.equal(restored.integrity,'FRAME_AND_SOURCE_VERIFIED');
  assert.equal(restored.diskReadback,false);
  assert.equal(JSON.stringify(restored.canonical),JSON.stringify(pcms));
  const typed=deserializeClone(restored.canonical.stores.meta[0].value);
  assert.equal(typed.date.toISOString(),'2026-10-22T10:00:00.000Z');
  assert.deepEqual([...typed.array],[0,127,255]);
  assert.deepEqual(restored.donor,donor());
});
test('A02 corrupt, truncated and reordered frames hold before live mutation',async()=>{
  const pcms=baseline();pcms.stores.entities.push({key:'entity',value:{revision:1}});
  const built=await encodePortableArchive({pcms,donor:donor()});
  const lines=(await built.blob.text()).split('\n').filter(Boolean);
  assert.ok(lines.length>=4);
  const tampered=lines.map((line,i)=>i===1?line.replace('entity','mutant'):line).join('\n')+'\n';
  await assert.rejects(()=>decode(new Blob([tampered])),/PORTABLE_FRAME_DIGEST/);
  await assert.rejects(()=>decode(new Blob([lines.slice(0,-1).join('\n')+'\n'])),
    /PORTABLE_FOOTER_MISSING/);
  const flipped=lines.slice();[flipped[1],flipped[2]]=[flipped[2],flipped[1]];
  await assert.rejects(()=>decode(new Blob([flipped.join('\n')+'\n'])),
    /PORTABLE_FRAME_INVALID|PORTABLE_FRAME_CHAIN|PORTABLE_RECORD_ORDER/);
});
test('A02 credential-bearing canonical meta rows excluded, independent of tokens in user source',async()=>{
  assert.ok(isExcludedCredential('meta','pcmsGitCredential'));
  assert.equal(isExcludedCredential('entities','pcmsGitCredential'),false);
  const pcms=baseline();pcms.stores.meta.push({key:'git:token',value:'fixture-token'});
  await assert.rejects(()=>encodePortableArchive({pcms,donor:donor()}),
    /PORTABLE_SECRET_ROW_PRESENT/);
});
test('A02 streaming decoder handles multi-frame records and keeps records staged until footer',async()=>{
  const pcms=baseline();
  pcms.stores.entities.push({key:'large',value:'x'.repeat(350000)});
  const built=await encodePortableArchive({pcms,donor:donor()});
  assert.ok(built.frames>=5);
  let calls=0;
  const received=await decode(built.blob,{collect:false,onRecord:async item=>{
    assert.ok(item.kind==='donor'||DB_STORES.includes(item.store));calls++;
  }});
  assert.equal(received.canonical,null);
  assert.equal(received.integrity,'FRAME_VERIFIED_SOURCE_NOT_AUDITED');
  assert.equal(received.rows,1);
  assert.equal(calls,2);
  assert.equal((await Array.fromAsync(framedLines(built.blob))).length,built.frames+2);
});

test('A02 streamed staging cannot assert source closure without independent readback',async()=>{
  const pcms=baseline(),built=await encodePortableArchive({pcms,donor:donor()});
  await assert.rejects(()=>readPortableArchive(built.blob,{collect:false,
    auditStaged:async()=>({manifests:99})}),/PORTABLE_SOURCE_CLOSURE/);
  const verified=await readPortableArchive(built.blob,{collect:false,
    auditStaged:async()=>built.sourceAudit});
  assert.equal(verified.integrity,'FRAME_AND_SOURCE_VERIFIED');
  assert.equal(verified.diskReadback,false);
});
