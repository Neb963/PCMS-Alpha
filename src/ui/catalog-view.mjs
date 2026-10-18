// S03 main-only read-only catalog and Git-owned prompt. No credentials retained.
const el=id=>document.getElementById(id);
const repo=el('pcms-catalog-repo'),token=el('pcms-catalog-token');
const scan=el('pcms-catalog-scan'),clear=el('pcms-catalog-clear');
const status=el('pcms-catalog-status'),list=el('pcms-catalog-list');
const prompt=el('pcms-catalog-prompt');
let busy=false,generation=0;
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
const controls=()=>{scan.disabled=busy;repo.disabled=busy;};
repo.addEventListener('input',()=>{generation++;list.replaceChildren();prompt.value='';});
token.addEventListener('input',()=>{generation++;list.replaceChildren();prompt.value='';});
clear.addEventListener('click',()=>{generation++;token.value='';list.replaceChildren();
  prompt.value='';message('Credential cleared. No Git configuration saved.');});
scan.addEventListener('click',async()=>{
  const n=++generation;
  busy=true;controls();list.replaceChildren();prompt.value='';
  message('Reading the complete managed main tree; no remote writes.');
  let port;
  try{
    const result=await new Promise((resolve,reject)=>{
      port=browser.runtime.connect({name:'pcms-s03-catalog'});
      const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),90000);
      let done=false;
      function finish(value,error){
        if(done)return;done=true;clearTimeout(timeout);
        try{port.disconnect();}catch{}
        error?reject(error):resolve(value);
      }
      port.onMessage.addListener(v=>finish(v));
      port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
      port.postMessage({type:'SCAN_CATALOG',
        params:{repository:repo.value.trim(),token:token.value}});
    });
    if(generation!==n)return;
    if(!result?.ok || !result.complete){
      message('Catalog held: '+(result?.code||'INCOMPLETE')+
        '. No missing item or remote deletion inferred.');return;
    }
    render(result);
    message('Complete read-only snapshot. '+result.recognizedCount+
      ' recognized entries. Initial import remains unapproved: ownership, account '+
      'allocation and explicit initial scope approval have not been established.');
  }catch{
    if(n===generation)message('Unable to complete scan. Previous state is not a deletion receipt.');
  }finally{busy=false;controls();}
});
controls();
