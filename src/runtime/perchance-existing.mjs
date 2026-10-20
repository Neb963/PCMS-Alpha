// I13 guarded source writer; S07 adds PUBLIC REFRESH without unlisting.
// No generic source/page command, and no mutable source is accepted from UI.
// Before each possible native mutation, canonical DISPATCH_POSSIBLE is durable.
export async function perchanceExistingMain(request){
  const fail=code=>({ok:false,code});
  const pathOK=p=>typeof p==='string'&&p.startsWith('src/')&&p.length<=240&&
    p===p.normalize('NFC')&&p.split('/').every(x=>
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(x)&&x!=='.'&&x!=='..'&&!x.endsWith('.'));
  if(!request||!['UNLIST','STAGE','RESTORE','REFRESH'].includes(request.action)||
     typeof request.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
     location.origin!=='https://perchance.org'||location.pathname!=='/'+request.slug||
     location.hash!=='#edit')return fail('EXISTING_TARGET_UNVERIFIED');
  try{
    const app=window.app,src=window.srcState,model=window.modelTextEditor,
      html=window.outputTemplateEditor,menu=window.menuBar;
    if(window.__editorReady!==true||window.__saveInFlight!==false||
       window.userOwnsThisGenerator!==true||
       app?.data?.generator?.name!==request.slug||
       typeof app.saveGenerator!=='function'||
       typeof model?.getValue!=='function'||typeof model?.setValue!=='function'||
       typeof model?.isClean!=='function'||typeof html?.getValue!=='function'||
       typeof html?.setValue!=='function'||typeof html?.isClean!=='function'||
       typeof src?.list!=='function'||typeof src?.readFile!=='function'||
       typeof src?.writeFile!=='function'||typeof src?.deleteFile!=='function'||
       typeof src?.isDirty!=='function'||typeof src?.hasPending!=='function'||
       typeof src?.conflictPaths!=='function'||typeof menu?.saveState!=='string')
      return fail('EXISTING_NATIVE_CONTRACT_UNVERIFIED');
    const room=window.yjsProvider,doc=window.yDoc,
      generation=window.__collabGeneration;
    const solo=()=>{
      if(window.yjsProvider!==room||window.yDoc!==doc||
         window.__collabGeneration!==generation||
         window.editorCollabInitialSyncIsPending!==false||
         window.__collabRoomFailed===true||window.collabEditKeyIsIncorrect===true)
        return false;
      if(!room)return !window.yjsProviderRoomName;
      const peers=window.yjsAwareness?.getStates?.();
      return room.wsconnected===true&&room.synced===true&&
        room.roomname===window.yjsProviderRoomName&&
        Number.isSafeInteger(doc?.clientID)&&peers instanceof Map&&
        peers.size===1&&peers.has(doc.clientID);
    };
    const clean=async privacy=>!document.getElementById('pcms-alpha-editor-context')
      ?.dataset?.pcmsHumanIntent?.includes('true')&&
      window.__editorReady===true&&window.__saveInFlight===false&&
      app.data.generator.name===request.slug&&
      app.data.generator.isPrivate===privacy&&
      window.userOwnsThisGenerator===true&&solo()&&
      window.saveCheckpointManager?.isDivergenceBlocked?.()===false&&
      src.conflictPaths().length===0&&src.hasPending()===false&&
      (await src.isDirty())===false&&model.isClean()===true&&
      html.isClean()===true&&menu.saveState==='saved';
    const expectedPrivacy=['UNLIST','REFRESH'].includes(request.action)?false:true;
    if(!(await clean(expectedPrivacy)))return fail('EXISTING_EDITOR_DIRTY_OR_UNVERIFIED');
    const decode=f=>{
      if(!f||!(f.path==='main.pjs'||f.path==='index.html'||pathOK(f.path))||
         typeof f.base64!=='string'||f.base64.length>17_000_000||
         !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64))
        throw Error('INVALID_F');
      return Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0));
    };
    const manifest=(items)=>{
      if(!Array.isArray(items)||items.length<2||items.length>502)
        throw Error('INVALID_FILES');
      const out=new Map();let size=0;
      for(const item of items){
        if(out.has(item.path.toLowerCase()))throw Error('DUPLICATE');
        const bytes=decode(item);size+=bytes.length;
        if(bytes.length>12*1024*1024||size>16*1024*1024)
          throw Error('SOURCE_LIMIT');
        out.set(item.path.toLowerCase(),{path:item.path,bytes});
      }
      if(!out.has('main.pjs')||!out.has('index.html'))throw Error('MISSING_ROOT');
      return out;
    };
    const prior=manifest(request.previousFiles);
    const matching=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
    const encoder=new TextEncoder();
    const textValue=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const current=src.list();
    const sourceNames=current instanceof Map?[...current.keys()]:
      Array.isArray(current)?current:
      current&&Object.getPrototypeOf(current)===Object.prototype?Object.keys(current):null;
    const previousNames=[...prior.values()].filter(x=>x.path.startsWith('src/'))
      .map(x=>x.path.slice(4));
    if(!sourceNames||sourceNames.length!==previousNames.length||
       new Set(sourceNames.map(x=>x.toLowerCase())).size!==sourceNames.length||
       previousNames.some(n=>!sourceNames.includes(n))||
       !matching(encoder.encode(model.getValue()),prior.get('main.pjs').bytes)||
       !matching(encoder.encode(html.getValue()),prior.get('index.html').bytes))
      return fail('EXISTING_SOURCE_CHANGED');
    for(const name of previousNames){
      const bytes=await src.readFile(name);
      const raw=bytes instanceof ArrayBuffer?new Uint8Array(bytes):
        bytes instanceof Uint8Array?bytes:null;
      if(!raw||!matching(raw,prior.get(('src/'+name).toLowerCase()).bytes))
        return fail('EXISTING_SOURCE_CHANGED');
    }
    if(!(await clean(expectedPrivacy)))return fail('EXISTING_EDITOR_CHANGED');
    if(request.action==='UNLIST'){
      app.data.generator.isPrivate=true;
      let saved;
      try{saved=await app.saveGenerator();}
      catch{return fail('UNLIST_POSSIBLY_DISPATCHED');}
      if(saved===false||app.data.generator.isPrivate!==true||
         menu.saveState!=='saved'||window.__saveInFlight!==false)
        return fail('UNLIST_ACK_UNVERIFIED');
      return {ok:true,code:'UNLIST_ACK_ONLY'};
    }
    const target=manifest(request.targetFiles);
    if(request.action==='REFRESH'){
      // An S07 source refresh is *only* a controlled nonfunctional trailing
      // HTML marker. It cannot change PJS, assets, delete files or relist.
      if(typeof request.markerId!=='string'||
         !/^[A-Za-z0-9_-]{16,64}$/.test(request.markerId)||
         target.size!==prior.size||
         [...prior].some(([name,file])=>!target.has(name)||
           (name!=='index.html'&&!matching(file.bytes,target.get(name).bytes))))
        return fail('REFRESH_SCOPE_CHANGED');
      const original=textValue(prior.get('index.html').bytes);
      const changed=textValue(target.get('index.html').bytes);
      const pattern=/\n<!-- pcms-alpha-refresher:([A-Za-z0-9_-]{16,64}) -->$/;
      const suffix='\n<!-- pcms-alpha-refresher:'+request.markerId+' -->';
      const before=pattern.exec(original);
      const base=before?original.slice(0,-before[0].length):original;
      if((original.match(/<!-- pcms-alpha-refresher:/g)||[]).length>(before?1:0)||
         changed!==base+suffix||
         changed===original)
        return fail('REFRESH_MARKER_MISMATCH');
    }
    // Deletions are not optional; an old src file must never survive a
    // replacement merely because it is absent from the new manifest.
    try{
      const newNames=new Set([...target.values()].filter(x=>x.path.startsWith('src/'))
        .map(x=>x.path.slice(4)));
      // Refresher is intentionally narrower than normal I13 restore:
      // only the HTML editor value changes. Do not rewrite identical PJS or
      // assets, which could trigger collaboration edits or dirty revisions.
      if(request.action==='REFRESH'){
        html.setValue(textValue(target.get('index.html').bytes));
      }else{
        model.setValue(textValue(target.get('main.pjs').bytes));
        html.setValue(textValue(target.get('index.html').bytes));
        for(const name of previousNames){
          if(!newNames.has(name)){
            if(!solo())return fail('COLLABORATION_CHANGED_DURING_UPDATE');
            await src.deleteFile(name);
          }
        }
        for(const file of target.values())if(file.path.startsWith('src/')){
          if(!solo())return fail('COLLABORATION_CHANGED_DURING_UPDATE');
          await src.writeFile(file.path.slice(4),file.bytes);
        }
      }
    }catch{return fail('EXISTING_SOURCE_MUTATION_UNCERTAIN');}
    if(!solo()||window.__saveInFlight!==false||
       app.data.generator.name!==request.slug||
       app.data.generator.isPrivate!==expectedPrivacy||
       document.getElementById('pcms-alpha-editor-context')
         ?.dataset?.pcmsHumanIntent==='true'||
       window.saveCheckpointManager.isDivergenceBlocked()!==false)
      return fail('EXISTING_PRE_SAVE_CONTEXT_CHANGED');
    let saved;
    try{saved=await app.saveGenerator();}
    catch{return fail('EXISTING_SAVE_POSSIBLY_DISPATCHED');}
    if(saved===false||app.data.generator.isPrivate!==expectedPrivacy||
       menu.saveState!=='saved'||window.__saveInFlight!==false)
      return fail('EXISTING_SAVE_ACK_UNVERIFIED');
    return {ok:true,code:request.action+'_ACK_ONLY'};
  }catch{return fail('EXISTING_NATIVE_OUTCOME_UNVERIFIED');}
}


