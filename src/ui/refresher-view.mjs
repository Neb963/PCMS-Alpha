import {requestTypedConfirmation} from './typed-confirm.mjs';
// Read canonical projections. UI numbers/labels never confer live authority.
const el=id=>document.getElementById('pcms-refresher-'+id);
const rows=el('rows'),status=el('status'),query=el('query'),phase=el('phase');
let snapshot=null,epoch=0,offset=0,selected=null,qualification=null,qualificationBusy=false,qualificationEpoch=0,sourceRefresh=null,sourceBusy=false,sourceEpoch=0,sourceResource=null,reviewerFingerprint=null;
function command(type,params={}){
  return new Promise((resolve,reject)=>{
    let ended=false;const port=browser.runtime.connect({name:'pcms-i12-refresher'});
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),30000);
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
  sourceDraw();
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
  const summary=s.occupied+' occupied slots / '+s.capacity.cap+
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
  el('mode').textContent=s.globalPause?'Paused':s.fleetMutationReady?'Scoped scheduling':'Marker test available';
  for(const id of ['pcms-overview-refresher','pcms-queue-refresher']){
    const target=document.getElementById(id);if(target)target.textContent=(s.sourceSaveAvailable?'Source-save Refresher: ':'Shadow Refresher: ')+summary;
  }
  el('provider').textContent=(s.fleetMutationReady?'Qualified target scheduling':s.sourceSaveAvailable?'Guarded marker tests available':'Refresh qualification required')+
    ' · Provider '+s.provider.state+' · Monitoring '+s.monitoring;
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
    button.addEventListener('click',()=>{selected=r;qualification=null;sourceRefresh=null;inspector();void qualificationAction('GET_QUALIFICATION');void sourceAction('GET_SOURCE_REFRESH');});td.append(button);tr.append(td);
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
  const mine=++epoch;status.textContent='Reading canonical schedule…';
  try{
    const s=await command('GET_REFRESHER',{query:query.value,phase:phase.value,offset,limit:25});
    if(mine!==epoch)return;
    if(!s?.ok)throw Error(s?.code||'READ_UNAVAILABLE');
    draw(s);status.textContent=s.restoreHeld?
      'Restore hold · local schedule locked':s.sourceSaveAvailable?'Protected marker tests available; recurring saves require target qualification.':'Shadow planning · no provider mutation';
  }catch(error){if(mine!==epoch)return;snapshot=null;
    status.textContent='Refresher state unavailable. No healthy fleet or empty remote queue inferred.';
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
    await load();status.textContent='Local change committed. '+(snapshot?.fleetMutationReady?'Qualified adapter admission remains target-specific.':'Monitoring active; recurring refresh awaits provider qualification.');
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

async function qualificationAction(type){
  if(!selected||qualificationBusy)return;
  const target=selected.stableId,slug=selected.slug,mine=++qualificationEpoch;
  const params={stableId:target};
  if(type!=='GET_QUALIFICATION')params.expectedRevision=qualification?.revision||0;
  if(type==='BEGIN_QUALIFICATION'){
    const text=await requestTypedConfirmation(el('qualify-begin'),'OBSERVE '+slug,'Capture public source and recent-list evidence. This action does not change the provider.');
    if(text===null)return;params.confirmation=text;
  }
  if(selected?.stableId!==target||qualificationBusy)return;
  qualificationBusy=true;el('qualify-status').textContent='Reading protected owner, saved source and recent list…';
  for(const name of ['begin','observe','load'])el('qualify-'+name).disabled=true;
  try{
    const out=await command(type,params);
    if(mine!==qualificationEpoch||selected?.stableId!==target)return;
    if(!out?.ok){el('qualify-status').textContent=(out?.code||'UNKNOWN')+' · Load receipt before any further action.';return;}
    qualification=out.qualification;
    const q=qualification,f=q.after?.feed||q.before?.feed;
    el('qualify-status').textContent=q.state+' · '+q.nextAction+
      (f?' · Recent: '+(f.complete?(f.present?'present, rank '+f.rank:'absent'):'unverified')+
        ' · '+new Date(f.observedAt).toLocaleString():'')+
      (q.approvedEffectConfirmed?' · Exact approved change independently confirmed.':'');
  }catch{el('qualify-status').textContent='Observation reply unavailable. Load canonical receipt; do not repeat the update.';}
  finally{
    qualificationBusy=false;
    el('qualify-begin').disabled=!!qualification?.revision||snapshot?.restoreHeld===true;
    el('qualify-observe').disabled=!qualification?.revision||snapshot?.restoreHeld===true;
    el('qualify-load').disabled=false;
    if(selected&&selected.stableId!==target)void qualificationAction('GET_QUALIFICATION');
  }
}
el('qualify-begin').addEventListener('click',()=>qualificationAction('BEGIN_QUALIFICATION'));
el('qualify-observe').addEventListener('click',()=>qualificationAction('OBSERVE_QUALIFICATION'));
el('qualify-load').addEventListener('click',()=>qualificationAction('GET_QUALIFICATION'));


const sourceButtons=['preview','consent','test','observe','load','export','measure','challenge','schedule','revoke','trust','import'];
function sourceDraw(){
  const q=sourceRefresh,plan=q?.preview?.plan,held=snapshot?.restoreHeld||!selected;
  el('source-status').textContent=q?String(q.state).replaceAll('_',' ')+
    (q.lastHold?' · '+q.lastHold.replaceAll('_',' '):''):'Source-marker eligibility not loaded.';
  el('source-fingerprint').textContent=q?.approvedBaseFingerprint?
    'Reviewed base F: '+q.approvedBaseFingerprint+' · Verified current: '+q.effectiveCurrentFingerprint:'';
  el('source-diff').textContent=plan?'index.html · byte zero only\n− '+(plan.beforeMarker||'(no marker)')+
    '+ '+plan.afterMarker+'\nExact pre-save: '+plan.expectedPreSaveFingerprint+
    '\nExact post-save: '+plan.expectedPostSaveFingerprint+'\nConsent expires: '+new Date(q.preview.expiresAt).toLocaleString():'No marker preview captured.';
  const proof=q?.proof;
  el('source-result').textContent=proof?'Native attempt: '+(proof.attemptResult?.code||'ACK UNKNOWN')+
    ' · Persisted source: '+(proof.effect==='EFFECT_CONFIRMED'?'independently confirmed':proof.effect)+
    ' · Recent snapshot: '+(proof.feed.state==='PRESENT'?'present, rank '+proof.feed.rank:
      proof.feed.state==='ABSENT'?'absent from this snapshot':'unknown')+
    (proof.feed.at?' · '+new Date(proof.feed.at).toLocaleString():'')+
    (q.observation?.remaining>0&&q.observation.nextAt&&
      (q.intent||proof.feed.state!=='PRESENT')?' · Next read-only observation: '+new Date(q.observation.nextAt).toLocaleString()+
        ' ('+q.observation.remaining+' remaining)':''):'No save attempted. Preview and consent do not save.';
  el('source-review-state').textContent=(q?.qualification?'Qualified until '+new Date(q.qualification.validUntil).toLocaleString():
    'No signed target qualification.')+' · '+(q?.scheduleEnabled?'Schedule enabled':'Schedule disabled')+
    (sourceResource?' · Local fixture '+sourceResource.accounts+' accounts / '+sourceResource.generators+' generators, '+sourceResource.turnMs+' ms':' · Resource measurement missing')+
    (reviewerFingerprint?' · Reviewer '+reviewerFingerprint:'');
  for(const name of sourceButtons)el('source-'+name).disabled=!!held||sourceBusy;
  el('source-consent').disabled=held||sourceBusy||!plan||q.preview.expiresAt<Date.now()||q.testAttempted;
  el('source-test').disabled=held||sourceBusy||snapshot?.globalPause||selected?.paused||
    selected?.phase==='SLEEPING'||selected?.blockers?.includes('ACCOUNT_PAUSE')||!q?.preview?.consented||q.preview.expiresAt<Date.now()||q.testAttempted;
  el('source-observe').disabled=held||sourceBusy||!q?.testAttempted||
    !q.observation?.remaining||q.observation.nextAt>Date.now();
  el('source-export').disabled=sourceBusy||!q;
  el('source-challenge').disabled=held||sourceBusy||!sourceResource||proof?.effect!=='EFFECT_CONFIRMED'||proof.feed?.state!=='PRESENT';
  el('source-schedule').disabled=held||sourceBusy||!q?.qualification;
  el('source-schedule').textContent=q?.scheduleEnabled?"Disable this target's schedule":"Enable this target's schedule";
  el('source-revoke').disabled=held||sourceBusy||!q?.qualification;
}
function downloadReceipt(name,data){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function sourceAction(type,extra={}){
  if(!selected||sourceBusy)return;
  const target=selected.stableId,slug=selected.slug,revision=sourceRefresh?.revision||0,mine=++sourceEpoch;
  const p={stableId:target,...extra};
  if(!['GET_SOURCE_REFRESH','GET_REFRESH_REVIEW_CHALLENGE'].includes(type))p.expectedRevision=revision;
  const confirmations={CONSENT_SOURCE_REFRESH:'CONSENT '+slug+' '+sourceRefresh?.approvedBaseFingerprint,
    TEST_SOURCE_REFRESH:'TEST '+slug+' '+sourceRefresh?.preview?.plan?.expectedPostSaveFingerprint,
    SET_REFRESH_SCHEDULE:'SCHEDULE '+slug};
  if(confirmations[type]&&!(type==='SET_REFRESH_SCHEDULE'&&extra.enabled===false)){
    const trigger=el(type==='CONSENT_SOURCE_REFRESH'?'source-consent':type==='TEST_SOURCE_REFRESH'?'source-test':'source-schedule');
    const answer=await requestTypedConfirmation(trigger,confirmations[type],type==='TEST_SOURCE_REFRESH'?
      'One native save on this exact listed generator. An uncertain result will be reconciled without another save.':
      type==='CONSENT_SOURCE_REFRESH'?
        'Confirm that the displayed HTML byte-zero comment is safe for this generator. This approves only that marker derivation of the exact reviewed source F.':
        'Enable only this independently qualified target under the existing active/sleep policy.');
    if(answer===null)return;p.confirmation=answer;
  }
  if(selected?.stableId!==target||sourceBusy||revision!==(sourceRefresh?.revision||0))return;
  sourceBusy=true;sourceDraw();el('source-status').textContent=type==='TEST_SOURCE_REFRESH'?'Saving one guarded marker attempt…':'Reading protected source/review state…';
  try{
    const out=await command(type,p);
    if(mine!==sourceEpoch||selected?.stableId!==target)return;
    if(!out?.ok){if(type==='TEST_SOURCE_REFRESH'&&sourceRefresh)sourceRefresh={...sourceRefresh,preview:null};
      el('source-status').textContent='Held: '+(out?.code||'UNKNOWN')+'. Reload the receipt before another action.';return;}
    if(type==='GET_REFRESH_REVIEW_CHALLENGE'){downloadReceipt('pcms-h04-review-challenge.json',out);return;}
    const latest=out.sourceRefresh?out:await command('GET_SOURCE_REFRESH',{stableId:target});
    if(selected?.stableId!==target)return;
    if(latest.ok){sourceRefresh=latest.sourceRefresh;sourceResource=latest.resource||sourceResource;reviewerFingerprint=latest.reviewerFingerprint||reviewerFingerprint;}
    sourceDraw();
    if(out.code)el('source-status').textContent=out.code.replaceAll('_',' ');
  }catch{if(type==='TEST_SOURCE_REFRESH'&&sourceRefresh)sourceRefresh={...sourceRefresh,preview:null};
    el('source-status').textContent='Reply unavailable. Reload the canonical receipt; do not repeat the save.';}
  finally{sourceBusy=false;
    // Restore controls without replacing a causal failure message.
    const message=el('source-status').textContent;sourceDraw();el('source-status').textContent=message;
    if(selected?.stableId!==target)void sourceAction('GET_SOURCE_REFRESH');
  }
}
for(const [name,type] of Object.entries({preview:'PREVIEW_SOURCE_REFRESH',consent:'CONSENT_SOURCE_REFRESH',
  test:'TEST_SOURCE_REFRESH',observe:'OBSERVE_SOURCE_REFRESH',load:'GET_SOURCE_REFRESH',challenge:'GET_REFRESH_REVIEW_CHALLENGE',
  revoke:'REVOKE_REFRESH_REVIEW'}))el('source-'+name).addEventListener('click',()=>sourceAction(type));
el('source-schedule').addEventListener('click',()=>sourceAction('SET_REFRESH_SCHEDULE',{enabled:!sourceRefresh?.scheduleEnabled}));
el('source-export').addEventListener('click',()=>sourceRefresh&&downloadReceipt('pcms-refresh-redacted-receipt.json',sourceRefresh));
el('source-measure').addEventListener('click',async()=>{
  if(sourceBusy)return;sourceBusy=true;sourceDraw();let message='';
  try{const out=await command('MEASURE_REFRESH_RESOURCES');if(out.ok)sourceResource=out.resource;
    else message='Measurement held: '+out.code;
  }catch{message='Measurement receipt unavailable.';}
  finally{sourceBusy=false;sourceDraw();if(message)el('source-status').textContent=message;}
});
el('source-trust').addEventListener('click',async()=>{
  try{
    const raw=JSON.parse(el('source-key').value);if(raw.d!==undefined)throw Error('PRIVATE_KEY_FORBIDDEN');
    const publicKey={kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y};
    const text=JSON.stringify(Object.fromEntries(Object.keys(publicKey).sort().map(k=>[k,publicKey[k]])));
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const confirmation=await requestTypedConfirmation(el('source-trust'),'TRUST '+hash,
      'Independently check this reviewer key fingerprint before trusting signed target evidence.');
    if(confirmation===null)return;
    const out=await command('TRUST_REFRESH_REVIEWER',{publicKey,confirmation});
    if(out.ok){reviewerFingerprint=hash;sourceDraw();}
    else el('source-status').textContent='Key held: '+out.code;
  }catch{el('source-status').textContent='Provide a public P-256 JWK; never paste a private key.';}
});
el('source-import').addEventListener('click',()=>{
  try{void sourceAction('IMPORT_REFRESH_REVIEW',{envelope:JSON.parse(el('source-review').value)});}
  catch{el('source-status').textContent='Invalid signed receipt JSON.';}
});
