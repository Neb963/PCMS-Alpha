import test from 'node:test';import assert from 'node:assert/strict';
import {createStageEditorBridge,stageWasNotInvoked} from '../src/runtime/stage-editor-bridge.mjs';
import {perchanceAiNative} from '../src/runtime/perchance-ai-native.mjs';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
const slug='owned-successor',nonce='a'.repeat(32),personaUid='persona-stage',cookieStoreId='container-stage',routeId='protected',url='https://perchance.org/'+slug+'#edit';
const files=(p,h,asset)=>[{path:'main.pjs',base64:btoa(p)},{path:'index.html',base64:btoa(h)},{path:'src/'+asset,base64:'AP8R'}];
async function fixture(mode=''){
 const old=Object.fromEntries(['window','document','location','localStorage'].map(k=>[k,globalThis[k]])),db=fakeDatabase(),previous=await exactSource(files('old P','<p>old</p>','deleted.bin')),candidate=await exactSource(files('new F','<h1>new</h1>','added.bin'));
 let pjs='old P',html='<p>old</p>',state='saved',assetDirty=false,saves=0,mutations=0,calls=0;const assets=new Map([['deleted.bin',new Uint8Array([0,255,17])]]);
 const ids={'pcms-alpha-editor-context':{dataset:{pcmsHumanIntent:mode==='human'?'true':'false'}},aiAgentPanelEl:{},aiAgentMsgsEl:{childElementCount:2},aiAgentAttachChipsEl:{childElementCount:mode==='attachment'?1:0},aiAgentWallEl:{hidden:mode!=='busy'},aiAgentQueueRowEl:{hidden:mode!=='queue',style:{display:mode==='queue'?'flex':'none'}},aiAgentInputEl:{tagName:'TEXTAREA',value:mode==='input'?'unsent human text':''}};
 for(const k of ['aiAgentSendBtn','aiAgentStopBtn','aiAgentNewChatBtn'])ids[k]={tagName:'BUTTON',hidden:k==='aiAgentStopBtn'&&mode!=='busy',disabled:false};
 globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};globalThis.document={getElementById:k=>ids[k]||null};globalThis.localStorage={getItem:()=>JSON.stringify({[slug]:{single:true}})};
 globalThis.window={__editorReady:mode!=='loading',__saveInFlight:false,userOwnsThisGenerator:true,editorCollabInitialSyncIsPending:false,
  app:{data:{generator:{name:slug,isPrivate:true}},async saveGenerator(){saves++;state='saved';assetDirty=false;if(mode==='lost')throw Error('lost ACK');return true}},
  modelTextEditor:{getValue:()=>pjs,isClean:()=>mode!=='dirty',setValue:v=>{mutations++;pjs=v;state='unsaved'}},outputTemplateEditor:{getValue:()=>html,isClean:()=>true,setValue:v=>{mutations++;html=v;state='unsaved'}},
  srcState:{ready:async()=>{},list:()=>Object.fromEntries([...assets.keys()].map(k=>[k,{pending:false}])),readFile:async k=>assets.get(k)?.buffer,writeFile:async(k,v)=>{assets.set(k,new Uint8Array(v));mutations++;assetDirty=true;state='unsaved'},deleteFile:async k=>{assets.delete(k);mutations++;assetDirty=true;state='unsaved'},isDirty:async()=>assetDirty,hasPending:()=>false,conflictPaths:()=>[],getDraftChatSid:()=>null},
  menuBar:{get saveState(){return state}},saveCheckpointManager:{isDivergenceBlocked:()=>false},...(mode==='collab'?{yjsProviderRoomName:'unverified'}:{})};
 const tag={slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_I09',humanIntent:false};if(mode==='tag')tag.nonce='b'.repeat(32);if(mode==='human-tag')tag.humanIntent=true;
 let tabs=mode==='closed'?[]:[{id:10,url,cookieStoreId}],tags=new Map([[10,tag]]);
 if(mode==='duplicate')tabs.push({id:11,url,cookieStoreId});if(mode==='wrong-persona')tabs[0].cookieStoreId='human-other-container';if(mode==='unrelated')tabs.push({id:11,url:'https://perchance.org/'+slug+'-other#edit',cookieStoreId});
 const browser={storage:{local:{get:async()=>({})}},tabs:{query:async()=>structuredClone(tabs),get:async id=>structuredClone(tabs.find(t=>t.id===id)),create:async t=>{const tab={id:12,...t};tabs.push(tab);return tab}},sessions:{getTabValue:async id=>tags.get(id),setTabValue:async(id,k,v)=>tags.set(id,v)},scripting:{executeScript:async({func,args})=>{calls++;if(func.name==='renderPcmsEditorStrip')return [{frameId:0,result:undefined}];return [{frameId:0,result:await func(...args)}]}}};
 const record={slug,revision:12,parentStageRevision:8,state:'DISPATCH_POSSIBLE',personaUid,nonce,previous,candidate};
 const t=db.transaction('meta','readwrite');t.objectStore('meta').put({key:'stage:'+slug,record});await new Promise(r=>t.oncomplete=r);
 const options={browser,open:async()=>db,wait:async()=>{},getState:async()=>({profiles:{[cookieStoreId]:{personaUid,routeId}},routes:{[routeId]:{enabled:true}}})};
 return {record,options,request:{slug,nonce,stageRevision:12,previousFiles:previous.blobs,previousFingerprint:previous.fingerprint,candidate:candidate.blobs},state:()=>({pjs,html,saves,mutations,calls,paths:[...assets.keys()],tabCount:tabs.length}),restore(){for(const [k,v]of Object.entries(old))if(v===undefined)delete globalThis[k];else globalThis[k]=v}};
}
test('J04 retained exact owned editor and cold bridge reuse fixed full-source adapter, including deletion; unrelated slug is isolated',async()=>{
 for(const mode of ['', 'unrelated','closed']){const f=await fixture(mode);try{const bridge=createStageEditorBridge(f.options),out=await bridge({personaUid,cookieStoreId,routeId},f.request);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(f.state().saves,1);assert.deepEqual(f.state().paths,['added.bin']);assert.equal(f.state().tabCount,mode==='unrelated'?2:1);assert.equal(out.tab.ownershipNonce,nonce)}finally{f.restore()}}
});
test('J04 stage editor cannot overwrite duplicate, wrong owner, human intent, dirty, active or queued native editor',async()=>{
 for(const mode of ['duplicate','wrong-persona','tag','human-tag','human','dirty','busy','queue','input','attachment','collab','loading']){const f=await fixture(mode);try{const out=await createStageEditorBridge(f.options)({personaUid,cookieStoreId,routeId},f.request);assert.equal(out.ok,false,mode);assert.equal(stageWasNotInvoked(out,f.record),true,mode);assert.equal(f.state().mutations,0,mode);assert.equal(f.state().saves,0,mode)}finally{f.restore()}}
});
test('J04 possible source save after lost ACK never receives a no-invocation receipt; forged receipts cannot reset dispatch',async()=>{
 const f=await fixture('lost');try{const out=await createStageEditorBridge(f.options)({personaUid,cookieStoreId,routeId},f.request);assert.equal(out.ok,false);assert.equal(f.state().saves,1);assert.equal(stageWasNotInvoked(out,f.record),false);assert.equal(stageWasNotInvoked({ok:false,code:'EDITOR_NOT_READY'},f.record),false)}finally{f.restore()}
});
