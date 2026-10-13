// I10 read-only, site-origin OPFS witness. A MAIN-world function invoked
// ONLY on the donor-guarded exact I09 tab. This does NOT prove remote-server
// isolation or the native worker's namespace: never returns PASS/fresh proof.
// No create:true, no file reads/writes, no raw session IDs or directory names
// are returned. Absence of an attachment directory is not evidence of safety.
export async function perchanceAiOpfsProbe(request){
  const fail=code=>({ok:false,code,isolation:'UNVERIFIED'});
  if(typeof request?.slug!=='string'||
     !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
     typeof request?.nonce!=='string'||!/^[a-f0-9]{32}$/.test(request.nonce))
    return fail('WORKSPACE_REQUEST_INVALID');
  if(location.origin!=='https://perchance.org'||
     location.pathname!=='/'+request.slug||location.hash!=='#edit')
    return fail('WORKSPACE_EDITOR_CHANGED');
  try{
    // Owners can automatically join their own Yjs room. A provider is
    // not itself a second collaborator: accept only a synchronized room
    // with exactly the local awareness client; peers/unknown state HOLD.
    const soloCollaboration=()=>{
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
    if(window.__editorReady!==true||
       window.app?.data?.generator?.name!==request.slug||
       window.app?.data?.generator?.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       !window.srcState?.getDraftChatSid||
       !soloCollaboration()||
       window.saveCheckpointManager?.isDivergenceBlocked?.()!==false||
       document.getElementById('pcms-alpha-editor-context')?.dataset?.pcmsHumanIntent==='true')
      return fail('WORKSPACE_OWNER_UNVERIFIED');
    const sid=window.srcState.getDraftChatSid();
    if(typeof sid!=='string'||sid.length<12||sid.length>256)
      return fail('WORKSPACE_SESSION_UNVERIFIED');
    const digest=Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256',new TextEncoder().encode(
        'PCMS_AI_SESSION_V1:'+request.nonce+':'+sid))))
      .map(x=>x.toString(16).padStart(2,'0')).join('');
    if(typeof navigator.storage?.getDirectory!=='function')
      return fail('WORKSPACE_OPFS_UNAVAILABLE');
    // Browser storage backends can stall. Bound each read without mutating
    // OPFS; the unresolved provider promise cannot authorize a retry/effect.
    const read=async operation=>{
      let timer;
      try{return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_,reject)=>{
          timer=setTimeout(()=>reject(Error('WORKSPACE_READ_TIMEOUT')),3000);
        })
      ]);}
      finally{clearTimeout(timer);}
    };
    const root=await read(()=>navigator.storage.getDirectory());
    if(!root||typeof root.getDirectoryHandle!=='function')
      return fail('WORKSPACE_OPFS_UNAVAILABLE');
    // The archived helper uses attachments/<sid>; the worker's actual
    // source-workspace layout is not independently documented. A missing
    // attachment directory is normal and cannot be an isolation proof.
    let attachmentState='ABSENT';
    try{
      const parent=await read(()=>root.getDirectoryHandle('attachments',{create:false}));
      const own=await read(()=>parent.getDirectoryHandle(sid,{create:false}));
      if(!own||own.kind!=='directory')return fail('WORKSPACE_ATTACHMENT_KIND_CHANGED');
      attachmentState='PRESENT_UNTRUSTED';
    }catch(e){
      if(e?.name!=='NotFoundError')return fail('WORKSPACE_OPFS_INSPECTION_FAILED');
    }
    // Archived aiAgentClient describes a per-session tools-worker
    // namespace under agent/<sid>/workspace, but the actual worker module
    // is unavailable here. Probe only existence of that exact session-local
    // directory. Even PRESENT cannot prove its contents, active worker,
    // isolation from old scratch, or remote server-session independence.
    let workspaceRootState='ABSENT';
    try{
      const agent=await read(()=>root.getDirectoryHandle('agent',{create:false}));
      const sessionRoot=await read(()=>
        agent.getDirectoryHandle(sid,{create:false}));
      const workspace=await read(()=>
        sessionRoot.getDirectoryHandle('workspace',{create:false}));
      if(!workspace||workspace.kind!=='directory')
        return fail('WORKSPACE_ROOT_KIND_CHANGED');
      workspaceRootState='PRESENT_UNTRUSTED';
    }catch(e){
      if(e?.name!=='NotFoundError')
        return fail('WORKSPACE_OPFS_INSPECTION_FAILED');
    }
    if(!soloCollaboration())return fail('WORKSPACE_COLLABORATION_CHANGED');
    // No listing, file reads, writes, child paths, or raw names cross the
    // extension boundary; a seeded folder is not an isolation oracle.
    return {ok:true,code:'OPFS_LOCAL_OBSERVED_ONLY',slug:request.slug,
      sessionDigest:digest,attachmentState,workspaceRootState,
      localOpfsAccessible:true,serverEndAck:'UNOBSERVED',
      workerNamespace:'UNVERIFIED',isolation:'UNVERIFIED'};
  }catch{return fail('WORKSPACE_OPFS_INSPECTION_FAILED');}
}
