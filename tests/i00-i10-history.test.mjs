import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceAiHistoryCredentials,perchanceAiHistoryIsolated}
  from '../src/runtime/perchance-ai-history.mjs';

const slug='private-owned',nonce='d'.repeat(32),
  sid='opaque-server-session-12345678',key='1234.X_routing',
  prompt='Pinned TESTING.md first message';
function editor({owner=true,collab='solo',changeDuringDigest=false}={}){
  const prior={location:globalThis.location,window:globalThis.window,
    document:globalThis.document,fetch:globalThis.fetch};
  let currentSid=sid,route=key,fetches=0;
  globalThis.location={origin:'https://perchance.org',
    pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:()=>({dataset:{pcmsHumanIntent:'false'}})};
  globalThis.window={
    __editorReady:true,userOwnsThisGenerator:owner,
    app:{data:{generator:{name:slug,isPrivate:true}}},
    editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,
    __collabGeneration:1,
    srcState:{getDraftChatSid:()=>currentSid,getDraftChatRoutingKey:()=>route},
    yDoc:collab==='local'?null:{clientID:3},
    yjsAwareness:collab==='local'?null:{getStates:()=>new Map(
      collab==='peer'?[[3,{}],[4,{}]]:[[3,{}]])},
    yjsProvider:collab==='local'?null:
      {wsconnected:true,synced:true,roomname:'room'},
    yjsProviderRoomName:collab==='local'?null:'room'
  };
  globalThis.fetch=async()=>{fetches++;throw Error('PAGE_FETCH_MUST_NEVER_RUN');};
  if(changeDuringDigest){
    const old=globalThis.crypto.subtle.digest;
    // Async race via a microtask; no crypto/global monkeypatch required.
    queueMicrotask(()=>{route='1234.different';});
  }
  return {fetches:()=>fetches,change:()=>{route='1234.different';},
    restore:()=>{globalThis.location=prior.location;
      globalThis.window=prior.window;globalThis.document=prior.document;
      globalThis.fetch=prior.fetch;}};
}
async function select(){return perchanceAiHistoryCredentials({slug,nonce});}
function fakeResponse(entries,opts={}){
  const raw=new TextEncoder().encode(JSON.stringify({ok:true,entries}));
  let reads=0;const bytes=opts.huge?new Uint8Array(262145):raw;
  return {ok:!opts.badServer,headers:{get:()=>opts.header||null},body:{
    getReader:()=>({read:async()=>reads++===0?{done:false,value:bytes}:{done:true},
      cancel:async()=>{}})
  }};
}
async function isolated(handle,{entries=[{k:'user',t:prompt},{k:'md',t:'reply'}],
   badServer=false,huge=false,header=null,rotateDigest=false}={}){
  const old=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;
    assert.equal(new URL(url).pathname,'/api/aiAgent/history');
    assert.equal(opts.method,'POST');
    assert.equal(opts.credentials,'omit');
    assert.deepEqual(JSON.parse(opts.body),{sessionId:sid});
    return fakeResponse(entries,{badServer,huge,header});
  };
  try{
    const response=await perchanceAiHistoryIsolated({slug,nonce,
      sessionId:handle.sessionId,routingKey:handle.routingKey,
      sessionDigest:rotateDigest?'f'.repeat(64):handle.sessionDigest,
      firstPrompt:prompt});
    return {response,calls};
  }finally{globalThis.fetch=old;}
}
test('P52-06 F MAIN only selects native SID/key; ISOLATED reads server history and returns no raw secret',async()=>{
  const f=editor();
  try{
    const handle=await select();
    assert.equal(handle.ok,true);
    assert.equal(handle.sessionId,sid);
    assert.equal(handle.routingKey,key);
    assert.equal(f.fetches(),0);
    const {response,calls}=await isolated(handle);
    assert.equal(calls,1);
    assert.equal(response.code,'AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED');
    assert.match(response.sessionDigest,/^[a-f0-9]{64}$/);
    assert.equal(response.serverHistory,'FIRST_USER_IS_T1');
    assert.equal(JSON.stringify(response).includes(sid),false);
    assert.equal(JSON.stringify(response).includes(key),false);
    assert.equal(JSON.stringify(response).includes(prompt),false);
  }finally{f.restore();}
});
test('P52-06 X no network before native owner/collab/session provenance verified',async()=>{
  for(const opts of [{owner:false},{collab:'peer'},{changeDuringDigest:true}]){
    const f=editor(opts);
    try{
      const r=await select();
      assert.equal(r.ok,false,JSON.stringify(opts));
      assert.equal(f.fetches(),0);
    }finally{f.restore();}
  }
});
test('P52-06 X remote old turn, assistant preface, forged prompt, stale digest and excess bytes hold',async()=>{
 const f=editor();
 try{
  const handle=await select();assert.equal(handle.ok,true);
  const cases=[
    [{entries:[{k:'user',t:'Old conversation'},{k:'user',t:prompt}]},
      'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'],
    [{entries:[{k:'md',t:'old assistant'},{k:'user',t:prompt}]},
      'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'],
    [{entries:[{k:'user',t:'wrong'}]},
      'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'],
    [{entries:[]},'AI_HISTORY_RESPONSE_UNVERIFIED'],
    [{badServer:true},'AI_HISTORY_SERVER_UNAVAILABLE'],
    [{huge:true},'AI_HISTORY_TOO_LARGE'],
    [{header:'300000'},'AI_HISTORY_TOO_LARGE'],
    [{rotateDigest:true},'AI_HISTORY_SESSION_CHANGED']
  ];
  for(const [opts,code] of cases){
    const {response,calls}=await isolated(handle,opts);
    assert.equal(response.code,code,JSON.stringify(opts));
    assert.equal(response.serverHistory,'UNVERIFIED');
    assert.equal(calls,opts.rotateDigest?0:1);
  }
 }finally{f.restore();}
});
