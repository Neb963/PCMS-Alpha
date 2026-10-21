/* PCMS prototype-structure production bridge, version 0.1.6.
 * The accepted single-file prototype supplies the actual shell/CSS/view HTML.
 * This module does not load its demo script or its sample data. Everything
 * displayed as canonical is read from guarded *read-only* extension ports.
 * All modifying operations remain with their original production view modules,
 * buttons, required confirmations, capability gates, and revision fences.
 */
const routes=['overview','generators','work-queue','accounts','refresher','settings'];
const native=document.querySelector('body > .app');
const host=document.createElement('div');host.id='pcms-faithful-host';
document.body.append(host);const root=host.attachShadow({mode:'open'});
const READINESS_NAMES={NATIVE_VAULT_HOST:'GitHub credential helper',SECRET_SERVICE_ENVIRONMENT:'Secure credential storage',BACKUP_HOST:'Backup helper',DIAGNOSTIC_HOST:'Diagnostic helper',GIT_CONFIG:'GitHub connection',GIT_PARTIAL_CONNECTION:'Interrupted GitHub setup',GITHUB_AUTH:'GitHub access',GITHUB_MAIN_TREE:'GitHub file scan',GRANT_DEVELOPMENT:'Development permission',GRANT_GITWRITE:'Git write permission',GRANT_PUBLICATION:'Publication permission',PERSONA_AND_SESSION:'Account and secure route',REFRESHER_LIVE_EFFECT:'Refresher operation',INSTALLED_XPI_IDENTITY:'Installed extension verification'};
const READINESS_STATES={VERIFIED:'Checked',NOT_TESTED:'Not checked',OUTCOME_UNCERTAIN:'Needs review',UNREACHABLE:'Not responding',STALE:'Needs updating',SECURITY_HELD:'Waiting on setup',OFF_BY_POLICY:'Disabled',NOT_CONFIGURED:'Not connected',MISSING_CAPABILITY:'Needs an update'};
function operatorReadinessGuidance(row){
 const code=row.code||'';
 if(row.component==='NATIVE_VAULT_HOST'||row.component==='BACKUP_HOST'||row.component==='DIAGNOSTIC_HOST')
   return row.state==='UNREACHABLE'?'The PCMS helper is not responding. Check the local PCMS installation.':
     row.state==='VERIFIED'?'The local helper responded. Its complete workflow is not yet verified.':
     'The local helper needs attention before this service can be used.';
 if(row.component==='GIT_CONFIG'||row.component==='GIT_PARTIAL_CONNECTION')
   return row.component==='GIT_PARTIAL_CONNECTION'&&row.state==='NOT_TESTED'?'No interrupted connection was confirmed by this check.':
     row.state==='OUTCOME_UNCERTAIN'?'A previous GitHub setup did not finish. Use the recovery control before connecting again.':
     row.state==='VERIFIED'?'Connection settings are saved. Check GitHub access separately.':
     'GitHub needs to be connected before dependent operations can run.';
 if(row.component==='SECRET_SERVICE_ENVIRONMENT'||row.component==='SECRET_SERVICE')
   return row.state==='VERIFIED'?'Secure credential storage responded. GitHub access is checked separately.':
     'Secure credential storage needs attention. Check the local PCMS helper before retrying.';
 if(row.component==='GITHUB_AUTH'||row.component==='GITHUB_MAIN_TREE')
   return row.state==='VERIFIED'?'The requested read-only GitHub check passed.':
     row.state==='NOT_TESTED'?'Use the separate GitHub verification action when you need to check access.':
     'GitHub access cannot be confirmed until secure connection setup is complete.';
 if(row.component.startsWith('GRANT_'))
   return row.state==='VERIFIED'?'Permission is recorded for the current GitHub setup.':
     row.state==='STALE'?'This permission needs review after GitHub connection is repaired.':
     'This permission is not enabled. Review it only when needed.';
 if(row.component==='PERSONA_AND_SESSION')
   return 'Use Accounts to check the selected account and its protected connection before live work.';
 if(row.component==='REFRESHER_LIVE_EFFECT')
   return 'A live source save and recent-list appearance have not been verified.';
 if(row.component==='REFRESHER_POLICY'||row.component==='REFRESHER_CURRENT_POLICY')
   return 'Open Refresher to inspect the current policy. Live effectiveness is checked separately.';
 if(row.component==='BACKUP_RESTORE')
   return 'A successful backup and restore still need independent verification.';
 if(row.component==='INSTALLED_XPI_IDENTITY')
   return 'An independent installed-extension check is needed to confirm the exact build.';
 if(row.state==='VERIFIED')return 'This local check passed. It does not establish full live readiness.';
 if(row.state==='OFF_BY_POLICY')return 'This capability is not enabled in the current settings.';
 if(row.state==='NOT_TESTED')return 'This check has not been performed yet.';
 if(row.state==='STALE')return 'This saved setting needs to be checked again.';
 if(row.state==='SECURITY_HELD')return 'A required setup step must be completed first.';
 if(row.state==='UNREACHABLE')return 'This service is not responding. Check its connection or installation.';
 if(row.state==='OUTCOME_UNCERTAIN')return 'The last operation did not finish with a confirmed result.';
 return code==='LOCAL_STORAGE_READ_FAILED'?'Saved settings could not be read. Check the Firefox profile.':
   'Check this item before relying on the corresponding capability.';
}
function friendlyConnectionIssue(code){
 const messages={
 GIT_RECONCILED_LOCALLY_VERIFIED:'GitHub connection repaired. Run a read-only check to verify the files.',
 GIT_RECONCILIATION_CREDENTIAL_UNAVAILABLE:'The saved GitHub credential could not be accessed. Check the native helper and secure storage before trying again.',
 GIT_RECONCILIATION_VAULT_UNAVAILABLE:'The GitHub credential helper is not responding. Check its installation before trying again.',
 GIT_RECONCILIATION_NETWORK_UNAVAILABLE:'GitHub could not be reached. Check your connection and try again.',
 GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN:'Connection settings could not be confirmed. No further changes were attempted.'
 };
 return messages[code]||'GitHub connection could not be verified. See the details below before retrying.';
}
const state={route:'overview',gen:{offset:0,limit:24,query:'',account:'ALL',sort:'fleet',filter:'ALL',total:0,items:[]},
 ref:{offset:0,limit:25,query:'',phase:'ALL',snapshot:null,items:[],total:0},
 acct:{page:0,perPage:24,query:'',filter:'All',list:[]},queue:{filter:'Needs action',query:'',operations:[],incidents:[],opCursor:'',noticeCursor:'',history:[],nextOps:null,nextNotices:null,more:false,loading:false,error:null,summary:null,reviews:[],missing:[],epoch:0},
 settings:'connections',lastAccountList:[],lastInventoryTotal:null,lastRef:null,errors:{},nativeOpen:false,
 renderEpoch:0,version:'0.1.6',readiness:null,readinessBusy:false};
