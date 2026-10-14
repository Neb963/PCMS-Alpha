import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createStagingBoundary,validateStagingMessage} from '../src/runtime/staging-boundary.mjs';
globalThis.crypto??=webcrypto;
const api={runtime:{id:'persona-route-manager@local',getURL:x=>'moz-extension://fixture/'+x},
  storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#generators'};
const encode=s=>Buffer.from(s).toString('base64');
const acct={accountId:'account_0001',personaUid:'persona-01234567',
  revision:3,bindingVersion:2,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:2,principalFingerprint:'a'.repeat(64)}};
const item={requestedSlug:'stage-one',remoteId:'public_001',state:'SOURCE_PENDING'};
const link={folder:'gens/stage-one',accountId:acct.accountId,personaUid:acct.personaUid,
  bindingVersion:2,remoteId:item.remoteId,readyAtInspection:false};
const files=()=>[{path:'main.pjs',base64:encode('let x = 2;')},
  {path:'index.html',base64:encode('<main>draft</main>')},
  {path:'src/one.bin',base64:Buffer.from([0,127,255]).toString('base64')},
  {path:'src/empty.txt',base64:''}];
function fixture({gate=false,lostAck=false,denyRoute=false,drift=false,dirtyOriginal=false,
  release=false,breakReadback=false,editorDirty=false,
  routeLossAfterPrepare=false,wrongPrincipal=false,slug='stage-one',
  pilotClock=()=>performance.now()}={}){
  let current=null,version=0,routeChecks=0;
  const ownItem={...item,requestedSlug:slug},ownLink={...link,folder:'gens/'+slug};
  const trace=[],remote=[];
  const stage={
    list:async()=>({ok:true,items:current?[{ok:true,...current}]:[]}),
    get:async()=>current?{ok:true,...current}:{ok:false,code:'NOT_FOUND'},
    getFull:async()=>current?{ok:true,record:current}:{ok:false,code:'NOT_FOUND'},
    async pin(args){
      if(current)return {ok:false,code:'EXISTS'};
      current={slug:args.slug,accountId:acct.accountId,personaUid:acct.personaUid,
        accountRevision:acct.revision,bindingVersion:acct.bindingVersion,
        principalFingerprint:acct.identity.principalFingerprint,
        remotePublicId:item.remoteId,nonce:args.nonce,
        sourceFolder:args.source.folder,gitFingerprint:args.source.fingerprint,
        testingSha:args.source.testingSha,
        candidate:args.candidate,previous:args.previous,revision:1,state:'PINNED'};
      return {ok:true,state:'PINNED',revision:1,candidateFingerprint:args.candidate.fingerprint};
    },
    async move(slug,revision,state,{reason,tab,verified}={}){
      trace.push(state);
      if(!current||revision!==current.revision)return {ok:false,code:'STALE_REVISION'};
      if(state==='SOURCE_VERIFIED'&&verified?.fingerprint!==current.candidate.fingerprint)
        return {ok:false,code:'UNVERIFIED'};
      current={...current,state,revision:revision+1,reason,
        ...(tab?{tab}:{} )};
      return {ok:true,state,revision:current.revision,candidateFingerprint:current.candidate.fingerprint};
    },
    recover:async()=>({ok:true,held:0})
  };
  const observer=async(_uid,_identity,slug)=>{
    if(slug!==ownItem.requestedSlug)return {ok:false,code:'INVALID_TARGET'};
    const pjs=remote.length?'let x = 2;':dirtyOriginal?'// human edits':'';
    const html=remote.length?'<main>draft</main>':'';
    return {ok:true,principalFingerprint:wrongPrincipal?'b'.repeat(64):acct.identity.principalFingerprint,
      original:{remotePublicId:item.remoteId,ownerResult:'IS_OWNER',visibility:'UNLISTED',
        pjs,html,assets:remote.length?
          (breakReadback?files().slice(2,3):files().slice(2)):[]}};
  };
  const guard={getSafeRouteReadiness:async()=>{routeChecks++;return (denyRoute||
    (routeLossAfterPrepare&&routeChecks>=4))?
    {ready:false,code:'DIRECT_FORBIDDEN'}:
    {ready:true,routeId:'wg-a',cookieStoreId:'cookie-1'};},
    observeReadOnly:observer,
    async runStageStep(){
      assert.equal(trace.at(-1),'DISPATCH_POSSIBLE');
      remote.push('save');return lostAck?{ok:false,code:'ACK_LOST'}:
        {ok:true,tab:{tabId:122,ownershipNonce:current.nonce}};
    },
    async inspectStageEditor() {
      return editorDirty?{ok:false,code:'EDITOR_UNKNOWN'}:
        {ok:true,source:'GUARDED_EDITOR_CLEAN',clean:true};
    },
    async releaseStagingTab(){
      trace.push('UNTAG_ATTEMPT');
      return release?{ok:true}:{ok:false,code:'UNTAG_UNKNOWN'};
    }
  };
  const inspect=async q=>({
    ok:true,ready:true,source:'READY',folder:q.folder,head:'f'.repeat(40),
    fingerprint:drift&&q.includeSourceBytes!==true?'e'.repeat(64):'d'.repeat(64),
    testingSha:'c'.repeat(64),sourceBytes:files()
  });
  const boundary=createStagingBoundary(api,{open:async()=>({}),guard:()=>guard,
    storeFactory:()=>stage,supplyLookup:async()=>({ok:true,account:acct,item:ownItem,link:ownLink}),
    effectGate:()=>gate,pilotClock,inspect});
  const run=(type,params={})=>boundary.run({type,params},sender);
  const pin=()=>run('PIN_STAGE',{slug,token:'read-only-git-token'});
  const dispatch=()=>run('STAGE_PRIVATE',{slug,token:'read-only-git-token',
    expectedRevision:current.revision});
  const reconcile=()=>run('RECONCILE_STAGE',{slug,
    expectedRevision:current.revision});
  const handoff=()=>run('HANDOFF_STAGE',{slug,
    expectedRevision:current.revision});
  return {run,pin,dispatch,reconcile,handoff,remote,trace,stage,get current(){return current;}};
}
test('P51-03 I09 rejects hostile sender, paths, token confusion and forged editor commands',()=>{
  assert.equal(validateStagingMessage(api,{...sender,url:'https://evil.test'},
    {type:'STAGE_PRIVATE',params:{slug:'stage-one',token:'read-only-git-token',expectedRevision:1}}).code,
    'UNTRUSTED_SENDER');
  for(const params of [{slug:'../z',token:'read-only-git-token'},
    {slug:'stage-one',token:'read-only-git-token',ownerApproved:true}])
    assert.equal(validateStagingMessage(api,sender,{type:'PIN_STAGE',params}).ok,false);
  assert.equal(validateStagingMessage(api,sender,{type:'RELEASE_PUBLIC',
    params:{slug:'stage-one'}}).code,'INVALID_MESSAGE');
});
test('P52-04 F: pin READY bytes with prior-empty snapshot; old SOURCE_PENDING link is permitted',async()=>{
  const f=fixture();
  const pinned=await f.pin();
  assert.equal(pinned.ok,true,pinned.code);
  assert.equal(f.current.state,'PINNED');
  assert.equal(f.current.previous.totalBytes,0);
  assert.equal(f.current.candidate.files.length,4);
  assert.equal(f.remote.length,0);
  const held=await f.dispatch();
  assert.equal(held.code,'PROVIDER_ACTIVATION_HELD');
  assert.deepEqual(f.trace,[]);
  assert.equal(f.remote.length,0);
});
test('P51-05/P52-07 F: no provider operation with unknown protected route',async()=>{
  const f=fixture({gate:true,denyRoute:true});
  assert.equal((await f.pin()).code,'DIRECT_FORBIDDEN');
  assert.equal(f.remote.length,0);
});
test('P51-04/P52-04 F: one guarded effect after durable marker, independent source readback',async()=>{
  const f=fixture({gate:true});
  assert.equal((await f.pin()).ok,true);
  const ack=await f.dispatch();
  assert.equal(ack.state,'SAVED_UNVERIFIED',ack.code);
  assert.deepEqual(f.trace,['PREPARED','DISPATCH_POSSIBLE','SAVED_UNVERIFIED']);
  assert.equal(f.remote.length,1);
  const verified=await f.reconcile();
  assert.equal(verified.state,'SOURCE_VERIFIED',verified.code);
  assert.equal(f.remote.length,1);
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
});
test('P52-04 negative: lost save ACK is held and no second dispatch',async()=>{
  const f=fixture({gate:true,lostAck:true});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.dispatch()).code,'STAGING_EFFECT_UNCERTAIN');
  assert.equal(f.current.state,'HELD_UNCERTAIN');
  assert.equal(f.remote.length,1);
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
  assert.equal(f.remote.length,1);
});
test('P52-04 negative: saved asset omitted cannot confirm full source',async()=>{
  const f=fixture({gate:true,breakReadback:true});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.dispatch()).state,'SAVED_UNVERIFIED');
  const bad=await f.reconcile();
  assert.equal(bad.code,'SOURCE_UNVERIFIED');
  assert.deepEqual(bad.paths,['src/empty.txt']);
  assert.equal(f.current.state,'SAVED_UNVERIFIED');
  assert.equal(f.remote.length,1);
});
test('P51-05 F: durable handoff intent before tag release, uncertainty cannot re-admit',async()=>{
  const f=fixture({gate:true,release:false});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.handoff()).code,'HANDOFF_RELEASE_UNVERIFIED');
  assert.deepEqual(f.trace,['HANDOFF_REQUESTED','UNTAG_ATTEMPT']);
  assert.equal(f.current.state,'HANDOFF_REQUESTED');
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
  assert.equal(f.remote.length,0);
  const good=fixture({release:true});
  assert.equal((await good.pin()).ok,true);
  assert.equal((await good.handoff()).state,'HUMAN_OWNED');
  assert.deepEqual(good.trace,['HANDOFF_REQUESTED','UNTAG_ATTEMPT','HUMAN_OWNED']);
  assert.equal((await good.dispatch()).code,'RECONCILIATION_REQUIRED');
});
test('P52-04 F: relevant Git source drift after pin prevents stage mutation',async()=>{
  const f=fixture({gate:true,drift:true});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.dispatch()).code,'READY_REVOKED_OR_CHANGED');
  assert.equal(f.remote.length,0);
});

