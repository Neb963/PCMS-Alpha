// I10 operator UI: immutable prompt versions, bounded source-bound jobs.
// Never send page code, proof objects, session identifiers or privileged Git commands.
const id=s=>document.getElementById(s);
const prompt=id('pcms-ai-prompt'),testNames=id('pcms-ai-tests'),json=id('pcms-ai-prompt-json');
const save=id('pcms-ai-save'),importButton=id('pcms-ai-import'),exportButton=id('pcms-ai-export');
const configStatus=id('pcms-ai-config-status'),historyHost=id('pcms-ai-prompt-history');
const perAccount=id('pcms-ai-per-account'),saveConcurrency=id('pcms-ai-save-concurrency'),
  concurrencyStatus=id('pcms-ai-concurrency-status');
const slug=id('pcms-ai-slug'),token=id('pcms-ai-git-token'),prepare=id('pcms-ai-prepare');
const refresh=id('pcms-ai-refresh'),jobStatus=id('pcms-ai-jobs-status'),jobList=id('pcms-ai-job-list');
const runNative=id('pcms-ai-run'),observeNative=id('pcms-ai-observe'),
  advanceNative=id('pcms-ai-advance'),opfsNative=id('pcms-ai-opfs'),
  freshNative=id('pcms-ai-fresh'),
  testNative=id('pcms-ai-test'),repairNative=id('pcms-ai-repair'),
  resetNative=id('pcms-ai-newchat'),chat2Native=id('pcms-ai-chat2');
let current=null,concurrency=null,busy=false,queueSeq=0,selectedJob=null;
function request(portName,type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:portName});let ended=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),70000);
    function finish(data,error){
      if(ended)return;ended=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      error?reject(error):resolve(data);
    }
    port.onMessage.addListener(data=>finish(data));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
