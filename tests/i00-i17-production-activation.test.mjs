import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary,validateAiMessage,productionAiGate} from '../src/runtime/ai-boundary.mjs';
import {productionAutoGitGate} from '../src/runtime/writeback-boundary.mjs';
import {productionAdoptionArchiveGate} from '../src/runtime/adoption-boundary.mjs';
import {productionExistingUpdateGate} from '../src/runtime/existing-update-boundary.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';

const slug='ordinary-source-001';
const original={pjs:'output = 1',html:'<p>source</p>',assets:[]};
const b64=s=>Buffer.from(s).toString('base64');
const candidate=await exactSource([
  {path:'main.pjs',base64:b64(original.pjs)},
  {path:'index.html',base64:b64(original.html)}
]);
assert.equal(candidate.ok,true);
const route={ready:true,routeId:'protected-one',cookieStoreId:'persona-container'};
const stage={slug,revision:3,state:'SOURCE_VERIFIED',
  accountId:'account-alpha',personaUid:'persona-alpha',
  principalFingerprint:'f'.repeat(64),remotePublicId:'remote_alpha_001',
  nonce:'c'.repeat(32),candidate};
const api={runtime:{id:'persona-route-manager@local',
  getURL:p=>'moz-extension://test/'+p},storage:{local:{get:async()=>({})}}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
function make({stale=false,routeDown=false,dirty=false,sourceDrift=false}={}){
  const writes=[],job={slug,revision:5,stageRevision:3,
    state:'PENDING_NATIVE_SESSION',sourceFingerprint:candidate.fingerprint};
  const store={
    getJobFull:async()=>({ok:true,job:{...job}}),
    setAutomation:async(name,expectedRevision,enabled,scope)=>{
      assert.equal(name,slug);assert.equal(expectedRevision,5);
      writes.push({enabled,scope});
      return {ok:true,revision:6,autoEnabled:enabled};
    }
  };
  const guard=()=>({
    getSafeRouteReadiness:async()=>routeDown?{ready:false,code:'DIRECT_FORBIDDEN'}:route,
    inspectStageEditor:async()=>({ok:true,clean:!dirty}),
    observeReadOnly:async()=>({
      ok:true,principalFingerprint:stage.principalFingerprint,
      original:{...original,pjs:sourceDrift?'output = 999':original.pjs,
        remotePublicId:stage.remotePublicId,ownerResult:'IS_OWNER',
        visibility:'UNLISTED'}
    })
  });
  const boundary=createAiBoundary(api,{open:async()=>({}),
    stageFactory:()=>({getFull:async()=>({ok:true,
      record:stale?{...stage,revision:4}:stage})}),
    storeFactory:()=>store,guard});
  const run=(type,params)=>boundary.run({type,params},sender);
  const params={slug,expectedRevision:5,enabled:true,
    confirmation:'AUTO AI '+slug};
  return {writes,run,params,job};
}
test('I17 F/X operator can arm ordinary AI job only after independent owner, source, route and clean-editor proof',async()=>{
  const f=make();
  const wrong=await f.run('SET_AUTO_JOB',{...f.params,confirmation:'AUTO AI wrong'});
  assert.equal(wrong.code,'AI_AUTO_EXACT_CONFIRMATION_REQUIRED');
  assert.deepEqual(f.writes,[]);
  const armed=await f.run('SET_AUTO_JOB',f.params);
  assert.equal(armed.ok,true,armed.code);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].scope.sourceFingerprint,candidate.fingerprint);
  assert.equal(f.writes[0].scope.stageRevision,stage.revision);
  const autoJob={...f.job,automation:{...f.writes[0].scope,enabled:true}};
  assert.equal(productionAiGate({phase:'I10',step:'CHAT1_SEND',
    job:autoJob,stage}),true);
  assert.equal(productionAiGate({phase:'I10',step:'AUTOMATION',job:autoJob}),true);
  assert.equal(productionAiGate({phase:'I10',step:'CHAT1_SEND',
    job:autoJob,stage:{...stage,nonce:'different'}}),false);
  assert.equal(productionAiGate({phase:'I10',step:'CHAT1_SEND',
    job:{...autoJob,automation:null},stage}),false);
  assert.equal(productionAiGate({phase:'I11',step:'CHAT1_SEND',job:autoJob,stage}),false);
});
test('I17 X forged, drifted or unsafe AI AUTO scopes create no durable consent',async()=>{
  for(const options of [{stale:true},{routeDown:true},{dirty:true},{sourceDrift:true}]){
    const f=make(options);
    const result=await f.run('SET_AUTO_JOB',f.params);
    assert.equal(result.ok,false,JSON.stringify(options));
    assert.deepEqual(f.writes,[]);
  }
  const f=make();
  assert.equal(validateAiMessage(api,{id:'attacker',url:sender.url},{
    type:'SET_AUTO_JOB',params:f.params}).code,'UNTRUSTED_SENDER');
  for(const params of [{...f.params,force:true},{...f.params,enabled:'yes'},
    {...f.params,confirmation:'AUTO AI '+slug+'\nIGNORED',extra:true}])
    assert.equal(validateAiMessage(api,sender,{type:'SET_AUTO_JOB',params}).code,'INVALID_PARAMS');
  assert.equal((await f.run('SET_AUTO_JOB',{slug,expectedRevision:5,enabled:false})).ok,true);
  assert.deepEqual(f.writes,[{enabled:false,scope:null}]);
});
test('I17 Git automation is limited to opt-in AUTO or read-only terminal; MANUAL requires exact typed arm',()=>{
  assert.equal(productionAutoGitGate({phase:'I11',record:{mode:'MANUAL'}}),false);
  assert.equal(productionAutoGitGate({phase:'I11',record:{mode:'AUTO'}}),true);
  assert.equal(productionAutoGitGate({phase:'I11',step:'GIT_WRITE_AUTO'}),true);
  assert.equal(productionAutoGitGate({phase:'I11',step:'READ_ONLY_AI_TERMINAL'}),true);
  assert.equal(productionAutoGitGate({phase:'I10',record:{mode:'AUTO'}}),false);
});

