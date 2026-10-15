import test from 'node:test';
import assert from 'node:assert/strict';
import {moveSupply,freezeSupply,publicSupply} from '../src/runtime/supply-plan.mjs';
import {validateSupplyMessage,createSupplyBoundary} from '../src/runtime/supply-boundary.mjs';

const account={
  accountId:'account_alpha_01',personaUid:'persona-aaaa-0001',revision:2,
  bindingVersion:1,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,
    principalFingerprint:'a'.repeat(64)}
};
const api={runtime:{id:'persona-route-manager@local',
  getURL:path=>'moz-extension://fixture/'+path},
  storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#generators'};
const batch=freezeSupply({batchId:'batch_alpha_01',accountId:account.accountId,
  personaUid:account.personaUid,accountRevision:2,bindingVersion:1,
  slugs:['requested-slug']}).batch;
function fixture({gate=true,failDispatch=false,lostAck=false,wrongOwner=false,
  denyRoute=false,staleIdentity=false,wrongReadback=false,
  pauseAfterPrepare=false,routeLossAfterPrepare=false,
  slug='requested-slug',pilotClock=()=>performance.now(),gitPilotGate=gate,
  onStage=()=>{},lostGitAck=false,gitReadOk=true}={}){
  const planned=slug==='requested-slug'?batch:freezeSupply({
    batchId:batch.batchId,accountId:account.accountId,personaUid:account.personaUid,
    accountRevision:2,bindingVersion:1,slugs:[slug]}).batch;
  let current={...planned,items:planned.items.map(i=>({...i}))};
  let gateOn=gate,routeChecks=0;
  let identity=staleIdentity?{...account,revision:3}:account;
  const trace=[],remote=[],gitLedger=[];
  const stores={
    accounts:{get:async id=>id===account.accountId?
      {ok:true,account:identity}:{ok:false,code:'ACCOUNT_NOT_FOUND'}},
    supply:{
      get:async id=>id===current.batchId?{ok:true,batch:current}:{ok:false,code:'BATCH_NOT_FOUND'},
      freeze:async()=>({ok:false,code:'BATCH_ID_USED'}),
      list:async()=>({ok:true,batches:[publicSupply(current)],truncated:false}),
      async stage(action){
        trace.push(action.event);
        onStage(action.event);
        if(failDispatch&&action.event.endsWith('DISPATCH_POSSIBLE'))
          return {ok:false,code:'DB_ABORTED'};
        const i=current.items.findIndex(x=>x.itemId===action.itemId);
        const old=current.items[i];
        if(old.revision!==action.expectedRevision)
          return {ok:false,code:'STALE_REVISION'};
        const moved=moveSupply(old,action.event,
          action.event.endsWith('PREPARED')?{operationId:action.operationId}:action.proof);
        if(!moved.ok)return moved;
        current={...current,revision:current.revision+1,items:current.items.map(
          (x,index)=>index===i?moved.item:x)};
        if(pauseAfterPrepare&&action.event==='CREATE_PREPARED')gateOn=false;
        return {ok:true,item:moved.item};
      }
    }
  };
  const guard={
    getSafeRouteReadiness:async()=>{routeChecks++;return (denyRoute||
      (routeLossAfterPrepare&&routeChecks>=2))?
      {ready:false,code:'DIRECT_FORBIDDEN'}:
      {ready:true,personaUid:account.personaUid,cookieStoreId:'safe-container',routeId:'protected-wg'};}, 
    async runSupplyStep(personaUid,request){
      assert.equal(personaUid,account.personaUid);
      if(request.kind.startsWith('PREFLIGHT_'))return {ok:true,preflight:{version:2,kind:request.kind.slice(10),operationId:request.operationId}};
      if(request.kind==='CREATE'){
        assert.equal(trace.at(-1),'CREATE_DISPATCH_POSSIBLE');
        remote.push({kind:'CREATE',slug:'temp-created',privateEmpty:true,owner:account.accountId});
        return lostAck?{ok:false,code:'TIMEOUT'}:
          {ok:true,ack:'CREATED',temporarySlug:'temp-created'};
      }
      if(request.kind==='READ_CREATE'){
        assert.equal(remote.filter(x=>x.kind==='CREATE').length,1);
        return {ok:true,source:'INDEPENDENT_READBACK',
          temporarySlug:'temp-created',remoteId:'remote_alpha_01',
          privateEmpty:true,ownerMatches:!wrongOwner};
      }
      if(request.kind==='RENAME'){
        assert.equal(trace.at(-1),'RENAME_DISPATCH_POSSIBLE');
        assert.equal(request.temporarySlug,'temp-created');
        remote.push({kind:'RENAME',slug:request.slug,privateEmpty:true,owner:account.accountId});
        return lostAck?{ok:false,code:'TIMEOUT'}:{ok:true,ack:'RENAMED'};
      }
      if(request.kind==='READ_RENAME'){
        assert.equal(remote.filter(x=>x.kind==='RENAME').length,1);
        return {ok:true,source:'INDEPENDENT_READBACK',
          slug:wrongReadback?'other-slug':request.slug,previousSlug:'temp-created',
          remoteId:'remote_alpha_01',privateEmpty:true,ownerMatches:!wrongOwner};
      }
      throw Error('Unknown fake provider operation '+request.kind);
    }
  };
  const boundary=createSupplyBoundary(api,{open:async()=>({}),
    makeStores:()=>stores,guard:()=>guard,effectGate:()=>gateOn,pilotClock,
    gitGate:()=>gitPilotGate,gitWrite:async ({folder,slug,token})=>{
      assert.equal(trace.at(-1),'GIT_DISPATCH_POSSIBLE');
      assert.equal(folder,'gens/'+slug);
      assert.equal(token,'offline-git-token-01');
      gitLedger.push({path:folder+'/DEPLOYMENT.md',content:'Status: SOURCE_PENDING\\n'});
      return lostGitAck?{ok:false,code:'ACK_LOST'}:
        {ok:true,source:'GIT_READBACK',ready:false,emptyFolder:true,folder};
    },gitRead:async({folder,token})=>{
      assert.equal(token,'offline-git-token-01');
      return gitReadOk&&gitLedger.some(x=>x.path===folder+'/DEPLOYMENT.md')?
        {ok:true,source:'GIT_READBACK',ready:false,emptyFolder:true,folder}:
        {ok:false,code:'MARKER_UNVERIFIED'};
    }});
  const run=(type,params={})=>boundary.run({type,params},sender);
  const item=()=>current.items[0];
  const dispatch=()=>run('EXECUTE_ITEM',{batchId:current.batchId,itemId:item().itemId,
    expectedRevision:item().revision});
  return {run,dispatch,item,remote,trace,gitLedger};
}
test('P52-02 F: two independent remote effects only after durable markers and readback',async()=>{
  const f=fixture();
  const a=await f.dispatch();
  assert.equal(a.ok,true,a.code);
  assert.equal(a.state,'CREATE_CONFIRMED');
  assert.equal(f.remote.length,1);
  assert.deepEqual(f.trace,[
    'CREATE_PREPARED','CREATE_READY_TO_DISPATCH','CREATE_DISPATCH_POSSIBLE','CREATE_ACKNOWLEDGED','CREATE_OBSERVING','CREATE_CONFIRMED'
  ]);
  const b=await f.dispatch();
  assert.equal(b.ok,true,b.code);
  assert.equal(b.state,'SOURCE_PENDING');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE','RENAME']);
  assert.deepEqual(f.trace.slice(6),[
    'RENAME_PREPARED','RENAME_READY_TO_DISPATCH','RENAME_DISPATCH_POSSIBLE','RENAME_ACKNOWLEDGED','RENAME_OBSERVING',
    'PROVIDER_CONFIRMED','SOURCE_PENDING'
  ]);
  const third=await f.dispatch();
  assert.equal(third.code,'NOT_ADMISSIBLE');
  assert.equal(f.remote.length,2);
  const view=await f.run('GET_BATCH',{batchId:'batch_alpha_01'});
  assert.equal(view.ok,true);
  assert.equal(view.batch.items[0].state,'SOURCE_PENDING');
  assert.equal('remoteId' in view.batch.items[0],false);
});
test('P56-06 F: Git marker uses its own journal, no premature READY or duplicate write',async()=>{
  const f=fixture();
  assert.equal((await f.dispatch()).state,'CREATE_CONFIRMED');
  assert.equal((await f.dispatch()).state,'SOURCE_PENDING');
  const request=()=>f.run('FINISH_SOURCE_FOLDER',{batchId:batch.batchId,
    itemId:f.item().itemId,expectedRevision:f.item().revision,token:'offline-git-token-01'});
  const result=await request();
  assert.equal(result.ok,true,result.code);
  assert.equal(result.state,'CONFIRMED');
  assert.equal(f.gitLedger.length,1);
  assert.equal(f.gitLedger[0].path,'gens/requested-slug/DEPLOYMENT.md');
  assert.deepEqual(f.trace.slice(-4),[
    'GIT_PREPARED','GIT_DISPATCH_POSSIBLE','GIT_OBSERVING','SOURCE_CONFIRMED'
  ]);
  assert.equal((await request()).code,'NOT_ADMISSIBLE');
  assert.equal(f.gitLedger.length,1);
});
test('P56-06 F: crash/abort before dispatch marker means independent zero effects',async()=>{
  const f=fixture({failDispatch:true});
  const response=await f.dispatch();
  assert.equal(response.code,'DB_ABORTED');
  assert.equal(f.remote.length,0);
  assert.deepEqual(f.trace,['CREATE_PREPARED','CREATE_READY_TO_DISPATCH','CREATE_DISPATCH_POSSIBLE']);
  assert.equal((await f.dispatch()).code,'UNSENT_INTENT_REVIEW_REQUIRED');
  assert.equal(f.remote.length,0);
});
test('P56-06 F: Pause or protected-route loss after PREPARED prevents effect; abort releases only pre-dispatch',async()=>{
  for(const variant of [{pauseAfterPrepare:true},{routeLossAfterPrepare:true}]){
    const f=fixture(variant);
    const response=await f.dispatch();
    assert.equal(response.code,'PREFLIGHT_CONTEXT_CHANGED',response.code);
    assert.equal(f.remote.length,0);
    assert.equal(f.item().state,'CREATE_PREFLIGHT_FAILED');
    const cancelled=await f.run('ABORT_PREPARED',{batchId:batch.batchId,
      itemId:f.item().itemId,expectedRevision:f.item().revision});
    assert.equal(cancelled.state,'FROZEN',cancelled.code);
    assert.equal(f.remote.length,0);
    assert.equal(f.item().state,'FROZEN');
  }
});
test('P52-02 F: lost ACK after remote effect is held, never blind second create',async()=>{
  const f=fixture({lostAck:true});
  assert.equal((await f.dispatch()).code,'TIMEOUT');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE']);
  assert.equal(f.item().state,'CREATE_UNCERTAIN');
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE']);
});
test('P52-02 F: provider owner mismatch after ACK keeps item uncertain',async()=>{
  const f=fixture({wrongOwner:true});
  assert.equal((await f.dispatch()).code,'CREATE_READBACK_UNVERIFIED');
  assert.equal(f.item().state,'CREATE_UNCERTAIN');
  assert.equal(f.remote.length,1);
});
test('P52-02 F: no effects on stale account, blocked route or held activation',async()=>{
  for(const variant of [{gate:false},{staleIdentity:true},{denyRoute:true}]){
    const f=fixture(variant);
    const result=await f.dispatch();
    assert.equal(result.ok,false);
    assert.equal(f.remote.length,0);
    assert.equal(f.item().state,'FROZEN');
    assert.deepEqual(f.trace,[]);
  }
});
test('P56-06 F: sender, owner/cookie proof, raw transport, and oversized list denied',async()=>{
  assert.equal(validateSupplyMessage(api,{id:'web',url:sender.url},
    {type:'FREEZE',params:{}}).code,'UNTRUSTED_SENDER');
  assert.equal(validateSupplyMessage(api,sender,{type:'EXECUTE_ITEM',
    params:{batchId:batch.batchId,itemId:batch.items[0].itemId,
      expectedRevision:1,providerApproved:true}}).code,'INVALID_PARAMS');
  assert.equal(validateSupplyMessage(api,sender,{type:'GIT_WRITE',params:{}})
    .code,'CAPABILITY_OFF');
  assert.equal(validateSupplyMessage(api,sender,{type:'FREEZE',params:{
    accountId:account.accountId,expectedAccountRevision:2,
    batchId:'batch_fake_01',slugs:Array(101).fill('slug-a')}}).code,'INVALID_PARAMS');
  const f=fixture({gate:false});
  assert.equal((await f.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  assert.equal(f.remote.length,0);
  assert.equal((await f.run('LIST_BATCHES')).batches.length,1);
});

test('I17 F/X: exact disposable operator arm permits only one journaled CREATE and separate RENAME',async()=>{
  const slug='pcms-test-disposable-0001',f=fixture({gate:false,slug});
  assert.equal((await f.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  assert.equal(f.remote.length,0);
  const arm=confirmation=>f.run('ARM_DISPOSABLE_TEST',{
    batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision,confirmation});
  assert.equal((await arm('CREATE other-slug')).code,'PILOT_CONFIRMATION_REQUIRED');
  const createArm=await arm('CREATE '+slug);
  assert.equal(createArm.ok,true,createArm.code);
  assert.equal(createArm.scope,'SINGLE_DISPOSABLE_STEP_NOT_GENERAL_ACTIVATION');
  assert.equal((await arm('CREATE '+slug)).code,'PILOT_ALREADY_ARMED');
  const created=await f.dispatch();
  assert.equal(created.state,'CREATE_CONFIRMED',created.code);
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE']);
  assert.equal((await f.dispatch()).code,'PROVIDER_ACTIVATION_HELD',
    'an acknowledged create does not automatically arm rename');
  const renameArm=await arm('RENAME '+slug);
  assert.equal(renameArm.ok,true,renameArm.code);
  const renamed=await f.dispatch();
  assert.equal(renamed.state,'SOURCE_PENDING',renamed.code);
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE','RENAME']);
  assert.equal((await f.dispatch()).code,'NOT_ADMISSIBLE');
});
test('I17 X: pilot rejects wrong slug, stale CAS, untrusted sender, route loss and expiry',async()=>{
  const normal=fixture({gate:false});
  assert.equal((await normal.run('ARM_DISPOSABLE_TEST',{
    batchId:batch.batchId,itemId:normal.item().itemId,expectedRevision:1,
    confirmation:'CREATE requested-slug'})).code,'PILOT_DISPOSABLE_SLUG_REQUIRED');
  const f=fixture({gate:false,slug:'pcms-test-disposable-0002'});
  const params={batchId:batch.batchId,itemId:f.item().itemId,expectedRevision:1,
    confirmation:'CREATE pcms-test-disposable-0002'};
  assert.equal((await f.run('ARM_DISPOSABLE_TEST',{...params,expectedRevision:2})).code,'STALE_REVISION');
  assert.equal(validateSupplyMessage(api,{id:'web',url:sender.url},
    {type:'ARM_DISPOSABLE_TEST',params}).code,'UNTRUSTED_SENDER');
  for(const value of [null,1,'A'.repeat(121)])
    assert.equal(validateSupplyMessage(api,sender,{
      type:'ARM_DISPOSABLE_TEST',params:{...params,confirmation:value}}).code,'INVALID_PARAMS');
  assert.equal((await fixture({gate:false,slug:'pcms-test-disposable-0003',
    denyRoute:true}).run('ARM_DISPOSABLE_TEST',{...params,
      confirmation:'CREATE pcms-test-disposable-0003'})).ok,false);
  let ticks=0;
  const expired=fixture({gate:false,slug:'pcms-test-disposable-0004',pilotClock:()=>ticks});
  assert.equal((await expired.run('ARM_DISPOSABLE_TEST',{...params,
    confirmation:'CREATE pcms-test-disposable-0004'})).ok,true);
  ticks=120001;
  assert.equal((await expired.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  assert.equal(expired.remote.length,0);
  assert.equal(expired.trace.length,0);
});

test('I17 F/X: independent disposable Git marker grant is separate from private provider grant',async()=>{
  const slug='pcms-test-git-marker-0001',f=fixture({slug,gate:true,gitPilotGate:false});
  assert.equal((await f.dispatch()).state,'CREATE_CONFIRMED');
  assert.equal((await f.dispatch()).state,'SOURCE_PENDING');
  const intent=()=>({batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision});
  const git=()=>f.run('FINISH_SOURCE_FOLDER',{...intent(),token:'offline-git-token-01'});
  assert.equal((await git()).code,'GIT_WRITE_ACTIVATION_HELD');
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',{...intent(),
    confirmation:'GIT not-the-slug'})).code,'PILOT_CONFIRMATION_REQUIRED');
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',{...intent(),
    confirmation:'GIT '+slug})).scope,'SINGLE_DISPOSABLE_NON_READY_GIT_MARKER');
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',{...intent(),
    confirmation:'GIT '+slug})).code,'PILOT_ALREADY_ARMED');
  const marked=await git();
  assert.equal(marked.state,'CONFIRMED',marked.code);
  assert.equal(f.gitLedger.length,1);
  assert.equal(f.gitLedger[0].path,'gens/'+slug+'/DEPLOYMENT.md');
  assert.equal((await git()).code,'NOT_ADMISSIBLE');
  assert.equal(f.gitLedger.length,1);
});
test('I17 X: expired pilot after Git possible marker never calls private transport',async()=>{
  let ticks=0;
  const slug='pcms-test-git-marker-0002',f=fixture({slug,gate:true,
    gitPilotGate:false,pilotClock:()=>ticks,
    onStage:event=>{if(event==='GIT_DISPATCH_POSSIBLE')ticks=120001;}});
  assert.equal((await f.dispatch()).state,'CREATE_CONFIRMED');
  assert.equal((await f.dispatch()).state,'SOURCE_PENDING');
  const params={batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision,confirmation:'GIT '+slug};
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',params)).ok,true);
  const effect=await f.run('FINISH_SOURCE_FOLDER',{
    batchId:params.batchId,itemId:params.itemId,
    expectedRevision:params.expectedRevision,token:'offline-git-token-01'});
  assert.equal(effect.code,'GIT_HELD_BEFORE_DISPATCH');
  assert.deepEqual(f.trace.slice(-3),['GIT_PREPARED','GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN']);
  assert.equal(f.gitLedger.length,0);
  assert.equal(f.item().state,'GIT_UNCERTAIN');
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',{...params,
    expectedRevision:f.item().revision})).code,'NOT_ADMISSIBLE');
});

