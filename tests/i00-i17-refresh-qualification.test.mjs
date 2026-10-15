import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefreshQualification,evaluateQualification} from '../src/runtime/refresh-qualification.mjs';
import {waitForOwnedEditor} from '../src/runtime/editor-readiness.mjs';
import {validateRefresherMessage} from '../src/runtime/refresher-boundary.mjs';
const slug='ordinary-reviewed-generator',principal='a'.repeat(64),remoteId='public_target';
function fixture(){
  let now=100000,record=null,release=null,pjs='before',privacy='PUBLIC',badOwner=false,feedOK=true,routeOK=true,writes=0;
  const row={slug,stableId:'row_1',remoteId,accountId:'account_1',personaUid:'persona_1',bindingVersion:1,ownerVerified:true};
  const account={personaUid:row.personaUid,verifiedIdentity:true,principalFingerprint:principal};
  const store={read:async()=>({ok:true,record}),release:async()=>({ok:true,record:release}),
    put:async(_,rev,r)=>{assert.equal(rev,record?.revision||0);record={...r,revision:rev+1};return {ok:true,record};}};
  const guard=()=>({getSafeRouteReadiness:async()=>({ready:routeOK,routeId:'protected',cookieStoreId:'container'}),
    observeReadOnly:async()=>({ok:true,principalFingerprint:badOwner?'b'.repeat(64):principal,
      original:{remotePublicId:remoteId,ownerResult:'IS_OWNER',visibility:privacy,pjs,html:'<p>example</p>',assets:[]}}),
    observeMonitoring:async()=>({ok:feedOK,principalFingerprint:principal,complete:feedOK,items:[{slug,views:1}]}),
    runReleaseStep:async()=>{writes++;throw Error('must never mutate');}});
  const service=createRefreshQualification({store,guard,clock:()=>now,newId:()=> 'observation_1'});
  return {run:(type,extra={})=>service.run(type,{row,account,expectedRevision:record?.revision||0,...extra}),
    get record(){return record;},get writes(){return writes;},
    change:()=>{now+=60001;pjs='meaningfully updated';},badOwner:()=>{badOwner=true;},badRoute:()=>{routeOK=false;},
    noFeed:()=>{feedOK=false;},
    approve:()=>{const r=record;release={state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',dispatchPossible:true,
      sourceFingerprint:r.after.fingerprint,observedAt:now,releaseId:'release_1',
      approval:{previousFingerprint:r.before.fingerprint,remotePublicId:remoteId,principalFingerprint:principal}};now+=60001;}};
}
test('I17 P54-05 H-04 preparation records independent before/after facts; source or feed alone cannot qualify',async()=>{
  const f=fixture();
  assert.equal((await f.run('BEGIN_QUALIFICATION',{confirmation:'OBSERVE '+slug})).qualification.state,'READY_FOR_OPERATOR_UPDATE');
  assert.equal((await f.run('OBSERVE_QUALIFICATION')).code,'QUALIFICATION_BACKOFF');
  f.change();
  assert.equal((await f.run('OBSERVE_QUALIFICATION')).qualification.state,'UNVERIFIED_UPDATE');
  f.approve();
  const q=(await f.run('OBSERVE_QUALIFICATION')).qualification;
  assert.equal(q.state,'RECENT_PRESENCE_OBSERVED');assert.equal(q.approvedEffectConfirmed,true);
  assert.equal(q.fleetEnabled,false);assert.equal(q.causationProven,false);assert.equal(f.writes,0);
  assert.notEqual(q.before.fingerprint,q.after.fingerprint);assert.equal(q.after.feed.rank,1);
  assert.equal(JSON.stringify(q).includes('meaningfully updated'),false);
});
test('I17 X wrong owner, route, target, approval, stale or incomplete feed never imply qualification',async()=>{
  for(const what of ['badOwner','badRoute']){const f=fixture();f[what]();assert.equal((await f.run('BEGIN_QUALIFICATION',{confirmation:'OBSERVE '+slug})).ok,false);assert.equal(f.record,null);}
  const f=fixture();await f.run('BEGIN_QUALIFICATION',{confirmation:'OBSERVE '+slug});f.change();await f.run('OBSERVE_QUALIFICATION');f.approve();f.noFeed();
  const q=(await f.run('OBSERVE_QUALIFICATION')).qualification;assert.equal(q.state,'EFFECT_CONFIRMED');assert.equal(q.recentPresenceObserved,false);
  const baseline={fingerprint:'a'.repeat(64),observedAt:100,remoteId,principalFingerprint:principal};
  const after={fingerprint:'b'.repeat(64),observedAt:200,visibility:'PUBLIC',feed:{complete:true,present:true,rank:1,observedAt:200}};
  const release={state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',dispatchPossible:true,sourceFingerprint:after.fingerprint,observedAt:200,approval:{previousFingerprint:baseline.fingerprint,remotePublicId:remoteId,principalFingerprint:principal}};
  for(const broken of [{...release,dispatchPossible:false},{...release,sourceFingerprint:'c'.repeat(64)},
    {...release,approval:{...release.approval,remotePublicId:'other'}}])assert.equal(evaluateQualification(baseline,after,broken).approvedEffectConfirmed,false);
  assert.equal(evaluateQualification(baseline,{...after,feed:{...after.feed,observedAt:199}},release).recentPresenceObserved,false);
});
test('I17 qualification port rejects forged provider evidence and untrusted callers',()=>{
  const api={runtime:{id:'self',getURL:p=>'moz-extension://test/'+p}},sender={id:'self',url:'moz-extension://test/pcms/index.html'};
  for(const params of [{stableId:'row',sourceFingerprint:'a'.repeat(64)},{stableId:'row',allow:true}])
    assert.equal(validateRefresherMessage(api,sender,{type:'GET_QUALIFICATION',params}).ok,false);
  assert.equal(validateRefresherMessage(api,{id:'self',url:'https://perchance.org/'},{type:'GET_QUALIFICATION',params:{stableId:'row'}}).ok,false);
});
test('I17 readiness waits for native document before first effect; lease change or timeout stops it',async()=>{
  for(const scenario of ['ready','lease','timeout','human']){
    let now=0,probes=0;
    const api={tabs:{get:async()=>({url:'https://perchance.org/'+slug+'#edit',cookieStoreId:'container'})},
      sessions:{getTabValue:async()=>({nonce:'n',humanIntent:scenario==='human'})},
      scripting:{executeScript:async()=>{probes++;return [{frameId:0,result:scenario==='ready'&&probes===3}];}}};
    const result=await waitForOwnedEditor(api,{tabId:1,slug,cookieStoreId:'container',nonce:'n',validate:async()=>scenario!=='lease'||now<100},
      {clock:()=>now,pause:async ms=>{now+=ms;},timeoutMs:400});
    assert.equal(result.ok,scenario==='ready',scenario);
    assert.ok(probes<=4);if(scenario==='ready')assert.equal(probes,3);
  }
});
