import {decodeV2InactiveFrames} from '../src/ui/restore-v2-stream-decode.mjs';
import {scanV2AuthenticatedFrames} from '../src/ui/restore-v2-frame-scanner.mjs';
import {prepareInactiveV2} from '../src/ui/restore-v2-prep.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {compileV2,streamV2Frames,decodeAuthenticatedV2} from '../src/ui/backup-v2-codec.mjs';
import {digest,serializeClone} from '../src/ui/backup-core.mjs';
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
  pcms.stores.meta.push({key:'stage:a',value:serializeClone({record:{
    candidate:src,previous:src,reason:undefined,exactTime:new Date('2020-01-01T00:00:00Z')}})});
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
  // Encoded rows use deterministic lexical key order; original IndexedDB
  // fixture insertion order and null prototypes are not wire identity.
  const normal=v=>JSON.parse(JSON.stringify(v));
  const sorted=normal(pcms);
  for(const store of Object.values(sorted.stores))store.sort((a,b)=>
    JSON.stringify(a.key)<JSON.stringify(b.key)?-1:
    JSON.stringify(a.key)>JSON.stringify(b.key)?1:0);
  assert.deepEqual(normal(restored.pcms),sorted);
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
test('S02 bytes retain exact SHA256 across Firefox-like JS realm boundaries',async()=>{
  const cross=runInNewContext('new Uint8Array([0,255,1,0,42])');
  assert.equal(cross instanceof Uint8Array,false,'assert actual realm boundary');
  assert.equal(ArrayBuffer.isView(cross),true);
  const one=await digest(cross);
  const two=await digest(new Uint8Array([0,255,1,0,42]));
  assert.equal(one,two,'never hash typed-array string representation');
  assert.notEqual(one,await digest('0,255,1,0,42'));
});

test('S02 inactive v2 source recovery preserves history, remaps persona and rejects imported effect authority',async()=>{
  const {pcms,donor,password}=await fixture();
  const source=pcms.stores.meta[1].value.record.candidate;
  pcms.stores.meta.push({key:'account:old',value:{key:'account:old',account:{
    accountId:'old',personaUid:'persona-old',revision:1,state:'VERIFIED',
    bindingVersion:1,identity:{principal:'historical'},override:{enabled:true}
  }}});
  pcms.stores.meta.push({key:'inventory:old',value:{key:'inventory:old',
    generator:{accountId:'old',personaUid:'persona-old',ownerVerified:true,
      ownerState:'VERIFIED',source:'READY',approval:'not-portable'}}});
  pcms.stores.meta.push({key:'release:old',value:{key:'release:old',
    release:{sealedSource:source,previousSource:source,state:'PUBLISHED',
      approval:{exactSource:'historical'},dispatchPossible:true}}});
  pcms.stores.operations[0].value.status='DISPATCH_POSSIBLE';
  const plan=await compileV2(pcms,donor),parts=[];
  for await(const block of streamV2Frames(plan))parts.push(block);
  const plain=concat(parts),receipt='a'.repeat(64);
  const destination=empty();
  const prepared=await prepareInactiveV2({authenticatedPlaintext:plain,
    readback:{state:'AUTHENTICATED_SECOND_PASS',sha256:receipt},
    expectedCiphertextSha256:receipt,
    currentPcms:destination,decodeDonor:decodeBackupEnvelope,password,mode:'replace',
    uidRemap:{'persona-old':'persona-new'}});
  const rows=new Map(prepared.prepared.stores.meta.map(row=>[row.key,row.value]));
  assert.equal(rows.get('account:old').account.personaUid,'persona-new');
  assert.equal(rows.get('account:old').account.state,'VERIFICATION_PENDING');
  assert.equal(rows.get('account:old').account.identity,null);
  assert.equal(rows.get('inventory:old').generator.personaUid,'persona-new');
  assert.equal(rows.get('inventory:old').generator.ownerVerified,false);
  assert.equal(rows.get('release:old').release.approval,null);
  assert.equal(rows.get('release:old').release.state,'RESTORE_REVIEW_REQUIRED');
  assert.equal(prepared.prepared.stores.operations[0].value.status,'HELD_UNCERTAIN');
  assert.equal(rows.get('stage-history:a:1').record.candidate.blobs[2].base64,
    source.blobs[2].base64);
  assert.equal(prepared.activation,'OFF');
  await assert.rejects(prepareInactiveV2({authenticatedPlaintext:plain,
    readback:{state:'AUTHENTICATED_SECOND_PASS',sha256:receipt},
    expectedCiphertextSha256:receipt,currentPcms:destination,
    decodeDonor:decodeBackupEnvelope,password,mode:'replace',uidRemap:{}}),
    /RESTORE_UID_MAPPING_MISSING/);
});

