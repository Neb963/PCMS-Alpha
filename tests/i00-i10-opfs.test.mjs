import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceAiOpfsProbe} from '../src/runtime/perchance-ai-opfs.mjs';
const slug='private-opfs',nonce='f'.repeat(32),sid='session-opaque-12345678';
function fixture({origin='https://perchance.org',owner=true,editor=true,session=sid,
   storage='present',workspace='present',human=false,collab=false,collabMode=null,
   workerLock=false,oldLock=false}={}){
  const before={location:globalThis.location,window:globalThis.window,
    document:globalThis.document,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
  let gets=0,creates=0,files=0;
  const seen=[];
  const opfs=(parts=[])=>({
    kind:'directory',getDirectoryHandle:async(name,options)=>{
      gets++;if(options?.create){creates++;throw Error('CREATE_CALLED');}
      seen.push([...parts,name].join('/'));
      if(storage==='absent')throw Object.assign(Error('not found'),{name:'NotFoundError'});
      if(storage==='denied')throw Object.assign(Error('permission'),{name:'SecurityError'});
      if(workspace==='absent'&&parts.length===0&&name==='agent')
        throw Object.assign(Error('no worker namespace'),{name:'NotFoundError'});
      if(workspace==='denied'&&parts.join('/')==='agent/'+sid&&name==='workspace')
        throw Object.assign(Error('permission'),{name:'SecurityError'});
      const key=parts.join('/');
      const allowed={
        '':['attachments','agent'],
        'attachments':[sid],
        'agent':[sid],
        ['agent/'+sid]:['workspace']
      };
      if(!allowed[key]?.includes(name))
        throw Error('UNEXPECTED_OPFS_PATH:'+key+'/'+name);
      return opfs([...parts,name]);
    },
    getFileHandle:async()=>{files++;throw Error('FILE_READ_FORBIDDEN');}
  });
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{
    locks:{query:async()=>({held:workerLock?
      [{name:'aiagent-live|'+sid,mode:'shared'}]:oldLock?
      [{name:'aiagent-live|old-session',mode:'shared'}]:[]})},
    storage:storage==='missing'?{}:{getDirectory:async()=>{
      if(storage==='deniedRoot')throw Object.assign(Error('denied'),{name:'SecurityError'});
      return opfs();
    }}
  }});
  globalThis.location={origin,pathname:'/'+slug,hash:'#edit'};
  globalThis.window={
    __editorReady:editor,app:{data:{generator:{name:slug,isPrivate:true}}},
    userOwnsThisGenerator:owner,srcState:{getDraftChatSid:()=>session},
    __aiAgentLiveLockSid:workerLock?sid:oldLock?'old-session':undefined,
    yjsProvider:collabMode?{wsconnected:collabMode!=='offline',
      synced:collabMode!=='unsynced',roomname:'room'}:collab?{}:null,
    yDoc:collabMode?{clientID:10}:null,
    yjsAwareness:collabMode?{getStates:()=>new Map(
      collabMode==='peer'?[[10,{}],[20,{}]]:[[10,{}]])}:undefined,
    yjsProviderRoomName:collabMode?'room':null,
    editorCollabInitialSyncIsPending:false,
    saveCheckpointManager:{isDivergenceBlocked:()=>false}};
  globalThis.document={getElementById:()=>({dataset:{pcmsHumanIntent:human?'true':'false'}})};
  return {counts:()=>({gets,creates,files}),paths:()=>[...seen],restore:()=>{
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
    assert.equal(r.workspaceRootState,'PRESENT_UNTRUSTED');
    assert.deepEqual(f.paths(),[
      'attachments','attachments/'+sid,
      'agent','agent/'+sid,'agent/'+sid+'/workspace'
    ]);
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

test('P52-06 X absent or inaccessible session-local workspace cannot be promoted to isolation proof',async()=>{
  for(const [workspace,code,rootState] of [
    ['absent','OPFS_LOCAL_OBSERVED_ONLY','ABSENT'],
    ['denied','WORKSPACE_OPFS_INSPECTION_FAILED',undefined]]){
    await check({workspace},async f=>{
      const r=await perchanceAiOpfsProbe({slug,nonce});
      assert.equal(r.code,code);
      assert.equal(r.isolation,'UNVERIFIED');
      assert.equal(r.workerNamespace,rootState?'UNVERIFIED':undefined);
      if(rootState)assert.equal(r.workspaceRootState,rootState);
      assert.deepEqual({creates:f.counts().creates,files:f.counts().files},
        {creates:0,files:0});
      assert.equal(JSON.stringify(r).includes(sid),false);
    });
  }
});

test('I10 F/X OPFS read-only observation accepts synced solo owner and denies peers',async()=>{
  await check({collabMode:'solo'},async f=>{
    const r=await perchanceAiOpfsProbe({slug,nonce});
    assert.equal(r.ok,true);
    assert.equal(r.isolation,'UNVERIFIED');
    assert.deepEqual({creates:f.counts().creates,files:f.counts().files},{creates:0,files:0});
  });
  for(const collabMode of ['peer','offline','unsynced']){
    await check({collabMode},async f=>{
      const r=await perchanceAiOpfsProbe({slug,nonce});
      assert.equal(r.ok,false,collabMode);
      assert.equal(f.counts().gets,0,collabMode);
    });
  }
});

test('P52-06 F/X worker attestation requires exact S2 lock acquired after native init',async()=>{
  await check({workerLock:true},async f=>{
    const r=await perchanceAiOpfsProbe({slug,nonce});
    assert.equal(r.ok,true);
    assert.equal(r.workerNamespace,'CURRENT_SESSION_WORKER_INIT_LOCK');
    assert.equal(r.isolation,'UNVERIFIED');
    assert.equal(JSON.stringify(r).includes(sid),false);
    assert.equal(f.counts().files,0);
    assert.equal(f.counts().creates,0);
  });
  for(const options of [{oldLock:true},{workerLock:false},
    {workerLock:true,workspace:'absent'}]){
    await check(options,async f=>{
      const r=await perchanceAiOpfsProbe({slug,nonce});
      assert.equal(r.ok,true);
      // A valid init lock without a workspace directory is still
      // independently insufficient; canonical fresh-chat CAS needs BOTH.
      assert.equal(r.workerNamespace,
        options.workerLock?'CURRENT_SESSION_WORKER_INIT_LOCK':
          options.oldLock?'STALE_PREVIOUS_SESSION_LOCK':'UNVERIFIED');
      if(options.workspace==='absent')assert.equal(r.workspaceRootState,'ABSENT');
      assert.equal(f.counts().creates,0);
    });
  }
});

test('P52-06 X native New Chat does not rotate the old Web Lock: its stale S1 marker is diagnostic only',async()=>{
  await check({oldLock:true},async f=>{
    const value=await perchanceAiOpfsProbe({slug,nonce});
    assert.equal(value.ok,true);
    assert.equal(value.workspaceRootState,'PRESENT_UNTRUSTED');
    assert.equal(value.workerNamespace,'STALE_PREVIOUS_SESSION_LOCK');
    assert.equal(value.isolation,'UNVERIFIED');
    assert.equal(value.serverEndAck,'UNOBSERVED');
    assert.equal(JSON.stringify(value).includes('old-session'),false);
    assert.deepEqual({creates:f.counts().creates,files:f.counts().files},
      {creates:0,files:0});
  });
});
