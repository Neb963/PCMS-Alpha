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
function fixture(rows,{management=true,changing=new Set()}={}){
  const db=fakeDatabase(),local=new Map(),reads=[],effects=[];
  const api={runtime:{id:'f',getURL:p=>'moz-extension://f/'+p,onConnect:{addListener(){}}},
    alarms:{create(){},onAlarm:{addListener(){}}},
    storage:{local:{get:async k=>local.has(k)?{[k]:local.get(k)}:{},set:async o=>{for(const [k,v] of Object.entries(o))local.set(k,v);}}}};
  let n=0;
  const guard=()=>({getSafeRouteReadiness:async()=>({ready:true,cookieStoreId:'c1',routeId:'r1'}),
    observeReadOnly:async(uid,identityOnly,slug)=>{reads.push(slug);
      return {ok:true,principalFingerprint:fp,original:{ownerResult:'IS_OWNER',
        visibility:rows.find(r=>r.slug===slug).visibility,remotePublicId:'public_'+slug.replaceAll('-','_'),
        pjs:'let x='+(changing.has(slug)?++n:1),html:'<b>x</b>',assets:[]}};}});
  const boundary=createAdoptionBoundary(api,{open:async()=>db,guard,
    managementGate:()=>management,gitGate:()=>false,
    gitWrite:async()=>{effects.push('GIT');return {ok:false};}});
  return {db,boundary,reads,effects,ready:seed(db,rows)};
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