const shadow=(sel)=>root.querySelector(sel);
const page=()=>shadow('#page');
function el(tag,cls='',text){const o=document.createElement(tag);if(cls)o.className=cls;if(text!==undefined)o.textContent=String(text);return o}
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('aria-hidden','true');const use=document.createElementNS('http://www.w3.org/2000/svg','use');use.setAttribute('href','#i-'+name);svg.append(use);return svg}
function b(label,click,cls='btn small'){const n=el('button',cls,label);n.type='button';n.addEventListener('click',click);return n}
function text(sel,value){const e=shadow(sel);if(e)e.textContent=String(value??'Unknown');return e}
function isSupported(){return typeof browser==='object'&&browser.runtime&&typeof browser.runtime.connect==='function'}
function readPort(port,type,params={},timeoutMs=10000){
 return new Promise((resolve,reject)=>{
  if(!isSupported()){reject(new Error('EXTENSION_RUNTIME_UNAVAILABLE'));return}
  let p,settled=false;
  const timer=setTimeout(()=>finish(null,new Error('TIMEOUT')),timeoutMs);
  function finish(data,error){if(settled)return;settled=true;clearTimeout(timer);try{p?.disconnect()}catch{};error?reject(error):resolve(data)}
  try{p=browser.runtime.connect({name:port});p.onMessage.addListener(v=>finish(v));p.onDisconnect.addListener(()=>finish(null,new Error('DISCONNECTED')));p.postMessage({type,params})}
  catch(err){finish(null,err)}
 })
}
async function guardedRead(port,type,params={}){const r=await readPort(port,type,params);if(r?.ok!==true)throw new Error(r?.code||'READ_UNAVAILABLE');return r}
const inventory=(params)=>guardedRead('pcms-i04-inventory','LIST_INVENTORY',params);
const accounts=()=>guardedRead('pcms-i03-accounts','LIST_ACCOUNTS');
const refresher=(params)=>guardedRead('pcms-i12-refresher','GET_REFRESHER',params);
const safeCount=n=>Number.isInteger(n)&&n>=0?n:'—';
const snippet=(s,n=150)=>String(s??'').trim().slice(0,n);
function nativeRoute(route,group){
 if(!routes.includes(route))return;
 location.hash='#'+route;
 // Existing v014 production workflow navigation lives in the original DOM.
 if(group){const button=native.querySelector('#view-'+route+' [data-ui-group="'+group+'"]');button?.click()}
 state.nativeOpen=true;document.body.classList.add('pcms-native-open');
 const close=document.querySelector('#pcms-legacy-return');close?.focus();
}
function nativeReturn(){state.nativeOpen=false;document.body.classList.remove('pcms-native-open');shadow('[data-nav="'+state.route+'"]')?.focus({preventScroll:true})}
const nativeControl=id=>document.getElementById(id);
function guardedClick(id){const target=nativeControl(id);if(!target||target.disabled){notify('This guarded control is not available. Inspect the current authorization or recovery hold.');return false}target.click();return true}
function nativeAction(route,group,id){nativeRoute(route,group);if(id){const e=nativeControl(id);e?.scrollIntoView({block:'nearest'});e?.focus({preventScroll:true})}}
let currentToast;
function notify(message){const e=shadow('#pcms-live-toast');if(!e)return;e.textContent=String(message);e.hidden=false;if(currentToast)clearTimeout(currentToast);currentToast=setTimeout(()=>e.hidden=true,6500)}
function updateNav(){for(const a of root.querySelectorAll('[data-nav]'))a.setAttribute('aria-current',a.dataset.nav===state.route?'page':'false');
 const label=shadow('#breadcrumb');if(label)label.textContent=({'work-queue':'Work Queue',overview:'Overview',generators:'Generators',accounts:'Accounts',refresher:'Refresher',settings:'Settings'})[state.route];
 const t=shadow('[data-nav="work-queue"] .nav-count');if(t){const count=observedReceipts().filter(x=>x.needs).length;t.textContent=count?String(count):'';t.hidden=count===0;}
}
function routeTo(target){if(!routes.includes(target))target='overview';state.route=target;location.hash='#'+target;void render()}
function openGlobalSearch(){
 const existing=shadow('.overlay');if(existing){existing.querySelector('input[type=search]')?.focus();return}
 const priorFocus=root.activeElement;
 const overlay=el('div','overlay');const modal=el('div','modal');
 const closeSearch=()=>{clearTimeout(delay);epoch++;overlay.remove();
  const restore=priorFocus?.isConnected?priorFocus:shadow('.top-search');restore?.focus({preventScroll:true});};modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Search local accounts and generators');
 const head=el('div','modal-head');head.append(el('h2','', 'Search PCMS'));
 const close=b('Close',closeSearch,'btn small');head.append(close);modal.append(head);
 const body=el('div','modal-body');
 const input=el('input');input.type='search';input.placeholder='Find a local generator or account';input.setAttribute('aria-label','Search local generators and accounts');input.maxLength=80;
 input.style.width='100%';input.style.padding='11px';input.style.border='1px solid #c9d2da';input.style.borderRadius='7px';body.append(input);
 const caption=el('p','native-bridge-note','Only canonical local records are searched. Missing results are not proof of remote absence.');body.append(caption);
 const list=el('div','queue-list');body.append(list);modal.append(body);overlay.append(modal);root.append(overlay);
 let epoch=0,delay;
 async function search(){const query=input.value.trim(),n=++epoch;list.replaceChildren();if(query.length<2)return;
  list.append(el('p','pcms-unknown','Searching local records…'));
  const settled=await Promise.allSettled([inventory({query,offset:0,limit:8}),accounts()]);if(n!==epoch||!overlay.isConnected)return;
  list.replaceChildren();const inv=settled[0].status==='fulfilled'?settled[0].value:null,acc=settled[1].status==='fulfilled'?settled[1].value:null;
  const found=[];
  for(const g of inv?.items||[])found.push({kind:'Generator',label:g.slug,execute:()=>{state.gen.query=g.slug;state.gen.offset=0;overlay.remove();routeTo('generators')}});
  for(const a of acc?.accounts||[])if(a.accountId.toLowerCase().includes(query.toLowerCase()))found.push({kind:'Account',label:a.accountId,execute:()=>{state.acct.query=a.accountId;state.acct.page=0;overlay.remove();routeTo('accounts')}});
  if(!found.length){list.append(el('p','pcms-unknown',inv||acc?'No matching local records.':'Local search unavailable.'));return}
  for(const f of found.slice(0,12)){const row=el('div','queue-item');const strong=el('strong','',f.label);const kind=el('span','muted small',f.kind);row.append(strong,kind,b('Open',f.execute));list.append(row)}
 }
 input.addEventListener('input',()=>{clearTimeout(delay);delay=setTimeout(()=>{void search()},200)});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeSearch();return}if(e.key==='Tab'){
 const controls=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled)')];const index=controls.indexOf(root.activeElement);
 if(e.shiftKey&&index===0){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&index===controls.length-1){e.preventDefault();controls[0]?.focus()}}
 });overlay.addEventListener('click',e=>{if(e.target===overlay)closeSearch()});input.focus();
}
function nativeSelection(type,item){
 if(type==='timing'){window.dispatchEvent(new CustomEvent('pcms-refresher-target',{detail:{slug:item.slug}}));nativeRoute('refresher')}
 else if(type==='source'){window.dispatchEvent(new CustomEvent('pcms-source-target',{detail:{slug:item.slug,revision:item.revision}}));nativeRoute('generators','source')}
 else if(type==='adopt'){window.dispatchEvent(new CustomEvent('pcms-adoption-target',{detail:{slug:item.slug,revision:item.revision,ownerState:item.ownerState,visibility:item.visibility}}));nativeRoute('generators','adopt')}
 else{const field=nativeControl('pcms-generator-query');if(field){field.value=item.slug;field.dispatchEvent(new Event('input',{bubbles:true}))}nativeRoute('generators','inventory')}
}
function openDetails(kind,item){
 const priorFocus=root.activeElement;
 const backdrop=el('div','drawer-overlay');backdrop.setAttribute('role','presentation');
 const drawer=el('div','drawer');drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label',kind==='ref'?'Generator timing details':'Generator details');
 const header=el('div','drawer-head'),line=el('div','drawer-title-row');const h=el('h2','drawer-title',item.slug||'Generator');
 const close=b('Close',()=>{backdrop.remove();if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true})});line.append(h,close);header.append(line);drawer.append(header);
 const body=el('div','drawer-body');const dl=el('dl');function kv(a,value){const d=el('div','kv');d.append(el('dt','',a),el('dd','',value));dl.append(d)}
 kv('Generator',item.slug);kv('Account',item.accountId||'Not observed');
 if(kind==='ref'){
  kv('Phase',item.phase||'Unknown');kv('Active remaining',formatTime(item.activeRemaining));
  kv('Sleep remaining',formatTime(item.sleepRemaining));kv('Blockers',Array.isArray(item.blockers)?item.blockers.join(' · ')||'None observed':'Unknown');
  kv('Recent presence',item.presence?(item.presence.present?'Previously present':'Previously absent, not deleted'):'Not observed');
 } else{kv('Owner evidence',item.ownerState||'Unknown');kv('Visibility',item.visibility||'Unknown');kv('Source',item.source||'Unknown')}
 body.append(dl,el('p','native-bridge-note','Protected changes, source inspection and adoption remain subject to existing exact-record authorization and guarded runtime checks.'));
 const actions=el('div','form-foot');if(kind==='ref')actions.append(b('Open timing controls',()=>{backdrop.remove();nativeSelection('timing',item)}));
 else for(const [label,kind] of [['Inspect source','source'],['Refresher timing','timing'],['Adopt existing','adopt']])actions.append(b(label,()=>{backdrop.remove();nativeSelection(kind,item)}));
 body.append(actions);drawer.append(body);backdrop.append(drawer);root.append(backdrop);
 const focusable=()=>[...drawer.querySelectorAll('button:not(:disabled),[href],input:not(:disabled)')];
 backdrop.addEventListener('keydown',event=>{if(event.key==='Escape'){backdrop.remove();if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});return}if(event.key==='Tab'){let all=focusable();let index=all.indexOf(root.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();all.at(-1)?.focus()}if(!event.shiftKey&&index===all.length-1){event.preventDefault();all[0]?.focus()}}});
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove()});close.focus();
}
function formatTime(ms){if(!Number.isFinite(ms)||ms<0)return '—';const m=Math.round(ms/60000),hours=Math.floor(m/60);return hours+'h '+String(m%60).padStart(2,'0')+'m'}
function setTab(group,value){for(const b of page()?.querySelectorAll(group+' [role=tab]')||[]){const active=b.dataset.filter?.split(':')[1]===value;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1}}
function renderEmpty(holder,message,cls='pcms-unknown'){holder?.replaceChildren(el('div',cls,message))}
function setPagination(countSel,prev, next,offset,total,limit,label){const holder=shadow(countSel);if(holder)holder.textContent=label||`${total?offset+1:0}–${Math.min(offset+limit,total)} of ${total} local records`;
 const p=shadow(prev),n=shadow(next);if(p)p.disabled=offset<=0;if(n)n.disabled=offset+limit>=total}
