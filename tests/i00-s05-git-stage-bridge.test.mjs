import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {stageReadyGitSource} from '../src/runtime/ready-git-source.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
globalThis.crypto??=webcrypto;
const text=s=>Buffer.from(s).toString('base64');
const files=[{path:'main.pjs',base64:text('ready PJS')},
 {path:'index.html',base64:text('<div>ready</div>')},
 {path:'src/asset.bin',base64:Buffer.from([0,255,128]).toString('base64')}];
const sha='a'.repeat(64),id='rev-bounded001';
const catalog={ok:true,complete:true,source:'PINNED_MAIN_READ_ONLY',
  repositoryId:'1411034835',head:'b'.repeat(40)};
const coherent={ok:true,code:'READY_COHERENT_INPUT_PINNED',
  slug:'source-fixture',legacy:false,token:'bounded001',
  inputFingerprint:sha,pinnedHead:catalog.head,
  files,optionalTesting:{sha256:'c'.repeat(64)}};
const ready={active:{identifier:id,inputFingerprint:sha},desired:null};
const invoke=p=>stageReadyGitSource({catalog,coherent,ready,
  slug:coherent.slug,repositoryId:catalog.repositoryId,...p});
test('S05 READY source maps exact binary PJS/HTML/src without conflating hash domains',async()=>{
 const r=await invoke();
 assert.equal(r.ok,true,JSON.stringify(r));
 const actual=await exactSource(files);
 assert.equal(r.candidate.fingerprint,actual.fingerprint);
 assert.equal(r.source.gitReadyInputFingerprint,sha);
 assert.equal(r.source.fingerprint,sha);
 assert.notEqual(r.source.fingerprint,actual.fingerprint);
 assert.equal(r.source.gitReadyIdentifier,id);
 assert.equal(r.source.testingSha,'c'.repeat(64));
 assert.equal(r.candidate.files.find(x=>x.path==='src/asset.bin').size,3);
});
test('S05 READY source refuses drift, missing bytes and supersession',async()=>{
 for(const changed of [
  {catalog:{...catalog,head:'c'.repeat(40)}},
  {catalog:{...catalog,complete:false}},
  {coherent:{...coherent,inputFingerprint:'d'.repeat(64)}},
  {coherent:{...coherent,files:files.slice(0,1)}},
  {coherent:{...coherent,files:files.map((f,i)=>i===2?
      {...f,path:'../../unsafe.bin'}:f)}},
  {ready:{...ready,desired:{identifier:'rev-newest'}}},
  {ready:{active:{identifier:'rev-other',inputFingerprint:sha}}}
 ])assert.equal((await invoke(changed)).ok,false,JSON.stringify(changed));
});
