import {saveRefresherChoice,observedAge,feedCoverage,placementText} from './refresher-choices.mjs';
const MINUTE=60000;
const choiceHelp={CHOICE_CHANGED:'This setting changed elsewhere. Your input is preserved; close and reopen to review the current choice.',
 STATE_UNAVAILABLE:'Current settings could not be read. Your input is preserved.',
 READBACK_UNAVAILABLE:'The saved choice could not be read back. Refresh before another change.',
 ACK_UNKNOWN:'The outcome could not be confirmed. Refresh before another change.',
 RESTORE_HOLD:'Complete backup recovery before changing schedules.'};
const explain=code=>choiceHelp[code]||'The change was not confirmed ('+String(code||'unavailable').replaceAll('_',' ').toLowerCase()+').';
const rowOf=(snap,id)=>snap?.items?.find(r=>r.stableId===id);
const timingOf=r=>r?{activeMs:r.activeMs,sleepMs:r.sleepMs,timingOverride:r.timingOverride}:null;
export function createRefresherWorkspace({root,el,b,request,snapshot,reload,accounts,manageAccount,notify,formatTime}){
 let accountRows=[],accountError=false,accountEpoch=0;
 const q=selector=>root.querySelector(selector);
 const text=(selector,value)=>{const n=q(selector);if(n)n.textContent=value};
 const name=id=>accountRows.find(a=>a.accountId===id)?.alias||id;
 async function refreshAccounts(){
  const epoch=++accountEpoch;
  try{const r=await accounts();if(epoch!==accountEpoch)return;
   if(!r?.ok)throw Error();accountRows=(r.accounts||[]).filter(a=>!a.removed);accountError=false;
  }catch{if(epoch!==accountEpoch)return;accountError=true}
  if(q('#refresher-account'))renderAccounts(snapshot());
 }
 function dialog(label,title){
  const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',label);
  const close=()=>{overlay.remove();if(previous?.isConnected)previous.focus({preventScroll:true})};
  const head=el('div','drawer-head'),body=el('div','drawer-body');
  head.append(el('h2','drawer-title',title),b('Close',close));panel.append(head,body);overlay.append(panel);root.append(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
   if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')];
    if(e.shiftKey&&root.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}
    else if(!e.shiftKey&&root.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}}
  });
  head.querySelector('button').focus();return {body,close};
 }
 function status(){const n=el('p','setting-note');n.setAttribute('role','status');return n}
 async function save(options,out){
  const result=await saveRefresherChoice({request,...options});
  if(out?.isConnected)out.textContent=result.ok?'Saved and verified.':explain(result.code);
  await reload();return result;
 }
 function minuteField(body,label,value){
  const wrap=el('label','',label+' (minutes)'),input=el('input','form-input');
  input.type='number';input.min='1';input.max='525600';input.step='1';input.value=String(Math.round(value/MINUTE));
  input.setAttribute('aria-label',label+' (minutes)');wrap.append(input);body.append(wrap);return input;
 }
 function validMinutes(...inputs){return inputs.every(x=>x.value.trim()!==''&&Number.isSafeInteger(Number(x.value))&&Number(x.value)>=1&&Number(x.value)<=525600)}
 function openTiming(){
  const snap=snapshot();if(!snap?.ok){notify('Read the current Refresher settings before changing them.');return}
  const {body}=dialog('Refresher default timing policy','Refresher default timing');
  body.append(el('p','setting-note','Defaults apply to future periods. Current remaining time and custom generator settings are preserved.'));
  const a=minuteField(body,'Active period',snap.policy.activeMs),s=minuteField(body,'Rest period',snap.policy.sleepMs),out=status();
  const baseline={activeMs:snap.policy.activeMs,sleepMs:snap.policy.sleepMs};
  const button=b('Save default timing',()=>void(async()=>{
   if(!validMinutes(a,s)){out.textContent='Use 1 to 525,600 whole minutes for each period.';return}
   if(!window.confirm('Save the default active and rest periods?'))return;
   const desired={activeMs:Number(a.value)*MINUTE,sleepMs:Number(s.value)*MINUTE};button.disabled=true;
   try{const r=await save({type:'SET_POLICY',params:{policy:desired},baseline,
    select:x=>({activeMs:x.policy.activeMs,sleepMs:x.policy.sleepMs}),
    matches:x=>x.policy.activeMs===desired.activeMs&&x.policy.sleepMs===desired.sleepMs},out);
    if(r.ok)Object.assign(baseline,desired);
   }finally{button.disabled=false}
  })(),'btn primary');body.append(button,out);a.focus();
 }
 function openCapacity(){
  const snap=snapshot();if(!snap?.ok){notify('Current capacity is unavailable.');return}
  const {body}=dialog('Refresher capacity','Refresher capacity');
  const ev=snap.capacityEvidence;
  body.append(el('p','setting-note','Automatic capacity follows the active/rest balance and observed page capacity. A manual limit remains bounded by the practical estimate and safety ceiling.'));
  body.append(el('p','setting-note','Effective limit: '+snap.capacity.cap+' · occupied: '+snap.occupied+' · '+(ev?.estimate==null?'No established page-capacity estimate.':ev.estimate+' estimated positions · '+observedAge(ev.observedAt)+' · '+ev.samples+' samples.')));
  const auto=el('input');auto.type='checkbox';auto.checked=snap.policy.manualCap===null;auto.setAttribute('aria-label','Use automatic capacity');
  const label=el('label','','Use automatic capacity');label.prepend(auto);body.append(label);
  const limit=el('input','form-input');limit.type='number';limit.min='1';limit.max=String(snap.policy.safetyCap);limit.step='1';
  limit.value=String(snap.policy.manualCap??snap.capacity.cap);limit.setAttribute('aria-label','Manual active generator limit');
  const field=el('label','','Manual active generator limit');field.append(limit);body.append(field);limit.disabled=auto.checked;
  auto.addEventListener('change',()=>{limit.disabled=auto.checked});
  let baseline=snap.policy.manualCap;const out=status();
  const button=b('Save capacity',()=>void(async()=>{
   const value=auto.checked?null:Number(limit.value);
   if(value!==null&&(limit.value.trim()===''||!Number.isSafeInteger(value)||value<1||value>snap.policy.safetyCap)){out.textContent='Use a whole number from 1 to '+snap.policy.safetyCap+'.';return}
   button.disabled=true;
   try{const r=await save({type:'SET_POLICY',params:{policy:{manualCap:value}},baseline,select:x=>x.policy.manualCap,matches:x=>x.policy.manualCap===value},out);
    if(r.ok){baseline=value;out.textContent='Saved and verified. Effective limit: '+r.snapshot.capacity.cap+(value!==null&&r.snapshot.capacity.cap<value?' (bounded below your requested '+value+').':'.')}}
   finally{button.disabled=false}
  })(),'btn primary');body.append(button,out);auto.focus();
 }
 async function changePause(scope,target,desired,baseline,out){
  return save({type:'SET_PAUSE',params:{scope,...(target?{target}:{}),paused:desired},baseline,
   query:scope==='GENERATOR'?{query:target,limit:1}:{},
   select:x=>scope==='GLOBAL'?x.globalPause:scope==='ACCOUNT'?x.accounts.find(a=>a.accountId===target)?.paused===true:rowOf(x,target)?.paused,
   matches:x=>(scope==='GLOBAL'?x.globalPause:scope==='ACCOUNT'?x.accounts.find(a=>a.accountId===target)?.paused===true:rowOf(x,target)?.paused)===desired},out);
 }
 async function pauseGlobal(){
  const snap=snapshot();if(!snap?.ok)return notify('Current schedules could not be read.');
  if(!window.confirm(snap.globalPause?'Resume Refresher schedules?':'Pause Refresher schedules for all accounts?'))return;
  const button=q('[data-action="pause-refresher"]');if(button)button.disabled=true;
  try{const r=await changePause('GLOBAL',null,!snap.globalPause,snap.globalPause);notify(r.ok?'Refresher schedules '+(!snap.globalPause?'paused.':'resumed.'):explain(r.code))}
  finally{if(button?.isConnected)button.disabled=false}
 }
 async function enable(control){
  const snap=snapshot();control.checked=snap?.policy?.refreshEnabled===true;
  if(!snap?.ok)return notify('Current Refresher policy could not be read.');
  const baseline=snap.policy.refreshEnabled===true,desired=!baseline;
  if(!window.confirm(desired?'Enable automatic guarded Refresher saves? Recent-page placement is measured separately.':'Disable further scheduled Refresher saves?'))return;
  control.disabled=true;
  try{const r=await save({type:'SET_POLICY',params:{policy:{refreshEnabled:desired}},baseline,select:x=>x.policy.refreshEnabled===true,matches:x=>x.policy.refreshEnabled===desired});notify(r.ok?'Refresher '+(desired?'enabled.':'disabled.'):explain(r.code))}
  finally{if(control.isConnected)control.disabled=false}
 }
 async function checkNow(){
  const button=q('[data-action="feed-check"]');if(button)button.disabled=true;
  try{const r=await request('OBSERVE_NOW',{});notify(r?.ok?'Observation requested. Provider limits and backoff still apply.':'A fresh observation is unavailable. Existing evidence remains labeled by its age.')}
  catch{notify('The observation outcome could not be read.')}
  finally{await reload();if(button?.isConnected)button.disabled=false}
 }
 async function openGenerator(item){
  let current;try{current=await request('GET_REFRESHER',{query:item.stableId,limit:1})}catch{}
  let row=rowOf(current,item.stableId);if(!current?.ok||!row){notify('This generator’s current schedule is unavailable. Refresh and retry.');return}
  const {body,close}=dialog('Manage Refresher timing for '+row.slug,'Refresher · '+row.slug);
  const summary=el('p','setting-note'),source=el('p','setting-note'),out=status();
  body.append(summary,source,el('p','setting-note','Timing changes apply to future periods. Current remaining time is preserved.'));
  const a=minuteField(body,'Active period',row.activeMs),s=minuteField(body,'Rest period',row.sleepMs);
  const refreshLabels=()=>{summary.textContent=name(row.accountId)+' · '+(row.paused?'Paused':row.phase.toLowerCase())+' · '+formatTime(row.phase==='SLEEPING'?row.sleepRemaining:row.activeRemaining)+' remaining · '+(row.timingOverride?'Custom timing':'Using default timing');
   source.textContent=placementText(row)+' · '+(row.refresh?.sourceSavedAt?'Source saved '+observedAge(row.refresh.sourceSavedAt):'No confirmed marker save')};
  refreshLabels();
  if(row.blockers?.length){
   const reasons={GLOBAL_PAUSE:'Refresher is paused',ACCOUNT_PAUSE:'Account schedules are paused',GENERATOR_PAUSE:'This generator is paused',BINDING_CHANGED:'Account identity needs confirmation',OWNER_UNVERIFIED:'Ownership needs verification',PUBLICATION_UNVERIFIED:'Public source needs verification',LISTING_UNVERIFIED:'Generator is not verified public',OPERATOR_UPDATE_REQUESTED:'A source update was requested',REVIEW_UNLISTING:'Source development or review is in progress',VISIBILITY_SUSPENDED:'Placement recovery is held',ACCOUNT_UNAVAILABLE:'Account login or protected route is unavailable',PROVIDER_OUTAGE:'Provider outage observed',READY_UPDATE_FIRST:'A source update has priority'};
   body.append(el('p','setting-note',row.blockers.map(code=>reasons[code]||'Schedule eligibility needs verification').join(' · ')));
  }
  const actions=el('div','form-foot');
  const patch=async(useDefaults)=>{
   if(!useDefaults&&!validMinutes(a,s)){out.textContent='Use 1 to 525,600 whole minutes for each period.';return}
   if(!window.confirm(useDefaults?'Use the current default timing for future periods?':'Save this generator’s timing policy for subsequent Refresher periods?'))return;
   const desired=useDefaults?null:{activeMs:Number(a.value)*MINUTE,sleepMs:Number(s.value)*MINUTE};
   saveButton.disabled=reset.disabled=true;
   try{const r=await save({type:'SET_GENERATOR_POLICY',params:{stableId:row.stableId,...(useDefaults?{useDefaults:true}:desired)},
    query:{query:row.stableId,limit:1},baseline:timingOf(row),select:x=>timingOf(rowOf(x,row.stableId)),
    matches:x=>{const r=rowOf(x,row.stableId);return !!r&&(useDefaults?r.timingOverride===false&&r.activeMs===x.policy.activeMs&&r.sleepMs===x.policy.sleepMs:r.timingOverride===true&&r.activeMs===desired.activeMs&&r.sleepMs===desired.sleepMs)}},out);
    if(r.ok){row=rowOf(r.snapshot,row.stableId);a.value=String(row.activeMs/MINUTE);s.value=String(row.sleepMs/MINUTE);refreshLabels()}
   }finally{saveButton.disabled=reset.disabled=false}
  };
  const saveButton=b('Save generator timing',()=>void patch(false),'btn primary'),reset=b('Use default timing',()=>void patch(true));
  const pause=b(row.paused?'Resume this generator':'Pause this generator',()=>void(async()=>{
   if(!window.confirm(row.paused?'Resume this generator’s schedule?':'Pause this generator’s schedule?'))return;
   pause.disabled=true;try{const r=await changePause('GENERATOR',row.stableId,!row.paused,row.paused,out);
    if(r.ok){row=rowOf(r.snapshot,row.stableId);pause.textContent=row.paused?'Resume this generator':'Pause this generator';refreshLabels()}}
   finally{pause.disabled=false}
  })());
  const observe=b('Observe statistics',()=>void(async()=>{
   observe.disabled=true;
   try{const snap=await request('GET_REFRESHER',{query:row.stableId,limit:1});
    if(!snap?.ok)throw Error();
    const r=await request('DEMAND_STATISTIC',{expectedRevision:snap.revision,stableId:row.stableId});
    out.textContent=r?.ok?'Statistics observation requested.':'Statistics could not be requested. Refresh and retry.';
   }catch{out.textContent='Statistics request outcome unavailable.'}
   finally{observe.disabled=false;await reload()}
  })());
  actions.append(saveButton,reset,pause,observe,b('Manage account',()=>{close();void manageAccount(row.accountId)}));body.append(actions,out);a.focus();
 }
 function renderAccounts(snap,selected){
  const selector=q('#refresher-account');if(!selector||!snap?.ok)return;
  const prior=selected??selector.value;
  const all=new Map(accountRows.map(a=>[a.accountId,a]));
  for(const a of snap.accounts||[])if(!all.has(a.accountId))all.set(a.accountId,a);
  selector.replaceChildren();const option=el('option','','All accounts');option.value='';selector.append(option);
  for(const [id] of [...all].sort((a,z)=>name(a[0]).localeCompare(name(z[0])))){const option=el('option','',name(id));option.value=id;selector.append(option)}
  selector.value=all.has(prior)?prior:'';
  const id=selector.value,a=snap.accounts.find(x=>x.accountId===id);
  const pause=q('#refresher-account-pause'),manage=q('#refresher-manage-account');
  if(pause){pause.disabled=!id||snap.restoreHeld;pause.textContent=a?.paused?'Resume account':'Pause account';
   pause.onclick=()=>void(async()=>{
    if(!window.confirm(a?.paused?'Resume this account’s schedules?':'Pause this account’s schedules, including future inventory?'))return;
    pause.disabled=true;try{const r=await changePause('ACCOUNT',id,!(a?.paused===true),a?.paused===true);notify(r.ok?'Account schedule preference saved.':explain(r.code))}
    finally{if(pause.isConnected)pause.disabled=false}
   })()}
  if(manage){manage.disabled=!id;manage.onclick=()=>void manageAccount(id)}
  text('#refresher-account-state',id?(a?(a.paused?'Paused · ':'' )+a.total+' generators · '+a.health.toLowerCase()+(a.health==='UNAVAILABLE'?' · '+formatTime(a.graceRemaining)+' grace remaining':''):'No observed inventory yet. Account preferences apply to future work.'):(accountError?'Account names unavailable; schedule controls remain independent.':'Account controls apply only to the selected account.'));
 }
 function render(snap,view){
  if(!snap?.ok)return;
  const table=q('.ref-table-scroll tbody');if(!table)return;
  const focused=root.activeElement?.closest('tr[data-ref-id]')?.dataset.refId;
  const signature=JSON.stringify(snap.items.map(r=>[r.stableId,r.phase,r.paused,r.activeRemaining,r.sleepRemaining,r.blockers,r.presence,r.refresh,r.eligiblePosition,name(r.accountId)]));
  if(table.dataset.refSignature!==signature){
   table.replaceChildren();table.dataset.refSignature=signature;
   for(const [i,row] of snap.items.entries()){
    const tr=el('tr');tr.tabIndex=i===0?0:-1;tr.dataset.itemIndex=String(i);tr.dataset.refId=row.stableId;tr.setAttribute('role','button');tr.setAttribute('aria-label','Manage Refresher '+row.slug);
    const first=el('td','name-cell',row.slug);first.append(el('span','ref-secondary',name(row.accountId)));
    const state=el('td','',row.paused?'Paused':row.blockers?.length?'Held · '+row.phase.toLowerCase():row.phase.toLowerCase());
    state.append(el('span','ref-secondary',row.phase==='WAITING'?(row.eligiblePosition?'Eligible #'+row.eligiblePosition:'Waiting for eligibility'):formatTime(row.phase==='SLEEPING'?row.sleepRemaining:row.activeRemaining)+' remaining'));
    const presence=el('td','',placementText(row));presence.append(el('span','ref-secondary',row.refresh?.sourceSavedAt?'Source saved '+observedAge(row.refresh.sourceSavedAt)+(row.refresh.awaitingVisibility?' · placement pending':''):'No confirmed marker save'));
    const cue=el('td','','Manage');tr.append(first,state,presence,cue);table.append(tr);
   }
   if(!snap.items.length){const tr=el('tr'),td=el('td','muted-cell','No generators match these filters.');td.colSpan=4;tr.append(td);table.append(tr)}
   if(focused){const replacement=[...table.querySelectorAll('tr[data-ref-id]')].find(r=>r.dataset.refId===focused);replacement?.focus({preventScroll:true})}
  }
  text('.ref-table-heading .muted',snap.total+' matching');
  text('.ref-pagination span',(snap.total?view.offset+1:0)+'–'+Math.min(view.offset+view.limit,snap.total)+' of '+snap.total);
  const prev=q('[data-action="ref-prev"]'),next=q('[data-action="ref-next"]');if(prev)prev.disabled=!view.offset;if(next)next.disabled=view.offset+view.limit>=snap.total;
  for(const tab of root.querySelectorAll('.ref-tabs [data-filter]')){const active=tab.dataset.filter.split(':')[1].toUpperCase()===view.phase;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1}
  const coverage=feedCoverage(snap.recent);text('#refresher-coverage',coverage.label);text('#refresher-coverage-age',coverage.detail);
  text('.ref-feed-state strong',coverage.fresh?'Feed observed':'Feed not current');text('.ref-feed-state div span',observedAge(snap.recent?.observedAt));
  const dot=q('.ref-feed-state .status-dot');if(dot)dot.className='status-dot '+(coverage.fresh?'green':'amber');
  text('#refresher-capacity',snap.occupied+' / '+snap.capacity.cap+' active slots');
  const ev=snap.capacityEvidence;text('#refresher-capacity-evidence',ev?.estimate==null?'Practical capacity not established':ev.estimate+' estimated positions · '+ev.samples+' samples · '+observedAge(ev.observedAt));
  text('#refresher-capacity-demand',snap.eligible+' eligible waiting · '+snap.capacity.population+' eligible public generators');
  const badge=q('.ref-side-title .pill');if(badge){badge.textContent=snap.globalPause?'Paused':snap.policy.refreshEnabled?'Enabled':'Off';badge.className='pill '+(snap.policy.refreshEnabled&&!snap.globalPause?'green':'')}
  const descriptions=root.querySelectorAll('.ref-control-card .setting-description');
  if(descriptions[0])descriptions[0].textContent=snap.policy.refreshEnabled?'Automatic guarded saves enabled; placement measured separately.':'Enable once for eligible generators.';
  if(descriptions[1])descriptions[1].textContent=formatTime(snap.policy.activeMs)+' active / '+formatTime(snap.policy.sleepMs)+' rest';
  const toggle=q('[data-toggle="refresher"]');if(toggle){toggle.checked=snap.policy.refreshEnabled;toggle.disabled=snap.restoreHeld===true}
  const pause=q('[data-action="pause-refresher"]');if(pause){pause.textContent=snap.globalPause?'Resume Refresher':'Pause Refresher';pause.disabled=snap.restoreHeld===true}
  const values=root.querySelectorAll('.ref-monitor-value'),labels=root.querySelectorAll('.ref-monitor-row>span:first-child');
  const pairs=[['Feed',snap.recent.suspended?'Observation held':coverage.fresh?'Current sample':'Not current'],['Provider',snap.provider.state.toLowerCase()+' · '+observedAge(snap.provider.observedAt)],['Active clock',snap.activityObservedAt?'Observed '+observedAge(snap.activityObservedAt):'Not observed'],['Next wake',snap.nextWakeAt?new Date(snap.nextWakeAt).toLocaleTimeString():'Not scheduled']];
  pairs.forEach(([label,value],i)=>{if(labels[i])labels[i].textContent=label;if(values[i])values[i].textContent=value});
  renderAccounts(snap,view.account||'');
  const resume=q('#refresher-resume-observations');
  if(resume){resume.hidden=!snap.recent.suspended;resume.onclick=()=>void(async()=>{
   resume.disabled=true;
   try{const fresh=await request('GET_REFRESHER',{});if(!fresh?.ok)throw Error();
    const result=await request('RESET_RECENT_BACKOFF',{expectedRevision:fresh.revision});
    notify(result?.ok?'Observations resumed. Provider backoff still applies.':'Observation recovery could not be confirmed. Refresh before retrying.');
   }catch{notify('Observation recovery outcome unavailable. Refresh before retrying.')}
   finally{await reload();if(resume.isConnected)resume.disabled=false}
  })()}
  const history=q('#refresher-history');if(history){history.replaceChildren();for(const sample of (snap.recent.samples||[]).slice(-6).reverse()){
   const li=el('li','',observedAge(sample.at)+' · '+sample.ownedVisible+' / '+sample.feedSize+' recent positions');history.append(li)}
   if(!history.childElementCount)history.append(el('li','','No complete feed samples yet.'))}
  const cap=q('#refresher-edit-capacity');if(cap)cap.onclick=openCapacity;
 }
 return Object.freeze({render,refreshAccounts,openTiming,openCapacity,openGenerator,pauseGlobal,enable,checkNow});
}
