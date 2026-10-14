// Read canonical projections. UI numbers/labels never confer live authority.
const el=id=>document.getElementById('pcms-refresher-'+id);
const rows=el('rows'),status=el('status'),query=el('query'),phase=el('phase');
let snapshot=null,epoch=0,offset=0,selected=null;
function command(type,params={}){
  return new Promise((resolve,reject)=>{
    let ended=false;const port=browser.runtime.connect({name:'pcms-i12-refresher'});
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),6000);
    function finish(value,error){
      if(ended)return;ended=true;clearTimeout(timer);try{port.disconnect();}catch{}
      error?reject(error):resolve(value);
    }
    port.onMessage.addListener(v=>finish(v));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    port.postMessage({type,params});
  });
}
const duration=ms=>(ms/3600000).toFixed(2)+' h';
function age(at){return at?'observed '+Math.max(0,Math.floor((Date.now()-at)/60000))+' min ago':'unobserved';}
function rowText(r){
  return r.phase+' · '+(r.phase==='SLEEPING'?duration(r.sleepRemaining)+' sleep':
    duration(r.activeRemaining)+' active remaining')+' · '+r.blockers.join(', ');
}
function inspector(){
  const r=selected;
  el('inspector').hidden=!r;
  if(!r)return;
  el('selected').textContent=r.slug+' · '+r.stableId+' · '+rowText(r);
  el('generator-active').value=r.activeMs/3600000;el('generator-sleep').value=r.sleepMs/3600000;
  el('generator-pause').textContent=r.paused?'Resume generator':'Pause generator';
  const proof=r.refresh;
  el('selected').textContent+=' · visibility '+(proof?.state||'UNOBSERVED')+
    ' · misses '+(proof?.misses||0)+' · attempts '+(proof?.attempts||0)+
    ' · independent effect '+(proof?.proof?.effect||'UNVERIFIED')+
    ' · recent feed '+(proof?.proof?.feed?.state||'UNKNOWN');
  el('metric').textContent=r.metric?
    r.metric.views+' observed views · '+age(r.metric.observedAt)+
    (r.metric.correction?' · correction/reset; interval delta unknown':'')+
    (r.metric.stale?' · stale':'')+(r.statisticSuspended?' · polling suspended after bounded failures':''):'Views unobserved.';
}
function draw(s){
  const focusId=document.activeElement?.dataset?.stableId;
  snapshot=s;
  const summary=s.occupied+' occupied shadow slots / '+s.capacity.cap+
    ' admission cap · '+s.eligible+' eligible · planning '+s.capacity.demand.toFixed(2)+
    ' · '+(s.capacity.warning||'multi-window observation')+' · '+
    age(s.recent.observedAt)+(s.recent.stale?' (stale)':'')+
    (s.recent.suspended?' · recent polling suspended after bounded failures':'')+
    ' · '+s.visibilitySuspended+' visibility-held (slot released; active budget preserved).';
  el('summary').textContent=summary;
  el('occupied').textContent=String(s.occupied);
  el('capacity').textContent=String(s.capacity.cap);
  el('eligible').textContent=String(s.eligible);
  el('observed').textContent=s.recent.stale?'Stale':s.recent.observedAt?'Observed':'Unknown';
  el('observed-detail').textContent=age(s.recent.observedAt);
  el('mode').textContent=s.globalPause?'Paused · planning only':'Planning only';
  for(const id of ['pcms-overview-refresher','pcms-queue-refresher']){
    const target=document.getElementById(id);if(target)target.textContent='Shadow Refresher: '+summary;
  }
  el('provider').textContent='Live refresh held · Provider '+s.provider.state+
    ' · Monitoring '+s.monitoring;
  el('diagnostics').textContent=s.diagnostics.turns+' durable turns · '+s.diagnostics.unknownIntervals+
    ' unknown intervals frozen · read peak '+s.diagnostics.readPeak+' · queue peak '+s.diagnostics.queuePeak+
    ' · next wake '+(s.nextWakeAt?new Date(s.nextWakeAt).toLocaleTimeString():'not verified')+
    (s.alarmHeld?' · alarm unverified':'');
  el('global-pause').textContent=s.globalPause?'Resume globally':'Pause globally';
  el('active').value=s.policy.activeMs/3600000;el('sleep').value=s.policy.sleepMs/3600000;
  el('grace').value=s.policy.graceMs/60000;el('cap').value=s.policy.manualCap??'';
  const oldAccount=el('account').value;el('account').replaceChildren();
  for(const a of s.accounts){
    const opt=document.createElement('option');opt.value=a.accountId;
    const id=a.accountId;
    opt.textContent=(id.length>22?id.slice(0,14)+'…'+id.slice(-5):id)+
      ' · '+a.health+(a.paused?' · paused':'');
    opt.title=id+' · '+a.health+' · grace '+(a.graceUsed/60000).toFixed(1)+' min';
    el('account').append(opt);
  }
  if(s.accounts.some(a=>a.accountId===oldAccount))el('account').value=oldAccount;
  el('account-pause').disabled=!s.accounts.length;
  accountButton();
  rows.replaceChildren();
  for(const r of s.items){
    const tr=document.createElement('tr'),td=document.createElement('td');
    const button=document.createElement('button');button.type='button';button.textContent=r.slug;
    button.dataset.stableId=r.stableId;button.setAttribute('aria-label','Inspect Refresher for '+r.slug);
    button.addEventListener('click',()=>{selected=r;inspector();});td.append(button);tr.append(td);
    const present=r.presence?(r.presence.present?'present at '+r.presence.position:'absent; not deleted')+
      ' · '+age(r.presence.observedAt)+(r.presence.stale?' · stale':''):'unobserved';
    const account=document.createElement('td');
    account.textContent=r.accountId?.length>21?r.accountId.slice(0,14)+'…'+r.accountId.slice(-4):r.accountId;
    account.title=r.accountId;tr.append(account);
    const budget=document.createElement('td');budget.className='pcms-refresher-budget';
    const tag=document.createElement('span');tag.className='pcms-status-tag';
    tag.dataset.tone=r.phase==='ACTIVE'?'good':r.phase==='SLEEPING'?'neutral':'info';
    tag.textContent=r.phase==='ACTIVE'?'Active':r.phase==='SLEEPING'?'Sleeping':'Waiting';
    const remaining=document.createElement('span');
    remaining.textContent=duration(r.phase==='SLEEPING'?r.sleepRemaining:r.activeRemaining)+' left';
    const blockers=document.createElement('small');
    blockers.textContent=r.blockers.length?r.blockers.length+' hold(s)':'';
    blockers.title=r.blockers.join(', ');
    budget.append(tag,remaining,blockers);tr.append(budget);
    const ordinal=document.createElement('td');ordinal.textContent=String(r.ordinal);tr.append(ordinal);
    const observed=document.createElement('td');observed.textContent=r.presence?
      (r.presence.present?'Present':r.presence.stale?'Stale':'Not seen'):'Unknown';
    observed.title=present;tr.append(observed);
    rows.append(tr);
  }
  if(!s.items.length){
    const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5;
    td.textContent='No matching canonical shadow records. Remote population is not inferred.';tr.append(td);rows.append(tr);
  }
  el('page').textContent=(s.total?offset+1:0)+'–'+Math.min(s.total,offset+25)+' of '+s.total;
  el('prev').disabled=offset===0;el('next').disabled=offset+25>=s.total;
  if(selected)selected=s.items.find(r=>r.stableId===selected.stableId)||null;
  if(focusId)rows.querySelector('[data-stable-id="'+focusId+'"]')?.focus({preventScroll:true});
  inspector();
  for(const id of ['save','global-pause','generator-pause','generator-save','demand','retry-recent'])
    el(id).disabled=s.restoreHeld===true;
}
function accountButton(){
  const a=snapshot?.accounts.find(a=>a.accountId===el('account').value);
  el('account-pause').textContent=a?.paused?'Resume account':'Pause account';
}
async function load(){
  const mine=++epoch;status.textContent='Reading canonical shadow state…';
  try{
    const s=await command('GET_REFRESHER',{query:query.value,phase:phase.value,offset,limit:25});
    if(mine!==epoch)return;
    if(!s?.ok)throw Error(s?.code||'READ_UNAVAILABLE');
    draw(s);status.textContent=s.restoreHeld?
      'Restore hold · local schedule locked':'Shadow planning · no provider mutation';
  }catch(error){if(mine!==epoch)return;snapshot=null;
    status.textContent='Shadow state unavailable. No healthy fleet or empty remote queue inferred.';
    for(const id of ['save','global-pause','account-pause','generator-pause','generator-save','demand','retry-recent'])el(id).disabled=true;
  }
}
async function change(type,params){
  if(!snapshot)return;const revision=snapshot.revision;status.textContent='Saving local change…';
  try{
    const result=await command(type,{...params,expectedRevision:revision});
    if(!result?.ok){
      if(result?.code==='STALE_REVISION')await load();
      status.textContent=result?.code==='STALE_REVISION'?
      'State changed; review the refreshed values before trying again.':
      'Change held: '+(result?.code||'UNKNOWN');return;}
    await load();status.textContent='Local change committed. Provider refresh mutations remain OFF.';
  }catch{status.textContent='Acknowledgment unavailable. Reload canonical state before trying again.';snapshot=null;}
}
el('reload').addEventListener('click',load);
el('retry-recent').addEventListener('click',()=>change('RESET_RECENT_BACKOFF',{}));
query.addEventListener('input',()=>{offset=0;void load();});phase.addEventListener('change',()=>{offset=0;void load();});
el('prev').addEventListener('click',()=>{offset=Math.max(0,offset-25);void load();});
el('next').addEventListener('click',()=>{offset+=25;void load();});
el('global-pause').addEventListener('click',()=>change('SET_PAUSE',{scope:'GLOBAL',paused:!snapshot?.globalPause}));
el('account').addEventListener('change',accountButton);
el('account-pause').addEventListener('click',()=>{
  const a=snapshot?.accounts.find(a=>a.accountId===el('account').value);
  if(a)void change('SET_PAUSE',{scope:'ACCOUNT',target:a.accountId,paused:!a.paused});
});
el('save').addEventListener('click',()=>change('SET_POLICY',{policy:{
  activeMs:Number(el('active').value)*3600000,sleepMs:Number(el('sleep').value)*3600000,
  graceMs:Number(el('grace').value)*60000,manualCap:el('cap').value===''?null:Number(el('cap').value)}}));
el('generator-pause').addEventListener('click',()=>selected&&change('SET_PAUSE',{
  scope:'GENERATOR',target:selected.stableId,paused:!selected.paused}));
el('generator-save').addEventListener('click',()=>selected&&change('SET_GENERATOR_POLICY',{
  stableId:selected.stableId,activeMs:Number(el('generator-active').value)*3600000,
  sleepMs:Number(el('generator-sleep').value)*3600000}));
el('demand').addEventListener('click',()=>selected&&change('DEMAND_STATISTIC',{stableId:selected.stableId}));
window.addEventListener('hashchange',()=>{if(location.hash==='#refresher')void load();});
window.addEventListener('pcms-refresher-target',event=>{
  query.value=event.detail.slug;offset=0;location.hash='#refresher';void load();
});
await load();
