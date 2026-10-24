import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createStagingBoundary} from '../src/runtime/staging-boundary.mjs';
import {createS06HumanStore,createS06HumanBoundary} from '../src/runtime/s06-human-review.mjs';
import {createHumanEditorBridge,handoffHumanEditor} from '../src/runtime/human-editor-bridge.mjs';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';
import {perchanceAiNative} from '../src/runtime/perchance-ai-native.mjs';
import {createS06ExceptionBoundary,authorizeS06Exception} from '../src/runtime/s06-exception-review.mjs';
import {createManualEditorBridge} from '../src/runtime/manual-editor-bridge.mjs';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';
import {scanMainCatalog} from '../src/runtime/git-catalog.mjs';
import {inspectReadyCandidate} from '../src/runtime/catalog-declaration.mjs';
import {createGitModel} from '../scripts/fixtures/j03-git-model.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
import {planAiStep} from '../src/runtime/ai-supervisor.mjs';
import {perchanceEditorProbe} from '../src/runtime/perchance-editor-probe.mjs';
const slug='human-review-integration',nonce='f'.repeat(32),personaUid='persona-00001',cookieStoreId='container-1',routeId='protected',sid='native-human-session-00001',principal='a'.repeat(64),commit='e'.repeat(40),input='b'.repeat(64);
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
const source=text=>exactSource([{path:'main.pjs',base64:btoa(text)},{path:'index.html',base64:btoa('<p>'+text+'</p>')}]);
async function fixture({closed=false}={}){
 const db=fakeDatabase(),P=await source('previous'),F=await source('tested'),H=await source('human saved');
 const stage={slug,nonce,personaUid,accountId:'account',revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,candidate:F,previous:P,
  readyIdentifier:'ready-current',readyInputFingerprint:input,sourceFolder:'generators/'+slug,principalFingerprint:principal,remotePublicId:'remote',bindingVersion:1};
 const job={schema:1,slug,revision:7,stageRevision:4,state:'TESTS_VERIFIED',sourceFingerprint:F.fingerprint,verifiedFinal:F.fingerprint,finalSource:F,
  readyIdentifier:'ready-current',readyInputFingerprint:input,executionSlotReleased:true,prompt:{revision:2,text:'Test the saved source.',tests:['default_generator_smoke']},
  native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:'d'.repeat(64)},chat1:{sessionDigest:'d'.repeat(64),tests:{default_generator_smoke:{result:'PASS',sourceFingerprint:F.fingerprint}}},chat2:null};
 await put(db,{key:'stage:'+slug,record:stage},{key:'ai-job:'+slug,job,accountId:'account'},
  {key:'s05-ready:'+slug,record:{slug,revision:1,active:{identifier:'ready-current',inputFingerprint:input},desired:null,hold:null}},
  {key:'writeback:'+slug,record:{slug,revision:1,state:'CONFIRMED',mode:'S06',stageRevision:4,jobRevision:7,sourceFingerprint:F.fingerprint,commitSha:commit,folder:'generators/'+slug,readyIdentifier:'ready-current',readyInputFingerprint:input}});
 const prior={browser:globalThis.browser,window:globalThis.window,document:globalThis.document,location:globalThis.location};
 let currentSid=sid,helperMissing=false,savedText='human saved',dirty=false,busy=false,collab=false,failUntag=false,failReclaim=false,newerTakeover=false,changedDuringCapture=false,reads=0,created=0;const settings={},effects={send:0,stop:0,newChat:0,close:0,navigate:0};
 const handoffButton={disabled:true},handoffStatus={textContent:''},host={dataset:{pcmsNonce:nonce,pcmsHumanIntent:'true',pcmsHumanIntentEpoch:'1'},querySelector:s=>s==='button'?handoffButton:handoffStatus};
 const button=key=>({tagName:'BUTTON',get hidden(){return key==='stop'?!busy:false},disabled:false,click:()=>effects[key]++});
 const ids={'pcms-alpha-editor-context':host,aiAgentSendBtn:button('send'),aiAgentStopBtn:button('stop'),aiAgentNewChatBtn:button('newChat'),aiAgentInputEl:{tagName:'TEXTAREA',value:'',dispatchEvent(){}},
  aiAgentMsgsEl:{childElementCount:4},aiAgentWallEl:{get hidden(){return !busy}},aiAgentQueueRowEl:{hidden:true,style:{display:'none'}},aiAgentPanelEl:{},aiAgentAttachChipsEl:{childElementCount:0}};
 globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};globalThis.document={getElementById:id=>helperMissing&&id.startsWith('aiAgent')?null:ids[id]||null};
 globalThis.window={__editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,app:{data:{generator:{name:slug,isPrivate:true}}},
  srcState:{getDraftChatSid:()=>currentSid,isDirty:async()=>dirty,conflictPaths:()=>[]},modelTextEditor:{isClean:()=>!dirty},outputTemplateEditor:{isClean:()=>!dirty},menuBar:{get saveState(){return dirty?'unsaved':'saved'}},
  editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,get yjsProvider(){return collab?{}:null},saveCheckpointManager:{isDivergenceBlocked:()=>false}};
 const tabs=new Map(closed?[]:[[1,{id:1,url:'https://perchance.org/'+slug+'#edit',cookieStoreId}]]),tags=new Map();
 const tagKey=(id,key)=>id+':'+key;
 if(!closed)tags.set(tagKey(1,'pcmsI09Owned'),{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_I09'});
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async key=>({[key]:settings[key]})}},
  tabs:{query:async()=>[...tabs.values()],get:async id=>tabs.get(id),create:async({url,cookieStoreId})=>{created++;host.dataset.pcmsHumanIntent='false';host.dataset.pcmsHumanIntentEpoch='0';const tab={id:100+created,url,cookieStoreId};tabs.set(tab.id,tab);return tab},remove:()=>effects.close++,update:()=>effects.navigate++},
  sessions:{getTabValue:async(id,key)=>structuredClone(tags.get(tagKey(id,key))),setTabValue:async(id,key,value)=>{if(failReclaim&&key==='pcmsI09Owned')throw Error('interrupted reclaim');tags.set(tagKey(id,key),structuredClone(value))},removeTabValue:async(id,key)=>{if(failUntag)throw Error('interrupted handoff');tags.delete(tagKey(id,key))}},
  scripting:{executeScript:async({func,args})=>[{frameId:0,result:await func(...args)}]}};
 globalThis.browser=api;
 const state={profiles:{[cookieStoreId]:{personaUid,routeId}},routes:{[routeId]:{enabled:true}}},active=new Map();let seq=0;
 const shared={resolve:async()=>({personaUid,cookieStoreId,routeId,route:{enabled:true},pcmsBindingId:'binding'}),acquire:async()=>{assert.equal(active.size,0);const lease={leaseId:'lease-'+(++seq),cookieStoreId};active.set(lease.leaseId,lease);return lease},validate:async(_,id)=>{assert.ok(active.has(id));return {cookieStoreId}},release:async id=>active.delete(id)};
 const bridge=createHumanEditorBridge({browser:api,getState:async()=>state,open:async()=>db});
 const guard=createPersonaGuard({initialize:async()=>{},securityState:{ready:true,privacySafe:true,proxyControl:'controlled_by_this_extension'},shared,getRouteTest:async()=>({ok:true}),pinGate:()=>({allow:true}),inspectStageTab:async(_,r)=>perchanceEditorProbe(r.slug),aiNativeStep:async(_,request)=>perchanceAiNative(request),manualEditorTab:createManualEditorBridge({browser:api,getState:async()=>state,open:async()=>db}),humanReviewTab:async(context,request)=>{if(request.action==='RECLAIM'&&newerTakeover)host.dataset.pcmsHumanIntentEpoch=String(Number(host.dataset.pcmsHumanIntentEpoch)+1);return bridge(context,request)},
  handoffStagingTab:r=>handoffHumanEditor(api,r),readIsolatedTab:async()=>{reads++;const text=changedDuringCapture&&reads===2?'a later human save':savedText;return {ok:true,principalFingerprint:principal,original:{remotePublicId:'remote',ownerResult:'IS_OWNER',visibility:'UNLISTED',pjs:text,html:'<p>'+text+'</p>',assets:[]}}}});
 const stageBoundary=()=>createStagingBoundary(api,{open:async()=>db,guard:()=>guard});
 const handoff=async()=>stageBoundary().run({type:'HANDOFF_STAGE',params:{slug,expectedRevision:db.read('meta','stage:'+slug).record.revision}},{id:'fixture',url:'moz-extension://fixture/pcms/index.html'});
 const human=createS06HumanStore(db),humanBoundary=()=>createS06HumanBoundary(api,{open:async()=>db,guard:()=>guard});
 const defer=()=>human.defer({name:slug,expectedStageRevision:db.read('meta','stage:'+slug).record.revision,expectedJobRevision:7,expectedFingerprint:F.fingerprint});
 return {db,P,F,H,settings,host,handoffButton,handoffStatus,api,tabs,tags,active,effects,guard,handoff,human,defer,stageBoundary,humanBoundary,created:()=>created,
  noNative:()=>{currentSid=null;helperMissing=true;host.dataset.pcmsHumanIntent='false'},savedText:v=>savedText=v,takeover:v=>newerTakeover=v,dirty:v=>dirty=v,busy:v=>busy=v,collab:v=>collab=v,failUntag:v=>failUntag=v,failReclaim:v=>failReclaim=v,race:v=>changedDuringCapture=v,
  restore:()=>Object.assign(globalThis,prior)};
}
test('J04 real handoff, interrupted untag and restarted adoption retain parent provenance and reset all authority',async()=>{
 const f=await fixture();try{
  f.failUntag(true);assert.equal((await f.handoff()).code,'HANDOFF_RELEASE_UNVERIFIED');
  assert.equal(f.db.read('meta','stage:'+slug).record.state,'HANDOFF_REQUESTED');assert.ok(f.tags.has('1:pcmsHumanReview'));
  f.failUntag(false);assert.equal((await f.handoff()).state,'HUMAN_OWNED');assert.equal((await f.handoff()).state,'HUMAN_OWNED');assert.equal(f.tags.has('1:pcmsI09Owned'),false);
  assert.equal(f.db.read('meta','stage-history:'+slug+':4').record.state,'SOURCE_VERIFIED');
  assert.equal((await perchanceAiNative({slug,nonce,action:'OBSERVE'})).code,'HUMAN_EDITOR_HOLD');assert.equal((await perchanceEditorProbe(slug)).code,'HUMAN_HANDOFF_REQUESTED');
  const deferred=await f.defer();assert.equal(deferred.ok,true,JSON.stringify(deferred));assert.equal(deferred.parentStageRevision,4);
  f.failReclaim(true);const held=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:deferred.revision}});
  assert.equal(held.code,'S06_HUMAN_EDITOR_RECLAIM_PENDING');assert.equal(f.db.read('meta','stage:'+slug).record.humanReclaimPending,true);
  f.failReclaim(false);const row=await f.human.get(slug),done=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:row.revision}});
  assert.equal(done.ok,true,JSON.stringify(done));assert.equal(done.reclaimPending,false);assert.equal(f.host.dataset.pcmsHumanIntent,'false');assert.equal(f.handoffButton.disabled,false);
  const child=f.db.read('meta','ai-job:'+slug).job;assert.equal(child.state,'PENDING_NATIVE_SESSION');assert.equal(child.verifiedFinal,null);assert.deepEqual(child.chat1.tests,{});assert.equal(child.sourceFingerprint,f.H.fingerprint);
  assert.equal(f.db.read('meta','ai-history:'+slug+':7').job.finalSource.fingerprint,f.F.fingerprint);assert.equal(f.db.read('meta','stage:'+slug).record.previous.fingerprint,f.P.fingerprint);
  assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});assert.equal(f.active.size,0);
 }finally{f.restore()}
});
test('J04 closed human editor uses positive absence plus double saved-source capture, creates one owned editor without restaging',async()=>{
 const f=await fixture({closed:true});try{
  assert.equal((await f.handoff()).state,'HUMAN_OWNED');const held=await f.defer();
  const done=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:held.revision}});assert.equal(done.ok,true,JSON.stringify(done));
  assert.equal(f.created(),1);assert.equal(f.tabs.size,1);assert.equal(f.db.read('meta','stage:'+slug).record.candidate.fingerprint,f.H.fingerprint);
  assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});assert.equal(f.active.size,0);
 }finally{f.restore()}
});
test('J04 dirty, active, collaborative, duplicate, wrong-Persona and changed saved human source cannot be adopted or overwritten',async()=>{
 for(const mode of ['dirty','busy','collab','duplicate','wrong-persona','changed-source']){const f=await fixture();try{
  await f.handoff();const held=await f.defer();if(mode==='duplicate')f.tabs.set(2,{id:2,url:'https://perchance.org/'+slug+'#edit',cookieStoreId});
  else if(mode==='wrong-persona')f.tabs.get(1).cookieStoreId='other-container';else if(mode==='changed-source')f.race(true);else f[mode](true);
  const out=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:held.revision}});assert.equal(out.ok,false,mode+JSON.stringify(out));
  assert.equal(f.db.read('meta','stage:'+slug).record.state,'HUMAN_OWNED');assert.equal(f.db.read('meta','ai-job:'+slug).job.verifiedFinal,f.F.fingerprint);
  assert.equal(f.host.dataset.pcmsHumanIntent,'true');assert.equal(f.tags.has('1:pcmsI09Owned'),false);assert.equal(f.created(),0);assert.equal(f.active.size,0);
  assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});
 }finally{f.restore()}}
});
test('J04 adoption cannot clear a newer takeover; explicit retry captures a fresh observation and the strip remains reusable',async()=>{
 const f=await fixture();try{
  await f.handoff();const held=await f.defer();f.takeover(true);
  const out=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:held.revision}});assert.equal(out.code,'S06_HUMAN_EDITOR_RECLAIM_PENDING');
  assert.equal(f.host.dataset.pcmsHumanIntent,'true');assert.equal(f.tags.has('1:pcmsI09Owned'),false);
  const captured=f.db.read('meta','stage:'+slug).record;assert.equal(captured.humanReclaimObservation.humanEpoch,'1');assert.equal(f.host.dataset.pcmsHumanIntentEpoch,'2');
  f.takeover(false);const current=await f.human.get(slug),done=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:current.revision}});
  assert.equal(done.ok,true,JSON.stringify(done));assert.equal(f.handoffButton.disabled,false);assert.equal(f.host.dataset.pcmsHumanIntent,'false');
  assert.equal(f.db.read('meta','stage-history:'+slug+':'+captured.revision).record.candidate.fingerprint,f.H.fingerprint);
  f.host.dataset.pcmsHumanIntent='true';f.host.dataset.pcmsHumanIntentEpoch='3';assert.equal((await f.handoff()).state,'HUMAN_OWNED');
  assert.equal(f.tags.has('1:pcmsI09Owned'),false);assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});
 }finally{f.restore()}
});
test('J04 adopted source waits for bounded account capacity and preserves an explicit parent Pause',async()=>{
 for(const paused of [false,true]){const f=await fixture();try{
  const old=f.db.read('meta','ai-job:'+slug);await put(f.db,{...old,job:{...old.job,operatorPaused:paused,controlRevision:4}},{key:'ai-job:other',accountId:'account',job:{slug:'other',executionSlotReleased:false}});
  await f.handoff();const held=await f.defer(),done=await f.humanBoundary().runTrusted({type:'ADOPT_HUMAN',params:{slug,expectedRevision:held.revision}});assert.equal(done.ok,true,JSON.stringify(done));
  const store=createAiStore(f.db),child=(await store.getJobFull(slug)).job;assert.equal(child.sourceFingerprint,f.H.fingerprint);assert.equal(child.executionSlotReleased,true);assert.equal(child.awaitingExecutionSlot,true);assert.equal(child.operatorPaused,paused);assert.equal(child.controlRevision,5);
  assert.equal(planAiStep(child).type,paused?undefined:'ADMIT_JOB');assert.equal((await store.admitExecutionSlot(slug,child.revision)).code,paused?'AI_OPERATOR_PAUSED':'AI_ACCOUNT_CONCURRENCY_HELD');
  await put(f.db,{key:'ai-job:other',accountId:'account',job:{slug:'other',executionSlotReleased:true}});
  if(paused)assert.equal((await store.operatorControl(slug,child.revision,child.controlRevision,{paused:false})).ok,true);
  const admitted=await store.admitExecutionSlot(slug,child.revision);assert.equal(admitted.ok,true,JSON.stringify(admitted));assert.equal(admitted.slotReleased,false);
  assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});
 }finally{f.restore()}}
});
test('J04 never-started unavailable helper has a real manual route with no invented native SID; closed saved editor can reopen only after exact approval',async()=>{
 for(const closed of [false,true]){const f=await fixture({closed});try{
  f.noNative();f.savedText('tested');const row=f.db.read('meta','ai-job:'+slug),job={...row.job,state:'PENDING_NATIVE_SESSION',native:null,finalSource:null,verifiedFinal:null,executionSlotReleased:false,
   hold:'NATIVE_AI_NOT_WIRED',chat1:{state:'PENDING',sessionDigest:null,tests:{}}};await put(f.db,{...row,job});
  const boundary=createS06ExceptionBoundary(f.api,{open:async()=>f.db,guard:()=>f.guard});
  const out=await boundary.runTrusted({type:'RECORD_EXCEPTION',params:{slug,mode:'MANUAL_INFRASTRUCTURE',checks:[{name:'default_generator_smoke',result:'PASS',observation:'I opened the saved generator and checked the visible output and keyboard behavior.'}],consent:'I PERFORMED THE RECORDED MANUAL CHECKS',expectedStageRevision:4,expectedJobRevision:7,sourceFingerprint:f.F.fingerprint}});
  assert.equal(out.ok,true,JSON.stringify(out));const current=f.db.read('meta','ai-job:'+slug).job;assert.equal(current.native,null);assert.equal(current.verifiedFinal,null);assert.equal(current.state,'PENDING_NATIVE_SESSION');
  assert.deepEqual(current.chat1.tests,{});assert.equal(current.exceptionQuiescence,'NEVER_DISPATCHED_SOURCE');assert.equal(current.finalSource.fingerprint,f.F.fingerprint);assert.equal(current.revision,8);
  const ready=f.db.read('meta','s05-ready:'+slug).record,stage=f.db.read('meta','stage:'+slug).record,exception=f.db.read('meta','s06-exception:'+slug).record;
  assert.equal(authorizeS06Exception({ready,stage,job:current,record:exception}).ok,true);
  assert.equal((await f.guard.prepareManualEditor(personaUid,slug,nonce)).ok,false,'a manual source observation cannot itself authorize editor creation or publication');
  await put(f.db,{key:'release:'+slug,release:{state:'APPROVED',approval:{aiVerified:false,jobRevision:8,stageRevision:4,sourceFingerprint:f.F.fingerprint}}});
  const editor=await f.guard.prepareManualEditor(personaUid,slug,nonce);assert.equal(editor.ok,true,JSON.stringify(editor));assert.equal(editor.noNativeSession,true);assert.equal(editor.noEditors,false);
  assert.equal(f.created(),closed?1:0);assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});assert.equal(f.active.size,0);
 }finally{f.restore()}}
});
test('J04 native absence is not inferred from missing controls when a session, dirty source or possible dispatch exists',async()=>{
 for(const adverse of ['session','dirty','possible']){const f=await fixture();try{
  f.savedText('tested');if(adverse!=='session')f.noNative();else f.host.dataset.pcmsHumanIntent='false';if(adverse==='dirty')f.dirty(true);
  const row=f.db.read('meta','ai-job:'+slug),job={...row.job,state:'PENDING_NATIVE_SESSION',native:adverse==='possible'?{state:'DISPATCH_POSSIBLE',step:'CHAT1_SEND'}:null,finalSource:null,verifiedFinal:null,executionSlotReleased:false,hold:'NATIVE_AI_NOT_WIRED',chat1:{state:'PENDING',sessionDigest:null,tests:{}}};await put(f.db,{...row,job});
  const boundary=createS06ExceptionBoundary(f.api,{open:async()=>f.db,guard:()=>f.guard}),r=await boundary.runTrusted({type:'RECORD_EXCEPTION',params:{slug,mode:'MANUAL_INFRASTRUCTURE',checks:[{name:'default_generator_smoke',result:'PASS',observation:'I actually checked the saved generator behavior.'}],consent:'I PERFORMED THE RECORDED MANUAL CHECKS',expectedStageRevision:4,expectedJobRevision:7,sourceFingerprint:f.F.fingerprint}});
  assert.equal(r.ok,false,adverse+JSON.stringify(r));assert.equal(f.db.read('meta','s06-exception:'+slug),undefined);assert.equal(f.created(),0);assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});
 }finally{f.restore()}}
});
test('J04 actual BEGIN_NATIVE observes a missing helper before dispatch intent, then permits guarded manual review and stays frozen across supervisor wakes',async()=>{
 const f=await fixture();try{
  f.noNative();f.savedText('tested');const model=await createGitModel(),repository='Neb963/per-gens',token='offline-helper-availability-credential';
  await model.merge({'pcms/prompts/default-chat1.md':'Test the saved source.',['generators/'+slug+'/DEPLOYMENT.md']:'Status: READY\nReady-Revision: missing-helper-001\n',
    ['generators/'+slug+'/main.pjs']:'tested',['generators/'+slug+'/index.html']:'<p>tested</p>'});
  const catalog=await scanMainCatalog({repository,token},model.transport),coherent=await inspectReadyCandidate({repository,token,slug,pinnedHead:catalog.head,includeSourceBytes:true},model.transport);assert.equal(coherent.ok,true,JSON.stringify(coherent));
  f.settings.pcmsS03Git={repository,repositoryId:'42'};
  const row=f.db.read('meta','ai-job:'+slug),stage=f.db.read('meta','stage:'+slug).record;
  const job={...row.job,state:'PENDING_NATIVE_SESSION',native:null,finalSource:null,verifiedFinal:null,executionSlotReleased:true,awaitingExecutionSlot:true,
   hold:'NATIVE_AI_ACTIVATION_NOT_PROVEN',readyIdentifier:'rev-missing-helper-001',readyInputFingerprint:coherent.inputFingerprint,chat1:{state:'PENDING',sessionDigest:null,tests:{}}};
  await put(f.db,{...row,job},{key:'stage:'+slug,record:{...stage,readyIdentifier:job.readyIdentifier,readyInputFingerprint:coherent.inputFingerprint}},
    {key:'s05-ready:'+slug,record:{slug,revision:2,repositoryId:'42',active:{identifier:job.readyIdentifier,inputFingerprint:coherent.inputFingerprint},desired:null,hold:null}});
  const ai=createAiBoundary(f.api,{open:async()=>f.db,guard:()=>f.guard,effectGate:()=>true,clock:()=>Date.now()+180000,
   gitCredential:async()=>({ok:true,credential:token}),scanCatalog:o=>scanMainCatalog(o,model.transport),inspectReady:o=>inspectReadyCandidate(o,model.transport)});
  const admitted=await ai.tick();assert.equal(admitted.ok,true,JSON.stringify(admitted));
  const failed=await ai.tick();assert.equal(failed.code,'NATIVE_HELPER_UNAVAILABLE',JSON.stringify(failed));
  const never=f.db.read('meta','ai-job:'+slug).job;assert.equal(never.native,null);assert.equal(never.schedulerHold,'AI_WAKE_NATIVE_HELPER_UNAVAILABLE');
  assert.equal(f.db.keys('events').map(k=>f.db.read('events',k)).some(e=>e.stage==='AI_DISPATCH_POSSIBLE'),false);
  // Exercise the queued-capacity freeze race using real operator intent.
  await createAiStore(f.db).operatorControl(slug,never.revision,never.controlRevision,{paused:true});
  const paused=(await createAiStore(f.db).getJobFull(slug)).job;
  // A released never-started child may wait for capacity after Resume.
  await put(f.db,{key:'ai-job:'+slug,accountId:'account',job:{...paused,executionSlotReleased:true}});
  assert.equal((await createAiStore(f.db).operatorControl(slug,paused.revision,paused.controlRevision,{paused:false})).ok,true);
  const queued=(await createAiStore(f.db).getJobFull(slug)).job;assert.equal(queued.awaitingExecutionSlot,true);
  const manual=await createS06ExceptionBoundary(f.api,{open:async()=>f.db,guard:()=>f.guard}).runTrusted({type:'RECORD_EXCEPTION',params:{slug,mode:'MANUAL_INFRASTRUCTURE',checks:[{name:'default_generator_smoke',result:'PASS',observation:'I inspected the saved output and keyboard actions in Firefox.'}],consent:'I PERFORMED THE RECORDED MANUAL CHECKS',expectedStageRevision:4,expectedJobRevision:queued.revision,sourceFingerprint:f.F.fingerprint}});
  assert.equal(manual.ok,true,JSON.stringify(manual));const frozen=(await createAiStore(f.db).getJobFull(slug)).job;assert.equal(frozen.awaitingExecutionSlot,false);assert.equal(frozen.executionSlotReleased,true);
  for(let n=0;n<3;n++)assert.equal((await ai.tick()).code,'AI_NO_ELIGIBLE_WORK');
  assert.equal((await createAiStore(f.db).admitExecutionSlot(slug,frozen.revision)).code,'AI_EXCEPTION_REVIEW_FROZEN');
  assert.deepEqual(f.effects,{send:0,stop:0,newChat:0,close:0,navigate:0});assert.equal(model.state.effects.length,0);
 }finally{f.restore()}
});
