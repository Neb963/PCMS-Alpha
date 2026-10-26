import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createWritebackBoundary} from '../src/runtime/writeback-boundary.mjs';
function barrier(){let enter,release;return {entered:new Promise(r=>enter=r),
 wait:()=>{enter();return new Promise(r=>release=r);},release:()=>release()};}
async function fixture(){
 const slug='f2-git-final-fence',FP='a'.repeat(64),SESSION='b'.repeat(64),cut=barrier(),effects=[];
 const source=await exactSource([{path:'main.pjs',base64:btoa('f2 exact source')},
  {path:'index.html',base64:btoa('<main>f2</main>')}]);
 const stage={slug,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,accountId:'account_01',
  personaUid:'persona_01',principalFingerprint:FP,remotePublicId:'remote-fixture',nonce:'f'.repeat(32),
  sourceFolder:'generators/'+slug,sourceHead:'c'.repeat(40),candidate:source};
 const job={slug,revision:8,stageRevision:4,state:'TESTS_VERIFIED',sourceFingerprint:source.fingerprint,
  verifiedFinal:source.fingerprint,finalSource:source,executionSlotReleased:true,
  native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:SESSION}};
 let record={slug,revision:1,state:'PREPARED',mode:'MANUAL',operationId:'writeback_'+'d'.repeat(32),
  folder:stage.sourceFolder,baseHead:stage.sourceHead,expectedHead:stage.sourceHead,message:'fixture commit'};
 let allowed=true,epoch=1,restoring=false,armed=false,pauseUsed=false;
 const gate=()=>allowed;gate.generation=()=>epoch;
 const api={storage:{local:{get:async key=>{
  if(key==='pcmsRestoreInProgress'&&armed&&!pauseUsed){pauseUsed=true;await cut.wait();}
  if(key==='pcmsRestoreInProgress'&&restoring)return {[key]:{active:true,status:'PREPARING'}};
  return {};
 }}},runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p}};
 const boundary=createWritebackBoundary(api,{open:async()=>({}),effectGate:gate,
  credential:async()=>({ok:true,token:'synthetic-browser-token'}),
  storeFactory:()=>({getFull:async()=>({ok:true,record}),
   arm:async(_slug,revision)=>{
    if(record.state!=='PREPARED'||revision!==record.revision)return {ok:false,code:'STALE_REVISION'};
    record={...record,state:'DISPATCH_POSSIBLE',revision:2};armed=true;effects.push('MARKER');
    return {ok:true,revision:2};
   },finish:async(_slug,revision,proof)=>{
    assert.equal(revision,record.revision);record={...record,revision:3,
     state:proof.verified?'CONFIRMED':'HELD_UNCERTAIN'};return {ok:true,...record};
   }}),
  aiFactory:()=>({getJobFull:async()=>({ok:true,job})}),
  stageFactory:()=>({getFull:async()=>({ok:true,record:stage})}),
  guard:()=>({getSafeRouteReadiness:async()=>({ready:true,cookieStoreId:'container_01',routeId:'protected_01'}),
   inspectStageEditor:async()=>({ok:true,clean:true}),
   runNativeAiStep:async()=>({ok:true,busy:false,sessionDigest:SESSION,sourceSaved:true,editorClean:true,
    hasQueue:false,inputOccupied:false,attachmentsPending:false}),
   observeReadOnly:async()=>({ok:true,principalFingerprint:FP,
    original:{remotePublicId:stage.remotePublicId,ownerResult:'IS_OWNER',visibility:'UNLISTED',
     pjs:'f2 exact source',html:'<main>f2</main>',assets:[]}})
  }),
  write:async request=>{
   assert.equal(request.source.fingerprint,source.fingerprint);
   effects.push('WRITE');return {ok:true,code:'GIT_COMMITTED_VERIFIED',commitSha:'e'.repeat(40)};
  }});
 return {cut,effects,record:()=>record,
  change:type=>{epoch++;if(type==='REVOKE')allowed=false;if(type==='RESTORE')restoring=true;},
  run:()=>boundary.runTrusted({type:'COMMIT',params:{slug,expectedRevision:1}})};
}
for(const mode of ['REVOKE','REVOKE_REGRANT','RESTORE'])
 test('F2 Git dispatch rechecks '+mode+' after its final restore read and retains the armed journal',async()=>{
  const f=await fixture(),pending=f.run();await f.cut.entered;
  try{f.change(mode);}finally{f.cut.release();}
  assert.equal((await pending).code,'WRITEBACK_DISPATCH_UNCERTAIN');
  assert.deepEqual(f.effects,['MARKER']);assert.equal(f.record().state,'HELD_UNCERTAIN');
 });
test('F2 unchanged final Git authority writes once from exact source and cannot replay the marker',async()=>{
 const f=await fixture(),pending=f.run();await f.cut.entered;f.cut.release();
 assert.equal((await pending).state,'CONFIRMED');assert.deepEqual(f.effects,['MARKER','WRITE']);
 assert.equal((await f.run()).ok,false);assert.deepEqual(f.effects,['MARKER','WRITE']);
});
