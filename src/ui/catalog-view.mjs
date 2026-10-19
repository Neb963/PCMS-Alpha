// S03 main-only catalog and Git-authoritative prompt. No credential in storage.
const el=id=>document.getElementById(id);
const repo=el('pcms-catalog-repo'),token=el('pcms-catalog-token');
const scan=el('pcms-catalog-scan'),clear=el('pcms-catalog-clear');
const connect=el('pcms-catalog-connect'),disconnect=el('pcms-catalog-disconnect');
const approve=el('pcms-catalog-approve');
const status=el('pcms-catalog-status'),list=el('pcms-catalog-list');
const readySlug=el('pcms-catalog-ready-slug');
const inspectReady=el('pcms-catalog-ready-inspect');
const readyStatus=el('pcms-catalog-ready-status');
const prompt=el('pcms-catalog-prompt');
const draft=el('pcms-catalog-prompt-draft');
const saveDraft=el('pcms-catalog-prompt-save');
const commitDraft=el('pcms-catalog-prompt-commit');
const reconcileDraft=el('pcms-catalog-prompt-reconcile');
const promptStatus=el('pcms-catalog-prompt-status');
let busy=false,generation=0,connected=false,selectedScope=null;
let promptBase=null,promptRevision=0,promptDirty=false,promptEffectState=null;
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
  promptRevision=0;draft.value=data.prompt.text;promptDirty=false;promptEffectState=null;
  draft.disabled=false;
  promptStatus.textContent='Git prompt pinned at '+data.prompt.oid.slice(0,12)+
    '. Load saved draft or edit and save a new local revision.';
  void loadSavedDraft(data.repositoryId,data.prompt.oid);

}
// S05 queued READY state is advisory local intent, not a deployed candidate.
async function renderReadyQueue(scanGeneration){
  const section=document.createElement('section');
  section.setAttribute('aria-label','Local READY intent queue');
  const heading=document.createElement('h3');
  heading.textContent='Observed READY work (local, not deployed)';
  const description=document.createElement('p');
  description.textContent='Only coherent main declarations are queued. Native development, source mutation and publication still require independent admission.';
  const table=document.createElement('table'),tbody=document.createElement('tbody');
  const header=document.createElement('tr');
  for(const title of ['Generator','Desired READY','Active candidate','Hold','Assessment']){
    const th=document.createElement('th');th.textContent=title;header.append(th);
  }
  const thead=document.createElement('thead');thead.append(header);
  table.append(thead,tbody);
  const next=document.createElement('button');next.type='button';
  next.textContent='Load more observed READY jobs';
  const progress=document.createElement('p');
  progress.setAttribute('role','status');
  section.append(heading,description,table,next,progress);
  list.append(section);
  let after='',busyPage=false;
  async function load(){
    if(busyPage||!list.contains(section)||scanGeneration!==generation)return;
    busyPage=true;next.disabled=true;progress.textContent='Loading canonical queue…';
    try{
      const r=await request('LIST_READY',{after,limit:100});
      if(!list.contains(section)||scanGeneration!==generation)return;
      if(!r?.ok){progress.textContent='Read-only queue unavailable: '+(r?.code||'UNAVAILABLE');return;}
      for(const item of r.items){
        const tr=document.createElement('tr');
        for(const value of [item.slug,item.desired?.identifier||'—',
          item.active?.identifier||'—',item.hold||'—']){
          const td=document.createElement('td');td.textContent=value;tr.append(td);
        }
        const cell=document.createElement('td');
        const check=document.createElement('button');
        check.type='button';check.textContent='Assess';check.disabled=!connected;
        check.setAttribute('aria-label','Assess '+item.slug+' read-only READY admission');
        const result=document.createElement('span');
        result.setAttribute('role','status');
        const publicUpdate=document.createElement('button');
        publicUpdate.type='button';
        publicUpdate.textContent='Open guarded UPDATE';
        publicUpdate.hidden=true;
        publicUpdate.setAttribute('aria-label','Open guarded existing source update for '+item.slug);
        publicUpdate.addEventListener('click',()=>{
          // Navigation only; never unlist or stage from this shortcut.
          // I13 independently reloads the canonical record and requires
          // operator passphrase plus its own effect/reconciliation gates.
          const target=document.getElementById('pcms-existing-slug');
          if(target){
            target.value=item.slug;
            target.dispatchEvent(new Event('input',{bubbles:true}));
          }
          location.hash='#work-queue';
        });
        check.addEventListener('click',async()=>{
          if(check.disabled)return;
          check.disabled=true;result.textContent=' Checking current evidence…';
          try{
            const observed=await request('ASSESS_READY',{
              slug:item.slug,expectedRevision:item.revision
            },'pcms-s05-ready-operator');
            result.textContent=' '+(observed?.code||'ASSESSMENT_UNAVAILABLE');
            publicUpdate.hidden=observed?.code!=='S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED';
            if(observed?.ok&&observed.savedFingerprint)
              result.title='Observed saved-source SHA-256 '+observed.savedFingerprint;
          }catch{result.textContent=' Assessment unavailable; no action performed.';}
          finally{check.disabled=false;}
        });
        const prepare=document.createElement('button');
        prepare.type='button';
        prepare.textContent='Prepare source locally';
        prepare.disabled=!connected||(!item.desired&&!item.active);
        prepare.setAttribute('aria-label','Prepare local READY source for '+item.slug);
        prepare.addEventListener('click',async()=>{
          if(prepare.disabled)return;
          prepare.disabled=true;check.disabled=true;
          result.textContent=' Rechecking owner, editor and full source…';
          try{
            const out=await request('PREPARE_LOCAL',{
              slug:item.slug,expectedRevision:item.revision
            },'pcms-s05-ready-operator');
            result.textContent=' '+(out?.code||'PREPARATION_UNAVAILABLE');
            if(out?.code==='S05_LOCAL_STAGE_PINNED')
              progress.textContent='Local stage pinned without provider effects. Re-scan the catalog to refresh revision; native editing remains separately guarded.';
          }catch{result.textContent=' Local preparation unavailable; recheck canonical state.';}
          finally{prepare.disabled=false;check.disabled=false;}
        });
        const pause=document.createElement('button'),resume=document.createElement('button');
        pause.type='button';resume.type='button';
        pause.textContent='Pause READY';resume.textContent='Resume READY';
        pause.disabled=!connected||item.hold==='OPERATOR_PAUSED'||
          item.hold==='READY_REVOKED_NOT_READY';
        resume.disabled=!connected||item.hold!=='OPERATOR_PAUSED';
        pause.setAttribute('aria-label','Pause local READY for '+item.slug);
        resume.setAttribute('aria-label','Recheck Git and resume READY for '+item.slug);
        async function changeHold(type){
          if(type==='PAUSE_READY'?pause.disabled:resume.disabled)return;
          pause.disabled=true;resume.disabled=true;
          check.disabled=true;prepare.disabled=true;
          result.textContent=type==='PAUSE_READY'?
            ' Recording local pause…':' Rechecking exact Git main before resume…';
          try{
            const out=await request(type,{slug:item.slug,
              expectedRevision:item.revision},'pcms-s05-ready-operator');
            result.textContent=' '+(out?.code||'READY_COMMAND_UNVERIFIED');
            if(out?.ok){
              progress.textContent='READY state committed locally. Re-scan catalog to load the new revision; no native or provider effect was executed.';
              return;
            }
          }catch{result.textContent=' READY state uncertain. Re-scan before further action.';}
          finally{check.disabled=false;prepare.disabled=false;}
        }
        pause.addEventListener('click',()=>{void changeHold('PAUSE_READY');});
        resume.addEventListener('click',()=>{void changeHold('RESUME_READY');});
        const diagnostics=document.createElement('details');
        const summary=document.createElement('summary');
        summary.textContent='Diagnostics and manual recovery';
        diagnostics.append(summary,check,document.createTextNode(' '),
          prepare,document.createTextNode(' '),publicUpdate);
        // Ordinary READY work advances through the background coordinator.
        // The normal row exposes only pause/resume and an actionable status.
        cell.append(pause,document.createTextNode(' '),resume,
          result,diagnostics);tr.append(cell);
        tbody.append(tr);
      }
      after=r.nextCursor||'';
      next.hidden=!r.more;
      let last=null;
      try{last=(await browser.storage.local.get('pcmsS05DevelopmentReceipt'))
        ?.pcmsS05DevelopmentReceipt||null;}catch{}
      progress.textContent=tbody.children.length+' READY candidate(s). '+
        (last?.slug&&last?.code?
          'Latest development: '+last.slug+' — '+last.code+'.':
          'Waiting for the next eligible background development step.');
    }catch{if(list.contains(section))progress.textContent='Read-only READY queue unavailable.';}
    finally{busyPage=false;next.disabled=false;}
  }
  next.addEventListener('click',()=>{void load();});
  await load();
}
function request(type,params={},portName='pcms-s03-catalog'){ 
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:portName});
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
  inspectReady.disabled=busy||!connected||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(readySlug.value.trim());
  draft.disabled=busy||!promptBase||!connected;
  saveDraft.disabled=busy||!promptBase||!connected;
  commitDraft.disabled=busy||!promptBase||!connected||promptRevision<1||
    promptDirty||['DISPATCH_POSSIBLE','UNCERTAIN','VERIFIED'].includes(promptEffectState);
  reconcileDraft.disabled=busy||!promptBase||!connected||
    !['DISPATCH_POSSIBLE','UNCERTAIN'].includes(promptEffectState);
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
    void renderReadyQueue(n);
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
      promptEffectState=result.record.effect?.state||null;
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
      promptRevision=result.revision;promptDirty=false;promptEffectState=null;
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
    promptEffectState=result?.ok?'VERIFIED':
      result?.code==='PROMPT_GIT_UNCERTAIN_RECONCILE_REQUIRED'?'UNCERTAIN':promptEffectState;
    promptStatus.textContent=result?.ok?'Exact Git prompt update verified. Re-scan the catalog.':
      'Prompt commit held: '+(result?.code||'UNAVAILABLE')+
      '. Local draft retained; no retry after an ambiguous acknowledgment.';
  }catch{promptStatus.textContent='Commit acknowledgment unknown. Keep this draft; do not repeat the effect.';}
  finally{busy=false;controls();}
});

