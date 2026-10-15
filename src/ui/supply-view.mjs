import {requestTypedConfirmation,cancelPendingConfirmations} from './typed-confirm.mjs';
// I06 Generators/Work Queue: durable local plan and per-item receipts.
// No UI-supplied route/owner evidence and no implicit remote dispatch.
const el=id=>document.getElementById(id);
const select=el('pcms-supply-account'),input=el('pcms-supply-slugs');
const preview=el('pcms-supply-preview'),freeze=el('pcms-supply-freeze');
const feedback=el('pcms-supply-feedback'),rows=el('pcms-supply-items');
const queue=el('pcms-supply-queue'),refresh=el('pcms-supply-refresh');
let accounts=[],latest=null,seq=0,busy=false;
const rowMessages=new Map(),pendingSteps=new Set();
function remember(key,message){
  if(!rowMessages.has(key)&&rowMessages.size>=100)
    rowMessages.delete(rowMessages.keys().next().value);
  rowMessages.set(key,message);
}
function request(portName,type,params){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:portName});
    let completed=false;
    // A guarded remote create/rename may take several bounded independent
    // provider observations. Timeout does not authorize a second dispatch.
    const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),
      type==='EXECUTE_ITEM'?75000:type==='FINISH_SOURCE_FOLDER'?150000:6500);
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
    for(const value of [String(row.index??'—'),row.slug,
        !persisted&&row.state==='FROZEN'?'PREVIEWED':row.state,
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
  cancelPendingConfirmations(queue);
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
      ' · General writes held; only exact disposable private tests may be armed';
    const list=document.createElement('ul');
    for(const item of batch.items){
      const li=document.createElement('li');
      li.textContent=item.slug+' — '+item.state+(item.reason?' ('+item.reason+')':'')+
        ' · '+item.source;
      const rowKey=batch.batchId+'/'+item.itemId;
      const rowStatus=document.createElement('p');
      rowStatus.className='pcms-supply-row-status';
      rowStatus.setAttribute('role','status');
      rowStatus.setAttribute('aria-live','polite');
      rowStatus.textContent=rowMessages.get(rowKey)||'';
      const report=message=>{remember(rowKey,message);rowStatus.textContent=message;};
      // Exact-target, human-initiated disposable pilot only. A general
      // source/AI/publication/refresh capability remains independently OFF.
      // No batch-run or automatic retry, even if a provider reply is lost.
      if(['FROZEN','CREATE_CONFIRMED'].includes(item.state)){
        const isCreate=item.state==='FROZEN';
        const action=document.createElement('button');
        action.type='button';action.className='pcms-supply-guarded-step';
        const pilotSlug=/^pcms-test-[a-z0-9-]{8,88}$/.test(item.slug);
        action.textContent=isCreate?'Create private test':'Rename private test';
        action.setAttribute('aria-label',(isCreate?'Create private test for ':'Rename private test to ')+item.slug);
        action.disabled=!pilotSlug;
        if(!pilotSlug)action.title='Manual live testing is limited to disposable pcms-test- slugs.';
        action.addEventListener('click',async()=>{
          if(pendingSteps.has(rowKey))return;
          pendingSteps.add(rowKey);
          action.disabled=true;
          const typed=(isCreate?'CREATE ':'RENAME ')+item.slug;
          try{
            report('Awaiting exact confirmation; no remote operation has been attempted.');
            const confirmation=await requestTypedConfirmation(action,typed,
              'Authorize one protected private test operation. Cancel is safe. Never repeat a possibly-dispatched action without reconciliation.');
            if(confirmation===null){report('Cancelled. No remote command sent.');return;}
            report('Checking the current account binding, protected route and exact frozen revision…');
            const armed=await supply('ARM_DISPOSABLE_TEST',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision,
              confirmation});
            if(armed?.ok!==true){
              report('Authorization held: '+(armed?.code||'GUARD_UNVERIFIED')+
                '. No create or rename command sent.');return;
            }
            report('Authorized one scoped step. Dispatching only after durable journal admission…');
            const out=await supply('EXECUTE_ITEM',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision});
            report(out?.ok?
              'Canonical receipt saved. Inspect the new item state before proceeding.':
              'Held: '+(out?.code||'OUTCOME_UNVERIFIED')+
                '. Inspect canonical receipts and independently reconcile before any retry.');
          }catch{
            report('Response unavailable. Effect MAY have occurred; preserve the journal and do not retry blindly.');
          }finally{
            pendingSteps.delete(rowKey);
            action.disabled=!pilotSlug;
            const returnFocus=document.activeElement===action &&
              location.hash==='#work-queue';
            await fetchBatches();
            if(returnFocus) {
              const row=[...queue.querySelectorAll('li')]
                .find(node=>node.textContent.includes(item.slug));
              const next=row?.querySelector('button.pcms-supply-guarded-step')||
                row?.querySelector('.pcms-supply-row-status');
              if(next) {
                if(next.tagName!=='BUTTON')next.tabIndex=-1;
                if(!next.disabled)next.focus();
              }
            }
          }
        });
        li.append(document.createTextNode(' '),action);
      }
      // A separate, non-READY marker is the only Git effect this test can
      // authorize. Existing per-gens folders are never overwritten.
      if(['PROVIDER_CONFIRMED','SOURCE_PENDING'].includes(item.state)&&
         /^pcms-test-[a-z0-9-]{8,88}$/.test(item.slug)){
        const credential=document.createElement('input');
        credential.type='password';credential.autocomplete='off';
        credential.placeholder='Private per-gens write token';
        credential.setAttribute('aria-label','Ephemeral Git marker token for '+item.slug);
        credential.maxLength=512;
        const git=document.createElement('button');git.type='button';
        git.textContent='Create non-READY Git folder';
        git.addEventListener('click',async()=>{
          const guardKey=rowKey+':git';
          if(pendingSteps.has(guardKey))return;
          pendingSteps.add(guardKey);
          git.disabled=true;
          const expected='GIT '+item.slug;
          try{
            report('Awaiting exact Git marker confirmation. No Git write sent.');
            const confirmation=await requestTypedConfirmation(git,expected,
              'Create only an isolated non-READY marker in a new private Git folder. No overwrite or automatic retry.');
            if(confirmation===null){report('Git marker cancelled. No effect sent.');return;}
            const token=credential.value;credential.value='';
            report('Checking private Git marker authorization…');
            const armed=await supply('ARM_DISPOSABLE_GIT',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision,
              confirmation});
            if(armed?.ok!==true){
              report('Git marker held: '+(armed?.code||'GUARD_UNVERIFIED'));return;
            }
            report('One non-READY Git marker attempt; awaiting independent HEAD/tree readback…');
            const out=await supply('FINISH_SOURCE_FOLDER',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision,token});
            report(out?.ok?'Non-READY marker independently confirmed. Source is NOT READY.':
              'Git marker held: '+(out?.code||'OUTCOME_UNKNOWN')+
              '. Read canonical receipts; do not repeat an uncertain Git write.');
          }catch{
            credential.value='';
            report('Git reply unknown; inspect canonical receipts. No automatic retry.');
          }finally{
            pendingSteps.delete(guardKey);
            git.disabled=false;
            await fetchBatches();
          }
        });
        const label=document.createElement('label');label.textContent='Private Git token (not stored)';
        label.append(credential);
        li.append(document.createTextNode(' '),label,git);
      }
      if(['GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN','GIT_OBSERVING'].includes(item.state)){
        const credential=document.createElement('input');
        credential.type='password';credential.autocomplete='off';credential.maxLength=512;
        credential.setAttribute('aria-label','Git read token for reconciliation of '+item.slug);
        const label=document.createElement('label');label.textContent='Private Git read token';
        label.append(credential);
        const read=document.createElement('button');read.type='button';
        read.textContent='Reconcile Git marker (read-only)';
        read.addEventListener('click',async()=>{
          const token=credential.value;credential.value='';
          read.disabled=true;
          try{
            const out=await supply('RECONCILE_GIT',{
              batchId:batch.batchId,itemId:item.itemId,expectedRevision:item.revision,token});
            notice(out?.ok?'Marker independently confirmed; still NOT READY.':
              'Marker readback held: '+(out?.code||'UNVERIFIED')+'. No Git write or retry.');
          }catch{notice('Git readback unavailable. Preserve uncertain state.');}
          finally{read.disabled=false;await fetchBatches();}
        });
        li.append(document.createTextNode(' '),label,read);
      }
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
      li.append(rowStatus);
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
    notice('Preview and freeze preserve exact slugs locally. For a disposable private test, use a pcms-test- slug and confirm its single step in Work Queue.');
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
    notice('Batch '+res.batch.batchId+' frozen locally. No external effect yet. '+
      'Open Work Queue for an explicitly confirmed pcms-test- private creation; Git writes remain held.');
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
