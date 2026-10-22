import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCatalogWatcher,CATALOG_ALARM} from '../src/runtime/catalog-watch.mjs';
const TOKEN='fixture-secret-token',repo='Neb963/per-gens';
function env(){
  const saved=new Map();
  const get=async key=>saved.has(key)?{[key]:structuredClone(saved.get(key))}:{};
  const set=async values=>{for(const [key,value] of Object.entries(values)){
    assert.ok(!JSON.stringify(value).includes(TOKEN),'credential entered browser storage');
    saved.set(key,structuredClone(value));
  }};
  const api={storage:{local:{get,set}},alarms:{create:()=>{},
    onAlarm:{addListener:()=>{}}},runtime:{onStartup:{addListener:()=>{}},
    onInstalled:{addListener:()=>{}}}};
  return {api,saved,set,get};
}
const generator=(slug,oid='1'.repeat(40))=>({
  slug,markerOid:oid,folderTreeOid:'2'.repeat(40),
  ready:true,sourceState:'READY_UNVERIFIED_COHERENCE'
});
const observed=generators=>({ok:true,complete:true,repository:repo,
  repositoryId:'42',head:'a'.repeat(40),rootTreeOid:'b'.repeat(40),
  prompt:{oid:'c'.repeat(40),text:'never persist prompt text'},
  recognizedCount:generators.length,generators});
test('S03: no-dashboard wake pins complete main state, no secrets/prompt in browser store',async()=>{
  const v=env();await v.set({pcmsS03Git:{repository:repo,repositoryId:'42'}});
  let reads=0,nativeCalls=0;
  const watcher=createCatalogWatcher(v.api,{
    scan:async args=>{reads++;assert.equal(args.token,TOKEN);
      return observed([generator('one')]);},
    native:async req=>{nativeCalls++;assert.deepEqual(req,{action:'git.get',repositoryId:'42'});
      return {ok:true,credential:TOKEN};},
    clock:()=>12345
  });
  assert.equal((await watcher.tick()).ok,true);
  assert.equal(reads,1);assert.equal(nativeCalls,1);
  const last=v.saved.get('pcmsS03CatalogLastComplete');
  assert.equal(last.complete,true);assert.equal(last.generators[0].slug,'one');
  assert.equal(JSON.stringify([...v.saved]),JSON.stringify([...v.saved]).replaceAll('never persist prompt text',''));
  assert.equal(v.saved.get('pcmsS03CatalogReceipt').firstImportNeedsApproval,true);
  const files=await Promise.all(['src/runtime/entry.mjs','src/runtime/overlay.mjs']
    .map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
  assert.match(files[0],/import '.\/catalog-watch\.mjs'/);
  assert.match(files[1],/'catalog-watch.mjs'/);
  assert.equal(CATALOG_ALARM,'pcms-s03-main-observe');
});
test('S03: missing folder observation never deletes prior data when scan incomplete',async()=>{
  const v=env();await v.set({pcmsS03Git:{repository:repo,repositoryId:'42'}});
  let batch=observed([generator('one'),generator('two')]);
  const watcher=createCatalogWatcher(v.api,{
    scan:async()=>batch,native:async()=>({ok:true,credential:TOKEN}),clock:()=>222
  });
  assert.equal((await watcher.tick()).ok,true);
  batch={ok:false,code:'CATALOG_INCOMPLETE',complete:false};
  assert.equal((await watcher.tick()).code,'CATALOG_INCOMPLETE');
  assert.equal(v.saved.get('pcmsS03CatalogLastComplete').generators.length,2);
  batch=observed([generator('two'),generator('three')]);
  const out=await watcher.tick();
  assert.deepEqual(out.newFolders,['three']);
  assert.deepEqual(out.missingFolderObservations,['one']);
  assert.equal(v.saved.get('pcmsS03CatalogReceipt').code,'CATALOG_OBSERVED_READ_ONLY');
});
test('S03: locked credential, restore hold and identity drift cannot replace last complete',async()=>{
  const v=env();await v.set({pcmsS03Git:{repository:repo,repositoryId:'42'}});
  let unlocked=true,wrong=false;
  const watcher=createCatalogWatcher(v.api,{
    native:async()=>unlocked?{ok:true,credential:TOKEN}:{ok:false},
    scan:async()=>({...observed([generator('fresh')]),
      repositoryId:wrong?'99':'42'})
  });
  await watcher.tick();
  unlocked=false;
  assert.equal((await watcher.tick()).code,'GIT_VAULT_UNAVAILABLE');
  unlocked=true;wrong=true;
  const r=await watcher.tick();
  assert.equal(r.ok,false);
  assert.deepEqual(v.saved.get('pcmsS03CatalogLastComplete').generators.map(x=>x.slug),['fresh']);
  await v.set({pcmsRestoreInProgress:{active:true}});
  assert.equal((await watcher.tick()).code,'RESTORE_HOLD');
  assert.equal(v.saved.get('pcmsS03CatalogLastComplete').complete,true);
});
test('S03: simultaneous background alarms coalesce and do not multiply network scans',async()=>{
  const v=env();await v.set({pcmsS03Git:{repository:repo,repositoryId:'42'}});
  let finish,reads=0;
  const blocker=new Promise(resolve=>finish=resolve);
  const watcher=createCatalogWatcher(v.api,{
    native:async()=>({ok:true,credential:TOKEN}),
    scan:async()=>{reads++;await blocker;return observed([generator('one')]);}
  });
  const one=watcher.tick(),two=watcher.tick();
  finish();
  assert.equal((await one).ok,true);
  assert.equal((await two).ok,true);
  assert.equal(reads,1);
});

test('R4 S03: delayed apparent Git folder rename remains held before actual creation/READY intake',async()=>{
 const v=env();await v.set({pcmsS03Git:{repository:repo,repositoryId:'42'}});
 let round=0;const captures=[];
 const batches=[
   [generator('old-generator')],
   [],
   [generator('new-generator')]
 ];
 const watcher=createCatalogWatcher(v.api,{
   native:async()=>({ok:true,credential:TOKEN}),
   scan:async()=>({...observed(batches[round++]),head:String(round).repeat(40)}),
   ingestComplete:async(catalog,opts)=>{captures.push({
     source:catalog.generators.map(x=>x.slug),held:opts.heldSlugs});return {ok:true}},
   clock:()=>1700000000000
 });
 assert.equal((await watcher.tick()).ok,true);
 assert.equal((await watcher.tick()).ok,true);
 assert.deepEqual(v.saved.get('pcmsR4MissingGitFolders').slugs,['old-generator']);
 assert.equal((await watcher.tick()).ok,true);
 assert.deepEqual(captures[2],{source:['new-generator'],held:['new-generator']});
 const review=v.saved.get('pcmsR4FolderIdentityReviews');
 assert.equal(review[0].oldSlug,'old-generator');
 assert.equal(review[0].state,'REVIEW_REQUIRED');
 assert.equal(v.saved.get('pcmsS03CatalogReceipt').identityReviewRequired,1);
});
