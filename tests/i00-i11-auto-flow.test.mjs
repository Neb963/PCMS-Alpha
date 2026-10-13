import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createWritebackBoundary} from '../src/runtime/writeback-boundary.mjs';
globalThis.crypto??=webcrypto;
const slug='test-auto',session='1'.repeat(64),head='a'.repeat(40),commit='c'.repeat(40),
  token='synthetic-private-github-token';
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html#work-queue'};
const idle={ok:true,busy:false,sessionDigest:session,sourceSaved:true,
  editorClean:true,hasQueue:false,inputOccupied:false,attachmentsPending:false};
async function fixture({activate=true,autoEnabled=true}={}){
  const source=await exactSource([
    {path:'main.pjs',base64:Buffer.from('pjs-main').toString('base64')},
    {path:'index.html',base64:Buffer.from('<h1>safe</h1>').toString('base64')}
  ]);
  const stage={slug,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,
    nonce:'f'.repeat(32),accountId:'test-account',personaUid:'test-persona',
    principalFingerprint:'b'.repeat(64),remotePublicId:'remote-fixture',
    sourceHead:head,sourceFolder:'gens/test-auto',candidate:source};
  const job={slug,revision:8,stageRevision:4,state:'TESTS_VERIFIED',
    sourceFingerprint:source.fingerprint,verifiedFinal:source.fingerprint,
    finalSource:source,executionSlotReleased:true,
    native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:session},
    prompt:{revision:1,text:'Test fixture',tests:['default_generator_smoke']},
    chat1:{sessionDigest:session,tests:{
      default_generator_smoke:{result:'PASS',sourceFingerprint:source.fingerprint}}},
    chat2:null};
  let record=null,writes=0,suggestions=0,arms=0;
  const store={
    settings:async()=>({ok:true,setting:{revision:1,autoEnabled}}),
    get:async()=>record?{ok:true,...record}:{ok:false,code:'WRITEBACK_NOT_FOUND'},
    getFull:async()=>record?{ok:true,record}:{ok:false,code:'WRITEBACK_NOT_FOUND'},
    prepare:async x=>{
      record={slug,revision:1,operationId:x.operationId,mode:x.mode,
        message:x.message,folder:x.probe.folder,baseHead:head,expectedHead:head,
        state:'PREPARED',jobRevision:8,stageRevision:4,sourceFingerprint:source.fingerprint};
      return {ok:true,...record};
    },
    arm:async(_name,rev)=>{
      arms++;
      if(record?.state!=='PREPARED'||rev!==record.revision)
        return {ok:false,code:'WRITEBACK_RECONCILIATION_REQUIRED'};
      record={...record,state:'DISPATCH_POSSIBLE',revision:2};
      return {ok:true,...record};
    },
    finish:async(_name,rev,proof)=>{
      if(!record||rev!==record.revision)return {ok:false,code:'STALE_REVISION'};
      record={...record,state:proof.verified?'CONFIRMED':'HELD_UNCERTAIN',
        revision:3,commitSha:proof.commitSha};
      return {ok:true,...record};
    }
  };
  const guard=()=>({
    getSafeRouteReadiness:async()=>({ready:true,cookieStoreId:'container',
      routeId:'protected'}),
    inspectStageEditor:async()=>({ok:true,clean:true}),
    runNativeAiStep:async(_,req)=>{
      if(req.action==='OBSERVE')return idle;
      assert.equal(req.action,'OBSERVE_TERMINAL');suggestions++;
      return {ok:true,kind:'TERMINAL_ASSISTANT',
        origin:'DONOR_GUARDED_NATIVE_HISTORY',sessionDigest:session,
        settled:true,text:'Tests passed.\nPCMS_COMMIT_MESSAGE: fix: safe'};
    },
    observeReadOnly:async()=>({ok:true,principalFingerprint:stage.principalFingerprint,
      original:{remotePublicId:stage.remotePublicId,ownerResult:'IS_OWNER',
        visibility:'UNLISTED',pjs:'pjs-main',html:'<h1>safe</h1>',assets:[]}})
  });
  const alarms=[];
  const api={
    runtime:{id:'fixture',getURL:path=>'moz-extension://fixture/'+path},
    storage:{local:{get:async()=>({})}},
    alarms:{create:(...args)=>alarms.push(args)}
  };
  const boundary=createWritebackBoundary(api,{
    open:async()=>({}),storeFactory:()=>store,
    aiFactory:()=>({getJobFull:async()=>({ok:true,job})}),
    stageFactory:()=>({getFull:async()=>({ok:true,record:stage})}),
    guard,inspect:async()=>({ok:true,head,baseHead:head,folder:stage.sourceFolder}),
    write:async request=>{
      writes++;
      assert.equal(request.operationId,record.operationId);
      assert.equal(request.source.fingerprint,source.fingerprint);
      assert.equal(request.message,'fix: safe');
      return {ok:true,code:'GIT_COMMITTED_VERIFIED',commitSha:commit};
    },
    effectGate:()=>activate
  });
  return {boundary,api,stats:()=>({writes,suggestions,arms,record,alarms}),
    arm:()=>boundary.run({type:'ARM_AUTO',params:{slug,token}},sender)};
}
test('P53-06 F/X opted-in background wake auto-commits once from canonical tested F and isolated terminal only',async()=>{
  const fixtureState=await fixture();
  const accepted=await fixtureState.arm();
  assert.equal(accepted.code,'AUTO_EPHEMERAL_ARMED',JSON.stringify(accepted));
  const first=await fixtureState.boundary.autoTick();
  assert.equal(first.state,'CONFIRMED',JSON.stringify(first));
  assert.equal(fixtureState.stats().writes,1);
  assert.equal(fixtureState.stats().suggestions,1);
  const repeat=await fixtureState.boundary.autoTick();
  assert.equal(repeat.code,'GIT_AUTO_NO_WORK');
  assert.equal(fixtureState.stats().writes,1);
  assert.equal(fixtureState.stats().arms,1);
});
test('P53-06 X no activation or no opt-in refuses credential arming before remote action',async()=>{
  for(const flags of [{activate:false},{autoEnabled:false}]){
    const f=await fixture(flags);
    const result=await f.arm();
    assert.equal(result.ok,false);
    assert.equal(f.stats().writes,0);
    assert.equal((await f.boundary.autoTick()).code,'GIT_AUTO_NO_WORK');
  }
});
test('P53-06 X disarm invalidates ephemeral authorization and duplicate wake no-ops',async()=>{
  const f=await fixture();
  assert.equal((await f.arm()).ok,true);
  const stopped=await f.boundary.run({type:'DISARM_AUTO',params:{slug}},sender);
  assert.equal(stopped.code,'AUTO_CREDENTIAL_DISARMED');
  assert.equal((await f.boundary.autoTick()).code,'GIT_AUTO_NO_WORK');
  assert.equal(f.stats().writes,0);
});
