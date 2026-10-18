// S03 main-only catalog and Git-authoritative prompt. No credential in storage.
const el=id=>document.getElementById(id);
const repo=el('pcms-catalog-repo'),token=el('pcms-catalog-token');
const scan=el('pcms-catalog-scan'),clear=el('pcms-catalog-clear');
const connect=el('pcms-catalog-connect'),disconnect=el('pcms-catalog-disconnect');
const approve=el('pcms-catalog-approve');
const status=el('pcms-catalog-status'),list=el('pcms-catalog-list');
const prompt=el('pcms-catalog-prompt');
const draft=el('pcms-catalog-prompt-draft');
const saveDraft=el('pcms-catalog-prompt-save');
const commitDraft=el('pcms-catalog-prompt-commit');
const promptStatus=el('pcms-catalog-prompt-status');
let busy=false,generation=0,connected=false,selectedScope=null;
let promptBase=null,promptRevision=0,promptDirty=false;
function message(text){status.textContent=text;}
function render(data){
  list.replaceChildren();prompt.value='';
  selectedScope=connected&&data.preview?.scopeDigest&&data.importStatus!== 'IMPORT_SCOPE_APPROVED' ?
    {repositoryId:data.repositoryId,scopeDigest:data.preview.scopeDigest}:null;
  const p=document.createElement('p');
  p.textContent='Pinned main '+data.head.slice(0,12)+' · '+
    data.recognizedCount+' recognized folders · complete catalog';
  list.append(p);
  const table=document.createElement('table');
  const head=document.createElement('tr');
  for(const name of ['Generator','Declaration','Account/owner evidence']){
    const th=document.createElement('th');th.textContent=name;head.append(th);
  }
  const thead=document.createElement('thead');thead.append(head);table.append(thead);
  const body=document.createElement('tbody');
  for(const item of data.preview.items){
    const tr=document.createElement('tr');
    for(const value of [item.slug,
      item.sourceState==='READY_UNVERIFIED_COHERENCE'?'READY declared · coherence unverified':item.sourceState,
      item.observed==='AMBIGUOUS'?'Not yet independently verified':item.observed]){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);list.append(table);
  if(data.prompt.state==='PRESENT'){
    prompt.value=data.prompt.text;
    prompt.title='Pinned Git blob '+data.prompt.oid+' (read-only)';
  }else prompt.placeholder='No default-chat1.md on main. No starter generated.';
  if(!connected||data.prompt.state!=='PRESENT'){
    promptBase=null;promptRevision=0;draft.disabled=true;draft.value='';
    promptStatus.textContent=data.prompt.state!=='PRESENT'?
      'No existing Git prompt; an unapproved starter must not be invented.':
      'Connect GitHub to manage prompt drafts.';
    return;
  }
  promptBase={repositoryId:data.repositoryId,oid:data.prompt.oid,head:data.head};
  promptRevision=0;draft.value=data.prompt.text;promptDirty=false;
  draft.disabled=false;
  promptStatus.textContent='Git prompt pinned at '+data.prompt.oid.slice(0,12)+
    '. Load saved draft or edit and save a new local revision.';
  void loadSavedDraft(data.repositoryId,data.prompt.oid);

}
function request(type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-s03-catalog'});
    let done=false;
    const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),90000);
    function finish(value,error){
      if(done)return;done=true;clearTimeout(timeout);
      try{port.disconnect();}catch{}
      error?reject(error):resolve(value);
    }
    port.onMessage.addListener(value=>finish(value));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function controls(){
  scan.disabled=busy;repo.disabled=busy;connect.disabled=busy||connected;
  disconnect.disabled=busy||!connected;
  approve.disabled=busy||!selectedScope||!connected;
  draft.disabled=busy||!promptBase||!connected;
  saveDraft.disabled=busy||!promptBase||!connected;
  commitDraft.disabled=busy||!promptBase||!connected||promptRevision<1||promptDirty;
}
repo.addEventListener('input',()=>{generation++;selectedScope=null;promptBase=null;
  list.replaceChildren();prompt.value='';controls();});
token.addEventListener('input',()=>{generation++;selectedScope=null;promptBase=null;
  list.replaceChildren();prompt.value='';controls();});
clear.addEventListener('click',()=>{generation++;selectedScope=null;promptBase=null;token.value='';list.replaceChildren();
  prompt.value='';message('Input cleared. No local Git token retained.');});
