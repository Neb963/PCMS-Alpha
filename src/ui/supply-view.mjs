// I06 Generators/Work Queue: durable local plan and per-item receipts.
// No UI-supplied route/owner evidence and no implicit remote dispatch.
const el=id=>document.getElementById(id);
const select=el('pcms-supply-account'),input=el('pcms-supply-slugs');
const preview=el('pcms-supply-preview'),freeze=el('pcms-supply-freeze');
const feedback=el('pcms-supply-feedback'),rows=el('pcms-supply-items');
const queue=el('pcms-supply-queue'),refresh=el('pcms-supply-refresh');
let accounts=[],latest=null,seq=0,busy=false;
function request(portName,type,params){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:portName});
    let completed=false;
    const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),6500);
    function finish(out,err){
      if(completed)return;completed=true;clearTimeout(timeout);
      try{port.disconnect();}catch{}
      if(err)reject(err);else resolve(out);
    }
    port.onMessage.addListener(out=>finish(out));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}
    catch{finish(null,Error('DISCONNECTED'));}
  });
}
const supply=(type,params)=>request('pcms-i06-supply',type,params);
const parsed=()=>input.value.replace(/\r\n/g,'\n').split('\n').filter(x=>x.length>0);
function setBusy(value){
  busy=value;preview.disabled=value;freeze.disabled=value||!latest||!latest.items.some(i=>i.state==='FROZEN');
  refresh.disabled=value;
}
function notice(text){feedback.textContent=text;}
function paint(items,persisted){
  rows.replaceChildren();
  for(const row of items){
    const tr=document.createElement('tr');
    for(const value of [String(row.index??'—'),row.slug,row.state,
        row.reason||'—']){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    rows.append(tr);
  }
  if(!items.length){
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=4;td.textContent='No local supply requests.';tr.append(td);rows.append(tr);
  }
  freeze.disabled=busy||persisted||!items.some(i=>i.state==='FROZEN');
}
function drawQueue(result){
  queue.replaceChildren();
  if(!result?.ok){
    queue.textContent='Local reservation receipts unavailable; no external action is implied.';
    return;
  }
  if(!result.batches.length){
    queue.textContent='No frozen slug batches. No provider effects attempted.';
    return;
  }
  for(const batch of result.batches){
    const section=document.createElement('section');
    const heading=document.createElement('h3');
    heading.textContent='Batch '+batch.batchId+' · '+batch.accountId;
    const summary=document.createElement('p');
    const counts=Object.create(null);
    for(const item of batch.items)counts[item.state]=(counts[item.state]||0)+1;
    summary.textContent=Object.entries(counts).map(([k,v])=>k+': '+v).join(' · ')+
      ' · Provider effects not activated';
    const list=document.createElement('ul');
    for(const item of batch.items){
      const li=document.createElement('li');
      li.textContent=item.slug+' — '+item.state+(item.reason?' ('+item.reason+')':'')+
        ' · '+item.source;
      if(['CREATE_UNCERTAIN','RENAME_UNCERTAIN',
          'CREATE_DISPATCH_POSSIBLE','RENAME_DISPATCH_POSSIBLE'].includes(item.state)){
        const action=document.createElement('button');
        action.type='button';action.textContent='Reconcile read-only';
        action.setAttribute('aria-label','Inspect uncertain remote state for '+item.slug);
        action.addEventListener('click',async()=>{
          action.disabled=true;action.textContent='Inspecting…';
          try{
            const result=await supply('RECONCILE_ITEM',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision});
            const status=document.createElement('span');
            status.textContent=result?.ok?
              ' Reconciled by independent owner and private-empty readback.' :
              ' Held: '+(result?.code||'READBACK_UNKNOWN')+'. No remote retry.';
            li.append(status);
            await fetchBatches();
          }catch{
            const status=document.createElement('span');
            status.textContent=' Readback unavailable; held without retry.';
            li.append(status);
          }finally{action.disabled=false;action.textContent='Reconcile read-only';}
        });
        li.append(document.createTextNode(' '),action);
      }
      list.append(li);
    }
    section.append(heading,summary,list);queue.append(section);
  }
  if(result.truncated){
    const p=document.createElement('p');p.textContent='Additional batches not displayed (bounded view).';
    queue.append(p);
  }
}
async function loadAccounts(){
  const mine=++seq;
  setBusy(true);
  try{
    const res=await request('pcms-i03-accounts','LIST_ACCOUNTS');
    if(mine!==seq)return;
    if(res?.ok!==true||res.truncated)throw Error('ACCOUNT_LIST_UNAVAILABLE');
    accounts=res.accounts.filter(a=>a.state==='VERIFIED'&&a.identity==='VERIFIED');
    const value=select.value;select.replaceChildren();
    const empty=document.createElement('option');
    empty.value='';empty.textContent='Choose verified account';select.append(empty);
    for(const a of accounts){
      const option=document.createElement('option');
      option.value=a.accountId;option.textContent=a.accountId+' · binding '+a.bindingVersion;
      select.append(option);
    }
    if(accounts.some(a=>a.accountId===value))select.value=value;
    notice('Local draft only. Freeze records immutable requested slugs, not a remote reservation. Provider activation is held.');
  }catch{
    if(mine===seq){accounts=[];select.replaceChildren();
      notice('Account authority unavailable. Cannot freeze a batch.');}
  }finally{if(mine===seq)setBusy(false);}
}
async function fetchBatches(){
  const mine=seq;
  try{
    const res=await supply('LIST_BATCHES');
    if(mine!==seq)return;
    drawQueue(res);
  }catch{if(mine===seq)drawQueue(null);}
}
function payload(){
  const account=accounts.find(a=>a.accountId===select.value);
  return account?{accountId:account.accountId,
    expectedAccountRevision:account.revision,slugs:parsed()}:null;
}
async function handlePreview(){
  if(busy)return;
  const p=payload();
  if(!p){notice('Select a currently verified account.');return;}
  setBusy(true);latest=null;paint([],false);
  const mine=++seq;
  try{
    const r=await supply('PREVIEW',p);
    if(mine!==seq)return;
    if(!r?.ok)throw Error(r?.code||'PLAN_UNAVAILABLE');
    latest=r.batch;paint(latest.items,false);
    const rejected=latest.items.filter(i=>i.state==='REJECTED').length;
    notice(latest.items.length+' exact requested slugs; '+rejected+
      ' locally rejected. Preview is not a global remote-availability check.');
  }catch(e){
    if(mine===seq)notice('Cannot preview: '+(e.message||'PLAN_UNAVAILABLE')+
      '. No batch committed and no provider effect attempted.');
  }finally{if(mine===seq)setBusy(false);}
}
preview.addEventListener('click',()=>{void handlePreview();});
freeze.addEventListener('click',async()=>{
  if(busy||!latest)return;
  const p=payload();
  if(!p){notice('Account no longer selected; re-preview.');return;}
  // Never freeze an altered input under an old operator preview.
  const list=latest.items.map(i=>i.slug);
  if(JSON.stringify(p.slugs)!==JSON.stringify(list)){
    latest=null;setBusy(false);notice('Input changed; preview again before freezing.');return;
  }
  p.batchId='batch_'+crypto.randomUUID().replaceAll('-','');
  const mine=++seq;setBusy(true);notice('Committing exact batch to canonical IndexedDB…');
  try{
    const res=await supply('FREEZE',p);
    if(mine!==seq)return;
    if(!res?.ok)throw Error(res?.code||'NOT_COMMITTED');
    latest=null;paint(res.batch.items,true);
    notice('Batch '+res.batch.batchId+' committed locally. Each item retains its requested slug. '+
      'Provider create/rename and Git folder writes remain held; no external effect claimed.');
    await fetchBatches();
  }catch(e){
    if(mine===seq)notice('Freeze not confirmed ('+(e.message||'UNKNOWN')+
      '). Refresh local Work Queue before retrying; no remote effect is implied.');
  }finally{if(mine===seq)setBusy(false);}
});
refresh.addEventListener('click',()=>{void loadAccounts();void fetchBatches();});
select.addEventListener('change',()=>{latest=null;paint([],false);notice('Account changed; new preview required.');});
input.addEventListener('input',()=>{latest=null;paint([],false);notice('Input changed; preview required before freezing.');});
window.addEventListener('hashchange',()=>{
  if(location.hash==='#generators')void loadAccounts();
  if(location.hash==='#work-queue')void fetchBatches();
});
paint([],false);void loadAccounts();void fetchBatches();
