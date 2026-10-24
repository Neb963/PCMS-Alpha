import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createStagingBoundary} from '../src/runtime/staging-boundary.mjs';
import {createS06HumanStore,createS06HumanBoundary} from '../src/runtime/s06-human-review.mjs';
import {createHumanEditorBridge,handoffHumanEditor} from '../src/runtime/human-editor-bridge.mjs';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';
import {perchanceAiNative} from '../src/runtime/perchance-ai-native.mjs';
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
 let dirty=false,busy=false,collab=false,failUntag=false,failReclaim=false,changedDuringCapture=false,reads=0,created=0;const effects={send:0,stop:0,newChat:0,close:0,navigate:0};
 const host={dataset:{pcmsNonce:nonce,pcmsHumanIntent:'true',pcmsHumanIntentEpoch:'1'}};
 const button=key=>({tagName:'BUTTON',get hidden(){return key==='stop'?!busy:false},disabled:false,click:()=>effects[key]++});
 const ids={'pcms-alpha-editor-context':host,aiAgentSendBtn:button('send'),aiAgentStopBtn:button('stop'),aiAgentNewChatBtn:button('newChat'),aiAgentInputEl:{tagName:'TEXTAREA',value:'',dispatchEvent(){}},
  aiAgentMsgsEl:{childElementCount:4},aiAgentWallEl:{get hidden(){return !busy}},aiAgentQueueRowEl:{hidden:true,style:{display:'none'}},aiAgentPanelEl:{},aiAgentAttachChipsEl:{childElementCount:0}};
 globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};globalThis.document={getElementById:id=>ids[id]||null};
 globalThis.window={__editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,app:{data:{generator:{name:slug,isPrivate:true}}},
  srcState:{getDraftChatSid:()=>sid,isDirty:async()=>dirty,conflictPaths:()=>[]},modelTextEditor:{isClean:()=>!dirty},outputTemplateEditor:{isClean:()=>!dirty},menuBar:{get saveState(){return dirty?'unsaved':'saved'}},
  editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,get yjsProvider(){return collab?{}:null},saveCheckpointManager:{isDivergenceBlocked:()=>false}};
 const tabs=new Map(closed?[]:[[1,{id:1,url:'https://perchance.org/'+slug+'#edit',cookieStoreId}]]),tags=new Map();
 const tagKey=(id,key)=>id+':'+key;
 if(!closed)tags.set(tagKey(1,'pcmsI09Owned'),{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_I09'});
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async()=>({})}},
  tabs:{query:async()=>[...tabs.values()],get:async id=>tabs.get(id),create:async({url,cookieStoreId})=>{created++;host.dataset.pcmsHumanIntent='false';host.dataset.pcmsHumanIntentEpoch='0';const tab={id:100+created,url,cookieStoreId};tabs.set(tab.id,tab);return tab},remove:()=>effects.close++,update:()=>effects.navigate++},
  sessions:{getTabValue:async(id,key)=>structuredClone(tags.get(tagKey(id,key))),setTabValue:async(id,key,value)=>{if(failReclaim&&key==='pcmsI09Owned')throw Error('interrupted reclaim');tags.set(tagKey(id,key),structuredClone(value))},removeTabValue:async(id,key)=>{if(failUntag)throw Error('interrupted handoff');tags.delete(tagKey(id,key))}},
  scripting:{executeScript:async({func,args})=>[{frameId:0,result:await func(...args)}]}};
 globalThis.browser=api;
 const state={profiles:{[cookieStoreId]:{personaUid,routeId}},routes:{[routeId]:{enabled:true}}},active=new Map();let seq=0;
 const shared={resolve:async()=>({personaUid,cookieStoreId,routeId,route:{enabled:true},pcmsBindingId:'binding'}),acquire:async()=>{assert.equal(active.size,0);const lease={leaseId:'lease-'+(++seq),cookieStoreId};active.set(lease.leaseId,lease);return lease},validate:async(_,id)=>{assert.ok(active.has(id));return {cookieStoreId}},release:async id=>active.delete(id)};
 const bridge=createHumanEditorBridge({browser:api,getState:async()=>state,open:async()=>db});
 const guard=createPersonaGuard({initialize:async()=>{},securityState:{ready:true,privacySafe:true,proxyControl:'controlled_by_this_extension'},shared,getRouteTest:async()=>({ok:true}),pinGate:()=>({allow:true}),humanReviewTab:bridge,
  handoffStagingTab:r=>handoffHumanEditor(api,r),readIsolatedTab:async()=>{reads++;const text=changedDuringCapture&&reads===2?'a later human save':'human saved';return {ok:true,principalFingerprint:principal,original:{remotePublicId:'remote',ownerResult:'IS_OWNER',visibility:'UNLISTED',pjs:text,html:'<p>'+text+'</p>',assets:[]}}}});
 const stageBoundary=()=>createStagingBoundary(api,{open:async()=>db,guard:()=>guard});
 const handoff=async()=>stageBoundary().run({type:'HANDOFF_STAGE',params:{slug,expectedRevision:db.read('meta','stage:'+slug).record.revision}},{id:'fixture',url:'moz-extension://fixture/pcms/index.html'});
 const human=createS06HumanStore(db),humanBoundary=()=>createS06HumanBoundary(api,{open:async()=>db,guard:()=>guard});
 const defer=()=>human.defer({name:slug,expectedStageRevision:db.read('meta','stage:'+slug).record.revision,expectedJobRevision:7,expectedFingerprint:F.fingerprint});
 return {db,P,F,H,host,api,tabs,tags,active,effects,guard,handoff,human,defer,stageBoundary,humanBoundary,created:()=>created,
  dirty:v=>dirty=v,busy:v=>busy=v,collab:v=>collab=v,failUntag:v=>failUntag=v,failReclaim:v=>failReclaim=v,race:v=>changedDuringCapture=v,
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
  assert.equal(done.ok,true,JSON.stringify(done));assert.equal(done.reclaimPending,false);assert.equal(f.host.dataset.pcmsHumanIntent,'false');
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
