// I10: credential selector in MAIN world, server-history transport/parser in
// ISOLATED world. Only the tagged, leased background operation sees transient
// native session handles. Never persist or return raw handles/transcripts.
export async function perchanceAiHistoryCredentials(request){
  const hold=code=>({ok:false,code});
  const slug=request?.slug,nonce=request?.nonce;
  if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce))
    return hold('AI_HISTORY_REQUEST_INVALID');
  if(location.origin!=='https://perchance.org'||location.pathname!=='/'+slug||
     location.hash!=='#edit')return hold('AI_HISTORY_WRONG_EDITOR');
  try{
    const src=window.srcState,gen=window.app?.data?.generator;
    const provider=window.yjsProvider,doc=window.yDoc,aw=window.yjsAwareness;
    if(window.__editorReady!==true||gen?.name!==slug||gen.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       window.editorCollabInitialSyncIsPending!==false||
       window.__collabRoomFailed===true||window.collabEditKeyIsIncorrect===true||
       !src||typeof src.getDraftChatSid!=='function'||
       typeof src.getDraftChatRoutingKey!=='function'||
       document.getElementById('pcms-alpha-editor-context')?.dataset?.pcmsHumanIntent==='true')
      return hold('AI_HISTORY_EDITOR_UNVERIFIED');
    if(provider){
      if(!doc||!aw||typeof aw.getStates!=='function'||
         !Number.isSafeInteger(doc.clientID)||provider.wsconnected!==true||
         provider.synced!==true||provider.roomname!==window.yjsProviderRoomName)
        return hold('AI_HISTORY_COLLABORATION_UNVERIFIED');
      const peers=aw.getStates();
      if(!(peers instanceof Map)||peers.size!==1||!peers.has(doc.clientID))
        return hold('AI_HISTORY_COLLABORATION_UNVERIFIED');
    }else if(window.yjsProviderRoomName)
      return hold('AI_HISTORY_COLLABORATION_UNVERIFIED');
    const generation=window.__collabGeneration;
    const sid=src.getDraftChatSid(),key=src.getDraftChatRoutingKey();
    if(typeof sid!=='string'||sid.length<12||sid.length>256||
       typeof key!=='string'||key.length>512||
       !/^(0|[1-9][0-9]*)\.[A-Za-z0-9_-]+$/.test(key))
      return hold('AI_HISTORY_SESSION_UNVERIFIED');
    const hash=await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('PCMS_AI_SESSION_V1:'+nonce+':'+sid));
    if(window.__collabGeneration!==generation||window.yjsProvider!==provider||
       window.yDoc!==doc||src.getDraftChatSid()!==sid||
       src.getDraftChatRoutingKey()!==key||
       document.getElementById('pcms-alpha-editor-context')?.dataset?.pcmsHumanIntent==='true')
      return hold('AI_HISTORY_CONTEXT_CHANGED');
    return {ok:true,sessionId:sid,routingKey:key,
      sessionDigest:Array.from(new Uint8Array(hash))
        .map(x=>x.toString(16).padStart(2,'0')).join('')};
  }catch{return hold('AI_HISTORY_CREDENTIAL_READ_UNVERIFIED');}
}

// Independent server-history transport. ISOLATED Firefox world; the editable
// page cannot override this realm's fetch or substitute fake Response objects.
export async function perchanceAiHistoryIsolated(request){
  const hold=code=>({ok:false,code,serverHistory:'UNVERIFIED'});
  const slug=request?.slug,nonce=request?.nonce,sid=request?.sessionId,
    route=request?.routingKey,firstPrompt=request?.firstPrompt,
    expected=request?.sessionDigest;
  if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     typeof nonce!=='string'||!/^[a-f0-9]{32}$/.test(nonce)||
     typeof sid!=='string'||sid.length<12||sid.length>256||
     typeof route!=='string'||route.length>512||
     !/^(0|[1-9][0-9]*)\.[A-Za-z0-9_-]+$/.test(route)||
     typeof firstPrompt!=='string'||firstPrompt.length<1||
     firstPrompt.length>16000||typeof expected!=='string'||
     !/^[a-f0-9]{64}$/.test(expected))
    return hold('AI_HISTORY_REQUEST_INVALID');
  if(location.origin!=='https://perchance.org'||location.pathname!=='/'+slug||
     location.hash!=='#edit')return hold('AI_HISTORY_WRONG_EDITOR');
  let digest;
  try{
    const hash=await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode('PCMS_AI_SESSION_V1:'+nonce+':'+sid));
    digest=Array.from(new Uint8Array(hash))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
  }catch{return hold('AI_HISTORY_DIGEST_UNAVAILABLE');}
  if(digest!==expected)return hold('AI_HISTORY_SESSION_CHANGED');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
  try{
    const response=await fetch('https://ai-agent.perchance.org/api/aiAgent/history?k='+
      encodeURIComponent(route),{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sessionId:sid}),credentials:'omit',cache:'no-store',
      redirect:'error',signal:ctrl.signal});
    if(!response?.ok)return hold('AI_HISTORY_SERVER_UNAVAILABLE');
    const declared=Number(response.headers?.get('content-length')||0);
    if(!Number.isFinite(declared)||declared>262144)
      return hold('AI_HISTORY_TOO_LARGE');
    if(!response.body||typeof response.body.getReader!=='function')
      return hold('AI_HISTORY_STREAM_UNAVAILABLE');
    const reader=response.body.getReader();
    let size=0;const chunks=[];
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        if(!(value instanceof Uint8Array)||value.length>262144-size)
          return hold('AI_HISTORY_TOO_LARGE');
        size+=value.length;chunks.push(value);
      }
    }finally{try{await reader.cancel();}catch{}}
    const bytes=new Uint8Array(size);let at=0;
    for(const part of chunks){bytes.set(part,at);at+=part.length;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data?.ok!==true||!Array.isArray(data.entries)||
       data.entries.length<1||data.entries.length>512)
      return hold('AI_HISTORY_RESPONSE_UNVERIFIED');
    const entries=data.entries,first=entries.findIndex(x=>x?.k==='user');
    if(first<0||first>16||entries[first]?.t!==firstPrompt||
       entries.slice(0,first).some(x=>!x||
         (x.k!=='sys'&&!(x.k==='fold'&&x.l==='instructions'))))
      return hold('AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT');
    return {ok:true,code:'AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED',
      sessionDigest:digest,serverHistory:'FIRST_USER_IS_T1',
      entriesObserved:entries.length};
  }catch{return hold('AI_HISTORY_REMOTE_READ_UNVERIFIED');}
  finally{clearTimeout(timer);}
}

