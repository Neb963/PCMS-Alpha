// I07 explicit, revision-scoped source preservation. Remote effects stay OFF.
const el=id=>document.getElementById(id);
const name=el('pcms-adopt-name'),visibility=el('pcms-adopt-visibility');
const consent=el('pcms-adopt-consent'),capture=el('pcms-adopt-capture');
const feedback=el('pcms-adopt-status'),receipts=el('pcms-adopt-receipts');
const archive=el('pcms-adopt-local-archive');
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
    try{p.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function controls(){
  capture.disabled=busy||!chosen||chosen.ownerState!=='OBSERVED_OWNER'||
    !['PUBLIC','UNLISTED'].includes(chosen.visibility)||
    (chosen.visibility==='PUBLIC'&&!consent.checked);
  archive.disabled=busy||!last?.ok||last.archived===true;
  consent.disabled=busy||!chosen||chosen.visibility!=='PUBLIC';
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
  chosen=d;last=null;consent.checked=false;
  name.value=d.slug+' · inventory rev '+d.revision;
  visibility.textContent=d.visibility==='PUBLIC'?
    'Public source: explicit adoption consent required. Captured bytes are preserved locally; archive is pending.':
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
capture.addEventListener('click',async()=>{
  if(capture.disabled||!chosen)return;
  busy=true;controls();const seq=generation,d={...chosen};
  announce('Guarded owner and source double-read; checking exact bytes and canonical revision…');
  try{
    const r=await port('CAPTURE_ADOPTION',{slug:d.slug,expectedRevision:d.revision,
      explicitPublicConsent:d.visibility==='PUBLIC'&&consent.checked});
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
