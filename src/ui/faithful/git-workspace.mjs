// Operator Git views consume typed production boundaries. Git main remains
// the sole source/prompt authority; displayed planning never admits effects.
export function renderGitInventory({section,snapshot,el,b,request,refresh,openSource,openQueue}){
 section.querySelector('[data-main-review]')?.remove();if(!snapshot?.ok||snapshot.complete!==true)return;
 const panel=el('section','settings-section');panel.dataset.mainReview='1';
 const p=snapshot.preview||{},items=p.items||[],names=new Map((p.accounts||[]).map(a=>[a.accountId,a.alias||a.accountId]));
 const account=id=>names.get(id)||'Managed account';
 const info=el('p','setting-note',snapshot.importStatus==='IMPORT_SETUP_COMPLETE'?'Connected. Newly merged main folders are discovered automatically.':
  snapshot.importStatus==='IMPORT_SCOPE_APPROVED'?'Initial import queued. Protected ownership checks run before creation.':'Review this initial import before any Git-originated creation.');info.setAttribute('role','status');
 panel.append(el('h3','','Git sources · '+items.length+' folders'),el('p','setting-note',snapshot.repository+' · main '+(snapshot.head?snapshot.head.slice(0,10):'not initialized')),info);
 const totals={CREATE:0,ADOPT:0,COALESCED:0,HELD:0};for(const x of items)totals[x.action]=(totals[x.action]||0)+1;
 panel.append(el('p','setting-note',totals.CREATE+' planned new · '+totals.ADOPT+' already owned · '+totals.COALESCED+' existing jobs · '+totals.HELD+' need attention'));
 const listing=el('details','settings-section');listing.open=!['IMPORT_SETUP_COMPLETE','IMPORT_SCOPE_APPROVED'].includes(snapshot.importStatus);
 listing.append(el('summary','','Folders and proposed allocation'));
 const search=el('input','form-input');search.type='search';search.placeholder='Find a Git folder';search.setAttribute('aria-label','Find GitHub generator folder');
 const list=el('div','queue-list'),pager=el('div','form-foot');let offset=0;
 function draw(){list.replaceChildren();pager.replaceChildren();const filtered=items.filter(x=>x.slug.includes(search.value.trim().toLowerCase()));if(offset>=filtered.length)offset=0;
  for(const item of filtered.slice(offset,offset+30)){const row=el('div','queue-item'),data=el('div','row-body');
   const action=item.action==='ADOPT'?'Already owned · '+account(item.accountId):item.action==='CREATE'?'Create private · '+account(item.proposedAccountId):item.action==='COALESCED'?'Existing job · '+(item.accountId?account(item.accountId):'Allocation pending'):
    item.code==='INITIAL_INVENTORY_UNKNOWN'?'Complete account inventory before allocation':item.code==='I17_ORIGINAL_EFFECT_QUARANTINED'?'Original test input is quarantined':'Needs owner or account review';
   data.append(el('strong','',item.slug),el('p','setting-note',action+' · '+(item.ready?'READY':'Not READY')));
   row.append(data,b('Browse source',()=>openSource(item),'btn small'));list.append(row);
  }
  if(!filtered.length)list.append(el('p','setting-note','No matching folders.'));
  const prev=b('Previous',()=>{offset=Math.max(0,offset-30);draw()},'btn small'),next=b('Next',()=>{offset+=30;draw()},'btn small');prev.disabled=offset===0;next.disabled=offset+30>=filtered.length;
  pager.append(prev,el('span','setting-note',(filtered.length?offset+1:0)+'–'+Math.min(offset+30,filtered.length)+' of '+filtered.length),next);
 }
 search.addEventListener('input',()=>{offset=0;draw()});listing.append(search,list,pager);panel.append(listing);draw();
 if(items.length&&p.scopeDigest&&p.planDigest&&!['IMPORT_SETUP_COMPLETE','IMPORT_SCOPE_APPROVED'].includes(snapshot.importStatus)){
  const approve=b('Start initial import',()=>void(async()=>{approve.disabled=true;info.textContent='Rechecking this source and ownership scope…';
   try{const out=await request('pcms-s03-catalog','APPROVE_IMPORT',{repositoryId:snapshot.repositoryId,scopeDigest:p.scopeDigest,planDigest:p.planDigest,expectedRevision:snapshot.approvalRevision},30000);
    if(out.ok){approve.hidden=true;info.textContent='Initial import queued. Known owned generators keep their source; missing targets are verified before private creation.';}
    else info.textContent='The source or ownership scope changed. Sync now and review the updated import; no new scope was approved.';
   }catch{info.textContent='Import approval was not confirmed. Sync now to read its current state.'}finally{approve.disabled=false}
  })(),'btn primary');panel.append(approve);
 }
 const actions=el('div','form-foot');actions.append(b('Sync now',()=>void refresh(),'btn small'),b('View work queue',openQueue,'btn small'));panel.append(actions);section.append(panel);
}

