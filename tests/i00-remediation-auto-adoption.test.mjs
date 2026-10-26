import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createAdoptionBoundary} from '../src/runtime/adoption-boundary.mjs';
globalThis.crypto??=webcrypto;
const fp='a'.repeat(64);
const account={accountId:'account_0001',personaUid:'persona-01234567',revision:3,
  bindingVersion:2,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:2,principalFingerprint:fp}};
const gen=(slug,visibility='PUBLIC',extra={})=>({slug,accountId:account.accountId,personaUid:account.personaUid,
  accountRevision:3,bindingVersion:2,revision:4,ownerState:'OBSERVED_OWNER',visibility,remoteId:'slug-'+slug,...extra});
// The fake IDB stores add() rows under auto keys; find records by content.
const adoptionOf=(db,slug)=>db.keys('meta').map(k=>db.read('meta',k)).find(v=>v?.adoption?.slug===slug)?.adoption;
async function seed(db,rows){
  await new Promise((resolve,reject)=>{
    const t=db.transaction(['meta'],'readwrite');t.oncomplete=resolve;t.onabort=reject;
    const m=t.objectStore('meta');
    m.put({key:'account:'+account.accountId,account});
    for(const r of rows)m.put({key:'inventory:'+r.slug,generator:r});
  });
}
function fixture(rows,{management=true,changing=new Set(),beforeRead=null}={}){
  const db=fakeDatabase(),local=new Map(),reads=[],effects=[];
  const api={runtime:{id:'f',getURL:p=>'moz-extension://f/'+p,onConnect:{addListener(){}}},
    alarms:{create(){},onAlarm:{addListener(){}}},
    storage:{local:{get:async k=>local.has(k)?{[k]:local.get(k)}:{},set:async o=>{for(const [k,v] of Object.entries(o))local.set(k,v);}}}};
  let n=0;
  const guard=()=>({getSafeRouteReadiness:async()=>({ready:true,cookieStoreId:'c1',routeId:'r1'}),
    observeReadOnly:async(uid,identityOnly,slug)=>{reads.push(slug);if(beforeRead)await beforeRead(slug);
      return {ok:true,principalFingerprint:fp,original:{ownerResult:'IS_OWNER',
        visibility:rows.find(r=>r.slug===slug).visibility,remotePublicId:'public_'+slug.replaceAll('-','_'),
        pjs:'let x='+(changing.has(slug)?++n:1),html:'<b>x</b>',assets:[]}};}});
  const boundary=createAdoptionBoundary(api,{open:async()=>db,guard,
    managementGate:()=>management,gitGate:()=>false,
    gitWrite:async()=>{effects.push('GIT');return {ok:false};}});
  return {db,api,guard,boundary,reads,effects,ready:seed(db,rows)};
}
test('C-10: account-level management adopts verified owned public and unlisted generators automatically',async()=>{
  const rows=[gen('alpha'),gen('beta','UNLISTED'),gen('gamma')];
  const f=fixture(rows);await f.ready;
  const first=await f.boundary.autoTick({maxSteps:10});
  assert.equal(first.ok,true);
  assert.deepEqual(first.results.map(r=>[r.slug,r.ok]),[['alpha',true],['beta',true],['gamma',true]]);
  for(const r of rows){
    const rec=adoptionOf(f.db,r.slug);
    assert.equal(rec.archiveState,'ARCHIVE_PENDING');
    assert.equal(rec.consent,r.visibility==='PUBLIC'?'STANDING_ACCOUNT_MANAGEMENT':'AUTO_UNLISTED');
  }
  assert.deepEqual(f.effects,[],'adoption itself never writes Git without the Git grant, nor the provider');
  // Idempotent: no duplicate capture on the next wake.
  const second=await f.boundary.autoTick({maxSteps:10});
  assert.equal(second.results.length,0);
});
test('C-10: without account management nothing is adopted; changing source holds only that generator',async()=>{
  const off=fixture([gen('alpha')],{management:false});await off.ready;
  assert.equal((await off.boundary.autoTick()).code,'ACCOUNT_MANAGEMENT_NOT_GRANTED');
  assert.equal(off.reads.length,0);
  const f=fixture([gen('alpha'),gen('beta'),gen('delta',undefined,{ownerState:'OWNER_DISPUTED'}),
    gen('made-by-pcms','UNLISTED',{management:'MANAGED_CREATED'})],{changing:new Set(['alpha'])});
  await f.ready;
  const out=await f.boundary.autoTick({maxSteps:10});
  assert.deepEqual(out.results.map(r=>[r.slug,r.ok,r.code]),
    [['alpha',false,'ORIGINAL_SOURCE_DRIFT'],['beta',true,null]]);
  assert.equal(adoptionOf(f.db,'alpha'),undefined);
  assert.equal(f.reads.includes('delta'),false,'disputed ownership is never adopted');
  assert.equal(f.reads.includes('made-by-pcms'),false,'PCMS-created generators are not re-adopted');
  // Held item is backed off, not retried on every wake.
  assert.equal((await f.boundary.autoTick({maxSteps:10})).results.length,0);
});
test('C-10: bounded per wake with fair rotation across a large owned fleet',async()=>{
  const rows=Array.from({length:12},(_,i)=>gen('gen-'+String(i).padStart(3,'0')));
  const f=fixture(rows);await f.ready;
  const seen=[];
  for(let i=0;i<4;i++)seen.push(...(await f.boundary.autoTick({maxSteps:3})).results.map(r=>r.slug));
  assert.equal(new Set(seen).size,12);
});