test('S02 bounded frame-stream decoder fully restores source and encrypted donor across 1-byte cuts',async()=>{
  const {pcms,donor,password}=await fixture();
  const plan=await compileV2(pcms,donor),chunks=[];
  for await(const bytes of streamV2Frames(plan))chunks.push(bytes);
  const encoded=concat(chunks);
  async function* split(data){
    for(let i=0;i<data.length;i+=1)yield data.subarray(i,i+1);
  }
  const observed=await decodeV2InactiveFrames(
    scanV2AuthenticatedFrames(split(encoded)),{
      password,decodeDonor:decodeBackupEnvelope});
  assert.equal(observed.status,'AUTHENTICATED_INACTIVE_DECODED_NOT_APPLIED');
  assert.equal(observed.inventory.uniqueBlobs,3);
  assert.equal(observed.sourceAudit.uniqueBlobs,3);
  const previous=await decodeAuthenticatedV2(encoded,{
    password,decodeDonor:decodeBackupEnvelope});
  assert.deepEqual(observed.pcms,previous.pcms);
  assert.deepEqual(observed.donor,previous.donor);
  await assert.rejects(decodeV2InactiveFrames(
    scanV2AuthenticatedFrames(split(encoded)),{
      password:'wrong-but-valid-secret',decodeDonor:decodeBackupEnvelope}),
      /RESTORE_V2_DONOR_AUTH_FAILED/);
});

test('S02 canonical numeric grammar preserves negative zero and rejects nonfinite structured-clone values',async()=>{
  const {password,donor,pcms}=await fixture();
  pcms.stores.operations.push({key:'numeric',value:{
    negativeZero:-0,positiveZero:0,large:1e21,tiny:1e-7,
    decimal:0.000001,integer:9007199254740991
  }});
  const plan=await compileV2(pcms,donor),parts=[];
  for await(const part of streamV2Frames(plan))parts.push(part);
  const opened=await decodeAuthenticatedV2(concat(parts),{
    password,decodeDonor:decodeBackupEnvelope});
  const numerical=opened.pcms.stores.operations.find(x=>x.key==='numeric').value;
  assert.deepEqual(numerical.negativeZero,{__pcmsType:'NumberNegativeZero'});
  assert.equal(numerical.positiveZero,0);
  assert.equal(numerical.large,1e21);
  assert.equal(numerical.tiny,1e-7);
  const receipt='d'.repeat(64);
  const prepared=await prepareInactiveV2({
    authenticatedPlaintext:concat(parts),
    readback:{state:'AUTHENTICATED_SECOND_PASS',sha256:receipt},
    expectedCiphertextSha256:receipt,
    currentPcms:empty(),mode:'replace',password,
    decodeDonor:decodeBackupEnvelope
  });
  const record=prepared.prepared.stores.operations.find(x=>x.key==='numeric').value;
  assert.equal(Object.is(record.negativeZero,-0),true);
  assert.equal(Object.is(record.positiveZero,-0),false);
  for(const invalid of [NaN,Infinity,-Infinity]){
    const bad=structuredClone(pcms);
    bad.stores.operations[1].value.negativeZero=invalid;
    await assert.rejects(compileV2(bad,donor),/BACKUP_UNSUPPORTED_VALUE/);
  }
});
test('S02 oversized valid canonical record holds before native dispatch and never truncates history',async()=>{
  const {pcms,donor}=await fixture();
  const many='L'.repeat(4*1024*1024+200);
  pcms.stores.meta.push({key:'meta:oversized-but-valid',
    value:{humanNotes:many,history:['original','previous-good']}});
  await assert.rejects(compileV2(pcms,donor),/BACKUP_V2_CANONICAL_LIMIT/);
  assert.equal(pcms.stores.meta.at(-1).value.humanNotes.length,many.length);
});
test('S02 archive and inactive apply preserve original exit exclusions/removal/uncertainty evidence',async()=>{
  const {pcms,donor,password}=await fixture();
  const exit={key:'network:s01:exit-ownership-v1',schema:2,revision:8,
    owners:{'IPv4:198.19.11.1':'account-old'},
    bindings:{'binding-old':{bindingId:'binding-old',accountId:'account-old',
      pin:'HELD',routeId:'route-old',lastObservedAt:120}}};
  const removal={key:'removal:account-old',state:'REMOVED_ONLY_LOCALLY',
    personaUid:'legacy-persona-uid',revision:11,
    excludedOnRestore:true,when:'historical'};
  const lost={key:'op-uncertain',status:'DISPATCH_POSSIBLE',
    effect:{kind:'CREATE',providerReceipt:'UNKNOWN',retryCount:0}};
  pcms.stores.meta.push({key:exit.key,value:exit});
  pcms.stores.meta.push({key:removal.key,value:removal});
  pcms.stores.operations.push({key:'op-uncertain',value:lost});
  const plan=await compileV2(pcms,donor),pieces=[];
  for await(const p of streamV2Frames(plan))pieces.push(p);
  const receipt='e'.repeat(64);
  const result=await prepareInactiveV2({
    authenticatedPlaintext:concat(pieces),
    readback:{state:'AUTHENTICATED_SECOND_PASS',sha256:receipt},
    expectedCiphertextSha256:receipt,password,
    decodeDonor:decodeBackupEnvelope,currentPcms:empty(),mode:'replace'});
  const meta=new Map(result.prepared.stores.meta.map(row=>[row.key,row.value]));
  assert.deepEqual(meta.get(exit.key),exit);
  assert.deepEqual(meta.get(removal.key),removal);
  const oldOp=result.prepared.stores.operations.find(x=>x.key==='op-uncertain').value;
  assert.equal(oldOp.status,'HELD_UNCERTAIN');
  assert.deepEqual(oldOp.effect,lost.effect);
  assert.equal(result.activation,'OFF');
});