test('I17 X: lost Git write ACK is read-only reconciled, never written again',async()=>{
  const slug='pcms-test-git-marker-0003',f=fixture({slug,gate:true,
    gitPilotGate:false,lostGitAck:true});
  assert.equal((await f.dispatch()).state,'CREATE_CONFIRMED');
  assert.equal((await f.dispatch()).state,'SOURCE_PENDING');
  const params=()=>({batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision});
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',{...params(),
    confirmation:'GIT '+slug})).ok,true);
  const attempted=await f.run('FINISH_SOURCE_FOLDER',{...params(),
    token:'offline-git-token-01'});
  assert.equal(attempted.code,'GIT_WRITE_UNCERTAIN');
  assert.equal(f.item().state,'GIT_UNCERTAIN');
  assert.equal(f.gitLedger.length,1);
  const reconciled=await f.run('RECONCILE_GIT',{...params(),
    token:'offline-git-token-01'});
  assert.equal(reconciled.state,'CONFIRMED',reconciled.code);
  assert.equal(f.gitLedger.length,1,'reconciliation must not repeat private Git write');
  assert.equal((await f.run('RECONCILE_GIT',{...params(),
    token:'offline-git-token-01'})).code,'NOT_ADMISSIBLE');
});
test('I17 X: uncertain Git marker absent or malformed remains held, no fresh write',async()=>{
  const slug='pcms-test-git-marker-0004',f=fixture({slug,gate:true,
    gitPilotGate:false,lostGitAck:true,gitReadOk:false});
  assert.equal((await f.dispatch()).state,'CREATE_CONFIRMED');
  assert.equal((await f.dispatch()).state,'SOURCE_PENDING');
  const params=()=>({batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision});
  assert.equal((await f.run('ARM_DISPOSABLE_GIT',{...params(),
    confirmation:'GIT '+slug})).ok,true);
  assert.equal((await f.run('FINISH_SOURCE_FOLDER',{...params(),
    token:'offline-git-token-01'})).code,'GIT_WRITE_UNCERTAIN');
  assert.equal((await f.run('RECONCILE_GIT',{...params(),
    token:'offline-git-token-01'})).code,'GIT_RECONCILIATION_REQUIRED');
  assert.equal(f.item().state,'GIT_UNCERTAIN');
  assert.equal(f.gitLedger.length,1);
  assert.equal(validateSupplyMessage(api,sender,{type:'RECONCILE_GIT',
    params:{...params(),token:'offline-git-token-01',force:true}}).code,'INVALID_PARAMS');
});

