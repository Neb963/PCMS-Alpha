// Injected into the PCMS-tagged editor tab (ISOLATED world).
// UI is advisory; backend tab tag + canonical journal alone authorize handoff.
export function renderPcmsEditorStrip({slug,nonce,accountId,personaUid}) {
  if(location.origin!=='https://perchance.org'||
     location.pathname!=='/'+slug||location.hash!=='#edit')return;
  const existing=document.getElementById('pcms-alpha-editor-context');
  if(existing)return;
  const host=document.createElement('aside');
  host.id='pcms-alpha-editor-context';
  host.setAttribute('role','region');
  host.setAttribute('aria-label','PCMS editor context');
  host.style.cssText='position:sticky;top:0;z-index:2147483640;box-sizing:border-box;background:Canvas;color:CanvasText;border:2px solid #737373;padding:8px;font:13px system-ui;display:block;max-width:100%;';
  const details=document.createElement('details');
  details.open=false;
  const summary=document.createElement('summary');
  summary.textContent='PCMS · '+slug+' · held until saved-byte verification';
  const data=document.createElement('p');
  data.textContent='Account '+accountId+' · Persona '+personaUid+
    ' · PCMS-managed private candidate; dirty/unknown editor blocks changes.';
  const status=document.createElement('p');
  status.setAttribute('role','status');status.textContent='Handoff not requested.';
  const button=document.createElement('button');
  button.type='button';button.textContent='Take human ownership (keep tab)';
  button.addEventListener('click',()=>{
    button.disabled=true;status.textContent='Persisting human handoff…';
    try{
      const port=browser.runtime.connect({name:'pcms-i09-editor-handoff'});
      port.onMessage.addListener(v=>{
        status.textContent=v?.ok&&v.state==='HUMAN_OWNED'?
          'Human ownership recorded. PCMS must not close or edit this tab.':
          'Ownership uncertain: tab retained; PCMS editing held.';
        try{port.disconnect();}catch{}
      });
      port.onDisconnect.addListener(()=>{
        if(status.textContent==='Persisting human handoff…')
          status.textContent='Handoff unknown; tab retained, no automatic cleanup.';
      });
      port.postMessage({slug,nonce});
    }catch{status.textContent='Handoff unknown; tab retained.';}
  });
  details.append(summary,data,button,status);host.append(details);
  (document.body||document.documentElement).prepend(host);
}
