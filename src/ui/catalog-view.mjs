// S03 main-only catalog and Git-authoritative prompt. No credential in storage.
const el=id=>document.getElementById(id);
const repo=el('pcms-catalog-repo'),token=el('pcms-catalog-token');
const scan=el('pcms-catalog-scan'),clear=el('pcms-catalog-clear');
const connect=el('pcms-catalog-connect'),disconnect=el('pcms-catalog-disconnect');
const status=el('pcms-catalog-status'),list=el('pcms-catalog-list');
const prompt=el('pcms-catalog-prompt');
let busy=false,generation=0,connected=false;
function message(text){status.textContent=text;}
function render(data){
  list.replaceChildren();prompt.value='';
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
}
repo.addEventListener('input',()=>{generation++;list.replaceChildren();prompt.value='';});
token.addEventListener('input',()=>{generation++;list.replaceChildren();prompt.value='';});
clear.addEventListener('click',()=>{generation++;token.value='';list.replaceChildren();
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
      connected=true;token.value='';
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
      connected=false;generation++;list.replaceChildren();prompt.value='';
      message('Git connection removed from OS vault and local configuration.');
    }else message('Disconnect held: '+(r?.code||'UNAVAILABLE')+'. No removal assumed.');
  }catch{message('Disconnect acknowledgment unavailable; recheck status before another operation.');}
  finally{busy=false;controls();}
});
scan.addEventListener('click',async()=>{
  const n=++generation;
  busy=true;controls();list.replaceChildren();prompt.value='';
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
      ' recognized entries. Initial import remains unapproved: ownership, account '+
      'allocation and explicit initial scope approval have not been established.');
  }catch{
    if(n===generation)message('Unable to complete scan. Previous state is not deletion evidence.');
  }finally{busy=false;controls();}
});
controls();
void refreshStatus();