function routeHandlers(){
 for(const btn of root.querySelectorAll('[data-nav]'))btn.addEventListener('click',()=>routeTo(btn.dataset.nav));
 // Capture the shortcut on the DOCUMENT so it works even when focus is
 // outside the Shadow DOM. When Advanced native UI is open, preserve its
 // existing shortcut and let the legacy module own the event.
 document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||event.repeat||
    !document.body.classList.contains('pcms-faithful-ready')||
    document.body.classList.contains('pcms-native-open'))return;
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
   event.preventDefault();event.stopImmediatePropagation();
   if(!shadow('.overlay'))openGlobalSearch();
  }
 },true);
 root.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   const overlay=shadow('.drawer-overlay');
   if(overlay){overlay.remove();event.preventDefault()}
  }
 });
 root.addEventListener('click',event=>{const link=event.target.closest('button[data-action],button[data-settings]');if(!link)return;const action=link.dataset.action;const setting=link.dataset.settings;
 if(setting){state.settings=setting;void renderSettingsSection();return}
 if(!action)return;
 event.preventDefault();
 if(action==='search'){openGlobalSearch();return}
 if(action==='create'){nativeAction('generators','create','pcms-supply-slugs');return}
 if(action==='sync-inventory'){nativeAction('generators','inventory','pcms-generator-account');return}
 if(action==='queue'||action==='activity'){nativeAction('work-queue','activity');return}
 if(action==='diagnostics'||action==='health'){nativeAction('settings','diagnostics');return}
 if(action==='notifications'){routeTo('overview');return}
 if(action==='system-health'){routeTo('settings');return}
 if(action==='generator-filters'){nativeAction('generators','inventory','pcms-generator-owner-filter');return}
 if(action==='gen-prev'){state.gen.offset=Math.max(0,state.gen.offset-state.gen.limit);void loadGenerators();return}
 if(action==='gen-next'){state.gen.offset+=state.gen.limit;void loadGenerators();return}
 if(action==='ref-prev'){state.ref.offset=Math.max(0,state.ref.offset-state.ref.limit);void loadRefresher();return}
 if(action==='ref-next'){state.ref.offset+=state.ref.limit;void loadRefresher();return}
 if(action==='account-prev'){state.acct.page=Math.max(0,state.acct.page-1);displayAccounts();return}
 if(action==='account-next'){state.acct.page++;displayAccounts();return}
 if(action==='queue-prev'){
   const prior=state.queue.history.pop();if(!prior)return;
   state.queue.opCursor=prior.op;state.queue.noticeCursor=prior.notice;void loadQueue();return;
 }
 if(action==='queue-next'){
   if(!state.queue.more)return;
   state.queue.history.push({op:state.queue.opCursor,notice:state.queue.noticeCursor});
   state.queue.opCursor=state.queue.nextOps===null?null:state.queue.nextOps;
   state.queue.noticeCursor=state.queue.nextNotices===null?null:state.queue.nextNotices;
   void loadQueue();return;
 }
 if(action==='add-account'){nativeAction('accounts',null,'pcms-add-account');return}
 if(action==='feed-check'){guardedClick('pcms-refresher-reload');void loadRefresher();return}
 if(action==='edit-timing'){nativeAction('refresher',null,'pcms-refresher-active');return}
 if(action==='pause-refresher'){if(!guardedClick('pcms-refresher-global-pause'))return;notify('Pause request sent through the existing guarded controller; reload to verify.');void loadRefresher();return}
 if(action==='go-accounts'){routeTo('accounts');return}
 if(action==='queue-help'||action==='account-info'){notify('Detailed operational guidance is available in Advanced protected controls.');return}
 if(action.startsWith('check-service:')){state.settings='connections';void runReadiness(false);return}
 });
 root.addEventListener('click',event=>{const tab=event.target.closest('[data-filter]');if(tab){event.preventDefault();const [r,value]=tab.dataset.filter.split(':');if(r==='generators'){state.gen.filter=value;state.gen.offset=0;void loadGenerators()}if(r==='refresher'){state.ref.phase=['All','Active','Sleeping','Waiting'].includes(value)?value.toUpperCase():value;state.ref.offset=0;void loadRefresher()}if(r==='queue'){state.queue.filter=value;void loadQueue(true)}return}
 const row=event.target.closest('tr[data-item-index]');if(row){const i=Number(row.dataset.itemIndex);if(state.route==='refresher'&&state.ref.visibleItems?.[i])openDetails('ref',state.ref.visibleItems[i]);else if(state.route==='generators'&&state.gen.visibleItems?.[i])openDetails('gen',state.gen.visibleItems[i]);}
 });
 root.addEventListener('keydown',event=>{
  const tab=event.target.closest('.tabs [role=tab]');
  if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
   const tabs=[...tab.closest('.tabs').querySelectorAll('[role=tab]:not([disabled])')];const index=tabs.indexOf(tab);
   const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
   event.preventDefault();tabs[next]?.focus({preventScroll:true});tabs[next]?.click();return;
  }
  const row=event.target.closest('tr[data-item-index]');if(!row)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();row.click();return}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   const list=[...row.closest('tbody').querySelectorAll('tr[data-item-index]')];const idx=list.indexOf(row);
   const n=event.key==='Home'?0:event.key==='End'?list.length-1:Math.min(list.length-1,Math.max(0,idx+(event.key==='ArrowDown'?1:-1)));
   event.preventDefault();row.tabIndex=-1;list[n].tabIndex=0;list[n].focus({preventScroll:true});
  }
 });
 root.addEventListener('change',event=>{const target=event.target;
 if(target.id==='generator-account'){state.gen.account=target.value;state.gen.offset=0;void loadGenerators()}
 if(target.id==='generator-sort'){state.gen.sort=target.value;void displayGenerators()}
 if(target.id==='account-filter'){state.acct.filter=target.value;state.acct.page=0;displayAccounts()}
 if(target.matches('.feature-switch')){void proposeRefresherEnable(target)}
 });
 let debounce;
 root.addEventListener('input',event=>{const id=event.target.id;if(!['generator-search','refresher-search','account-search','queue-search'].includes(id))return;
 clearTimeout(debounce);const value=String(event.target.value||'').slice(0,80);debounce=setTimeout(()=>{
  if(id==='generator-search'){state.gen.query=value;state.gen.offset=0;void loadGenerators()}
  if(id==='refresher-search'){state.ref.query=value;state.ref.offset=0;void loadRefresher()}
  if(id==='account-search'){state.acct.query=value;state.acct.page=0;displayAccounts()}
  if(id==='queue-search'){state.queue.query=value;void loadQueue(true)}
 },200)});
}
// Native controller remains the sole authorizer. The shadow switch itself is
// intentionally never a direct marker-source-write command.
async function proposeRefresherEnable(switchEl){
 // A shadow switch MUST NOT submit the native multi-field policy form:
 // pending edits in its other fields could otherwise be sent accidentally.
 const before=state.lastRef?.policy?.refreshEnabled===true;
 switchEl.checked=before;
 if(!nativeControl('pcms-refresher-enable')){
  notify('Protected Refresher policy is unavailable. No change was submitted.');return;
 }
 nativeAction('refresher',null,'pcms-refresher-enable');
 notify('Review the complete guarded policy before changing marker saves. Nothing was submitted.');
}

