// S01 Accounts workspace. The page sends only operator intents (Add Account,
// Confirm, Change route...). Personas, routes, exits and identity proof are
// chosen and observed by the background; nothing here can assert them.
const accountsArea=document.getElementById('pcms-accounts-list');
const feedback=document.getElementById('pcms-accounts-feedback');
const add=document.getElementById('pcms-add-account');
const refresh=document.getElementById('pcms-refresh-accounts');
let generation=0, accounts=[], held=true, available=false, poll=null;
const statuses={
  PREPARING:'Preparing protected route',WAITING_LOGIN:'Waiting for you to log in',
  VERIFICATION_PENDING:'Waiting for login confirmation',VERIFIED:'Ready — identity verified',
  OVERRIDDEN:'Manual exception — not verified',REBIND_PENDING:'Replacement Persona — verification required',
  ARCHIVED:'Archived'
};
const phases={START:'Starting…',PERSONA:'Creating the dedicated Persona…',
  ROUTE:'Finding and verifying a unique Mullvad exit…',LOGIN:'Ready for login',HELD:'Waiting'};
const fallback={
  NO_PAGE_SESSION:'No logged-in Perchance session was found in this account’s tab.',
  SESSION_REJECTED:'Perchance rejected the session. Log in again in the account tab.',
  SESSION_PROBE_UNAVAILABLE:'Perchance could not be reached from the account tab (it may be showing a challenge). Complete it there, then confirm again.',
  NO_PERCHANCE_TAB:'Open the account’s Perchance tab and log in first.',
  IDENTITY_CHANGED:'A different Perchance account is logged in than the one bound here. Log in with the original account.',
  IDENTITY_ALREADY_BOUND:'That Perchance account is already managed by another PCMS account.',
  UPGRADE_IN_PROGRESS:'This account is being upgraded in place to a reserved protected exit; try again shortly.',
  RESTORE_HOLD:'A restore safety hold is active; account changes are paused.',
  STALE_REVISION:'The account changed meanwhile. The list was refreshed; try again.'
};
function command(type,params,timeoutMs=type==='CONFIRM_LOGIN'||type==='CHECK_IDENTITY'?90000:
    type==='WITNESS_STATUS'?8000:5000) {
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i03-accounts'});
    let settled=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),timeoutMs);
    function finish(value,error) {
      if(settled)return;
      settled=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      if(error)reject(error);else resolve(value);
    }
    port.onMessage.addListener(v=>finish(v));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage(params?{type,params}:{type});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function button(label,onClick,disabled=false) {
  const el=document.createElement('button');
  el.type='button';el.textContent=label;el.disabled=disabled;
  el.addEventListener('click',()=>{void onClick(el);});
  return el;
}
function report(text){feedback.textContent=text;}
const explain=(out)=>out?.message||fallback[out?.code]||
  ('Not completed ('+String(out?.code||'unknown').toLowerCase().replaceAll('_',' ')+').');
