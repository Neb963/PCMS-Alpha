// Fixed I09 MAIN-world source application. Inject only into a fresh PCMS
// tagged tab selected by the same-XPI donor lease host. This function cannot
// access GitHub credentials, native routes, other generator targets or tabs.
// All unknown editor/collaboration states hold WITHOUT touching a buffer.
export async function perchanceStageMain(request) {
  const hold=code=>({ok:false,code});
  const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
  if(location.origin!=='https://perchance.org'||!request||
     !SLUG.test(request.slug)||location.pathname!=='/'+request.slug||
     location.hash!=='#edit'||!Array.isArray(request.files)||
     request.files.length<2||request.files.length>502)
    return hold('EDITOR_TARGET_CHANGED');
  try{
    // This API contract comes from Discovery v3. An unavailable version or
    // unproven editor/collaboration signal is an ACTIVATION HOLD, not clean.
    const p=window.perchanceAutomation;
    if(!p||typeof p.ready!=='function'||!p.session||
       !p.generator?.get||!p.generator?.save||
       !p.editor?.setPjs||!p.editor?.setHtml||
       !p.src?.list||!p.src?.isDirty||!p.src?.write||!p.src?.delete)
      return hold('EDITOR_CONTRACT_UNAVAILABLE');
    const timeout=ms=>new Promise((_,reject)=>setTimeout(()=>reject(Error('EDITOR_TIMEOUT')),ms));
    await Promise.race([p.ready(12000),timeout(13000)]);
    const status=await p.session();
    if(status?.generatorName!==request.slug||status.isOwner!==true||
       status.canSave!==true||status.saveState!=='saved')
      return hold('EDITOR_OWNER_OR_SAVE_UNVERIFIED');
    const pjs=window.modelTextEditor,html=window.outputTemplateEditor;
    if(!pjs||!html||typeof pjs.isClean!=='function'||
       typeof html.isClean!=='function'||pjs.isClean()!==true||
       html.isClean()!==true||(await p.src.isDirty())!==false)
      return hold('EDITOR_UNKNOWN');
    // Discovery did NOT establish an authoritative collaboration-free signal.
    // Merely lacking a collab URL, beforeunload prompt or open socket does not
    // prove no human collaborator. A separately verified adapter must supply
    // an unambiguous noncollaborative editor receipt before mutations unlock.
    if(typeof p.collaborationStatus!=='function'||
       (await p.collaborationStatus())!=='ABSENT')
      return hold('COLLABORATION_UNVERIFIED');
    const initial=await p.generator.get(request.slug);
    if(initial?.name!==request.slug||initial.isPrivate!==true||
       initial.modelText!==''||initial.outputTemplate!==''||
       !initial.srcManifest||typeof initial.srcManifest!=='object'||
       Object.keys(initial.srcManifest).length!==0)
      return hold('PREVIOUS_SOURCE_NOT_EMPTY');
    const current=await p.src.list();
    if(!current||Object.keys(current).length!==0)return hold('SRC_EDITOR_NOT_EMPTY');
    if(pjs.isClean()!==true||html.isClean()!==true||
       (await p.src.isDirty())!==false)return hold('EDITOR_CHANGED');
    if((await p.session())?.generatorName!==request.slug ||
       (await p.session())?.saveState!=='saved')return hold('EDITOR_CHANGED');

    const paths=new Set(),files=new Map();
    for(const f of request.files){
      if(!f||typeof f.path!=='string'||paths.has(f.path.toLowerCase())||
         !/^(main\.pjs|index\.html|src\/[A-Za-z0-9._/-]+)$/.test(f.path)||
         typeof f.base64!=='string'||f.base64.length>17_000_000)
        return hold('SOURCE_PAYLOAD_UNVERIFIED');
      paths.add(f.path.toLowerCase());files.set(f.path,f);
    }
    if(!files.has('main.pjs')||!files.has('index.html'))
      return hold('SOURCE_ROOT_MISSING');
    // Materialize *before* the first edit, so corrupted payloads cannot
    // create partially changed local source. The outer verifier already
    // pinned SHA-256 of all bytes; the authoritative readback comes later.
    const decoded=new Map();
    for(const [path,file] of files){
      const raw=atob(file.base64);
      const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      decoded.set(path,path.startsWith('src/')?bytes:
        new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }
    // Last-moment owner and dirty recheck. Save response is never COMPLETE.
    if((await p.src.isDirty())!==false||
       pjs.isClean()!==true||html.isClean()!==true||
       (await p.session())?.saveState!=='saved')return hold('EDITOR_CHANGED');
    await p.editor.setPjs(decoded.get('main.pjs'));
    await p.editor.setHtml(decoded.get('index.html'));
    for(const [path,bytes] of decoded){
      if(path.startsWith('src/'))await p.src.write(path.slice(4),bytes);
    }
    let response;
    try{response=await p.generator.save({includeSrc:true});}
    catch{return hold('SAVE_POSSIBLY_DISPATCHED');}
    if(!response||!['saved','created'].includes(response.status)||
       response.name!==request.slug)
      return hold('SAVE_ACK_UNVERIFIED');
    return {ok:true,code:'SAVE_ACK_ONLY'};
  }catch{return hold('EDITOR_OR_SAVE_UNVERIFIED');}
}
