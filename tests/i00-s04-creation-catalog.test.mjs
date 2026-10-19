import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCreationCatalogIntake,validateCreationCatalog}
  from '../src/runtime/creation-catalog.mjs';
import {createCatalogWatcher} from '../src/runtime/catalog-watch.mjs';
import {I17_QUARANTINED_SLUG} from '../src/runtime/legacy-quarantine.mjs';
const repo='Neb963/per-gens',repositoryId='1411034835';
const gen=slug=>({slug,markerOid:'a'.repeat(40)});
const catalog=(slugs,head='b'.repeat(40))=>({
  ok:true,source:'PINNED_MAIN_READ_ONLY',complete:true,
  repository:repo,repositoryId,head,
  recognizedCount:slugs.length,generators:slugs.map(gen)
});
function env(){
  const rows=new Map();
  const storage={get:async key=>({[key]:rows.get(key)}),
    set:async changes=>{for(const [k,v] of Object.entries(changes))rows.set(k,structuredClone(v));}};
  const api={storage:{local:storage},runtime:{onStartup:{addListener(){}},
    onInstalled:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}}};
  return {api,rows};
}
const approved={ok:true,approval:{repository:repo,repositoryId,
  source:'HUMAN_INITIAL_IMPORT_SCOPE',scopeDigest:'a'.repeat(64)}};
function maker(v,{approval=approved,maxItems=2,ingest=async()=>({ok:true,changed:true})}={}){
  return createCreationCatalogIntake(v.api,{open:async()=>({}),
    makeApproval:()=>({get:async()=>approval}),
    makeCoordinator:()=>({ingestVerifiedMain:ingest}),maxItems,now:()=>42});
}
test('S04 D: approved 1000+ catalog processing bounded, checkpointed, resumes without skipping',async()=>{
  const v=env(),seen=[];
  const intake=maker(v,{maxItems:2,ingest:async w=>{
    seen.push(w.slug);return {ok:true,changed:true};
  }});
  const c=catalog(['first','second','third','fourth','fifth']);
  const first=await intake.run(c);
  assert.deepEqual([first.more,first.next,first.added],[true,2,2]);
  const second=await intake.run(c);
  assert.deepEqual([second.more,second.next],[true,4]);
  const third=await intake.run(c);
  assert.deepEqual([third.more,third.next],[false,5]);
  assert.deepEqual(seen,['first','second','third','fourth','fifth']);
  assert.equal(v.rows.get('pcmsS04CatalogIntakeProgress').next,5);
  assert.equal(v.rows.get('pcmsS04CatalogIntakeReceipt').providerEffects,'OFF');
  await intake.run(catalog(['first','second','third','fourth','fifth','sixth'],'c'.repeat(40)));
  assert.deepEqual(seen.slice(-2),['first','second']);
});
test('S04 D: no approval, corrupted catalog and incomplete observations admit zero origins',async()=>{
  const v=env(),seen=[];
  const intake=maker(v,{approval:{ok:false},ingest:async w=>{seen.push(w);return {ok:true};}});
  assert.equal((await intake.run(catalog(['one']))).code,'INITIAL_IMPORT_SCOPE_UNAPPROVED');
  assert.equal((await intake.run({...catalog(['one']),complete:false})).code,'S04_CATALOG_UNVERIFIED');
  assert.equal((await intake.run({...catalog(['one']),source:'CLAIMED_MAIN'})).code,'S04_CATALOG_UNVERIFIED');
  assert.equal((await intake.run(catalog(['one','one']))).code,'S04_CATALOG_DUPLICATE_SLUG');
  assert.equal((await intake.run({...catalog(['one']),generators:[{slug:'one',markerOid:null}]})).code,
    'S04_CATALOG_UNVERIFIED');
  assert.equal(seen.length,0);
});
test('S04 D: failed canonical admission retains cursor for read-only retry, I17 held only locally',async()=>{
  const v=env(),seen=[];
  let failSecond=true;
  const intake=maker(v,{maxItems:9,ingest:async w=>{
    seen.push(w.slug);
    if(w.slug==='second'&&failSecond)return {ok:false,code:'DB_ABORT'};
    if(w.slug===I17_QUARANTINED_SLUG)return {ok:false,code:'I17_ORIGINAL_EFFECT_QUARANTINED'};
    return {ok:true,changed:true};
  }});
  const c=catalog(['first','second',I17_QUARANTINED_SLUG,'fourth']);
  assert.equal((await intake.run(c)).code,'DB_ABORT');
  assert.equal(v.rows.get('pcmsS04CatalogIntakeProgress'),undefined);
  failSecond=false;
  const done=await intake.run(c);
  assert.equal(done.ok,true);assert.equal(done.held,1);
  assert.deepEqual(seen,['first','second','first','second',I17_QUARANTINED_SLUG,'fourth']);
});
test('S04 D: watcher offers only full pinned result to scoped no-effect ingest callback',async()=>{
  const v=env(),call=[];
  await v.api.storage.local.set({pcmsS03Git:{repository:repo,repositoryId}});
  let complete=true;
  const watcher=createCatalogWatcher(v.api,{
    native:async()=>({ok:true,credential:'fixture-only-credential'}),
    scan:async()=>complete?catalog(['s04-disposable']):{ok:false,complete:false,code:'CATALOG_INCOMPLETE'},
    ingestComplete:async c=>{call.push(c.head);return {ok:true,more:false};}
  });
  assert.equal((await watcher.tick()).ok,true);
  complete=false;
  assert.equal((await watcher.tick()).code,'CATALOG_INCOMPLETE');
  assert.equal(call.length,1);
});
test('S04 D: installed combined XPI includes verified catalog intake',async()=>{
  const overlay=await readFile(new URL('../src/runtime/overlay.mjs',import.meta.url),'utf8');
  assert.match(overlay,/creation-catalog\.mjs/);
});
