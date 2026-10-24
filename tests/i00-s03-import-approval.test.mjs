import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {getImportScopeDigest,createImportApprovalStore} from '../src/runtime/catalog-import.mjs';
import {createCatalogBoundary} from '../src/runtime/catalog-boundary.mjs';
globalThis.crypto??=webcrypto;
const repository='Neb963/per-gens',oid='f'.repeat(40);
const row={slug:'sample-1',folder:'generators/sample-1',markerOid:oid,
  ready:true,sourceState:'READY_UNVERIFIED_COHERENCE'};
const snapshot=()=>({ok:true,complete:true,repository,repositoryId:'42',head:'a'.repeat(40),
  rootTreeOid:'b'.repeat(40),generators:[row],recognizedCount:1,
  prompt:{state:'PRESENT',path:'pcms/prompts/default-chat1.md',oid:'c'.repeat(40),text:'approved Git prompt'}});
test('S03 initial approval: canonical atomic human scope and no external effect authorization',async()=>{
  const db=fakeDatabase(),s=createImportApprovalStore(db);
  const cat=snapshot(),scopeDigest=await getImportScopeDigest(cat);
  assert.match(scopeDigest,/^[0-9a-f]{64}$/);
  const args={repository,repositoryId:'42',head:cat.head,
    scopeDigest,recognizedSlugs:['sample-1'],approvalAt:12345};
  assert.equal((await s.get('42')).code,'IMPORT_UNAPPROVED');
  assert.equal((await s.approve(args)).code,'IMPORT_SCOPE_APPROVED_NO_EFFECT');
  const saved=db.read('meta','s03-import-approval:42').approval;
  assert.equal(saved.source,'HUMAN_INITIAL_IMPORT_SCOPE');
  assert.equal(saved.authorizedEffects,'NONE');
  assert.equal(saved.scopeDigest,scopeDigest);
  assert.equal(db.keys('events').length,1);
  assert.equal((await s.approve(args)).code,'IMPORT_ALREADY_APPROVED');
  assert.equal(db.keys('events').length,1);
  assert.equal((await s.approve({...args,scopeDigest:'1'.repeat(64)})).code,
    'IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
  assert.equal(db.keys('events').length,1);
});
test('S03 initial approval: aborted canonical transaction never leaves false approval',async()=>{
  const db=fakeDatabase(),s=createImportApprovalStore(db);
  db.failNextCommit();
  await assert.rejects(s.approve({repository,repositoryId:'42',head:'a'.repeat(40),
    scopeDigest:'9'.repeat(64),recognizedSlugs:['sample-1'],approvalAt:100}));
  assert.equal(db.read('meta','s03-import-approval:42'),undefined);
  assert.equal(db.keys('events').length,0);
});
test('S03 initial approval: independently rechecks material scope and host token; no provider commands',async()=>{
  const db=fakeDatabase(),state=new Map();
  state.set('pcmsS03Git',{repository,repositoryId:'42'});
  const local={get:async key=>state.has(key)?{[key]:state.get(key)}:{},
    set:async values=>{for(const [k,v] of Object.entries(values))state.set(k,v);},
    remove:async key=>state.delete(key)};
  const api={runtime:{id:'local-test',getURL:path=>'moz-extension://fixture/'+path},
    storage:{local}};
  const sender={id:'local-test',url:'moz-extension://fixture/pcms/index.html'};
  let current=snapshot(),nativeGets=0,observedRequests=[];
  const boundary=createCatalogBoundary(api,{
    open:async()=>db,
    native:async request=>{
      observedRequests.push(request);
      nativeGets++;return {ok:true,credential:'test-token-isolated-1234'};},
    scan:async({repository:actual,token})=>{
      assert.equal(actual,repository);
      assert.equal(token,'test-token-isolated-1234');
      return current;}
  });
  const initially=await boundary.run({type:'SCAN_CONNECTED'},sender);
  assert.equal(initially.importStatus,'IMPORT_SCOPE_UNAPPROVED');
  assert.equal(initially.preview.approved,false);
  const params={repositoryId:'42',scopeDigest:initially.preview.scopeDigest,planDigest:initially.preview.planDigest,expectedRevision:initially.approvalRevision};
  current={...snapshot(),generators:[{...row,markerOid:'8'.repeat(40)}]};
  const changed=await boundary.run({type:'APPROVE_IMPORT',params},sender);
  assert.equal(changed.code,'IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
  assert.equal(db.keys('events').length,0);
  current=snapshot();
  const accepted=await boundary.run({type:'APPROVE_IMPORT',params},sender);
  assert.equal(accepted.code,'IMPORT_SCOPE_APPROVED_NO_EFFECT',JSON.stringify(accepted));
  assert.equal(accepted.approval.authorizedEffects,'NONE');
  assert.equal((await boundary.run({type:'SCAN_CONNECTED'},sender)).importStatus,'IMPORT_SCOPE_APPROVED');
  assert.equal((await boundary.run({type:'APPROVE_IMPORT',
    params:{...params,repositoryId:'99'}},sender)).code,'GIT_IDENTITY_CHANGED');
  assert.equal(db.keys('events').length,1);
  assert.ok(nativeGets>=3);
  assert.deepEqual([...new Set(observedRequests.map(x=>x.action))],['git.get']);
});
