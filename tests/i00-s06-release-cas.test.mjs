import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createReleaseStore} from '../src/runtime/release-store.mjs';
import {approvalTuple} from '../src/runtime/release-core.mjs';
globalThis.crypto??=webcrypto;
const slug='s06-cas-target',D='d'.repeat(64),P='c'.repeat(64);
const data=s=>Buffer.from(s).toString('base64');
async function fixture({readyChanged=false,readyMissing=false,gitChanged=false,
  gitModeChanged=false,gitIdentityChanged=false,gitTestingChanged=false}={}){
 const source=await exactSource([{path:'main.pjs',base64:data('S06 F')},
   {path:'index.html',base64:data('<main>F</main>')}]);
 const previous=await exactSource([{path:'main.pjs',base64:data('')},
   {path:'index.html',base64:data('')}]);
 const stage={slug,accountId:'acct',personaUid:'person',bindingVersion:1,
   accountRevision:1,principalFingerprint:P,remotePublicId:'provider-1',
   revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,nonce:'nonce-1',
   sourceFolder:'generators/'+slug,sourceHead:'b'.repeat(40),
   testingSha:null,candidate:source,previous,
   readyIdentifier:'rev-accepted',readyInputFingerprint:D};
 const job={slug,revision:7,stageRevision:4,sourceFingerprint:source.fingerprint,
   verifiedFinal:source.fingerprint,finalSource:source,state:'TESTS_VERIFIED',
   executionSlotReleased:true,
   native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:D},
   prompt:{revision:1,tests:[]},chat1:{tests:{}},chat2:null};
 const account={accountId:'acct',personaUid:'person',bindingVersion:1,
   revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',
   bindingVersion:1,principalFingerprint:P}};
 const inventory={slug,accountId:'acct',personaUid:'person',
   bindingVersion:1,remoteId:'provider-1',ownerState:'OBSERVED_OWNER',
   visibility:'UNLISTED',revision:1};
 const approved=approvalTuple({slug,stage,job,source,previous,
   git:{ok:true,testingSha:null},kind:'PRIVATE_NEW'});
 assert.equal(approved.ok,true);
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('meta','readwrite');tx.oncomplete=resolve;tx.onabort=reject;
  const m=tx.objectStore('meta');
  m.put({key:'stage:'+slug,record:stage});
  m.put({key:'ai-job:'+slug,job});
  m.put({key:'account:acct',account});
  m.put({key:'inventory:'+slug,generator:inventory});
  if(!readyMissing)m.put({key:'s05-ready:'+slug,record:{slug,active:{
    identifier:readyChanged?'rev-next':stage.readyIdentifier,
    inputFingerprint:D},desired:null,hold:null}});
  m.put({key:'writeback:'+slug,record:{state:'CONFIRMED',
    mode:gitModeChanged?'MANUAL':'S06',
    readyIdentifier:gitIdentityChanged?'rev-foreign':stage.readyIdentifier,
    readyInputFingerprint:stage.readyInputFingerprint,
    testingSha:gitTestingChanged?D:null,
    sourceFingerprint:gitChanged?P:source.fingerprint,
    stageRevision:4,jobRevision:7,commitSha:'e'.repeat(40)}});
 });
 const store=createReleaseStore(db);
 const params={approval:approved,stage,job,account,inventory,source,previous,
   releaseId:'release_'+'a'.repeat(32),kind:'PRIVATE_NEW'};
 return {db,store,params};
}
test('S06 reviewer admission blocks superseded READY and unrelated Git proof atomically',async()=>{
 for(const type of [{readyChanged:true},{readyMissing:true},
    {gitChanged:true},{gitModeChanged:true},
    {gitIdentityChanged:true},{gitTestingChanged:true}]){
  const {db,store,params}=await fixture(type);
  const out=await store.approve(params);
  assert.equal(out.ok,false,JSON.stringify(out));
  assert.equal(db.read('meta','release:'+slug),undefined);
  assert.equal(db.keys('events').length,0);
 }
});
test('S06 current candidate can approve but cannot dispatch after READY changed',async()=>{
 const {db,store,params}=await fixture();
 const approved=await store.approve(params);
 assert.equal(approved.state,'APPROVED',JSON.stringify(approved));
 assert.ok(db.read('meta','release:'+slug)?.release);
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('meta','readwrite');tx.oncomplete=resolve;tx.onabort=reject;
  tx.objectStore('meta').put({key:'s05-ready:'+slug,record:{
    slug,active:{identifier:'rev-other',inputFingerprint:D},desired:null,hold:null}});
 });
 const out=await store.markDispatch(slug,approved.revision,params.approval.tuple);
 assert.equal(out.code,'S06_REVIEW_READY_SUPERSEDED',JSON.stringify(out));
 assert.equal(db.read('meta','release:'+slug).release.state,'APPROVED');
 assert.equal(db.keys('operations').length,0);
});
test('S06 approval never dispenses publication authority from a Git commit',async()=>{
 const {db,store,params}=await fixture();
 const approved=await store.approve(params);
 assert.equal(approved.state,'APPROVED');
 assert.equal(approved.publication,'HELD_OR_UNVERIFIED');
 assert.equal(db.keys('operations').length,0);
});

test('C-53 deferred human work atomically denies any old-F approval even when Git and tests pass',async()=>{
 const {db,store,params}=await fixture();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('meta','readwrite');tx.oncomplete=resolve;tx.onabort=reject;
  tx.objectStore('meta').put({key:'s06-human:'+slug,record:{
    slug,state:'DEFERRED',revision:1,parentStageRevision:params.stage.revision,
    parentJobRevision:params.job.revision,parentFingerprint:params.source.fingerprint}});
 });
 const blocked=await store.approve(params);
 assert.equal(blocked.code,'S06_HUMAN_REVIEW_DEFERRED',JSON.stringify(blocked));
 assert.equal(db.read('meta','release:'+slug),undefined);
 assert.equal(db.keys('operations').length,0);
});
