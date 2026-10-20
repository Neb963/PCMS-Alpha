import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {groupNotices} from '../src/ui/attention-model.mjs';
test('C-70 review persists but does not dismiss or resolve the incident',async()=>{
  const db=fakeDatabase(),store=createCanonicalStore(db);
  const id='account_alpha_01',code='ROUTE_UNAVAILABLE';
  assert.equal((await store.recordNotice({scopeId:id,code,severity:'SERIOUS',revision:1})).ok,true);
  const marked=await store.acknowledgeNotice({scopeId:id,code,expectedRevision:1});
  assert.equal(marked.ok,true);assert.equal(marked.holdReleased,false);
  assert.equal(marked.stillActionable,true);
  assert.deepEqual((await store.listNotices()).notices.map(n=>[n.code,n.reviewed]),[[code,true]]);
  assert.equal((await store.acknowledgeNotice({scopeId:id,code,expectedRevision:2})).code,'STALE_REVISION');
  assert.equal((await store.recordNotice({scopeId:id,code,severity:'SERIOUS',revision:2})).ok,true);
  assert.equal((await store.listNotices()).notices[0].reviewed,false);
});
test('C-68 grouped attention retains independent problem details and severity',()=>{
  const g=groupNotices([{scopeId:'scope_1234',code:'SOURCE_HELD',severity:'ACTION_REQUIRED'},
    {scopeId:'scope_1234',code:'ROUTE_UNAVAILABLE',severity:'SERIOUS'},
    {scopeId:'scope_5678',code:'RESTORE_IN_PROGRESS',severity:'INFORMATIONAL'}]);
  assert.equal(g.length,2);assert.equal(g[0].severity,'SERIOUS');
  assert.equal(g[0].notices.length,2);assert.equal(g[1].scopeId,'scope_5678');
});
