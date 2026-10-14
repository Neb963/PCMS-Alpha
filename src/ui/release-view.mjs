// I13 Work Queue inspector: fingerprints and test provenance, never source
// bytes or credentials. Pending and disconnected outcomes never claim publish.
const slug=document.getElementById('pcms-release-slug');
const token=document.getElementById('pcms-release-token');
const passphrase=document.getElementById('pcms-existing-passphrase');
const previewBtn=document.getElementById('pcms-release-preview');
const approveBtn=document.getElementById('pcms-release-approve');
const dispatchBtn=document.getElementById('pcms-release-dispatch');
const armBtn=document.getElementById('pcms-release-arm');
const cancelBtn=document.getElementById('pcms-release-cancel');
const reconcileBtn=document.getElementById('pcms-release-reconcile');
const loadBtn=document.getElementById('pcms-release-load');
const clearBtn=document.getElementById('pcms-release-clear');
const status=document.getElementById('pcms-release-status');
const details=document.getElementById('pcms-release-diff');
let snapshot=null,receipt=null,active=false,sequence=0;
const valid=s=>/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
function command(type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i13-release'});
    let done=false;
    const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),70000);
    function finish(v,e){
      if(done)return;done=true;clearTimeout(timeout);
      try{port.disconnect();}catch{}
      e?reject(e):resolve(v);
    }
    port.onMessage.addListener(v=>finish(v));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function note(s){status.textContent=s;}
