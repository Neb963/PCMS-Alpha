// The canonical journal is a read-only status port. Acknowledging an incident
// marks it reviewed; it never dismisses a hold or asserts recovery.
import {groupNotices} from './attention-model.mjs';
const journalStatus=document.getElementById('pcms-journal-health');
const queue=document.getElementById('pcms-work-queue-summary');
const attention=document.getElementById('pcms-attention-list');
const refresh=document.getElementById('pcms-attention-refresh');
let generation=0;
const SEVERITY={SERIOUS:'Serious',ACTION_REQUIRED:'Action required',INFORMATIONAL:'Information'};
const LABEL={ROUTE_UNAVAILABLE:'Protected route unavailable',ACCOUNT_UNVERIFIED:'Account login not verified',
  SOURCE_HELD:'Generator source held',RESTORE_IN_PROGRESS:'Restore in progress',
  CANONICAL_UNAVAILABLE:'Local storage unavailable',OPERATION_UNCERTAIN:'External write outcome uncertain',
  PROVIDER_OUTAGE:'Perchance unavailable',BACKUP_FAILED:'Backup failed',
  GIT_RECONNECT_REQUIRED:'GitHub connection needs attention',
  GIT_FOLDER_MISSING:'GitHub source folder missing',
  GIT_FOLDER_RENAME_REVIEW:'Possible GitHub folder rename needs a decision'};
const ACTION={ROUTE_UNAVAILABLE:'Check the account in Accounts → Check route. Clears itself once a healthy route is observed again.',
  ACCOUNT_UNVERIFIED:'Open the account’s Perchance tab, log in, then Confirm login.',
  OPERATION_UNCERTAIN:'PCMS reconciles by read-only checks; do not repeat the action manually.',
  PROVIDER_OUTAGE:'Waiting for Perchance to recover. Generator timers are frozen meanwhile; no action needed unless it persists.',
  BACKUP_FAILED:'Check Settings → Scheduled backup (native host and unlocked keyring). Clears after the next successful backup.',
  GIT_RECONNECT_REQUIRED:'Unlock your keyring or reconnect GitHub in Settings. Queued work is kept and resumes afterwards.'};
function command(message){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i02-canonical-readonly'});
    let settled=false;
    const timer=setTimeout(()=>finish(null,Error('timeout')),3500);
    function finish(value,error){
      if(settled)return;settled=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      if(error)reject(error);else resolve(value);
    }
    port.onMessage.addListener(value=>finish(value));
    port.onDisconnect.addListener(()=>finish(null,Error('disconnected')));
    port.postMessage(message);
  });
}
async function read(){
  const mine=++generation;
  const state=await command({type:'SUMMARY'});
  if(mine!==generation)return;
  if(state?.ok!==true)throw Error('canonical unavailable');
  journalStatus.textContent=state.storage==='READY'
    ? 'Local operation journal available. Restore: '+state.restore+'.'
    : 'Local journal unavailable; operations held. Restore: '+state.restore;
  const c=state.states||{};
  queue.textContent=state.storage==='READY'
    ? 'Prepared '+(c.PREPARED||0)+' · Possible external effect '+(c.DISPATCH_POSSIBLE||0)+
      ' · Uncertain '+(c.HELD_UNCERTAIN||0)+' · Confirmed '+(c.CONFIRMED||0)+'.'
    : 'Operation outcomes unavailable. Do not retry an uncertain external write.';
  if(state.storage!=='READY'||state.held){
    attention.textContent='Recovery or storage hold; Attention may be incomplete.';return;
  }
  const list=await command({type:'GET_NOTICES'});
  if(mine!==generation)return;
  if(!list?.ok){attention.textContent='Attention unavailable.';return;}
  attention.replaceChildren();
  if(!list.notices.length){
    attention.textContent='No recorded active incidents. External health is not implied.';return;
  }
  for(const group of groupNotices(list.notices)){
    const section=document.createElement('section');section.className='attention-group';
    const heading=document.createElement('h3');
    heading.textContent=(SEVERITY[group.severity]||group.severity)+' · '+
      (LABEL[group.code]||group.code)+(group.scopes.length>1?' · '+group.scopes.length+' affected':'');
    const help=document.createElement('p');help.className='reason';
    help.textContent=(ACTION[group.code]||'Open the affected area for details.')+
      (group.count>group.notices.length?' Seen '+group.count+' times.':'');
    section.append(heading,help);
    for(const n of group.notices){
      const line=document.createElement('div');line.className='attention-item';
      const label=document.createElement('span');
      label.textContent=n.code+' · '+n.scopeId+' · '+(n.reviewed?'Reviewed — still active':'Action required');
      const button=document.createElement('button');
      button.type='button';button.textContent=n.reviewed?'Reviewed':'Mark reviewed';
      button.disabled=n.reviewed===true;
      button.setAttribute('aria-label','Mark '+n.code+' for '+n.scopeId+' reviewed');
      button.addEventListener('click',async()=>{
        button.disabled=true;button.textContent='Saving…';
        try{
          const out=await command({type:'ACK_NOTICE',notice:{
            scopeId:n.scopeId,code:n.code,expectedRevision:n.revision}});
          if(!out?.ok||out.stillActionable!==true||out.holdReleased!==false)
            throw Error('ack not confirmed');
          await read();attention.focus({preventScroll:true});
        }catch{
          button.disabled=false;button.textContent='Retry review';
          journalStatus.textContent='Review not confirmed. Refresh Attention before retrying.';
        }
      });
      line.append(label,button);section.append(line);
    }
    attention.append(section);
  }
  if(list.truncated){
    const p=document.createElement('p');p.textContent='More incidents exist. Use advanced diagnostics for the full history.';
    attention.append(p);
  }
}
refresh?.addEventListener('click',()=>{void read().catch(()=>{
  attention.textContent='Refresh failed. Local incidents not assumed resolved.';
});});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void read().catch(()=>{});
});
try{await read();}catch{
  journalStatus.textContent='Journal unavailable; verify storage and recovery.';
  queue.textContent='Operation outcomes unknown; do not retry possible writes.';
  attention.textContent='Attention unavailable.';
}
