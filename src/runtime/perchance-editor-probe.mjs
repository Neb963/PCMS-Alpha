// I09 fixed read-only native editor probe. Executed in the MAIN world
// exclusively on an exact PCMS session-tagged Firefox tab. No page-supplied
// privileged commands, source content or session tokens leave the page.
export async function perchanceEditorProbe(slug) {
  const hold=code=>({ok:false,code});
  if(location.origin!=='https://perchance.org'||location.pathname!=='/'+slug||
     location.hash!=='#edit')return hold('EDITOR_TARGET_CHANGED');
  try{
    const app=window.app,model=window.modelTextEditor,
      html=window.outputTemplateEditor,src=window.srcState,menu=window.menuBar;
    if(window.__editorReady!==true||!app?.data?.generator||
       app.data.generator.name!==slug||app.data.generator.isPrivate!==true||
       window.userOwnsThisGenerator!==true||
       typeof model?.isClean!=='function'||typeof html?.isClean!=='function'||
       typeof src?.isDirty!=='function'||typeof menu?.saveState!=='string')
      return hold('EDITOR_CONTRACT_UNVERIFIED');
    if(window.editorCollabInitialSyncIsPending!==false||
       window.__collabRoomFailed===true||window.yjsProvider||window.yDoc||
       typeof window.saveCheckpointManager?.isDivergenceBlocked!=='function'||
       window.saveCheckpointManager.isDivergenceBlocked()!==false||
       typeof src.conflictPaths!=='function'||src.conflictPaths().length!==0)
      return hold('COLLABORATION_UNVERIFIED');
    const host=document.getElementById('pcms-alpha-editor-context');
    if(host?.dataset.pcmsHumanIntent==='true')return hold('HUMAN_HANDOFF_REQUESTED');
    const isDirty=await src.isDirty();
    if(isDirty!==false||model.isClean()!==true||html.isClean()!==true||
       window.__saveInFlight!==false||menu.saveState!=='saved')
      return hold('EDITOR_UNKNOWN');
    // A beforeunload warning, tab ID or save response never establishes this.
    return {ok:true,source:'NATIVE_EDITOR_CLEAN_OBSERVATION',
      slug,clean:true,collaboration:'ABSENT_AT_OBSERVATION'};
  }catch{return hold('EDITOR_UNKNOWN');}
}