export function mountGitPromptEditor({section,el,b,request,connect}){
 const box=el('section','settings-section');box.dataset.gitPrompt='1';box.append(el('h3','','Default AI testing instructions'),el('p','setting-note','Saved in GitHub main. New jobs use this version; running jobs retain their pinned instructions.'));
 const input=el('textarea','form-input');input.rows=12;input.maxLength=16000;input.spellcheck=false;input.setAttribute('aria-label','Default AI testing instructions');
 const status=el('p','setting-note','Reading the GitHub prompt…');status.setAttribute('role','status');
 const actions=el('div','form-foot'),comparison=el('div');box.append(input,actions,status,comparison);section.append(box);
 let base=null,revision=0,busy=true,uncertain=false,dirty=false,epoch=0,latest=null;
 const call=(type,params={},timeout=95000)=>request('pcms-s03-catalog',type,params,timeout);
 function controls(){save.disabled=busy||uncertain||!base;reconcile.hidden=!uncertain;reconcile.disabled=busy;reload.disabled=busy;input.readOnly=busy||uncertain}
 input.addEventListener('input',()=>{dirty=true});
 async function load({preserve=false}={}){if(busy&&base)return;const at=++epoch;busy=true;controls();
  try{const current=await call('SCAN_CONNECTED');if(at!==epoch||!box.isConnected)return;
   if(!current.ok){status.textContent='Connect GitHub to edit the default instructions.';return}
   latest={repositoryId:current.repositoryId,head:current.head,oid:current.prompt?.oid||null};
   if(preserve){comparison.replaceChildren();const text=el('textarea','form-input');text.readOnly=true;text.rows=8;text.value=current.prompt?.text||'';text.setAttribute('aria-label','Latest GitHub prompt');
    comparison.append(el('h4','','Latest GitHub version'),text,b('Keep my edits on this reviewed version',()=>{base=latest;comparison.replaceChildren();status.textContent='Your edits are preserved. Save to apply them to the reviewed Git version.';controls()},'btn small'));
    status.textContent='GitHub changed. Compare the latest version; your edits are preserved.';return;
   }
   base=latest;input.value=current.prompt?.text||current.starterPrompt||'';dirty=false;
   status.textContent=current.prompt?.state==='PRESENT'?'GitHub instructions loaded.':'No default prompt exists yet. Review the starter instructions before creating it.';
   save.textContent=base.oid?'Save to GitHub':'Create prompt on main';
   const draft=await call('GET_PROMPT_DRAFT',{},20000);
   if(at!==epoch||!box.isConnected||dirty)return;
   if(draft.ok){revision=draft.record.revision;uncertain=['DISPATCH_POSSIBLE','UNCERTAIN'].includes(draft.record.effect?.state);
    const committed=draft.record.effect?.state==='VERIFIED'&&draft.record.text===current.prompt?.text;
    if(!committed){input.value=draft.record.text;
     if(draft.record.baseOid!==base.oid){status.textContent='A saved draft differs from current GitHub. Your draft is preserved; compare the latest version.';base={...base,oid:draft.record.baseOid};}
     else status.textContent=uncertain?'A previous save needs read-only verification.':'Your saved draft was restored.';}
   }
  }catch{status.textContent='GitHub instructions are unavailable. Your current text is preserved.'}
  finally{busy=false;controls()}
 }
 const save=b('Save to GitHub',()=>void(async()=>{if(busy||uncertain||!base||!input.value.trim())return;
  const text=input.value,version={...base};busy=true;controls();status.textContent='Saving your draft and checking GitHub…';
  try{const stored=await call('SAVE_PROMPT_DRAFT',{repositoryId:version.repositoryId,expectedRevision:revision,baseOid:version.oid,text},20000);
   if(!stored.ok){status.textContent='The saved draft changed. Your edits are preserved; compare the latest version before retrying.';return}revision=stored.revision;
   const out=await call('COMMIT_PROMPT',{repositoryId:version.repositoryId,expectedRevision:revision,expectedHead:version.head});
   if(out.ok){status.textContent='Saved and verified on GitHub main.';dirty=false;busy=false;await load();status.textContent='Saved and verified on GitHub main.';return}
   uncertain=out.code==='PROMPT_GIT_UNCERTAIN_RECONCILE_REQUIRED';
   status.textContent=uncertain?'Save outcome unknown. Check the pending save before trying again.':out.code==='PROMPT_CONFLICT_KEEP_DRAFT'?'GitHub changed. Your draft is preserved. Compare the latest version before saving.':'Save is waiting for GitHub or background permissions. Your draft is preserved.';
  }catch(error){
   try{const known=await call('GET_PROMPT_DRAFT',{},20000);if(known.ok){revision=known.record.revision;uncertain=['DISPATCH_POSSIBLE','UNCERTAIN'].includes(known.record.effect?.state)}else uncertain=false;}catch{uncertain=true;}
   status.textContent=uncertain?'Save could not be confirmed. Check the pending save; your draft is preserved.':'Save did not complete. Your edits are preserved; retry when GitHub is available.';
  }
  finally{busy=false;controls()}
 })(),'btn primary');
 const reconcile=b('Check pending save',()=>void(async()=>{if(busy)return;busy=true;controls();
  try{const out=await call('RECONCILE_PROMPT',{repositoryId:base.repositoryId});if(out.ok){uncertain=false;busy=false;await load();status.textContent='Previous save verified on GitHub main.'}else status.textContent='The pending save remains unverified. No write was repeated.'}
  catch{status.textContent='GitHub could not verify the pending save. No write was repeated.'}finally{busy=false;controls()}
 })(),'btn small');
 const reload=b('Compare latest Git version',()=>void load({preserve:!!base}),'btn small');
 actions.append(save,reconcile,reload,b('GitHub connection',connect,'btn small'));controls();void load();
}
