import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { eligibleInventoryAccount, validateInventoryObservation, reconcileInventory,
  publicGenerator, selectInventoryPage } from '../src/runtime/inventory.mjs';
import { validateInventoryMessage, sameGuardContext } from '../src/runtime/inventory-boundary.mjs';

const p='persona-aaaa-0001', fp='a'.repeat(64);
const account={accountId:'account_alpha_01',personaUid:p,
  revision:3,bindingVersion:1,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:fp,bindingVersion:1}};
const item=(slug,remoteId='remote-aaaa-0001',result='IS_OWNER')=>({
  slug,remoteId,ownerResult:result,ownerObservationId:'owner-observation-01',
  ownerPrincipalFingerprint:fp,visibility:'UNLISTED',
  canEdit:true,editKey:'do-not-trust'
});
const batch=(generators,overrides={})=>({
  source:'GUARDED_PERCHANCE_READBACK',complete:true,
  accountId:account.accountId,personaUid:p,accountRevision:3,
  bindingVersion:1,principalFingerprint:fp,observationId:'inventory-read-01',
  observedAt:1791841200000,generators,...overrides
});

test('P52-01 F: positive owner requires independent principal match, not editKey',()=>{
  const valid=reconcileInventory([],account,batch([item('owned-one')]));
  assert.equal(valid.ok,true);
  assert.equal(valid.rows[0].ownerState,'OBSERVED_OWNER');
  assert.equal(valid.rows[0].management,'OBSERVED_ONLY');
  assert.equal(valid.rows[0].source,'SOURCE_PENDING');
  assert.equal(publicGenerator(valid.rows[0]).evidence,'HISTORICAL_READ_ONLY');
  assert.equal(publicGenerator(valid.rows[0]).providerWrites,'OFF');
  const collaborator=item('collaborator-01','remote-bbbb-0001','NOT_OWNER');
  collaborator.editKey='valid-key';collaborator.canEdit=true;
  assert.equal(reconcileInventory([],account,batch([collaborator])).rows[0].ownerState,'OWNER_DISPUTED');
  const unknown=item('unverified-01','remote-cccc-0001','UNKNOWN');
  assert.equal(reconcileInventory([],account,batch([unknown])).rows[0].ownerState,'OWNER_UNVERIFIED');
  assert.equal(validateInventoryObservation(account,batch([{
    ...item('forged-01'),ownerPrincipalFingerprint:'b'.repeat(64)
  }])).code,'INVENTORY_ITEM_AMBIGUOUS');
});

test('P52-01 F: stale session, manual override, revoked binding, challenge and incomplete list held',()=>{
  assert.equal(eligibleInventoryAccount({...account,state:'OVERRIDDEN',identity:null}).code,
    'ACCOUNT_IDENTITY_UNVERIFIED');
  assert.equal(eligibleInventoryAccount({...account,identity:{...account.identity,bindingVersion:0}}).code,
    'ACCOUNT_IDENTITY_UNVERIFIED');
  for (const altered of [
    {principalFingerprint:'b'.repeat(64)},
    {complete:false},
    {source:'SAVED_BROWSER_SESSION'},
    {accountRevision:2},
    {bindingVersion:2},
    {personaUid:'persona-bbbb-0002'},
    {observationId:'bad'},
    {generators:null}
  ])assert.equal(validateInventoryObservation(account,batch([item('owned-one')],altered)).ok,false);
  const direct={ready:false,code:'DIRECT_FORBIDDEN'};
  const before={ready:true,personaUid:p,cookieStoreId:'firefox-01',routeId:'safe-01'};
  assert.equal(sameGuardContext(before,direct),false);
  assert.equal(sameGuardContext(before,{...before,routeId:'direct'}),false);
  assert.equal(sameGuardContext(before,{...before,cookieStoreId:'firefox-02'}),false);
  assert.equal(sameGuardContext(before,{...before}),true);
});

