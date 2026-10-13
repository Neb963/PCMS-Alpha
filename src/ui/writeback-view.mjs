// I11 operator Git-only writeback. Credentials and source bytes never enter
// extension URLs or local storage; each command reports its exact outcome.
const get=id=>document.getElementById(id);
const slug=get('pcms-writeback-slug'),token=get('pcms-writeback-token');
const message=get('pcms-writeback-message'),mode=get('pcms-writeback-mode');
const preview=get('pcms-writeback-preview'),prepare=get('pcms-writeback-prepare');
const commit=get('pcms-writeback-commit'),reconcile=get('pcms-writeback-reconcile');
const status=get('pcms-writeback-status'),diff=get('pcms-writeback-diff');
const refresh=get('pcms-writeback-refresh'),optin=get('pcms-writeback-auto');
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
  commit.disabled=busy||!receipt?.ok||receipt.state!=='PREPARED'||!token.value;
  reconcile.disabled=busy||!receipt?.ok||
    !['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(receipt.state)||!token.value;
  refresh.disabled=busy||!selected;
  save.disabled=busy||!setting?.ok;
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
  showReceipt(r);
}));
commit.addEventListener('click',()=>transact(async()=>{
  if(!receipt?.ok||receipt.state!=='PREPARED')return;
  const r=await request('COMMIT',{slug:receipt.slug,token:token.value,
    expectedRevision:receipt.revision});
  showReceipt(r);
  if(!r?.ok)announce('Git effect outcome unknown or held. Do NOT repeat commit. Use read-only reconciliation.');
}));
reconcile.addEventListener('click',()=>transact(async()=>{
  if(!receipt?.ok)return;
  const r=await request('RECONCILE',{slug:receipt.slug,
    expectedRevision:receipt.revision,token:token.value});
  announce(r?.code||'GIT_RECONCILIATION_UNVERIFIED');
}));
refresh.addEventListener('click',()=>transact(async()=>{
  inspected=null;showDiff(null);
  showReceipt(await request('GET',{slug:slug.value.trim()}));
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
