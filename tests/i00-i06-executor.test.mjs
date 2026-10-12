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
  denyRoute=false,staleIdentity=false,wrongReadback=false}={}){
  let current={...batch,items:batch.items.map(i=>({...i}))};
  let identity=staleIdentity?{...account,revision:3}:account;
  const trace=[],remote=[];
  const stores={
    accounts:{get:async id=>id===account.accountId?
      {ok:true,account:identity}:{ok:false,code:'ACCOUNT_NOT_FOUND'}},
    supply:{
      get:async id=>id===current.batchId?{ok:true,batch:current}:{ok:false,code:'BATCH_NOT_FOUND'},
      freeze:async()=>({ok:false,code:'BATCH_ID_USED'}),
      list:async()=>({ok:true,batches:[publicSupply(current)],truncated:false}),
      async stage(action){
        trace.push(action.event);
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
        return {ok:true,item:moved.item};
      }
    }
  };
  const guard={
    getSafeRouteReadiness:async()=>denyRoute?
      {ready:false,code:'DIRECT_FORBIDDEN'}:
      {ready:true,personaUid:account.personaUid,cookieStoreId:'safe-container',routeId:'protected-wg'},
    async runSupplyStep(personaUid,request){
      assert.equal(personaUid,account.personaUid);
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
    makeStores:()=>stores,guard:()=>guard,effectGate:()=>gate});
  const run=(type,params={})=>boundary.run({type,params},sender);
  const item=()=>current.items[0];
  const dispatch=()=>run('EXECUTE_ITEM',{batchId:current.batchId,itemId:item().itemId,
    expectedRevision:item().revision});
  return {run,dispatch,item,remote,trace};
}
test('P52-02 F: two independent remote effects only after durable markers and readback',async()=>{
  const f=fixture();
  const a=await f.dispatch();
  assert.equal(a.ok,true,a.code);
  assert.equal(a.state,'CREATE_CONFIRMED');
  assert.equal(f.remote.length,1);
  assert.deepEqual(f.trace,[
    'CREATE_PREPARED','CREATE_DISPATCH_POSSIBLE','CREATE_OBSERVING','CREATE_CONFIRMED'
  ]);
  const b=await f.dispatch();
  assert.equal(b.ok,true,b.code);
  assert.equal(b.state,'SOURCE_PENDING');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE','RENAME']);
  assert.deepEqual(f.trace.slice(4),[
    'RENAME_PREPARED','RENAME_DISPATCH_POSSIBLE','RENAME_OBSERVING',
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
test('P56-06 F: crash/abort before dispatch marker means independent zero effects',async()=>{
  const f=fixture({failDispatch:true});
  const response=await f.dispatch();
  assert.equal(response.code,'DB_ABORTED');
  assert.equal(f.remote.length,0);
  assert.deepEqual(f.trace,['CREATE_PREPARED','CREATE_DISPATCH_POSSIBLE']);
  assert.equal((await f.dispatch()).code,'NOT_ADMISSIBLE');
  assert.equal(f.remote.length,0);
});
test('P52-02 F: lost ACK after remote effect is held, never blind second create',async()=>{
  const f=fixture({lostAck:true});
  assert.equal((await f.dispatch()).code,'HELD_UNCERTAIN');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE']);
  assert.equal(f.item().state,'CREATE_UNCERTAIN');
  assert.equal((await f.dispatch()).code,'RECONCILIATION_REQUIRED');
  assert.deepEqual(f.remote.map(x=>x.kind),['CREATE']);
});
test('P52-02 F: provider owner mismatch after ACK keeps item uncertain',async()=>{
  const f=fixture({wrongOwner:true});
  assert.equal((await f.dispatch()).code,'HELD_UNCERTAIN');
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
