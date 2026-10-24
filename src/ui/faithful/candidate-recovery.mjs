// Operator decisions only. This view supplies no test/source/session evidence;
// the background revalidates the current candidate for every action.
export async function mountHumanRecovery({container,slug,el,b,request,onChanged}){
 const details=el('details','candidate-human-review');details.append(el('summary','','Human editing'));
 const note=el('p','setting-note','Defer review to keep human edits. Save the editor before adopting; adopted source is tested again as a new candidate.'),status=el('p','setting-note'),actions=el('div','form-foot');
 status.setAttribute('role','status');details.append(note,actions,status);container.append(details);
 async function act(type,params){actions.querySelectorAll('button').forEach(x=>x.disabled=true);
  try{const out=await request(type,{slug,...params});
   if(out?.ok){status.textContent=type==='ADOPT_HUMAN'?'Saved changes adopted. Independent testing will run before another approval.':type==='OPEN_HUMAN_EDITOR'?'The human editor is open in the protected account.':'Review deferred. Saved and unsaved human work is preserved.';
    if(type!=='OPEN_HUMAN_EDITOR')onChanged();else await load();return}
   const messages={S06_HUMAN_UNSAVED_OR_ACTIVE_EDITOR_DEFERRED:'Save your edits and stop any running helper before adopting. Your editor is preserved.',S06_HUMAN_EDITOR_RECLAIM_PENDING:'The new candidate is saved; editor recovery still needs to finish. Retry adoption when the editor has loaded.',S06_HUMAN_NO_CHANGED_SAVED_SOURCE:'No changed saved source was found. Save your changes before adopting.',S06_HUMAN_SAVED_SOURCE_CHANGED_DURING_ADOPTION:'The saved source changed while it was being checked. Review your editor and retry.',S06_HUMAN_ADOPTION_CONTEXT_UNVERIFIED:'The candidate changed. Refresh this review before another decision.'};
   status.textContent=messages[out?.code]||'The action could not be confirmed. Human source remains preserved; refresh or retry when the protected account is ready.';
  }catch{status.textContent='The response was lost. Saved ownership and candidate state will be read before another request.'}
  await load();
 }
 async function load(){actions.replaceChildren();let r;try{r=await request('HUMAN_CONTEXT',{slug})}catch{}
  if(!r?.ok){note.textContent='Human review becomes available for a tested saved candidate. Current edits remain protected.';return}
  const human=r.human;
  if(human?.state==='DEFERRED'){
   details.open=true;actions.append(b('Open human editor',()=>void act('OPEN_HUMAN_EDITOR',{expectedRevision:human.revision})),b('Adopt saved human changes',()=>void act('ADOPT_HUMAN',{expectedRevision:human.revision}),'btn primary'));
  }else if(human?.state==='ADOPTED_UNTESTED'&&!r.tested){
   note.textContent=human.reclaimPending?'The saved candidate is held while editor recovery finishes.':'Human source adopted. It needs independent tests and fresh review.';
   if(human.reclaimPending)details.open=true;actions.append(b(human.reclaimPending?'Finish adopting saved changes':'Adopt latest saved human source',()=>void act('ADOPT_HUMAN',{expectedRevision:human.revision}),'btn primary'))
  }else if(/^[a-f0-9]{64}$/.test(r.sourceFingerprint||''))actions.append(b('Defer for human editing',()=>void act('DEFER_HUMAN',{
   expectedStageRevision:r.stageRevision,expectedJobRevision:r.jobRevision,expectedFingerprint:r.sourceFingerprint})));
  else note.textContent='The current source is still in development. Use development controls to pause or give instructions.';
 }
 await load();return details;
}
export async function mountExceptionalReview({container,slug,el,b,request,onChanged}){
 let view;try{view=await request('EXCEPTION_CONTEXT',{slug})}catch{}
 if(!view?.ok||view.evidenceState==='TESTS_VERIFIED')return;
 const details=el('details','candidate-exception-review');details.append(el('summary','','Testing recovery'));
 const note=el('p','setting-note'),status=el('p','setting-note');status.setAttribute('role','status');details.append(note);container.append(details);
 let recorded;try{recorded=await request('GET_EXCEPTION',{slug})}catch{}
 if(recorded?.ok&&recorded.stageRevision===view.stageRevision&&recorded.jobRevision===view.jobRevision&&recorded.sourceFingerprint===view.sourceFingerprint){
  note.textContent='Exceptional review saved. It remains individual and does not claim complete AI verification.';
  for(const check of recorded.manualChecks||[])details.append(el('p','setting-note',check.name+' · '+check.observation));
  return;
 }
 if(view.evidenceState==='KNOWN_FAILURE'){note.textContent='A required test has failed. Continue development or correct the Git-owned test; manual review cannot override this failure.';return}
 if(!view.manualInfrastructureObserved&&!(view.optionalConfigured&&view.chat1Verified&&!view.chat2Verified)){
  note.textContent='Independent testing is still pending. PCMS will continue when the account and testing service are available.';return;
 }
 const mode=view.optionalConfigured&&view.chat1Verified&&!view.chat2Verified?'OPTIONAL_CHAT2_INCOMPLETE':'MANUAL_INFRASTRUCTURE',inputs=[];
 note.textContent=mode==='OPTIONAL_CHAT2_INCOMPLETE'?'Chat 1 is verified. Optional fresh Chat 2 remains incomplete. You may choose an exceptional individual review; Chat 2 will remain unverified.':
  'Testing infrastructure remains unavailable. Record what you actually checked on this exact saved source. These observations remain manual and do not become AI test results.';
 if(mode==='MANUAL_INFRASTRUCTURE')for(const name of view.requiredChecks){const label=el('label','',name),input=el('textarea','form-input');input.rows=3;input.maxLength=2000;input.setAttribute('aria-label','Manual observation for '+name);label.append(input);details.append(label);inputs.push([name,input])}
 const consent=el('label','setting-option'),check=el('input');check.type='checkbox';consent.append(check,document.createTextNode(mode==='MANUAL_INFRASTRUCTURE'?' I performed these recorded manual checks on the exact saved candidate.':' I understand that optional Chat 2 testing is incomplete and this candidate needs individual review.'));
 const save=b('Save exceptional review',()=>void(async()=>{
  if(!check.checked||inputs.some(([,i])=>i.value.trim().length<12)){status.textContent='Confirm the review and describe each actual check in at least twelve characters.';return}
  save.disabled=true;
  try{const out=await request('RECORD_EXCEPTION',{slug,mode,checks:inputs.map(([name,i])=>({name,result:'PASS',observation:i.value.trim()})),consent:'I PERFORMED THE RECORDED MANUAL CHECKS',
    expectedStageRevision:view.stageRevision,expectedJobRevision:view.jobRevision,sourceFingerprint:view.sourceFingerprint});
   if(out?.ok){status.textContent='Exceptional observations saved. Source approval remains a separate individual decision.';onChanged()}
   else status.textContent='The candidate or testing state could not be verified. Your observations are preserved; check the current source before retrying.';
  }catch{status.textContent='The response was lost. Your observations are preserved; refresh saved review state before resubmitting.'}finally{save.disabled=false}
 })(),'btn primary');details.append(consent,save,status);
}
