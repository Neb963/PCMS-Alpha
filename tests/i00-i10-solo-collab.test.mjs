import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceEditorProbe} from '../src/runtime/perchance-editor-probe.mjs';
const slug='owned-solo';
function withEditor(mode){
 const old={location:globalThis.location,window:globalThis.window,document:globalThis.document};
 globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
 globalThis.document={getElementById:()=>null};
 const provider=mode==='local'?null:{wsconnected:mode!=='offline',
   synced:mode!=='unsynced',roomname:'owned-room'};
 globalThis.window={
   __editorReady:true,userOwnsThisGenerator:true,__saveInFlight:false,
   app:{data:{generator:{name:slug,isPrivate:true}}},
   modelTextEditor:{isClean:()=>true},
   outputTemplateEditor:{isClean:()=>true},
   srcState:{isDirty:async()=>false,conflictPaths:()=>[]},
   menuBar:{saveState:'saved'},
   editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,
   yjsProvider:provider,yDoc:provider?{clientID:13}:null,
   yjsAwareness:provider?{getStates:()=>new Map(
     mode==='peer'?[[13,{}],[14,{}]]:[[13,{}]])}:null,
   yjsProviderRoomName:provider?'owned-room':null,
   saveCheckpointManager:{isDivergenceBlocked:()=>false}
 };
 return ()=>{globalThis.location=old.location;globalThis.window=old.window;globalThis.document=old.document;};
}
test('I10 F native saved editor recognizes synchronized owner-only Perchance room',async()=>{
 for(const mode of ['local','solo']){
  const restore=withEditor(mode);
  try{const p=await perchanceEditorProbe(slug);assert.equal(p.ok,true,p.code);}
  finally{restore();}
 }
});
test('I10 X native editor holds for remote peer, unsynced room, disconnect or divergence',async()=>{
 for(const mode of ['peer','offline','unsynced']){
  const restore=withEditor(mode);
  try{const p=await perchanceEditorProbe(slug);assert.equal(p.code,'COLLABORATION_UNVERIFIED',mode);}
  finally{restore();}
 }
 const restore=withEditor('solo');
 try{
  globalThis.window.editorCollabInitialSyncIsPending=true;
  assert.equal((await perchanceEditorProbe(slug)).code,'COLLABORATION_UNVERIFIED');
  globalThis.window.editorCollabInitialSyncIsPending=false;
  globalThis.window.saveCheckpointManager.isDivergenceBlocked=()=>true;
  assert.equal((await perchanceEditorProbe(slug)).code,'COLLABORATION_UNVERIFIED');
 }finally{restore();}
});