readySlug.addEventListener('input',controls);
inspectReady.addEventListener('click',async()=>{
  const slug=readySlug.value.trim();
  if(busy||!connected||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))return;
  busy=true;controls();
  readyStatus.textContent='Verifying pinned main ancestry, source bytes and optional TESTING evidence…';
  try{
    const r=await request('INSPECT_DECLARATION',{slug});
    if(r?.ok)readyStatus.textContent='Coherent '+(r.legacy?'legacy READY':'READY '+r.token)+
      ' · declared '+r.declarationCommit.slice(0,12)+
      ' · exact '+r.files.length+' deployable files · source fingerprint '+
      r.inputFingerprint.slice(0,16)+
      ' · TESTING '+r.optionalTesting.state+'. Provider effects remain off.';
    else readyStatus.textContent='READY held: '+(r?.code||'UNVERIFIED')+
      '. No publication or source write authorized.';
  }catch{readyStatus.textContent='READY proof unavailable; no authorization inferred.';}
  finally{busy=false;controls();}
});

reconcileDraft.addEventListener('click',async()=>{
  if(busy||!promptBase||!connected||!['UNCERTAIN','DISPATCH_POSSIBLE'].includes(promptEffectState))return;
  const pinned=promptBase;
  busy=true;controls();
  promptStatus.textContent='Observing Git commit history and exact prompt bytes; no remote writes…';
  try{
    const r=await request('RECONCILE_PROMPT',{repositoryId:pinned.repositoryId});
    if(r?.ok){
      promptEffectState='VERIFIED';
      promptStatus.textContent='Previous Git commit independently verified at '+
        r.commit.slice(0,12)+'. Refresh the main catalog before editing.';
    }else promptStatus.textContent='Prompt write still held: '+(r?.code||'UNKNOWN')+
      '. Draft and possible-effect record retained; no automatic retry.';
  }catch{promptStatus.textContent='Git observation unavailable. Previous effect remains uncertain.';}
  finally{busy=false;controls();}
});
