// I09: fixed native Perchance editor adapter based on Discovery v3 source.
// It is injected in Firefox MAIN world ONLY under the donor's existing
// PersonaGuard lease. Current build activation gate is OFF. Never assume
// the proposed 'window.perchanceAutomation' facade exists: it does not.
export async function perchanceStageMain(request) {
  const held=code=>({ok:false,code});
  const validPath=p=>typeof p==='string'&&p.startsWith('src/')&&p.length<=240&&
    p===p.normalize('NFC')&&p.split('/').every(x=>
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(x)&&x!=='.'&&x!=='..'&&!x.endsWith('.'));
  if(location.origin!=='https://perchance.org'||!request||
     typeof request.slug!=='string'||
     !/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug)||
     location.pathname!=='/'+request.slug||location.hash!=='#edit'||
     !Array.isArray(request.files)||request.files.length<2||request.files.length>502)
    return held('EDITOR_TARGET_CHANGED');
  try {
    const app=window.app, model=window.modelTextEditor, html=window.outputTemplateEditor,
      src=window.srcState, menu=window.menuBar;
    if(window.__editorReady!==true||window.__saveInFlight===true||
       window.userOwnsThisGenerator!==true||
       !app?.data?.generator||app.data.generator.name!==request.slug||
       app.data.generator.isPrivate!==true||
       typeof app.saveGenerator!=='function'||typeof src?.ready!=='function'||
       typeof src?.list!=='function'||typeof src?.isDirty!=='function'||
       typeof src?.writeFile!=='function'||
       typeof model?.getValue!=='function'||typeof model?.setValue!=='function'||
       typeof html?.getValue!=='function'||typeof html?.setValue!=='function'||
       typeof model?.isClean!=='function'||typeof html?.isClean!=='function'||
       typeof menu?.setSaveState!=='function')
      return held('NATIVE_EDITOR_CONTRACT_UNVERIFIED');
    // Actual editor collaborate/dirty structures in Discovery v3. Never treat
    // a beforeunload prompt or HTTP 200 as clean-state evidence.
    if(window.editorCollabInitialSyncIsPending!==false||
       window.__collabRoomFailed===true||window.yjsProvider||
       window.yDoc||window.collabEditKeyIsIncorrect===true)
      return held('COLLABORATION_UNVERIFIED');
    if(typeof window.saveCheckpointManager?.isDivergenceBlocked!=='function'||
       window.saveCheckpointManager.isDivergenceBlocked()!==false||
       typeof src.conflictPaths!=='function'||src.conflictPaths().length!==0)
      return held('DIVERGENCE_OR_SOURCE_CONFLICT');
    if(typeof window.aiAgentWorkspaceSnapshot!=='function')
      return held('AI_WORKSPACE_UNVERIFIED');
    const workspace=await window.aiAgentWorkspaceSnapshot();
    if(!workspace||workspace.unavailable===true||workspace.preferWorkspace)
      return held('AI_WORKSPACE_UNVERIFIED');
    const opened=localStorage.getItem('perchanceTabsOpen');
    if(typeof opened!=='string')return held('EDITOR_TAB_REGISTRY_UNVERIFIED');
    const tabRecord=JSON.parse(opened),targetTabs=tabRecord?.[request.slug];
    if(!targetTabs||typeof targetTabs!=='object'||
       Object.keys(targetTabs).length!==1)
      return held('HUMAN_OR_AMBIGUOUS_EDITOR');
    await src.ready();
    // This I09 scope is a genuinely private NEW empty target only.
    const listing=src.list();
    const entries=listing instanceof Map?[...listing.keys()]:
      Array.isArray(listing)?listing:
      listing&&Object.getPrototypeOf(listing)===Object.prototype?Object.keys(listing):null;
    if(menu.saveState!=='saved'||model.isClean()!==true||
       html.isClean()!==true||(await src.isDirty())!==false||
       model.getValue()!==''||html.getValue()!==''||
       entries===null||entries.length!==0||
       typeof src.hasPending!=='function'||src.hasPending()!==false||
       !Number.isSafeInteger(src.fileCount)||src.fileCount!==0)
      return held('EDITOR_DIRTY_OR_NONEMPTY');
    const base=app.data.generator.srcManifest;
    if(base&&((typeof base!=='object')||Object.keys(base).length!==0))
      return held('PREVIOUS_MANIFEST_NOT_EMPTY');
    const intent=()=>document.getElementById('pcms-alpha-editor-context')
      ?.dataset.pcmsHumanIntent==='true';
    if(intent())return held('HUMAN_HANDOFF_REQUESTED');
    // Decode ALL sources before the first editor mutation. No duplicate,
    // ambiguous case, unsafe path, or malformed base64 reaches srcState.
    const materialized=new Map(),seen=new Set();
    let total=0;
    for(const file of request.files) {
      if(!file||typeof file.path!=='string'||
         !(file.path==='main.pjs'||file.path==='index.html'||validPath(file.path))||
         seen.has(file.path.toLowerCase())||typeof file.base64!=='string'||
         file.base64.length>17_000_000||
         !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64))
        return held('SOURCE_PAYLOAD_UNVERIFIED');
      seen.add(file.path.toLowerCase());
      const raw=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
      if(raw.length>12*1024*1024||(total+=raw.length)>16*1024*1024)
        return held('SOURCE_TOO_LARGE');
      materialized.set(file.path,file.path.startsWith('src/')?raw:
        new TextDecoder('utf-8',{fatal:true}).decode(raw));
    }
    if(!materialized.has('main.pjs')||!materialized.has('index.html'))
      return held('ROOT_FILES_REQUIRED');
    // Main-world helpers remain untrusted. Recheck fresh page identity and
    // CodeMirror/src clean markers immediately before local edits.
    if(intent()||window.__saveInFlight===true||window.__editorReady!==true||
       window.userOwnsThisGenerator!==true||
       app.data.generator.name!==request.slug||
       menu.saveState!=='saved'||model.isClean()!==true||
       html.isClean()!==true||(await src.isDirty())!==false||
       window.yjsProvider||window.yDoc||
       window.saveCheckpointManager.isDivergenceBlocked()!==false)
      return held('EDITOR_CHANGED');
    model.setValue(materialized.get('main.pjs'));
    html.setValue(materialized.get('index.html'));
    for(const [path,value] of materialized) {
      if(intent())return held('HUMAN_HANDOFF_REQUESTED');
      if(path.startsWith('src/'))await src.writeFile(path.slice(4),value);
    }
    if(intent())return held('HUMAN_HANDOFF_REQUESTED');
    const hasSrcAssets=[...materialized.keys()].some(path=>path.startsWith('src/'));
    if(window.yjsProvider||window.yDoc||window.__saveInFlight===true||
       window.userOwnsThisGenerator!==true||
       app.data.generator.name!==request.slug||
       menu.saveState!=='unsaved'||
       (hasSrcAssets&&(await src.isDirty())!==true)||
       window.saveCheckpointManager.isDivergenceBlocked()!==false)
      return held('SAVE_PRECONDITION_CHANGED');
    // The native save may return void or trigger confirmation under drift;
    // NEVER interpret its own return value as proof of saved source.
    let result;
    try{result=await app.saveGenerator();}
    catch{return held('SAVE_POSSIBLY_DISPATCHED');}
    if(result===false||menu.saveState!=='saved'||window.__saveInFlight===true)
      return held('SAVE_ACK_UNVERIFIED');
    return {ok:true,code:'SAVE_ACK_ONLY'};
  }catch{return held('EDITOR_OR_SAVE_UNVERIFIED');}
}