test('J02 interrupted original Git preparation aborts locally, then archives through guarded continuation; eligible originals coalesce checkpoint request',async()=>{
 const f=fixture([gen('j02-original')]);await f.ready;await f.boundary.autoTick();
 const {createAdoptionStore}=await import('../src/runtime/adoption-store.mjs');
 const store=createAdoptionStore(f.db),captured=(await store.getFull('j02-original')).record;
 assert.equal((await store.archiveStage('j02-original',captured.revision,'PREPARE')).ok,true);
 let writes=0,requests=0;
 const boundary=createAdoptionBoundary(f.api,{open:async()=>f.db,guard:f.guard,managementGate:()=>true,gitGate:()=>true,
  getGitConnection:async()=>({repository:'fixture/originals',repositoryId:'123456'}),
  getGitCredential:async()=>({ok:true,credential:'offline-fixture-only'}),
  requestCheckpoint:async()=>{requests++;return {ok:true}},gitWrite:async({slug,original})=>{writes++;return {
   ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK',ready:false,archiveRef:'refs/tags/pcms-originals/'+original.remotePublicId+'/'+original.fingerprint,
   prefix:'generators/'+slug,fingerprint:original.fingerprint,commit:'c'.repeat(40),head:'d'.repeat(40)}}});
 const aborted=await boundary.autoTick();assert.equal(aborted.results[0].step,'ABORT_GIT_PREPARED');assert.equal(aborted.results[0].ok,true,JSON.stringify(aborted));assert.equal(writes,0);
 assert.equal((await store.getFull('j02-original')).record.archiveState,'ARCHIVE_PENDING');
 await boundary.autoTick();assert.equal(writes,1);assert.equal((await store.getFull('j02-original')).record.archiveState,'ARCHIVED_GIT_CONFIRMED');
 await boundary.autoTick();await boundary.autoTick();assert.equal(requests,1,'one coalesced source checkpoint request within interval');
 const prior=(await store.getFull('j02-original')).record;assert.deepEqual(prior.original,captured.original);
 const t=f.db.transaction(['meta'],'readwrite');t.objectStore('meta').put({key:'account:'+account.accountId,account:{...account,state:'ARCHIVED',revision:4}});
 await new Promise(r=>{t.oncomplete=r});
 const cold=createAdoptionBoundary(f.api,{open:async()=>f.db,guard:f.guard,managementGate:()=>true,requestCheckpoint:async()=>{requests++}});
 await cold.autoTick();assert.equal(requests,1,'archived account never generates repeated manual exports');
});
test('J02 archived original tombstone never enters context-refresh/readback loop after account revision changes',async()=>{
 const f=fixture([gen('j02-tombstone')]);await f.ready;await f.boundary.autoTick();
 const {createAdoptionStore}=await import('../src/runtime/adoption-store.mjs');const store=createAdoptionStore(f.db),rec=(await store.getFull('j02-tombstone')).record;
 await store.archiveLocal('j02-tombstone',rec.revision);
 const t=f.db.transaction(['meta'],'readwrite');t.objectStore('meta').put({key:'account:'+account.accountId,account:{...account,revision:4}});await new Promise(r=>{t.oncomplete=r});
 let refreshes=0;const boundary=createAdoptionBoundary(f.api,{open:async()=>f.db,guard:f.guard,managementGate:()=>true,
  refreshIdentity:async()=>{refreshes++;return {ok:true}}});
 assert.equal((await boundary.autoTick()).results.length,0);assert.equal(refreshes,0);
});

test('J02 primary retry command re-reads canonical revision and advances only its target through actual production capture',async()=>{
 const f=fixture([gen('j02-retry-target'),gen('j02-other')]);await f.ready;
 const sender={id:'f',url:f.api.runtime.getURL('pcms/index.html')};
 const out=await f.boundary.run({type:'RETRY_ADOPTION',params:{slug:'j02-retry-target'}},sender);
 assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.code,'ADOPTION_AUTO_CHECKPOINT');
 assert.equal(adoptionOf(f.db,'j02-retry-target').archiveState,'ARCHIVE_PENDING');
 assert.equal(adoptionOf(f.db,'j02-other'),undefined);
 assert.equal((await f.boundary.run({type:'RETRY_ADOPTION',params:{slug:'j02-retry-target',expectedRevision:4}},sender)).ok,false);
});

test('F2 adoption preserves selection-order results while another source finishes before the first settles',async()=>{
 let release;const held=new Promise(resolve=>{release=resolve;});
 const f=fixture([gen('alpha'),gen('beta'),gen('gamma')],{
  beforeRead:async slug=>{if(slug==='alpha')await held;}});
 await f.ready;const pending=f.boundary.autoTick({maxSteps:3});
 try{
  const deadline=Date.now()+2000;
  while(!adoptionOf(f.db,'beta')&&Date.now()<deadline)
   await new Promise(resolve=>setImmediate(resolve));
  assert.equal(adoptionOf(f.db,'beta')?.archiveState,'ARCHIVE_PENDING',
   'independent source must commit before held alpha is released');
  assert.equal(adoptionOf(f.db,'alpha'),undefined);
 }finally{release();}
 const out=await pending;
 assert.deepEqual(out.results.map(r=>[r.slug,r.ok]),[['alpha',true],['beta',true],['gamma',true]]);
 assert.deepEqual(f.effects,[]);
 for(const slug of ['alpha','beta','gamma'])
  assert.equal(adoptionOf(f.db,slug).archiveState,'ARCHIVE_PENDING');
});
