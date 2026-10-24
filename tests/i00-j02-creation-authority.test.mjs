import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';import {createS06StandingAuthority} from '../src/runtime/s06-standing-authority.mjs';
import {createScopedCreationGate} from '../src/runtime/creation-authority.mjs';
import {createCoordinatorBoundary} from '../src/runtime/coordinator-boundary.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationWatcher} from '../src/runtime/creation-watch.mjs';import {createCreationRunner} from '../src/runtime/creation-runner.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
globalThis.crypto??=webcrypto;
const KEY='pcmsS06StandingAuthority',restore='pcmsRestoreInProgress',slug='j02-no-git-created';
const account={accountId:'account_j02_nogit',personaUid:'persona_j02_nogit',state:'VERIFIED',revision:3,bindingVersion:1,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
const grants={development:false,gitWrite:false,publication:false};
function apiFixture(){const values={},listeners=[];
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p,onConnect:{addListener(){}},onStartup:{addListener(){}},onInstalled:{addListener(){}}},
  storage:{local:{get:async k=>({[k]:structuredClone(values[k])}),set:async data=>{Object.assign(values,structuredClone(data));}},onChanged:{addListener:fn=>listeners.push(fn)}},
  alarms:{create:async()=>{},onAlarm:{addListener(){}}}};
 return {api,values,listeners};}
async function fixture({origin='OPERATOR',paused=false,coalesced=false,lateRevoke=false}={}){
 const f=apiFixture(),db=fakeDatabase(),store=createCoordinatorStore(db),effects=[];
 if(paused)f.values[KEY]={schema:1,revision:1,grants};
 const t=db.transaction(['meta'],'readwrite');t.objectStore('meta').put({key:'account:'+account.accountId,account});await new Promise(r=>{t.oncomplete=r});
 await createInventoryStore(db).applyObservation(account,{source:'GUARDED_PERCHANCE_READBACK',complete:true,
  ...account,accountRevision:3,principalFingerprint:account.identity.principalFingerprint,observationId:'j02_nogit_census',observedAt:Date.now(),generators:[]});
 let item;
 if(origin==='GITHUB_MAIN')item=(await store.ingestVerifiedMain({slug,repository:'Neb963/per-gens',repositoryId:'12345',
  head:'a'.repeat(40),markerOid:'b'.repeat(40),complete:true,verifiedMain:true})).record;
 else item=(await store.acceptCreate({intentId:'operator_nogit_j02',slug,origin:'OPERATOR'})).record;
 if(coalesced)await store.acceptCreate({intentId:'operator_coalesced_j02',slug,origin:'OPERATOR'});
 const authority=createS06StandingAuthority(f.api),route={ready:true,personaUid:account.personaUid,cookieStoreId:'fixture',routeId:'protected'};
 const guard=()=>({getSafeRouteReadiness:async()=>route,runSupplyStep:async(_uid,r)=>{
  if(r.kind==='READ_TARGET')return {ok:true,source:'INDEPENDENT_TARGET_READBACK',slug,state:'MISSING_VERIFIED'};
  if(r.kind==='CREATE'){effects.push('CREATE');return {ok:true,ack:'CREATED',temporarySlug:'j02-temp-nogit'}}
  if(r.kind==='READ_CREATE')return {ok:true,source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,remoteId:'public_nogit',temporarySlug:'j02-temp-nogit'};
  if(r.kind==='RENAME'){effects.push('RENAME');return {ok:true,ack:'RENAMED'}}
  if(r.kind==='READ_RENAME')return {ok:true,source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,remoteId:'public_nogit',slug,previousSlug:'j02-temp-nogit'};
  throw Error(r.kind);
 }});
 const makeRunner=(api,o)=>{
  const base=o.effectGate;
  const gate=async ctx=>{const allowed=await base(ctx);
   if(lateRevoke&&ctx.intent.state==='CREATE_DISPATCH_POSSIBLE')void authority.revoke();return allowed};
  gate.generation=base.generation;
  return createCreationRunner(api,{...o,guard,effectGate:gate,createGit:()=>({step:async()=>({ok:false,code:'GIT_RECONNECT_REQUIRED'})})});
 };
 const watcher=createCreationWatcher(f.api,{open:async()=>db,authority,createRunner:makeRunner});
 const boundary=createCoordinatorBoundary(f.api,{open:async()=>db,authority,makeRunner});
 return {...f,db,store,effects,item,watcher,boundary,authority};
}
test('J02 production watcher creates private resource without Git configuration or standing grant; original account/route/inventory/journal checks remain',async()=>{
 const f=await fixture();for(let i=0;i<12;i++)await f.watcher.tick();
 assert.deepEqual(f.effects,['CREATE','RENAME']);assert.equal((await f.store.getCreate(f.item.intentId)).record.state,'GIT_INIT_PENDING');
 assert.equal(f.values.pcmsS03Git,undefined);assert.equal(f.authority.gate('gitWrite'),false);assert.equal(f.authority.gate('publication'),false);
 assert.equal(f.db.keys('operations').length,2);
});
test('J02 production coordinator permits genuinely coalesced operator submission but never Git-only discovery without scoped standing authority',async()=>{
 for(const coalesced of [false,true]){
  const f=await fixture({origin:'GITHUB_MAIN',coalesced});
  for(let i=0;i<12;i++){const item=(await f.store.getCreate(f.item.intentId)).record;
   await f.boundary.run({type:'RUN_CREATE_STEP',params:{intentId:item.intentId,expectedRevision:item.revision}},
    {id:'fixture',url:f.api.runtime.getURL('pcms/index.html')});}
  assert.deepEqual(f.effects,coalesced?['CREATE','RENAME']:[]);
 }
});
test('J02 explicit and ambiguous legacy pauses survive cold policy reopen, Git invalidation and restore; fresh Git-only invalidation keeps operator module independent',async()=>{
 const f=await fixture({paused:true});for(let i=0;i<6;i++)await f.watcher.tick();assert.deepEqual(f.effects,[]);
 await f.authority.revoke('GIT_CONFIGURATION_CHANGED');assert.equal(await createS06StandingAuthority(f.api).allowsOperatorManagement(),false);
 const clean=apiFixture(),a=createS06StandingAuthority(clean.api);assert.equal(await a.allowsOperatorManagement(),true);
 await a.revoke('GIT_CONFIGURATION_CHANGED');assert.equal(await a.allowsOperatorManagement(),true);
 await a.revoke();assert.equal(await a.allowsOperatorManagement(),false);
 await a.revoke('GIT_CONFIGURATION_CHANGED');assert.equal(await a.allowsOperatorManagement(),false);
 const restored=apiFixture(),ar=createS06StandingAuthority(restored.api);restored.values[restore]={runId:'restore_j02',phase:'HOLD'};
 assert.equal(await ar.allowsOperatorManagement(),false);
 await ar.revoke('RESTORE_HOLD');delete restored.values[restore];assert.equal(await createS06StandingAuthority(restored.api).allowsOperatorManagement(),false);
});
test('J02 async old storage read and revocation after final policy read cannot restore dispatch authority',async()=>{
 const f=apiFixture(),a=createS06StandingAuthority(f.api),original=f.api.storage.local.get;let release,intercept=true;
 f.api.storage.local.get=async k=>{if(k===KEY&&intercept){intercept=false;return new Promise(r=>{release=()=>r({[KEY]:undefined})})}return original(k)};
 const pending=a.allowsOperatorManagement();await a.revoke();release();assert.equal(await pending,false);
 const late=await fixture({lateRevoke:true});for(let i=0;i<6;i++)await late.watcher.tick();
 assert.deepEqual(late.effects,[]);const current=(await late.store.getCreate(late.item.intentId)).record;
 assert.equal(current.state,'CREATE_UNCERTAIN');assert.equal(late.db.keys('operations').length,1);
});