test('I17 F/X: ordinary exact generator must be armed, journaled, and reconciled like a disposable slug',async()=>{
  const f=fixture({gate:false,gitPilotGate:false,slug:'ordinary-generator-a01'});
  const args=()=>({batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision});
  assert.equal((await f.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  assert.deepEqual(f.remote,[]);
  assert.equal((await f.run('ARM_DISPOSABLE_TEST',{...args(),
    confirmation:'CREATE ordinary-generator-a01'})).code,'PILOT_DISPOSABLE_SLUG_REQUIRED');
  assert.equal((await f.run('ARM_EXACT_ITEM',{...args(),
    confirmation:'CREATE wrong-generator'})).code,'PILOT_CONFIRMATION_REQUIRED');
  assert.equal((await f.run('ARM_EXACT_ITEM',{...args(),
    confirmation:'CREATE ordinary-generator-a01'})).scope,'SINGLE_EXACT_OPERATOR_STEP');
  assert.equal((await f.dispatch()).state,'CREATE_CONFIRMED');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE']);
  assert.equal((await f.dispatch()).code,'PROVIDER_ACTIVATION_HELD');
  assert.equal((await f.run('ARM_EXACT_ITEM',{...args(),
    confirmation:'RENAME ordinary-generator-a01'})).scope,'SINGLE_EXACT_OPERATOR_STEP');
  assert.equal((await f.dispatch()).state,'SOURCE_PENDING');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE','RENAME']);
  assert.equal((await f.run('FINISH_SOURCE_FOLDER',{...args(),
    token:'offline-git-token-01'})).code,'GIT_WRITE_ACTIVATION_HELD');
  assert.equal((await f.run('ARM_EXACT_GIT',{...args(),
    confirmation:'GIT ordinary-generator-a01'})).scope,'SINGLE_EXACT_NON_READY_GIT_MARKER');
  assert.equal((await f.run('FINISH_SOURCE_FOLDER',{...args(),
    token:'offline-git-token-01'})).state,'CONFIRMED');
  assert.equal(f.gitLedger.length,1);
  assert.equal((await f.run('FINISH_SOURCE_FOLDER',{...args(),
    token:'offline-git-token-01'})).code,'NOT_ADMISSIBLE');
});
test('I17 X: ordinary exact generator cannot arm on stale revision, untrusted sender or unsafe route',async()=>{
  const f=fixture({gate:false,denyRoute:true,slug:'ordinary-generator-b01'});
  const params={batchId:batch.batchId,itemId:f.item().itemId,
    expectedRevision:f.item().revision,confirmation:'CREATE ordinary-generator-b01'};
  assert.equal(validateSupplyMessage(api,{id:'untrusted-page',url:sender.url},
    {type:'ARM_EXACT_ITEM',params}).code,'UNTRUSTED_SENDER');
  assert.equal((await f.run('ARM_EXACT_ITEM',{...params,expectedRevision:2})).code,'STALE_REVISION');
  const denied=await f.run('ARM_EXACT_ITEM',params);
  assert.equal(denied.ok,false);
  assert.deepEqual(f.remote,[]);
  assert.deepEqual(f.trace,[]);
});
