// I13 fixed native listing flip in the exact PCMS-owned editor. It cannot
// accept an arbitrary URL, tab, account, route or unpublished source bytes.
// The caller has already committed DISPATCH_POSSIBLE to the canonical journal.
// Browser CI uses a disposable provider fixture; live activation is OFF.
export async function perchanceReleaseMain(request) {
  const held=code=>({ok:false,code});
  const pathOK=p=>typeof p==='string'&&p.startsWith('src/')&&p.length<=240&&
    p===p.normalize('NFC')&&p.split('/').every(x=>
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(x)&&x!=='.'&&x!=='..'&&!x.endsWith('.'));
  if(!request||request.action!=='PUBLISH'||typeof request.slug!=='string'||
     !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
     location.origin!=='https://perchance.org'||
     location.pathname!=='/'+request.slug||location.hash!=='#edit'||
     !Array.isArray(request.files)||request.files.length<2||request.files.length>502)
    return held('RELEASE_TARGET_UNVERIFIED');
  try{
    const app=window.app,model=window.modelTextEditor,
      html=window.outputTemplateEditor,src=window.srcState,menu=window.menuBar;
    if(window.__editorReady!==true||window.__saveInFlight!==false||
       app?.data?.generator?.name!==request.slug||
       app.data.generator.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       typeof app.saveGenerator!=='function'||
       typeof model?.getValue!=='function'||typeof model?.isClean!=='function'||
       typeof html?.getValue!=='function'||typeof html?.isClean!=='function'||
       typeof src?.list!=='function'||typeof src?.isDirty!=='function'||
       typeof src?.readFile!=='function'||typeof src?.hasPending!=='function'||
       menu?.saveState!=='saved')
      return held('NATIVE_RELEASE_CONTRACT_UNVERIFIED');
    const room=window.yjsProvider,doc=window.yDoc,gen=window.__collabGeneration;
    const solo=()=>{
      if(window.yjsProvider!==room||window.yDoc!==doc||
         window.__collabGeneration!==gen||
         window.editorCollabInitialSyncIsPending!==false||
         window.__collabRoomFailed===true||
         window.collabEditKeyIsIncorrect===true)return false;
      if(!room)return !window.yjsProviderRoomName;
      const awareness=window.yjsAwareness;
      return room.synced===true&&room.wsconnected===true&&
        room.roomname===window.yjsProviderRoomName&&
        Number.isSafeInteger(doc?.clientID)&&
        awareness?.getStates?.() instanceof Map&&
        awareness.getStates().size===1&&awareness.getStates().has(doc.clientID);
    };
    const human=()=>document.getElementById('pcms-alpha-editor-context')
      ?.dataset.pcmsHumanIntent==='true';
    const clean=async()=>!human()&&solo()&&
      window.__editorReady===true&&window.__saveInFlight===false&&
      app.data.generator.name===request.slug&&
      app.data.generator.isPrivate===true&&
      menu.saveState==='saved'&&model.isClean()===true&&
      html.isClean()===true&&(await src.isDirty())===false&&
      src.hasPending()===false&&src.conflictPaths?.().length===0&&
      window.saveCheckpointManager?.isDivergenceBlocked?.()===false;
    if(!(await clean()))return held('EDITOR_DIRTY_OR_COLLABORATIVE');
    // Verify all native editor file bytes equal F, including binary src.
    // Hashing a manifest key without readFile is NOT evidence.
    const toBytes=s=>new TextEncoder().encode(s);
    const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const wanted=new Map(),seen=new Set();let size=0;
    for(const f of request.files){
      if(!f||!(f.path==='main.pjs'||f.path==='index.html'||pathOK(f.path))||
         seen.has(f.path.toLowerCase())||typeof f.base64!=='string'||
         f.base64.length>17_000_000||
         !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64))
        return held('RELEASE_F_MANIFEST_INVALID');
      seen.add(f.path.toLowerCase());
      const bytes=Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));
      if(bytes.length>12*1024*1024||(size+=bytes.length)>16*1024*1024)
        return held('RELEASE_F_TOO_LARGE');
      wanted.set(f.path,bytes);
    }
    if(!wanted.has('main.pjs')||!wanted.has('index.html')||
       !same(toBytes(model.getValue()),wanted.get('main.pjs'))||
       !same(toBytes(html.getValue()),wanted.get('index.html')))
      return held('EDITOR_FINAL_SOURCE_DRIFT');
    const current=src.list();
    const names=current instanceof Map?[...current.keys()]:
      Array.isArray(current)?current:
      current&&Object.getPrototypeOf(current)===Object.prototype?Object.keys(current):null;
    const assetNames=[...wanted.keys()].filter(p=>p.startsWith('src/')).map(p=>p.slice(4));
    if(!names||names.length!==assetNames.length||
       new Set(names).size!==names.length||assetNames.some(n=>!names.includes(n)))
      return held('EDITOR_SRC_MANIFEST_DRIFT');
    for(const name of assetNames){
      const content=await src.readFile(name);
      if(!(content instanceof Uint8Array)||!same(content,wanted.get('src/'+name)))
        return held('EDITOR_SRC_BYTES_DRIFT');
    }
    if(!(await clean()))return held('EDITOR_CHANGED_BEFORE_PUBLICATION');
    // The one possible effect. A thrown call, lost reply or saved signal
    // cannot be retried by the caller without read-only reconciliation.
    app.data.generator.isPrivate=false;
    let outcome;
    try{outcome=await app.saveGenerator();}
    catch{return held('PUBLICATION_POSSIBLY_DISPATCHED');}
    if(outcome===false||window.__saveInFlight!==false||
       menu.saveState!=='saved'||app.data.generator.isPrivate!==false)
      return held('PUBLICATION_ACK_UNVERIFIED');
    return {ok:true,code:'PUBLICATION_ACK_ONLY'};
  }catch{return held('PUBLICATION_OUTCOME_UNKNOWN');}
}
