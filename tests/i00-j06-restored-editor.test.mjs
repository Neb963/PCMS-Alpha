import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createManualEditorBridge} from '../src/runtime/manual-editor-bridge.mjs';
const slug='restored-editor',nonce='a'.repeat(32),personaUid='persona_fixture',cookieStoreId='firefox-container-1',routeId='protected';
async function fixture({dirty=false,native=false,human=false}={}){
 const db=fakeDatabase(),tabs=new Map(),tags=new Map(),effects=[];
 const source={slug,revision:5,state:'SOURCE_VERIFIED',restoredHistorical:false,restoredParent:{revision:4},parentStageRevision:4,remotePublicId:'public_fixture',accountId:'account_fixture',accountRevision:2,personaUid,bindingVersion:2,principalFingerprint:'b'.repeat(64),nonce,readyIdentifier:'rev-restored',readyInputFingerprint:'c'.repeat(64)};
 await new Promise(r=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');t.oncomplete=r;
 m.put({key:'stage:'+slug,record:source});m.put({key:'account:account_fixture',account:{state:'VERIFIED',revision:2,personaUid,bindingVersion:2,identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:2,principalFingerprint:'b'.repeat(64)}}});m.put({key:'inventory:'+slug,generator:{accountId:'account_fixture',remoteId:'public_fixture',ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',personaUid,bindingVersion:2}});m.put({key:'s05-ready:'+slug,record:{active:{identifier:'rev-restored',inputFingerprint:'c'.repeat(64)}}});});
 const prior={window:globalThis.window,document:globalThis.document,location:globalThis.location};
 globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};globalThis.document={getElementById:()=>null};
 globalThis.window={__editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,app:{data:{generator:{name:slug,isPrivate:true}}},srcState:{getDraftChatSid:()=>native?'live-native-session':null,isDirty:async()=>dirty,conflictPaths:()=>[]},modelTextEditor:{isClean:()=>!dirty},outputTemplateEditor:{isClean:()=>!dirty},menuBar:{saveState:dirty?'unsaved':'saved'},editorCollabInitialSyncIsPending:false,yjsProvider:null,saveCheckpointManager:{isDivergenceBlocked:()=>false}};
 if(human)tabs.set(1,{id:1,url:'https://perchance.org/'+slug+'#edit',cookieStoreId});
 const api={storage:{local:{get:async()=>({})}},tabs:{query:async()=>[...tabs.values()],get:async id=>tabs.get(id),create:async input=>{effects.push('TAB_CREATE');const t={...input,id:2};tabs.set(2,t);return t}},sessions:{getTabValue:async(id,key)=>tags.get(id+':'+key),setTabValue:async(id,key,value)=>tags.set(id+':'+key,value)},scripting:{executeScript:async({func,args})=>{effects.push(func.name);return [{frameId:0,result:func.name==='renderPcmsEditorStrip'?undefined:await func(...args)}]}}};
 return {effects,tags,run:()=>createManualEditorBridge({browser:api,getState:async()=>({profiles:{[cookieStoreId]:{personaUid,routeId}},routes:{[routeId]:{enabled:true}}}),open:async()=>db})({personaUid,cookieStoreId,routeId},{slug,nonce,prepare:'restored'}),cleanup:()=>Object.assign(globalThis,prior)};
}
test('a restored child establishes only its own clean no-native editor; dirty/native/human editors never become owned',async()=>{
 for(const options of [{},{dirty:true},{native:true},{human:true}]){
  const f=await fixture(options);try{
   const out=await f.run();assert.equal(out.ok,Object.keys(options).length===0,JSON.stringify(out));
   if(out.ok){assert.equal(f.tags.get('2:pcmsI09Owned').nonce,nonce);assert.equal(f.tags.get('2:pcmsI09Owned').humanIntent,false)}else assert.equal(f.tags.has('2:pcmsI09Owned'),false);
   assert.equal(f.effects.some(x=>/Send|Save|StageMain|AiNative/.test(x)),false);
   if(options.human)assert.equal(f.effects.includes('TAB_CREATE'),false);
  }finally{f.cleanup()}
 }
});