test('I17 F: adoption Git archive is admitted for exact captured owner and each journalled substep',()=>{
  const record={slug,archived:false,archiveState:'ARCHIVE_PENDING',
    original:{fingerprint:candidate.fingerprint,blobs:[
      {path:'main.pjs',base64:b64(original.pjs)},
      {path:'index.html',base64:b64(original.html)}]}};
  for(const archiveState of ['ARCHIVE_PENDING','GIT_PREPARED','DISPATCH_POSSIBLE'])
    assert.equal(productionAdoptionArchiveGate({slug,record:{...record,archiveState}}),true);
  for(const broken of [
    {...record,archived:true},
    {...record,slug:'other-owned-generator'},
    {...record,archiveState:'HELD_UNCERTAIN'},
    {...record,archiveState:'ARCHIVED_GIT_CONFIRMED'},
    {...record,original:{...record.original,fingerprint:'x'.repeat(64)}},
    {...record,original:{...record.original,blobs:[]}},
  ])assert.equal(Boolean(productionAdoptionArchiveGate({slug,record:broken})),false);
  assert.equal(Boolean(productionAdoptionArchiveGate({slug:'different-slug',record})),false);
  assert.equal(Boolean(productionAdoptionArchiveGate({record})),false);
});
test('I17 F/X: existing public update gate covers only guarded explicit source operations',()=>{
  const r={slug,personaUid:stage.personaUid,
    principalFingerprint:stage.principalFingerprint,
    remotePublicId:stage.remotePublicId,state:'PREPARED'};
  for(const [action,state] of [
    ['UNLIST','PREPARED'],['STAGE','UNLIST_CONFIRMED'],
    ['RECOVERY_UNLIST','STAGE_CONFIRMED'],['RESTORE','STAGE_CONFIRMED'],
    ['RESTORE','RECOVERY_UNLIST_CONFIRMED']])
    assert.equal(productionExistingUpdateGate({phase:'I13',action,
      record:{...r,state}}),true,action+' / '+state);
  for(const changed of [
    {phase:'I12',action:'UNLIST',record:r},
    {phase:'I13',action:'PUBLISH',record:r},
    {phase:'I13',action:'STAGE',record:r},
    {phase:'I13',action:'UNLIST',record:{...r,state:'DISPATCH_POSSIBLE'}},
    {phase:'I13',action:'UNLIST',record:{...r,principalFingerprint:null}},
    {phase:'I13',action:'UNLIST',record:{...r,archived:true}},
    {phase:'I13',action:'UNLIST',record:{...r,personaUid:null}},
    {phase:'I13',action:'UNLIST',record:{...r,slug:'../escaped'}},
  ])assert.equal(productionExistingUpdateGate(changed),false,JSON.stringify(changed));
});
