import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceAiOpfsProbe} from '../src/runtime/perchance-ai-opfs.mjs';
const slug='private-opfs',nonce='f'.repeat(32),sid='session-opaque-12345678';
function fixture({origin='https://perchance.org',owner=true,editor=true,session=sid,
   storage='present',human=false,collab=false}={}){
  const before={location:globalThis.location,window:globalThis.window,
    document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
  let gets=0,creates=0,files=0;
  const opfs=()=>({
    kind:'directory',getDirectoryHandle:async(name,options)=>{
      gets++;if(options?.create){creates++;throw Error('CREATE_CALLED');}
      if(storage==='absent')throw Object.assign(Error('not found'),{name:'NotFoundError'});
      if(storage==='denied')throw Object.assign(Error('permission'),{name:'SecurityError'});
      return name==='attachments'?opfs():name===sid?opfs():
        (()=>{throw Error('unexpected path')})();
    },
    getFileHandle:async()=>{files++;throw Error('FILE_READ_FORBIDDEN');}
  });
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    storage:storage==='missing'?{}:{getDirectory:async()=>{
      if(storage==='deniedRoot')throw Object.assign(Error('denied'),{name:'SecurityError'});
      return opfs();
    }}
  }});
  globalThis.location={origin,pathname:'/'+slug,hash:'#edit'};
  globalThis.window={
    __editorReady:editor,app:{data:{generator:{name:slug,isPrivate:true}}},
    userOwnsThisGenerator:owner,srcState:{getDraftChatSid:()=>session},
    yjsProvider:collab?{}:null,yDoc:null,
    editorCollabInitialSyncIsPending:false,
    saveCheckpointManager:{isDivergenceBlocked:()=>false}};
  globalThis.document={getElementById:()=>({dataset:{pcmsHumanIntent:human?'true':'false'}})};
  return {counts:()=>({gets,creates,files}),restore:()=>{
    globalThis.location=before.location;globalThis.window=before.window;
    globalThis.document=before.document;
    if(before.navigator)Object.defineProperty(globalThis,'navigator',before.navigator);
    else delete globalThis.navigator;
  }};
}
async function check(options,fn){
  const f=fixture(options);
  try{return await fn(f);}finally{f.restore();}
}
test('P52-06 F local OPFS presence never certifies server or worker isolation',async()=>{
  await check({},async f=>{
    const r=await perchanceAiOpfsProbe({slug,nonce});
    assert.equal(r.ok,true);
    assert.equal(r.attachmentState,'PRESENT_UNTRUSTED');
    assert.match(r.sessionDigest,/^[a-f0-9]{64}$/);
    assert.equal(r.isolation,'UNVERIFIED');
    assert.equal(r.serverEndAck,'UNOBSERVED');
    assert.equal(r.workerNamespace,'UNVERIFIED');
    assert.ok(f.counts().gets>=2);
    assert.equal(f.counts().creates,0);assert.equal(f.counts().files,0);
    assert.equal(JSON.stringify(r).includes(sid),false);
  });
});
test('P52-06 X missing OPFS or missing session directory is not isolation proof',async()=>{
  for(const [storage,expected] of [
    ['missing','WORKSPACE_OPFS_UNAVAILABLE'],
    ['deniedRoot','WORKSPACE_OPFS_INSPECTION_FAILED'],
    ['denied','WORKSPACE_OPFS_INSPECTION_FAILED'],
    ['absent','OPFS_LOCAL_OBSERVED_ONLY']]){
    await check({storage},async f=>{
      const r=await perchanceAiOpfsProbe({slug,nonce});
      assert.equal(r.code,expected,storage);
      assert.equal(r.isolation,'UNVERIFIED');
      if(storage==='absent')assert.equal(r.attachmentState,'ABSENT');
      assert.equal(f.counts().creates,0);assert.equal(f.counts().files,0);
    });
  }
});
test('P52-06 X wrong tab/origin, owner, collab, human or missing SID cannot inspect storage',async()=>{
  for(const options of [
    {origin:'https://example.net'},{owner:false},{editor:false},
    {session:null},{human:true},{collab:true}
  ]){
    await check(options,async f=>{
      const r=await perchanceAiOpfsProbe({slug,nonce});
      assert.equal(r.ok,false,JSON.stringify(options));
      assert.equal(r.isolation,'UNVERIFIED');
      assert.deepEqual(f.counts(),{gets:0,creates:0,files:0});
    });
  }
});
test('P52-06 X request with wrong nonce/slug fails before accessing origin storage',async()=>{
  await check({},async f=>{
    assert.equal((await perchanceAiOpfsProbe({slug,nonce:'invalid'})).code,
      'WORKSPACE_REQUEST_INVALID');
    assert.equal((await perchanceAiOpfsProbe({slug:'wrong-slug',nonce})).code,
      'WORKSPACE_EDITOR_CHANGED');
    assert.equal(f.counts().gets,0);
  });
});
