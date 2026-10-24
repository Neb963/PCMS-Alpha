// Primary Accounts controls; typed background ports retain all authority.
const PORT='pcms-i03-accounts',INVENTORY='pcms-i04-inventory';
const LABELS={PREPARING:'Preparing',WAITING_LOGIN:'Login needed',VERIFICATION_PENDING:'Login needed',
 REBIND_PENDING:'Replacement login needed',INVENTORY_PENDING:'Inventory needed',VERIFIED:'Ready',
 OVERRIDDEN:'Enrollment exception',ARCHIVED:'Archived'};
const ERRORS={ACCOUNT_BUSY:'This account is finishing another action. Other accounts remain available.',
 STALE_REVISION:'The account changed. Its current state is shown; try the action again.',
 GUARD_NOT_READY:'PersonaMonkey is starting. Local records and Archive remain available.',
 NO_PAGE_SESSION:'Log in to Perchance in this account’s tab, then confirm login.',
 NO_PERCHANCE_TAB:'Open Perchance for this account, log in, then confirm login.',
 SESSION_REJECTED:'The session expired. Open Perchance and log in again.',
 SESSION_PROBE_UNAVAILABLE:'Open Perchance to complete any login or challenge, then confirm again.',
 IDENTITY_CHANGED:'A different account is logged in. Sign in with this account’s original identity.',
 IDENTITY_ALREADY_BOUND:'That Perchance identity is already managed by another account.',
 PERSONA_STILL_PRESENT:'The original Persona still exists. Open Perchance to repair its login; replacement is for a missing Persona.',
 PERSONA_IN_USE:'Close this account’s tabs and finish its running work before deleting its Persona.',
 ROUTE_RELEASE_PENDING:'Close this account’s tabs and wait for route release before removing its local record.',
 CURRENT_INVENTORY_REQUIRED:'Synchronize the current owned inventory before resuming work.',
 INVENTORY_UNAVAILABLE:'Login was confirmed. Use Sync inventory to finish setup.',
 ACCOUNT_IDENTITY_UNVERIFIED:'Confirm login before reading the owned inventory.',
 UPGRADE_IN_PROGRESS:'This Persona is being upgraded to a protected route. Progress appears here.',
 RESTORE_HOLD:'Finish the inspected restore before changing accounts.',
 IPV6_EVIDENCE_UNVERIFIED:'IPv6 protection is unverified. Managed traffic stays held; verify or change the route.',
 ACCOUNT_ARCHIVED:'Reactivate this account before resuming its managed work.'};
export function accountNeedsAttention(a){
 if(a.state==='ARCHIVED'||a.removed)return false;
 return a.state!=='VERIFIED'||a.protectedRoute!=='PCMS_PINNED'||a.route?.status!=='PINNED';
}
export const accountLabel=a=>a.removed?'Removed':
 a.state==='VERIFIED'&&a.protectedRoute==='UPGRADING'?'Upgrading route':
 a.state==='VERIFIED'&&a.protectedRoute==='LEGACY_UNPINNED'?'Route upgrade needed':
 a.state==='VERIFIED'&&a.route?.status==='CHECKING'?'Checking route':
 a.state==='VERIFIED'&&accountNeedsAttention(a)?'Route needs attention':LABELS[a.state]||'Needs attention';