test('S6-I04-INVENTORY-SEARCH F: unique remote identity and account claims cannot overwrite history',()=>{
  const original=reconcileInventory([],account,batch([item('owned-one')])).rows;
  const other={...account,accountId:'account_beta_02'};
  const collision=reconcileInventory(original,other,batch([item('owned-one')],{
    accountId:other.accountId,observationId:'inventory-read-02'
  }));
  assert.equal(collision.ok,true);
  assert.equal(collision.incidents[0].code,'OWNER_CONFLICT');
  assert.equal(collision.rows[0].remoteId,'remote-aaaa-0001');
  assert.equal(collision.rows[0].accountId,account.accountId);
  const reused=reconcileInventory(original,account,batch([
    item('owned-one','remote-dddd-0001')
  ],{observationId:'inventory-read-03'}));
  assert.equal(reused.incidents[0].code,'IDENTITY_CONFLICT');
  assert.equal(reused.rows[0].remoteId,'remote-aaaa-0001');
});

test('S6-I04-INVENTORY-SEARCH F: complete absence is UNOBSERVED, never deletion',()=>{
  const initial=reconcileInventory([],account,batch([
    item('owned-one'),item('owned-two','remote-bbbb-0001')
  ])).rows;
  const absent=reconcileInventory(initial,account,batch([],{
    observationId:'inventory-read-02',observedAt:1791841200001
  }));
  assert.equal(absent.rows.length,2);
  assert.equal(absent.rows.every(x=>x.ownerState==='UNOBSERVED'),true);
  assert.deepEqual(absent.rows.map(x=>x.remoteId),
    ['remote-aaaa-0001','remote-bbbb-0001']);
  assert.equal(validateInventoryObservation(account,batch([
    item('duplicate'),item('duplicate','remote-bbbb-0001')
  ])).code,'INVENTORY_ITEM_AMBIGUOUS');
});

test('I04 F: 1,250 generator synthetic fixture remains bounded and retains independent IDs',()=>{
  const entries=Array.from({length:1250},(_,i)=>item(
    'gen-'+String(i).padStart(4,'0'),'remote-'+String(i).padStart(8,'0')
  ));
  const r=reconcileInventory([],account,batch(entries));
  assert.equal(r.ok,true);
  assert.equal(r.rows.length,1250);
  assert.equal(new Set(r.rows.map(x=>x.slug)).size,1250);
  assert.equal(r.rows.every(x=>x.management==='OBSERVED_ONLY'),true);
  assert.equal(validateInventoryObservation(account,batch([...entries,...entries])).ok,false);
  assert.equal(validateInventoryObservation(account,batch(Array.from({length:5001},(_,i)=>item(
    'gen-'+String(i).padStart(5,'0'),'remote-'+String(i).padStart(8,'0')
  )))).ok,false);
});

test('P51-03 I04 F: page cannot smuggle provider ownership or unlimited search',()=>{
  const api={runtime:{id:'persona-route-manager@local',
    getURL:path=>'moz-extension://fixture/'+path}};
  const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#generators'};
  assert.equal(validateInventoryMessage(api,sender,{type:'LIST_INVENTORY',params:{
    query:'gen',ownerState:'ALL',limit:50,offset:0
  }}).ok,true);
  assert.equal(validateInventoryMessage(api,sender,{type:'SYNC_ACCOUNT',params:{
    accountId:account.accountId,expectedRevision:3
  }}).ok,true);
  assert.equal(validateInventoryMessage(api,sender,{type:'SYNC_ACCOUNT',params:{
    accountId:account.accountId,expectedRevision:3,proof:batch([])
  }}).code,'INVALID_PARAMS');
  assert.equal(validateInventoryMessage(api,sender,{type:'LIST_INVENTORY',
    params:{query:'a'.repeat(81)}}).code,'INVALID_PARAMS');
  assert.equal(validateInventoryMessage(api,{id:'other',url:sender.url},
    {type:'LIST_INVENTORY'}).code,'UNTRUSTED_SENDER');
  assert.equal(validateInventoryMessage(api,sender,{type:'WRITE_GENERATOR'}).code,'CAPABILITY_OFF');
});