async function act(type,a,message,extra={}){
  report('Working…');
  try{
    const result=await command(type,{accountId:a.accountId,expectedRevision:a.revision,...extra});
    report(result?.ok===true?message(result):explain(result));
  }catch{report('No answer from the background yet. The list will show the actual state.');}
  await read().catch(()=>{});
}
function describe(a){
  if(a.state==='PREPARING'){
    const phase=phases[a.setup?.phase]||'Preparing…';
    return a.setup?.phase==='HELD'?'Setup is waiting: '+(a.message||'the protected route could not be prepared yet.'):phase;
  }
  if(a.state==='ARCHIVED'){
    const r=a.route?.status;
    return r==='RELEASED'?'Archived. Its route resources are released; Persona, login, generators and exit history are kept.':
      r==='RELEASE_DEFERRED'||r==='RELEASE_UNCONFIRMED'?'Archived. '+(a.message||'Its route will be released once idle.'):
      'Archived. Persona, login, generators and exit history are kept.';
  }
  if(a.protectedRoute==='LEGACY_UNPINNED'||a.protectedRoute==='UPGRADING')
    return a.upgrade?.phase==='HELD'?'Upgrade waiting: '+(a.message||'the protected route could not be prepared yet.'):
      'Upgrading to a reserved protected exit. This account keeps its Persona, login and generators.';
  if(a.route?.status==='HELD')return 'Traffic held: '+(a.message||'the protected route needs attention.');
  return a.working?'Checking route…':'Protected exit reserved for this account only.';
}
function draw() {
  add.disabled=held||!available;
  accountsArea.replaceChildren();
  if(held) {
    accountsArea.textContent='Canonical storage/restore safety hold. All account changes disabled.';
    return;
  }
  if(!available){
    const p=document.createElement('p');
    p.textContent='PersonaMonkey is still starting; Add Account becomes available when it is ready.';
    accountsArea.append(p);
  }
  if(!accounts.length) {
    const empty=document.createElement('p');
    empty.textContent='No managed accounts yet. Use Add Account to set up the first one.';
    accountsArea.append(empty);return;
  }
  for(const a of accounts) {
    const section=document.createElement('section');section.className='account-record';
    const heading=document.createElement('h3');
    heading.textContent='Account '+a.accountId.slice(-6)+' — '+(statuses[a.state]||'Held');
    const detail=document.createElement('p');detail.textContent=describe(a);
    section.append(heading,detail);
    const controls=document.createElement('div');controls.className='account-controls';
    const pinned=a.protectedRoute==='PCMS_PINNED';
    const code=a.setup?.code||a.upgrade?.code||a.route?.code;
    const personaGone=['PERSONA_NOT_FOUND','BINDING_PERSONA_ABSENT'].includes(code);
    if(a.state!=='ARCHIVED'&&personaGone&&!a.working)
      controls.append(button('Create replacement Persona',async()=>{
        if(!window.confirm('Create a new dedicated Persona for this SAME account? Its generators and history are kept; you will log in again with the same Perchance account.'))return;
        await act('REPLACE_PERSONA',a,()=>'Replacement Persona prepared. Log in with the original account, then Confirm login.',{explicitReplacement:true});
      }));
    if(a.state==='PREPARING'){
      if(a.setup?.phase==='HELD'&&!a.working&&!personaGone)
        controls.append(button('Try setup again',()=>act('RESUME_SETUP',a,()=>'Setup restarted.')));
    }else if(a.state!=='ARCHIVED'&&!pinned){
      if(!a.working&&!personaGone&&(a.protectedRoute==='LEGACY_UNPINNED'||a.upgrade?.phase==='HELD'))
        controls.append(button('Upgrade now',async()=>{
          if(!window.confirm('Upgrade this account to a reserved protected exit? Its Persona, login and generators are kept, but its open tabs have no network until the new route is verified.'))return;
          await act('UPGRADE_ACCOUNT',a,()=>'Upgrade started.');
        }));
    }else if(a.state!=='ARCHIVED'){
      if(pinned&&a.state!=='VERIFIED')
        controls.append(button('Confirm login',()=>act('CONFIRM_LOGIN',a,
          r=>'Logged-in account verified'+(r.inventory==='SYNCHRONIZED'?' and generators loaded.':'. Generator list will refresh later.'))));
      if(pinned)controls.append(
        button('Open Perchance tab',()=>act('OPEN_LOGIN',a,()=>'Perchance opened in this account’s Persona.')),
        button('Check route',()=>act('VERIFY_ROUTE',a,()=>'Route check started.')),
        button('Change route',async()=>{
          if(!window.confirm('Move this account to a different unique Mullvad exit? Its current exit stays reserved to it.'))return;
          await act('CHANGE_ROUTE',a,()=>'Route change started.');
        }));
    }
    if(a.state==='ARCHIVED'){
      controls.append(button('Reactivate',async()=>{
        if(!window.confirm('Reactivate this account? PCMS re-verifies its route and login first.'))return;
        await act('REACTIVATE',a,()=>'Reactivation started.',{explicitReactivation:true});
      }));
    }else if(!a.working){
      controls.append(button('Archive',async()=>{
        if(!window.confirm('Archive this account? Its Persona, history and reserved exits are kept; nothing on Perchance changes.'))return;
        await act('ARCHIVE',a,()=>'Account archived.');
      }));
    }
    section.append(controls);
    accountsArea.append(section);
  }
}
async function read() {
  const mine=++generation;
  const a=await command('LIST_ACCOUNTS');
  if(mine!==generation)return;
  if(a?.ok!==true)throw Error('ACCOUNT_READ_UNAVAILABLE');
  if(a.truncated)throw Error('ACCOUNT_LIST_TRUNCATED');
  held=a.held===true;
  available=a.enrollment==='AVAILABLE';
  accounts=a.accounts;
  draw();
  // While any setup/route work runs in the background, keep the view live.
  const busy=accounts.some(x=>x.working||(x.state==='PREPARING'&&x.setup?.phase!=='HELD'));
  clearTimeout(poll);
  if(busy||!available)poll=setTimeout(()=>{void read().catch(()=>{});},2000);
}
add.addEventListener('click',async()=>{
  add.disabled=true;
  report('Preparing a dedicated Persona and a unique protected exit. This can take a minute…');
  try{
    const out=await command('ADD_ACCOUNT');
    if(out?.ok!==true)report(explain(out));
  }catch{report('No answer yet; the list shows whether setup started.');}
  await read().catch(()=>{});
});
document.getElementById('pcms-check-native-witness')?.addEventListener('click',async()=>{
  report('Requesting one read-only native clock sample…');
  try {
    const sampled=await command('WITNESS_STATUS');
    if(sampled?.ok===true)
      report('Native clock sample received (sequence '+sampled.sequence+'). This alone is not qualified uptime.');
    else report('Native witness unavailable: '+(sampled?.code||'UNVERIFIED')+'.');
  } catch {
    report('Native witness response unknown.');
  }
});
refresh.addEventListener('click',async()=>{
  report('Refreshing account state…');
  try{await read();report('Account state refreshed.');}
  catch{report('Account read unavailable. Actions remain disabled.');held=true;draw();}
});
try{await read();report('Account state loaded.');}
catch{
  held=true;draw();report('Account state not available yet; retrying…');
  // Background may still be starting after a browser restart or install.
  const retry=async(n)=>{try{await read();report('Account state loaded.');}
    catch{if(n>0)setTimeout(()=>void retry(n-1),2000);
      else report('Account read unavailable. No actions enabled.');}};
  setTimeout(()=>void retry(30),2000);
}