// I11: a bounded, authenticated, exact-session terminal assistant suggestion.
// Only called through the donor-owned tab and guarded MAIN transient selection.
// The server's assistant text is UNTRUSTED plain text, never a PASS or command.
export async function perchanceAiTerminalHistoryIsolated(request){
  const hold=code=>({ok:false,code});
  const {slug,nonce,sessionId:sid,routingKey:key,sessionDigest,firstPrompt}=request||{};
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug||'')||
     !/^[a-f0-9]{32}$/.test(nonce||'')||
     typeof sid!=='string'||sid.length<12||sid.length>256||
     typeof key!=='string'||key.length>512||
     !/^(0|[1-9][0-9]*)\.[A-Za-z0-9_-]+$/.test(key)||
     !/^[a-f0-9]{64}$/.test(sessionDigest||'')||
     typeof firstPrompt!=='string'||firstPrompt.length<1||
     firstPrompt.length>16000||
     location.origin!=='https://perchance.org'||
     location.pathname!=='/'+slug||location.hash!=='#edit')
    return hold('AI_TERMINAL_CONTEXT_INVALID');
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
    'PCMS_AI_SESSION_V1:'+nonce+':'+sid));
  const actual=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==sessionDigest)return hold('AI_TERMINAL_SESSION_DRIFT');
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6000);
  try{
    const response=await fetch('https://ai-agent.perchance.org/api/aiAgent/history?k='+
      encodeURIComponent(key),{method:'POST',credentials:'omit',cache:'no-store',
      redirect:'error',signal:ctrl.signal,headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sessionId:sid})});
    if(!response?.ok||!response.body||typeof response.body.getReader!=='function')
      return hold('AI_TERMINAL_HISTORY_UNAVAILABLE');
    const advertised=Number(response.headers?.get('content-length')||0);
    if(!Number.isFinite(advertised)||advertised>262144)
      return hold('AI_TERMINAL_HISTORY_TOO_LARGE');
    const reader=response.body.getReader(),chunks=[];let total=0;
    try{
      for(;;){
        const {value,done}=await reader.read();if(done)break;
        if(!(value instanceof Uint8Array)||value.length>262144-total)
          return hold('AI_TERMINAL_HISTORY_TOO_LARGE');
        chunks.push(value);total+=value.length;
      }
    }finally{try{await reader.cancel();}catch{}}
    const bytes=new Uint8Array(total);let offset=0;
    for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data?.ok!==true||!Array.isArray(data.entries)||
       data.entries.length<2||data.entries.length>512)
      return hold('AI_TERMINAL_HISTORY_INVALID');
    const list=data.entries,first=list.findIndex(e=>e?.k==='user');
    if(first<0||first>16||list[first]?.t!==firstPrompt||
       list.slice(0,first).some(e=>e?.k!=='sys'&&
         !(e?.k==='fold'&&e.l==='instructions')))
      return hold('AI_TERMINAL_OTHER_HISTORY');
    const last=list.at(-1);
    if(!['assistant','ai'].includes(last?.k)||
       typeof last.t!=='string'||last.t.length<1||last.t.length>8192)
      return hold('AI_TERMINAL_ASSISTANT_UNVERIFIED');
    // This isolated origin transport returns suggestion text solely to the
    // extension background; the unprivileged UI receives only a later receipt.
    return {ok:true,kind:'TERMINAL_ASSISTANT',
      origin:'DONOR_GUARDED_NATIVE_HISTORY',sessionDigest,
      settled:true,text:last.t};
  }catch{return hold('AI_TERMINAL_HISTORY_UNVERIFIED');}
  finally{clearTimeout(timer);}
}
