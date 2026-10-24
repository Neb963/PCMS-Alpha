import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createInventoryBoundary} from '../src/runtime/inventory-boundary.mjs';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';
const uid='persona-j02-open',accountId='account_j02_open',slug='j02-protected-open';
const api={runtime:{id:'persona-route-manager@local',getURL:p=>'moz-extension://fixture/'+p},
 storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
async function seed(){
 const db=fakeDatabase(),tx=db.transaction(['meta'],'readwrite'),m=tx.objectStore('meta');
 m.put({key:'account:'+accountId,account:{accountId,personaUid:uid,state:'VERIFIED',revision:2,bindingVersion:1}});
 m.put({key:'inventory:'+slug,generator:{slug,accountId,personaUid:uid,bindingVersion:1,revision:3,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'}});
 await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j});return db;
}
test('J02 trusted generator Open resolves canonical Persona and stale/untrusted requests cannot open another target',async()=>{
 const db=await seed(),opened=[];
 const boundary=createInventoryBoundary(api,{open:async()=>db,guard:()=>({
  openHumanGenerator:async(personaUid,name)=>{opened.push({personaUid,name});return {ok:true,opened:true}}
 })});
 const open=params=>boundary.run({type:'OPEN_GENERATOR',params},sender);
 assert.equal((await open({slug,expectedRevision:2})).code,'STALE_REVISION');
 assert.equal((await boundary.run({type:'OPEN_GENERATOR',params:{slug,expectedRevision:3}},
  {...sender,url:'https://perchance.org/'})).code,'UNTRUSTED_SENDER');
 assert.equal((await open({slug,expectedRevision:3,personaUid:'different-persona'})).code,'INVALID_PARAMS');
 assert.equal((await open({slug,expectedRevision:3})).opened,true);
 assert.deepEqual(opened,[{personaUid:uid,name:slug}]);
 const inspected=await boundary.run({type:'INSPECT_GENERATORS',params:{slugs:[slug,'missing-record']}},sender);
 assert.equal(inspected.items[0].slug,slug);assert.equal(inspected.items[1].missing,true);
 assert.ok(!JSON.stringify(inspected).includes(uid),'private routing context is not returned as selection authority');
});
test('J02 human generator view uses the existing guarded donor tab callback and forbids injected URLs',async()=>{
 const opened=[],context={personaUid:uid,cookieStoreId:'firefox-container-test',
  pcmsBindingId:'binding_j02_open',routeId:'mullvad-fixture',route:{enabled:true}};
 const guard=createPersonaGuard({initialize:async()=>{},securityState:{ready:true,privacySafe:true,proxyControl:'controlled_by_this_extension'},
  shared:{resolve:async()=>context,acquire:async()=>null,validate:async()=>false,release:async()=>{}},
  getRouteTest:async()=>({ok:true}),pinGate:()=>({allow:true}),
  openHumanLogin:async current=>{opened.push(current)}});
 assert.equal((await guard.openHumanGenerator(uid,'https://evil.example/')).code,'INVALID_GENERATOR_SLUG');
 const out=await guard.openHumanGenerator(uid,slug);
 assert.equal(out.ok,true,out.code);assert.equal(out.kind,'HUMAN_GENERATOR_VIEW');
 assert.equal(opened[0].personaUid,uid);assert.equal(opened[0].cookieStoreId,context.cookieStoreId);
 assert.equal(opened[0].slug,slug);
});
