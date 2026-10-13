// I11 operator Git-only writeback. Credentials and source bytes never enter
// extension URLs or local storage; each command reports its exact outcome.
const get=id=>document.getElementById(id);
const slug=get('pcms-writeback-slug'),token=get('pcms-writeback-token');
const message=get('pcms-writeback-message'),mode=get('pcms-writeback-mode');
const preview=get('pcms-writeback-preview'),prepare=get('pcms-writeback-prepare');
const commit=get('pcms-writeback-commit'),reconcile=get('pcms-writeback-reconcile');
const cancel=get('pcms-writeback-cancel');
const status=get('pcms-writeback-status'),diff=get('pcms-writeback-diff');
const refresh=get('pcms-writeback-refresh'),optin=get('pcms-writeback-auto');
const armAuto=get('pcms-writeback-arm-auto'),disarmAuto=get('pcms-writeback-disarm-auto');
const save=get('pcms-writeback-save-auto'),settingStatus=get('pcms-writeback-auto-status');
let inspected=null,receipt=null,setting=null,busy=false,seq=0;
function request(type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i11-writeback'});
    let done=false;const finish=(data,error)=>{
      if(done)return;done=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      error?reject(error):resolve(data);
    };
    const timer=setTimeout(()=>finish(null,Error('DISCONNECTED')),45000);
    port.onMessage.addListener(data=>finish(data));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}
    catch{finish(null,Error('DISCONNECTED'));}
  });
}
function announce(note){status.textContent=note;}
function controls(){
  const selected=/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug.value.trim());
  preview.disabled=busy||!selected;
  prepare.disabled=busy||!inspected?.ok||!token.value||
    inspected.slug!==slug.value.trim()||!!receipt;
  commit.disabled=busy||!receipt?.ok||receipt.mode!=='MANUAL'||
    receipt.state!=='PREPARED'||!token.value;
  cancel.disabled=busy||!receipt?.ok||receipt.state!=='PREPARED';
  reconcile.disabled=busy||!receipt?.ok||
    !['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(receipt.state)||!token.value;
  refresh.disabled=busy||!selected;
  save.disabled=busy||!setting?.ok;
  armAuto.disabled=busy||!setting?.setting?.autoEnabled||!selected||!token.value;
  disarmAuto.disabled=busy||!selected;
}
function showReceipt(r){
  receipt=r?.ok?r:null;
  if(r?.ok)announce(r.slug+': '+r.state+' · revision '+r.revision+' · '+
    (r.reason||'No effect inferred')+' · publication OFF.');
  else announce(r?.code||'WRITEBACK_UNKNOWN');
  controls();
}
function showDiff(r){
  diff.replaceChildren();
  if(!r?.ok){diff.textContent=r?.code||'Preview unavailable';return;}
  const heading=document.createElement('p');
  heading.textContent='Exact target: '+r.folder+' · F '+r.sourceFingerprint+
    ' · stage '+r.stageRevision+' / job '+r.jobRevision;
  diff.append(heading);
  if(!r.diff.length){const p=document.createElement('p');
    p.textContent='No changed deployable paths. This does not authorize Git.';
    diff.append(p);return;}
  const table=document.createElement('table'),head=document.createElement('thead');
  head.innerHTML='<tr><th scope="col">Path</th><th scope="col">Change</th><th scope="col">Prior SHA-256 / size</th><th scope="col">Final SHA-256 / size</th></tr>';
  table.append(head);
  const body=document.createElement('tbody');
  for(const item of r.diff){
    const tr=document.createElement('tr');
    for(const value of [item.path,item.kind,
      item.before?item.before.sha256+' / '+item.before.size:'Absent',
      item.after?item.after.sha256+' / '+item.after.size:'Deleted']){
      const cell=document.createElement('td');cell.textContent=value;tr.append(cell);
    }
    body.append(tr);
  }
  table.append(body);diff.append(table);
}
async function transact(fn){
  if(busy)return;
  const number=++seq;busy=true;controls();
  try{await fn();}catch{
    if(seq===number)announce('Disconnected or interrupted. Inspect canonical state before any further Git attempt.');
  }finally{busy=false;controls();}
}
function clearSelection(){
  inspected=null;receipt=null;diff.replaceChildren();
  announce('Source selection changed. Reinspect exact F and target.');
  controls();
}
slug.addEventListener('input',clearSelection);
mode.addEventListener('change',()=>{receipt=null;controls();});
message.addEventListener('input',()=>{receipt=null;controls();});
token.addEventListener('input',controls);
preview.addEventListener('click',()=>transact(async()=>{
  inspected=null;receipt=null;
  announce('Reading canonical tested F and immutable source manifest…');
  const r=await request('PREVIEW',{slug:slug.value.trim()});
  if(!r?.ok){showDiff(r);announce(r?.code||'PREVIEW_UNAVAILABLE');return;}
  inspected=r;showDiff(r);
  announce('Review all listed hashes, paths and target. No code, READY, test or publication status has changed.');
}));
prepare.addEventListener('click',()=>transact(async()=>{
  if(!inspected?.ok)return;
  announce('Checking current saved F, owner, protected route and private Git HEAD…');
  const r=await request('PREPARE',{
    slug:inspected.slug,expectedJobRevision:inspected.jobRevision,
    fingerprint:inspected.sourceFingerprint,token:token.value,
    mode:mode.value,message:mode.value==='MANUAL'?message.value:''});
  if(!r?.ok){
    // A disconnected PREPARE may have committed only the local intent.
    // Always read canonical state; never manufacture an ACK.
    const latest=await request('GET',{slug:inspected.slug});
    if(latest?.ok){showReceipt(latest);return;}
  }
  showReceipt(r);
}));
commit.addEventListener('click',()=>transact(async()=>{
  if(!receipt?.ok||receipt.state!=='PREPARED')return;
  const name=receipt.slug;
  const r=await request('COMMIT',{slug:name,token:token.value,
    expectedRevision:receipt.revision});
  if(r?.ok){showReceipt(r);return;}
  // Remote effects could have occurred even if their response was lost.
  // Refresh the persisted journal before enabling read-only reconciliation.
  const latest=await request('GET',{slug:name});
  if(latest?.ok){
    showReceipt(latest);
    announce(name+': '+latest.state+' · '+(r?.code||'UNKNOWN_ACK')+
      ' · read-only reconciliation required for uncertain Git effects.');
  }else{
    receipt=null;controls();
    announce('Git outcome unknown; refresh canonical receipt. Never retry blindly.');
  }
}));
cancel.addEventListener('click',()=>transact(async()=>{
  if(!receipt?.ok||receipt.state!=='PREPARED')return;
  const r=await request('CANCEL_PREPARED',{slug:receipt.slug,
    expectedRevision:receipt.revision});
  if(r?.ok){
    showReceipt(r);inspected=null;showDiff(null);
    announce('Unsent Git preparation canceled. Review the latest F before preparing another.');
  }else announce((r?.code||'CANCEL_UNVERIFIED')+
    ' · possible Git dispatch can never be canceled or replayed.');
}));
reconcile.addEventListener('click',()=>transact(async()=>{
  if(!receipt?.ok)return;
  const r=await request('RECONCILE',{slug:receipt.slug,
    expectedRevision:receipt.revision,token:token.value});
  if(r?.ok&&r.state==='CONFIRMED'){
    showReceipt(r);
    announce('Git commit and historical F independently verified. Publication OFF.');
  }else announce((r?.code||'GIT_RECONCILIATION_UNVERIFIED')+
    ' · writeback remains held; no automatic retry.');
}));
refresh.addEventListener('click',()=>transact(async()=>{
  inspected=null;showDiff(null);
  showReceipt(await request('GET',{slug:slug.value.trim()}));
}));
armAuto.addEventListener('click',()=>transact(async()=>{
  announce('Arming one exact generator for autonomous writeback. No credentials are persisted…');
  const r=await request('ARM_AUTO',{slug:slug.value.trim(),token:token.value});
  announce(r?.ok?'Ephemeral authorization armed for '+r.slug+
    '. A verified F will be reconciled on a background wake; no public effect is authorized.':
    r?.code||'AUTO_ARM_HELD');
}));
disarmAuto.addEventListener('click',()=>transact(async()=>{
  const r=await request('DISARM_AUTO',{slug:slug.value.trim()});
  announce((r?.code||'AUTO_DISARM_UNVERIFIED')+
    ' · future dispatch disarmed; a Git effect already started may still require reconciliation.');
}));
async function loadSettings(){
  const r=await request('GET_SETTINGS');
  setting=r?.ok?r:null;
  if(setting){optin.checked=setting.setting.autoEnabled;
    settingStatus.textContent='Revision '+setting.setting.revision+
      ' · automatic mode '+(setting.setting.autoEnabled?'opted in':'off')+
      ' · Git effects still require separate activation.';}
  else settingStatus.textContent=r?.code||'Auto setting unavailable';
  controls();
}
save.addEventListener('click',()=>transact(async()=>{
  if(!setting)return;
  const r=await request('SET_AUTO',{expectedRevision:setting.setting.revision,
    autoEnabled:optin.checked});
  if(!r?.ok){settingStatus.textContent=r?.code||'Setting update unverified';return;}
  setting=r;settingStatus.textContent='Saved revision '+r.setting.revision+
    ' · automatic mode '+(r.setting.autoEnabled?'enabled':'disabled')+
    '. This does not activate live Git credentials or native AI.';
}));
controls();loadSettings().catch(()=>{settingStatus.textContent='Setting unavailable';});