async function refreshStatus(){
  try{
    const r=await request('GIT_STATUS');
    connected=Boolean(r?.ok);
    if(connected){
      repo.value=r.repository;
      message('Connected to '+r.repository+' using OS Secret Service. Read-only scan available.');
    }else message('Git vault not connected ('+(r?.code||'UNAVAILABLE')+
      '). Enter a credential and connect, or perform one read-only scan.');
  }catch{message('Git credential status unavailable; no connection assumed.');}
  controls();
}
connect.addEventListener('click',async()=>{
  const n=++generation;
  busy=true;controls();message('Verifying private repository identity and storing the credential in the OS vault…');
  try{
    const r=await request('CONNECT_GIT',{repository:repo.value.trim(),token:token.value});
    if(n!==generation)return;
    if(r?.ok){
      connected=true;selectedScope=null;promptBase=null;token.value='';
      message('GitHub connected. Credential held by OS Secret Service; no Git or provider write performed.');
    }else message('Connection held: '+(r?.code||'UNAVAILABLE')+'. Input remains unsaved.');
  }catch{if(n===generation)message('Git vault unavailable; no connection assumed.');}
  finally{busy=false;controls();}
});
disconnect.addEventListener('click',async()=>{
  busy=true;controls();
  try{
    const r=await request('DISCONNECT_GIT');
    if(r?.ok){
      connected=false;selectedScope=null;promptBase=null;generation++;list.replaceChildren();prompt.value='';
      message('Git connection removed from OS vault and local configuration.');
    }else message('Disconnect held: '+(r?.code||'UNAVAILABLE')+'. No removal assumed.');
  }catch{message('Disconnect acknowledgment unavailable; recheck status before another operation.');}
  finally{busy=false;controls();}
});
scan.addEventListener('click',async()=>{
  const n=++generation;
  if(promptDirty&&!window.confirm('There are unsaved Git prompt edits. Discard only those unsaved edits to reload main?'))return;
  busy=true;selectedScope=null;promptBase=null;controls();list.replaceChildren();prompt.value='';
  message('Reading the complete managed main tree; no remote writes.');
  try{
    const r=connected?await request('SCAN_CONNECTED'):
      await request('SCAN_CATALOG',{repository:repo.value.trim(),token:token.value});
    if(n!==generation)return;
    if(!r?.ok || !r.complete){
      message('Catalog held: '+(r?.code||'INCOMPLETE')+
        '. No missing item or remote deletion inferred.');return;
    }
    render(r);
    message('Complete read-only snapshot. '+r.recognizedCount+
      ' recognized entries. Scope: '+(r.importStatus||'NOT_CONNECTED')+
      '. Owner facts and allocations remain unverified; approval does not create remote generators.');
  }catch{
    if(n===generation)message('Unable to complete scan. Previous state is not deletion evidence.');
  }finally{busy=false;controls();}
});
approve.addEventListener('click',async()=>{
  if(busy||!connected||!selectedScope)return;
  const scope=selectedScope;
  if(!window.confirm('Approve this exact initial GitHub generator-folder scope? This records operator approval only. No generator is created, renamed, edited or published; every future effect still requires independently verified account and source admission.'))return;
  busy=true;controls();
  message('Rechecking the entire pinned main import scope before canonical approval…');
  try{
    const result=await request('APPROVE_IMPORT',scope);
    if(result?.ok){
      selectedScope=null;
      message('Initial folder scope approved and journaled. This does not authorize provider effects; unresolved ownership/account allocations remain held.');
    }else message('Import approval held: '+(result?.code||'UNAVAILABLE')+'. No approval assumed.');
  }catch{message('Approval acknowledgment uncertain. Re-scan to read canonical status before retry.');}
  finally{busy=false;controls();}
});
controls();
void refreshStatus();

async function loadSavedDraft(repositoryId,oid){
  const guard=promptBase;
  try{
    const result=await request('GET_PROMPT_DRAFT');
    if(!promptBase||promptBase!==guard||promptBase.repositoryId!==repositoryId)return;
    if(result?.ok){
      // Never overwrite an unsaved user edit while the async read is in flight.
      if(promptDirty)return;
      draft.value=result.record.text;
      promptRevision=result.record.revision;
      if(result.record.baseOid!==oid)
        promptStatus.textContent='Saved draft preserved against a different Git base. Reconcile before writing; do not overwrite the draft.';
      else if(result.record.effect)
        promptStatus.textContent='Previous prompt effect: '+result.record.effect.state+
          '. Remote result requires independent reconciliation; no replay.';
      else promptStatus.textContent='Restored local draft revision '+promptRevision+
        '. The Git prompt remains authoritative.';
    }
  }catch{promptStatus.textContent='Local draft unavailable; remote Git remains unchanged.';}
  controls();
}
draft.addEventListener('input',()=>{promptDirty=true;controls();});
saveDraft.addEventListener('click',async()=>{
  if(busy||!promptBase||!connected)return;
  const pinned=promptBase;
  busy=true;controls();promptStatus.textContent='Saving local draft without Git changes…';
  try{
    const result=await request('SAVE_PROMPT_DRAFT',{
      repositoryId:pinned.repositoryId,baseOid:pinned.oid,
      expectedRevision:promptRevision,text:draft.value
    });
    if(promptBase!==pinned)return;
    if(result?.ok){
      promptRevision=result.revision;promptDirty=false;
      promptStatus.textContent='Draft revision '+promptRevision+' saved locally. Git remains unchanged.';
    }else promptStatus.textContent='Draft held: '+(result?.code||'UNAVAILABLE')+
      '. Copy unsaved changes or reconcile stale revision before retrying.';
  }catch{promptStatus.textContent='Draft acknowledgment unknown. Refresh canonical draft before retrying.';}
  finally{busy=false;controls();}
});
commitDraft.addEventListener('click',async()=>{
  if(busy||!promptBase||promptDirty||!connected||promptRevision<1)return;
  const pinned=promptBase;
  if(!window.confirm('Commit this saved Chat 1 prompt revision to GitHub main? A revision-safe, nonforced write and independent readback are required.'))return;
  busy=true;controls();promptStatus.textContent='Checking Git authority and durable write protection…';
  try{
    const result=await request('COMMIT_PROMPT',{
      repositoryId:pinned.repositoryId,expectedRevision:promptRevision,expectedHead:pinned.head
    });
    promptStatus.textContent=result?.ok?'Exact Git prompt update verified. Re-scan the catalog.':
      'Prompt commit held: '+(result?.code||'UNAVAILABLE')+
      '. Local draft retained; no retry after an ambiguous acknowledgment.';
  }catch{promptStatus.textContent='Commit acknowledgment unknown. Keep this draft; do not repeat the effect.';}
  finally{busy=false;controls();}
});
