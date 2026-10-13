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
    if(window.__editorReady!==true||
       window.app?.data?.generator?.name!==request.slug||
       window.app?.data?.generator?.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       !window.srcState?.getDraftChatSid||
       window.yjsProvider||window.yDoc||
       window.editorCollabInitialSyncIsPending!==false||
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
    const root=await navigator.storage.getDirectory();
    if(!root||typeof root.getDirectoryHandle!=='function')
      return fail('WORKSPACE_OPFS_UNAVAILABLE');
    // The archived helper uses attachments/<sid>; the worker's actual
    // source-workspace layout is not independently documented. A missing
    // attachment directory is normal and cannot be an isolation proof.
    let attachmentState='ABSENT';
    try{
      const parent=await root.getDirectoryHandle('attachments');
      const own=await parent.getDirectoryHandle(sid);
      if(!own||own.kind!=='directory')return fail('WORKSPACE_ATTACHMENT_KIND_CHANGED');
      attachmentState='PRESENT_UNTRUSTED';
    }catch(e){
      if(e?.name!=='NotFoundError')return fail('WORKSPACE_OPFS_INSPECTION_FAILED');
    }
    // Bound memory/time even if a future browser returns a surprising
    // large or cyclic root iterator. Never enumerate contents or names.
    return {ok:true,code:'OPFS_LOCAL_OBSERVED_ONLY',slug:request.slug,
      sessionDigest:digest,attachmentState,
      localOpfsAccessible:true,serverEndAck:'UNOBSERVED',
      workerNamespace:'UNVERIFIED',isolation:'UNVERIFIED'};
  }catch{return fail('WORKSPACE_OPFS_INSPECTION_FAILED');}
}
