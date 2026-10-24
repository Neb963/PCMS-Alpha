// I10 native Perchance AI-helper bridge. Runs ONLY as a fixed MAIN-world
// function on the exact donor-guarded, PCMS-owned #edit tab. Page and model
// replies are untrusted; none of these return values is independent test PASS.
// Do not call outside the guarded overlay's verified tab and donor lease.
export async function perchanceAiNative(request,{allowHumanRead=false}={}){
  const hold=code=>({ok:false,code});
  const slug=request?.slug,action=request?.action,nonce=request?.nonce;
  if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     !/^[a-f0-9]{32}$/.test(nonce||'')||
     !['OBSERVE','SEND','NEW_CHAT','STOP'].includes(action))
    return hold('INVALID_AI_REQUEST');
  if(location.origin!=='https://perchance.org'||
     location.pathname!=='/'+slug||location.hash!=='#edit')
    return hold('EDITOR_TARGET_CHANGED');
  try {
    // Owners can automatically join their own Yjs room. A provider is
    // not itself a second collaborator: accept only a synchronized room
    // with exactly the local awareness client; peers/unknown state HOLD.
    const initialRoom=window.yjsProvider,initialDoc=window.yDoc,
      initialGeneration=window.__collabGeneration;
    const soloCollaboration=()=>{
      if(window.yjsProvider!==initialRoom||
         window.yDoc!==initialDoc||
         window.__collabGeneration!==initialGeneration)return false;
      if(window.editorCollabInitialSyncIsPending!==false||
         window.__collabRoomFailed===true||
         window.collabEditKeyIsIncorrect===true)return false;
      const provider=window.yjsProvider;
      if(!provider)return !window.yjsProviderRoomName;
      const doc=window.yDoc,awareness=window.yjsAwareness;
      if(!doc||!awareness||typeof awareness.getStates!=='function'||
         !Number.isSafeInteger(doc.clientID)||
         provider.wsconnected!==true||provider.synced!==true||
         typeof window.yjsProviderRoomName!=='string'||
         provider.roomname!==window.yjsProviderRoomName)return false;
      const peers=awareness.getStates();
      return peers instanceof Map&&peers.size===1&&peers.has(doc.clientID);
    };
    const app=window.app,src=window.srcState,model=window.modelTextEditor,
      html=window.outputTemplateEditor,menu=window.menuBar;
    if(window.__editorReady!==true||app?.data?.generator?.name!==slug||
       app.data.generator.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       !src||typeof src.getDraftChatSid!=='function'||
       !model||!html||!menu||
       !soloCollaboration()||
       typeof window.saveCheckpointManager?.isDivergenceBlocked!=='function'||
       window.saveCheckpointManager.isDivergenceBlocked()!==false)
      return hold('NATIVE_EDITOR_OR_OWNER_UNVERIFIED');
    const host=document.getElementById('pcms-alpha-editor-context');
    if(host?.dataset?.pcmsHumanIntent==='true'&&!(allowHumanRead&&action==='OBSERVE'))return hold('HUMAN_EDITOR_HOLD');
    const get=id=>document.getElementById(id);
    const send=get('aiAgentSendBtn'),stop=get('aiAgentStopBtn'),
      newChat=get('aiAgentNewChatBtn'),input=get('aiAgentInputEl'),
      msg=get('aiAgentMsgsEl'),wall=get('aiAgentWallEl'),
      queue=get('aiAgentQueueRowEl'),
      attachments=get('aiAgentAttachChipsEl');
    if(!send||!stop||!newChat||!input||!msg||!wall||!queue||
       !attachments||
       !get('aiAgentPanelEl'))
      return hold('NATIVE_HELPER_UNAVAILABLE');
    if(input.tagName!=='TEXTAREA'||send.tagName!=='BUTTON'||
       newChat.tagName!=='BUTTON'||stop.tagName!=='BUTTON')
      return hold('NATIVE_HELPER_CONTRACT_CHANGED');
    const session=src.getDraftChatSid();
    const digest=typeof session==='string'&&session.length>=12&&session.length<=256?
      [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
        'PCMS_AI_SESSION_V1:'+nonce+':'+session)))]
        .map(b=>b.toString(16).padStart(2,'0')).join(''):null;
    // The helper's own busy controls are only a UI observation, NOT
    // authoritative completion or test success.
    const busy=stop.hidden===false||wall.hidden===false;
    const current={ok:true,code:'NATIVE_HELPER_OBSERVED',
      slug,sessionDigest:digest,busy,
      canSend:send.hidden===false&&send.disabled!==true,
      canNewChat:newChat.disabled===false&&busy===false,
      chatEntries:msg.childElementCount,
      // The native helper rebuilds a single static greeting after newChat.
      // A leftover user/assistant turn is NOT a cleared history. This is
      // only local UI reset evidence, never server/OPFS isolation proof.
      resetGreetingVisible:msg.childElementCount===1&&
        msg.textContent?.trim()===
          '👋 I can edit the code and test it live. Ask me to build, change or test something.',
      hasQueue:queue.hidden===false||queue.style.display==='flex',
      inputOccupied:Boolean(input.value),
      attachmentsPending:attachments.childElementCount>0,
      sourceSaved:menu.saveState==='saved'&&window.__saveInFlight===false,
      editorClean:model.isClean?.()===true&&html.isClean?.()===true&&
        (await src.isDirty?.())===false,
      collaboration:'ABSENT_AT_OBSERVATION'};
    if(!soloCollaboration())return hold('COLLABORATION_CHANGED_DURING_OBSERVATION');
    if(action==='OBSERVE')return current;
    if(action!=='STOP'&&(current.hasQueue||current.inputOccupied||
       current.attachmentsPending||busy))
      return hold('AI_BUSY_OR_HUMAN_INPUT');
    if(action==='SEND'){
      const text=request?.text;
      if(typeof text!=='string'||text.length<1||text.length>16000||
         text.includes('\0')||!current.sourceSaved||!current.editorClean||
         !current.canSend)return hold('AI_SEND_PRECONDITION_UNVERIFIED');
      // A new chat must have no prior persisted session before SEND; a
      // resumed same session is allowed only for Chat 1 reconciliation.
      if(request.repair===true){
        // Continue only the exact already observed session; no replay into
        // a replacement chat or after an unproved new-chat reset.
        if(!/^[a-f0-9]{64}$/.test(request.expectedSessionDigest||'')||
           request.expectedSessionDigest!==current.sessionDigest)
          return hold('AI_REPAIR_SESSION_CHANGED');
      }else if(request.chat===2&&current.sessionDigest!==null)
        return hold('FRESH_CHAT_NOT_PROVEN');
      input.value=text;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      // The click may create an external remote effect even when no ACK is
      // observable. Caller MUST journal DISPATCH_POSSIBLE before entry.
      send.click();
      return {ok:true,code:'SEND_ATTEMPTED_UNVERIFIED'};
    }
    if(action==='NEW_CHAT'){
      if(!current.canNewChat||!current.sessionDigest)
        return hold('NEW_CHAT_PRECONDITION_UNVERIFIED');
      // Native confirmation is deliberately NOT bypassed. A non-confirmed
      // dialog or lost ACK leaves a durable hold requiring independent probe.
      newChat.click();
      return {ok:true,code:'NEW_CHAT_REQUESTED_UNVERIFIED',
        priorSessionDigest:current.sessionDigest};
    }
    if(!busy||stop.hidden!==false)return hold('STOP_NOT_APPLICABLE');
    stop.click();
    return {ok:true,code:'STOP_REQUESTED_UNVERIFIED'};
  }catch{return hold('NATIVE_AI_OBSERVATION_UNVERIFIED');}
}
