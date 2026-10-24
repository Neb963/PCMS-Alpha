// Primary generator intake/progress. This view never manufactures ownership,
// effect success or revisions; each action uses the production typed boundary.
const port='pcms-s00-coordinator';
const DRAFT='pcmsUiCreationDraftV1';
const labels={WAITING_CAPABILITY:'Waiting for allocation',OWNER_READBACK_PENDING:'Checking ownership',
 OWNER_MISSING_VERIFIED:'Preparing private creation',CREATE_PREPARED:'Preparing private creation',
 CREATE_OBSERVING:'Confirming creation',CREATE_UNCERTAIN:'Reconciling creation',
 CREATE_DISPATCH_POSSIBLE:'Reconciling creation',PRIVATE_EMPTY_CONFIRMED:'Preparing name',
 RENAME_PREPARED:'Preparing name',RENAME_OBSERVING:'Confirming name',RENAME_UNCERTAIN:'Reconciling name',
 RENAME_DISPATCH_POSSIBLE:'Reconciling name',ADOPTION_ORIGINAL_PENDING:'Preserving original source',
 GIT_INIT_PENDING:'Generator confirmed · preparing Git',GIT_PREPARED:'Generator confirmed · preparing Git',
 GIT_OBSERVING:'Generator confirmed · checking Git',GIT_UNCERTAIN:'Generator confirmed · reconciling Git',
 GIT_DISPATCH_POSSIBLE:'Generator confirmed · reconciling Git',ASSOCIATED_NOT_READY:'Generator and source linked',
 INTAKE_HELD:'Input needs attention',STAGED:'Saved input · not submitted',QUEUED:'Queued for allocation'};