const ai=(type,params)=>request('pcms-i10-ai',type,params);
function controls(){
  save.disabled=busy||!current?.ok;
  saveConcurrency.disabled=busy||!concurrency?.ok;
  importButton.disabled=busy||!current?.ok;
  exportButton.disabled=busy;
  refresh.disabled=busy;
  const selected=selectedJob?.ok===true;
  runNative.disabled=busy||!selected||selectedJob.state!=='PENDING_NATIVE_SESSION';
  opfsNative.disabled=busy||!selected||selectedJob.nativeState!=='CHAT2_OBSERVED_IDLE'||
    selectedJob.chat2IsolationVerified===true;
  freshNative.disabled=busy||!selected||
    selectedJob.nativeState!=='CHAT2_OBSERVED_IDLE'||
    selectedJob.chat2IsolationVerified===true;
  advanceNative.disabled=busy||!selected||selectedJob.slotReleased===true||
    ['TESTS_VERIFIED','HELD_NO_PROGRESS','HUMAN_OWNED'].includes(selectedJob.state);
  observeNative.disabled=busy||!selected||
    !['HELD_RECONCILE','TESTS_UNVERIFIED','KNOWN_FAILURE'].includes(selectedJob.state);
  testNative.disabled=busy||!selected||selectedJob.state!=='TESTS_UNVERIFIED';
  repairNative.disabled=busy||!selected||selectedJob.state!=='KNOWN_FAILURE'||!
    ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(selectedJob.nativeState)||
    (selectedJob.nativeState==='CHAT2_OBSERVED_IDLE'&&
     selectedJob.chat2IsolationVerified!==true);
  resetNative.disabled=busy||!selected||
    selectedJob.evidence?.chat1Pass!==true;
  chat2Native.disabled=busy||!selected||
    selectedJob.optionalTestingSha===null;
  prepare.disabled=busy||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug.value)||
    token.value.length<10;
}
function renderPrompt(data){
  current=data;
  if(!data?.ok){configStatus.textContent=(data?.code||'PROMPT_UNAVAILABLE')+
    ' · configuration unchanged';controls();return;}
  prompt.value=data.current.text;
  testNames.value=data.current.tests.join(', ');
  historyHost.replaceChildren();
  const list=document.createElement('ol');
  for(const version of data.history){
    const li=document.createElement('li');
    li.textContent='Revision '+version.revision+' · '+version.tests.length+
      ' required assertion(s) · '+version.text.length+' instruction characters';
    list.append(li);
  }
  historyHost.append(list);
  configStatus.textContent='Current revision '+data.current.revision+
    ' · future jobs use these settings; active jobs remain pinned.';
  controls();
}
async function change(type,params,caption){
  if(busy)return;busy=true;controls();configStatus.textContent=caption;
  try{
    const r=await ai(type,params);
    if(r?.ok)renderPrompt(r);
    else configStatus.textContent=(r?.code||'CONFIGURATION_UNKNOWN')+
      ' · no successful Settings revision claimed';
  }catch{configStatus.textContent='Request disconnected; reload Settings to determine committed revision.';}
  finally{busy=false;controls();}
}
save.addEventListener('click',()=>{
  const tests=testNames.value.split(',').map(s=>s.trim()).filter(Boolean);
  change('SET_PROMPT',{text:prompt.value,tests,expectedRevision:current?.current?.revision},
    'Committing a new Settings revision…');
});
exportButton.addEventListener('click',async()=>{
  try{
    const r=await ai('EXPORT_PROMPTS');
    if(!r?.ok){configStatus.textContent=r?.code||'EXPORT_UNAVAILABLE';return;}
    json.value=JSON.stringify({format:r.format,history:r.history},null,2);
    configStatus.textContent='Version history serialized locally in the JSON field; copy and save it as needed.';
  }catch{configStatus.textContent='Export interrupted; no copy available.';}
});
importButton.addEventListener('click',()=>{
  let envelope;
  try{envelope=JSON.parse(json.value);}catch{
    configStatus.textContent='Invalid JSON. No Settings revision committed.';return;
  }
  change('IMPORT_PROMPT',{envelope,expectedRevision:current?.current?.revision},
    'Importing the latest supplied instructions as a NEW revision…');
});
async function refreshJobs(){
  const own=++queueSeq;
  jobList.replaceChildren();
  const ul=document.createElement('ul');
  jobList.append(ul);
  let after='',loaded=0;
  try{
    while(true){
      const data=await ai('LIST_JOBS',{after,limit:200});
      if(own!==queueSeq)return;
      if(!data?.ok){jobStatus.textContent=data?.code||'AI_JOBS_UNAVAILABLE';return;}
      for(const j of data.jobs){
      const li=document.createElement('li');
      const choose=document.createElement('button');
      choose.type='button';choose.textContent='Select '+j.slug;
      choose.addEventListener('click',()=>{
        selectedJob=j;slug.value=j.slug;controls();
        jobStatus.textContent=j.slug+' selected · '+j.state+
          ' · native AI activation remains separately gated.';
      });
      li.append(choose,document.createTextNode(' '));
      const label=document.createElement('span');
      const retry=Number.isSafeInteger(j.schedulerDeferredUntil)&&
        j.schedulerDeferredUntil>Date.now()?
        ' · scheduler held until '+new Date(j.schedulerDeferredUntil).toLocaleString()+
        ' ('+(j.schedulerHold||'AI_WAKE_HELD')+')':'';
      label.textContent=j.slug+' · '+j.state+' · Settings P'+j.promptRevision+
        ' · source '+j.sourceFingerprint.slice(0,12)+
        ' · '+(j.evidence?.state||'TESTS_UNVERIFIED')+
        ' · '+(j.hold||'No external PASS claimed')+retry;
      li.append(label);ul.append(li);
    }
      }
      loaded+=data.jobs.length;
      jobStatus.textContent='Loaded '+loaded+' canonical AI job receipts; no source bodies disclosed.';
      if(!data.more)break;
      if(!data.nextCursor||data.nextCursor<=after)
        throw Error('PAGINATION_STALLED');
      after=data.nextCursor;
    }
    if(!loaded)jobStatus.textContent='No jobs prepared. Native AI execution remains held.';
  }catch{if(own===queueSeq)
    jobStatus.textContent='AI listing incomplete; no missing job or completion inferred.';}
}
async function prepareJob(){
  if(busy)return;
  const name=slug.value,readToken=token.value;token.value='';
  busy=true;controls();
  jobStatus.textContent='Rechecking stage revision, protected Persona, clean editor, private Git READY and pinned tests…';
  try{
    const prior=await request('pcms-i09-staging','GET_STAGE',{slug:name});
    if(!prior?.ok){jobStatus.textContent=prior?.code||'STAGE_UNAVAILABLE';return;}
    const result=await ai('PREPARE_JOB',{
      slug:name,expectedStageRevision:prior.revision,token:readToken
    });
    if(!result?.ok){jobStatus.textContent=(result?.code||'AI_JOB_UNVERIFIED')+
      ' · held; no AI provider action';return;}
    jobStatus.textContent='Job prepared against exact saved source. Native AI execution/test oracle NOT VERIFIED; provider activation OFF.';
  }catch{jobStatus.textContent='Unknown preparation outcome; refresh canonical receipts before trying again.';}
  finally{busy=false;controls();await refreshJobs();}
}
async function nativeCommand(type,step){
  if(busy||!selectedJob?.ok)return;
  const name=selectedJob.slug,revision=selectedJob.revision;
  busy=true;controls();
  jobStatus.textContent=type==='PROBE_NATIVE'?
    'Observing native session without retry and checking saved source bytes…':
    type==='INSPECT_WORKSPACE'?
    'Inspecting local OPFS read-only; server termination and workspace isolation remain unverified…':
    type==='VERIFY_FRESH_CHAT2'?
    'Read-only server-history check requires separate provider activation; no conversation text or session key is exported…':
    type==='RUN_TESTS'?
    'Running an independently observed browser assertion on exact saved source…':
    'Checking guarded native effect capability; no dispatch without authorization…';
  try{
    const answer=await ai(type,{slug:name,expectedRevision:revision,
      ...(step?{step}:{})});
    // A send response itself never proves remote state, even if acknowledged.
    const opfs=type==='INSPECT_WORKSPACE'&&answer?.ok?
      ' · Current OPFS workspace root: '+
      (answer.workspaceRootState==='PRESENT_UNTRUSTED'?
        'present (not independently verified)':'absent/unknown')+
      ' · server/worker isolation UNVERIFIED':'';
    const workerHold=answer?.code==='AI_CHAT2_PREVIOUS_WORKER_LOCK_RELOAD_REQUIRED'?
      ' · Perchance retained Chat 1’s page-lifetime worker lock after New Chat.'+
      ' Do not resend or reload a dirty editor. Once the source is saved and'+
      ' idle, manually reload the exact protected Chat 2 tab, reconcile its'+
      ' current S2 session, then request verification again.' : '';
    jobStatus.textContent=(answer?.code||
      (answer?.ok?'Canonical observation recorded':'AI_OUTCOME_UNKNOWN'))+
      ' · '+(answer?.tests||'no independent test PASS claimed')+opfs+workerHold;
  }catch{
    jobStatus.textContent='Native command disconnected. Effect may have occurred; do not retry before independent reconciliation.';
  }finally{
    busy=false;selectedJob=null;controls();await refreshJobs();
  }
}
advanceNative.addEventListener('click',()=>nativeCommand('ADVANCE_JOB'));
runNative.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE','CHAT1_SEND'));
observeNative.addEventListener('click',()=>nativeCommand('PROBE_NATIVE'));
opfsNative.addEventListener('click',()=>nativeCommand('INSPECT_WORKSPACE'));
freshNative.addEventListener('click',()=>nativeCommand('VERIFY_FRESH_CHAT2'));
testNative.addEventListener('click',()=>nativeCommand('RUN_TESTS'));
repairNative.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE',
  selectedJob?.nativeState==='CHAT2_OBSERVED_IDLE'?'CHAT2_REPAIR':'CHAT1_REPAIR'));
