import test from 'node:test';
import assert from 'node:assert/strict';
import {createReadyIntake} from '../src/runtime/ready-intake.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {fakeDatabase} from './fake-idb.mjs';
import {createImportApprovalStore,getImportScopeDigest} from '../src/runtime/catalog-import.mjs';
function harness({maxPerWake=16,inspect}={}){
  const db=fakeDatabase();
  const state={pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'1411034835'}};
  const storage={async get(k){return {[k]:state[k]};},
    async set(rows){Object.assign(state,rows);}};
  const api={storage:{local:storage}};
  const saw=[];
  const run=createReadyIntake(api,{open:async()=>db,maxPerWake,
    inspect:inspect|| (async ({slug,pinnedHead})=>{
      saw.push({slug,pinnedHead});
      return {ok:true,code:'READY_COHERENT_INPUT_PINNED',
        declarationCommit:'1'.repeat(40),markerOid:'2'.repeat(40),
        inputFingerprint:'a'.repeat(64),token:'rev00001',legacy:false,
        optionalTesting:{state:'ABSENT',oid:null}};
    })}).run;
  const catalog=(n,head='b'.repeat(40))=>({ok:true,complete:true,
    source:'PINNED_MAIN_READ_ONLY',recognizedCount:n,
    repository:'Neb963/per-gens',repositoryId:'1411034835',head,
    generators:Array.from({length:n},(_,i)=>({
      slug:'safe-'+String(i).padStart(4,'0'),ready:true}))});
  const invoke=c=>run({catalog:c,repository:'Neb963/per-gens',
    token:'fixture-token-12345',transport:()=>{throw Error('unwanted network');}});
  async function approve(input){
    const scopeDigest=await getImportScopeDigest(input);
    return createImportApprovalStore(db).approve({repository:input.repository,
      repositoryId:input.repositoryId,head:input.head,scopeDigest,
      recognizedSlugs:input.generators.map(g=>g.slug),approvalAt:Date.now()});
  }
  return {db,state,saw,storage,run,invoke,catalog,approve};
}
test('S05 background intake resumes bounded complete pinned-main scans without effect',async()=>{
 const h=harness({maxPerWake:16}),input=h.catalog(35);
 assert.equal((await h.approve(input)).ok,true);
 const a=await h.invoke(input),b=await h.invoke(input),c=await h.invoke(input);
 assert.equal(a.observed,16);assert.equal(a.more,true);
 assert.equal(b.observed,16);assert.equal(b.more,true);
 assert.equal(c.observed,3);assert.equal(c.more,false);
 assert.equal(h.db.keys('meta').filter(x=>x.startsWith('s05-ready:')).length,35);
 assert.equal(h.db.keys('events').filter(x=>h.db.read('events',x)?.stage==='S05_READY_QUEUED').length,35);
 assert.equal(h.saw.every(x=>x.pinnedHead===input.head),true);
 assert.equal((await createReadyStore(h.db).list({limit:100})).items.length,35);
});
test('S05 incomplete or unauthorized main does not create a queue item',async()=>{
 const h=harness();
 const unverified={...h.catalog(1),complete:false};
 assert.equal((await h.invoke(unverified)).code,'READY_CATALOG_UNVERIFIED');
 assert.equal(h.db.keys('meta').length,0);
 await h.storage.set({pcmsRestoreInProgress:{active:true}});
 assert.equal((await h.invoke(h.catalog(1))).code,'RESTORE_HOLD');
 assert.equal(h.db.keys('meta').length,0);
});
test('S05 bad individual READY cannot contaminate other coherent witnesses',async()=>{
 const h=harness({inspect:async ({slug})=>slug==='safe-0000'?
   {ok:false,code:'READY_SOURCE_DRIFT_AFTER_DECLARATION'}:{
    ok:true,code:'READY_COHERENT_INPUT_PINNED',
    declarationCommit:'1'.repeat(40),markerOid:'2'.repeat(40),
    inputFingerprint:'a'.repeat(64),token:'rev00001',legacy:false,
    optionalTesting:{state:'ABSENT',oid:null}
   }});
 const input=h.catalog(2);await h.approve(input);
 const result=await h.invoke(input);
 assert.equal(result.ok,true);
 assert.equal(result.held[0].code,'READY_SOURCE_DRIFT_AFTER_DECLARATION');
 assert.equal(result.observed,1);
 assert.equal((await createReadyStore(h.db).get('safe-0000')).ok,false);
 assert.equal((await createReadyStore(h.db).get('safe-0001')).ok,true);
});

test('S05 coherent main NOT_READY revokes earlier READY without deletion or provider effect',async()=>{
 const h=harness({maxPerWake:8}),first=h.catalog(1);
 await h.approve(first);
 assert.equal((await h.invoke(first)).observed,1);
 const store=createReadyStore(h.db);
 assert.equal((await store.get('safe-0000')).record.revision,1);
 const scope=await getImportScopeDigest(first);
 await h.storage.set({pcmsS04CatalogIntakeProgress:{
   repositoryId:first.repositoryId,initialScopeDigest:scope,
   initialImportCompleted:true
 }});
 const notReady=h.catalog(1,'c'.repeat(40));
 notReady.generators[0].ready=false;
 const r=await h.invoke(notReady);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.revoked,1);
 assert.equal((await store.get('safe-0000')).record.hold,'READY_REVOKED_NOT_READY');
 const again=await h.invoke(notReady);
 assert.equal(again.revoked,0);
 assert.equal((await store.get('safe-0000')).record.revision,2);
 assert.equal(h.db.keys('events').filter(k=>
   h.db.read('events',k)?.stage==='S05_READY_REVOKED_NOT_READY').length,1);
});
