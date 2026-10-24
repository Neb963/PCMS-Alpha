import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAccountStore,publicAccount} from '../src/runtime/accounts.mjs';
import {createInventoryBoundary} from '../src/runtime/inventory-boundary.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {createAccountBoundary,inspectAccountProjection} from '../src/runtime/account-boundary.mjs';

const id='account_j01_alpha',persona='persona-j01-alpha',fp='a'.repeat(64);
const api={runtime:{id:'persona-route-manager@local',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
async function setup(){
 const db=fakeDatabase(),accounts=createAccountStore(db);
 await accounts.apply({type:'ENROLL',accountId:id,personaUid:persona,expectedRevision:0});
 const pending=await accounts.apply({type:'VERIFY',accountId:id,expectedRevision:1,requireInventory:true,
   proof:{source:'GUARDED_SESSION_READBACK',verified:true,personaUid:persona,
     principalFingerprint:fp,observationId:'identity_j01_01'}});
 return {db,accounts,pending:pending.account};
}
test('J01 real identity is not operational readiness until complete current inventory commits',async()=>{
 const {db,accounts,pending}=await setup();
 assert.equal(pending.state,'INVENTORY_PENDING');
 assert.equal(publicAccount(pending).providerWrites,'OFF');
 assert.equal((await accounts.confirmInventory(id,pending.revision)).code,'CURRENT_INVENTORY_REQUIRED');
 let complete=false;
 const ready={ready:true,personaUid:persona,cookieStoreId:'fixture-container',routeId:'fixture-route'};
 const boundary=createInventoryBoundary(api,{open:async()=>db,
   guard:()=>({getSafeRouteReadiness:async()=>ready}),
   inventoryReader:async()=>({source:'GUARDED_PERCHANCE_READBACK',complete,accountId:id,
     personaUid:persona,accountRevision:pending.revision,bindingVersion:pending.bindingVersion,
     principalFingerprint:fp,observationId:'inventory_j01_'+complete,observedAt:1000,generators:[]})});
 const sync=()=>boundary.run({type:'SYNC_ACCOUNT',params:{accountId:id,expectedRevision:pending.revision}},sender);
 assert.equal((await sync()).ok,false);
 assert.equal((await accounts.get(id)).account.state,'INVENTORY_PENDING');
 complete=true;assert.equal((await sync()).ok,true);
 const confirmed=(await accounts.get(id)).account;
 assert.equal(confirmed.state,'VERIFIED');assert.equal(confirmed.revision,pending.revision);
 const mark=db.read('meta','inventory-batch:'+id);
 assert.equal(mark.accountRevision,confirmed.revision);assert.equal(mark.bindingVersion,confirmed.bindingVersion);
 const summary=(await createInventoryStore(db).accountSummaries()).summaries[id];
 assert.equal(summary.known,true);assert.equal(summary.verifiedOwned,0,'confirmed empty inventory differs from unknown');
});
test('J01 safe local Archive and inspection remain usable while donor is unavailable',async()=>{
 const {db,accounts,pending}=await setup();
 const boundary=createAccountBoundary(api,{open:async()=>db,guard:()=>null});
 const result=await boundary.run({type:'ARCHIVE',params:{accountId:id,expectedRevision:pending.revision}},sender);
 assert.equal(result.ok,true);assert.equal(result.state,'ARCHIVED');
 assert.equal((await accounts.get(id)).account.state,'ARCHIVED');
 const inspection=await boundary.run({type:'INSPECT_ACCOUNT',params:{accountId:id}},sender);
 assert.equal(inspection.ok,true);assert.equal(inspection.account.state,'ARCHIVED');
 assert.ok(!JSON.stringify(inspection).includes(fp),'no session fingerprint in operator projection');
 assert.equal((await boundary.run({type:'INSPECT_ACCOUNT',params:{accountId:id}},
   {...sender,url:'https://perchance.org/'})).code,'UNTRUSTED_SENDER');
});
test('J01 route inspector exposes only the selected account public observations and history',()=>{
 const account={accountId:id,personaUid:persona,bindingId:'binding_j01_01',state:'VERIFIED',revision:3,bindingVersion:1};
 const result=inspectAccountProjection(account,{ok:true,ledger:{owners:{'IPv4:45.83.1.1':id,
   'IPv4:45.83.1.2':'account_other_01'},bindings:{binding_j01_01:{accountId:id,personaUid:persona,
     pin:'ACTIVE',routeId:'route_j01_01',exits:[{family:'IPv4',address:'45.83.1.1'}],
     ipv6Disposition:'BLOCKED_VERIFIED',verifiedAtMs:123,contextId:'private-container',evidenceId:'internal-evidence'}}}});
 assert.deepEqual(result.protection.historicalExits,[{family:'IPv4',address:'45.83.1.1'}]);
 assert.equal(result.protection.state,'ACTIVE');
 for(const secret of ['private-container','internal-evidence','45.83.1.2'])
   assert.ok(!JSON.stringify(result).includes(secret));
});
