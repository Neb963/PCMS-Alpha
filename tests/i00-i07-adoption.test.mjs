import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {continuity,validateAdoptionIntent,verifyOriginal,publicAdoption} from '../src/runtime/adoption.mjs';
globalThis.crypto ??= webcrypto;
const row={slug:'alpha',accountId:'account_0001',personaUid:'persona-01234567',
  accountRevision:3,bindingVersion:2,revision:4,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
const account={accountId:row.accountId,personaUid:row.personaUid,revision:3,
  bindingVersion:2,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',
    bindingVersion:2,principalFingerprint:'a'.repeat(64)}};
const request={slug:'alpha',expectedRevision:4,explicitPublicConsent:true};
const packet={ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
  slug:'alpha',accountId:row.accountId,personaUid:row.personaUid,
  principalFingerprint:account.identity.principalFingerprint,ownerResult:'IS_OWNER',
  visibility:'PUBLIC',remotePublicId:'public_00111',observedAt:11111,
  pjs:'let x=1',html:'<b>Saved</b>',assets:[]};
test('P52-03 public requires explicit scoped consent, current account and revision',()=>{
  assert.equal(validateAdoptionIntent(row,account,request).ok,true);
  assert.equal(validateAdoptionIntent(row,account,{...request,explicitPublicConsent:false}).code,'PUBLIC_ADOPTION_CONSENT_REQUIRED');
  assert.equal(validateAdoptionIntent(row,account,{...request,expectedRevision:3}).code,'STALE_REVISION');
  assert.equal(validateAdoptionIntent({...row,ownerState:'OWNER_DISPUTED'},account,request).code,'OWNER_CONTEXT_UNVERIFIED');
  assert.equal(validateAdoptionIntent(row,{...account,revision:4},request).code,'OWNER_CONTEXT_UNVERIFIED');
  assert.equal(validateAdoptionIntent({...row,visibility:'UNLISTED'},account,request).code,'VISIBILITY_CHANGED');
});
test('P52-03 reused slug, owner rotation and tombstones never inherit adoption',()=>{
  const base={slug:'alpha',accountId:row.accountId,personaUid:row.personaUid,
    bindingVersion:2,remotePublicId:'public_00111'};
  assert.equal(continuity(base,{...base}).ok,true);
  for(const change of [{remotePublicId:'public_00222'},{accountId:'account_0002'},
    {personaUid:'persona-22222222'},{slug:'Alpha'},{bindingVersion:3}])
    assert.equal(continuity(base,{...base,...change}).code,'REASSOCIATION_REQUIRED');
  assert.equal(continuity({...base,archived:true},{...base}).code,'TOMBSTONE_HELD');
});
test('S6-I07-ORIGINAL-ARCHIVE exact source, independent bytes, no contents in UI projection',async()=>{
  const r=await verifyOriginal(packet,row,account);
  assert.equal(r.ok,true);assert.equal(r.files.length,2);
  assert.equal(r.files.find(f=>f.path==='main.pjs').sha256,
    createHash('sha256').update(packet.pjs).digest('hex'));
  assert.match(r.fingerprint,/^[a-f0-9]{64}$/);
  const pub=publicAdoption({slug:'alpha',accountId:row.accountId,visibility:'PUBLIC',
    original:r,revision:1,management:'CONSENTED_ARCHIVE_PENDING'});
  assert.equal(pub.archive,'ARCHIVE_PENDING');
  assert.equal(JSON.stringify(pub).includes(packet.pjs),false);
  assert.equal(JSON.stringify(pub).includes('Saved'),false);
});
test('S6-I07-ORIGINAL-ARCHIVE missing assets, owner changes and corrupt bytes hold',async()=>{
  for(const modification of [{ownerResult:'NOT_OWNER'},{visibility:'UNLISTED'},
    {source:'PAGE_SUPPLIED'},{remotePublicId:null},
    {pjs:9},{assets:[{path:'src/evil.png',base64:'AAAA',size:4,sha256:'0'.repeat(64)}]},
    {assets:[{path:'../escape',base64:'',size:0,sha256:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}]}]){
    const out=await verifyOriginal({...packet,...modification},row,account);
    assert.equal(out.ok,false,JSON.stringify(modification));
  }
  assert.equal((await verifyOriginal({...packet,assets:[{
    path:'src/a.png',base64:'AA==',size:1,
    sha256:createHash('sha256').update(Buffer.from([0])).digest('hex')
  }]},row,account)).ok,true);
});
test('P52-03 noncanonical and visually confusable slugs never authorize adoption',()=>{
  for(const slug of ['A','..','../x','%2f','a/b','αlpha','a b','a--/b'])
    assert.equal(validateAdoptionIntent({...row,slug},account,{...request,slug}).ok,false,slug);
});
