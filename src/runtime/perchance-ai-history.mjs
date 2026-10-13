// I10 read-only observation of a native AI session's server history.
// Called only on the donor-guarded owner tab. The routing capability and
// history body are used in this page alone; only bounded booleans and a
// salted session identity may be returned to the extension.
export async function perchanceAiHistoryProbe(request){
  const hold=code=>({ok:false,code,serverHistory:'UNVERIFIED'});
  if(typeof request?.slug!=='string'||
     !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
     typeof request?.nonce!=='string'||!/^[a-f0-9]{32}$/.test(request.nonce)||
     typeof request?.firstPrompt!=='string'||
     request.firstPrompt.length<1||request.firstPrompt.length>16000)
    return hold('AI_HISTORY_REQUEST_INVALID');
  if(location.origin!=='https://perchance.org'||
     location.pathname!=='/'+request.slug||location.hash!=='#edit')
    return hold('AI_HISTORY_WRONG_EDITOR');
  try{
    const src=window.srcState;
    if(window.__editorReady!==true||
       window.app?.data?.generator?.name!==request.slug||
       window.app?.data?.generator?.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       window.editorCollabInitialSyncIsPending!==false||
       window.__collabRoomFailed===true||
       !src||typeof src.getDraftChatSid!=='function'||
       typeof src.getDraftChatRoutingKey!=='function'||
       document.getElementById('pcms-alpha-editor-context')?.dataset?.pcmsHumanIntent==='true')
      return hold('AI_HISTORY_EDITOR_UNVERIFIED');
    const solo=()=>{
      if(window.editorCollabInitialSyncIsPending!==false||
         window.__collabRoomFailed===true||
         window.collabEditKeyIsIncorrect===true)return false;
      const provider=window.yjsProvider;
      if(!provider)return !window.yjsProviderRoomName;
      const doc=window.yDoc,aw=window.yjsAwareness;
      if(!doc||!aw||typeof aw.getStates!=='function'||
         !Number.isSafeInteger(doc.clientID)||
         provider.wsconnected!==true||provider.synced!==true||
         typeof window.yjsProviderRoomName!=='string'||
         provider.roomname!==window.yjsProviderRoomName)return false;
      const peers=aw.getStates();
      return peers instanceof Map&&peers.size===1&&peers.has(doc.clientID);
    };
    if(!solo())return hold('AI_HISTORY_COLLABORATION_UNVERIFIED');
    const sid=src.getDraftChatSid();
    const route=src.getDraftChatRoutingKey();
    if(typeof sid!=='string'||sid.length<12||sid.length>256||
       typeof route!=='string'||
       !/^(0|[1-9][0-9]*)\.[A-Za-z0-9_-]+$/.test(route))
      return hold('AI_HISTORY_SESSION_UNVERIFIED');
    const sha=await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('PCMS_AI_SESSION_V1:'+request.nonce+':'+sid));
    const digest=Array.from(new Uint8Array(sha))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6000);
    let data;
    try{
      const response=await fetch('https://ai-agent.perchance.org/api/aiAgent/history?k='+
        encodeURIComponent(route),{method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({sessionId:sid}),credentials:'omit',
        cache:'no-store',redirect:'error',signal:controller.signal});
      if(!response.ok)return hold('AI_HISTORY_SERVER_UNAVAILABLE');
      const size=Number(response.headers.get('content-length')||0);
      if(size>262144)return hold('AI_HISTORY_TOO_LARGE');
      const raw=await response.text();
      if(raw.length>262144)return hold('AI_HISTORY_TOO_LARGE');
      data=JSON.parse(raw);
    }finally{clearTimeout(timeout);}
    if(!data?.ok||!Array.isArray(data.entries)||
       data.entries.length<1||data.entries.length>512)
      return hold('AI_HISTORY_RESPONSE_UNVERIFIED');
    const entries=data.entries;
    const firstUser=entries.findIndex(x=>x?.k==='user');
    if(firstUser<0||firstUser>16||
       entries.slice(0,firstUser).some(x=>x?.k!=='sys'&&x?.k!=='fold')||
       entries[firstUser]?.t!==request.firstPrompt||
       entries.slice(0,firstUser).some(x=>x?.k==='fold'&&x?.l!=='instructions'))
      return hold('AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT');
    if(!solo()||src.getDraftChatSid()!==sid||
       src.getDraftChatRoutingKey()!==route||
       document.getElementById('pcms-alpha-editor-context')?.dataset?.pcmsHumanIntent==='true')
      return hold('AI_HISTORY_SESSION_CHANGED');
    return {ok:true,code:'AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED',
      sessionDigest:digest,serverHistory:'FIRST_USER_IS_T1',
      entriesObserved:entries.length};
  }catch{return hold('AI_HISTORY_READ_UNVERIFIED');}
}
