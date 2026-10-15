// Fixed native MAIN-world operation; injected only by the donor lease owner.
// PREFLIGHT never edits. SAVE changes exactly one HTML prefix and invokes
// the existing native save once. ACK cannot establish persisted source.
export async function perchanceRefreshMain(request){
  const fail=code=>({ok:false,code,effectBoundary:'NOT_DISPATCHED'});
  const p=request?.plan;
  if(!['PREFLIGHT','SAVE'].includes(request?.action)||
    location.origin!=='https://perchance.org'||location.pathname!=='/'+request.slug||location.hash!=='#edit'||
    !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug||'')||
    p?.policy!=='html_prefix_v1'||p.anchor!=='HTML_BYTE_ZERO'||
    !/^[a-f0-9]{32}$/.test(p.operationId||'')||
    !/^[a-f0-9]{64}$/.test(p.approvedBaseFingerprint||'')||
    !Number.isSafeInteger(p.sequence)||p.sequence<1||p.sequence>4096||
    typeof p.beforeMarker!=='string'||p.beforeMarker.length>260||
    p.afterMarker!==`<!-- PCMS_REFRESH_MARKER:html_prefix_v1:F=${p.approvedBaseFingerprint}:S=${p.sequence}:O=${p.operationId} -->\n`||
    !Array.isArray(request.previousFiles)||request.previousFiles.length<2||request.previousFiles.length>502)
    return fail('REFRESH_REQUEST_UNVERIFIED');
  try{
    const app=window.app,src=window.srcState,model=window.modelTextEditor,
      html=window.outputTemplateEditor,menu=window.menuBar;
    if(typeof app?.saveGenerator!=='function'||typeof src?.ready!=='function'||
      typeof src.list!=='function'||typeof src.readFile!=='function'||
      typeof src.isDirty!=='function'||typeof src.hasPending!=='function'||typeof src.conflictPaths!=='function'||
      typeof model?.getValue!=='function'||typeof model.isClean!=='function'||
      typeof html?.getValue!=='function'||typeof html.setValue!=='function'||typeof html.isClean!=='function')
      return fail('REFRESH_NATIVE_CONTRACT_UNVERIFIED');
    const room=window.yjsProvider,doc=window.yDoc,generation=window.__collabGeneration;
    const solo=()=>{
      if(window.yjsProvider!==room||window.yDoc!==doc||window.__collabGeneration!==generation||
        window.editorCollabInitialSyncIsPending!==false||window.__collabRoomFailed===true||
        window.collabEditKeyIsIncorrect===true)return false;
      if(!room)return !window.yjsProviderRoomName;
      const peers=window.yjsAwareness?.getStates?.();
      return room.wsconnected===true&&room.synced===true&&room.roomname===window.yjsProviderRoomName&&
        Number.isSafeInteger(doc?.clientID)&&peers instanceof Map&&peers.size===1&&peers.has(doc.clientID);
    };
    const human=()=>document.getElementById('pcms-alpha-editor-context')?.dataset?.pcmsHumanIntent==='true';
    const context=()=>location.origin==='https://perchance.org'&&location.pathname==='/'+request.slug&&
      location.hash==='#edit'&&window.app===app&&window.srcState===src&&
      window.modelTextEditor===model&&window.outputTemplateEditor===html&&
      window.__editorReady===true&&window.__saveInFlight===false&&window.userOwnsThisGenerator===true&&
      app.data?.generator?.name===request.slug&&app.data.generator.publicId===request.remoteId&&
      app.data.generator.isPrivate===false&&solo()&&!human()&&
      window.saveCheckpointManager?.isDivergenceBlocked?.()===false&&src.conflictPaths().length===0;
    const clean=async()=>context()&&src.hasPending()===false&&(await src.isDirty())===false&&
      model.isClean()===true&&html.isClean()===true&&menu?.saveState==='saved';
    if(!(await clean()))return fail('REFRESH_EDITOR_DIRTY_OR_UNVERIFIED');
    if(typeof window.aiAgentWorkspaceSnapshot!=='function')return fail('REFRESH_AI_WORKSPACE_UNVERIFIED');
    const workspace=await window.aiAgentWorkspaceSnapshot();
    // Discovery v3 returns null when no agent has written; otherwise the
    // preference is a per-panel object (a truthy object is not itself drift).
    const preference=workspace?.preferWorkspace;
    if(workspace!==null&&(workspace?.unavailable===true||!workspace||
      (preference!==null&&preference!==undefined&&
        (typeof preference!=='object'||preference.modelText!==false||preference.outputTemplate!==false))))
      return fail('REFRESH_AI_WORKSPACE_UNVERIFIED');
    const tabs=JSON.parse(localStorage.getItem('perchanceTabsOpen')||'null');
    if(!tabs?.[request.slug]||typeof tabs[request.slug]!=='object'||Object.keys(tabs[request.slug]).length!==1)
      return fail('HUMAN_OR_AMBIGUOUS_EDITOR');
    await src.ready();
    const encoder=new TextEncoder(),decode=f=>Uint8Array.from(atob(f.base64),x=>x.charCodeAt(0));
    const matches=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
    const files=new Map();let size=0;
    for(const f of request.previousFiles){
      if(!f||typeof f.path!=='string'||!(f.path==='main.pjs'||f.path==='index.html'||
        /^src\/(?:[A-Za-z0-9][A-Za-z0-9._-]{0,99}\/)*[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(f.path))||
        f.path.length>240||f.path!==f.path.normalize('NFC')||f.path.split('/').some(x=>x.endsWith('.'))||
        files.has(f.path.toLowerCase())||typeof f.base64!=='string'||f.base64.length>17000000||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64))
        return fail('REFRESH_MANIFEST_INVALID');
      const bytes=decode(f);size+=bytes.length;
      if(bytes.length>12*1024*1024||size>16*1024*1024)return fail('REFRESH_SOURCE_LIMIT');
      files.set(f.path.toLowerCase(),{path:f.path,bytes});
    }
    if(!files.has('main.pjs')||!files.has('index.html'))return fail('REFRESH_ROOT_FILES_REQUIRED');
    const listing=src.list(),names=listing instanceof Map?[...listing.keys()]:Array.isArray(listing)?listing:
      listing&&Object.getPrototypeOf(listing)===Object.prototype?Object.keys(listing):null;
    const assets=[...files.values()].filter(x=>x.path.startsWith('src/'));
    if(!names||names.length!==assets.length||new Set(names).size!==names.length||
      assets.some(x=>!names.includes(x.path.slice(4))))return fail('REFRESH_SOURCE_DRIFT');
    const originalPjs=model.getValue(),originalHtml=html.getValue();
    if(!matches(encoder.encode(originalPjs),files.get('main.pjs').bytes)||
      !matches(encoder.encode(originalHtml),files.get('index.html').bytes))return fail('REFRESH_SOURCE_DRIFT');
    for(const f of assets){
      const raw=await src.readFile(f.path.slice(4)),bytes=raw instanceof ArrayBuffer?new Uint8Array(raw):raw;
      if(!(bytes instanceof Uint8Array)||!matches(bytes,f.bytes))return fail('REFRESH_SOURCE_DRIFT');
    }
    const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const fingerprint=async map=>{
      const proofs=[];for(const f of [...map.values()].sort((a,b)=>a.path<b.path?-1:1))
        proofs.push(JSON.stringify([f.path,f.bytes.length,await hash(f.bytes)]));
      return hash(encoder.encode('PCMS_STAGED_SOURCE_V1\n'+proofs.join('\n')));
    };
    if(await fingerprint(files)!==p.expectedPreSaveFingerprint)return fail('REFRESH_SOURCE_DRIFT');
    if(p.beforeMarker&&!originalHtml.startsWith(p.beforeMarker))return fail('REFRESH_MARKER_PROVENANCE_CHANGED');
    const baseHtml=originalHtml.slice(p.beforeMarker.length);
    if(baseHtml.includes('PCMS_REFRESH_MARKER')||
      !/^\s*(?:<!doctype\s+html\b|<(?:html|head|body|div|main|section|article|header|footer|p|h[1-6]|style|script|form|span|button|textarea|!--)(?:\s|>|-))/i.test(baseHtml))
      return fail('MARKER_SAFE_SLOT_REQUIRED');
    files.set('index.html',{path:'index.html',bytes:encoder.encode(baseHtml)});
    if(await fingerprint(files)!==p.approvedBaseFingerprint)return fail('FUNCTIONAL_SOURCE_DRIFT');
    const nextHtml=p.afterMarker+baseHtml;
    files.set('index.html',{path:'index.html',bytes:encoder.encode(nextHtml)});
    if(await fingerprint(files)!==p.expectedPostSaveFingerprint)return fail('REFRESH_TRANSFORM_INVALID');
    if(!(await clean())||model.getValue()!==originalPjs||html.getValue()!==originalHtml)
      return fail('REFRESH_EDITOR_CHANGED');
    if(request.action==='PREFLIGHT')return {ok:true,code:'REFRESH_PREFLIGHT_READY',effectBoundary:'NOT_DISPATCHED'};
    // No async gap between final context check, exact prefix edit and native
    // save invocation. Native confirmation/refusal is never auto-accepted.
    if(!context()||model.getValue()!==originalPjs||html.getValue()!==originalHtml)
      return fail('REFRESH_PRE_SAVE_CONTEXT_CHANGED');
    html.setValue(nextHtml);
    if(!context()||model.getValue()!==originalPjs||html.getValue()!==nextHtml||menu.saveState!=='unsaved')
      return fail('REFRESH_PRE_SAVE_CONTEXT_CHANGED');
    let result;
    try{result=await app.saveGenerator();}
    catch{return {ok:false,code:'REFRESH_SAVE_ACK_LOST',effectBoundary:'DISPATCH_POSSIBLE'};}
    return {ok:result!==false&&menu.saveState==='saved',code:result===false?'REFRESH_PROVIDER_REFUSED':'REFRESH_SAVE_ACK_ONLY',
      effectBoundary:'DISPATCH_POSSIBLE'};
  }catch{return fail('REFRESH_EDITOR_UNVERIFIED');}
}