test('P52-07 negative: saved bytes match but dirty or unknown editor blocks acceptance',async()=>{
  const f=fixture({gate:true,editorDirty:true});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.dispatch()).state,'SAVED_UNVERIFIED');
  assert.equal((await f.reconcile()).code,'EDITOR_UNKNOWN');
  assert.equal(f.current.state,'SAVED_UNVERIFIED');
  assert.equal(f.remote.length,1);
});

test('X-I09 adversarial: nonempty private target or wrong principal never pins or mutates',async()=>{
  for(const variant of [{dirtyOriginal:true},{wrongPrincipal:true}]){
    const f=fixture({gate:true,...variant});
    const response=await f.pin();
    assert.equal(response.ok,false,JSON.stringify(variant));
    assert.deepEqual(f.trace,[]);
    assert.deepEqual(f.remote,[]);
  }
});
test('X-I09 adversarial: route loss after PREPARED leaves no possible dispatch or fallback',async()=>{
  const f=fixture({gate:true,routeLossAfterPrepare:true});
  assert.equal((await f.pin()).ok,true);
  const response=await f.dispatch();
  assert.equal(response.code,'PREPARED_GUARD_CHANGED');
  assert.deepEqual(f.trace,['PREPARED']);
  assert.deepEqual(f.remote,[]);
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
});

