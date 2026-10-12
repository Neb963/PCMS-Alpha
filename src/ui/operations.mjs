// Read-only journal projection and revision-fenced local notification ignore.
// Ignoring a notice NEVER releases its actual safety hold or retries work.
const journalStatus=document.getElementById('pcms-journal-health');
const queue=document.getElementById('pcms-work-queue-summary');
const attention=document.getElementById('pcms-attention-list');
let generation=0;
function command(message) {
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i02-canonical-readonly'});
    let settled=false;
    const timer=setTimeout(()=>finish(null,Error('timeout')),3500);
    function finish(value,error){
      if(settled)return;
      settled=true;clearTimeout(timer);
      try{port.disconnect()}catch{}
      if(error)reject(error);else resolve(value);
    }
    port.onMessage.addListener(value=>finish(value));
    port.onDisconnect.addListener(()=>finish(null,Error('disconnected')));
    port.postMessage(message);
  });
}
async function read() {
  const mine=++generation;
  const state=await command({type:'SUMMARY'});
  if(mine!==generation)return;
  if(state?.ok!==true || state?.providerEffects!=='OFF')throw Error('unsafe status');
  journalStatus.textContent=state.storage==='READY'
    ? 'Canonical IndexedDB available. Restore: '+state.restore+'. All remote effects OFF.'
    : 'Canonical store unavailable; global PCMS operation hold. Restore: '+state.restore;
  const c=state.states||{};
  queue.textContent=state.storage==='READY'
    ? 'Persisted status counts: Prepared '+(c.PREPARED||0)+
      ', possible '+(c.DISPATCH_POSSIBLE||0)+
      ', uncertain '+(c.HELD_UNCERTAIN||0)+
      ', confirmed '+(c.CONFIRMED||0)+'. No provider work admitted or dispatched.'
    : 'Canonical journal inaccessible. Operation outcomes unknown; no retry allowed.';
  if(state.storage!=='READY'||state.held) {
    attention.textContent='Safety hold active or unverified. Local notices may be unavailable.';
    return;
  }
  const list=await command({type:'GET_NOTICES'});
  if(mine!==generation)return;
  if(!list?.ok){attention.textContent='Attention record listing unavailable.';return;}
  attention.replaceChildren();
  if(!list.notices.length){
    attention.textContent='No locally recorded notices. This does not prove external health.';
    return;
  }
  for(const n of list.notices){
    const row=document.createElement('p');
    const text=document.createElement('span');
    text.textContent=n.severity+' — '+n.code+' ('+n.scopeId+', revision '+n.revision+'). ';
    const button=document.createElement('button');
    button.type='button';button.textContent='Ignore notice';
    button.setAttribute('aria-label','Ignore local notice for '+n.scopeId);
    button.addEventListener('click',async()=>{
      button.disabled=true;button.textContent='Saving…';
      try{
        const out=await command({type:'IGNORE_NOTICE',notice:{
          scopeId:n.scopeId,code:n.code,expectedRevision:n.revision
        }});
        if(!out?.ok || out.holdReleased!==false)throw Error('not committed');
        await read();
        attention.focus({preventScroll:true});
      }catch{
        button.disabled=false;button.textContent='Retry ignore';
        // A failed acknowledgement is never portrayed as successful.
        journalStatus.textContent='Ignore not confirmed. Refresh canonical status before retry.';
      }
    });
    row.append(text,button);
    attention.append(row);
  }
  if(list.truncated){
    const p=document.createElement('p');
    p.textContent='Additional local notices omitted. Open diagnostics if Core is unavailable.';
    attention.append(p);
  }
}
try{await read();}catch{
  journalStatus.textContent='Journal health unavailable; treat PCMS work as held.';
  queue.textContent='Could not obtain a journal snapshot. Outcomes unknown; do not retry.';
  attention.textContent='Attention status unavailable.';
}
