// I03 Accounts workspace. All changes are revision-fenced and re-read after
// acknowledgement. No UI-provided data can assert a verified Perchance login.
const accountsArea=document.getElementById('pcms-accounts-list');
const personaPicker=document.getElementById('pcms-persona-picker');
const routePicker=document.getElementById('pcms-protected-route');
const createName=document.getElementById('pcms-new-persona-name');
const feedback=document.getElementById('pcms-accounts-feedback');
const enroll=document.getElementById('pcms-enroll');
const create=document.getElementById('pcms-create-persona');
const refresh=document.getElementById('pcms-refresh-accounts');
let generation=0, personas=[], routes=[], accounts=[], held=true;
const statuses={
  WAITING_LOGIN:'Awaiting manual login',VERIFICATION_PENDING:'Identity not verified',
  VERIFIED:'Independent identity observed',OVERRIDDEN:'Manual enrollment exception — not verified',
  REBIND_PENDING:'Replacement Persona — verification required',ARCHIVED:'Archived'
};
function command(type,params) {
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i03-accounts'});
    let settled=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),5000);
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
function option(value,label) {
  const el=document.createElement('option');
  el.value=value;el.textContent=label;return el;
}
function button(label,onClick,disabled=false) {
  const el=document.createElement('button');
  el.type='button';el.textContent=label;el.disabled=disabled;
  el.addEventListener('click',()=>{void onClick(el);});
  return el;
}
function report(text){feedback.textContent=text;}
async function mutation(type,params,message){
  report('Saving local account state…');
  try{
    const result=await command(type,params);
    if(result?.ok!==true)throw Error(result?.code||'UNCONFIRMED');
    report(message);
    await read();
  }catch(e){
    report('Not confirmed: '+(e.message||'UNAVAILABLE')+'. Refresh before any retry.');
  }
}
function labelFor(uid) {
  return personas.find(p=>p.personaUid===uid)?.name || 'Persona not found (held)';
}
function draw() {
  const occupied=new Set(accounts.filter(a=>a.state!=='ARCHIVED').map(a=>a.personaUid));
  const prior=personaPicker.value;
  personaPicker.replaceChildren(option('','Choose an unbound Persona'));
  for(const p of personas.filter(p=>!p.archived&&!occupied.has(p.personaUid)))
    personaPicker.append(option(p.personaUid,p.name+(p.routeProtected?'':' — route held')));
  if([...personaPicker.options].some(o=>o.value===prior))personaPicker.value=prior;
  const selectedRoute=routePicker.value;
  routePicker.replaceChildren(option('','Select protected route'));
  for(const r of routes)routePicker.append(option(r.routeId,r.name));
  if([...routePicker.options].some(o=>o.value===selectedRoute))routePicker.value=selectedRoute;
  enroll.disabled=held||!personaPicker.value;
  create.disabled=held||!routePicker.value||!createName.value.trim();
  accountsArea.replaceChildren();
  if(held) {
    accountsArea.textContent='Canonical storage/restore safety hold. All account changes disabled.';
    return;
  }
  if(!accounts.length) {
    accountsArea.textContent='No PCMS account bindings recorded. This is not a Perchance account census.';
    return;
  }
  for(const a of accounts) {
    const section=document.createElement('section');section.className='account-record';
    const heading=document.createElement('h3');
    heading.textContent=labelFor(a.personaUid)+' — '+(statuses[a.state]||'Unknown/held');
    section.append(heading);
    const detail=document.createElement('p');
    detail.textContent='Revision '+a.revision+'; identity '+a.identity+
      '; provider writes OFF.'+(a.override?' Exception: '+a.override+'.':'');
    section.append(detail);
    if(a.state!=='ARCHIVED'){
      const controls=document.createElement('div');controls.className='account-controls';
      controls.append(button('Open Perchance for manual login',async()=>{
        report('Opening through guarded Persona…');
        try{
          const out=await command('OPEN_LOGIN',{accountId:a.accountId,expectedRevision:a.revision});
          report(out?.ok?'Human login tab requested. Login is not proof of account ownership.':
            'Tab not confirmed: '+(out?.code||'UNKNOWN')+'. Inspect existing tabs before retry.');
        }catch{report('Tab open acknowledgement lost. Inspect tabs before retry.');}
      }));
      if(['WAITING_LOGIN','REBIND_PENDING'].includes(a.state))
        controls.append(button('I completed login',()=>mutation('ACK_LOGIN',{
          accountId:a.accountId,expectedRevision:a.revision
        },'Login acknowledged; identity still unverified.')));
      if(a.state!=='VERIFIED')
        controls.append(button('Check identity evidence',()=>mutation('CHECK_IDENTITY',{
          accountId:a.accountId,expectedRevision:a.revision
        },'Independent identity evidence received.')));
      const reason=document.createElement('select');
      reason.setAttribute('aria-label','Reason for manual enrollment exception');
      for(const [value,label] of [
        ['IDENTITY_UNOBSERVABLE','Identity cannot be observed'],
        ['CHALLENGE','Provider challenge'],
        ['SESSION_UNAVAILABLE','Session unavailable']])reason.append(option(value,label));
      const acknowledge=document.createElement('input');
      acknowledge.type='checkbox';
      const consent=document.createElement('label');
      consent.append(acknowledge,document.createTextNode(' Exception grants no provider write authority'));
      controls.append(reason,consent,button('Record limited exception',()=>mutation('MANUAL_OVERRIDE',{
        accountId:a.accountId,expectedRevision:a.revision,reason:reason.value,
        acknowledgeLimitedAuthority:acknowledge.checked
      },'Local exception recorded; ownership remains unverified.'),a.state==='VERIFIED'));
      const replacements=document.createElement('select');
      replacements.setAttribute('aria-label','Replacement Persona');
      replacements.append(option('','Choose replacement Persona'));
      for(const p of personas.filter(p=>!p.archived&&!occupied.has(p.personaUid)))
        replacements.append(option(p.personaUid,p.name));
      controls.append(replacements,button('Repair / rebind',async()=>{
        if(!replacements.value)return report('Select an unbound replacement Persona.');
        if(!window.confirm('Replace the account Persona? Previous identity evidence is invalidated.'))return;
        await mutation('REBIND',{accountId:a.accountId,expectedRevision:a.revision,
          personaUid:replacements.value,explicitRepair:true},'Rebound locally; new login and verification required.');
      }));
      controls.append(button('Archive account',async()=>{
        if(!window.confirm('Archive this PCMS account? No Persona or Perchance data will be deleted.'))return;
        await mutation('ARCHIVE',{accountId:a.accountId,
          expectedRevision:a.revision},'PCMS account archived; donor Persona preserved.');
      }));
      section.append(controls);
    }
    accountsArea.append(section);
  }
}
async function read() {
  const mine=++generation;
  const [a,p,r]=await Promise.all([
    command('LIST_ACCOUNTS'),command('LIST_PERSONAS'),command('LIST_ROUTES')]);
  if(mine!==generation)return;
  if(a?.ok!==true||p?.ok!==true||r?.ok!==true)throw Error('ACCOUNT_READ_UNAVAILABLE');
  if(a.truncated)throw Error('ACCOUNT_LIST_TRUNCATED');
  held=a.held===true;
  accounts=a.accounts;
  personas=p.personas;
  routes=r.routes;
  draw();
}
refresh.addEventListener('click',async()=>{
  report('Refreshing authoritative account and Persona state…');
  try{await read();report('Fresh local state loaded; provider identity may remain unknown.');}
  catch{held=true;draw();report('Account read unavailable. Changes held.');}
});
personaPicker.addEventListener('change',draw);
routePicker.addEventListener('change',draw);
createName.addEventListener('input',()=>{create.disabled=held||!routePicker.value||!createName.value.trim();});
enroll.addEventListener('click',()=> {
  if(!personaPicker.value)return;
  return mutation('ENROLL',{accountId:'acct_'+crypto.randomUUID().replaceAll('-',''),
    personaUid:personaPicker.value,expectedRevision:0},
    'Persona bound locally. Use human login, then verify identity.');
});
create.addEventListener('click',()=>mutation('CREATE_PERSONA',{
  name:createName.value.trim(),routeId:routePicker.value
},'Persona creation requested. Refresh the list to enroll.'));
try{await read();report('Local account state loaded. No Perchance login inferred.');}
catch{held=true;draw();report('Account read unavailable. No actions enabled.');}