function controls(){
  const target=valid(slug.value),hasToken=token.value.length>=12;
  previewBtn.disabled=active||!target||!hasToken;
  loadBtn.disabled=active||!target;
  clearBtn.disabled=active;
  approveBtn.disabled=active||!snapshot||snapshot.slug!==slug.value||!hasToken;
  cancelBtn.disabled=active||!receipt||receipt.slug!==slug.value||
    receipt.state!=='APPROVED';
  armBtn.disabled=active||!receipt||receipt.slug!==slug.value||
    receipt.state!=='APPROVED'||!/^pcms-test-[a-z0-9-]{8,88}$/.test(receipt.slug);
  dispatchBtn.disabled=active||!receipt||receipt.slug!==slug.value||
    receipt.state!=='APPROVED'||!hasToken;
  reconcileBtn.disabled=active||!receipt||receipt.slug!==slug.value||!hasToken||
    !['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(receipt.state);
}
function renderPreview(v){
  details.replaceChildren();
  if(!v?.ok)return;
  const head=document.createElement('p');
  head.textContent='Exact F: '+v.sourceFingerprint+' · Previous: '+
    v.previousFingerprint+' · Git HEAD: '+v.gitHead;
  details.append(head);
  const title=document.createElement('h3');
  title.textContent='Full approved-file manifest';
  details.append(title);
  const list=document.createElement('ul');
  for(const f of v.files||[]){
    const item=document.createElement('li');
    item.textContent=f.path+' · '+f.size+' bytes · SHA-256 '+f.sha256;
    list.append(item);
  }
  details.append(list);
  const diff=document.createElement('p');
  diff.textContent=(v.diff||[]).map(f=>f.kind+' '+f.path).join(' · ')||
    'No changes relative to sealed previous bytes.';
  details.append(diff);
  const warning=document.createElement('p');
  warning.textContent='Approve only this exact generator and F. Any test, owner, READY, '+
    'editor or byte drift must block dispatch. Approval is not publication.';
  details.append(warning);
  const tests=document.createElement('p');
  tests.textContent='Actual test attribution: '+v.tests?.state+
    ' · Default prompt revision '+v.promptRevision+
    ' · TESTING.md '+(v.testingSha||'not configured');
  details.append(tests);
  const assertions=document.createElement('ul');
  for(const t of [...(v.tests?.default||[]),...(v.tests?.optional||[])]){
    const item=document.createElement('li');
    item.textContent=t.name+' — '+t.result+' on exact saved F';
    assertions.append(item);
  }
  details.append(assertions);
  const header=document.createElement('p');
  header.textContent='Inspect full source bytes. Select each path, then page through all 8 KiB chunks. Binary shown in hex; no source leaves the extension.';
  details.append(header);
  const paths=[...new Set([...(v.files||[]),...(v.priorFiles||[])].map(x=>x.path))].sort();
  const sourceSelector=document.createElement('select');
  sourceSelector.setAttribute('aria-label','Exact source file for byte-by-byte review');
  for(const path of paths) {
    const item=document.createElement('option');item.value=path;item.textContent=path;
    sourceSelector.append(item);
  }
  details.append(sourceSelector);
  const panes=document.createElement('div');
  const createPane=origin=>{
    const wrap=document.createElement('section');
    const label=document.createElement('p');
    label.textContent=origin==='F'?'Final candidate F':'Previous-good P';
    wrap.append(label);
    const controls=document.createElement('div');controls.className='account-controls';
    const previous=document.createElement('button');previous.type='button';
    previous.textContent='Previous 8 KiB';
    const next=document.createElement('button');next.type='button';
    next.textContent='Next 8 KiB';
    const code=document.createElement('pre');code.setAttribute('tabindex','0');
    code.setAttribute('aria-label',label.textContent+' (exact bytes)');
    code.style.overflow='auto';code.style.maxHeight='340px';
    let offset=0,busy=false;
    const load=async n=>{
      if(busy||!snapshot||snapshot!==v)return;
      busy=true;previous.disabled=true;next.disabled=true;
      code.textContent='Reading canonical bytes…';
      try{
        const out=await command('GET_REVIEW_CHUNK',{
          slug:v.slug,stageRevision:v.stageRevision,
          fingerprint:v.sourceFingerprint,origin,
          path:sourceSelector.value,offset:n});
        if(snapshot!==v)return;
        if(!out?.ok){code.textContent=out?.code||'SOURCE_REVIEW_HELD';return;}
        offset=out.offset;
        const bytes=Uint8Array.from(atob(out.base64),c=>c.charCodeAt(0));
        let view;
        if(out.path==='main.pjs'||out.path==='index.html'){
          try{view=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
          catch{view=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join(' ');}
        }else view=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join(' ');
        code.textContent=out.path+' · '+out.offset+'–'+(out.offset+out.length)+
          ' of '+out.total+' bytes · SHA-256 '+out.fileSha256+'\n'+view;
        previous.disabled=offset===0;next.disabled=out.nextOffset===null;
      }catch{
        code.textContent='Review unavailable; canonical source may be stale.';
      }finally{busy=false;}
    };
    previous.addEventListener('click',()=>load(offset-8192));
    next.addEventListener('click',()=>load(offset+8192));
    sourceSelector.addEventListener('change',()=>load(0));
    controls.append(previous,next);wrap.append(controls,code);
    panes.append(wrap);
    return ()=>load(0);
  };
  const loadF=createPane('F'),loadP=createPane('P');
  details.append(panes);
  void loadF();void loadP();
}
async function act(type,params,message){
  if(active)return;
  active=true;const serial=++sequence;controls();note(message);
  try{
    const result=await command(type,params);
    if(serial!==sequence)return;
    if(result?.ok){
      if(type==='PREVIEW'){snapshot=result;receipt=null;renderPreview(result);
        note('Exact saved F, current READY and editor checked. Individual approval available.');}
      else if(type==='APPROVE'){receipt=result;note('Durable source-bound approval '+result.releaseId+
        '. No provider effect performed.');}
      else if(type==='CANCEL_APPROVED'){receipt=result;snapshot=null;
        note('Unsent source approval canceled; publication not attempted. Review fresh F before reapproving.');}
      else if(type==='DISPATCH'){receipt=result;note('Dispatch may have occurred: '+
        result.state+'. Reconcile independently; do not click again.');}
      else if(type==='RECONCILE'){receipt=result;note(result.state==='CONFIRMED_PUBLIC'?
        'Independent full source + public listing confirmed.':
        'Publication still uncertain. No retry authorized.');}
      else if(type==='GET'){receipt=result;note('Stored release '+result.releaseId+
        ' · '+result.state+' · '+result.publication+'.');}
    }else {
      // A disconnected dispatch does NOT mean no remote effect.
      if(['DISPATCH','APPROVE'].includes(type)){snapshot=null;}
      note((result?.code||'RELEASE_UNVERIFIED')+
        ' — held; read the canonical receipt before taking another action.');
    }
  }catch{
    if(serial===sequence){snapshot=null;receipt=null;
      note('Connection lost or timed out. Possible effect is UNKNOWN. Load the canonical receipt and reconcile before any further action.');}
  }finally{if(serial===sequence){active=false;controls();}}
}
previewBtn.addEventListener('click',()=>act('PREVIEW',{
  slug:slug.value,token:token.value,passphrase:passphrase.value},'Checking current owner, route, clean editor, Git READY and full saved F…'));
approveBtn.addEventListener('click',()=>{
  const f=snapshot;
  if(!f||f.slug!==slug.value)return;
  act('APPROVE',{slug:f.slug,token:token.value,
    expectedStageRevision:f.stageRevision,expectedJobRevision:f.jobRevision,
    fingerprint:f.sourceFingerprint,explicitApproval:true,passphrase:passphrase.value},
    'Recording exact-F individual approval in canonical journal…');
});
cancelBtn.addEventListener('click',()=>{
  if(!receipt||receipt.state!=='APPROVED')return;
  act('CANCEL_APPROVED',{slug:receipt.slug,expectedRevision:receipt.revision},
    'Canceling unsent exact-source approval; no remote effect…');
});
armBtn.addEventListener('click',async()=>{
  if(active||receipt?.state!=='APPROVED')return;
  const expected='PUBLISH '+receipt.slug+' '+receipt.sourceFingerprint;
  const confirmation=window.prompt('Type exactly '+expected+
    ' to permit ONE publication of this private tested source F:', '');
  if(confirmation===null)return;
  if(confirmation!==expected){note('Exact-source confirmation mismatch. No provider effect.');return;}
  active=true;controls();
  try{
    const result=await command('ARM_DISPOSABLE_RELEASE',{
      slug:receipt.slug,expectedRevision:receipt.revision,confirmation});
    note(result?.ok?'Exact-source publication armed for two minutes. Click Publish to dispatch once.':
      'Publication not armed: '+(result?.code||'UNVERIFIED'));
  }catch{note('Arm acknowledgment unknown. Reinspect approval; do not infer authorization.');}
  finally{active=false;controls();}
});
dispatchBtn.addEventListener('click',()=>{
  if(!receipt)return;
  act('DISPATCH',{slug:receipt.slug,token:token.value,
    expectedRevision:receipt.revision,passphrase:passphrase.value},
    'Revalidating exact F, READY and owner before a single fenced publication attempt…');
});
reconcileBtn.addEventListener('click',()=>{
  if(!receipt)return;
  act('RECONCILE',{slug:receipt.slug,token:token.value,
    expectedRevision:receipt.revision},
    'Read-only remote public listing and every F source byte; no repeat of publication…');
});
loadBtn.addEventListener('click',()=>act('GET',{slug:slug.value},
  'Loading persisted approval/dispatch/uncertainty receipt…'));
clearBtn.addEventListener('click',()=>{token.value='';controls();});
slug.addEventListener('input',()=>{
  if(active)return;
  sequence++;snapshot=null;receipt=null;
  details.textContent='Target changed. Previous preview and approval controls invalidated.';
  note('Selection changed; review new target before any approval.');
  controls();
});
token.addEventListener('input',controls);
passphrase?.addEventListener('input',controls);
controls();