test('I04 F: packaged entry points include read-only worker and UI, no unsafe observer',async()=>{
  const urls=['../src/runtime/entry.mjs','../src/runtime/overlay.mjs',
    '../src/runtime/inventory-boundary.mjs','../src/ui/index.html'];
  const [entry,overlay,boundary,html]=await Promise.all(
    urls.map(u=>readFile(new URL(u,import.meta.url),'utf8')));
  assert.ok(entry.indexOf('account-boundary.mjs')<entry.indexOf('inventory-boundary.mjs'));
  assert.match(overlay,/'inventory.mjs', 'inventory-boundary.mjs'/);
  assert.doesNotMatch(boundary,/fetch\s*\(|sendNativeMessage|XMLHttpRequest/);
  for (const id of ['pcms-generator-query','pcms-generator-owner-filter','pcms-generators-rows',
    'pcms-generator-prev','pcms-generator-sync'])assert.match(html,new RegExp('id="'+id+'"'));
  // Never let a staged runtime file silently replace its UI counterpart.
  assert.match(html,/src="accounts-view\.mjs"/);
  assert.match(html,/src="inventory-view\.mjs"/);
  assert.doesNotMatch(html,/src="accounts\.mjs"/);
  assert.doesNotMatch(html,/src="inventory\.mjs"/);
  assert.match(overlay,/'accounts.mjs', 'account-boundary.mjs', 'inventory.mjs'/);
  assert.match(html,/id="navigation-status"[^>]*>Remote actions held until verified<\/div>/);
});

test('I17 F/X: global ordering before pagination with a deterministic slug tie-break',()=>{
  const rows=Array.from({length:1250},(_,i)=>({
    slug:'gen-'+String(1249-i).padStart(4,'0'),
    accountId:i%2===0?'account_zeta_02':'account_alpha_01',
    visibility:i%3===0?'PUBLIC':'UNLISTED',
    source:i%5===0?'READY':'SOURCE_PENDING',
    lastObservedAt:1791841200000+(i%4)*1000,
    ownerState:'OBSERVED_OWNER',revision:1
  }));
  const page=(options={})=>selectInventoryPage(rows,{offset:0,limit:50,...options});
  const a=page({sortBy:'slug'}),b=selectInventoryPage(rows,{offset:50,limit:50,sortBy:'slug'});
  assert.equal(a.ok,true);
  assert.deepEqual(a.items.map(x=>x.slug),Array.from({length:50},(_,i)=>'gen-'+String(i).padStart(4,'0')));
  assert.deepEqual(b.items.map(x=>x.slug),Array.from({length:50},(_,i)=>'gen-'+String(i+50).padStart(4,'0')));
  assert(a.items.at(-1).slug<b.items[0].slug);
  const reverse=page({sortBy:'slug',sortDirection:'desc'});
  assert.deepEqual(reverse.items.map(x=>x.slug),Array.from({length:50},(_,i)=>'gen-'+String(1249-i).padStart(4,'0')));
  const byAccount=page({sortBy:'account'});
  assert.equal(byAccount.items.every(x=>x.accountId==='account_alpha_01'),true);
  assert.deepEqual(byAccount.items.map(x=>x.slug),byAccount.items.map(x=>x.slug).toSorted(),
    'same-account page must tie-break by stable slug');
  const observed=page({sortBy:'observed',sortDirection:'desc'});
  assert.equal(observed.items.every(x=>rows.find(r=>r.slug===x.slug).lastObservedAt===1791841203000),true);
  assert.deepEqual(rows.slice(0,1).map(x=>x.slug),['gen-1249'],'sort may not mutate source');
});
test('I17 X: unknown sort, oversized page or direction fails closed',()=>{
  const rows=[{slug:'a',accountId:'account_alpha_01'}];
  for(const options of [{sortBy:'__proto__'},{sortDirection:'up'},
    {offset:-1},{limit:101},{sortBy:[]},{sortDirection:null}]){
    assert.equal(selectInventoryPage(rows,options).code,'INVALID_INVENTORY_QUERY');
  }
  const api={runtime:{id:'persona-route-manager@local',getURL:path=>'moz-extension://fixture/'+path}};
  const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#generators'};
  assert.equal(validateInventoryMessage(api,sender,{type:'LIST_INVENTORY',
    params:{sortBy:'observed',sortDirection:'desc',limit:50}}).ok,true);
  for(const bad of [{sortBy:'route'},{sortDirection:'RANDOM'},{sortBy:42},
    {sortDirection:'asc',proof:'forged-owner'}]){
    assert.equal(validateInventoryMessage(api,sender,{type:'LIST_INVENTORY',params:bad}).code,'INVALID_PARAMS');
  }
});
