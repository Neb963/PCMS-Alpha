import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceExistingMain,perchanceRefresherCleanMain} from '../src/runtime/perchance-existing.mjs';
const slug='owned-generator',markerId='marker_abcdefghijklmnop';
const b64=s=>btoa(s);
function fixture({publicListing=true,human=false,dirty=false}={}){
  const previousFiles=[{path:'main.pjs',base64:b64('source')},
    {path:'index.html',base64:b64('<div>Hello</div>')},
    {path:'src/style.css',base64:b64('div {color: blue;}')}];
  const targetFiles=previousFiles.map(f=>f.path==='index.html'?
    {path:f.path,base64:b64('<div>Hello</div>\n<!-- pcms-alpha-refresher:'+markerId+' -->')}:f);
  let source='source',html='<div>Hello</div>',saveCount=0;
  const writes=[];
  const model={getValue:()=>source,setValue:s=>{writes.push('main.pjs');source=s;},
    isClean:()=>!dirty};
  const output={getValue:()=>html,setValue:s=>{writes.push('index.html');html=s;},
    isClean:()=>!dirty};
  const assets=new Map([['style.css',new TextEncoder().encode('div {color: blue;}')]]);
  const globalFields={
    __editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,
    editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,
    collabEditKeyIsIncorrect:false,
    saveCheckpointManager:{isDivergenceBlocked:()=>false},
    app:{data:{generator:{name:slug,isPrivate:!publicListing}},
      saveGenerator:async()=>{saveCount++;return true;}},
    modelTextEditor:model,outputTemplateEditor:output,
    menuBar:{saveState:'saved'},
    srcState:{list:()=>[...assets.keys()],readFile:async key=>assets.get(key),
      writeFile:async(key,v)=>{writes.push('src/'+key);assets.set(key,v);},
      deleteFile:async key=>{writes.push('delete src/'+key);assets.delete(key);},
      isDirty:async()=>dirty,hasPending:()=>false,conflictPaths:()=>[]}
  };
  globalThis.window=globalFields;
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:()=>human?{dataset:{pcmsHumanIntent:'true'}}:null};
  const request={action:'REFRESH',slug,nonce:'a'.repeat(32),markerId,
    previousFiles,targetFiles};
  return {request,previousFiles,targetFiles,writes:()=>writes,
    saveCount:()=>saveCount,html:()=>html,
    privacy:()=>globalFields.app.data.generator.isPrivate};
}
test('S07 MAIN page D: PUBLIC marker save changes only intended source with no listing flip',async()=>{
  const f=fixture();
  const reply=await perchanceExistingMain(f.request);
  assert.deepEqual(reply,{ok:true,code:'REFRESH_ACK_ONLY'});
  assert.equal(f.saveCount(),1);
  assert.deepEqual(f.writes(),['index.html']);
  assert.equal(f.privacy(),false);
  assert.equal(f.html(),'<div>Hello</div>\n<!-- pcms-alpha-refresher:'+markerId+' -->');
});
test('S07 MAIN page X: private, human dirty and malformed source are refused before save',async()=>{
  const variants=[
    {config:{publicListing:false}},
    {config:{human:true}},
    {config:{dirty:true}},
    {mutate:r=>r.markerId='invalid'},
    {mutate:r=>r.targetFiles[0].base64=b64('changed PJS')},
    {mutate:r=>r.targetFiles[1].base64=b64('<div>Hello</div><!-- script not owned -->')},
    {mutate:r=>r.targetFiles.splice(2,1)},
    {mutate:r=>r.targetFiles.push({path:'src/more.txt',base64:b64('new')})}
  ];
  for(const {config={},mutate} of variants){
    const f=fixture(config);
    mutate?.(f.request);
    const reply=await perchanceExistingMain(f.request);
    assert.equal(reply.ok,false,JSON.stringify({config,reply}));
    assert.equal(f.saveCount(),0,JSON.stringify({config,reply}));
  }
});

test('S07 native public editor cleanup probe refuses uncertain ownership, dirty source and collaborators',async()=>{
  const clean=fixture();
  assert.deepEqual(await perchanceRefresherCleanMain(slug),
    {ok:true,source:'CLEAN_S07_EDITOR'});
  fixture({publicListing:false});
  assert.equal((await perchanceRefresherCleanMain(slug)).ok,false);
  fixture({human:true});
  assert.equal((await perchanceRefresherCleanMain(slug)).ok,false);
  fixture({dirty:true});
  assert.equal((await perchanceRefresherCleanMain(slug)).ok,false);
  fixture();
  globalThis.window.yjsProviderRoomName='room_unknown';
  assert.equal((await perchanceRefresherCleanMain(slug)).ok,false);
  fixture();
  globalThis.window.yjsProvider={wsconnected:true,synced:true,roomname:'room'};
  globalThis.window.yDoc={clientID:123};
  globalThis.window.yjsProviderRoomName='room';
  globalThis.window.yjsAwareness={getStates:()=>new Map([[123,{}],[456,{}]])};
  assert.equal((await perchanceRefresherCleanMain(slug)).ok,false);
});