resetNative.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE','CHAT2_RESET'));
chat2Native.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE','CHAT2_SEND'));
async function refreshConcurrency(){
  try{
    const r=await ai('GET_CONCURRENCY');
    concurrency=r;
    if(r?.ok){
      perAccount.value=String(r.setting.perAccount);
      concurrencyStatus.textContent='Revision '+r.setting.revision+
        ' · new jobs only; default one per account.';
    }else concurrencyStatus.textContent=r?.code||'CONCURRENCY_UNVERIFIED';
  }catch{concurrencyStatus.textContent='Concurrency read unavailable; no setting assumed.';}
  controls();
}
saveConcurrency.addEventListener('click',async()=>{
  if(busy||!concurrency?.ok)return;
  const limit=Number(perAccount.value);
  if(!Number.isSafeInteger(limit)||limit<1||limit>4){
    concurrencyStatus.textContent='Enter an integer from 1 to 4.';return;
  }
  busy=true;controls();
  try{
    const r=await ai('SET_CONCURRENCY',{
      perAccount:limit,expectedRevision:concurrency.setting.revision
    });
    if(!r?.ok)concurrencyStatus.textContent=(r?.code||'SETTING_UNVERIFIED')+
      ' · refresh before retrying';
    else {
      concurrency=r;
      concurrencyStatus.textContent='Saved revision '+r.setting.revision+
        ' · affects only new job admissions.';
    }
  }catch{concurrencyStatus.textContent='Setting acknowledgment unknown; reload canonical revision.';}
  finally{busy=false;controls();}
});
prepare.addEventListener('click',prepareJob);
refresh.addEventListener('click',refreshJobs);
slug.addEventListener('input',controls);
token.addEventListener('input',controls);
controls();
ai('GET_PROMPTS').then(renderPrompt).catch(()=>{
  configStatus.textContent='Cannot load Settings revision. No update can be claimed.';
});
refreshJobs();

refreshConcurrency();
