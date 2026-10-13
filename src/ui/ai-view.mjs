// I10 operator UI: immutable prompt versions, bounded source-bound jobs.
// Never send page code, proof objects, session identifiers or privileged Git commands.
const id=s=>document.getElementById(s);
const prompt=id('pcms-ai-prompt'),testNames=id('pcms-ai-tests'),json=id('pcms-ai-prompt-json');
const save=id('pcms-ai-save'),importButton=id('pcms-ai-import'),exportButton=id('pcms-ai-export');
const configStatus=id('pcms-ai-config-status'),historyHost=id('pcms-ai-prompt-history');
const slug=id('pcms-ai-slug'),token=id('pcms-ai-git-token'),prepare=id('pcms-ai-prepare');
const refresh=id('pcms-ai-refresh'),jobStatus=id('pcms-ai-jobs-status'),jobList=id('pcms-ai-job-list');
const runNative=id('pcms-ai-run'),observeNative=id('pcms-ai-observe'),
  testNative=id('pcms-ai-test'),repairNative=id('pcms-ai-repair'),
  resetNative=id('pcms-ai-newchat'),chat2Native=id('pcms-ai-chat2');
let current=null,busy=false,queueSeq=0,selectedJob=null;
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
  importButton.disabled=busy||!current?.ok;
  exportButton.disabled=busy;
  refresh.disabled=busy;
  const selected=selectedJob?.ok===true;
  runNative.disabled=busy||!selected||selectedJob.state!=='PENDING_NATIVE_SESSION';
  observeNative.disabled=busy||!selected||
    !['HELD_RECONCILE','TESTS_UNVERIFIED','KNOWN_FAILURE'].includes(selectedJob.state);
  testNative.disabled=busy||!selected||selectedJob.state!=='TESTS_UNVERIFIED';
  repairNative.disabled=busy||!selected||selectedJob.state!=='KNOWN_FAILURE'||!
    ['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(selectedJob.nativeState);
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
  try{
    const data=await ai('LIST_JOBS');
    if(own!==queueSeq)return;
    jobList.replaceChildren();
    if(!data?.ok){jobStatus.textContent=data?.code||'AI_JOBS_UNAVAILABLE';return;}
    if(!data.jobs.length){jobStatus.textContent='No jobs prepared. Native AI execution remains held.';return;}
    const ul=document.createElement('ul');
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
      label.textContent=j.slug+' · '+j.state+' · Settings P'+j.promptRevision+
        ' · source '+j.sourceFingerprint.slice(0,12)+
        ' · '+(j.evidence?.state||'TESTS_UNVERIFIED')+
        ' · '+(j.hold||'No external PASS claimed');
      li.append(label);ul.append(li);
    }
    jobList.append(ul);
    if(data.truncated)jobList.append(document.createTextNode(' Additional jobs omitted.'));
    jobStatus.textContent='Canonical job receipts · no helper session or source body disclosed.';
  }catch{if(own===queueSeq)jobStatus.textContent='AI receipts unavailable; do not infer completion.';}
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
    'Checking guarded native effect capability; no dispatch without authorization…';
  try{
    const answer=await ai(type,{slug:name,expectedRevision:revision,
      ...(step?{step}:{})});
    // A send response itself never proves remote state, even if acknowledged.
    jobStatus.textContent=(answer?.code||
      (answer?.ok?'Canonical observation recorded':'AI_OUTCOME_UNKNOWN'))+
      ' · '+(answer?.tests||'no independent test PASS claimed');
  }catch{
    jobStatus.textContent='Native command disconnected. Effect may have occurred; do not retry before independent reconciliation.';
  }finally{
    busy=false;selectedJob=null;controls();await refreshJobs();
  }
}
runNative.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE','CHAT1_SEND'));
observeNative.addEventListener('click',()=>nativeCommand('PROBE_NATIVE'));
testNative.addEventListener('click',()=>nativeCommand('RUN_TESTS'));
repairNative.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE',
  selectedJob?.nativeState==='CHAT2_OBSERVED_IDLE'?'CHAT2_REPAIR':'CHAT1_REPAIR'));
resetNative.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE','CHAT2_RESET'));
chat2Native.addEventListener('click',()=>nativeCommand('BEGIN_NATIVE','CHAT2_SEND'));
prepare.addEventListener('click',prepareJob);
refresh.addEventListener('click',refreshJobs);
slug.addEventListener('input',controls);
token.addEventListener('input',controls);
controls();
ai('GET_PROMPTS').then(renderPrompt).catch(()=>{
  configStatus.textContent='Cannot load Settings revision. No update can be claimed.';
});
refreshJobs();