// S07 read-only cleanup probe. The donor may close only an exact S07-tagged
// editor after independently observing saved remote source. Unknown collab,
// human handoff, dirty/unsaved editor or different target must retain the tab.
export async function perchanceRefresherCleanMain(slug){
  const no=code=>({ok:false,code});
  try{
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
       location.origin!=='https://perchance.org'||
       location.pathname!=='/'+slug||location.hash!=='#edit')
      return no('REFRESH_CLEAN_TARGET_UNKNOWN');
    const app=window.app,src=window.srcState,model=window.modelTextEditor,
      html=window.outputTemplateEditor,menu=window.menuBar;
    if(window.__editorReady!==true||window.__saveInFlight!==false||
       window.userOwnsThisGenerator!==true||
       app?.data?.generator?.name!==slug||
       app.data.generator.isPrivate!==false||
       document.getElementById('pcms-alpha-editor-context')
         ?.dataset?.pcmsHumanIntent==='true'||
       menu?.saveState!=='saved'||model?.isClean?.()!==true||
       html?.isClean?.()!==true||
       src?.hasPending?.()!==false||
       src?.conflictPaths?.()?.length!==0||
       await src.isDirty()!==false||
       window.saveCheckpointManager?.isDivergenceBlocked?.()!==false)
      return no('REFRESH_EDITOR_NOT_CLEAN');
    if(window.editorCollabInitialSyncIsPending!==false||
       window.__collabRoomFailed===true||
       window.collabEditKeyIsIncorrect===true)
      return no('REFRESH_COLLABORATION_UNKNOWN');
    const room=window.yjsProvider,doc=window.yDoc;
    if(room){
      const states=window.yjsAwareness?.getStates?.();
      if(room.wsconnected!==true||room.synced!==true||
         room.roomname!==window.yjsProviderRoomName||
         !Number.isSafeInteger(doc?.clientID)||
         !(states instanceof Map)||states.size!==1||
         !states.has(doc.clientID))
        return no('REFRESH_COLLABORATOR_PRESENT');
    }else if(window.yjsProviderRoomName)return no('REFRESH_COLLABORATION_UNKNOWN');
    return {ok:true,source:'CLEAN_S07_EDITOR'};
  }catch{return no('REFRESH_CLEAN_PROBE_UNAVAILABLE');}
}
