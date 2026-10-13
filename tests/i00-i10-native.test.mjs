import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceAiNative} from '../src/runtime/perchance-ai-native.mjs';
const nonce='f'.repeat(32), slug='test-owned-private', sid='fixture-session-id-87654321';
function fixture({owner=true,dirty=false,session=sid,busy=false,human=false,collab=false,localInput=''}={}){
  const prior={location:globalThis.location,window:globalThis.window,
    document:globalThis.document};
  const clicks={send:0,newChat:0,stop:0};
  const button=(which,hidden=false)=>({
    tagName:'BUTTON',hidden,disabled:false,click:()=>clicks[which]++});
  const send=button('send'),newChat=button('newChat'),stop=button('stop',!busy);
  const input={tagName:'TEXTAREA',value:localInput,dispatchEvent(){}};
  const ids={
    aiAgentSendBtn:send,aiAgentStopBtn:stop,
    aiAgentNewChatBtn:newChat,aiAgentInputEl:input,
    aiAgentMsgsEl:{childElementCount:2},
    aiAgentWallEl:{hidden:!busy},
    aiAgentQueueRowEl:{hidden:true,style:{display:'none'}},
    aiAgentPanelEl:{},
    'pcms-alpha-editor-context':{dataset:{pcmsHumanIntent:human?'true':'false'}}
  };
  globalThis.document={getElementById:k=>ids[k]||null};
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.window={
    app:{data:{generator:{name:slug,isPrivate:true}}},
    srcState:{getDraftChatSid:()=>session,isDirty:async()=>dirty},
    modelTextEditor:{isClean:()=>!dirty},
    outputTemplateEditor:{isClean:()=>!dirty},
    menuBar:{saveState:dirty?'unsaved':'saved'},
    __editorReady:true,__saveInFlight:false,userOwnsThisGenerator:owner,
    editorCollabInitialSyncIsPending:false,
    yjsProvider:collab?{}:null,yDoc:null,
    saveCheckpointManager:{isDivergenceBlocked:()=>false}
  };
  return {clicks,ids,restore:()=>{
    globalThis.location=prior.location;globalThis.window=prior.window;
    globalThis.document=prior.document;
  }};
}
async function within(options,act){
  const f=fixture(options);
  try{return await act(f);}finally{f.restore();}
}
test('P52-05 F: fixed native Send is attempt-only and needs an empty clean owned editor',async()=>{
  await within({session:null},async f=>{
    const r=await perchanceAiNative({slug,nonce,action:'SEND',
      chat:1,text:'Test the saved generator, debug and retest.'});
    assert.equal(r.code,'SEND_ATTEMPTED_UNVERIFIED');
    assert.equal(f.clicks.send,1);
    assert.equal(f.ids.aiAgentInputEl.value,'Test the saved generator, debug and retest.');
    assert.equal(r.sessionDigest,undefined);
    const observed=await perchanceAiNative({slug,nonce,action:'OBSERVE'});
    assert.equal(observed.ok,true);
    assert.equal(observed.sessionDigest,null);
    assert.equal(observed.sourceSaved,true);
  });
});
test('P52-05 X synthetic: owner, collaboration, dirty, busy, human and conflicting input never dispatch',async()=>{
  for(const cfg of [{owner:false},{collab:true},{dirty:true},{busy:true},
    {human:true},{localInput:'human unsent prompt'}]){
    await within(cfg,async f=>{
      const r=await perchanceAiNative({slug,nonce,action:'SEND',chat:1,text:'test'});
      assert.equal(r.ok,false,JSON.stringify(cfg));
      assert.equal(f.clicks.send,0,JSON.stringify(cfg));
    });
  }
});
test('P52-05 F: unknown origin and invalid tab target do not trigger helper clicks',async()=>{
  await within({},async f=>{
    globalThis.location.pathname='/different';
    const r=await perchanceAiNative({slug,nonce,action:'SEND',chat:1,text:'test'});
    assert.equal(r.code,'EDITOR_TARGET_CHANGED');
    assert.equal(f.clicks.send,0);
    globalThis.location.pathname='/'+slug;
    assert.equal((await perchanceAiNative({slug,nonce:'bad',action:'SEND',text:'test'})).code,
      'INVALID_AI_REQUEST');
    assert.equal(f.clicks.send,0);
  });
});
test('P52-06 F: fresh Chat 2 requires prior session absence and native reset request is unverified',async()=>{
  await within({},async f=>{
    const previous=await perchanceAiNative({slug,nonce,action:'OBSERVE'});
    assert.match(previous.sessionDigest,/^[a-f0-9]{64}$/);
    const blocked=await perchanceAiNative({slug,nonce,action:'SEND',
      chat:2,text:'Pinned TESTING'});
    assert.equal(blocked.code,'FRESH_CHAT_NOT_PROVEN');
    assert.equal(f.clicks.send,0);
    const reset=await perchanceAiNative({slug,nonce,action:'NEW_CHAT'});
    assert.equal(reset.code,'NEW_CHAT_REQUESTED_UNVERIFIED');
    assert.equal(reset.priorSessionDigest,previous.sessionDigest);
    assert.equal(f.clicks.newChat,1);
    assert.equal(f.clicks.send,0);
  });
  await within({session:null},async f=>{
    const x=await perchanceAiNative({slug,nonce,action:'NEW_CHAT'});
    assert.equal(x.code,'NEW_CHAT_PRECONDITION_UNVERIFIED');
    assert.equal(f.clicks.newChat,0);
  });
});
test('P52-05 F: busy Stop is explicitly only an attempt, no source or PASS receipt',async()=>{
  await within({busy:true},async f=>{
    const x=await perchanceAiNative({slug,nonce,action:'STOP'});
    assert.equal(x.code,'STOP_REQUESTED_UNVERIFIED');
    assert.equal(f.clicks.stop,1);
    const notSent=await perchanceAiNative({slug,nonce,action:'SEND',chat:1,text:'retry'});
    assert.equal(notSent.ok,false);assert.equal(f.clicks.send,0);
  });
});