export function createGeneratorBatches({root,el,b,request,accounts,reload,manageAccount,notify}){
 const call=(type,params={},timeout=30000)=>request(port,type,params,timeout);
 function dialog(title){
  const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
  const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
  const head=el('div','drawer-head'),body=el('div','drawer-body');head.append(el('h2','drawer-title',title),b('Close',close));
  panel.append(head,body);overlay.append(panel);root.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}
   if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not(:disabled),input,select,textarea')].filter(x=>x.getClientRects().length);
    const at=nodes.indexOf(root.activeElement);if(e.shiftKey&&at===0){e.preventDefault();nodes.at(-1)?.focus()}
    else if(!e.shiftKey&&at===nodes.length-1){e.preventDefault();nodes[0]?.focus()}}});
  head.querySelector('button').focus({preventScroll:true});return {overlay,panel,body,close};
 }
 const accountName=(id,rows)=>rows.find(a=>a.accountId===id)?.alias||id||'Awaiting allocation';
 function explain(code){
  if(!code)return '';
  if(code==='NO_MANAGED_ACCOUNTS')return 'Add an account in Accounts. Submitted requests can wait safely.';
  if(code.includes('QUARANTINED'))return 'Historical operation retained for manual investigation.';
  if(/INVENTORY|(?:^|_)COUNT(?:_|$)/.test(code))return 'Synchronize account inventory; queued work is preserved.';
  if(/ROUTE|GUARD|DONOR/.test(code))return 'Check the account’s protected route.';
  if(/ACCOUNT|LOGIN|SESSION/.test(code))return 'Complete account login or reactivation.';
  if(/GIT|ARCHIVE|SOURCE_CHECKPOINT/.test(code))return 'Check GitHub connection and original-source backup.';
  if(/UNKNOWN|UNCERTAIN|READBACK/.test(code))return 'Waiting for independent readback. A possible effect will not be repeated.';
  if(/PIN|CONFLICT|OWNERSHIP|TARGET/.test(code))return 'Inspect this generator’s account and source association.';
  return 'This item needs attention. Other items continue.';
 }
 function openBatch(batchId){
  const d=dialog('Batch progress'),status=el('p','setting-note','Reading saved item progress…'),controls=el('div','toolbar');
  status.setAttribute('role','status');const query=el('input','form-input');query.type='search';query.maxLength=80;
  query.placeholder='Find a generator';query.setAttribute('aria-label','Search batch items');
  const filter=el('select','select');filter.setAttribute('aria-label','Filter batch progress');
  for(const [value,label] of [['ALL','All items'],['HELD','Needs attention'],['WORKING','In progress'],['CONFIRMED','Generator confirmed']]){
   const o=el('option','',label);o.value=value;filter.append(o);}
  const list=el('div'),pager=el('div','pagination-actions');let offset=0,epoch=0,busy=false,rows=[];
  controls.append(query,filter,b('Refresh',()=>void draw()));d.body.append(status,controls,list,pager);
  async function draw(focus=null){
   const current=++epoch;
   try{
    const [out,a]=await Promise.all([call('LIST_CREATE_BATCH_ITEMS',{batchId,offset,limit:25,query:query.value,status:filter.value}),accounts()]);
    if(!d.overlay.isConnected||current!==epoch)return;
    if(!out.ok)throw Error(out.code);rows=a.accounts||[];
    status.textContent=out.counts.confirmed+' generator'+(out.counts.confirmed===1?'':'s')+' confirmed · '+out.counts.working+' inputs in progress · '+out.counts.held+' inputs need attention'+
     (out.batch.state==='INGESTING'?' · input incomplete ('+out.batch.appended+'/'+out.batch.total+' saved)':'');
    list.replaceChildren();pager.replaceChildren();
    for(const item of out.items){const row=el('section','batch-item');row.dataset.batchIndex=item.index;
     row.append(el('strong','',item.slug),el('p','setting-note',accountName(item.accountId,rows)+' · '+(labels[item.state]||'Waiting for a safe checkpoint')+
      (item.coalesced?' · shared existing job':'')),el('p','setting-note',explain(item.hold)));
     if(item.intakeHeld){row.append(b('Retry this input',()=>void action('RETRY_CREATE_BATCH_HOLD',{batchId,index:item.index})))}
     else if(item.intentId&&item.state!=='ASSOCIATED_NOT_READY')row.append(b('Retry check',()=>void action('RUN_CREATE_STEP',{
      intentId:item.intentId,expectedRevision:item.revision})));
     if(item.accountId)row.append(b('Manage account',()=>{const a=rows.find(a=>a.accountId===item.accountId);if(a){d.close();manageAccount(a)}}));
     list.append(row);
    }
    if(!out.items.length)list.append(el('p','setting-note','No matching items.'));
    const previous=b('Previous',()=>{offset=Math.max(0,offset-25);void draw('Previous')});previous.disabled=offset===0;
    const next=b('Next',()=>{offset+=25;void draw('Next')});next.disabled=!out.more;
    pager.append(previous,el('span','',String(out.total?offset+1:0)+'–'+Math.min(offset+25,out.total)+' of '+out.total),next);
    if(focus)([...pager.querySelectorAll('button:not(:disabled)')].find(n=>n.textContent===focus)||previous)?.focus({preventScroll:true});
   }catch{status.textContent='Progress could not be read. Saved requests are preserved. Use Refresh to retry.'}
  }
  async function action(type,params){if(busy)return;busy=true;
   try{const out=await call(type,params,100000);notify(out?.ok?'Checkpoint updated.':explain(out?.code));await draw();await reload()}
   catch{status.textContent='The result was not confirmed. Refresh this item before retrying.'}finally{busy=false}}
  let timer;query.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{offset=0;void draw()},180)});
  filter.addEventListener('change',()=>{offset=0;void draw()});void draw();
  const polling=setInterval(()=>{if(!d.overlay.isConnected){clearInterval(polling);return}
    if(!busy&&!list.contains(root.activeElement)&&!pager.contains(root.activeElement)&&root.activeElement!==query&&root.activeElement!==filter)void draw();},2500);
 }
 function openHistory(){
  const d=dialog('Creation batches'),status=el('p','setting-note','Reading saved batches…'),list=el('div'),pager=el('div','pagination-actions');
  d.body.append(status,list,pager);let after=null,history=[];
  async function draw(){try{const out=await call('LIST_CREATE_BATCHES',{after,limit:20});if(!out.ok)throw Error(out.code);
   list.replaceChildren();pager.replaceChildren();status.textContent=out.items.length?'Background work continues with PCMS closed. Open a batch for item progress.':'No creation batches yet.';
   for(const batch of out.items){const row=el('section','batch-item');row.append(el('strong','',batch.total+' generator requests'),
    el('p','setting-note',(batch.createdAt?new Date(batch.createdAt).toLocaleString()+' · ':'')+
     (batch.state==='CANCELLED'?'Unsubmitted input canceled':batch.state==='INGESTING'?batch.appended+'/'+batch.total+' inputs saved · incomplete':batch.processed+'/'+batch.total+' inputs queued')),
    b('View progress',()=>{d.close();openBatch(batch.batchId)}));
    if(batch.state==='INGESTING')row.append(b('Recover saved input',()=>{d.close();openCreator()}),
      b('Cancel unfinished input',()=>void(async()=>{const out=await call('CANCEL_CREATE_BATCH',{batchId:batch.batchId});
        if(out.ok)await draw();else notify('Input could not be canceled. Submitted work is preserved.');})()));list.append(row)}
   const prev=b('Previous',()=>{after=history.pop()??null;void draw()});prev.disabled=!history.length;
   const next=b('Next',()=>{history.push(after);after=out.next;void draw()});next.disabled=!out.more;pager.append(prev,next);
  }catch{status.textContent='Batch history unavailable. Your requests are preserved.'}}
  void draw();
 }
 function openCreator(){
  const d=dialog('Create generators'),label=el('label','','Generator names (one per line)'),input=el('textarea','form-input');
  input.rows=7;input.placeholder='my-generator\nsecond-generator';input.setAttribute('aria-label','Generator names');label.append(input);
  const accountLabel=el('label','','Account'),choice=el('select','select');choice.setAttribute('aria-label','Creation account');
  const auto=el('option','','Automatic — balanced');auto.value='';choice.append(auto);accountLabel.append(choice);
  const status=el('p','setting-note','Preview account assignments before submitting. Existing owned generators are reconciled; new generators start private.'),preview=el('div'),actions=el('div','form-foot');
  status.setAttribute('role','status');d.body.append(label,accountLabel,status,preview,actions);
  let frozen=null,accountRows=[],busy=false,offset=0,persisted=null;
  const policyStatus=el('p','setting-note'),policyButton=b('Checking creation policy…',()=>void togglePolicy());policyButton.disabled=true;
  let policy=null;
  async function loadPolicy(){try{const out=await request('pcms-s06-authority','GET_OPERATOR_MANAGEMENT',{},12000);
    if(!out.ok)throw Error(out.code);policy=out;policyButton.disabled=false;policyButton.textContent=out.enabled?'Pause creation':'Resume creation';
    policyStatus.hidden=out.enabled;policyStatus.textContent=out.enabled?'':'New creation is paused. Submitted requests wait safely until you resume.';
   }catch{policyStatus.hidden=false;policyStatus.textContent='Creation policy could not be read. Saved requests remain safe.'}}
  async function togglePolicy(){if(!policy)return;policyButton.disabled=true;
   try{const out=await request('pcms-s06-authority','SET_OPERATOR_MANAGEMENT',{enabled:!policy.enabled,expectedRevision:policy.revision},15000);
    if(!out.ok)throw Error(out.code);await loadPolicy();
    if(out.enabled)try{await browser.alarms.create('pcms-s04-creation-followup',{when:Date.now()+1000})}catch{}
   }catch{policyStatus.textContent='Policy change was not confirmed. Refresh before retrying.';await loadPolicy()}}
  d.body.append(policyStatus,policyButton);void loadPolicy();
  void accounts().then(out=>{accountRows=out.accounts||[];
   for(const a of accountRows.filter(a=>a.state!=='ARCHIVED')){const o=el('option','',a.alias||a.accountId);o.value=a.accountId;choice.append(o)}}).catch(()=>{status.textContent='Accounts unavailable. Retry preview after recovering Accounts.'});
  function reset(){if(!busy){frozen=null;preview.replaceChildren();submit.hidden=true;review.hidden=false;review.textContent='Preview assignments';review.className='btn primary';status.textContent='Preview the updated inputs before submitting.'}}
  input.addEventListener('input',reset);choice.addEventListener('change',reset);
  function draw(){preview.replaceChildren();
   const totals={CREATE:0,ADOPT:0,COALESCED:0,HELD:0},per=new Map();for(const r of frozen.items){totals[r.action]++;if(r.accountId&&r.action==='CREATE')per.set(r.accountId,(per.get(r.accountId)||0)+1)}
   preview.append(el('p','setting-note',totals.CREATE+' new · '+totals.ADOPT+' existing owned · '+totals.COALESCED+' shared jobs · '+totals.HELD+' need attention'));
   for(const id of frozen.inventoryBlockers||[]){const account=accountRows.find(a=>a.accountId===id);
    if(account)preview.append(b('Complete inventory · '+accountName(id,accountRows),()=>manageAccount(account)));}
   const allocationSummary=per.size>4?el('details'):preview;
   if(per.size>4){allocationSummary.append(el('summary','setting-note',per.size+' account allocations'));preview.append(allocationSummary)}
   for(const [id,count] of per)allocationSummary.append(el('p','setting-note',accountName(id,accountRows)+': '+count+' planned new'));
   for(const r of frozen.items.slice(offset,offset+25)){const row=el('div','batch-item');row.append(el('strong','',r.slug),el('p','setting-note',
    ({CREATE:'Create private',ADOPT:'Reconcile existing',COALESCED:'Share existing job',HELD:'Needs attention'})[r.action]+' · '+accountName(r.accountId,accountRows)+(r.waiting?' · waits for account recovery':'')),el('p','setting-note',explain(r.code)));preview.append(row)}
   const pager=el('div','pagination-actions'),prev=b('Previous',()=>{offset=Math.max(0,offset-25);draw()}),next=b('Next',()=>{offset+=25;draw()});prev.disabled=offset===0;next.disabled=offset+25>=frozen.items.length;
   pager.append(prev,el('span','',String(offset+1)+'–'+Math.min(offset+25,frozen.items.length)+' of '+frozen.items.length),next);preview.append(pager);
  }
  const review=b('Preview assignments',()=>void(async()=>{
   const slugs=input.value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
   if(!slugs.length||slugs.some(s=>!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s))){status.textContent='Use lowercase letters, numbers and hyphens. Your input is preserved.';return}
   busy=true;review.disabled=true;input.disabled=true;choice.disabled=true;status.textContent='Reading current counts and existing jobs…';
   try{const out=await call('PREVIEW_CREATE_BATCH',{slugs,accountId:choice.value||null},60000);if(!out.ok)throw Error(out.code);
    const inventoryBlockers=out.items.some(i=>i.code==='INITIAL_INVENTORY_UNKNOWN')?
      (out.accounts||[]).filter(a=>a.state!=='ARCHIVED'&&!a.initialKnown&&(!choice.value||a.accountId===choice.value)).map(a=>a.accountId):[];
    frozen=Object.freeze({slugs:[...slugs],accountId:choice.value||null,items:out.items,inventoryBlockers});offset=0;persisted=null;
    draw();status.textContent='Preview frozen for these inputs. Counts are checked again before creation; held items do not stop the others.';
    submit.hidden=false;review.hidden=false;review.textContent='Update preview';review.className='btn';submit.focus();
   }catch{status.textContent='Preview unavailable. Your input is preserved. Retry after checking Accounts.'}
   finally{busy=false;review.disabled=false;input.disabled=false;choice.disabled=false}
  })(),'btn primary');
  const submit=b('Submit batch',()=>void(async()=>{
   if(!frozen||busy)return;busy=true;submit.disabled=true;input.disabled=true;choice.disabled=true;
   const batchId=persisted||'batch_'+crypto.randomUUID().replaceAll('-','');persisted=batchId;
   try{
    await browser.storage.local.set({[DRAFT]:{batchId,...frozen}});
    const begin=await call('BEGIN_CREATE_BATCH',{batchId,total:frozen.slugs.length,accountId:frozen.accountId});if(!begin.ok)throw Error(begin.code);
    for(let at=begin.batch.appended;at<frozen.slugs.length;at+=32){const chunk=frozen.slugs.slice(at,at+32);let out;
     try{out=await call('APPEND_CREATE_BATCH',{batchId,offset:at,slugs:chunk})}catch{
      const observed=await call('GET_CREATE_BATCH',{batchId});if(observed.ok&&observed.batch.appended>=at+chunk.length)out={ok:true};else throw Error('INPUT_ACK_UNKNOWN')}
     if(!out.ok)throw Error(out.code);status.textContent='Saved '+Math.min(at+32,frozen.slugs.length)+' of '+frozen.slugs.length+' requests…';}
    let final;try{final=await call('FINALIZE_CREATE_BATCH',{batchId})}catch{final=await call('GET_CREATE_BATCH',{batchId})}
    if(!final.ok||final.batch.state==='INGESTING')throw Error('FINALIZATION_UNCONFIRMED');
    try{await browser.alarms.create('pcms-s04-creation-followup',{when:Date.now()+1000})}catch{}
    await browser.storage.local.remove(DRAFT);
    d.close();openBatch(batchId);await reload();
   }catch{status.textContent='Submission was interrupted. Saved input is retained. Retry submission to resume this same batch.'}
   finally{busy=false;submit.disabled=false;input.disabled=false;choice.disabled=false}
  })(),'btn primary');submit.hidden=true;
  const resume=b('Resume saved submission',()=>void resumeDraft()),cancel=b('Cancel unfinished input',()=>void cancelDraft());
  resume.hidden=true;cancel.hidden=true;let savedDraft=null;
  async function resumeDraft(){if(!savedDraft)return;
   try{const out=await call('GET_CREATE_BATCH',{batchId:savedDraft.batchId});
    if(out.ok&&out.batch.state!=='INGESTING'){await browser.storage.local.remove(DRAFT);d.close();openBatch(savedDraft.batchId);return}
    if(!out.ok&&out.code!=='BATCH_NOT_FOUND')throw Error(out.code);
    frozen=savedDraft;persisted=savedDraft.batchId;input.value=frozen.slugs.join('\n');choice.value=frozen.accountId||'';
    input.disabled=true;choice.disabled=true;review.hidden=true;resume.hidden=true;submit.hidden=false;draw();
    status.textContent='Saved submission restored. Resume uses the same durable batch and inputs.';
   }catch{status.textContent='Saved submission could not be inspected. Its input is preserved.'}
  }
  async function cancelDraft(){if(!savedDraft)return;
   try{const out=await call('CANCEL_CREATE_BATCH',{batchId:savedDraft.batchId});
    if(!out.ok&&!['BATCH_NOT_FOUND','BATCH_ALREADY_SUBMITTED'].includes(out.code))throw Error(out.code);
    await browser.storage.local.remove(DRAFT);d.close();
    if(out.code==='BATCH_ALREADY_SUBMITTED')openBatch(savedDraft.batchId);else openCreator();
   }catch{status.textContent='Cancellation was not confirmed. Saved input is preserved.'}
  }
  void browser.storage.local.get(DRAFT).then(data=>{const saved=data[DRAFT];
   if(!saved||!/^batch_[a-f0-9]{32}$/.test(saved.batchId||'')||!Array.isArray(saved.slugs)||!saved.slugs.length||
      saved.slugs.some(s=>typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s))||
      !Array.isArray(saved.items)||saved.items.length!==saved.slugs.length)return;
   savedDraft=saved;resume.hidden=false;cancel.hidden=false;review.disabled=true;input.disabled=true;choice.disabled=true;
   status.textContent='An interrupted submission has saved inputs. Resume it or cancel the unfinished input before starting another.';
  }).catch(()=>{status.textContent='Saved input could not be read. Retry after checking Firefox storage.';review.disabled=true});
  actions.append(review,submit,resume,cancel,b('Batch history',()=>{d.close();openHistory()}));input.focus();
 }
 return {openCreator,openBatch,openHistory};
}
