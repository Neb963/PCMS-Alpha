import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {emptyShadow,validShadow,REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
test('J07 global managed view and independent release/refresher/attention/observed facets never inherit one workflow label or grant write authority',async()=>{
 const db=fakeDatabase(),accountId='account_j07_facets',slug='j07-facet-one';
 const shadow=emptyShadow();shadow.lastTurnAt=123456;shadow.provider.state='HEALTHY';shadow.accounts[accountId]={health:'HEALTHY',paused:true};
 shadow.rows=[{stableId:'generator_j07_facets',slug,accountId,phase:'ACTIVE',ordinal:1,activeRemaining:9000,sleepRemaining:0,ownerVerified:true,releaseVerified:true,listing:'PUBLIC'}];assert.equal(validShadow(shadow),true);
 const tx=db.transaction('meta','readwrite'),meta=tx.objectStore('meta');
 for(const row of [
  {key:'inventory:'+slug,generator:{slug,accountId,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',management:'MANAGED_CREATED',revision:4,lastObservedAt:123000}},
  {key:'inventory:j07-unmanaged',generator:{slug:'j07-unmanaged',accountId,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',management:'OBSERVED_ONLY',revision:1}},
  {key:'release:'+slug,release:{slug,state:'CONFIRMED_PUBLIC'}},{key:'ai-job:'+slug,job:{slug,state:'HELD'}},
  {key:REFRESHER_KEY,state:shadow},
  {key:'attention:active',state:'ACTIVE',code:'SOURCE_CONFLICT',target:{kind:'GENERATOR',id:slug}},
  {key:'attention:resolved',state:'RESOLVED',code:'OLD_RESOLVED',target:{kind:'GENERATOR',id:slug}}
 ])meta.put(row);await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j});
 const store=createInventoryStore(db),all=await store.workspace({limit:1}),managed=await store.workspace({management:'MANAGED',limit:1});
 assert.equal(all.total,2);assert.equal(managed.total,1);const g=managed.items[0];assert.equal(g.slug,slug);
 assert.equal(g.workflowStatus,'HELD');assert.equal(g.releaseState,'CONFIRMED_PUBLIC');assert.equal(g.refresher.phase,'ACTIVE');assert.deepEqual(g.refresher.blockers,['ACCOUNT_PAUSE']);
 assert.deepEqual(g.attention,['SOURCE_CONFLICT']);assert.equal(g.lastObservedAt,123000);assert.equal(g.providerWrites,'OFF');assert.equal(JSON.stringify(g).includes('OLD_RESOLVED'),false);
 const unobserved=(await store.workspace({query:'j07-unmanaged'})).items[0];assert.equal(unobserved.refresher,null);assert.deepEqual(unobserved.attention,[]);assert.equal(unobserved.releaseState,'NOT_RECORDED');
 assert.equal((await store.workspace({management:'anything'})).code,'INVALID_INVENTORY_QUERY');
});
