import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource,diffSource,editorAdmission,verifyReadback} from '../src/runtime/staging-core.mjs';
globalThis.crypto??=webcrypto;
const b=s=>Buffer.from(s).toString('base64');
const binary=bytes=>Buffer.from(bytes).toString('base64');
const files=()=>[
  {path:'main.pjs',base64:b('line 1\n')},
  {path:'index.html',base64:b('<div>test</div>')},
  {path:'src/nested/blob.bin',base64:binary([0,255,1,2])},
  {path:'src/empty.txt',base64:''}];
const target={slug:'stage-one',accountId:'account_001',personaUid:'persona_001',
  principalFingerprint:'a'.repeat(64),remotePublicId:'public_001'};
function response(data){
  return {ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',...target,
    ownerResult:'IS_OWNER',visibility:'UNLISTED',
    pjs:'line 1\n',html:'<div>test</div>',
    assets:data.slice(2)};
}
test('P52-04/S6-I09-FULL-SOURCE: canonical binary, empty and diff deletion',async()=>{
  const good=await exactSource(files());
  assert.equal(good.ok,true);
  assert.equal(good.files.length,4);
  assert.equal((await verifyReadback(good,response(files()),target)).fingerprint,good.fingerprint);
  const omitted=await verifyReadback(good,response(files().slice(0,3)),target);
  assert.equal(omitted.ok,false);
  assert.deepEqual(omitted.paths,['src/empty.txt']);
  const corrupted=files();
  corrupted[2]={...corrupted[2],base64:binary([0,255,1,3])};
  assert.equal((await verifyReadback(good,response(corrupted),target)).code,'SOURCE_UNVERIFIED');
  const prior=await exactSource(files().slice(0,3));
  assert.deepEqual(diffSource(good,prior).changes,[{path:'src/empty.txt',kind:'DELETED'}]);
  assert.notEqual((await exactSource(corrupted)).fingerprint,good.fingerprint);
});
test('P52-04: hostile path/case-fold ambiguity/header-only checksum, size and untrusted reply',async()=>{
  for(const path of ['src/../data','src/a/./b','SRC/foo','src/x\\y','src/evil.','src/é']){
    assert.equal((await exactSource([...files(),{path,base64:b('x')}])).ok,false,path);
  }
  assert.equal((await exactSource([...files(),{path:'src/EMPTY.txt',base64:''}])).code,'SOURCE_PATH_UNVERIFIED');
  assert.equal((await exactSource(files().map((f,i)=>i===2?{...f,size:4,sha256:'a'.repeat(64)}:f))).code,'SOURCE_BYTE_MISMATCH');
  const good=await exactSource(files());
  assert.equal((await verifyReadback(good,{...response(files()),ownerResult:'IS_NOT_OWNER'},target)).code,'SOURCE_READBACK_UNTRUSTED');
  assert.equal((await verifyReadback(good,{...response(files()),visibility:'PUBLIC'},target)).code,'SOURCE_READBACK_UNTRUSTED');
});
test('P51-05/P52-07: dirty, unknown, collaboration and stale tab never authorize mutation',()=>{
  const clean={dirty:false,srcDirty:false,savePending:false,collaboration:'ABSENT',
    owner:'PCMS',status:'PROVEN_CLEAN'};
  const tab={tabId:123,cookieStoreId:'firefox-container-1',
    ownershipNonce:'nonce_00000001',location:'https://perchance.org/stage-one#edit'};
  const args={slug:'stage-one',expectedSlug:'stage-one',editor:clean,tab,
    expectedTab:tab,sourceFingerprint:'c'.repeat(64),expectedFingerprint:'c'.repeat(64)};
  assert.equal(editorAdmission(args).ok,true);
  for(const override of [{dirty:true},{srcDirty:true},{savePending:true},
    {collaboration:'UNKNOWN'},{collaboration:'ACTIVE'},{owner:'HUMAN'},
    {status:'PROBABLY_CLEAN'}])
    assert.equal(editorAdmission({...args,editor:{...clean,...override}}).ok,false);
  for(const override of [{tabId:124},{ownershipNonce:'recycled'},{location:'https://perchance.org/other#edit'}])
    assert.equal(editorAdmission({...args,tab:{...tab,...override}}).ok,false);
  assert.equal(editorAdmission({...args,sourceFingerprint:'b'.repeat(64)}).code,'SOURCE_DRIFT');
});
