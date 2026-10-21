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
const READINESS_NAMES={EXTENSION_RUNTIME:'PCMS extension',LOCAL_CONFIGURATION:'Local settings',RESTORE_HOLD:'Restore safety',REFRESHER_POLICY:'Refresher configuration',BACKUP_RESTORE:'Backup recovery',ACCOUNT_INVENTORY_READ:'Account inventory',REFRESHER_CURRENT_POLICY:'Current Refresher policy',NATIVE_VAULT_HOST:'GitHub credential helper',SECRET_SERVICE_ENVIRONMENT:'Secure credential storage',BACKUP_HOST:'Backup helper',DIAGNOSTIC_HOST:'Diagnostic helper',GIT_CONFIG:'GitHub connection',GIT_PARTIAL_CONNECTION:'Interrupted GitHub setup',GITHUB_AUTH:'GitHub access',GITHUB_MAIN_TREE:'GitHub file scan',GRANT_DEVELOPMENT:'Development permission',GRANT_GITWRITE:'Git write permission',GRANT_PUBLICATION:'Publication permission',PERSONA_AND_SESSION:'Account and secure route',REFRESHER_LIVE_EFFECT:'Refresher operation',INSTALLED_XPI_IDENTITY:'Installed extension verification'};
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
 acct:{page:0,perPage:24,query:'',filter:'All',list:[]},queue:{filter:'Needs action',query:'',operations:[],incidents:[],opCursor:'',noticeCursor:'',history:[],nextOps:null,nextNotices:null,more:false,loading:false,error:null,summary:null,reviews:[],missing:[],releaseItems:[],epoch:0},
 settings:'connections',lastAccountList:[],lastInventoryTotal:null,lastRef:null,errors:{},nativeOpen:false,
 renderEpoch:0,version:'0.1.7',readiness:null,readinessBusy:false};
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
 const t=shadow('[data-nav="work-queue"] .nav-count');if(t){
  const stats=state.queue.summary?.states,notices=state.queue.summary?.attention?.counts;
  const count=stats?(stats.HELD_UNCERTAIN||0)+(stats.REJECTED||0)+(stats.DISPATCH_POSSIBLE||0)+
    (notices?.actionRequired||0)+(notices?.serious||0):0;
  t.textContent=count?String(count):'';t.hidden=!count;
 }
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
 if(type==='timing'){openRefresherTiming(item);}
 else if(type==='source'){openSourceManager(item);}
 else if(type==='adopt'){openAdoptionManager(item);}
 else{const field=nativeControl('pcms-generator-query');if(field){field.value=item.slug;field.dispatchEvent(new Event('input',{bubbles:true}))}nativeRoute('generators','inventory')}
}
// Primary source association is a read-only pinned-main inspection followed
// by a local, revision-fenced link. It performs no Git/provider modification.
function openSourceManager(item){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('div','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','GitHub source for '+item.slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Source · '+item.slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note',
  'Reading the locally verified source association…');status.setAttribute('role','status');
 const folder=el('input','form-input');folder.value='generators/'+item.slug;folder.maxLength=240;
 const label=el('label','','GitHub folder on committed main');label.append(folder);
 const actions=el('div','form-foot'),manifest=el('div','queue-list');
 body.append(label,actions,status,manifest);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 async function association(){
  try{
   const reply=await readPort('pcms-i05-source','GET_ASSOCIATION',{slug:item.slug},12000);
   if(!overlay.isConnected)return;
   if(reply?.ok){folder.value=reply.link.folder;
    status.textContent='Previously associated GitHub main folder. This is historical evidence, not a fresh source or owner verification.';
   }else status.textContent='No verified source association is recorded for this generator.';
  }catch{status.textContent='Source association could not be read. No change has been made.';}
 }
 const inspect=b('Read source from main',()=>void(async()=>{
  inspect.disabled=true;manifest.replaceChildren();
  status.textContent='Checking the complete source manifest from GitHub main…';
  try{
   const data=await readPort('pcms-i05-source','INSPECT_SOURCE',{folder:folder.value.trim()},95000);
   if(!data?.ok){status.textContent='Source could not be verified on GitHub main. No association has been changed.';return}
   status.textContent='Read-only GitHub source verified at '+data.head.slice(0,12)+
    '. Deployment status: '+(data.ready?'READY':'NOT_READY')+'.';
   for(const file of (data.paths||[]).slice(0,100)){
    const row=el('p','setting-note',file.path+' · '+file.size+' bytes · SHA-256 '+file.sha256);
    manifest.append(row);
   }
   if(item.ownerState!=='OBSERVED_OWNER'||!Number.isSafeInteger(item.revision)){
    manifest.append(el('p','setting-note',
      'Local association requires a separately verified owner and current inventory revision.'));
    return;
   }
   const assign=b('Associate verified source',()=>void(async()=>{
    if(!window.confirm('Associate this exact verified main source with the currently observed owned generator? This changes only the local PCMS association.'))return;
    assign.disabled=true;
    try{
     const out=await readPort('pcms-i05-source','ASSOCIATE_SOURCE',{
      slug:item.slug,folder:data.folder,expectedRevision:item.revision,
      pinnedFingerprint:data.fingerprint,pinnedHead:data.head,
      pinnedTestingSha:data.testingSha},95000);
     status.textContent=out?.ok?
       'Source association saved. PCMS still requires fresh owner and source readbacks for each protected effect.':
       'Source association was not confirmed. Refresh the generator inventory before retrying.';
    }catch{status.textContent='Association outcome uncertain; check the current source link before retrying.'}
    finally{assign.disabled=false;}
   })(),'btn primary');
   manifest.append(assign);
  }catch{status.textContent='GitHub verification did not complete. No source link was changed.'}
  finally{inspect.disabled=false}
 })(),'btn small');
 const recheck=b('Verify existing source link',()=>void(async()=>{
  recheck.disabled=true;
  try{
   const result=await readPort('pcms-i05-source','RECHECK_SOURCE',{slug:item.slug},95000);
   status.textContent=result?.ok?
    'Existing source link was checked against current main. Review differences before any write.':
    'Existing source could not be verified; protected writes remain held.';
  }catch{status.textContent='The current source link could not be checked.'}
  finally{recheck.disabled=false}
 })(),'btn small');
 actions.append(inspect,recheck);void association();folder.focus();
}
// Adoption is guarded by the protected account and owned-source readbacks.
// The visible button never creates a new generator, writes source or publishes.
function openAdoptionManager(item){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('div','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','Adopt existing generator '+item.slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');
 head.append(el('h2','drawer-title','Adopt · '+item.slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note',
   'Checking the existing generator and its protected account binding…');
 status.setAttribute('role','status');body.append(status);
 const meta=el('dl');
 for(const [label,value] of [['Generator',item.slug],
   ['Owner evidence',item.ownerState||'Unverified'],
   ['Account',item.accountId||'Unknown'],['Visibility',item.visibility||'Unknown']]){
  const row=el('div','kv');row.append(el('dt','',label),el('dd','',value));meta.append(row);
 }body.append(meta);
 const actions=el('div','form-foot');
 const adopt=b('Adopt verified owned generator',()=>void(async()=>{
  if(item.ownerState!=='OBSERVED_OWNER'||!Number.isSafeInteger(item.revision)){
   status.textContent='Ownership and revision must be verified before adoption.';return}
  const publicItem=item.visibility==='PUBLIC';
  if(!window.confirm(publicItem?
    'Capture the exact original source of this publicly visible owned generator? Existing content and publication remain untouched, and Git archival needs its own guarded checks.':
    'Capture this owned generator and its exact original source? Remote contents remain unchanged.'))return;
  adopt.disabled=true;status.textContent='Checking two independent original-source readbacks…';
  try{
   const out=await readPort('pcms-i07-adoption','CAPTURE_ADOPTION',{
    slug:item.slug,expectedRevision:item.revision,explicitPublicConsent:publicItem},95000);
   status.textContent=out?.ok?
    'Original-source capture recorded. Source archival and any future editing require separate independent checks.':
    'Original-source capture was not verified. Nothing was published or overwritten.';
  }catch{status.textContent='Adoption outcome uncertain. Refresh the account and adoption state before retrying.'}
  finally{adopt.disabled=false;}
 })(),'btn primary');
 if(item.ownerState!=='OBSERVED_OWNER')adopt.disabled=true;
 const check=b('View adoption status',()=>void(async()=>{
  try{
   const out=await readPort('pcms-i07-adoption','GET_ADOPTION',{slug:item.slug},15000);
   status.textContent=out?.ok?
    'Existing original capture: '+(out.record?.state||'recorded')+
    '. This is a local record, not proof of a Git archive.':
    'No previously verified original capture is available.';
  }catch{status.textContent='Adoption state could not be read.'}
 })(),'btn small');
 actions.append(adopt,check);body.append(actions);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 check.focus();
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
// Primary per-generator timing and activity controls reuse exact canonical
// Refresher revisions; they never claim a successful provider source save.
function openRefresherTiming(item){
 const snap=state.ref.snapshot;
 if(!snap?.ok||!Number.isSafeInteger(snap.revision)||!item?.stableId){
  notify('Current Refresher state is unavailable. No policy was changed.');return}
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),drawer=el('div','drawer');
 drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');
 drawer.setAttribute('aria-label','Manage Refresher timing for '+item.slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const header=el('div','drawer-head');header.append(el('h2','drawer-title','Refresher · '+item.slug),b('Close',close));
 const body=el('div','drawer-body');
 body.append(el('p','setting-note',
  'These timings affect subsequent scheduling periods. Already accrued activity and source-save evidence are preserved.'));
 const active=el('input','form-input'),sleep=el('input','form-input');
 for(const [control,value] of [[active,item.activeMs],[sleep,item.sleepMs]]){
  control.type='number';control.min='1';control.max=String(365*24*60);control.step='1';
  control.value=Number.isFinite(value)?String(Math.round(value/60000)):'';
 }
 const aLabel=el('label','','Active period (minutes)'),sLabel=el('label','','Rest period (minutes)');
 aLabel.append(active);sLabel.append(sleep);body.append(aLabel,sLabel);
 const status=el('p','setting-note','No change submitted.');status.setAttribute('role','status');
 const save=b('Save generator timing',()=>void(async()=>{
  const m=Number(active.value),n=Number(sleep.value);
  if(!Number.isSafeInteger(m)||!Number.isSafeInteger(n)||m<1||n<1||
     m>525600||n>525600){
    status.textContent='Enter active and rest periods of 1 minute to 365 days.';return;}
  if(!window.confirm('Save this generator’s timing policy for subsequent Refresher periods?'))return;
  save.disabled=true;
  try{
   const result=await readPort('pcms-i12-refresher','SET_GENERATOR_POLICY',{
    expectedRevision:snap.revision,stableId:item.stableId,
    activeMs:m*60000,sleepMs:n*60000},16000);
   status.textContent=result?.ok?'Generator timing saved. Current period and remote evidence remain unchanged.':
     'Generator timing could not be saved; state may have changed. Reload before retrying.';
  }catch{status.textContent='Timing save outcome unconfirmed. Do not retry before refreshing state.'}
  await loadRefresher();save.disabled=false;
 })(),'btn primary');
 const pause=b(item.paused?'Resume this generator':'Pause this generator',()=>void(async()=>{
  const desired=!item.paused;
  if(!window.confirm(desired?'Pause scheduling for this generator?':'Resume guarded scheduling for this generator?'))return;
  pause.disabled=true;
  try{
   const result=await readPort('pcms-i12-refresher','SET_PAUSE',{
    expectedRevision:snap.revision,scope:'GENERATOR',target:item.stableId,paused:desired},16000);
   status.textContent=result?.ok?'Generator scheduling policy updated.':
      'Change not confirmed. Refresh state before retrying.';
  }catch{status.textContent='Change outcome uncertain; refresh before retrying.'}
  await loadRefresher();pause.disabled=false;
 })(),'btn small');
 const statistic=b('Request a new statistic',()=>void(async()=>{
  statistic.disabled=true;
  try{
   const result=await readPort('pcms-i12-refresher','DEMAND_STATISTIC',{
    expectedRevision:snap.revision,stableId:item.stableId},16000);
   status.textContent=result?.ok?
     'A read-only statistic observation was requested; a fresh provider result is not yet confirmed.':
     'Statistic request was not confirmed.';
  }catch{status.textContent='Statistic request status unknown; check again.'}
  await loadRefresher();statistic.disabled=false;
 })(),'btn small');
 const actions=el('div','form-foot');actions.append(save,pause,statistic);
 body.append(actions,status);
 drawer.append(header,body);overlay.append(drawer);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 active.focus();
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
 if(action==='create'){openGeneratorCreator();return}
 if(action==='sync-inventory'){void syncManagedInventories();return}
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
 if(action==='add-account'){void startAccountEnrollment();return}
 if(action==='feed-check'){guardedClick('pcms-refresher-reload');void loadRefresher();return}
 if(action==='edit-timing'){nativeAction('refresher',null,'pcms-refresher-active');return}
 if(action==='pause-refresher'){if(!guardedClick('pcms-refresher-global-pause'))return;notify('Pause request sent through the existing guarded controller; reload to verify.');void loadRefresher();return}
 if(action==='go-accounts'){routeTo('accounts');return}
 if(action==='queue-help'||action==='account-info'){notify('Detailed operational guidance is available in Advanced protected controls.');return}
 if(action.startsWith('check-service:')){state.settings='connections';void runReadiness(false);return}
 });
 root.addEventListener('click',event=>{const tab=event.target.closest('[data-filter]');if(tab){event.preventDefault();const [r,value]=tab.dataset.filter.split(':');if(r==='generators'){state.gen.filter=value;state.gen.offset=0;void loadGenerators()}if(r==='refresher'){state.ref.phase=value.toUpperCase();state.ref.offset=0;void loadRefresher()}if(r==='queue'){state.queue.filter=value;void loadQueue(true)}return}
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
 const snapshot=state.ref.snapshot;
 if(!snapshot?.ok||!Number.isSafeInteger(snapshot.revision)){
  notify('Current Refresher policy was not verified. No change was submitted.');return;
 }
 const next=!before;
 if(!window.confirm(next?
  'Enable guarded Refresher source saves? Each target still requires independently verified owner, protected route, source, qualified time and safety checks. Visibility is not guaranteed.':
  'Disable further scheduled Refresher source saves? In-flight uncertain effects remain held for reconciliation.'))return;
 try{
  const result=await readPort('pcms-i12-refresher','SET_POLICY',{
   expectedRevision:snapshot.revision,policy:{refreshEnabled:next}},15000);
  notify(result?.ok?'Refresher policy recorded; source saves and recent-list visibility require separate proof.':
    'Refresher setting was not confirmed. Reload the actual policy before retrying.');
 }catch{notify('Refresher outcome unconfirmed. Reload current state before retrying.')}
 await loadRefresher();
}

function statusPill(label,kind=''){const p=el('span','pill'+(kind?' '+kind:''),label);return p}
function tableRow(cells,itemIndex){const tr=el('tr');tr.tabIndex=itemIndex===0?0:-1;tr.dataset.itemIndex=String(itemIndex);tr.setAttribute('role','button');tr.setAttribute('aria-label','Inspect '+cells[0]);return tr}
const statusClasses={ACTIVE:'green',SLEEPING:'',WAITING:'',HELD:'red',INELIGIBLE:'',OBSERVED_OWNER:'green',OWNER_UNVERIFIED:'',OWNER_DISPUTED:'red'};
const ownerLabels={OBSERVED_OWNER:'Owner observed',OWNER_UNVERIFIED:'Owner unknown',OWNER_DISPUTED:'Disputed',UNOBSERVED:'Unobserved',IDENTITY_CONFLICT:'Identity conflict',OWNER_CONFLICT:'Account conflict'};
function rowsError(tableSelector,message,colspan){const body=shadow(tableSelector);if(!body)return;body.replaceChildren();const tr=el('tr'),td=el('td','pcms-unknown',message);td.colSpan=colspan;tr.append(td);body.append(tr)}
function setCounts(tabSelector,map){for(const tab of shadow('#page')?.querySelectorAll(tabSelector)||[]){const x=tab.dataset.filter?.split(':')[1];const num=tab.querySelector('.count');if(num)num.textContent=map[x]??'—'}}
function fmtObservation(item){if(item.observedAt&&Number.isFinite(item.observedAt)){const mins=Math.max(0,Math.floor((Date.now()-item.observedAt)/60000));return `${mins} min ago · historical`}return 'Not verified'}
// C-14/C-80: the accepted UI records durable intents through the same
// slug-coalescing coordinator as main-only Git discovery. Side effects are
// exclusively run later by the protected account/creation watcher.
function openGeneratorCreator(){
 const previous=root.activeElement,backdrop=el('div','drawer-overlay'),drawer=el('div','drawer');
 drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');
 drawer.setAttribute('aria-label','Create generators');
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Create generators'));
 const close=()=>{backdrop.remove();if(previous?.isConnected)previous.focus({preventScroll:true})};
 head.append(b('Close',close));drawer.append(head);
 const body=el('div','drawer-body');
 body.append(el('p','setting-note','Enter one or more generator names. PCMS uses your verified managed accounts and creates private generators only after the usual protected checks.'));
 const label=el('label','','Generator names (one per line)');
 const input=el('textarea','form-input');input.rows=6;input.placeholder='my-generator\nsecond-generator';
 label.append(input);body.append(label);
 const accountLabel=el('label','','Assign to account (optional)');
 const choice=el('select','select'),auto=el('option','','Automatic — balanced');auto.value='';
 choice.append(auto);
 for(const account of state.lastAccountList.filter(a=>a.state==='VERIFIED')){
  const option=el('option','',account.alias||account.accountId);
  option.value=account.accountId;choice.append(option);
 }
 accountLabel.append(choice);body.append(accountLabel);
 const status=el('p','setting-note','No creation request has been submitted.');status.setAttribute('role','status');
 const submit=b('Create private generators',()=>{
  const slugs=[...new Set(input.value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean))];
  if(!slugs.length||slugs.length>100||slugs.some(x=>!/^[a-z0-9][a-z0-9-]{0,99}$/.test(x))){
   status.textContent='Enter 1–100 valid lowercase generator names using letters, numbers and hyphens.';return;
  }
  const pinned=choice.value||null;submit.disabled=true;input.disabled=true;choice.disabled=true;
  status.textContent='Saving the creation requests. No unverified remote effects are being claimed.';
  void (async()=>{
   let accepted=0,uncertain=0;const rejected=[];
   for(const slug of slugs){
    const intentId='ui_'+crypto.randomUUID().replaceAll('-','');
    try{
     const out=await readPort('pcms-s00-coordinator','ACCEPT_CREATE_INTENT',{
      intentId,slug,origin:'OPERATOR',...(pinned?{accountId:pinned}:{})},20000);
     if(out?.ok&&out.record?.slug===slug)accepted++;
     else rejected.push(slug);
    }catch{uncertain++;}
   }
   status.textContent=accepted+' generator request(s) saved'+
     (uncertain?' · '+uncertain+' have unknown acknowledgment; do not resubmit until checked':'')+
     (rejected.length?' · '+rejected.length+' held':'')+
     '. Protected creation and Git association continue through the background queue.';
   try{await browser.alarms.create('pcms-s04-creation-followup',{when:Date.now()+1000})}catch{}
   await loadGenerators();submit.disabled=false;input.disabled=false;choice.disabled=false;
  })();
 },'btn primary');
 body.append(submit,status);drawer.append(body);backdrop.append(drawer);root.append(backdrop);
 backdrop.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)close()});
 input.focus();
}
async function syncManagedInventories(){
 const verified=state.lastAccountList.filter(a=>a.state==='VERIFIED');
 if(!verified.length){notify('No verified account is available for a protected inventory check.');return}
 notify('Checking owned inventory for '+verified.length+' verified account(s)…');
 let good=0,held=0;
 for(const account of verified){
  try{
   const out=await readPort('pcms-i04-inventory','SYNC_ACCOUNT',{
    accountId:account.accountId,expectedRevision:account.revision},100000);
   if(out?.ok)good++;else held++;
  }catch{held++;}
 }
 notify('Inventory check finished: '+good+' confirmed, '+held+
   ' unverified. No missing remote generator has been inferred.');
 await loadGenerators();
}
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
  right.append(b('Manage',()=>openAccountManager(item)));row.append(mark,data,right);list.append(row);
 }
 const pagination=shadow('.pagination span');if(pagination)pagination.textContent=state.errors.accounts?'Account read unavailable':`${displayed.length?offset+1:0}–${Math.min(offset+state.acct.perPage,displayed.length)} of ${displayed.length} matching local accounts`;
 const prev=shadow('[data-action="account-prev"]'),next=shadow('[data-action="account-next"]');if(prev)prev.disabled=state.acct.page===0;if(next)next.disabled=offset+state.acct.perPage>=displayed.length;
}
// The primary account interface issues only the same typed, revision-fenced
// commands as the original account controller. No route/Persona authority lives
// in the UI and status ACKs are never mistaken for finished remote effects.
async function startAccountEnrollment(){
 if(!window.confirm('Add a new managed account? PCMS will prepare a protected Persona and open the Perchance login tab when the route is ready.'))return;
 notify('Starting protected account setup…');
 try{
  const out=await readPort('pcms-i03-accounts','ADD_ACCOUNT',{},90000);
  notify(out?.ok?'Account setup started. Complete the login when prompted, then confirm it in Accounts.':
    'Account setup could not start. Review the account and protected route status.');
 }catch{notify('Account setup could not be confirmed. Check the Accounts list before retrying.');}
 await loadAccounts();
}
function openAccountManager(item){
 const previous=root.activeElement;
 const overlay=el('div','drawer-overlay'),dialog=el('div','drawer');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Manage protected account');
 const header=el('div','drawer-head'),title=el('h2','drawer-title','Account management'),actions=el('div','form-foot');
 const status=el('p','setting-note','Operations use the existing protected Persona and current account revision.');
 function close(){overlay.remove();if(previous?.isConnected)previous.focus({preventScroll:true})}
 header.append(title,b('Close',close));
 const body=el('div','drawer-body'),meta=el('dl');
 for(const [label,value] of [['Account',item.accountId],['State',item.state||'Unknown'],
   ['Persona',item.personaUid||'Not observed'],['Route',item.protectedRoute||'Not verified']]){
  const row=el('div','kv');row.append(el('dt','',label),el('dd','',value));meta.append(row);
 }
 body.append(meta,status);
 const allowed={
  'Open login':'OPEN_LOGIN','Confirm login':'CONFIRM_LOGIN',
  'Check protected route':'VERIFY_ROUTE','Sync generator inventory':'SYNC_ACCOUNT',
  'Resume setup':'RESUME_SETUP','Reactivate':'REACTIVATE',
  'Archive':'ARCHIVE'};
 async function execute(kind){
  if(kind==='ARCHIVE'&&!window.confirm('Archive this account? PCMS preserves its Persona, source history and remote generators. Unfinished external effects must still be reconciled.'))return;
  if(kind==='REACTIVATE'&&!window.confirm('Reactivate this archived account? PCMS will reverify its protected route and owner before resuming affected work.'))return;
  const buttonList=[...actions.querySelectorAll('button')];buttonList.forEach(b=>b.disabled=true);
  status.textContent=kind==='OPEN_LOGIN'?'Opening the protected login tab…':
    'Checking the current account and applying the requested action…';
  try{
   const params={accountId:item.accountId,expectedRevision:item.revision};
   if(kind==='REACTIVATE')params.explicitReactivation=true;
   const out=await readPort(kind==='SYNC_ACCOUNT'?'pcms-i04-inventory':'pcms-i03-accounts',
     kind,params,kind==='CONFIRM_LOGIN'||kind==='SYNC_ACCOUNT'?100000:45000);
   if(out?.ok){
    status.textContent=kind==='CONFIRM_LOGIN'&&out.state==='VERIFIED'?
      'Login identity confirmed and saved. Refresh Accounts for current inventory.':
      kind==='OPEN_LOGIN'?'Protected login tab requested. Return here after logging in.':
      kind==='SYNC_ACCOUNT'?'Inventory read finished under the account’s protected route.':
      'Request recorded. Its completion is tracked separately from this acknowledgment.';
    notify(status.textContent);
   }else{
    status.textContent='The action was not confirmed. '+(
      typeof out?.message==='string'?out.message:
      'Check account status and prerequisites before retrying.');
   }
  }catch{status.textContent='The outcome is uncertain. Refresh Accounts before another action.';}
  finally{await loadAccounts();buttonList.forEach(b=>b.disabled=false);}
 }
 const menu=item.state==='ARCHIVED'?
   ['Reactivate']:item.state==='PREPARING'?
   ['Resume setup','Check protected route']:
   ['Open login','Confirm login','Check protected route','Sync generator inventory','Archive'];
 for(const label of menu){
  const button=b(label,()=>void execute(allowed[label]),'btn small');
  if(label==='Sync generator inventory'&&item.state!=='VERIFIED')button.disabled=true;
  actions.append(button);
 }
 body.append(actions);dialog.append(header,body);overlay.append(dialog);root.append(overlay);
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key==='Tab'){
   const controls=[...dialog.querySelectorAll('button:not(:disabled)')],index=controls.indexOf(root.activeElement);
   if(event.shiftKey&&index===0){event.preventDefault();controls.at(-1)?.focus();}
   else if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0]?.focus();}
  }
 });
 overlay.addEventListener('click',event=>{if(event.target===overlay)close()});
 header.querySelector('button')?.focus({preventScroll:true});
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
  const serverPhase=['ALL','ACTIVE','SLEEPING','WAITING','HELD','INELIGIBLE'].includes(phase)?phase:'ALL';
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
 const items=state.ref.items;
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
 if(!items.length)rowsError('.ref-table-scroll tbody','No matching locally managed generators in this fleet-wide filter. Remote status unknown.',4);
 text('.ref-table-heading .muted',safeCount(res.total)+' matching');
 const s=shadow('.ref-pagination span');if(s)s.textContent=`${res.total?state.ref.offset+1:0}–${Math.min(state.ref.offset+state.ref.limit,res.total)} of ${res.total} · canonical fleet-filtered local records`;
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
   guardedRead('pcms-i02-canonical-readonly','NOTICE_SUMMARY'),
   guardedRead('pcms-i13-release','LIST_REVIEW',{after:'',limit:40})
     .catch(()=>({ok:false,items:[]})),
   guardedRead('pcms-r4-folder-identity','LIST')
     .catch(()=>({ok:false,items:[],missingFolders:[]}))
 ];
 try{
  const [ops,notices,summary,noticeTotals,releases,identities]=await Promise.all(requested);
  if(state.route!=='work-queue'||q.epoch!==epoch)return;
  q.operations=ops.items||[];q.incidents=notices.items||[];
  q.nextOps=ops.more?ops.next:null;q.nextNotices=notices.more?notices.next:null;
  q.more=Boolean(ops.more||notices.more);q.summary={...summary,attention:noticeTotals};
  q.releaseItems=releases?.ok?(releases.items||[]):[];
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
  if(q.filter==='Needs action'||q.filter==='All'||q.filter==='Waiting')
   for(const candidate of q.releaseItems.filter(x=>q.filter==='All'||
      q.filter==='Waiting'?x.state!=='CONFIRMED_PUBLIC':
        ['READY_FOR_REVIEW','EXCEPTION_READY_FOR_REVIEW','BLOCKED','WAITING_FOR_GIT'].includes(x.state))){
    if(q.query&&!candidate.slug.includes(q.query.toLowerCase()))continue;
    const row=el('div','queue-item');const detail=el('div','row-body');
    detail.append(el('strong','',candidate.slug),
      el('p','setting-note',candidate.state==='READY_FOR_REVIEW'?
        'Final tested source is ready for individual publication review.':
        candidate.state==='EXCEPTION_READY_FOR_REVIEW'?
        'Exceptional candidate — manual evidence and incomplete tests require individual review.':
        'Candidate state: '+candidate.state.replaceAll('_',' ').toLowerCase()));
    const action=b('Review candidate',()=>void openReleaseReview(candidate.slug),'btn small');
    if(!['READY_FOR_REVIEW','EXCEPTION_READY_FOR_REVIEW'].includes(candidate.state))
      action.disabled=true;
    row.append(el('span','row-mark', '•'),detail,action);holder.append(row);
   }
  for(const n of q.incidents){
   const row=el('div','queue-item');
   const marker=el('span','row-mark warn');marker.append(icon('alert'));
   const detail=el('div','row-body');
   const header=el('div','queue-head');
   const issueTitle={
    GIT_FOLDER_MISSING:'GitHub source folder missing',
    GIT_FOLDER_RENAME_REVIEW:'Possible source-folder rename',
    GIT_RECONNECT_REQUIRED:'GitHub connection needs attention',
    ROUTE_UNAVAILABLE:'Protected account route unavailable',
    ACCOUNT_UNVERIFIED:'Account identity needs verification',
    SOURCE_HELD:'Source needs verification',
    RESTORE_IN_PROGRESS:'Restore awaiting reconciliation',
    CANONICAL_UNAVAILABLE:'Local records unavailable',
    OPERATION_UNCERTAIN:'Operation outcome uncertain',
    PROVIDER_OUTAGE:'Provider connection interrupted',
    BACKUP_FAILED:'Encrypted backup needs attention'
   }[n.code]||'An operational issue needs review';
   header.append(el('strong','',issueTitle),
     statusPill(n.reviewed?'Reviewed — still active':'Needs attention','amber'));
   detail.append(header,el('div','row-meta',
     'Recorded local issue · '+(Number.isFinite(n.lastAt)?new Date(n.lastAt).toLocaleString():'time not recorded')));
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
     'Protected operation'+(Number.isFinite(op.updatedAt)?
      ' · last recorded '+new Date(op.updatedAt).toLocaleString():
      ' · last update not recorded')));
   const action=b('Inspect',()=>openOperationRecord(op));
   row.append(marker,detail,action);holder.append(row);
  }
  if(!holder.children.length)
    renderEmpty(holder,'No matching recorded operations or active incidents. This is not proof of remote health.');
 }
 const counts=q.summary?.states||{},attention=q.summary?.attention?.counts||{};
 const needs=(counts.HELD_UNCERTAIN||0)+(counts.REJECTED||0)+(counts.DISPATCH_POSSIBLE||0)+
   (q.reviews||[]).filter(x=>x.state==='REVIEW_REQUIRED').length+
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
// Human publication review: sealed source evidence and exact candidate
// fingerprint are provided by the protected release boundary. The UI cannot
// invent PASS, bypass source/route checks or publish from a review ACK.
async function openReleaseReview(slug){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),dialog=el('div','drawer');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Review exact candidate for '+slug);
 const close=()=>{overlay.remove();if(previous?.isConnected)previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Review '+slug),b('Close',close));
 dialog.append(head);
 const body=el('div','drawer-body'),status=el('p','setting-note','Verifying the exact final candidate and tests…');
 status.setAttribute('role','status');body.append(status);dialog.append(body);overlay.append(dialog);root.append(overlay);
 head.querySelector('button')?.focus();
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 let view;
 try{view=await readPort('pcms-i13-release','PREVIEW',{slug},95000)}
 catch{status.textContent='Review cannot open until secure GitHub access and source evidence are available.';return}
 if(!overlay.isConnected)return;
 if(!view?.ok){status.textContent='The final source is not currently eligible for review. No approval or publication was attempted.';return}
 status.textContent=view.mode==='INDIVIDUAL_EXCEPTIONAL_MANUAL_REVIEW'?
  'Exceptional manual review: AI testing is not fully verified.':
  'Candidate source, test results and Git revision verified for this review snapshot.';
 const summary=el('dl');
 for(const [label,value] of [['Candidate source',view.sourceFingerprint],
   ['Previous source',view.previousFingerprint],['Pinned Git main',view.gitHead],
   ['Testing result',view.tests?.state||'Unverified'],['Publication', 'Not yet approved']]){
  const pair=el('div','kv');pair.append(el('dt','',label),el('dd','',value));summary.append(pair);
 }
 body.append(summary);
 const checks=el('div','');
 checks.append(el('h3','','Required test observations'));
 for(const t of [...(view.tests?.default||[]),...(view.tests?.optional||[])]){
  checks.append(el('p','setting-note',t.name+' — '+(t.result||'UNVERIFIED')));
 }
 body.append(checks,el('h3','','Full-source change manifest'));
 const changes=el('div','queue-list'),seen=new Set();
 const changedPaths=new Set((view.diff||[]).map(x=>x.path).filter(Boolean));
 for(const file of view.files||[]){
  const row=el('div','queue-item');
  const label=el('span','',file.path+' · '+file.size+' bytes'+
    (changedPaths.has(file.path)?' · changed':' · unchanged'));
  const inspect=b('Read exact file',()=>void (async()=>{
   inspect.disabled=true;
   let bytes=[],next=0,total=0,error=false;
   do{
    let r;
    try{r=await readPort('pcms-i13-release','GET_REVIEW_CHUNK',{
      slug,stageRevision:view.stageRevision,fingerprint:view.sourceFingerprint,
      origin:'F',path:file.path,offset:next},30000)}
    catch{error=true;break}
    if(!r?.ok||r.fileSha256!==file.sha256){error=true;break}
    const data=Uint8Array.from(atob(r.base64),x=>x.charCodeAt(0));
    bytes.push(data);total+=data.length;next=r.nextOffset;
    if(total>16*1024*1024){error=true;break}
   }while(next!==null);
   if(error){notify('Exact file read could not be confirmed. Approval remains a separate decision.');inspect.disabled=false;return}
   const data=new Uint8Array(total);let offset=0;
   for(const part of bytes){data.set(part,offset);offset+=part.length}
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)))
     .map(x=>x.toString(16).padStart(2,'0')).join('');
   if(digest!==file.sha256){notify('File bytes did not match verified source fingerprint.');inspect.disabled=false;return}
   seen.add(file.path);
   const details=el('pre','source-preview');
   details.textContent=/\.(?:pjs|html|js|css|md|json|txt)$/i.test(file.path)?
     new TextDecoder().decode(data):'Binary file verified: SHA-256 '+digest;
   row.append(details);inspect.textContent='Verified and viewed';inspect.disabled=true;
  })(),'btn small');
  row.append(label,inspect);changes.append(row);
 }
 body.append(changes);
 const footer=el('div','form-foot');
 const instructions=el('textarea','form-input');instructions.rows=3;
 instructions.placeholder='Optional request: describe changes needed to the tested candidate';
 instructions.setAttribute('aria-label','Request changes to candidate');
 const requestChanges=b('Request changes',()=>void (async()=>{
  if(instructions.value.trim().length<3)return;
  const message=instructions.value.trim();
  if(!window.confirm('Request these changes? The current candidate will no longer be eligible for unchanged publication approval.'))return;
  try{
   const r=await readPort('pcms-i13-release','REQUEST_CHANGES',{
    slug,expectedStageRevision:view.stageRevision,expectedJobRevision:view.jobRevision,
    sourceFingerprint:view.sourceFingerprint,instructions:message,
    ...(view.releaseRevision?{releaseRevision:view.releaseRevision}:{})},95000);
   status.textContent=r?.ok?'Changes requested. New tested source needs fresh individual review.':
      'Request was not confirmed. Keep the candidate held.';
  }catch{status.textContent='Change request outcome unconfirmed; check the candidate record.'}
 })(),'btn small');
 const checkLabel=el('label','setting-option'),ack=el('input');ack.type='checkbox';
 checkLabel.append(ack,document.createTextNode(' I inspected the exact source changes and required test results for this candidate.'));
 const approve=b('Approve exact candidate',()=>void (async()=>{
  if(!ack.checked){status.textContent='Review the exact source and tests, then check the approval box.';return}
  if(!window.confirm('Approve this exact tested candidate for publication? This does not bypass independent provider checks and does not itself publish.'))return;
  approve.disabled=true;
  try{
   const r=await readPort('pcms-i13-release','APPROVE',{
    slug,expectedStageRevision:view.stageRevision,expectedJobRevision:view.jobRevision,
    fingerprint:view.sourceFingerprint,explicitApproval:true},95000);
   status.textContent=r?.ok?'Exact candidate approval recorded. Publication remains subject to protected final checks.':
     'Approval was not confirmed. The candidate remains held until independently checked.';
  }catch{status.textContent='Approval outcome uncertain. Check the current release record before retrying.'}
  await loadQueue(true);
 })(),'btn primary');
 footer.append(requestChanges,approve);body.append(instructions,checkLabel,footer);
}
// An operation inspector is a read-only projection. A possible dispatched
// effect cannot be retried from this drawer, even after browser restart.
function openOperationRecord(op){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),dialog=el('div','drawer');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Recorded operation details');
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const header=el('div','drawer-head');
 header.append(el('h2','drawer-title','Operation · '+(queueState[op.status]?.[0]||'Unverified')),b('Close',close));
 const body=el('div','drawer-body'),fields=el('dl');
 for(const [name,value] of [['Target',op.targetId],['Operation',op.operationId],
  ['Type',op.effectType||'Unknown'],['State',op.status||'Unknown'],
  ['Revision',String(op.revision??'Unknown')],
  ['Updated',Number.isSafeInteger(op.updatedAt)?new Date(op.updatedAt).toLocaleString():'Not recorded']]){
  const row=el('div','kv');row.append(el('dt','',name),el('dd','',value));fields.append(row);
 }
 body.append(fields);
 const help={
  PREPARED:'This operation is reserved locally. It has not been dispatched. Check account, route, permissions and scheduling before expecting a remote change.',
  DISPATCH_POSSIBLE:'A remote effect may already have occurred. Do not retry. Reconcile the exact target using an independent provider readback.',
  OBSERVING:'The runtime is verifying the remote result. An acknowledgment alone does not confirm the effect.',
  HELD_UNCERTAIN:'The effect outcome is uncertain. It remains fenced; use the matching protected workflow’s reconciliation action, not a retry.',
  CONFIRMED:'The operation journal records an independently verified equivalent result. Review the exact source or listing separately if needed.',
  ABORTED:'The operation ended before dispatch. No remote effect was authorized by this record.',
  REJECTED:'The controller rejected the operation. Check current prerequisites and latest canonical state before creating a new request.'
 };
 body.append(el('p','setting-note',help[op.status]||
  'State is not recognized; keep all remote effects held until the runtime is checked.'));
 const actions=el('div','form-foot');
 actions.append(b('View current queue',()=>{close();void loadQueue(true)},'btn small'));
 body.append(actions);dialog.append(header,body);overlay.append(dialog);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 header.querySelector('button')?.focus();
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
 const epoch=state.renderEpoch;
 const cards=[...page().querySelectorAll('.stat-grid .stat-card')];
 for(const [i,label] of ['Managed generators','Refresher','Work requiring attention','Last verified backup'].entries())
  cards[i]?.querySelector('.stat-label')?.replaceChildren(document.createTextNode(label));
 function stat(index,value,note){
  const card=cards[index];if(!card)return;
  const valueNode=card.querySelector('.stat-value');if(valueNode)valueNode.textContent=value;
  const caption=card.querySelector('.stat-note');if(caption)caption.textContent=note;
 }
 for(let i=0;i<4;i++)stat(i,'—','Verification unavailable');
 const blocks=[...page().querySelectorAll('.overview-grid .overview-card')];
 blocks.forEach(b=>{const target=b.querySelector('.panel-scroll');
  if(target)renderEmpty(target,'Reading recorded activity…')});
 const still=()=>state.route==='overview'&&state.renderEpoch===epoch;
 void Promise.allSettled([
  inventory({offset:0,limit:1}),
  refresher({phase:'ALL',offset:0,limit:1}),
  guardedRead('pcms-i02-canonical-readonly','SUMMARY'),
  guardedRead('pcms-i02-canonical-readonly','NOTICE_SUMMARY'),
  guardedRead('pcms-i02-canonical-readonly','LIST_OPERATION_PAGE',{limit:8,status:'NEEDS_ACTION'}),
  guardedRead('pcms-i02-canonical-readonly','LIST_NOTICE_PAGE',{limit:8}),
  guardedRead('pcms-i02-canonical-readonly','LIST_OPERATION_PAGE',{limit:8,status:'RUNNING'})
 ]).then(results=>{
  if(!still())return;
  const val=i=>results[i].status==='fulfilled'&&results[i].value?.ok?results[i].value:null;
  const inv=val(0),ref=val(1),summary=val(2),noticeTotals=val(3),ops=val(4),inc=val(5),running=val(6);
  stat(0,inv?.total===undefined?'—':String(inv.total),'Historical local inventory; not a live provider census');
  stat(1,ref?.ok?String(ref.occupied??'—'):'—',
    ref?.ok?'Currently occupied Refresher slots; provider visibility is separate':'Refresher state unavailable');
  const counts=summary?.states,attention=noticeTotals?.counts;
  const need=counts?(counts.HELD_UNCERTAIN||0)+(counts.REJECTED||0)+
    (counts.DISPATCH_POSSIBLE||0)+(attention?.actionRequired||0)+(attention?.serious||0):null;
  stat(2,need===null?'—':String(need),
    need===null?'Incident journal unavailable':'Recorded local holds and incidents');
  const listRows=(index,items)=>{
   const panel=blocks[index]?.querySelector('.panel-scroll');if(!panel)return;
   panel.replaceChildren();
   if(!items?.length){renderEmpty(panel,'No matching local operation records observed.');return}
   for(const x of items){
    const row=el('div','list-row');row.append(
     el('span','row-mark',x.severity?'!':'•'));
    const body=el('div','row-body');
    body.append(el('p','row-title',x.severity?
      'Incident: '+x.code.replaceAll('_',' ').toLowerCase():
      (x.effectType||'Recorded operation').replaceAll('_',' ')),
      el('div','row-meta',x.severity?'Still requires review':
        'Target '+x.targetId+' · '+(queueState[x.status]?.[0]||'Unknown status')));
    row.append(body,b('Open Work Queue',()=>routeTo('work-queue')));panel.append(row);
   }
  };
  listRows(0,[...(inc?.items||[]),...(ops?.items||[])].slice(0,8));
  listRows(1,running?.items||[]);
  for(const panel of blocks.slice(2)){const holder=panel.querySelector('.panel-scroll');
   if(holder){holder.replaceChildren();renderEmpty(holder,'No independent local proof has been loaded for this section.')}}
  // A native host or downloaded archive being present does not establish
  // an independently verified and recoverable backup.
  stat(3,'—','Independent backup/restore evidence not loaded');
  state.queue.summary=summary?.ok?{...summary,attention:noticeTotals}:null;updateNav();
 });
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
    'PCMS local services are not responding. Install the native helpers from the matching PCMS release bundle, restart Firefox, then check again. Read-only inventory may still work.':
    pending?'A previous GitHub connection did not finish. Review and reconcile it before running full diagnostics.':
    'Readiness checked. Review any items that need attention; a local check does not prove live service operations.';
 }
 section.append(summary);
 const details=el('details','settings-section');
 const rows=state.readiness?.rows||[];
 const problematic=rows.filter(row=>
   ['UNREACHABLE','OUTCOME_UNCERTAIN','SECURITY_HELD','STALE','MISSING_CAPABILITY'].includes(row.state));
 const heading=el('summary','',
   'Detailed checks · '+rows.length+' inspected · '+problematic.length+' need attention');
 details.append(heading);
 const results=el('div','queue-list');
 for(const r of rows){
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
 details.append(results);section.append(details);container.append(section);
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
function primarySettingCard(container,title,intro){
 const section=el('section','card settings-group'),header=el('h2','h2',title);
 section.append(header,el('p','setting-note',intro));container.append(section);
 return section;
}
function primaryConnections(container){
 const section=primarySettingCard(container,'GitHub connection',
  'PCMS reads generator folders from the committed main branch only. A repository preview is not a saved connection.');
 const repo=el('input','form-input');repo.value='Neb963/per-gens';repo.readOnly=true;
 repo.setAttribute('aria-label','Managed GitHub repository');
 const credential=el('input','form-input');credential.type='password';
 credential.autocomplete='off';credential.placeholder='GitHub access credential';
 credential.setAttribute('aria-label','GitHub access credential');
 const status=el('p','setting-note','No authenticated read-only verification has run in this session.');
 status.setAttribute('role','status');
 const actions=el('div','form-foot');
 const begin= b('Connect securely',()=>void (async()=>{
  if(!credential.value){status.textContent='Enter your GitHub credential first.';return}
  const token=credential.value;credential.value='';begin.disabled=true;
  try{
   const out=await readPort('pcms-s03-catalog','CONNECT_GIT',
      {repository:repo.value,token},30000);
   status.textContent=out?.ok?'Secure GitHub connection saved. Check files from main before any import.':
     out?.code==='GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED'?
     'A previous setup did not finish. Check the recovery section below before entering a new credential.':
     'The secure connection could not be confirmed. Check local PCMS services in the readiness section.';
  }catch{status.textContent='Connection result uncertain. Check readiness before attempting another connection.'}
  finally{begin.disabled=false}
 })(),'btn primary');
 const inspect=b('Read main safely',()=>void (async()=>{
  inspect.disabled=true;status.textContent='Reading the committed main inventory…';
  try{
   const out=await readPort('pcms-s03-catalog','SCAN_CONNECTED',{},95000);
   status.textContent=out?.ok&&out.complete?
     out.recognizedCount+' recognized generator folder(s) on main. Account ownership, publication and deployment remain separate checks.':
     'The committed main inventory could not be verified. No deletion or missing folder has been inferred.';
  }catch{status.textContent='GitHub read-only scan unavailable. No remote changes were made.'}
  finally{inspect.disabled=false}
 })(),'btn small');
 actions.append(begin,inspect);section.append(repo,credential,actions,status);
}
function primaryAutomation(container){
 const section=primarySettingCard(container,'Standing permissions',
  'You control whether protected development and tested-source writeback are permitted. Publication always requires approval of the exact candidate.');
 const feedback=el('p','setting-note','Checking the current repository permissions…');
 const fields=el('div','');
 const actions=el('div','form-foot');section.append(fields,actions,feedback);
 const controls={};
 async function load(){
  fields.replaceChildren();actions.replaceChildren();
  let state;
  try{state=await readPort('pcms-s06-authority','GET',{},18000)}
  catch{feedback.textContent='Permissions could not be read. Nothing has been enabled.';return}
  if(!state?.ok){feedback.textContent='Permissions are not available. No changes made.';return}
  const rec=state.record;
  feedback.textContent=rec.repositoryId?
   'Permissions apply only to the verified connected GitHub repository.':
   'Connect and verify GitHub before enabling any protected workflow.';
  for(const [key,title] of [['development','Protected development'],['gitWrite','Verified source writeback'],['publication','Approved publication only']]){
   const label=el('label','setting-option');const input=el('input');
   input.type='checkbox';input.checked=rec.grants?.[key]===true;
   input.disabled=!rec.repositoryId;
   label.append(input,document.createTextNode(' '+title));fields.append(label);controls[key]=input;
  }
  const save=b('Save permissions',()=>void (async()=>{
   if(!rec.repositoryId)return;
   const grants=Object.fromEntries(Object.keys(controls).map(k=>[k,controls[k].checked]));
   if(!window.confirm('Apply these repository-scoped permissions? Protected route, source and publication checks still apply independently.'))return;
   save.disabled=true;feedback.textContent='Saving permissions…';
   try{
    const out=await readPort('pcms-s06-authority','SET',{
      repositoryId:rec.repositoryId,expectedRevision:rec.revision,
      grants,consent:'I AUTHORIZE PROTECTED PCMS OPERATIONS'},18000);
    feedback.textContent=out?.ok?'Permissions updated. Protected checks still apply.':
      'Permissions were not updated. Recheck the current configuration before retrying.';
   }catch{feedback.textContent='Update not confirmed. Review current permissions before another change.'}
   finally{save.disabled=false;await load()}
  })(),'btn primary');
  save.disabled=!rec.repositoryId;
  actions.append(save,b('Pause all managed effects',()=>void (async()=>{
   if(!window.confirm('Immediately revoke all standing permissions? In-flight uncertain writes remain held for reconciliation.'))return;
   try{const out=await readPort('pcms-s06-authority','REVOKE',{},18000);
    feedback.textContent=out?.ok?'Permissions revoked.':'Revocation result unconfirmed; check status.'}
   catch{feedback.textContent='Revocation status uncertain; check permissions.'}
   await load();
  })(),'btn small'));
 }
 void load();
}
function backupAction(action,extra={}){
 return new Promise((resolve,reject)=>{
  const port=browser.runtime.connect({name:'pcms-i15-backup'});
  let done=false;const timer=setTimeout(()=>finish(null,new Error('TIMEOUT')),40000);
  function finish(value,error){if(done)return;done=true;clearTimeout(timer);try{port.disconnect()}catch{}error?reject(error):resolve(value)}
  port.onMessage.addListener(value=>finish(value));
  port.onDisconnect.addListener(()=>finish(null,new Error('DISCONNECTED')));
  try{port.postMessage({action,...extra})}catch{finish(null,new Error('DISCONNECTED'))}
 });
}
// Native AI progression is governed by the same revisioned prompt and
// per-account concurrency limits used by the protected job controller.
// This is local guidance; the repository's default Chat 1 prompt stays
// independently authoritative and is never overwritten here.
function primaryAiSettings(container){
 const section=primarySettingCard(container,'AI development settings',
  'Configure local development guidance and per-account concurrency. These settings do not modify the GitHub default Chat 1 prompt, enable a provider effect or certify a test PASS.');
 const feedback=el('p','setting-note','Loading the current AI settings…');
 feedback.setAttribute('role','status');
 const editor=el('textarea','form-input');editor.rows=8;editor.maxLength=16000;
 editor.setAttribute('aria-label','AI development guidance');
 const testLabel=el('label','','Required test names (one per line)');
 const tests=el('textarea','form-input');tests.rows=4;
 tests.setAttribute('aria-label','Required test names');testLabel.append(tests);
 const countLabel=el('label','','Maximum concurrent AI tasks per verified account');
 const count=el('input','form-input');count.type='number';count.min='1';count.max='4';count.step='1';
 countLabel.append(count);
 const actions=el('div','form-foot'),save=b('Save guidance and tests',()=>void(async()=>{
  const names=tests.value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
  if(!names.length||names.length>64||new Set(names).size!==names.length||
   names.some(x=>!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(x))||
   !editor.value.trim()||editor.value.length>16000){
   feedback.textContent='Enter guidance and 1–64 distinct valid required test names.';return}
  const current=state.aiCurrentPrompt;if(!current){feedback.textContent='Prompt revision unavailable. Reload current settings.';return}
  if(!window.confirm('Replace local AI guidance for future jobs? Existing job candidates and the GitHub prompt remain unchanged.'))return;
  save.disabled=true;
  try{
   const out=await readPort('pcms-i10-ai','SET_PROMPT',{
    text:editor.value,tests:names,expectedRevision:current.revision},16000);
   feedback.textContent=out?.ok?'Local guidance saved for new jobs; recorded tests still require independent execution.':
      'Guidance could not be saved. Reload the current revision before retrying.';
  }catch{feedback.textContent='Guidance update outcome uncertain. Read current revision before retrying.'}
  finally{save.disabled=false;void refresh()}
 })(),'btn primary');
 const saveLimit=b('Save concurrency',()=>void(async()=>{
  const n=Number(count.value),existing=state.aiConcurrency;
  if(!existing||!Number.isSafeInteger(n)||n<1||n>4){
   feedback.textContent='Choose 1–4 tasks per account and reload current settings.';return}
  if(!window.confirm('Change the protected per-account AI concurrency limit? Current owner, route and source safety controls still apply.'))return;
  saveLimit.disabled=true;
  try{
   const out=await readPort('pcms-i10-ai','SET_CONCURRENCY',{
    perAccount:n,expectedRevision:existing.revision},16000);
   feedback.textContent=out?.ok?'Concurrency limit saved. Existing running effects remain independently fenced.':
    'Concurrency change could not be confirmed; reload the current revision.';
  }catch{feedback.textContent='Concurrency update outcome uncertain. Reload before retrying.'}
  finally{saveLimit.disabled=false;void refresh()}
 })(),'btn small');
 actions.append(save,saveLimit);
 const form=el('div','form-stack');
 form.append(el('label','','Local AI guidance'),editor,testLabel,countLabel,actions,feedback);
 section.append(form);
 async function refresh(){
  const result=await Promise.allSettled([
   readPort('pcms-i10-ai','GET_PROMPTS',{},20000),
   readPort('pcms-i10-ai','GET_CONCURRENCY',{},20000)
  ]);
  if(!section.isConnected)return;
  const prompt=result[0].status==='fulfilled'&&result[0].value?.ok?result[0].value:null;
  const concurrency=result[1].status==='fulfilled'&&result[1].value?.ok?result[1].value:null;
  state.aiCurrentPrompt=prompt?.current||null;state.aiConcurrency=concurrency?.setting||null;
  if(prompt?.current){
   editor.value=prompt.current.text;tests.value=(prompt.current.tests||[]).join('\n');
  }
  if(concurrency?.setting)count.value=String(concurrency.setting.perAccount);
  save.disabled=!prompt?.current;saveLimit.disabled=!concurrency?.setting;
  feedback.textContent=prompt?.current&&concurrency?.setting?
   'Current local guidance revision '+prompt.current.revision+
   '; maximum '+concurrency.setting.perAccount+' parallel job(s) per account. No test outcome inferred.':
   'AI settings could not be read. Changes remain unavailable until the canonical runtime responds.';
 }
 void refresh();
}
function primaryBackups(container){
 const section=primarySettingCard(container,'Encrypted source-complete backups',
  'The recoverable format requires the matching OS helper, a vault-held recovery key, full archive verification and a separate restore proof. Older browser downloads are not source-complete.');
 const status=el('p','setting-note','Reading the actual backup state…');status.setAttribute('role','status');
 const actions=el('div','form-foot'),setup=el('div','form-stack');
 section.append(setup,actions,status);
 const secretLabel=el('label','','Recovery passphrase (stored in the OS vault, not PCMS settings)');
 const secret=el('input','form-input');secret.type='password';secret.autocomplete='new-password';
 secret.placeholder='Enter recovery passphrase';secretLabel.append(secret);setup.append(secretLabel);
 const saveKey=b('Store recovery key securely',()=>void(async()=>{
  const key=secret.value;secret.value='';
  if(new TextEncoder().encode(key).length<12||new TextEncoder().encode(key).length>4096){
   status.textContent='Enter a valid recovery passphrase of at least 12 bytes.';return}
  saveKey.disabled=true;
  try{
   const out=await backupAction('STORE_VAULT',{passphrase:key});
   status.textContent=out?.ok?
     'Passphrase stored in the OS keyring. Preserve your separate recovery copy; this is not a verified backup.':
     'Could not confirm secure key storage. Check the installed native helper and OS keyring.';
  }catch{status.textContent='Key storage result uncertain. Check the OS helper before retrying.'}
  finally{saveKey.disabled=false}
 })(),'btn small');
 setup.append(saveKey);
 const selectFormat=b('Select source-complete archive',()=>void(async()=>{
  selectFormat.disabled=true;
  try{
   const out=await backupAction('SET_FORMAT',{format:'V2'});
   status.textContent=out?.ok&&out.format==='V2'?
    'Source-complete format selected. A successful archive and a verified restore are still required.':
    'The source-complete format could not be enabled. Verify the V2 helper and saved recovery key.';
  }catch{status.textContent='Native backup format could not be confirmed. No downgrade was attempted.'}
  finally{selectFormat.disabled=false;void refresh()}
 })(),'btn small');
 actions.append(selectFormat);
 async function refresh(){
  let s;try{s=await backupAction('STATUS')}catch{}
  if(!section.isConnected)return;
  if(!s?.ok){
   status.textContent='Backup service unavailable. Install the matching native helpers from the operator package.';
   return;
  }
  const genuine=s.format==='V2'&&s.tier===3&&s.proof==='NATIVE_READONLY_SOURCE_RECOVERY';
  status.textContent='Scheduled backup: '+(s.enabled?'on':'off')+
   '. Format: '+(s.format==='V2'?'source-complete':'legacy download — not source-complete')+
   '. Independent archive recovery: '+(genuine?'verified archive exists':'not verified')+'.';
  actions.querySelector('[data-backup-toggle]')?.remove();
  actions.querySelector('[data-backup-manual]')?.remove();
  const toggle=b(s.enabled?'Disable scheduled backups':'Enable scheduled backups',()=>void(async()=>{
   if(!s.enabled&&s.format!=='V2'){
    status.textContent='Select and verify the source-complete format before enabling the schedule.';return;}
   if(!window.confirm(s.enabled?
     'Disable future backups? Existing encrypted archives will be retained.':
     'Enable scheduled source-complete encrypted backups? The native helper and OS recovery key are required.'))return;
   toggle.disabled=true;
   try{
    const out=await backupAction('ENABLE',{enabled:!s.enabled});
    status.textContent=out?.ok?'Scheduled backup policy updated. Independent archive verification remains separate.':
     'The backup setting was not confirmed. Read its current state before retrying.';
   }catch{status.textContent='Backup policy outcome uncertain; check state before retrying.'}
   finally{toggle.disabled=false;void refresh()}
  })(),'btn small');toggle.dataset.backupToggle='1';toggle.disabled=!s.enabled&&s.format!=='V2';
  const manual=b('Run source-complete backup',()=>void(async()=>{
   if(s.format!=='V2')return;
   if(!window.confirm('Create one encrypted source-complete backup now? This can read protected account/source data but does not change remote generators.'))return;
   manual.disabled=true;status.textContent='Running source-complete backup and independent encrypted archive verification…';
   try{
    const out=await backupAction('RUN_V2_MANUAL');
    status.textContent=out?.ok&&out.state==='RECOVERY_VERIFIED'?
     'Encrypted archive created and independently recovered in the native host. Fresh-profile restore still needs separate proof.':
     'The backup could not be independently recovered. Treat the last attempt as held until investigated.';
   }catch{status.textContent='Backup outcome uncertain. Do not repeat a possibly completed write before reconciliation.'}
   finally{manual.disabled=false;void refresh()}
  })(),'btn small');
  manual.dataset.backupManual='1';manual.disabled=s.format!=='V2';
  actions.append(toggle,manual);
 }
 void refresh();
}
// The full diagnostic engine stays the original, guarded production stage
// runner. This accepted UI mirrors its typed input controls and actual stage
// results; it does not invent PASS or dispatch stages directly from a mock.
function primaryDiagnostics(container){
 const section=primarySettingCard(container,'Full disposable diagnostic',
  'Tests can create and change real disposable resources. Configure the dedicated scope once; normal provider accounts must not be used.');
 const form=el('div','form-stack');
 const selected=el('select','select'),placeholder=el('option','','Choose a verified disposable account');placeholder.value='';
 selected.append(placeholder);
 for(const acct of state.lastAccountList.filter(a=>a.state==='VERIFIED')){
  const option=el('option','',acct.alias||acct.accountId);option.value=acct.accountId;
  selected.append(option);
 }
 const stored=nativeControl('pcms-diagnostic-account');
 if(stored?.value&&[...selected.options].some(o=>o.value===stored.value))
   selected.value=stored.value;
 const namespace=el('input','form-input');namespace.placeholder='pcms-test-alpha';namespace.maxLength=42;
 namespace.value=nativeControl('pcms-diagnostic-namespace')?.value||'pcms-test-alpha';
 const fingerprint=el('input','form-input');fingerprint.maxLength=64;
 fingerprint.value=nativeControl('pcms-diagnostic-xpi-sha')?.value||'';
 fingerprint.placeholder='Optional XPI SHA-256 for restart and backup verification';
 const confirm=el('label','setting-option'),consent=el('input');consent.type='checkbox';
 consent.checked=nativeControl('pcms-diagnostic-consent')?.checked===true;
 confirm.append(consent,document.createTextNode(' I authorize live testing on this specifically designated disposable account, Persona and namespace.'));
 const addLabel=(title,field)=>{
  const label=el('label','',title);label.append(field);form.append(label)};
 addLabel('Disposable managed account',selected);
 addLabel('Dedicated test namespace',namespace);
 addLabel('Installed XPI fingerprint (optional for initial stages)',fingerprint);
 form.append(confirm);section.append(form);
 const tools=el('div','form-foot'),status=el('p','setting-note');
 status.setAttribute('role','status');section.append(tools,status);
 const stages=el('details','settings-section'),heading=el('summary','','Actual diagnostic stage receipts');
 const stageText=el('pre','source-preview');stages.append(heading,stageText);section.append(stages);
 const labels={
  TEST_SCOPE_INVALID:'The test scope is incomplete. Finish secure GitHub connection and choose your verified disposable account.',
  TEST_GITHUB_CONNECTION_REQUIRED:'GitHub file preview works, but secure connection setup is incomplete. Repair local PCMS helpers first.',
  TEST_ACCOUNT_SELECTION_INVALID:'Select a verified disposable managed account.',
  TEST_PERSONA_BINDING_INVALID:'The selected account lacks a verified protected Persona binding.',
  TEST_NAMESPACE_INVALID:'Use a lowercase name starting with pcms-test-.',
  ENABLE_SCOPED_DEVELOPMENT_AND_GIT:'Enable development and scoped Git writeback in Automation after the secure Git connection is verified.',
  TEST_SCOPE_NOT_VERIFIED:'The disposable resources could not be verified. No live test started.'
 };
 const say=text=>{
  const raw=String(text||'').trim();if(!raw)return 'No diagnostic run has been verified.';
  for(const [code,replacement] of Object.entries(labels))if(raw.includes(code))return replacement;
  if(raw.includes('NOT_TESTED'))return 'Diagnostic stages have not been executed yet.';
  return raw.replace(/\b(?:TEST|GIT|DIAGNOSTIC)_[A-Z0-9_]{4,80}\b/g,
    'an unresolved test prerequisite');
 };
 function refresh(){
  if(!section.isConnected)return;
  const origin=nativeControl('pcms-diagnostic-status')?.textContent||'';
  const scope=nativeControl('pcms-diagnostic-scope')?.textContent||'';
  status.textContent=say(origin)+' '+(scope&&scope!==origin?say(scope):'');
  const results=nativeControl('pcms-diagnostic-stages');
  stageText.textContent=results?.innerText||results?.textContent||'No real stage receipts.';
  for(const [id,label] of [
   ['pcms-diagnostic-run','Run full diagnostic'],
   ['pcms-diagnostic-resume','Resume failed stage'],
   ['pcms-diagnostic-rerun','Run new disposable test'],
   ['pcms-diagnostic-export','Export sanitized report']]){
    const x=[...tools.querySelectorAll('button')].find(b=>b.dataset.nativeAction===id);
    if(x)x.disabled=nativeControl(id)?.disabled!==false;
  }
 }
 const copyToNative=()=>{
  for(const [id,value] of [['pcms-diagnostic-account',selected.value],
   ['pcms-diagnostic-namespace',namespace.value],['pcms-diagnostic-xpi-sha',fingerprint.value]]){
   const target=nativeControl(id);if(target){
    target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));
    target.dispatchEvent(new Event('change',{bubbles:true}));
   }
  }
  const dest=nativeControl('pcms-diagnostic-consent');
  if(dest){dest.checked=consent.checked;dest.dispatchEvent(new Event('change',{bubbles:true}));}
 };
 const save=b('Save disposable scope',()=>{
  if(!selected.value||!/^pcms-test-[a-z0-9-]{1,31}$/.test(namespace.value)||!consent.checked){
   status.textContent='Choose a verified account, enter a valid pcms-test- namespace and confirm disposable authorization.';return;
  }
  copyToNative();const nativeSave=nativeControl('pcms-diagnostic-designate');
  if(!nativeSave){status.textContent='The full diagnostic controller is not installed in this build.';return;}
  nativeSave.click();status.textContent='Checking the selected disposable scope before permitting any live test.';
 },'btn primary');tools.append(save);
 for(const [id,label] of [
  ['pcms-diagnostic-run','Run full diagnostic'],
  ['pcms-diagnostic-resume','Resume failed stage'],
  ['pcms-diagnostic-rerun','Run new disposable test'],
  ['pcms-diagnostic-export','Export sanitized report']]){
  const button=b(label,()=>{
   const ctrl=nativeControl(id);
   if(!ctrl||ctrl.disabled)return;
   if(id==='pcms-diagnostic-run'&&!window.confirm(
     'Start the authorized live diagnostic now? Only the designated disposable account and namespace may be used.'))return;
   ctrl.click();refresh();
  },'btn small');
  button.dataset.nativeAction=id;button.disabled=true;tools.append(button);
 }
 const oldNodes=['pcms-diagnostic-status','pcms-diagnostic-scope','pcms-diagnostic-stages',
  'pcms-diagnostic-run','pcms-diagnostic-resume','pcms-diagnostic-rerun'].map(nativeControl).filter(Boolean);
 const observer=new MutationObserver(()=>refresh());
 for(const old of oldNodes)observer.observe(old,{subtree:true,childList:true,
   attributes:true,characterData:true});
 const previousObserver=state.diagnosticObservation;
 if(previousObserver)previousObserver.disconnect();
 state.diagnosticObservation=observer;
 refresh();
}
function renderSettingsSection(){if(state.route!=='settings')return;
 const names=['connections','automation','ai','backups','diagnostics','advanced'];
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
  primaryConnections(container);
 } else {
  container.replaceChildren();
  const section=el('section','card settings-group');const head=el('div','settings-section-head');const titles={automation:'Automation',ai:'AI development',backups:'Backup & Restore',diagnostics:'Diagnostics',advanced:'Advanced'};
  head.append(el('h2','h2',titles[select]));section.append(head);
  if(select==='automation'){primaryAutomation(container);}
  else if(select==='ai'){primaryAiSettings(container);}
  else if(select==='backups'){primaryBackups(container);}
  else if(select==='diagnostics')primaryDiagnostics(container);
  else{
   section.append(el('p','setting-note',
     'Advanced permissions are enforced by the protected runtime. Routine setup is in Connections and Automation.'));
   container.append(section);
  }
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
 else page()?.querySelector('.page-head')?.append(b('More controls (original view)',()=>nativeAction(state.route),'btn quiet small'));
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