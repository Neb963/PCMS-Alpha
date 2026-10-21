/* PCMS 0.1.5 desktop: faithful presentation over the genuine production controls.
   All existing nodes remain the authority-bearing controls. Never copy or
   replace a handler, invent a provider outcome, or synthesize job success.
   This module uses native DOM APIs and read-only runtime queries only. */
const $=id=>document.getElementById(id);
const node=(tag,cls,text)=>{
  const el=document.createElement(tag);
  if(cls)el.className=cls;
  if(text!==undefined)el.textContent=String(text);
  return el;
};
const action=(label,run,cls='')=>{
  const button=node('button',cls,label);button.type='button';button.addEventListener('click',run);return button;
};
function navigate(route,group){
  if(group){
    const more=document.querySelector('#view-'+route+' .v015-queue-workflows');
    if(more)more.open=true;
    const button=document.querySelector('#view-'+route+' .pcms-v014-workflow-button[data-ui-group="'+group+'"]');
    button?.click();
  }
  location.hash='#'+route;
}
function listenRead(port,type,params={},timeoutMs=5500){
  return new Promise((resolve,reject)=>{
    let channel,done=false;
    const timer=setTimeout(()=>finish(undefined,new Error('TIMEOUT')),timeoutMs);
    function finish(value,error){
      if(done)return;done=true;clearTimeout(timer);try{channel?.disconnect();}catch{}
      error?reject(error):resolve(value);
    }
    try{
      channel=browser.runtime.connect({name:port});
      channel.onMessage.addListener(v=>finish(v));
      channel.onDisconnect.addListener(()=>finish(undefined,new Error('DISCONNECTED')));
      channel.postMessage({type,params});
    }catch(error){finish(undefined,error);}
  });
}
function heading(route,subtitle,actions=[]){
  const root=$('view-'+route),head=root?.querySelector(':scope > .workspace-head');
  if(!head)return;
  head.classList.add('v015-page-head');
  const original=head.querySelector(':scope > div');
  const old=original?.querySelector(':scope > p:not(.eyebrow)');
  if(old&&subtitle)old.textContent=subtitle;
  let controls=head.querySelector(':scope > .v015-heading-actions');
  if(!controls){controls=node('div','v015-heading-actions');head.append(controls);}
  for(const entry of actions)controls.append(entry);
  return {root,head,controls};
}
function note(target,value){
  if(!target)return;
  target.textContent=value;
}
function mountHeader(){
  document.documentElement.dataset.pcmsUiVersion='0.1.5';
  const top=document.querySelector('.topbar');
  if(!top)return;
  const badge=node('span','v015-top-status','UI v0.1.5 · LIVE');
  badge.title='Canonical local state; an unavailable observation is not a healthy state';
  const advanced=$('advanced');
  top.insertBefore(badge,advanced);
  const avatar=node('span','v015-avatar','OP');
  avatar.title='Local PCMS operator';
  top.append(avatar);
  const group=document.querySelector('.pcms-v014-global-search');
  group?.querySelector('input')?.setAttribute('placeholder','Search PCMS');
  const hint=group?.querySelector('.pcms-v014-key-hint');
  if(hint)hint.textContent='Ctrl K';
}
function mountOverview(){
  const meta=heading('overview','Your fleet at a glance.');
  if(!meta)return;
  const right=meta.head.querySelector('.overview-links');
  right?.classList.add('v015-overview-actions');
  if(right)meta.controls.append(right);
  const stats=meta.root.querySelector('.stat-band');
  stats?.classList.add('v015-overview-stats');
  const names=['Managed generators','Refresher status','Last backup','Recovery'];
  stats?.querySelectorAll('.stat h2').forEach((el,i)=>el.textContent=names[i]||el.textContent);
  const split=meta.root.querySelector('.overview-split');
  split?.classList.add('v015-overview-split');
  const attention=$('pcms-attention-list')?.closest('section.panel');
  attention?.classList.add('v015-attention-card');
  const runtime=$('pcms-guard-health')?.closest('section.panel');
  runtime?.classList.add('v015-health-card');
  const journal=$('pcms-journal-health')?.closest('section.panel');
  journal?.classList.add('v015-journal-card');
  const review=$('review-title')?.closest('section.panel');
  review?.classList.add('v015-progress-card');
  if(review){
    const h=review.querySelector('h2');if(h)h.textContent='Ready for your decision';
    const helper=review.querySelector('.empty');
    if(helper)helper.textContent='Exact-source reviews and held operations appear in the Work Queue. No approval is inferred from a test result.';
  }
  const statusBadge=node('span','v015-readonly-pill','Protected operations');
  const healthHead=runtime?.querySelector('.panel-head');
  healthHead?.append(statusBadge);
  const overviewRefresh=$('pcms-attention-refresh');
  if(overviewRefresh)overviewRefresh.textContent='Refresh';
}
function mountGeneratorInventory(){
  const h=heading('generators','Browse and manage your generators.',[
    action('↻ Sync inventory',()=>{$('pcms-generator-refresh')?.click();},'v015-outline'),
    action('+ Create generators',()=>navigate('generators','create'),'v015-primary')
  ]);
  if(!h)return;
  const panel=$('generators-table-title')?.closest('section.panel');
  if(!panel)return;
  panel.classList.add('v015-inventory-panel');
  const headingEl=panel.querySelector('.panel-head h2');
  if(headingEl)headingEl.textContent='Generators';
  const pill=panel.querySelector('.panel-head .unknown');
  if(pill)pill.textContent='Local observations · not live ownership';
  // Group actual interactive inputs and filters without destroying their listeners.
  const controls=panel.querySelector('.account-controls');
  controls?.classList.add('v015-original-search-controls');
  const search=$('pcms-generator-query'),filter=$('pcms-generator-owner-filter');
  if(search&&filter&&controls){
    const toolbar=node('div','v015-inventory-tools');
    const q=node('div','v015-input-wrap'),f=node('div','v015-input-wrap v015-owner-wrap');
    q.append(search);search.placeholder='Search generators or accounts…';
    f.append(filter);
    toolbar.append(q,f);
    toolbar.append(action('More filters',()=>{
      const more=$('pcms-generator-account')?.closest('.account-controls');
      if(more)more.classList.toggle('v015-force-visible');
      more?.scrollIntoView({block:'nearest'});
    },'v015-outline'));
    panel.querySelector('.panel-head')?.after(toolbar);
    const nativeSearchLabel=panel.querySelector('label[for=pcms-generator-query]');
    const nativeFilterLabel=panel.querySelector('label[for=pcms-generator-owner-filter]');
    if(nativeSearchLabel)nativeSearchLabel.classList.add('v015-sr-only');
    if(nativeFilterLabel)nativeFilterLabel.classList.add('v015-sr-only');
    search.setAttribute('aria-label','Search observed generators or accounts');
    filter.setAttribute('aria-label','Filter historical owner evidence');
  }
  const nativeFilter=$('pcms-generator-owner-filter');
  const nativeSelect=$('pcms-generator-account');
  const tabs=node('div','v015-inventory-tabs');
  const choices=[['ALL','All'],['OBSERVED_OWNER','Owner verified'],['OWNER_UNVERIFIED','Unknown'],['OWNER_DISPUTED','Disputed'],['UNOBSERVED','Unobserved']];
  const buttons=new Map();
  for(const [key,label] of choices){
    const b=action(label,()=>{if(!nativeFilter)return;
      nativeFilter.value=key;nativeFilter.dispatchEvent(new Event('change',{bubbles:true}));refresh();},'v015-filter-tab');
    b.setAttribute('aria-pressed','false');tabs.append(b);buttons.set(key,b);
  }
  function refresh(){
    for(const [key,b] of buttons)b.setAttribute('aria-pressed',String(key===nativeFilter?.value));
  }
  nativeFilter?.addEventListener('change',refresh);refresh();
  panel.querySelector('.v015-inventory-tools')?.after(tabs);
  const safety=$('blocked-generators');
  if(safety){
    const disclosure=node('details','v015-generator-help');
    disclosure.append(node('summary','','About generator safeguards'));
    disclosure.append(safety);
    panel.after(disclosure);
  }
  const wrap=panel.querySelector('.table-wrap');
  wrap?.classList.add('v015-inventory-table');
  const table=wrap?.querySelector('table');
  if(table){
    const labels=['Generator','Account','Owner evidence','Visibility & source'];
    table.querySelectorAll('thead th').forEach((th,i)=>th.textContent=labels[i]||th.textContent);
  }
  const nativeMore=nativeSelect?.closest('.account-controls');
  nativeMore?.classList.add('v015-native-filters');
  const info=$('pcms-inventory-feedback');
  info?.classList.add('v015-quiet-feedback');
  const counter=$('pcms-generator-count');counter?.classList.add('v015-count');
  const workflows=h.root.querySelector(':scope > .pcms-v014-workflow-nav');
  if(workflows){panel.after(workflows);workflows.classList.add('v015-more-workflows');}
}
function mountQueue(){
  const h=heading('work-queue','Everything PCMS is working on, in one place.',[
    action('Activity log',()=>navigate('work-queue','activity'),'v015-outline')
  ]);
  if(!h)return;
  const root=h.root;
  const board=node('section','v015-queue-board panel');
  const bar=node('div','v015-queue-bar');
  const stats=node('p','v015-queue-summary','Loading canonical operation receipts…');
  const search=node('input','v015-queue-search');search.type='search';search.placeholder='Find a receipt…';search.setAttribute('aria-label','Filter displayed local work receipts');
  bar.append(stats,search);board.append(bar);
  const tabs=node('div','v015-queue-tabs'),content=node('div','v015-queue-content');
  const filters=[['attention','Needs action'],['running','In progress'],['all','All receipts']];
  let selected='attention';
  const list=node('div','v015-queue-list');
  const tabButtons=new Map();
  for(const [key,label] of filters){
    const b=action(label,()=>{selected=key;update();},'v015-filter-tab');
    b.setAttribute('aria-pressed','false');tabs.append(b);tabButtons.set(key,b);
  }
  board.append(tabs,content);content.append(list);
  const page=root.querySelector(':scope > header.workspace-head');
  const nav=root.querySelector(':scope > .pcms-v014-workflow-nav');
  if(nav)nav.before(board);else page?.after(board);
  const originals=[
    {id:'pcms-stage-queue',label:'Private staging',group:'activity'},
    {id:'pcms-adopt-receipts',label:'Adoption',group:'activity'},
    {id:'pcms-supply-queue',label:'Generator supply',group:'activity'},
    {id:'pcms-s06-review-queue',label:'Publication review',group:'release'},
    {id:'pcms-work-queue-summary',label:'Operation journal',group:'activity'}
  ];
  const observations=originals.map(x=>({...x,el:$(x.id)})).filter(x=>x.el);
  function update(){
    for(const [k,b] of tabButtons)b.setAttribute('aria-pressed',String(k===selected));
    const summary=$('pcms-work-queue-summary')?.textContent||'Canonical operation journal unavailable.';
    stats.textContent=summary;
    list.replaceChildren();
    const phrase=search.value.trim().toLowerCase();
    let found=0;
    for(const o of observations){
      const text=(o.el.textContent||'').trim();
      if(!text||/^(reading|loading|checking|awaiting)\b/i.test(text))continue;
      const needs=/uncertain|held|fail|pending|review|attention|blocked|conflict/i.test(text);
      if(selected==='attention'&&!needs)continue;
      if(selected==='running'&&!/running|prepared|dispatch|waiting|processing/i.test(text))continue;
      if(phrase&&!((text+' '+o.label).toLowerCase().includes(phrase)))continue;
      const item=node('div','v015-job-row');
      const avatar=node('span','v015-job-icon',needs?'!':'•');
      const info=node('div','v015-job-info');
      info.append(node('strong','',o.label),node('p','',text.slice(0,250)));
      const b=action('Inspect',()=>navigate('work-queue',o.group),'v015-outline');
      item.append(avatar,info,b);list.append(item);found++;
    }
    if(!found)list.append(node('p','v015-empty','No '+(selected==='attention'?'action-required':selected==='running'?'in-progress':'matching')+' local receipts currently observed. This does not imply remote health.'));
  }
  let queued=false;
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;if(location.hash==='#work-queue')update();});});
  for(const o of observations)observer.observe(o.el,{childList:true,subtree:true,characterData:true});
  search.addEventListener('input',update);
  window.addEventListener('hashchange',()=>{if(location.hash==='#work-queue')update();});
  update();
  // Genuine advanced panels remain in the DOM, with their original input
  // nodes and listeners. They become a deliberate drill-down rather than the
  // default wall of unrelated large forms.
  const advanced=node('details','v015-queue-workflows');
  advanced.append(node('summary','','More workflows and advanced operations'));
  const body=node('div','v015-queue-workflows-body');
  advanced.append(body);
  if(nav)body.append(nav);
  const legacyStatus=$('pcms-queue-refresher');
  const link=legacyStatus?.nextElementSibling;
  if(legacyStatus)body.append(legacyStatus);
  if(link?.querySelector('a[href="#refresher"]'))body.append(link);
  const panels=[...root.children].filter(p=>p.matches?.('section.panel')&&p!==board);
  for(const panel of panels)body.append(panel);
  board.after(advanced);
  // Uncontrolled standalone read-only status is available in the compact
  // queue card and this disclosure, never silently removed.

}
function mountAccounts(){
  const h=heading('accounts','Protected Personas and their managed accounts.',[
    action('+ Add account',()=>{const target=$('accounts-enrollment-title')?.closest('section.panel');
      if(!target)return;target.hidden=false;target.classList.toggle('v015-account-enroll-open');
      if(target.classList.contains('v015-account-enroll-open'))target.scrollIntoView({block:'start'});
    },'v015-primary')
  ]);
  if(!h)return;
  const oldRefresh=$('pcms-refresh-accounts');
  if(oldRefresh){
    oldRefresh.textContent='↻ Refresh';
    h.controls.prepend(oldRefresh);
  }
  const root=h.root;
  const listPanel=$('accounts-inventory-title')?.closest('section.panel');
  const enrollment=$('accounts-enrollment-title')?.closest('section.panel');
  const help=root.querySelector(':scope > .notice');
  if(help&&listPanel){
    const disclosure=node('details','v015-account-help');
    disclosure.append(node('summary','','About protected account setup'));
    disclosure.append(help);
    listPanel.after(disclosure);
  }
  enrollment?.classList.add('v015-enrollment');
  // Preserve existing human-login affordances; collapse the optional enrollment form.
  enrollment?.setAttribute('data-v015-optional','true');
  listPanel?.classList.add('v015-accounts-panel');
  const panelHead=listPanel?.querySelector('.panel-head');
  if(panelHead?.querySelector('h2'))panelHead.querySelector('h2').textContent='Your accounts';
  const tools=node('div','v015-account-tools');
  const input=node('input');input.type='search';input.placeholder='Search accounts…';input.setAttribute('aria-label','Filter rendered managed accounts');
  const status=node('select');status.setAttribute('aria-label','Filter accounts by observed state');
  for(const [k,label] of [['ALL','All'],['VERIFIED','Verified'],['ATTENTION','Needs attention'],['ARCHIVED','Archived']]){
    const option=node('option','',label);option.value=k;status.append(option);
  }
  tools.append(input,status);
  panelHead?.after(tools);
  const rows=$('pcms-accounts-list');
  function decorate(){
    const records=[...rows?.querySelectorAll(':scope > .account-record')||[]];
    for(const record of records){
      if(record.classList.contains('v015-account-record'))continue;
      record.classList.add('v015-account-record');
      const title=record.querySelector('h3');const detail=record.querySelector(':scope > p');
      const controls=record.querySelector(':scope > .account-controls');
      if(title&&controls){
        const manage=node('details','v015-account-manage');
        manage.append(node('summary','','Manage'),controls);
        record.append(manage);
        if(detail)detail.classList.add('v015-account-detail');
      }
    }
    for(const record of records){
      const id=(record.dataset.pcmsV014AccountId||'').toLowerCase();
      const t=(record.textContent||'').toLowerCase();
      const key=status.value,archived=/archived/i.test(record.querySelector('h3')?.textContent||'');
      const verified=/ready|identity verified/i.test(record.querySelector('h3')?.textContent||'');
      const display=(!input.value||id.includes(input.value.toLowerCase())||t.includes(input.value.toLowerCase()))&&
        (key==='ALL'||key==='ARCHIVED'&&archived||key==='VERIFIED'&&verified||key==='ATTENTION'&&!verified&&!archived);
      record.hidden=!display;
    }
    const count=panelHead?.querySelector('.unknown');
    if(count)count.textContent=records.length+' local account records · protected route required';
  }
  const observer=new MutationObserver(()=>{observer.disconnect();decorate();observer.observe(rows,{childList:true});});
  if(rows){observer.observe(rows,{childList:true});decorate();}
  input.addEventListener('input',decorate);status.addEventListener('change',decorate);
}
function mountRefresher(){
  const h=heading('refresher','Recent-feed scheduling and generator eligibility.',[
    action('↻ Check now',()=>$('pcms-refresher-reload')?.click(),'v015-outline'),
    action('Edit timing',()=>{
      const policy=$('pcms-v014-refresher-policy');
      if(policy)policy.open=true;
      policy?.scrollIntoView({block:'nearest'});
      policy?.querySelector('summary')?.focus({preventScroll:true});
    },'v015-outline')
  ]);
  if(!h)return;
  const root=h.root,primary=$('pcms-refresher-rows')?.closest('section.panel');
  if(!primary)return;
  primary.classList.add('v015-refresher-panel');
  const title=primary.querySelector('.panel-head h2');
  if(title)title.textContent='Generators';
  const statusBand=node('section','v015-refresher-stats');
  const metrics=new Map();
  for(const key of ['Active','Sleeping','Waiting']){
    const item=node('div','v015-ref-stat');item.append(node('small','',key));const figure=node('strong','v015-number','—');
    item.append(figure);metrics.set(key,figure);statusBand.append(item);
  }
  const feed=node('div','v015-ref-stat v015-feed-stat');
  feed.append(node('small','','Recent feed'));
  const feedValue=node('strong','','Not measured');feed.append(feedValue);statusBand.append(feed);
  root.querySelector(':scope > header.workspace-head')?.after(statusBand);
  const rail=node('aside','v015-refresher-rail');
  rail.setAttribute('aria-label','Automatic Refresher and monitoring');
  const auto=node('section','panel v015-ref-rail-card');
  const headingEl=node('div','v015-rail-head');
  headingEl.append(node('h2','','Automatic Refresher'));
  const safety=node('span','v015-pending','State unknown');headingEl.append(safety);auto.append(headingEl);
  const statusRow=node('div','v015-rail-status');
  statusRow.append(node('strong','','Marker saves'),node('span','', 'Explicit opt-in'));
  auto.append(statusRow);
  const policy=$('pcms-v014-refresher-policy');if(policy)auto.append(policy);
  const global=$('pcms-refresher-global-pause');
  if(global)auto.append(global);
  rail.append(auto);
  const monitor=node('section','panel v015-ref-rail-card');
  monitor.append(node('h2','','Monitoring'));
  const fields=[['Feed','pcms-refresher-summary'],['Provider','pcms-refresher-provider'],['Scheduler','pcms-refresher-diagnostics']];
  const rows=new Map();
  for(const [label,id] of fields){
    const r=node('div','v015-monitor-item');r.append(node('span','',label));
    const value=node('span','v015-monitor-value','Unknown');
    r.append(value);monitor.append(r);rows.set(id,value);
  }
  rail.append(monitor);
  primary.after(rail);
  const grid=root;grid.classList.add('v015-refresher-layout');
  const sum=$('pcms-refresher-summary'),provider=$('pcms-refresher-provider'),diag=$('pcms-refresher-diagnostics');
  for(const el of [sum,provider,diag])el?.classList.add('v015-backend-status');
  const nativePhase=$('pcms-refresher-phase');
  const tabWrap=node('div','v015-ref-phase-tabs');
  const tabs=new Map();
  for(const [key,label] of [['ALL','All'],['ACTIVE','Active'],['SLEEPING','Sleeping'],['WAITING','Waiting']]){
    const b=action(label,()=>{
      if(!nativePhase)return;nativePhase.value=key;
      nativePhase.dispatchEvent(new Event('change',{bubbles:true}));sync();
    },'v015-filter-tab');
    b.setAttribute('aria-pressed','false');tabWrap.append(b);tabs.set(key,b);
  }
  const table=primary.querySelector('.table-scroll');
  if(table)table.before(tabWrap);
  function sync(){
    for(const [key,b] of tabs)b.setAttribute('aria-pressed',String(nativePhase?.value===key));
    const live=provider?.textContent||'';
    safety.textContent=/ENABLED/i.test(live)?'Enabled':/OFF|disabled/i.test(live)?'Paused / off':'Unknown';
    safety.className=/ENABLED/i.test(live)?'v015-good':'v015-pending';
    feedValue.textContent=/unobserved|unknown|not yet/i.test(sum?.textContent||'')?'Not measured':
      /owned recent-page occupancy/i.test(sum?.textContent||'')?'Observed (historical)':'Unknown';
    for(const [id,v] of rows){
      const raw=$(id)?.textContent?.trim()||'';
      v.textContent=raw?raw.slice(0,150):'Unknown';
      v.title=raw;
    }
  }
  nativePhase?.addEventListener('change',sync);
  const watches=[sum,provider,diag].filter(Boolean);
  const observer=new MutationObserver(()=>{if(location.hash==='#refresher')sync();});
  for(const x of watches)observer.observe(x,{characterData:true,childList:true,subtree:true});
  async function refreshStats(){
    try{
      const result=await listenRead('pcms-i12-refresher','GET_REFRESHER',{query:'',phase:'ALL',offset:0,limit:1});
      if(result?.ok!==true)throw Error('Unavailable');
      // Query actual phase-specific canonical counts; occupied slots are not
      // equivalent to the number of ACTIVE generators. Do not invent totals.
      const keys=[['Active','ACTIVE'],['Sleeping','SLEEPING'],['Waiting','WAITING']];
      const observed=await Promise.allSettled(keys.map(([,phase])=>
        listenRead('pcms-i12-refresher','GET_REFRESHER',{query:'',phase,offset:0,limit:1})));
      observed.forEach((entry,i)=>{
        const count=entry.status==='fulfilled'&&entry.value?.ok===true&&
          Number.isInteger(entry.value.total)?entry.value.total:null;
        metrics.get(keys[i][0]).textContent=count===null?'—':String(count);
      });
    }catch{
      for(const value of metrics.values())value.textContent='—';
    }
  }
  $('pcms-refresher-reload')?.addEventListener('click',()=>{void refreshStats();});
  window.addEventListener('hashchange',()=>{if(location.hash==='#refresher'){sync();void refreshStats();}});
  sync();void refreshStats();
}
function mountSettings(){
  const h=heading('settings','Connections, automation and maintenance — without the clutter.');
  if(!h)return;
  const root=h.root;
  root.classList.add('v015-settings-layout');
  const nav=root.querySelector(':scope > .pcms-v014-workflow-nav');
  nav?.classList.add('v015-settings-nav');
  const names={
    backup:'Backup & Restore',automation:'Automation',permissions:'Connections & access',
    ai:'AI settings',diagnostics:'Diagnostics',other:'Advanced'
  };
  for(const button of nav?.querySelectorAll('button[data-ui-group]')||[])
    button.textContent=names[button.dataset.uiGroup]||button.textContent;
  const original=nav?.querySelector('[data-ui-group="permissions"]');
  // Compact connections summary. Truth comes from the pre-existing native
  // status controls; the frontend cannot certify any external connection.
  const panel=node('section','panel v015-connections');
  panel.append(node('h2','','Connected services'));
  panel.append(node('p','v015-services-hint',
    'Check actual protected state in the relevant workspace. Unknown is not connected.'));
  for(const item of [
    ['GitHub source','pcms-catalog-status','generators','catalog'],
    ['PersonaMonkey','pcms-accounts-feedback','accounts',null],
    ['Native backup service','pcms-backup-status','settings','backup']
  ]){
    const row=node('div','v015-service-row');
    const detail=node('div','v015-service-detail');
    detail.append(node('strong','',item[0]));
    const state=node('small','', 'State not yet observed');
    detail.append(state);
    const btn=action('Check',()=>navigate(item[2],item[3]),'v015-outline');
    row.append(detail,btn);panel.append(row);
    const target=$(item[1]);
    if(target){
      const sync=()=>{
        const text=target.textContent?.trim()||'';
        state.textContent=text.slice(0,220)||'No current local observation';
        state.title=text;
      };
      const observer=new MutationObserver(sync);
      observer.observe(target,{characterData:true,childList:true,subtree:true});
      sync();
    }
  }
  nav?.after(panel);
  function active(){
    panel.hidden=original?.getAttribute('aria-pressed')!=='true';
  }
  nav?.addEventListener('click',()=>queueMicrotask(active));
  nav?.addEventListener('keydown',()=>queueMicrotask(active));
  original?.click();active();
}
function boot(){
  mountHeader();mountOverview();mountGeneratorInventory();mountQueue();mountAccounts();mountRefresher();mountSettings();
  document.documentElement.classList.add('pcms-v015-faithful');
}
boot();
