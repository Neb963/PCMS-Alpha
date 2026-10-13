import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceStageMain} from '../src/runtime/perchance-stage.mjs';
const b=s=>Buffer.from(s).toString('base64');
const slug='stage-one';
function fixture({dirty=false,collab=false,collabMode=null,humanTab=false,handoffDuringWrite=false,
  rebindDuringReady=false,noSrc=false}={}){
  const effect=[],saved=[],files=new Map();
  let humanIntent=false,pjs='',html='',srcDirty=false;
  const menu={saveState:'saved',setSaveState(v){this.saveState=v;}};
  const model={getValue:()=>pjs,setValue(value){pjs=value;menu.saveState='unsaved';},
    isClean:()=>!dirty&&menu.saveState==='saved'};
  const htmlEditor={getValue:()=>html,setValue(value){html=value;menu.saveState='unsaved';},
    isClean:()=>!dirty&&menu.saveState==='saved'};
  const source={ready:async()=>{if(rebindDuringReady&&window.yjsProvider)
    window.__collabGeneration=(window.__collabGeneration||0)+1;},
    list:()=>new Map(files),isDirty:async()=>srcDirty,
    hasPending:()=>false,fileCount:()=>files.size,conflictPaths:()=>[],
    async writeFile(path,bytes){
      effect.push('src:'+path);files.set(path,bytes);srcDirty=true;
      if(handoffDuringWrite)humanIntent=true;
    }};
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:()=>humanIntent?{dataset:{pcmsHumanIntent:'true'}}:null};
  globalThis.localStorage={getItem(name){
    return name==='perchanceTabsOpen'?JSON.stringify({[slug]:
      humanTab?{'owned':{},'human':{}}:{'owned':{}}}):null;
  }};
  globalThis.window={__editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,
    editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,
    yjsProvider:collabMode?{wsconnected:collabMode!=='offline',
      synced:collabMode!=='unsynced',roomname:'private-room'}:collab?{}:null,
    yDoc:collabMode?{clientID:111}:null,
    yjsAwareness:collabMode?{getStates:()=>new Map(
      collabMode==='peer'?[[111,{}],[222,{}]]:[[111,{}]])}:undefined,
    yjsProviderRoomName:collabMode?'private-room':null,
    saveCheckpointManager:{
      isDivergenceBlocked:()=>false},
    aiAgentWorkspaceSnapshot:async()=>({unavailable:false,preferWorkspace:null}),
    modelTextEditor:model,outputTemplateEditor:htmlEditor,srcState:source,menuBar:menu,
    app:{data:{generator:{name:slug,isPrivate:true,srcManifest:{}}},
      async saveGenerator(){effect.push('REMOTE_SAVE');saved.push({pjs,html,files:[...files]});
        menu.saveState='saved';srcDirty=false;return true;}}
  };
  const candidate=[{path:'main.pjs',base64:b('let x = 3;')},
    {path:'index.html',base64:b('<div>private</div>')}];
  if(!noSrc)candidate.push({path:'src/file.bin',base64:Buffer.from([0,255,128]).toString('base64')});
  return {run:()=>perchanceStageMain({slug,files:candidate}),effect,saved,candidate};
}
test('P52-07 native Perchance adapter: valid private empty source applies both editors and binary then saves once',async()=>{
  const f=fixture();
  const response=await f.run();
  assert.equal(response.code,'SAVE_ACK_ONLY');
  assert.deepEqual(f.effect,['src:file.bin','REMOTE_SAVE']);
  assert.equal(f.saved[0].pjs,'let x = 3;');
  assert.equal(f.saved[0].files[0][0],'file.bin');
  assert.deepEqual([...f.saved[0].files[0][1]],[0,255,128]);
});
test('P52-04 native adapter: PJS/HTML-only staging does not require src dirty state',async()=>{
  const f=fixture({noSrc:true});
  assert.equal((await f.run()).code,'SAVE_ACK_ONLY');
  assert.deepEqual(f.effect,['REMOTE_SAVE']);
});
test('P51-05/P52-07 native editor: dirty, collaboration and human multi-tab fail before source/remote mutation',async()=>{
  for(const variant of [{dirty:true},{collab:true},{humanTab:true}]){
    const f=fixture(variant),response=await f.run();
    assert.equal(response.ok,false,JSON.stringify(variant));
    assert.deepEqual(f.effect,[],JSON.stringify(variant));
  }
});
test('P51-05 native: human takes ownership during local asset edit; no remote save proceeds',async()=>{
  const f=fixture({handoffDuringWrite:true});
  assert.equal((await f.run()).code,'HUMAN_HANDOFF_REQUESTED');
  assert.equal(f.effect.includes('REMOTE_SAVE'),false);
});
test('P52-04 native: malformed source bytes cannot mutate even first code editor',async()=>{
  const f=fixture();
  f.candidate[2].base64='bad??base64';
  const response=await f.run();
  assert.equal(response.code,'SOURCE_PAYLOAD_UNVERIFIED');
  assert.deepEqual(f.effect,[]);
});
test('P52-07 native: revoked or unknown page API blocks before any write',async()=>{
  const f=fixture();
  globalThis.window.__editorReady=false;
  assert.equal((await f.run()).code,'NATIVE_EDITOR_CONTRACT_UNVERIFIED');
  assert.deepEqual(f.effect,[]);
});

test('I10 F/X compatible I09 staging: synced solo owner room is allowed; actual/uncertain collab peers are denied',async()=>{
  const own=fixture({collabMode:'solo'});
  assert.equal((await own.run()).code,'SAVE_ACK_ONLY');
  assert.equal(own.effect.includes('REMOTE_SAVE'),true);
  for(const collabMode of ['peer','offline','unsynced']){
    const f=fixture({collabMode}),r=await f.run();
    assert.equal(r.code,'COLLABORATION_UNVERIFIED',collabMode);
    assert.deepEqual(f.effect,[],collabMode);
  }
});

test('I10 X collaboration room generation changes while staging awaits; no local or remote mutation',async()=>{
  const f=fixture({collabMode:'solo',rebindDuringReady:true});
  const result=await f.run();
  assert.equal(result.code,'EDITOR_CHANGED');
  assert.deepEqual(f.effect,[]);
});
