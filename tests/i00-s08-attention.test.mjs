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
  // C-68: a same-severity repeat is counted, not renotified or un-reviewed.
  const repeat=await store.recordNotice({scopeId:id,code,severity:'SERIOUS',revision:2});
  assert.equal(repeat.ok,true);assert.equal(repeat.notify,false);
  assert.deepEqual((await store.listNotices()).notices.map(n=>[n.reviewed,n.count]),[[true,2]]);
});
test('C-69: only verified recovery resolves; history kept; recurrence reopens as actionable',async()=>{
  const db=fakeDatabase(),store=createCanonicalStore(db);
  const n={scopeId:'account_alpha_01',code:'ROUTE_UNAVAILABLE'};
  await store.recordNotice({...n,severity:'ACTION_REQUIRED',revision:1});
  await store.acknowledgeNotice({...n,expectedRevision:1});
  assert.equal((await store.resolveNotice({...n,evidence:'elapsed'})).code,'INVALID_NOTICE');
  assert.equal((await store.resolveNotice({...n,evidence:'ROUTE_HEALTH_OBSERVED'})).resolved,true);
  assert.equal((await store.listNotices()).notices.length,0);
  const history=await store.listNotices(50,{includeResolved:true});
  assert.equal(history.notices[0].state,'RESOLVED');assert.equal(history.resolved,1);
  assert.equal((await store.noticeSummary()).counts.resolved,1);
  const again=await store.recordNotice({...n,severity:'ACTION_REQUIRED',revision:2});
  assert.equal(again.changed,true);assert.equal(again.event,'REOPENED');
  const reopened=(await store.listNotices()).notices[0];
  assert.equal(reopened.state,'ACTIVE');assert.equal(reopened.reviewed,false);assert.equal(reopened.count,2);
  // Escalation of a reviewed incident is a material change.
  await store.acknowledgeNotice({...n,expectedRevision:2});
  const worse=await store.recordNotice({...n,severity:'SERIOUS',revision:3});
  assert.equal(worse.changed,true);assert.equal((await store.listNotices()).notices[0].reviewed,false);
});
test('C-70: legacy ignored records are projected as reviewed and stay visible',async()=>{
  const db=fakeDatabase(),store=createCanonicalStore(db);
  await new Promise(r=>{const t=db.transaction(['meta'],'readwrite');t.oncomplete=r;
    t.objectStore('meta').put({key:'attention:account_alpha_01:SOURCE_HELD',scopeId:'account_alpha_01',
      code:'SOURCE_HELD',severity:'SERIOUS',revision:4,ignored:true,reviewed:false});});
  const list=await store.listNotices();
  assert.deepEqual(list.notices.map(x=>[x.code,x.reviewed,x.state]),[['SOURCE_HELD',true,'ACTIVE']]);
  assert.equal((await store.noticeSummary()).counts.serious,1);
  const ignored=await store.ignoreNotice({scopeId:'account_alpha_01',code:'SOURCE_HELD',expectedRevision:4});
  assert.equal(ignored.stillActionable,true);assert.equal((await store.listNotices()).notices.length,1);
});
test('C-68: one desktop notification for a provider outage across many accounts',async()=>{
  const db=fakeDatabase(),store=createCanonicalStore(db);let notifications=0;
  const {createNoticeDispatcher}=await import('../src/runtime/notices.mjs');
  const d=createNoticeDispatcher({runtime:{getURL:p=>p},notifications:{create:async()=>{notifications++;}}},store);
  for(let i=0;i<60;i++)
    await d.emit({scopeId:'account_'+String(i).padStart(4,'0')+'_x',code:'ROUTE_UNAVAILABLE',
      severity:'ACTION_REQUIRED',revision:1,cause:'PROVIDER_ROUTE_DOMAIN'});
  assert.equal(notifications,1);
  assert.equal((await store.listNotices(100)).notices.length,60,'every affected scope stays visible');
  const g=groupNotices((await store.listNotices(100)).notices);
  assert.equal(g.length,1);assert.equal(g[0].scopes.length,60);
});
test('C-68 grouped by cause: unrelated root causes on one scope stay separate',()=>{
  const g=groupNotices([{scopeId:'scope_1234',code:'SOURCE_HELD',severity:'ACTION_REQUIRED'},
    {scopeId:'scope_1234',code:'ROUTE_UNAVAILABLE',severity:'SERIOUS'},
    {scopeId:'scope_9999',code:'ROUTE_UNAVAILABLE',severity:'ACTION_REQUIRED'},
    {scopeId:'scope_5678',code:'RESTORE_IN_PROGRESS',severity:'INFORMATIONAL'}]);
  assert.equal(g.length,4);assert.equal(g[0].severity,'SERIOUS');
  assert.equal(g[0].cause,'ROUTE_UNAVAILABLE:scope_1234');
  assert.deepEqual(g[0].scopes,['scope_1234']);
  assert.ok(g.some(x=>x.cause==='ROUTE_UNAVAILABLE:scope_9999'));
  assert.ok(g.some(x=>x.cause==='SOURCE_HELD:scope_1234'));
  assert.ok(g.some(x=>x.cause==='RESTORE_IN_PROGRESS:scope_5678'));
});