export function accountGrowthAdvice(accounts){
 const managed=accounts.filter(a=>a.state!=='ARCHIVED'&&!a.removed);
 return managed.length>0&&managed.every(a=>a.inventory?.known===true&&
  Number.isSafeInteger(a.inventory.verifiedOwned)&&a.inventory.verifiedOwned>=60);
}
export function accountActions(a){
 if(a.removed)return [];
 if(a.state==='ARCHIVED')return ['REACTIVATE','REMOVE_ACCOUNT'];
 return ['OPEN_LOGIN',...(a.state==='PREPARING'?['RESUME_SETUP']:['CONFIRM_LOGIN','VERIFY_ROUTE','CHANGE_ROUTE','SYNC_ACCOUNT']),
  ...(a.protectedRoute==='LEGACY_UNPINNED'||a.protectedRoute==='UPGRADING'?['UPGRADE_ACCOUNT']:[]),
  'REPLACE_PERSONA',...(['WAITING_LOGIN','VERIFICATION_PENDING','REBIND_PENDING','INVENTORY_PENDING','OVERRIDDEN'].includes(a.state)?['MANUAL_OVERRIDE']:[]),'ARCHIVE'];
}
const date=value=>Number.isFinite(value)&&value>0?new Date(value).toLocaleString():'Not yet observed';
const title=a=>'Account '+String(a.accountId).slice(-8);
const explain=out=>out?.message||ERRORS[out?.code]||('The action could not be completed ('+String(out?.code||'unavailable').toLowerCase().replaceAll('_',' ')+').');
export function createAccountsWorkspace({root,el,b,request,reload,notify}){
 let panel=null;
 function set(node,value){if(node&&node.textContent!==String(value))node.textContent=String(value)}
 function renderRows(container,items){
  const old=new Map([...container.querySelectorAll('[data-account-id]')].map(row=>[row.dataset.accountId,row]));
  const keep=new Set(items.map(a=>a.accountId));
  for(const [id,row] of old)if(!keep.has(id))row.remove();
  for(let index=0;index<items.length;index++){
   const a=items[index];let row=old.get(a.accountId);
   if(!row){
    row=el('div','account-row');row.dataset.accountId=a.accountId;
    const mark=el('div','account-circle',String(a.accountId).slice(-2).toUpperCase());
    const body=el('div','row-body');body.append(el('div','row-title'),el('div','row-meta'));
    const right=el('div','account-right'),status=el('span','pill');status.dataset.accountStatus='';
    const open=b('Open Perchance',()=>void openTab(row.account),'btn small');open.dataset.accountOpen='';
    const manage=b('Manage',()=>openAccount(row.account),'btn small');manage.dataset.accountManage='';
    right.append(status,open,manage);row.append(mark,body,right);container.append(row);
   }
   row.account=a;set(row.querySelector('.row-title'),title(a));
   const inv=a.inventory,owned=inv?.known?inv.verifiedOwned+' owned':'Inventory not synchronized';
   set(row.querySelector('.row-meta'),owned+' · '+(a.state==='ARCHIVED'?'Archived':a.message||(a.working?'Working…':accountLabel(a))));
   set(row.querySelector('[data-account-status]'),accountLabel(a));
   const open=row.querySelector('[data-account-open]');open.hidden=a.state==='ARCHIVED'||!!a.removed;
   open.disabled=!a.personaUid;open.title=a.personaUid?'Open in this account’s protected Persona':'Persona preparation is not finished';
   const expected=container.children[index];if(expected!==row)container.insertBefore(row,expected||null);
  }
 }
 async function openTab(a){
  try{const current=await request(PORT,'INSPECT_ACCOUNT',{accountId:a.accountId});
   if(!current?.ok){notify(explain(current));return}
   const out=await request(PORT,'OPEN_LOGIN',{accountId:a.accountId,expectedRevision:current.account.revision},90000);
   notify(out?.ok&&out.opened?'Perchance opened in this account’s protected Persona.':explain(out));
  }catch{notify('Opening Perchance was not confirmed. Check the account before trying again.')}
 }
 function openAccount(initial){
  panel?.close();
  const previous=root.activeElement,overlay=el('div','account-overlay'),dialog=el('section','account-dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Account management');
  const header=el('header','account-dialog-head'),heading=el('h2','',title(initial));
  const closeButton=b('Close',close);header.append(heading,closeButton);
  const body=el('div','account-dialog-body'),stateLine=el('p','account-state'),feedback=el('p','account-feedback');
  feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  const summary=el('dl','account-summary'),cells={};
  for(const label of ['Status','Identity','IPv4','IPv6','Last route check','Owned generators','Inventory checked']){
   const dt=el('dt','',label),dd=el('dd','','Checking…');summary.append(dt,dd);cells[label]=dd;
  }
  const operations=el('div','account-action-grid'),recovery=el('details','account-recovery');
  recovery.append(el('summary','','Account recovery'));
  const recoveryActions=el('div','account-action-grid');recovery.append(recoveryActions);
  const buttons=new Map();
  for(const [label,kind] of [['Open Perchance','OPEN_LOGIN'],['Confirm login','CONFIRM_LOGIN'],
   ['Verify route','VERIFY_ROUTE'],['Change route','CHANGE_ROUTE'],['Sync inventory','SYNC_ACCOUNT'],
   ['Resume setup','RESUME_SETUP'],['Reactivate','REACTIVATE'],['Upgrade protected route','UPGRADE_ACCOUNT'],
   ['Repair missing Persona','REPLACE_PERSONA'],['Archive','ARCHIVE']]){
   const button=b(label,()=>void act(kind),'btn');button.dataset.accountCommand=kind;buttons.set(kind,button);
   (kind==='UPGRADE_ACCOUNT'||kind==='REPLACE_PERSONA'?recoveryActions:operations).append(button);
  }
  const override=el('form','account-subform');override.hidden=true;
  override.append(el('p','setting-note','A limited enrollment exception does not enable managed writes.'));
  const reasonLabel=el('label','','Reason'),reason=el('select');reason.setAttribute('aria-label','Enrollment exception reason');
  for(const [value,label] of [['CHALLENGE','Perchance challenge'],['SESSION_UNAVAILABLE','Session unavailable'],['IDENTITY_UNOBSERVABLE','Identity cannot be observed']]){
   const option=el('option','',label);option.value=value;reason.append(option)}reasonLabel.append(reason);
  const acknowledge=el('input');acknowledge.type='checkbox';
  const ackLabel=el('label','account-check');ackLabel.append(acknowledge,el('span','','I understand that identity is still unverified.'));
  const saveOverride=b('Record enrollment exception',()=>void act('MANUAL_OVERRIDE',{reason:reason.value,acknowledgeLimitedAuthority:acknowledge.checked}));
  saveOverride.dataset.accountCommand='MANUAL_OVERRIDE';override.append(reasonLabel,ackLabel,saveOverride);recovery.append(override);
  override.addEventListener('submit',e=>e.preventDefault());acknowledge.addEventListener('change',draw);
  const removeOpen=b('Remove locally',()=>{removeForm.hidden=false;deletePersona.focus()});removeOpen.dataset.accountRemove='';
  const removeForm=el('form','account-subform account-removal');removeForm.hidden=true;
  removeForm.append(el('p','','Remove this local account record? Remote generators, source, backups and exit history remain. Older backups may still contain this account.'));
  const deletePersona=el('input');deletePersona.type='checkbox';
  const deleteLabel=el('label','account-check');deleteLabel.append(deletePersona,el('span','','Also delete its dedicated Persona and login session'));
  const removeConfirm=b('Confirm local removal',()=>void act('REMOVE_ACCOUNT',{explicitRemoval:true,deletePersona:deletePersona.checked}),'btn danger');
  removeConfirm.dataset.accountCommand='REMOVE_ACCOUNT';removeForm.append(deleteLabel,removeConfirm);removeForm.addEventListener('submit',e=>e.preventDefault());
  const details=el('details','account-recovery'),detailText=el('pre','account-technical');details.append(el('summary','','Route and history details'),detailText);
  body.append(stateLine,summary,feedback,operations,recovery,removeOpen,removeForm,details);dialog.append(header,body);overlay.append(dialog);root.append(overlay);
  let current=initial,inspection=null,busy=false,closed=false,inflight=null,actionEpoch=0;
  const activeCommands=new Set();
  function close(){if(closed)return;closed=true;clearInterval(timer);window.removeEventListener('hashchange',close);overlay.remove();
   const target=previous?.isConnected?previous:root.querySelector('[data-nav="accounts"]');target?.focus({preventScroll:true});panel=null}
  function draw(){
   if(closed)return;set(heading,title(current));
   const p=inspection?.protection,inv=inspection?.inventory||current.inventory;
   set(cells.Status,accountLabel(current));set(cells.Identity,current.identity==='VERIFIED'?'Confirmed':'Login confirmation needed');
   set(cells.IPv4,p?.exits?.filter(e=>e.family==='IPv4').map(e=>e.address).join(', ')||'Not verified');
   set(cells.IPv6,p?.ipv6Disposition==='BLOCKED_VERIFIED'?'Blocked · verified':p?.exits?.filter(e=>e.family==='IPv6').map(e=>e.address).join(', ')||'Not verified');
   set(cells['Last route check'],date(p?.verifiedAtMs));set(cells['Owned generators'],inv?.known?inv.verifiedOwned:'Unknown · sync needed');
   set(cells['Inventory checked'],date(inv?.observedAt));
   set(stateLine,current.removed?'Removed locally. Preserved records remain available for recovery.':
    current.state==='ARCHIVED'?'Archived. Reactivate to verify and resume.':current.message||
    (current.working?'Working on this account…':current.state==='INVENTORY_PENDING'?'Login confirmed. Synchronize inventory to finish setup.':
    current.state==='VERIFIED'?'Ready for managed work.':current.state==='ARCHIVED'?'Archived. Reactivate to verify and resume.':
    current.state==='PREPARING'?'Preparing its protected Persona and route.':'Open Perchance, complete login or a challenge, then confirm login.'));
   const allowed=accountActions(current);
   for(const [kind,button] of buttons){button.hidden=!allowed.includes(kind);
    button.disabled=kind==='ARCHIVE'?activeCommands.has('ARCHIVE'):(busy||current.working===true||kind==='OPEN_LOGIN'&&!current.personaUid)}
   override.hidden=!allowed.includes('MANUAL_OVERRIDE');saveOverride.disabled=busy||current.working===true||!acknowledge.checked;
   removeOpen.hidden=!allowed.includes('REMOVE_ACCOUNT');removeOpen.disabled=busy||current.working===true;removeConfirm.disabled=busy||current.working===true;
   if(current.removed||current.state!=='ARCHIVED')removeForm.hidden=true;
   recovery.hidden=!allowed.some(x=>['MANUAL_OVERRIDE','REPLACE_PERSONA','UPGRADE_ACCOUNT'].includes(x));
   set(detailText,JSON.stringify({account:current.accountId,persona:current.personaUid,route:p?.routeId||null,
    protection:p?.state||'UNVERIFIED',hold:p?.code||null,historicalExits:p?.historicalExits||[],
    routeSearch:current.routeSearch,history:inspection?.history||[]},null,2));
  }
  async function refresh(){
   if(closed)return null;if(inflight)return inflight;
   inflight=(async()=>{try{const out=await request(PORT,'INSPECT_ACCOUNT',{accountId:initial.accountId});
    if(out?.ok&&!closed){inspection=out;current=out.account;draw()}return out;
   }catch{if(!closed)set(feedback,'Account state could not be refreshed. Your inputs are preserved.');return null}
   finally{inflight=null}})();return inflight;
  }
  async function act(kind,extra={}){
   if(activeCommands.has(kind)||busy&&kind!=='ARCHIVE')return;
   if(kind==='ARCHIVE'&&!window.confirm('Archive this account and pause its managed work? Its Persona, generators, source and history are kept.'))return;
   if(kind==='REPLACE_PERSONA'&&!window.confirm('Repair a missing Persona? Its replacement requires login with the same account.'))return;
   if(kind==='MANUAL_OVERRIDE'&&extra.acknowledgeLimitedAuthority!==true)return;
   const ticket=++actionEpoch;activeCommands.add(kind);busy=true;
   const report=value=>{if(!closed&&ticket===actionEpoch)set(feedback,value)};
   report('Working…');draw();
   try{
    const latest=await refresh();if(!latest?.ok)throw Error('CURRENT_STATE_UNAVAILABLE');
    const params={accountId:initial.accountId,expectedRevision:current.revision,...extra};
    if(kind==='REACTIVATE')params.explicitReactivation=true;if(kind==='REPLACE_PERSONA')params.explicitReplacement=true;
    const out=await request(kind==='SYNC_ACCOUNT'?INVENTORY:PORT,kind,params,180000);
    if(closed)return;
    report(out?.ok?(kind==='OPEN_LOGIN'&&out.opened?'Perchance opened in this account’s protected Persona.':
     kind==='SYNC_ACCOUNT'?'Owned inventory synchronized.':kind==='CONFIRM_LOGIN'?'Login and inventory confirmed.':
     kind==='ARCHIVE'?'Account archived.':kind==='REMOVE_ACCOUNT'?'Local removal completed. '+(out.backup==='FRESH_BACKUP_REQUESTED'?'A new backup was requested.':'Backup follow-up: '+String(out.backup||'not confirmed').toLowerCase().replaceAll('_',' ')+'.'):
     kind==='MANUAL_OVERRIDE'?'Limited exception recorded. Managed writes remain blocked.':
     kind==='REACTIVATE'&&out.state==='VERIFIED'?'Account verified and reactivated.':
     kind==='VERIFY_ROUTE'||kind==='CHANGE_ROUTE'?'Protected route checked; current observations appear above.':'The current account state appears above.'):explain(out));
   }catch{report('The outcome is not yet confirmed. Current state is being refreshed; your inputs are preserved.')}
   finally{activeCommands.delete(kind);busy=activeCommands.size>0;if(!closed){await refresh();draw()}await reload()}
  }
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return}
   if(e.key!=='Tab')return;
   const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')].filter(n=>n.getClientRects().length);
   const index=controls.indexOf(root.activeElement);
   if(e.shiftKey&&index===0){e.preventDefault();controls.at(-1)?.focus()}
   else if(!e.shiftKey&&index===controls.length-1){e.preventDefault();controls[0]?.focus()}
  });
  const timer=setInterval(()=>{if(!closed&&document.visibilityState!=='hidden')void refresh()},1800);
  window.addEventListener('hashchange',close);panel={close,refresh};draw();void refresh();closeButton.focus({preventScroll:true});
 }
 return Object.freeze({renderRows,open:openAccount,openTab,close:()=>panel?.close()});
}
