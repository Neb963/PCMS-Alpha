const KEY='pcmsCleanPublicationSelection',valid=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const descriptions={MODIFIED_SOURCE_REQUIRES_INDIVIDUAL_REVIEW:'Modified source needs individual review.',CLEAN_INDEPENDENT_TESTS_REQUIRED:'Independent tests are incomplete.',CLEAN_CONFIRMED_GIT_SOURCE_REQUIRED:'Waiting for confirmed Git source.',CLEAN_CANDIDATE_NOT_READY:'Development is not ready.',CLEAN_CANDIDATE_OPERATOR_HOLD:'Paused or in human review.',EXISTING_PUBLICATION_REQUIRES_INSPECTION:'Publication already needs inspection.',EXACT_SOURCE_ALREADY_PUBLISHED:'This exact source is already published.',CLEAN_CANDIDATE_CHANGED:'The candidate changed; review it again.',CLEAN_OWNER_CHANGED:'Account or ownership changed.',INDEPENDENT_PUBLIC_READBACK:'Publication independently confirmed.',PUBLICATION_QUEUED:'Approved; publication is queued.',PUBLICATION_READBACK_PENDING:'Checking the publication result.',POSSIBLE_PUBLICATION_RECONCILE_ONLY:'Publication may have started; checking its result.',CANCELED_BEFORE_BATCH_DISPATCH:'Canceled before this batch dispatched it.'};
export function createCleanPublicationWorkspace({root,el,b,request,openReview,notify}){
 let selected=new Set(),toolbar=null;
 const storage=typeof browser==='object'?browser.storage.local:{get:async()=>({}),set:async()=>{throw Error('STORAGE_UNAVAILABLE')}};
 const ready=storage.get(KEY).then(r=>{if(Array.isArray(r[KEY]))selected=new Set(r[KEY].filter(valid).slice(0,100000));drawSelection()}).catch(()=>{});
 const save=()=>storage.set({[KEY]:[...selected].sort()});
 function drawSelection(){if(toolbar){const review=toolbar.querySelector('[data-clean-selection]');if(review)review.textContent=selected.size?'Review '+selected.size+' selected for publication':'Review publication selection';}
  for(const input of root.querySelectorAll('[data-clean-select]'))input.checked=selected.has(input.dataset.cleanSelect);
  const clear=toolbar?.querySelector('[data-clean-clear]');if(clear)clear.hidden=!selected.size;
 }
 function mountToolbar(holder){toolbar=holder;
  if(!holder.querySelector('[data-clean-selection]')){const review=b('Review publication selection',()=>void openPlan());review.dataset.cleanSelection='';const clear=b('Clear selection',()=>void(async()=>{await ready;selected.clear();try{await save()}catch{notify('Selection could not be saved. Retry when Firefox storage is available.')}drawSelection()})());clear.dataset.cleanClear='';holder.append(review,clear,b('Publication batches',()=>void history()));}
  void ready.then(drawSelection);drawSelection();
 }
 function checkbox(slug){const input=el('input');input.type='checkbox';input.dataset.cleanSelect=slug;input.checked=selected.has(slug);input.setAttribute('aria-label','Select '+slug+' for clean publication');
  input.addEventListener('change',()=>{const checked=input.checked;void(async()=>{await ready;if(checked)selected.add(slug);else selected.delete(slug);try{await save()}catch{notify('Selection could not be saved. Keep this window open and retry.')}drawSelection()})()});return input;
 }
 function modal(title){const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer source-workspace'),head=el('div','drawer-head'),body=el('div','drawer-body');let timer;
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
  const close=()=>{clearInterval(timer);overlay.remove();if(previous?.isConnected)previous.focus({preventScroll:true})};
  head.append(el('h2','drawer-title',title),b('Close',close));panel.append(head,body);overlay.append(panel);root.append(overlay);head.querySelector('button').focus();
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){
   const all=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(x=>x.getClientRects().length),i=all.indexOf(root.activeElement);
   if(e.shiftKey&&i<=0){e.preventDefault();all.at(-1)?.focus()}else if(!e.shiftKey&&i===all.length-1){e.preventDefault();all[0]?.focus()}
  }});return {overlay,body,close,poll:fn=>timer=setInterval(fn,5000)};
 }
 async function openPlan(id=null){await ready;
  if(!id&&!selected.size){notify('Select candidates in the Work Queue first.');return}
  const m=modal('Publish unchanged candidates'),intro=el('p','setting-note','Only unchanged, fully tested sources are included. Modified or incomplete candidates remain available for individual review.'),status=el('p','setting-note','Reading the frozen selection…'),summary=el('p'),actions=el('div','form-foot'),list=el('div','queue-list'),pager=el('div','form-foot');status.setAttribute('role','status');const feedback=el('p','setting-note');feedback.setAttribute('role','status');m.body.append(intro,status,feedback,summary,actions,list,pager);
  let current,offset=0,busy=false,loading=false,last='';
  async function load(){if(loading||busy||!m.overlay.isConnected)return;loading=true;
   try{const r=await request('GET',{id,offset,limit:25});if(!r?.ok)throw Error('UNAVAILABLE');if(!m.overlay.isConnected)return;current=r;
    const signature=JSON.stringify(r);if(signature===last)return;last=signature;list.replaceChildren();actions.replaceChildren();pager.replaceChildren();
    summary.textContent=r.eligible+' included · '+r.excluded+' require separate attention · '+(r.counts.CONFIRMED||0)+' publication results confirmed';
    status.textContent=r.state==='DRAFT'?'This selection is frozen and has not been approved.':r.state==='APPROVED'?'Approval saved. PCMS continues each included candidate automatically.':r.state==='CANCEL_REQUESTED'?'Unsent batch items are canceled. Possible publications are still being checked.':r.state==='FINISHED'?'Batch finished. Review the per-candidate results below.':'Batch canceled.';
    if(r.state==='DRAFT'&&r.eligible)actions.append(b('Approve '+r.eligible+' unchanged candidates',()=>void act('APPROVE'),'btn primary'));
    if(['DRAFT','APPROVED'].includes(r.state))actions.append(b(r.state==='DRAFT'?'Discard this draft':'Cancel unsent batch items',()=>void act('CANCEL')));
    actions.append(b('Refresh results',()=>{last='';void load()}));
    for(const item of r.items){const row=el('div','queue-item'),body=el('div','row-body');body.append(el('strong','',item.slug),el('p','setting-note',descriptions[item.code]||item.state.replaceAll('_',' ').toLowerCase()));
     if(item.code&&!descriptions[item.code]){const detail=el('details');detail.append(el('summary','','Details'),el('p','setting-note',item.code));body.append(detail)}
     row.append(body,b('Inspect current source',()=>{m.close();openReview(item.slug)}));list.append(row)}
    const prev=b('Previous candidates',()=>{offset=Math.max(0,offset-25);void load()}),next=b('Next candidates',()=>{offset+=25;void load()});prev.disabled=offset===0;next.disabled=!r.more;
    pager.append(prev,el('span','setting-note',(r.totalSelected?offset+1:0)+'–'+Math.min(offset+25,r.totalSelected)+' of '+r.totalSelected),next);
   }catch{status.textContent='Batch results could not be read. The frozen selection and saved approval are preserved.'}finally{loading=false}
  }
  async function act(type){if(busy||!current)return;
   if(type==='APPROVE'&&!window.confirm('Approve publication of these '+current.eligible+' exact unchanged, fully tested source snapshots? Candidates that change will be held for fresh review.'))return;
   busy=true;actions.querySelectorAll('button').forEach(x=>x.disabled=true);
   try{let r=await request(type,{id,expectedRevision:current.revision,...(type==='APPROVE'?{digest:current.digest,explicitApproval:true}:{})});
    if(type==='CANCEL'&&r?.code==='CLEAN_BULK_CHANGED'){const fresh=await request('GET',{id});if(fresh?.ok&&fresh.digest===current.digest&&fresh.state==='APPROVED')r=await request('CANCEL',{id,expectedRevision:fresh.revision})}
    if(!r?.ok)feedback.textContent=r?.code==='CLEAN_BULK_ALREADY_ACTIVE'?'One of these candidates is already in an active batch. Inspect Publication batches before creating another selection.':'The request was not confirmed. Current saved results are shown below.';
   }catch{feedback.textContent='The response was lost. Read the saved results before another approval.'}finally{busy=false;last='';await load()}
  }
  if(!id){try{const r=await request('PREPARE',{slugs:[...selected].sort()});if(!r?.ok)throw Error('UNAVAILABLE');id=r.id;}catch{status.textContent='Selection review was not confirmed. Check Publication batches before trying again.';return}}
  if(!m.overlay.isConnected)return;await load();if(m.overlay.isConnected)m.poll(()=>void load());
 }
 async function history(){const m=modal('Publication batches'),list=el('div','queue-list'),pager=el('div','form-foot'),status=el('p','setting-note');m.body.append(status,list,pager);let after='',stack=[];
  async function load(){try{const r=await request('LIST',{after,limit:20});if(!r?.ok)throw Error('UNAVAILABLE');if(!m.overlay.isConnected)return;list.replaceChildren();pager.replaceChildren();status.textContent=r.items.length?'Saved selections and their publication results.':'No saved publication batches.';
   for(const item of r.items){const row=el('div','queue-item');row.append(el('span','',new Date(item.createdAt).toLocaleString()+' · '+item.eligible+' candidates · '+item.state.replaceAll('_',' ').toLowerCase()),b('Open batch',()=>{m.close();void openPlan(item.id)}));list.append(row)}
   const prev=b('Previous batches',()=>{after=stack.pop()||'';void load()}),next=b('Next batches',()=>{stack.push(after);after=r.nextCursor;void load()});prev.disabled=!stack.length;next.disabled=!r.more;pager.append(prev,next);
  }catch{status.textContent='Saved batches could not be read. Try again when the extension responds.'}}
  await load();
 }
 return Object.freeze({mountToolbar,checkbox,openPlan,history});
}