function statusPill(label,kind=''){const p=el('span','pill'+(kind?' '+kind:''),label);return p}
function tableRow(cells,itemIndex){const tr=el('tr');tr.tabIndex=itemIndex===0?0:-1;tr.dataset.itemIndex=String(itemIndex);tr.setAttribute('role','button');tr.setAttribute('aria-label','Inspect '+cells[0]);return tr}
const statusClasses={ACTIVE:'green',SLEEPING:'',WAITING:'',HELD:'red',INELIGIBLE:'',OBSERVED_OWNER:'green',OWNER_UNVERIFIED:'',OWNER_DISPUTED:'red'};
const ownerLabels={OBSERVED_OWNER:'Owner observed',OWNER_UNVERIFIED:'Owner unknown',OWNER_DISPUTED:'Disputed',UNOBSERVED:'Unobserved',IDENTITY_CONFLICT:'Identity conflict',OWNER_CONFLICT:'Account conflict'};
function rowsError(tableSelector,message,colspan){const body=shadow(tableSelector);if(!body)return;body.replaceChildren();const tr=el('tr'),td=el('td','pcms-unknown',message);td.colSpan=colspan;tr.append(td);body.append(tr)}
function setCounts(tabSelector,map){for(const tab of shadow('#page')?.querySelectorAll(tabSelector)||[]){const x=tab.dataset.filter?.split(':')[1];const num=tab.querySelector('.count');if(num)num.textContent=map[x]??'—'}}
function fmtObservation(item){if(item.observedAt&&Number.isFinite(item.observedAt)){const mins=Math.max(0,Math.floor((Date.now()-item.observedAt)/60000));return `${mins} min ago · historical`}return 'Not verified'}
async function loadAccounts(){
 try{const result=await accounts();state.lastAccountList=Array.isArray(result.accounts)?result.accounts:[];state.errors.accounts='';if(state.route==='accounts')displayAccounts();return state.lastAccountList}
 catch(error){state.errors.accounts=error.message;state.lastAccountList=[];if(state.route==='accounts')displayAccounts();return []}
}
function displayAccounts(){if(state.route!=='accounts')return;
 const list=shadow('.account-list-scroll');if(!list)return;list.replaceChildren();
 const query=state.acct.query.trim().toLowerCase(),filter=state.acct.filter;
 const all=state.lastAccountList;
 const displayed=all.filter(a=>{const term=String(a.accountId||'').toLowerCase();const stateName=String(a.state||'');const matching=!query||term.includes(query)||String(a.personaUid||'').toLowerCase().includes(query);
 const status=filter==='All'||filter==='Connected'&&stateName==='VERIFIED'||filter==='Archived'&&stateName==='ARCHIVED'||filter==='Attention'&&!['VERIFIED','ARCHIVED'].includes(stateName);
 return matching&&status});
 const pages=Math.ceil(displayed.length/state.acct.perPage);if(state.acct.page>=pages)state.acct.page=Math.max(0,pages-1);
 const offset=state.acct.page*state.acct.perPage;
 const heading=shadow('.workspace-surface .card-title-row .h2 span');if(heading)heading.textContent=' · '+(state.errors.accounts?'unknown':all.length);
 if(state.errors.accounts){renderEmpty(list,'Account records unavailable: '+state.errors.accounts,'pcms-error');}
 else if(!all.length){renderEmpty(list,'No managed accounts observed locally. This is not a remote account census.');}
 else if(!displayed.length){renderEmpty(list,'No matching local account records.');}
 for(const item of displayed.slice(offset,offset+state.acct.perPage)){
  const row=el('div','account-row');const mark=el('div','account-circle',String(item.accountId||'?').slice(-2).toUpperCase());
  const data=el('div','row-body'),h=el('div','row-title',item.accountId||'Unnamed local account');const details=el('div','row-meta',`Persona ${item.personaUid?snippet(item.personaUid,18):'not observed'} · ${item.identity||'Identity unverified'} · ${item.protectedRoute||'Route unknown'}`);
  data.append(h,details);
  const right=el('div','account-right');const status=String(item.state||'UNKNOWN');const label=status==='VERIFIED'?'Ready':status==='ARCHIVED'?'Archived':status.replaceAll('_',' ').toLowerCase();
  right.append(statusPill(label,status==='VERIFIED'?'green':status==='ARCHIVED'?'':'amber'));
  right.append(b('Manage',()=>{
    state.nativeOpen=true;
    nativeRoute('accounts');
    const rowNode=[...native.querySelectorAll('[data-pcms-v014-account-id]')].find(e=>e.dataset.pcmsV014AccountId===item.accountId);
    rowNode?.scrollIntoView({block:'center'});rowNode?.querySelector('summary')?.click();
  }));row.append(mark,data,right);list.append(row);
 }
 const pagination=shadow('.pagination span');if(pagination)pagination.textContent=state.errors.accounts?'Account read unavailable':`${displayed.length?offset+1:0}–${Math.min(offset+state.acct.perPage,displayed.length)} of ${displayed.length} matching local accounts`;
 const prev=shadow('[data-action="account-prev"]'),next=shadow('[data-action="account-next"]');if(prev)prev.disabled=state.acct.page===0;if(next)next.disabled=offset+state.acct.perPage>=displayed.length;
}
async function loadGenerators(){if(state.route!=='generators')return;
 const epoch=++state.renderEpoch,body=shadow('.workspace-surface table tbody');if(!body)return;
 renderEmpty(body,'Reading observed local generator inventory…');
 try{
  const [res,accountsResult]=await Promise.all([inventory({query:state.gen.query,offset:state.gen.offset,limit:state.gen.limit,ownerState:state.gen.filter==='ALL'?'ALL':state.gen.filter,accountId:state.gen.account==='ALL'?'':state.gen.account}),accounts().catch(()=>null)]);
  if(epoch!==state.renderEpoch||state.route!=='generators')return;
  state.lastAccountList=accountsResult?.ok&&Array.isArray(accountsResult.accounts)?accountsResult.accounts:state.lastAccountList;
  state.gen.items=Array.isArray(res.items)?res.items:[];state.gen.total=safeCount(res.total)=== '—'?0:res.total;
  state.errors.generators='';displayGenerators();
 }catch(err){if(epoch!==state.renderEpoch)return;state.errors.generators=err.message;state.gen.items=[];state.gen.total=0;rowsError('.workspace-surface table tbody','Local inventory unavailable: '+err.message+'. No remote absence inferred.',6)}
}
function displayGenerators(){if(state.route!=='generators')return;
 const body=shadow('.workspace-surface table tbody');if(!body)return;body.replaceChildren();
 const accountsMap=new Map(state.lastAccountList.map(a=>[a.accountId,a]));const itemList=[...state.gen.items];
 if(state.gen.sort==='name')itemList.sort((a,b)=>String(a.slug).localeCompare(String(b.slug)));
 if(state.gen.sort==='account')itemList.sort((a,b)=>String(a.accountId).localeCompare(String(b.accountId)));
 state.gen.visibleItems=itemList;
 if(!itemList.length){rowsError('.workspace-surface table tbody',state.errors.generators?'Local inventory unavailable.': 'No matching local generator observations.',6)}
 for(const [i,item] of itemList.entries()){
  const tr=tableRow([item.slug],i);
  const acct=accountsMap.get(item.accountId);const sourceState=item.source||'SOURCE_PENDING';const owner=item.ownerState||'UNKNOWN';
  const statusText=ownerLabels[owner]||owner.replaceAll('_',' ').toLowerCase();
  const td0=el('td','name-cell',item.slug||'Unknown');const td1=el('td','muted-cell',acct?.alias||item.accountId||'Unknown account');
  const td2=el('td');td2.append(statusPill(statusText,statusClasses[owner]||''));
  const td3=el('td','muted-cell',item.visibility||'UNKNOWN');
  const td4=el('td','muted-cell',sourceState+(item.lastObservedAt?' · '+fmtObservation({...item,observedAt:item.lastObservedAt}):''));
  const cue=el('td','open-col');cue.append(icon('chevron'));
  tr.append(td0,td1,td2,td3,td4,cue);body.append(tr);
 }
 setPagination('.workspace-surface .pagination span','[data-action="gen-prev"]','[data-action="gen-next"]',state.gen.offset,state.gen.total,state.gen.limit,
 `${state.gen.total?state.gen.offset+1:0}–${Math.min(state.gen.offset+state.gen.limit,state.gen.total)} of ${state.gen.total} historical local records${state.gen.account!=='ALL'?' · filtered account':''}`);
 // No unsupported fake Published/Developing counts: replace tabs with real owner-state facets.
 const labels={'All':'All','Published':'Owner observed','Developing':'Owner unknown','Needs review':'Disputed','Held':'Unobserved'};
 const map={'All':'ALL','Published':'OBSERVED_OWNER','Developing':'OWNER_UNVERIFIED','Needs review':'OWNER_DISPUTED','Held':'UNOBSERVED',ALL:'ALL',OBSERVED_OWNER:'OBSERVED_OWNER',OWNER_UNVERIFIED:'OWNER_UNVERIFIED',OWNER_DISPUTED:'OWNER_DISPUTED',UNOBSERVED:'UNOBSERVED'};
 const canonicalLabels={ALL:'All',OBSERVED_OWNER:'Owner observed',OWNER_UNVERIFIED:'Owner unknown',OWNER_DISPUTED:'Disputed',UNOBSERVED:'Unobserved'};
 for(const tab of shadow('#page')?.querySelectorAll('[data-filter^="generators:"]')||[]){
  const key=tab.dataset.filter.split(':')[1];const value=map[key];if(!value)continue;tab.dataset.filter='generators:'+value;
  // These are real owner-evidence facets, not simulated publication states.
  tab.replaceChildren(document.createTextNode(canonicalLabels[value]));tab.setAttribute('aria-selected',String(state.gen.filter===value));tab.tabIndex=state.gen.filter===value?0:-1;
 }
 const accountSelect=shadow('#generator-account');if(accountSelect){const prior=accountSelect.value;accountSelect.replaceChildren();const first=el('option','', 'All accounts');first.value='ALL';accountSelect.append(first);
  for(const a of state.lastAccountList){const option=el('option','',a.alias||a.accountId);option.value=a.accountId;accountSelect.append(option)}accountSelect.value=[...accountSelect.options].some(x=>x.value===state.gen.account)?state.gen.account:'ALL';}
}
async function loadRefresher(){if(state.route!=='refresher')return;
 const epoch=++state.renderEpoch;const holder=shadow('.ref-table-scroll tbody');if(holder)renderEmpty(holder,'Reading canonical Refresher state…');
 try{
  const phase=state.ref.phase;
  // Backend supports phases ALL/ACTIVE/SLEEPING/WAITING. No invented HELD phase.
  const serverPhase=['ALL','ACTIVE','SLEEPING','WAITING'].includes(phase)?phase:'ALL';
  const result=await refresher({query:state.ref.query,phase:serverPhase,offset:state.ref.offset,limit:state.ref.limit});
  if(epoch!==state.renderEpoch||state.route!=='refresher')return;
  state.ref.snapshot=result;state.lastRef=result;state.ref.items=Array.isArray(result.items)?result.items:[];
  state.ref.total=Number.isInteger(result.total)?result.total:0;state.errors.refresher='';displayRefresher();
  void refreshRefCounts(epoch);
 }catch(err){if(epoch!==state.renderEpoch)return;state.errors.refresher=err.message;state.ref.items=[];state.ref.total=0;
 rowsError('.ref-table-scroll tbody','Refresher unavailable: '+err.message+'. No feed health inferred.',4);
 text('.ref-table-heading .muted','State unavailable');for(const x of shadow('.ref-kpi-strip')?.querySelectorAll('strong.tabnums')||[])x.textContent='—';}
}
function displayRefresher(){if(state.route!=='refresher')return;
 const res=state.ref.snapshot;if(!res)return;
 const table=shadow('.ref-table-scroll tbody');if(!table)return;table.replaceChildren();
 const unsupported=['Held','Ineligible'].includes(state.ref.phase);
 const items=unsupported?state.ref.items.filter(x=>state.ref.phase==='Held'?x.paused||x.blockers?.length:
  (x.blockers?.length||x.phase==='WAITING')):state.ref.items;
 state.ref.visibleItems=items;
 for(const [i,row] of items.entries()){
  const tr=tableRow([row.slug],i);
  const block=Array.isArray(row.blockers)&&row.blockers.length;
  const stateName=block&&row.phase==='WAITING'?'Needs attention':row.phase==='ACTIVE'?'Active':row.phase==='SLEEPING'?'Sleeping':row.phase==='WAITING'?'Waiting':'Unknown';
  const status=stateName==='Active'?'green':stateName==='Needs attention'?'red':'';
  const remain=row.phase==='ACTIVE'?formatTime(row.activeRemaining):row.phase==='SLEEPING'?formatTime(row.sleepRemaining):'—';
  const first=el('td','name-cell',row.slug);first.title=row.slug;
  const st=el('td');st.append(statusPill(stateName,status));
  const remaining=el('td','muted-cell tabnums',remain);const cue=el('td','open-col');cue.append(icon('chevron'));
  tr.append(first,st,remaining,cue);table.append(tr);
 }
 if(!items.length)rowsError('.ref-table-scroll tbody',unsupported?'No matching records in this server page; full-fleet filter unavailable.':'No matching locally managed generators. Remote status unknown.',4);
 text('.ref-table-heading .muted',safeCount(res.total)+' matching');
 const s=shadow('.ref-pagination span');if(s)s.textContent=`${res.total?state.ref.offset+1:0}–${Math.min(state.ref.offset+state.ref.limit,res.total)} of ${res.total} · canonical local records${unsupported?' · filtered on this page':''}`;
 const prev=shadow('[data-action="ref-prev"]'),next=shadow('[data-action="ref-next"]');if(prev)prev.disabled=state.ref.offset===0;if(next)next.disabled=state.ref.offset+state.ref.limit>=res.total;
 for(const b of shadow('.ref-tabs')?.querySelectorAll('[data-filter]')||[]){const value=b.dataset.filter.split(':')[1];b.setAttribute('aria-selected',String(value.toUpperCase()===state.ref.phase.toUpperCase()));b.tabIndex=b.getAttribute('aria-selected')==='true'?0:-1}
 const side=shadow('.ref-side');if(side){
  const badge=side.querySelector('.ref-side-title .pill');if(badge){const enabled=res.policy?.refreshEnabled===true;badge.textContent=res.restoreHeld?'Held':enabled?'Enabled':'Off';badge.className='pill '+(enabled?'green':'')}
  const descr=side.querySelector('.ref-setting-row .setting-description');if(descr)descr.textContent=res.policy?.refreshEnabled?'Guarded marker saves enabled':'Explicit opt-in required';
  const toggle=side.querySelector('input.feature-switch');if(toggle){toggle.checked=res.policy?.refreshEnabled===true;toggle.disabled=res.restoreHeld===true}
  const details=side.querySelectorAll('.ref-setting-row .setting-description');if(details[1])details[1].textContent=res.policy?`${Math.round(res.policy.activeMs/3600000)}h active / ${Math.round(res.policy.sleepMs/3600000)}h sleep`:'Not verified';
  const pause=side.querySelector('[data-action="pause-refresher"]');if(pause){pause.textContent=res.globalPause?'Resume Refresher':'Pause Refresher';pause.disabled=res.restoreHeld===true}
  const monitorLabels=side.querySelectorAll('.ref-monitor-row>span:first-child');
  if(monitorLabels.length>=3){monitorLabels[1].textContent='Provider';monitorLabels[2].textContent='Scheduler';}
  const vals=side.querySelectorAll('.ref-monitor-value');
  // Source and feed states are always qualified observations.
  const values=[res.recent?.complete===true?'Verified local sample':res.recent?.latestOccupancy?'Historical sample':'Not observed',
    (res.provider?.state||'Provider unknown'),(res.monitoring||'Scheduler unknown'),res.nextWakeAt?new Date(res.nextWakeAt).toLocaleTimeString():'Unknown'];
  [...vals].slice(0,4).forEach((v,i)=>{v.textContent=values[i];v.title=values[i]});
 }
 const feed=shadow('.ref-feed-state');if(feed){const primary=feed.querySelector('strong');const description=feed.querySelector('div span');const confirmed=res.recent?.complete===true;
  if(primary)primary.textContent=confirmed?'Observed':'Not measured';
  if(description)description.textContent='';
  feed.title=confirmed?'Current local feed sample recorded':'Current feed observation unavailable';}
}
async function refreshRefCounts(epoch){
 const keys=['ACTIVE','SLEEPING','WAITING'];const reads=await Promise.allSettled(keys.map(p=>refresher({query:'',phase:p,offset:0,limit:1})));
 if(epoch!==state.renderEpoch||state.route!=='refresher')return;
 const vals=shadow('.ref-kpi-strip')?.querySelectorAll('.ref-kpi strong.tabnums');if(vals)reads.forEach((r,i)=>{vals[i].textContent=r.status==='fulfilled'?safeCount(r.value.total):'—'});
}
function observedReceipts(){
 const sources=[
  ['Review queue','pcms-s06-review-queue','work-queue','release'],
  ['AI development','pcms-ai-jobs','work-queue','ai'],
  ['Generator supply','pcms-supply-items','generators','create'],
  ['Private staging','pcms-stage-queue','work-queue','activity'],
  ['Source updates','pcms-existing-status','work-queue','update'],
  ['Backup / restore','pcms-restore-status','settings','backup']
 ];
 const out=[];
 for(const [label,id,route,group] of sources){const e=nativeControl(id);if(!e)continue;
  // These are canonical native view text projections. Never turn a missing or
  // generic loading string into a synthetic queued/running job.
  const t=snippet(e.textContent,260);
  if(!t||/^(checking|loading|no |none|awaiting|ready to |read unavailable|unknown)/i.test(t))continue;
  const needs=/hold|fail|uncertain|error|approval|review|conflict|reconcile|denied|unavailable/i.test(t);
  const running=/running|dispatch|in.progress|processing|prepared/i.test(t);
  const waiting=/waiting|pending|queued|next|sleep/i.test(t);
  out.push({label,text:t,route,group,needs,running,waiting});
 }
 return out;
}
// Canonical queue only: no status derived from native view text.
const queueState={
 PREPARED:['Waiting',''],DISPATCH_POSSIBLE:['Outcome not confirmed','amber'],
 OBSERVING:['Verifying result',''],HELD_UNCERTAIN:['Needs reconciliation','amber'],
 CONFIRMED:['Confirmed','green'],ABORTED:['Cancelled',''],
 REJECTED:['Rejected','amber']};