test('J02 scoped primary Pause/Resume works without Git, grants no source/Git/publication permission and honors later explicit revoke',async()=>{
 const f=apiFixture(),authority=createS06StandingAuthority(f.api),sender={id:'fixture',url:f.api.runtime.getURL('pcms/index.html')};
 f.values[KEY]={schema:1,revision:4,grants};
 assert.equal((await authority.handle({type:'GET_OPERATOR_MANAGEMENT'},sender)).enabled,false);
 assert.equal((await authority.handle({type:'SET_OPERATOR_MANAGEMENT',params:{enabled:true,expectedRevision:4}},
  {id:'web',url:'https://example.invalid'})).code,'UNTRUSTED_SENDER');
 const resumed=await authority.handle({type:'SET_OPERATOR_MANAGEMENT',params:{enabled:true,expectedRevision:4}},sender);
 assert.equal(resumed.enabled,true);assert.equal(await createS06StandingAuthority(f.api).allowsOperatorManagement(),true);
 for(const scope of ['development','gitWrite','publication'])assert.equal(authority.gate(scope),false);
 assert.equal((await authority.setOperatorManagement({enabled:false,expectedRevision:4})).code,'STALE_REVISION');
 await authority.revoke('GIT_CONFIGURATION_CHANGED');assert.equal(await authority.allowsOperatorManagement(),true);
 await authority.revoke();assert.equal(await authority.allowsOperatorManagement(),false);
 assert.equal(await createS06StandingAuthority(f.api).allowsOperatorManagement(),false);
});
test('J02 a later explicit revoke wins an in-flight scoped resume before another cold worker can admit effects',async()=>{
 const f=apiFixture(),authority=createS06StandingAuthority(f.api),write=f.api.storage.local.set;let release,first=true;
 f.api.storage.local.set=async data=>{if(first){first=false;await new Promise(r=>{release=r})}return write(data)};
 const resume=authority.setOperatorManagement({enabled:true,expectedRevision:1});
 while(!release)await new Promise(r=>setImmediate(r));
 const revoked=authority.revoke();assert.equal(await authority.allowsOperatorManagement(),false);
 release();await resume;await revoked;
 assert.equal(await createS06StandingAuthority(f.api).allowsOperatorManagement(),false);
});

test('J02 scoped creation pause also holds Git-origin creation while preserving independently authorized source/Git/publication modules',async()=>{
 const f=apiFixture(),authority=createS06StandingAuthority(f.api);
 f.values.pcmsS03Git={repository:'Neb963/per-gens',repositoryId:'12345'};
 const enabled=await authority.update({repositoryId:'12345',expectedRevision:1,consent:'I AUTHORIZE PROTECTED PCMS OPERATIONS',
  grants:{development:true,gitWrite:true,publication:true}});assert.equal(enabled.ok,true);
 const state=await authority.operatorManagementState();await authority.setOperatorManagement({enabled:false,expectedRevision:state.revision});
 const gate=createScopedCreationGate(authority);
 assert.equal(await gate({intent:{sources:[{type:'OPERATOR'}]}}),false);
 assert.equal(await gate({intent:{sources:[{type:'GITHUB_MAIN'}]}}),false);
 for(const scope of ['development','gitWrite','publication'])assert.equal(authority.gate(scope),true);
});
