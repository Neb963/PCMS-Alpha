// I07 explicit, revision-scoped source preservation. Remote effects stay OFF.
const el=id=>document.getElementById(id);
const name=el('pcms-adopt-name'),visibility=el('pcms-adopt-visibility');
const consent=el('pcms-adopt-consent'),capture=el('pcms-adopt-capture');
const feedback=el('pcms-adopt-status'),receipts=el('pcms-adopt-receipts');
const archive=el('pcms-adopt-local-archive');
const gitToken=el('pcms-adopt-git-token'),gitWrite=el('pcms-adopt-git-write');
const gitRecheck=el('pcms-adopt-git-recheck'),gitClear=el('pcms-adopt-git-clear');
const gitCancel=el('pcms-adopt-git-cancel');
let chosen=null,busy=false,generation=0,last=null;
function port(type,params={}){
  return new Promise((resolve,reject)=>{
    const p=browser.runtime.connect({name:'pcms-i07-adoption'});
    let done=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),65000);
    function finish(result,error){
      if(done)return;done=true;clearTimeout(timer);
      try{p.disconnect();}catch{}
      error?reject(error):resolve(result);
    }
    p.onMessage.addListener(data=>finish(data));
    p.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{p.postMessage({type,params:Object.fromEntries(Object.entries(params||{}).filter(([k,v])=>!(['token','passphrase'].includes(k)&&v==='')))});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function controls(){
  capture.disabled=busy||!chosen||chosen.ownerState!=='OBSERVED_OWNER'||
    // Choosing Capture is itself the explicit per-generator consent; with the
    // standing development grant PCMS also adopts owned generators itself.
    !['PUBLIC','UNLISTED'].includes(chosen.visibility);
  archive.disabled=busy||!last?.ok||last.archived===true;
  consent.disabled=busy||!chosen||chosen.visibility!=='PUBLIC';
  const pending=last?.ok&&!last.archived;
  gitWrite.disabled=busy||!pending||last.archive!=='ARCHIVE_PENDING';
  gitRecheck.disabled=busy||!pending||
    !['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(last.archive);
  gitClear.disabled=true;
  gitCancel.disabled=busy||!pending||last.archive!=='GIT_PREPARED';
}
function announce(v){feedback.textContent=v;}
async function refresh(){
  const seq=generation;
  try{
    const result=await port('LIST_ADOPTIONS');
    if(seq!==generation)return;
    receipts.replaceChildren();
    if(!result?.ok){receipts.textContent='Canonical adoption history unavailable.';return;}
    if(!result.items.length){receipts.textContent='No original source captured yet.';return;}
    const list=document.createElement('ul');
    for(const item of result.items){
      const li=document.createElement('li');
      li.textContent=item.slug+' · '+item.visibility+' · '+item.management+
        ' · original '+(item.originalFingerprint||'UNKNOWN').slice(0,16)+
        ' · '+item.archive+' · provider changes OFF';
      list.append(li);
    }
    receipts.append(list);
    if(result.truncated)receipts.append(document.createTextNode('History truncated.'));
  }catch{if(seq===generation)receipts.textContent='Adoption history unavailable; no state inferred.';}
}
window.addEventListener('pcms-adoption-target',async event=>{
  const d=event.detail;
  if(!d||typeof d.slug!=='string'||!Number.isSafeInteger(d.revision))return;
  const seq=++generation;
  chosen=d;last=null;consent.checked=false;gitToken.value='';
  name.value=d.slug+' · inventory rev '+d.revision;
  visibility.textContent=d.visibility==='PUBLIC'?
    'Public source: Capture preserves its exact original bytes; nothing on Perchance changes.':
    d.visibility==='UNLISTED'?
    'Unlisted source: guarded original capture; no publication authority.':
    'Owner or visibility unverified; capture held.';
  announce('Checking existing local adoption; no provider write.');
  controls();
  try{
    const result=await port('GET_ADOPTION',{slug:d.slug});
    if(seq!==generation)return;
    if(result?.ok){last=result;announce('Already captured original '+result.originalFingerprint.slice(0,16)+
      '. Immutable baseline preserved. '+result.archive+'.');}
    else announce('No verified original record ('+(result?.code||'UNKNOWN')+
      '). Capture requires guarded independent source reads.');
  }catch{if(seq===generation)announce('Local adoption state unavailable; capture not confirmed.');}
  finally{controls();}
});
consent.addEventListener('change',controls);
gitToken.disabled=true;
gitToken.placeholder='Credential retrieved from connected Git vault';
gitClear.addEventListener('click',()=>{
  gitToken.value='';controls();
  announce('Git credential is managed by the connected operating-system vault.');
});
async function githubArchive(type){
  if(busy||!chosen||!last?.ok)return;
  busy=true;controls();const seq=generation;
  gitToken.value='';
  announce(type==='ARCHIVE_GIT'?
    'Journaling before Git commit; response may be uncertain.':'Independent remote Git archive byte readback…');
  try{
    const result=await port(type,{slug:chosen.slug,
      expectedRevision:last.revision});
    if(seq!==generation)return;
    if(!result?.ok)announce('Git archive held ('+(result?.code||'UNVERIFIED')+
      '). Never blindly retry after possible ref movement; use Reconcile after refreshing canonical receipt.');
    else announce('Verified original Git archive; source unchanged, NOT READY, no release approval.');
    const recent=await port('GET_ADOPTION',{slug:chosen.slug});
    if(seq===generation)last=recent?.ok?recent:last;
    await refresh();
  }catch{
    if(seq===generation){
      announce('Git acknowledgment unknown; re-select the generator and use independent Reconcile before any new write.');
      try{const recent=await port('GET_ADOPTION',{slug:chosen.slug});
        if(seq===generation&&recent?.ok)last=recent;}catch{}
    }
  }finally{busy=false;controls();}
}
gitCancel.addEventListener('click',async()=>{
  if(gitCancel.disabled||!chosen||!last)return;
  busy=true;controls();const seq=generation;
  announce('Cancelling only a pre-dispatch journal entry; no Git requests.');
  try{
    const out=await port('ABORT_GIT_PREPARED',{
      slug:chosen.slug,expectedRevision:last.revision});
    if(seq!==generation)return;
    announce(out?.ok?'Pre-dispatch archive intent safely cancelled. No remote ref was attempted.':
      'Cancellation held: '+(out?.code||'UNVERIFIED')+'. Resolve before retry.');
    const next=await port('GET_ADOPTION',{slug:chosen.slug});
    if(seq===generation&&next?.ok)last=next;
    await refresh();
  }catch{if(seq===generation)announce('Cancellation unknown. Re-select to read canonical state.');}
  finally{busy=false;controls();}
});
gitWrite.addEventListener('click',()=>{if(!gitWrite.disabled)void githubArchive('ARCHIVE_GIT');});
gitRecheck.addEventListener('click',()=>{if(!gitRecheck.disabled)void githubArchive('RECHECK_GIT');});
capture.addEventListener('click',async()=>{
  if(capture.disabled||!chosen)return;
  busy=true;controls();const seq=generation,d={...chosen};
  announce('Guarded owner and source double-read; checking exact bytes and canonical revision…');
  try{
    const r=await port('CAPTURE_ADOPTION',{slug:d.slug,expectedRevision:d.revision,
      explicitPublicConsent:d.visibility==='PUBLIC'});
    if(seq!==generation)return;
    if(!r?.ok){announce('Source HELD: '+(r?.code||'ORIGINAL_UNVERIFIED')+
      '. Existing Perchance code and history were not changed.');return;}
    last=r;
    announce((r.duplicate?'Existing immutable source preserved. ':'Original saved locally. ')+
      'Fingerprint '+r.originalFingerprint.slice(0,16)+
      '. Git archive '+r.archive+'. Provider writes and publishing OFF.');
    await refresh();
  }catch{
    if(seq===generation)announce('Acknowledgment unavailable. Re-select target to inspect canonical record before retrying.');
  }finally{busy=false;controls();}
});
archive.addEventListener('click',async()=>{
  if(archive.disabled||!last?.ok||!chosen)return;
  // Local tombstone is deliberately explicit; no remote deletion occurs.
  busy=true;controls();const seq=generation;
  try{
    const r=await port('ARCHIVE_LOCAL',{slug:chosen.slug,expectedRevision:last.revision});
    if(seq!==generation)return;
    if(r?.ok){last=r;announce('Local tombstone retained with immutable original source. No remote deletion.');await refresh();}
    else announce('Archive HELD: '+(r?.code||'UNVERIFIED'));
  }catch{if(seq===generation)announce('Archive acknowledgement unknown. Re-read canonical record.');}
  finally{busy=false;controls();}
});
window.addEventListener('hashchange',()=>{if(location.hash==='#work-queue')void refresh();});
controls();void refresh();
