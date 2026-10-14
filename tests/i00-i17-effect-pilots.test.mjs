import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createWritebackBoundary,validateWritebackMessage} from '../src/runtime/writeback-boundary.mjs';
import {createReleaseBoundary,validateReleaseMessage} from '../src/runtime/release-boundary.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
globalThis.crypto??=webcrypto;
const api={runtime:{id:'persona-route-manager@local',
  getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
const gitToken='offline-github-test-token',slug='pcms-test-verified-f-0001';
const encoded=s=>Buffer.from(s).toString('base64');
const original={pjs:'output = 1',html:'<p>tested final F</p>',assets:[]};
const F=await exactSource([
  {path:'main.pjs',base64:encoded(original.pjs)},
  {path:'index.html',base64:encoded(original.html)}]);
assert.equal(F.ok,true);
const STAGE={slug,revision:3,state:'SOURCE_VERIFIED',verifiedAt:123,
  personaUid:'persona',accountId:'account',principalFingerprint:'f'.repeat(64),
  remotePublicId:'remote-1234',nonce:'a'.repeat(32),candidate:F};
const JOB={slug,revision:4,stageRevision:3,state:'TESTS_VERIFIED',
  executionSlotReleased:true,sourceFingerprint:F.fingerprint,
  verifiedFinal:F.fingerprint,finalSource:F,
  native:{sessionDigest:'1'.repeat(64),state:'CHAT1_OBSERVED_IDLE'}};
const RECORD={slug,revision:5,state:'PREPARED',mode:'MANUAL',stageRevision:3,
  sourceFingerprint:F.fingerprint,operationId:'writeback_'+'b'.repeat(32),
  expectedHead:'c'.repeat(40),baseHead:'c'.repeat(40),
  folder:'gens/'+slug,message:'fix: approved tested F'};
function writeFixture({clock=()=>0,routeChanged=false,dirty=false,lostAck=false}={}){
  let row={...RECORD};const events=[],writes=[];
  let armed=false;
  const store={
    getFull:async()=>({ok:true,record:{...row}}),
    arm:async(_,revision)=>{
      assert.equal(revision,5);row={...row,state:'DISPATCH_POSSIBLE',revision:6};
      armed=true;events.push('DISPATCH_POSSIBLE');
      return {ok:true,revision:6,state:'DISPATCH_POSSIBLE'};
    },
    finish:async(_,revision,receipt)=>{
      assert.equal(revision,6);events.push('FINISH');
      row={...row,revision:7,state:receipt.verified?'CONFIRMED':'HELD_UNCERTAIN'};
      return {ok:true,state:row.state,revision:7};
    }
  };
  const guard=()=>({
    getSafeRouteReadiness:async()=>({ready:true,
      routeId:armed&&routeChanged?'other':'protected-wg',
      cookieStoreId:'private-container'}),
    inspectStageEditor:async()=>({ok:true,clean:!(armed&&dirty)}),
    runNativeAiStep:async()=>({ok:true,busy:false,sessionDigest:'1'.repeat(64),
      sourceSaved:true,editorClean:true,hasQueue:false,inputOccupied:false,
      attachmentsPending:false}),
    observeReadOnly:async()=>({ok:true,principalFingerprint:STAGE.principalFingerprint,
      original:{...original,ownerResult:'IS_OWNER',
        remotePublicId:STAGE.remotePublicId,visibility:'UNLISTED'}})
  });
  const service=createWritebackBoundary(api,{open:async()=>({}),
    storeFactory:()=>store,stageFactory:()=>({getFull:async()=>({ok:true,record:STAGE})}),
    aiFactory:()=>({getJobFull:async()=>({ok:true,job:JOB})}),
    guard,effectGate:()=>false,pilotClock:clock,
    write:async()=>{writes.push({source:F.fingerprint});
      return lostAck?{ok:false,code:'GIT_WRITE_UNCERTAIN'}:
        {ok:true,code:'GIT_COMMITTED_VERIFIED',commitSha:'d'.repeat(40)};}});
  const run=(type,params)=>service.run({type,params},sender);
  return {run,events,writes,arm:()=>run('ARM_DISPOSABLE_COMMIT',{
    slug,expectedRevision:5,confirmation:'GIT COMMIT '+slug}),
    commit:()=>run('COMMIT',{slug,expectedRevision:5,token:gitToken})};
}
test('I17 F/X: one admitted tested F Git commit journals before exactly one write',async()=>{
  const x=writeFixture();
  assert.equal((await x.commit()).code,'GITHUB_WRITE_ACTIVATION_HELD');
  assert.deepEqual(x.writes,[]);
  assert.equal((await x.arm()).scope,'SINGLE_DISPOSABLE_TESTED_F_GIT_COMMIT');
  assert.equal((await x.arm()).code,'PILOT_ALREADY_ARMED');
  const sent=await x.commit();
  assert.equal(sent.state,'CONFIRMED',sent.code);
  assert.deepEqual(x.events,['DISPATCH_POSSIBLE','FINISH']);
  assert.deepEqual(x.writes,[{source:F.fingerprint}]);
  assert.equal((await x.commit()).code,'STALE_OR_MISSING_WRITEBACK');
});
test('I17 X: expiring Git grant, dirty editor or protected-route drift cannot write',async()=>{
  let t=0;const expired=writeFixture({clock:()=>t});
  assert.equal((await expired.arm()).ok,true);
  t=120001;
  assert.equal((await expired.commit()).code,'GITHUB_WRITE_ACTIVATION_HELD');
  assert.deepEqual(expired.writes,[]);
  for(const opts of [{dirty:true},{routeChanged:true}]){
    const x=writeFixture(opts);
    assert.equal((await x.arm()).ok,true);
    assert.equal((await x.commit()).code,'GIT_DISPATCH_RECONCILIATION_REQUIRED');
    assert.deepEqual(x.events,['DISPATCH_POSSIBLE','FINISH']);
    assert.deepEqual(x.writes,[]);
  }
});
test('I17 X: Git write ACK failure produces held uncertainty and zero blind retries',async()=>{
  const x=writeFixture({lostAck:true});
  assert.equal((await x.arm()).ok,true);
  assert.equal((await x.commit()).state,'HELD_UNCERTAIN');
  assert.equal(x.writes.length,1);
  assert.equal((await x.commit()).code,'STALE_OR_MISSING_WRITEBACK');
  assert.equal(x.writes.length,1);
});
test('I17 release arm: only an approved private-new exact F can arm; never dispatches provider',async()=>{
  const approvals=[];
  const release={slug,releaseId:'release_'+'a'.repeat(32),revision:3,
    state:'APPROVED',kind:'PRIVATE_NEW',approval:{
      sourceFingerprint:F.fingerprint,remotePublicId:'remote-1234'}};
  const service=createReleaseBoundary(api,{open:async()=>({}),
    releaseFactory:()=>({getFull:async()=>({ok:true,record:release})}),
    guard:()=>{throw Error('ARM SHOULD NOT DISPATCH NATIVE')},
    effectGate:()=>false,pilotClock:()=>0,
    dispatch:async()=>{approvals.push('remote');throw Error('FORBIDDEN')}});
  const run=(type,params)=>service.run({type,params},sender);
  assert.equal((await run('ARM_DISPOSABLE_RELEASE',{slug,expectedRevision:3,
    confirmation:'PUBLISH '+slug+' '+F.fingerprint})).scope,
    'SINGLE_PRIVATE_NEW_EXACT_SOURCE_PUBLICATION');
  assert.equal((await run('ARM_DISPOSABLE_RELEASE',{slug,expectedRevision:3,
    confirmation:'PUBLISH '+slug+' '+F.fingerprint})).code,'PILOT_ALREADY_ARMED');
  assert.deepEqual(approvals,[]);
});
test('I17 X: malformed, stale or forged writeback/release authorizations fail closed',()=>{
  const a={type:'ARM_DISPOSABLE_COMMIT',params:{slug,expectedRevision:5,
    confirmation:'GIT COMMIT '+slug}};
  const b={type:'ARM_DISPOSABLE_RELEASE',params:{slug,expectedRevision:3,
    confirmation:'PUBLISH '+slug+' '+F.fingerprint}};
  assert.equal(validateWritebackMessage(api,sender,a).ok,true);
  assert.equal(validateReleaseMessage(api,sender,b).ok,true);
  for(const bad of [
    {...a,params:{...a.params,force:true}},
    {...a,params:{...a.params,token:gitToken}}
  ])assert.equal(validateWritebackMessage(api,sender,bad).code,'INVALID_PARAMS');
  for(const bad of [
    {...b,params:{...b.params,allowPublicExisting:true}},
    {...b,params:{...b.params,source:F}}
  ])assert.equal(validateReleaseMessage(api,sender,bad).code,'INVALID_PARAMS');
  assert.equal(validateReleaseMessage(api,{id:'web',url:'https://perchance.org'},b).code,
    'UNTRUSTED_SENDER');
});
