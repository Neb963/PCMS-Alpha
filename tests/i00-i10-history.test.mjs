import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceAiHistoryProbe} from '../src/runtime/perchance-ai-history.mjs';
const slug='private-owned',nonce='d'.repeat(32),sid='opaque-server-session-12345678';
const prompt='Pinned TESTING.md first message';
function fixture({entries=[{k:'user',t:prompt},{k:'md',t:'assistant'}],
  owner=true,collab='solo',wrongSid=false,rebind=false,badServer=false}={}){
  const before={location:globalThis.location,window:globalThis.window,
    document:globalThis.document,fetch:globalThis.fetch};
  const seen=[];let token='1234.X_routing';
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:()=>({dataset:{pcmsHumanIntent:'false'}})};
  globalThis.window={
    __editorReady:true,userOwnsThisGenerator:owner,
    app:{data:{generator:{name:slug,isPrivate:true}}},
    editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,
    srcState:{getDraftChatSid:()=>sid,
      getDraftChatRoutingKey:()=>token},
    yDoc:collab!=='local'?{clientID:3}:null,
    yjsAwareness:collab!=='local'?{getStates:()=>new Map(
      collab==='peer'?[[3,{}],[4,{}]]:[[3,{}]])}:null,
    yjsProvider:collab!=='local'?{wsconnected:true,synced:true,roomname:'room'}:null,
    yjsProviderRoomName:collab!=='local'?'room':null
  };
  globalThis.fetch=async(url,opts)=>{
    seen.push({method:opts.method,body:JSON.parse(opts.body),
      endpoint:new URL(url).pathname,credentials:opts.credentials});
    if(wrongSid)token='1234.another';
    if(rebind)globalThis.window.__collabGeneration=
      (globalThis.window.__collabGeneration||0)+1;
    return {ok:!badServer,headers:{get:()=>null},
      text:async()=>JSON.stringify({ok:true,entries})};
  };
  return {calls:()=>seen,restore:()=>{globalThis.location=before.location;
    globalThis.window=before.window;globalThis.document=before.document;
    globalThis.fetch=before.fetch;}};
}
const run=()=>perchanceAiHistoryProbe({slug,nonce,firstPrompt:prompt});
test('P52-06 F distinct current server-history start can be observed without returning secrets',async()=>{
  const f=fixture();
  try{
    const r=await run();
    assert.equal(r.ok,true);
    assert.equal(r.serverHistory,'FIRST_USER_IS_T1');
    assert.match(r.sessionDigest,/^[a-f0-9]{64}$/);
    assert.equal(r.entriesObserved,2);
    assert.equal(f.calls().length,1);
    assert.equal(f.calls()[0].endpoint,'/api/aiAgent/history');
    assert.equal(f.calls()[0].method,'POST');
    assert.equal(JSON.stringify(r).includes(sid),false);
    assert.equal(JSON.stringify(r).includes('routing'),false);
    assert.equal(r.testStatus,undefined);
  }finally{f.restore();}
});
test('P52-06 X inherited conversation, changed SID, changed routing and untrusted owner hold',async()=>{
 const cases=[
  [{entries:[{k:'user',t:'Chat1 secret'},{k:'user',t:prompt}]},'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'],
  [{entries:[{k:'md',t:'old assistant'},{k:'user',t:prompt}]},'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'],
  [{entries:[{k:'user',t:'wrong message'}]},'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'],
  [{wrongSid:true},'AI_HISTORY_SESSION_CHANGED'],
  [{rebind:true},'AI_HISTORY_SESSION_CHANGED'],
  [{owner:false},'AI_HISTORY_EDITOR_UNVERIFIED'],
  [{collab:'peer'},'AI_HISTORY_COLLABORATION_UNVERIFIED'],
  [{badServer:true},'AI_HISTORY_SERVER_UNAVAILABLE'],
  [{entries:[]},'AI_HISTORY_RESPONSE_UNVERIFIED']
 ];
 for(const [options,expected] of cases){
  const f=fixture(options);
  try{const r=await run();assert.equal(r.code,expected,JSON.stringify(options));
    assert.equal(r.serverHistory,'UNVERIFIED');assert.equal(r.ok,false);
    if(options.owner===false||options.collab==='peer')
      assert.equal(f.calls().length,0);
  }finally{f.restore();}
 }
});
