// Read-only readiness wait for a newly created, already tagged PCMS editor.
// Never retries a mutation. A timeout preserves the tab for reconciliation.
export function nativeEditorReady(slug) {
  return location.origin==='https://perchance.org'&&location.pathname==='/'+slug&&
    location.hash==='#edit'&&window.__editorReady===true&&
    window.app?.data?.generator?.name===slug&&
    typeof window.srcState?.ready==='function'&&
    typeof window.modelTextEditor?.getValue==='function'&&
    typeof window.outputTemplateEditor?.getValue==='function';
}
export async function waitForOwnedEditor(api,{tabId,slug,cookieStoreId,nonce,validate},
  {clock=()=>performance.now(),pause=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=8000}={}) {
  const deadline=clock()+Math.min(8000,timeoutMs),url='https://perchance.org/'+slug+'#edit';
  do {
    const tab=await api.tabs.get(tabId),tag=await api.sessions.getTabValue(tabId,'pcmsI09Owned');
    // Firefox may report the newly created empty document as either complete
    // or loading before it starts the requested navigation. The exact owned
    // tag and lease still have to match; blank pages never receive injection.
    const loadingBlank=tab.url==='about:blank';
    if(tab.cookieStoreId!==cookieStoreId||(!loadingBlank&&tab.url!==url)||tag?.nonce!==nonce||
       tag.humanIntent===true||!(await validate()))return {ok:false,code:'EDITOR_READINESS_CONTEXT_CHANGED'};
    try {
      // Firefox can return the transient empty document just after tabs.create.
      // Wait under the same lease, but never inject or dispatch into that page.
      if(loadingBlank){await pause(100);continue;}
      const r=await api.scripting.executeScript({target:{tabId,frameIds:[0]},world:'MAIN',
        func:nativeEditorReady,args:[slug]});
      if(r?.length===1&&r[0].frameId===0&&!r[0].error&&r[0].result===true) {
        if(!(await validate()))return {ok:false,code:'EDITOR_READINESS_LEASE_CHANGED'};
        return {ok:true};
      }
    } catch { /* A loading document may reject injection; no effect was attempted. */ }
    if(clock()>=deadline)break;
    await pause(100);
  } while(clock()<deadline);
  return {ok:false,code:'EDITOR_LOAD_TIMEOUT_RECONCILE'};
}
