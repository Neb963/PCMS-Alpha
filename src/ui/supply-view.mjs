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
    const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),
      type==='RUN_CREATE_STEP'?65000:6500);
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
const creation=(type,params)=>request('pcms-s00-coordinator',type,params);
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
    queue.textContent='No legacy slug batches. No provider effects attempted.';
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
      if(['CREATE_PREPARED','RENAME_PREPARED','GIT_PREPARED'].includes(item.state)){
        const abort=document.createElement('button');abort.type='button';
        abort.textContent='Abort uncommitted intent';
        abort.setAttribute('aria-label','Abort pre-dispatch intent for '+item.slug);
        abort.addEventListener('click',async()=>{
          abort.disabled=true;
          try{
            const result=await supply('ABORT_PREPARED',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision});
            const status=document.createElement('span');
            status.textContent=result?.ok?
              ' Pre-dispatch intent cancelled in canonical journal.' :
              ' Hold: '+(result?.code||'ABORT_UNVERIFIED');
            li.append(status);await fetchBatches();
          }catch{
            const status=document.createElement('span');
            status.textContent=' Journal unavailable; intent not confirmed cancelled.';
            li.append(status);
          }finally{abort.disabled=false;}
        });
        li.append(document.createTextNode(' '),abort);
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
    if(res?.ok!==true)throw Error('ACCOUNT_LIST_UNAVAILABLE');
    accounts=res.accounts.filter(a=>a.state==='VERIFIED'&&a.identity==='VERIFIED');
    const value=select.value;select.replaceChildren();
    const empty=document.createElement('option');
    empty.value='';empty.textContent='Auto-allocate an eligible account';select.append(empty);
    for(const a of accounts){
      const option=document.createElement('option');
      option.value=a.accountId;option.textContent=a.accountId+' · binding '+a.bindingVersion;
      select.append(option);
    }
    if(accounts.some(a=>a.accountId===value))select.value=value;
    notice('Preview requested slugs, then record them in the unified creation queue. Provider and Git writes remain held.');
  }catch{
    if(mine===seq){accounts=[];select.replaceChildren();
      notice('Account list unavailable. Unpinned slug intake remains possible; allocation waits for verified inventory.');}
  }finally{if(mine===seq)setBusy(false);}
}
async function appendCanonicalQueue(mine,after=null){
  let res;
  try{res=await creation('LIST_CREATE_INTENTS',{after,limit:100});}
  catch{res={ok:false,code:'QUEUE_UNAVAILABLE'};}
  if(mine!==seq)return;
  let section=queue.querySelector('[data-pcms-creation-queue]');
  if(after===null){
    section=document.createElement('section');
    section.dataset.pcmsCreationQueue='true';
    const heading=document.createElement('h3');
    heading.textContent='Unified creation requests';
    const explanation=document.createElement('p');
    explanation.textContent='Operator and approved Git origins share one durable slug. Remote creation/adoption is held pending protected admission.';
    const list=document.createElement('ul');
    list.dataset.pcmsCreationList='true';
    section.append(heading,explanation,list);
    queue.prepend(section);
  }
  if(!section)return;
  const list=section.querySelector('[data-pcms-creation-list]');
  const oldMore=section.querySelector('[data-pcms-creation-more]');
  oldMore?.remove();
  if(res?.ok!==true){
    const line=document.createElement('p');
    line.textContent='Unified queue unavailable ('+(res?.code||'UNKNOWN')+'). No provider action inferred.';
    section.append(line);return;
  }
  if(res.items.length===0&&after===null){
    const line=document.createElement('li');
    line.textContent='No unified creation requests.';
    list.append(line);
  }
  for(const item of res.items){
    const line=document.createElement('li');
    line.textContent=item.slug+' — '+item.state+
      (item.hold?' ('+item.hold+')':'')+
      ' · '+item.origins.join(' + ')+
      (item.accountId?' · '+item.accountId:' · unallocated');
    if(!['ASSOCIATED_NOT_READY','TARGET_COLLISION_HELD'].includes(item.state)&&
       !item.conflict){
      const action=document.createElement('button');
      const uncertain=['CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN',
        'CREATE_OBSERVING','RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN',
        'RENAME_OBSERVING','GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN',
        'GIT_OBSERVING'].includes(item.state);
      action.type='button';
      action.textContent=uncertain?'Reconcile (no repeat write)':'Advance safely';
      action.setAttribute('aria-label',action.textContent+' for '+item.slug);
      action.addEventListener('click',async()=>{
        action.disabled=true;
        const before=action.textContent;action.textContent='Checking…';
        try{
          const result=await creation('RUN_CREATE_STEP',{
            intentId:item.intentId,expectedRevision:item.revision});
          if(mine!==seq)return;
          const status=document.createElement('span');
          status.textContent=result?.ok?
            ' · Recorded '+(result.record?.state||'new canonical revision'):
            ' · Held: '+(result?.code||'UNKNOWN')+'; no success inferred';
          line.append(status);
          await fetchBatches();
        }catch{
          if(mine===seq){
            const status=document.createElement('span');
            status.textContent=' · Acknowledgment uncertain. Refresh canonical queue before any further step.';
            line.append(status);
          }
        }finally{action.disabled=false;action.textContent=before;}
      });
      line.append(document.createTextNode(' '),action);
    }
    list.append(line);
  }
  if(res.truncated&&res.next){
    const more=document.createElement('button');more.type='button';
    more.dataset.pcmsCreationMore='true';
    more.textContent='Show more creation requests';
    more.addEventListener('click',()=>{
      more.disabled=true;void appendCanonicalQueue(mine,res.next);
    });
    section.append(more);
  }
}
async function fetchBatches(){
  const mine=seq;
  try{
    const res=await supply('LIST_BATCHES');
    if(mine!==seq)return;
    drawQueue(res);
  }catch{if(mine===seq)drawQueue(null);}
  if(mine===seq)await appendCanonicalQueue(mine);
}
function payload(){
  const account=accounts.find(a=>a.accountId===select.value);
  return {accountId:account?.accountId||null,slugs:parsed()};
}
async function handlePreview(){
  if(busy)return;
  const p=payload();
  setBusy(true);latest=null;paint([],false);
  const mine=++seq;
  try{
    const names=p.slugs;
    const seen=new Set();
    latest={items:names.map((slug,index)=>{
      const invalid=!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug);
      const duplicate=seen.has(slug);
      seen.add(slug);
      return {index,slug,state:invalid||duplicate?'REJECTED':'FROZEN',
        reason:invalid?'INVALID_SLUG':duplicate?'DUPLICATE_SLUG':null};
    })};
    if(mine!==seq)return;
    paint(latest.items,false);
    const rejected=latest.items.filter(i=>i.state==='REJECTED').length;
    notice(latest.items.length+' exact slugs; '+rejected+' locally invalid/duplicate. '+
      (p.accountId?'Explicit account pin selected.':'Eligible account will be allocated automatically.')+
      ' Provider ownership and absence are independently checked later.');
  }catch(e){
    if(mine===seq)notice('Cannot preview: '+(e.message||'PLAN_UNAVAILABLE')+
      '. No batch committed and no provider effect attempted.');
  }finally{if(mine===seq)setBusy(false);}
}
preview.addEventListener('click',()=>{void handlePreview();});
freeze.addEventListener('click',async()=>{
  if(busy||!latest)return;
  const p=payload();
  // Never freeze an altered input under an old operator preview.
  const list=latest.items.map(i=>i.slug);
  if(JSON.stringify(p.slugs)!==JSON.stringify(list)){
    latest=null;setBusy(false);notice('Input changed; preview again before freezing.');return;
  }
  const mine=++seq;setBusy(true);
  const outcomes=[];
  notice('Recording exact admissible slugs in the unified canonical queue…');
  try{
    for(const item of latest.items){
      if(item.state!=='FROZEN'){
        outcomes.push({...item});continue;
      }
      const intentId='intent_'+crypto.randomUUID().replaceAll('-','');
      let result;
      try{result=await creation('ACCEPT_CREATE_INTENT',{
        intentId,slug:item.slug,origin:'OPERATOR',
      ...(p.accountId?{accountId:p.accountId}:{})
      });}catch{result={ok:false,code:'ACK_UNKNOWN'};}
      if(mine!==seq)return;
      outcomes.push({...item,state:result?.ok?'WAITING_CAPABILITY':'HELD',
        reason:result?.ok?'S04_CREATION_ACTIVATION_HELD':result?.code||'ACK_UNKNOWN'});
    }
    latest=null;paint(outcomes,true);
    const stored=outcomes.filter(x=>x.state==='WAITING_CAPABILITY').length;
    notice(stored+' slug intents acknowledged in the canonical creation queue; '+
      (outcomes.length-stored)+' rejected or unconfirmed. A lost ACK requires queue inspection, not blind remote retry. No provider/Git effect.');
    await fetchBatches();
  }catch{
    if(mine===seq)notice('Canonical local intake interrupted. Inspect Work Queue before retrying. No remote effect was authorized.');
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
