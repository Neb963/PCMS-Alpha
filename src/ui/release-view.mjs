// I13 Work Queue inspector: fingerprints and test provenance, never source
// bytes or credentials. Pending and disconnected outcomes never claim publish.
const slug=document.getElementById('pcms-release-slug');
const token=document.getElementById('pcms-release-token');
const previewBtn=document.getElementById('pcms-release-preview');
const approveBtn=document.getElementById('pcms-release-approve');
const dispatchBtn=document.getElementById('pcms-release-dispatch');
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
  slug:slug.value,token:token.value},'Checking current owner, route, clean editor, Git READY and full saved F…'));
approveBtn.addEventListener('click',()=>{
  const f=snapshot;
  if(!f||f.slug!==slug.value)return;
  act('APPROVE',{slug:f.slug,token:token.value,
    expectedStageRevision:f.stageRevision,expectedJobRevision:f.jobRevision,
    fingerprint:f.sourceFingerprint,explicitApproval:true},
    'Recording exact-F individual approval in canonical journal…');
});
dispatchBtn.addEventListener('click',()=>{
  if(!receipt)return;
  act('DISPATCH',{slug:receipt.slug,token:token.value,
    expectedRevision:receipt.revision},
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
  if(active)return;\n  sequence++;snapshot=null;receipt=null;
  details.textContent='Target changed. Previous preview and approval controls invalidated.';
  note('Selection changed; review new target before any approval.');
  controls();
});
token.addEventListener('input',controls);
controls();
