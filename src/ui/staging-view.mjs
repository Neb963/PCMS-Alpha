// I09 operator-only private source inspector. No source bytes, credentials,
// provider tokens or browser tab identities are rendered or retained.
const el=id=>document.getElementById(id);
const slug=el('pcms-stage-slug'),token=el('pcms-stage-token');
const status=el('pcms-stage-status'),diff=el('pcms-stage-diff');
const queue=el('pcms-stage-queue');
const pin=el('pcms-stage-pin'),clear=el('pcms-stage-clear');
const start=el('pcms-stage-start'),arm=el('pcms-stage-arm'),reconcile=el('pcms-stage-reconcile');
const handoff=el('pcms-stage-handoff'),refresh=el('pcms-stage-refresh');
let selected=null,busy=false,seq=0;
function command(type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i09-staging'});
    let settled=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),70000);
    function finish(result,error){
      if(settled)return;settled=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      error?reject(error):resolve(result);
    }
    port.onMessage.addListener(result=>finish(result));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function controls(){
  const found=selected?.ok===true&&selected.slug===slug.value;
  pin.disabled=busy||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug.value)||
    token.value.length<10;
  clear.disabled=busy;
  refresh.disabled=busy;
  const disposable=/^pcms-test-[a-z0-9-]{8,88}$/.test(slug.value);
  arm.disabled=busy||!found||selected.state!=='PINNED'||!disposable;
  start.disabled=busy||!found||selected.state!=='PINNED'||token.value.length<10||!disposable;
  reconcile.disabled=busy||!found||
    !['DISPATCH_POSSIBLE','HELD_UNCERTAIN','SAVED_UNVERIFIED'].includes(selected.state);
  handoff.disabled=busy||!found||selected.state==='HUMAN_OWNED'||
    selected.state==='HANDOFF_REQUESTED';
}
function render(receipt){
  if(receipt?.ok!==true)return;
  selected=receipt;
  diff.replaceChildren();
  const heading=document.createElement('p');
  heading.textContent=receipt.slug+' · '+receipt.state+
    ' · source '+receipt.candidateFingerprint.slice(0,16)+
    ' · prior '+receipt.priorFingerprint.slice(0,16);
  diff.append(heading);
  const list=document.createElement('ul');
  for(const d of receipt.diff||[]){
    const item=document.createElement('li');
    item.textContent=d.kind+' · '+d.path;list.append(item);
  }
  if(!list.childNodes.length){const p=document.createElement('p');p.textContent='No byte changes in candidate.';diff.append(p);}
  else diff.append(list);
  controls();
}
function announce(s){status.textContent=s;}
async function refreshQueue(){
  const own=seq;
  try{
    const result=await command('LIST_STAGES');
    if(own!==seq)return;
    queue.replaceChildren();
    if(!result?.ok){queue.textContent='Stage records unavailable; no outcome inferred.';return;}
    if(!result.items.length){queue.textContent='No private candidates pinned.';return;}
    const list=document.createElement('ul');
    for(const r of result.items){
      const li=document.createElement('li'),button=document.createElement('button');
      button.type='button';button.textContent='Inspect '+r.slug;
      button.addEventListener('click',()=>{
        slug.value=r.slug;selected=r;render(r);
        announce(r.slug+' · '+r.state+' · '+(r.reason||'Canonical journal receipt')+'.');
      });
      const summary=document.createElement('span');
      summary.textContent=' '+r.state+' · '+(r.reason||'No external success claimed');
      li.append(button,summary);list.append(li);
    }
    queue.append(list);
    if(result.truncated)queue.append(document.createTextNode(' More records omitted.'));
  }catch{if(own===seq)queue.textContent='Stage journal unavailable; preserve existing holds.';}
}
async function invoke(type,params,description){
  if(busy)return;
  const own=++seq;busy=true;controls();announce(description);
  try{
    const result=await command(type,params);
    if(own!==seq)return;
    if(result?.ok){
      if(result.candidateFingerprint)render(result);
      else if(result.state==='HUMAN_OWNED'&&selected)selected={...selected,state:'HUMAN_OWNED'};
      announce(type==='PIN_STAGE'?'Pinned immutable READY and exact previous source. No remote write.':
        type==='ARM_DISPOSABLE_STAGE'?'Disposable private stage armed for one step (expires after 2 minutes). Paste Git read token and Stage.':
        type==='STAGE_PRIVATE'?'Saved acknowledgment only; independent byte reconciliation required.':
        type==='RECONCILE_STAGE'?'Independent full saved-byte readback confirmed. No publication.':
        'Durable handoff recorded; tab retained and PCMS mutation held.');
    }else{
      announce((result?.code||'UNKNOWN')+
        ' · held without fallback, blind retry or a claimed remote result.');
    }
  }catch{if(own===seq)announce('Command disconnected or timed out. Outcome unknown; inspect persisted journal before further action.');}
  finally{if(own===seq){busy=false;controls();await refreshQueue();}}
}
pin.addEventListener('click',()=>{
  const t=token.value;token.value='';
  invoke('PIN_STAGE',{slug:slug.value,token:t},
    'Rechecking Git HEAD/READY, current protected owner and empty private source…');
});
arm.addEventListener('click',()=>{if(!selected||!/^pcms-test-[a-z0-9-]{8,88}$/.test(selected.slug))return;
  const expected='STAGE '+selected.slug;
  const confirmation=window.prompt('Type '+expected+' to authorize ONE guarded private staging write (no public listing, no retry):','');
  if(confirmation===null)return;
  if(confirmation!==expected){announce('Confirmation mismatch. No remote action.');return;}
  invoke('ARM_DISPOSABLE_STAGE',{slug:selected.slug,expectedRevision:selected.revision,confirmation},
    'Checking exact pinned target, owner, protected Persona route and restore state…');
});
start.addEventListener('click',()=>{if(!selected)return;
  const t=token.value;token.value='';
  if(window.confirm('Stage private '+selected.slug+' once? A lost reply is uncertain; reconcile rather than retry.'))
    invoke('STAGE_PRIVATE',{slug:selected.slug,token:t,
      expectedRevision:selected.revision},
      'Revalidating current READY, guard and durable stage intent…');
});
reconcile.addEventListener('click',()=>selected&&invoke('RECONCILE_STAGE',{
  slug:selected.slug,expectedRevision:selected.revision
},'Independent guarded saved-byte readback, no remote retry…'));
handoff.addEventListener('click',()=>selected&&invoke('HANDOFF_STAGE',{
  slug:selected.slug,expectedRevision:selected.revision
},'Persisting human takeover before tab ownership release…'));
clear.addEventListener('click',()=>{token.value='';controls();});
refresh.addEventListener('click',()=>{seq++;refreshQueue();});
slug.addEventListener('input',()=>{
  seq++;selected=null;diff.textContent='Select an exact pinned source receipt.';
  announce('Selection changed; no previous target receipt is trusted.');controls();
});
token.addEventListener('input',controls);
controls();refreshQueue();