test('I17 F/X: one-shot private disposable stage requires exact human authorization and no retry',async()=>{
  const slug='pcms-test-disposable-stage-0001',f=fixture({slug,gate:false});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  const arm=confirmation=>f.run('ARM_DISPOSABLE_STAGE',{
    slug,expectedRevision:f.current.revision,confirmation});
  assert.equal((await arm('STAGE something-else')).code,'PILOT_CONFIRMATION_REQUIRED');
  assert.equal((await arm('STAGE '+slug)).scope,'SINGLE_DISPOSABLE_PRIVATE_STAGE');
  assert.equal((await arm('STAGE '+slug)).code,'PILOT_ALREADY_ARMED');
  assert.equal(f.remote.length,0);
  const receipt=await f.dispatch();
  assert.equal(receipt.state,'SAVED_UNVERIFIED',receipt.code);
  assert.deepEqual(f.trace,['PREPARED','DISPATCH_POSSIBLE','SAVED_UNVERIFIED']);
  assert.deepEqual(f.remote,['save']);
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
  assert.equal((await f.reconcile()).state,'SOURCE_VERIFIED');
  assert.deepEqual(f.remote,['save']);
});
test('I17 X: pilot denies non-disposable, expiry, stale revision, spoofed fields and route loss',async()=>{
  const normal=fixture({gate:false});
  assert.equal((await normal.pin()).ok,true);
  assert.equal((await normal.run('ARM_DISPOSABLE_STAGE',{slug:'stage-one',
    expectedRevision:1,confirmation:'STAGE stage-one'})).code,
    'PILOT_DISPOSABLE_SLUG_REQUIRED');
  const slug='pcms-test-disposable-stage-0002',f=fixture({gate:false,slug});
  assert.equal((await f.pin()).ok,true);
  assert.equal((await f.run('ARM_DISPOSABLE_STAGE',{slug,
    expectedRevision:20,confirmation:'STAGE '+slug})).code,'STALE_REVISION');
  assert.equal(validateStagingMessage(api,{...sender,url:'https://evil.test'},
    {type:'ARM_DISPOSABLE_STAGE',params:{slug,expectedRevision:1,confirmation:'STAGE '+slug}})
    .code,'UNTRUSTED_SENDER');
  assert.equal(validateStagingMessage(api,sender,
    {type:'ARM_DISPOSABLE_STAGE',params:{slug,expectedRevision:1,
      confirmation:'STAGE '+slug,allowPublic:true}}).code,'INVALID_PARAMS');
  let ticks=0;
  const ex=fixture({gate:false,slug,pilotClock:()=>ticks});
  assert.equal((await ex.pin()).ok,true);
  assert.equal((await ex.run('ARM_DISPOSABLE_STAGE',{slug,expectedRevision:1,
    confirmation:'STAGE '+slug})).ok,true);
  ticks=120001;
  assert.equal((await ex.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  assert.deepEqual(ex.remote,[]);assert.deepEqual(ex.trace,[]);
  const route=fixture({gate:false,slug,routeLossAfterPrepare:true});
  assert.equal((await route.pin()).ok,true);
  assert.equal((await route.run('ARM_DISPOSABLE_STAGE',{slug,expectedRevision:1,
    confirmation:'STAGE '+slug})).ok,true);
  assert.equal((await route.dispatch()).code,'PREPARED_GUARD_CHANGED');
  assert.deepEqual(route.trace,['PREPARED']);
  assert.deepEqual(route.remote,[]);
});