function queueGroup(filter){
 return ({'Needs action':'NEEDS_ACTION',Running:'RUNNING',Waiting:'WAITING',
   Completed:'COMPLETED',All:'ALL'})[filter]||'NEEDS_ACTION';
}
async function loadQueue(reset=false){
 if(state.route!=='work-queue')return;
 const q=state.queue;
 if(reset){q.opCursor='';q.noticeCursor='';q.history=[];q.nextOps=null;q.nextNotices=null;}
 const epoch=++q.epoch;
 q.loading=true;q.error=null;displayQueue();
 const includeNotices=q.filter==='Needs action'||q.filter==='All';
 const requested=[
   q.opCursor!==null?guardedRead('pcms-i02-canonical-readonly','LIST_OPERATION_PAGE',{
     after:q.opCursor,limit:20,status:queueGroup(q.filter),query:q.query}):
     Promise.resolve({ok:true,items:[],more:false,next:null}),
   includeNotices&&q.noticeCursor!==null?
     guardedRead('pcms-i02-canonical-readonly','LIST_NOTICE_PAGE',{
       after:q.noticeCursor,limit:20,query:q.query}):Promise.resolve({ok:true,items:[],more:false,next:null}),
   guardedRead('pcms-i02-canonical-readonly','SUMMARY'),
   guardedRead('pcms-r4-folder-identity','LIST')
     .catch(()=>({ok:false,items:[],missingFolders:[]}))
 ];
 try{
  const [ops,notices,summary,identities]=await Promise.all(requested);
  if(state.route!=='work-queue'||q.epoch!==epoch)return;
  q.operations=ops.items||[];q.incidents=notices.items||[];
  q.nextOps=ops.more?ops.next:null;q.nextNotices=notices.more?notices.next:null;
  q.more=Boolean(ops.more||notices.more);q.summary=summary;
  q.reviews=identities?.ok?(identities.items||[]):[];
  q.missing=identities?.ok?(identities.missingFolders||[]):[];
  q.error=null;
 }catch(err){
  if(q.epoch!==epoch)return;
  q.operations=[];q.incidents=[];q.more=false;q.error=err.message||'LOCAL_QUEUE_UNAVAILABLE';
 }finally{if(q.epoch===epoch){q.loading=false;displayQueue();}}
}
function displayQueue(){
 if(state.route!=='work-queue')return;
 const q=state.queue;const holder=shadow('.queue-list');
 if(!holder)return;holder.replaceChildren();
 if(q.loading)renderEmpty(holder,'Reading recorded operations and incidents…');
 else if(q.error)renderEmpty(holder,'The local work queue is unavailable. No operation result has been assumed.');
 else{
  if((q.filter==='Needs action'||q.filter==='All')&&!q.query)
   for(const review of q.reviews.filter(r=>r.state==='REVIEW_REQUIRED'||r.stale)){
    const row=el('div','queue-item'),mark=el('span','row-mark warn');mark.append(icon('alert'));
    const content=el('div','row-body');
    const old=review.oldSlug||'an unresolved existing generator';
    const title=el('strong','',review.oldSlug?
      'Review possible source-folder rename':'Review new folder with conflicting identity');
    content.append(title,el('p','setting-note',
      'GitHub contains '+review.newSlug+' while '+old+
      ' is no longer recognized. The live generator is unchanged.'));
    if(review.stale){
      content.append(el('p','setting-note',
        'The Git source changed after this review began. Refresh the catalog before choosing.'));
    }else{
      const actions=el('div','form-foot');
      async function choose(choice){
       const prompt=choice==='CREATE_SEPARATE'?
        'Keep the original generator unchanged and authorize a separate new generator from this Git folder? Normal owner, route, source and publication safety checks still apply.':
        'Request renaming the verified existing generator? PCMS will hold this request until ownership, route and source safety are independently confirmed. No rename occurs now.';
       if(!window.confirm(prompt))return;
       try{
        const answer=await readPort('pcms-r4-folder-identity','CHOOSE',{
         newSlug:review.newSlug,choice,expectedTreeOid:review.newTreeOid,
         expectedRevision:review.revision},12000);
        if(!answer?.ok){notify('The identity choice could not be confirmed. Refresh and review again.');return;}
        notify(choice==='CREATE_SEPARATE'?
          'Separate identity recorded. The next complete Git scan will check eligibility.':
          'Rename request recorded. The existing generator has not been changed.');
        await loadQueue(true);
       }catch{notify('The review result is uncertain. Refresh before taking another action.');}
      }
      const rename=b('Rename verified existing',()=>void choose('RENAME_EXISTING'),'btn small');
      rename.disabled=!review.oldSlug;
      actions.append(rename,b('Create separate generator',()=>void choose('CREATE_SEPARATE'),'btn small'));
      content.append(actions);
    }
    row.append(mark,content);holder.append(row);
   }
  if((q.filter==='Needs action'||q.filter==='All')&&!q.query)
   for(const slug of q.missing.slice(0,30)){
    const row=el('div','queue-item'),mark=el('span','row-mark warn');mark.append(icon('alert'));
    const data=el('div','row-body');
    data.append(el('strong','','Git source missing: '+slug),
      el('p','setting-note',
       'The folder was absent from a complete main snapshot. The live generator has not been deleted or unlisted.'));
    row.append(mark,data);holder.append(row);
   }
  for(const n of q.incidents){
   const row=el('div','queue-item');
   const marker=el('span','row-mark warn');marker.append(icon('alert'));
   const detail=el('div','row-body');
   const header=el('div','queue-head');
   header.append(el('strong','',n.code.replaceAll('_',' ').toLowerCase()),
     statusPill(n.reviewed?'Reviewed — still active':'Needs attention','amber'));
   detail.append(header,el('div','row-meta',
     'Incident · '+n.scopeId+' · '+(Number.isFinite(n.lastAt)?new Date(n.lastAt).toLocaleString():'time unavailable')));
   const action=el('button','btn small',n.reviewed?'Reviewed':'Mark reviewed');
   action.type='button';
   action.addEventListener('click',async()=>{action.disabled=true;
    try{
     const out=await readQueueNoticeAck(n);
     if(out?.ok&&out.stillActionable===true)await loadQueue(true);
     else notify('Review not confirmed. Incident remains active.');
    }catch{notify('Review not confirmed. Incident remains active.');}
    finally{action.disabled=n.reviewed;}
   },{once:true});
   action.disabled=n.reviewed;row.append(marker,detail,action);holder.append(row);
  }
  for(const op of q.operations){
   const row=el('div','queue-item');const info=queueState[op.status]||['Not verified',''];
   const marker=el('span','row-mark'+(info[1]==='amber'?' warn':''));marker.append(icon(info[1]==='amber'?'alert':'activity'));
   const detail=el('div','row-body'),header=el('div','queue-head');
   header.append(el('strong','',op.effectType?.replaceAll('_',' ')||'Recorded operation'),statusPill(info[0],info[1]));
   detail.append(header,el('div','row-meta',
     'Target '+op.targetId+' · revision '+op.revision+' · '+op.operationId+
     (Number.isFinite(op.updatedAt)?' · '+new Date(op.updatedAt).toLocaleString():' · time not recorded')));
   const action=b('Inspect',()=>{notify('This record is maintained by the protected operation controller. No retry has been dispatched.');});
   row.append(marker,detail,action);holder.append(row);
  }
  if(!q.operations.length&&!q.incidents.length)
    renderEmpty(holder,'No matching recorded operations or active incidents. This is not proof of remote health.');
 }
 const counts=q.summary?.states||{},attention=q.summary?.attention||{};
 const needs=(counts.HELD_UNCERTAIN||0)+(counts.REJECTED||0)+(counts.DISPATCH_POSSIBLE||0)+
   (attention.actionRequired||0)+(attention.serious||0);
 const running=counts.OBSERVING||0,waiting=counts.PREPARED||0,completed=(counts.CONFIRMED||0)+(counts.ABORTED||0);
 const counters=shadow('.queue-stats');if(counters){counters.replaceChildren();
  for(const [label,num] of [['need action',needs],['verifying',running],['waiting',waiting]]){
   const tag=el('span');tag.append(el('strong','',q.summary?.ok?num:'—'),document.createTextNode(' '+label));counters.append(tag)}
 }
 for(const tab of shadow('.tabs[aria-label="Work queue status"]')?.querySelectorAll('[data-filter]')||[]){
  const f=tab.dataset.filter.split(':')[1],badge=tab.querySelector('.count');
  const count=f==='Needs action'?needs:f==='Running'?running:f==='Waiting'?waiting:f==='Completed'?completed:
    needs+running+waiting+completed;
  if(badge)badge.textContent=q.summary?.ok&&!q.query?count:'—';
  tab.setAttribute('aria-selected',String(f===q.filter));
 }
 const foot=shadow('.pagination span');if(foot)foot.textContent=q.loading?'Loading recorded work…':
  q.error?'Local journal unavailable':q.operations.length+q.incidents.length+' records on this page · read-only';
 const prev=shadow('[data-action="queue-prev"]'),next=shadow('[data-action="queue-next"]');
 if(prev)prev.disabled=q.loading||q.history.length===0;
 if(next)next.disabled=q.loading||!q.more;
}
function readQueueNoticeAck(n){
 return new Promise((resolve,reject)=>{
  const port=browser.runtime.connect({name:'pcms-i02-canonical-readonly'});
  let done=false;const timer=setTimeout(()=>finish(null,new Error('TIMEOUT')),12000);
  function finish(reply,error){if(done)return;done=true;clearTimeout(timer);try{port.disconnect()}catch{}
   error?reject(error):resolve(reply)}
  port.onMessage.addListener(reply=>finish(reply));
  port.onDisconnect.addListener(()=>finish(null,new Error('DISCONNECTED')));
  try{port.postMessage({type:'ACK_NOTICE',notice:{
   scopeId:n.scopeId,code:n.code,expectedRevision:n.revision}})}catch{finish(null,new Error('DISCONNECTED'))}
 });
}
function displayOverview(){if(state.route!=='overview')return;
 const cards=[...page().querySelectorAll('.stat-grid .stat-card')];
 for(const [i,label] of ['Managed generators','Refresher','Work requiring attention','Last verified backup'].entries()){
  cards[i]?.querySelector('.stat-label')?.replaceChildren(document.createTextNode(label));
 }
 function setStat(index,value,note){const card=cards[index];if(!card)return;
  const target=card.querySelector('.stat-value');if(target)target.textContent=value;
  const explain=card.querySelector('.stat-note');if(explain){explain.textContent=note;explain.classList.remove('good')}
 }
 setStat(0,'—','Reading local observations');setStat(1,'—','Unknown');setStat(2,'—','Unknown');setStat(3,'—','Unknown');
 const sections=[...page().querySelectorAll('.overview-grid .overview-card')];
 sections.forEach(section=>{const list=section.querySelector('.panel-scroll');if(list)renderEmpty(list,'No current local receipt has been confirmed.');});
 const sourceQueue=observedReceipts();
 if(sourceQueue.length){const attention=sourceQueue.filter(x=>x.needs);const progress=sourceQueue.filter(x=>x.running||x.waiting);
  for(const [index,group] of [[0,attention],[1,progress]]){const box=sections[index]?.querySelector('.panel-scroll');if(!box)continue;box.replaceChildren();
   if(!group.length)renderEmpty(box,'No matching local receipt currently observed.');
   group.slice(0,8).forEach(item=>{const row=el('div','list-row');const badge=el('span','row-mark'+(item.needs?' warn':''));badge.append(icon(item.needs?'alert':'activity'));
    const data=el('div','row-body');data.append(el('p','row-title',item.label),el('div','row-meta',item.text));row.append(badge,data,b('Inspect',()=>nativeAction(item.route,item.group)));box.append(row)});
  }
 }
 setStat(2,String(sourceQueue.filter(x=>x.needs).length),'From observed local operation receipts');
 const other=sections.slice(2);
 for(const block of other){const display=block.querySelector('.panel-scroll');if(!display)continue;display.replaceChildren();
  const key=block.querySelector('h2')?.textContent?.toLowerCase()||'';
  const target=key.includes('health')?nativeControl('pcms-guard-health'):nativeControl('pcms-journal-health');
  display.append(el('p','native-bridge-note',snippet(target?.textContent,400)||'Local observation unavailable.'));
 }
 void Promise.allSettled([inventory({offset:0,limit:1}),refresher({phase:'ALL',offset:0,limit:1})]).then(([inv,ref])=>{
  if(state.route!=='overview')return;
  const n=inv.status==='fulfilled'&&Number.isInteger(inv.value.total)?inv.value.total:null;
  setStat(0,n===null?'—':String(n),n===null?'Inventory read unavailable':'Historical local inventory · not a remote census');
  const r=ref.status==='fulfilled'?ref.value:null;
  setStat(1,r?.ok?String(r.occupied??'—'):'—',r?.ok?'Active scheduled slots · feed placement separate':'Refresher read unavailable');
 });
 const backup=nativeControl('pcms-overview-backup');setStat(3,'—',snippet(backup?.textContent,150)||'No verified backup record available');
}
// R3: diagnostic projection from the actual background boundary. This is not
// an additional source of operational authority and never enables effects.
function renderReadinessPanel(container){
 container.querySelector('[aria-label="Operational readiness preflight"]')?.remove();
 const section=el('section','card settings-group');
 section.setAttribute('aria-label','Operational readiness preflight');
 section.append(el('h2','h2','Operational readiness'));
 section.append(el('p','setting-note',
  'Checks are observational. A passing local check is not live provider acceptance. Remote Git verification reads private metadata only after explicit consent.'));
 const controls=el('div','settings-section-head');
 const local=b(state.readinessBusy?'Checking…':'Run local preflight',()=>{void runReadiness(false)},'btn primary');
 const remote=b('Verify private GitHub read-only',()=>{
  if(!window.confirm('Authorize a read-only authenticated GET of the configured private GitHub repository and its complete main tree? No token will be exported and no Git/provider writes will occur.'))return;
  void runReadiness(true);
 },'btn small');
 local.disabled=state.readinessBusy;remote.disabled=state.readinessBusy;
 const reconcile=b('Reconcile interrupted Git connection',()=>{
  if(!window.confirm('Read the OS vault credential inside the background process, independently verify this exact private GitHub repository identity, and repair only local connection metadata? No token is exported; no remote write occurs.'))return;
  void (async()=>{
   try{const out=await readPort('pcms-s03-catalog','RECONCILE_GIT',{},30000);
    notify(friendlyConnectionIssue(out?.code));await runReadiness(false);
   }catch{notify('Reconciliation status unknown; run preflight before another action.');}
  })();
 },'btn small');
 reconcile.disabled=state.readinessBusy||!state.readiness?.rows?.some(row=>
   row.component==='GIT_PARTIAL_CONNECTION'&&row.state==='OUTCOME_UNCERTAIN');
 const exportButton=b('Export sanitized report',()=>{
  const report=state.readiness;if(!report?.ok)return;
  // Only the strict R3 schema rows are exported, never raw native/network
  // messages, account details, source, tabs or credentials.
  const keys=['component','scope','state','stage','code','dependency','observedAt',
    'evidenceKind','evidenceSource','safeRecovery','retrySafety'];
  const safe={schema:1,checkedAt:report.checkedAt,
    remoteRequested:report.remoteRequested,rows:report.rows.map(row=>
      Object.fromEntries(keys.map(k=>[k,row[k]??null])))};
  const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});
  const uri=URL.createObjectURL(blob);const anchor=document.createElement('a');
  anchor.href=uri;anchor.download='pcms-readiness-sanitized.json';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(uri),1000);
 },'btn small');
 exportButton.disabled=!state.readiness?.ok||state.readinessBusy;
 controls.append(local,remote,reconcile,exportButton);section.append(controls);
 const pendingGit=state.readiness?.rows?.some(r=>r.component==='GIT_PARTIAL_CONNECTION'&&r.state==='OUTCOME_UNCERTAIN');
 const vaultReachable=state.readiness?.rows?.some(r=>r.component==='NATIVE_VAULT_HOST'&&r.state==='VERIFIED');
 if(pendingGit&&vaultReachable){
  const recovery=el('div','settings-section');
  recovery.append(el('p','setting-note',
    'If PCMS cannot recover the previously saved GitHub credential, you can explicitly replace it. Use Reconcile first; replacement is not automatic.'));
  const replacement=el('input','form-input');
  replacement.type='password';replacement.autocomplete='off';replacement.spellcheck=false;
  replacement.placeholder='Replacement GitHub credential';
  replacement.setAttribute('aria-label','Replacement GitHub credential');
  const retry=b('Replace credential and finish setup',()=>{
    const value=replacement.value;replacement.value='';
    if(!value){notify('Enter the replacement GitHub credential first.');return;}
    if(!window.confirm('Replace any previous GitHub credential for Neb963/per-gens with the new one? This is an explicit recovery action; it does not change GitHub files or generators.'))return;
    void (async()=>{
      try{
       const out=await readPort('pcms-s03-catalog','RECOVER_GIT_CONNECTION',{
         repository:'Neb963/per-gens',token:value,acknowledgeCredentialReplacement:true},30000);
       notify(out?.ok?'Secure GitHub setup completed. Run a read-only verification before using it.':
         friendlyConnectionIssue(out?.code));
      }catch{notify('The recovery result could not be confirmed. Run preflight before trying again.');}
      finally{await runReadiness(false);}
    })();
  },'btn small');
  retry.disabled=state.readinessBusy;
  recovery.append(replacement,retry);section.append(recovery);
 }
 const summary=el('p','setting-note');summary.setAttribute('role','status');
 if(state.readinessBusy)summary.textContent='Observing current runtime and local dependencies…';
 else if(!state.readiness)summary.textContent='Not checked in this dashboard session.';
 else if(!state.readiness.ok)summary.textContent='Preflight unavailable: '+String(state.readiness.code||'UNKNOWN');
 else {
  const hostUnavailable=state.readiness.rows.some(row=>
    ['NATIVE_VAULT_HOST','BACKUP_HOST','DIAGNOSTIC_HOST'].includes(row.component)&&row.state==='UNREACHABLE');
  const pending=state.readiness.rows.some(row=>row.component==='GIT_PARTIAL_CONNECTION'&&row.state==='OUTCOME_UNCERTAIN');
  summary.textContent=hostUnavailable?
    'The local PCMS helper is not responding. GitHub connection, backup and full diagnostic tests cannot finish until it is repaired.':
    pending?'A previous GitHub connection did not finish. Review and reconcile it before running full diagnostics.':
    'Readiness checked. Review any items that need attention; a local check does not prove live service operations.';
 }
 section.append(summary);
 const results=el('div','queue-list');
 for(const r of state.readiness?.rows||[]){
  const item=el('div','queue-item');item.style.display='block';
  item.append(el('strong','',READINESS_NAMES[r.component]||r.component.replaceAll('_',' ')),
    document.createTextNode(' — '+(READINESS_STATES[r.state]||'Needs review')));
  item.append(el('p','setting-note',operatorReadinessGuidance(r)));
  const technical=el('details','muted small');
  const summary=el('summary','','Technical details');technical.append(summary);
  technical.append(el('p','',r.code+' · '+r.stage+' · '+r.evidenceKind+' · '+new Date(r.observedAt).toLocaleString()));
  technical.append(el('p','',r.safeRecovery));
  item.append(technical);results.append(item);
 }
 section.append(results);container.append(section);
}
async function runReadiness(remote){
 if(state.readinessBusy)return;
 state.readinessBusy=true;renderSettingsSection();
 try{
  const snapshot=await readPort('pcms-r3-readiness','CHECK',{remote},95000);
  if(!snapshot?.ok){state.readiness=snapshot;return;}
  // These existing canonical ports are independent of Git/native diagnosis.
  // They must not be converted into proof of a protected route or source save.
  const replies=await Promise.allSettled([accounts(),refresher({phase:'ALL',offset:0,limit:1})]);
  const at=Date.now();const make=(component,state,code,source,recovery)=>({
   component,scope:'LOCAL',state,stage:'CANONICAL_PORT_READ',code,
   dependency:'ACTIVE_BACKGROUND_BOUNDARY',observedAt:at,evidenceKind:'D',
   evidenceSource:source,safeRecovery:recovery,retrySafety:'READ_ONLY'});
  const acc=replies[0].status==='fulfilled'?replies[0].value:null;
  snapshot.rows.push(make('ACCOUNT_INVENTORY_READ',acc?.ok?'VERIFIED':'UNREACHABLE',
    acc?.ok?'CANONICAL_ACCOUNTS_RESPONDED':'ACCOUNT_READ_UNAVAILABLE',
    'PCMS_I03_ACCOUNTS','This verifies only local account inventory; actual protected route/login need separate guarded observation.'));
  const ref=replies[1].status==='fulfilled'?replies[1].value:null;
  snapshot.rows.push(make('REFRESHER_CURRENT_POLICY',ref?.ok?'VERIFIED':'UNREACHABLE',
    ref?.ok?(ref.policy?.refreshEnabled?'POLICY_ENABLED':'POLICY_DISABLED'):'CANONICAL_REFRESHER_UNAVAILABLE',
    'PCMS_I12_REFRESHER','Policy state is not proof of live source-saving, complete recent-feed placement or qualified clock time.'));
  snapshot.rows.push(make('REFRESHER_LIVE_EFFECT','NOT_TESTED',
    'SOURCE_SAVE_AND_RECENT_UNVERIFIED','NO_INDEPENDENT_L_RECEIPT',
    'Use a separately authorized disposable live test to verify saved bytes and recent-feed placement.'));
  state.readiness=snapshot;
 }catch{state.readiness={ok:false,code:'READINESS_TRANSPORT_UNAVAILABLE'};}
 finally{state.readinessBusy=false;if(state.route==='settings')renderSettingsSection();}
}
function renderSettingsSection(){if(state.route!=='settings')return;
 const names=['connections','automation','backups','diagnostics','advanced'];
 const select=names.includes(state.settings)?state.settings:'connections';
 for(const b of page().querySelectorAll('[data-settings]')){b.classList.toggle('active',b.dataset.settings===select);b.setAttribute('aria-current',b.dataset.settings===select?'page':'false')}
 const container=shadow('.settings-main');if(!container)return;
 // Keep exact prototype setting rows; only their data comes from native state.
 // Other settings expose their original guarded controls without attempting to
 // reproduce authorization or credential editors in a simulated frontend.
 if(select==='connections'){
  const rows=[...container.querySelectorAll('.settings-row')];
  const mapping=[['GitHub source','pcms-catalog-status','generators','catalog'],['PersonaMonkey routing','pcms-accounts-feedback','accounts',null],['Native vault and host','pcms-backup-status','settings','backup']];
  mapping.forEach(([label,id,target,group],i)=>{
   const row=rows[i];if(!row)return;const title=row.querySelector('.setting-title'),desc=row.querySelector('.setting-description'),pill=row.querySelector('.pill');
   if(title)title.textContent=label;
   const source=nativeControl(id);const status=snippet(source?.textContent,110)||'State not observed';
   if(desc)desc.textContent=status;if(pill){pill.textContent='Unverified';pill.className='pill'}
   const button=row.querySelector('button[data-action]');if(button)button.dataset.action='check-service:'+(['github','persona','native'][i]);
  });
  container.querySelectorAll('.settings-row').forEach(row=>{if(row.querySelector('.pill')?.textContent==='Healthy')row.querySelector('.pill').textContent='Unknown'});
 } else {
  container.replaceChildren();
  const section=el('section','card settings-group');const head=el('div','settings-section-head');const titles={automation:'Automation',backups:'Backup & Restore',diagnostics:'Diagnostics',advanced:'Advanced'};
  head.append(el('h2','h2',titles[select]));section.append(head);
  section.append(el('p','setting-note','Some controls are still in the original PCMS view. They use the same protected data and permissions; the unified settings interface is not yet complete.'));
  const group=select==='backups'?'backup':select==='diagnostics'?'diagnostics':select==='automation'?'automation':'permissions';
  section.append(b('Open '+titles[select].toLowerCase()+' tools (original view)',()=>nativeAction('settings',group),'btn primary'));
  container.append(section);
 }
 renderReadinessPanel(container);
}
function displayRouteScaffold(){
 if(state.route==='overview')displayOverview();
 if(state.route==='work-queue'){displayQueue();void loadQueue(true);}
 if(state.route==='generators'){
  const select=shadow('#generator-account');if(select)select.value=state.gen.account;
  const q=shadow('#generator-search');if(q)q.value=state.gen.query;
  void loadGenerators();
 }
 if(state.route==='accounts'){
  const f=shadow('#account-filter');if(f)f.value=state.acct.filter;
  const q=shadow('#account-search');if(q)q.value=state.acct.query;
  displayAccounts();void loadAccounts();
 }
 if(state.route==='refresher'){
  const q=shadow('#refresher-search');if(q)q.value=state.ref.query;
  void loadRefresher();
 }
 if(state.route==='settings')renderSettingsSection();
 const top=page()?.querySelector('.page-head .head-actions');
 if(top){top.append(b('More controls (original view)',()=>nativeAction(state.route),'btn quiet small'))}
 else page()?.querySelector('.page-head')?.append(b('Advanced controls',()=>nativeAction(state.route),'btn quiet small'));
}
const templates=new Map();
async function render(){
 const route=state.route,html=templates.get(route);
 if(!html)return;
 const template=document.createElement('template');template.innerHTML=html;
 const old=shadow('#page');old.replaceWith(template.content.firstElementChild);
 updateNav();displayRouteScaffold();
}
async function mount(){
 const url=new URL('./',import.meta.url);
 const files=['shell.html','symbols.html',...routes.map(r=>r+'.html')];
 const replies=await Promise.all(files.map(f=>fetch(new URL(f,url)).then(r=>{if(!r.ok)throw new Error('Asset '+f+' unavailable');return r.text()})));
 const assets=Object.fromEntries(files.map((f,i)=>[f,replies[i]]));
 for(const r of routes)templates.set(r,assets[r+'.html']);
 root.innerHTML=assets['symbols.html']+assets['shell.html']+'<div id="pcms-live-toast" class="pcms-action-toast" role="status" hidden></div>';
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('prototype.css',url).href;root.prepend(link);
 const addon=document.createElement('style');addon.textContent=':host{display:block;height:100dvh;min-height:0} .pcms-action-toast{position:fixed;bottom:20px;right:25px;z-index:100;padding:12px 16px;background:#253e55;color:white;border-radius:7px;box-shadow:0 5px 24px #0003;max-width:380px} .pcms-action-toast[hidden]{display:none}';root.append(addon);
 let initial=location.hash.slice(1);if(!routes.includes(initial))initial='overview';state.route=initial;
 document.querySelector('#pcms-legacy-return')?.addEventListener('click',nativeReturn);
 routeHandlers();await render();document.body.classList.add('pcms-faithful-ready');
 window.addEventListener('hashchange',()=>{const dest=location.hash.slice(1);if(routes.includes(dest)&&dest!==state.route){state.route=dest;void render()}});
 // Native modules drive canonical state while dashboard remains closed; this
 // observer reads their projections only when the matching shadow UI is visible.
 const targets=['pcms-queue-refresher','pcms-overview-backup','pcms-guard-health','pcms-journal-health','pcms-s06-review-queue','pcms-ai-jobs'];
 let timer=null;const observer=new MutationObserver(()=>{
  if(timer)clearTimeout(timer);
  timer=setTimeout(()=>{if(state.route==='overview')displayOverview();else if(state.route==='work-queue')displayQueue()},250);
 });
 for(const id of targets){const n=nativeControl(id);if(n)observer.observe(n,{childList:true,characterData:true,subtree:true})}
}
mount().catch(error=>{
 console.error('Faithful production UI boot failed',error);
 // Fail open to the original full-capability dashboard. Never hide protected
 // controls behind a broken presentation layer.
 document.body.classList.remove('pcms-faithful-ready');host.remove();
});