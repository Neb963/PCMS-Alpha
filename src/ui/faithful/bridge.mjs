import {createGeneratorSelection} from './generator-selection.mjs';
import {createAccountsWorkspace,accountGrowthAdvice,accountNeedsAttention} from './accounts-workspace.mjs';
import {advanceApprovedPublication} from './publication-flow.mjs';
import {mountPortableRestore} from '../restore-view.mjs';
import {portableRestoreTemplate} from './portable-restore-template.mjs';
import {diagnosticTemplate} from './diagnostic-template.mjs';
import {mountDiagnosticController} from '../s08-diagnostics.mjs';
import {openCanonicalDatabase} from '../journal.mjs';
import {snapshotCanonicalV2,preflightSourceRecovery} from '../backup-core.mjs';
/* PCMS prototype-structure production bridge, version 0.1.6.
 * The accepted single-file prototype supplies the actual shell/CSS/view HTML.
 * This module does not load its demo script or its sample data. Everything
 * displayed as canonical is read from guarded *read-only* extension ports.
 * All modifying operations remain with their original production view modules,
 * buttons, required confirmations, capability gates, and revision fences.
 */
const routes=['overview','generators','work-queue','accounts','refresher','settings'];
const host=document.createElement('div');host.id='pcms-faithful-host';
document.body.append(host);const root=host.attachShadow({mode:'open'});
const READINESS_NAMES={EXTENSION_RUNTIME:'PCMS extension',LOCAL_CONFIGURATION:'Local settings',RESTORE_HOLD:'Restore safety',REFRESHER_POLICY:'Refresher configuration',BACKUP_RESTORE:'Backup recovery',ACCOUNT_INVENTORY_READ:'Account inventory',REFRESHER_CURRENT_POLICY:'Current Refresher policy',BROWSER_GIT_STORE:'Firefox Git credential storage',NATIVE_VAULT_HOST:'Legacy Git helper (not required)',SECRET_SERVICE_ENVIRONMENT:'Secure credential storage',BACKUP_HOST:'Backup helper',DIAGNOSTIC_HOST:'Diagnostic helper',GIT_CONFIG:'GitHub connection',GIT_PARTIAL_CONNECTION:'Interrupted GitHub setup',GITHUB_AUTH:'GitHub access',GITHUB_MAIN_TREE:'GitHub file scan',GRANT_DEVELOPMENT:'Development permission',GRANT_GITWRITE:'Git write permission',GRANT_PUBLICATION:'Publication permission',PERSONA_AND_SESSION:'Account and secure route',REFRESHER_LIVE_EFFECT:'Refresher operation',PORTABLE_BACKUP_RUNTIME:'Portable backup coordinator',INSTALLED_XPI_IDENTITY:'Installed extension verification'};
const READINESS_STATES={VERIFIED:'Checked',NOT_TESTED:'Not checked',OUTCOME_UNCERTAIN:'Needs review',UNREACHABLE:'Not responding',STALE:'Needs updating',SECURITY_HELD:'Waiting on setup',OFF_BY_POLICY:'Disabled',NOT_CONFIGURED:'Not connected',MISSING_CAPABILITY:'Needs an update'};
function operatorReadinessGuidance(row){
 const code=row.code||'';
 if(row.component==='PORTABLE_BACKUP_RUNTIME')
   return row.state==='VERIFIED'?'The browser backup coordinator responded. Independent disk and restore proof require separate verification.':
     'Check the Firefox background backup coordinator.';
 if(row.component==='BROWSER_GIT_STORE')
   return row.state==='VERIFIED'?'The saved browser credential is present; GitHub authorization is checked separately.':
     'Reconnect GitHub to use background Git operations. No PCMS helper is required.';
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
 GIT_RECONCILIATION_CREDENTIAL_UNAVAILABLE:'The saved GitHub credential could not be accessed. Check Firefox extension storage and reconnect GitHub before trying again.',
 GIT_RECONCILIATION_VAULT_UNAVAILABLE:'The browser credential store is unavailable. Check Firefox extension storage and reconnect GitHub.',
 GIT_RECONCILIATION_NETWORK_UNAVAILABLE:'GitHub could not be reached. Check your connection and try again.',
 GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN:'Connection settings could not be confirmed. No further changes were attempted.'
 };
 return messages[code]||'GitHub connection could not be verified. See the details below before retrying.';
}
const state={route:'overview',gen:{offset:0,limit:24,query:'',account:'ALL',sort:'fleet',filter:'ALL',total:0,items:[]},
 ref:{offset:0,limit:25,query:'',phase:'ALL',snapshot:null,items:[],total:0},
 acct:{page:0,perPage:24,query:'',filter:'All',list:[]},queue:{filter:'Needs action',query:'',operations:[],incidents:[],opCursor:'',noticeCursor:'',history:[],nextOps:null,nextNotices:null,more:false,loading:false,error:null,summary:null,reviews:[],missing:[],releaseItems:[],aiJobs:[],aiCursor:'',nextAi:null,aiMore:false,readyItems:[],readyCursor:'',nextReady:null,readyMore:false,aiUnavailable:false,readyUnavailable:false,epoch:0},
 settings:'connections',settingsStatic:null,lastAccountList:[],lastInventoryTotal:null,lastRef:null,errors:{},
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
let currentToast;
function notify(message){const e=shadow('#pcms-live-toast');if(!e)return;e.textContent=String(message);e.hidden=false;if(currentToast)clearTimeout(currentToast);currentToast=setTimeout(()=>e.hidden=true,6500)}
const generatorSelection=createGeneratorSelection(typeof browser==='object'?browser.storage.local:{
 get:async()=>{throw Error('STORAGE_UNAVAILABLE')},set:async()=>{throw Error('STORAGE_UNAVAILABLE')}});
generatorSelection.subscribe(()=>updateGeneratorSelection());
const accountWorkspace=createAccountsWorkspace({root,el,b,request:readPort,reload:()=>loadAccounts(),notify});
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
 if(type==='timing'){
  if(item?.stableId)openRefresherTiming(item);
  else if(item?.slug){
   state.ref.query=item.slug;state.ref.phase='ALL';state.ref.offset=0;
   routeTo('refresher');
   notify('Select the matching Refresher row to manage its independently verified timing.');
  }else notify('No verified Refresher target is available for this generator.');
 }
 else if(type==='source'){openSourceManager(item);}
 else if(type==='adopt'){openAdoptionManager(item);}
 else notify('This workflow is not available from the current selection. No operation was attempted.');
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
function openGlobalRefresherPolicy(){
 const snap=state.ref.snapshot;
 if(!snap?.ok||!Number.isSafeInteger(snap.revision)){
  notify('Current Refresher policy is not verified. Refresh before changing its timing.');return}
 const original=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('div','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','Refresher default timing policy');
 const close=()=>{overlay.remove();original?.isConnected&&original.focus({preventScroll:true})};
 const header=el('div','drawer-head');header.append(
  el('h2','drawer-title','Refresher default timing'),b('Close',close));
 const body=el('div','drawer-body');
 body.append(el('p','setting-note',
  'Default periods apply to subsequently scheduled work; per-generator overrides remain separate. The source-save policy is controlled independently.'));
 const fields=[];
 for(const [name,value] of [['Active period',snap.policy.activeMs],['Rest period',snap.policy.sleepMs]]){
  const label=el('label','',name+' (minutes)'),input=el('input','form-input');
  input.type='number';input.min='1';input.max='525600';input.step='1';
  input.value=String(Math.round(value/60000));label.append(input);body.append(label);fields.push(input);
 }
 const status=el('p','setting-note','No change submitted.');
 const save=b('Save default timing',()=>void(async()=>{
  const nums=fields.map(x=>Number(x.value));
  if(nums.some(x=>!Number.isSafeInteger(x)||x<1||x>525600)){
   status.textContent='Use 1 to 525,600 minutes for each period.';return}
  if(!window.confirm('Save the default active and rest periods? Existing target overrides and verified provider receipts remain unchanged.'))return;
  save.disabled=true;
  try{
   const r=await readPort('pcms-i12-refresher','SET_POLICY',{
    expectedRevision:snap.revision,
    policy:{activeMs:nums[0]*60000,sleepMs:nums[1]*60000}},16000);
   status.textContent=r?.ok?'Default scheduling periods saved.':
    'Timing could not be saved. Refresh current policy before retrying.';
  }catch{status.textContent='Timing outcome uncertain. Reload policy before retrying.'}
  finally{save.disabled=false;await loadRefresher()}
 })(),'btn primary');
 body.append(save,status);panel.append(header,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 fields[0].focus();
}
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
    !document.body.classList.contains('pcms-faithful-ready'))return;
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
 if(action==='queue'||action==='activity'){routeTo('work-queue');return}
 if(action==='diagnostics'||action==='health'){state.settings='diagnostics';routeTo('settings');return}
 if(action==='notifications'){routeTo('overview');return}
 if(action==='system-health'){routeTo('settings');return}
 if(action==='generator-filters'){shadow('#generator-account')?.focus();return}
 if(action==='gen-prev'){state.gen.offset=Math.max(0,state.gen.offset-state.gen.limit);void loadGenerators();return}
 if(action==='gen-next'){state.gen.offset+=state.gen.limit;void loadGenerators();return}
 if(action==='ref-prev'){state.ref.offset=Math.max(0,state.ref.offset-state.ref.limit);void loadRefresher();return}
 if(action==='ref-next'){state.ref.offset+=state.ref.limit;void loadRefresher();return}
 if(action==='account-prev'){state.acct.page=Math.max(0,state.acct.page-1);displayAccounts();return}
 if(action==='account-next'){state.acct.page++;displayAccounts();return}
 if(action==='prepare-ai'){openAiPreparation();return}
 if(action==='queue-prev'){
   const prior=state.queue.history.pop();if(!prior)return;
   state.queue.opCursor=prior.op;state.queue.noticeCursor=prior.notice;
   state.queue.aiCursor=prior.ai;state.queue.readyCursor=prior.ready;void loadQueue();return;
 }
 if(action==='queue-next'){
   if(!state.queue.more)return;
   state.queue.history.push({op:state.queue.opCursor,notice:state.queue.noticeCursor,ai:state.queue.aiCursor,ready:state.queue.readyCursor});
   state.queue.opCursor=state.queue.nextOps===null?null:state.queue.nextOps;
   state.queue.noticeCursor=state.queue.nextNotices===null?null:state.queue.nextNotices;
   state.queue.aiCursor=state.queue.nextAi===null?null:state.queue.nextAi;
   state.queue.readyCursor=state.queue.nextReady===null?null:state.queue.nextReady;
   void loadQueue();return;
 }
 if(action==='add-account'){void startAccountEnrollment();return}
 if(action==='feed-check'){void (async()=>{
  try{
   const r=await readPort('pcms-i12-refresher','OBSERVE_NOW',{},90000);
   notify(r?.ok?'Read-only observation requested. Its provider evidence will be displayed separately.':
     'The latest protected observation could not be verified.');
  }catch{notify('Read-only observation unavailable. Provider state remains unknown.')}
  await loadRefresher();
 })();return}
 if(action==='edit-timing'){openGlobalRefresherPolicy();return}
 if(action==='pause-refresher'){void (async()=>{
  const s=state.ref.snapshot;
  if(!s?.ok||!Number.isSafeInteger(s.revision)){notify('Current Refresher revision is not verified.');return}
  const paused=!s.globalPause;
  if(!window.confirm(paused?'Pause scheduling across every managed generator?':
   'Resume the scheduler, subject to every account, route, source, visibility and policy hold?'))return;
  try{
   const r=await readPort('pcms-i12-refresher','SET_PAUSE',{
    expectedRevision:s.revision,scope:'GLOBAL',paused},16000);
   notify(r?.ok?'Global Refresher pause setting saved. Remote source effects are not inferred.':
     'Pause change could not be confirmed. Reload state before retrying.');
  }catch{notify('Global pause outcome uncertain. Reload before another change.')}
  await loadRefresher();
 })();return}
 if(action==='review-generator-selection'){openGeneratorSelection();return}
 if(action==='clear-generator-selection'){void generatorSelection.clear();return}
 if(action==='go-accounts'){routeTo('accounts');return}
 if(action==='refresh-accounts'){void loadAccounts();return}
 if(action==='queue-help'){notify('Work Queue shows pending work and items needing attention. Open an item to review its available actions.');return}
 if(action==='account-info'){notify('Use Manage to check an account’s login, protected route, inventory or recovery.');return}
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
  if(event.target.closest('button,input,select,textarea,a'))return;
  const row=event.target.closest('tr[data-item-index]');if(!row)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();row.click();return}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   const list=[...row.closest('tbody').querySelectorAll('tr[data-item-index]')];const idx=list.indexOf(row);
   const n=event.key==='Home'?0:event.key==='End'?list.length-1:Math.min(list.length-1,Math.max(0,idx+(event.key==='ArrowDown'?1:-1)));
   event.preventDefault();row.tabIndex=-1;list[n].tabIndex=0;list[n].focus({preventScroll:true});
  }
 });
 root.addEventListener('change',event=>{const target=event.target;
 if(target.matches('[data-generator-select-page]')){void generatorSelection.setMany(state.gen.items,target.checked);return}
 if(target.id==='generator-account'){state.gen.account=target.value;state.gen.offset=0;void loadGenerators()}
 if(target.id==='generator-sort'){state.gen.sort=target.value;state.gen.offset=0;void loadGenerators()}
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
 const batchStatus=el('div','setting-note');
 batchStatus.setAttribute('aria-label','Recent background creation requests');
 body.append(batchStatus);
 async function showBatches(){
  try{
   const out=await readPort('pcms-s00-coordinator','LIST_CREATE_BATCHES',{limit:20},12000);
   if(!out?.ok){batchStatus.textContent='Batch status unavailable.';return;}
   batchStatus.replaceChildren(el('strong','','Recent durable requests'));
   for(const batch of out.items.slice(-10).reverse()){
    const row=el('div','setting-note');
    row.append(el('p','',batch.batchId.slice(-8)+': '+batch.processed+'/'+
      batch.total+' input handled · '+batch.state+
      (batch.held?' · '+batch.held+' held ('+String(batch.lastHold||'review required')+')':'')+
      (batch.state==='INGESTING'?' ('+batch.appended+'/'+batch.total+
       ' input persisted; not finalized)':'')));
    if(batch.held>0){
      row.append(b('Retry held intake',async()=>{
        try{
          const pending=await readPort('pcms-s00-coordinator','LIST_CREATE_BATCH_HOLDS',
            {batchId:batch.batchId,limit:1},12000);
          const held=pending?.items?.[0];
          if(!held){notify('Held item list unavailable.');return;}
          const retried=await readPort('pcms-s00-coordinator','RETRY_CREATE_BATCH_HOLD',
            {batchId:batch.batchId,index:held.index},20000);
          notify(retried?.ok?'Held local intake was reconciled.':
            'Intake still held: '+String(retried?.code||'UNVERIFIED'));
          await showBatches();
        }catch{notify('Intake reconciliation unknown; inspect the batch again.');}
      }));
    }
    batchStatus.append(row);
   }
  }catch{batchStatus.textContent='Batch status unavailable; canonical receipts remain stored.';}
 }
 void showBatches();
 const submit=b('Create private generators',()=>{
  const slugs=[...new Set(input.value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean))];
  if(!slugs.length||slugs.some(x=>!/^[a-z0-9][a-z0-9-]{0,99}$/.test(x))){
   status.textContent='Enter valid lowercase generator names using letters, numbers and hyphens.';return;
  }
  const pinned=choice.value||null;
  const batchId='batch_'+crypto.randomUUID().replaceAll('-','');
  submit.disabled=true;input.disabled=true;choice.disabled=true;
  status.textContent='Submitting '+slugs.length+' requests into persistent storage. Creation has not yet been confirmed.';
  void (async()=>{
   let appended=0;
   try{
    const begun=await readPort('pcms-s00-coordinator','BEGIN_CREATE_BATCH',{
      batchId,total:slugs.length,...(pinned?{accountId:pinned}:{})},20000);
    if(!begun?.ok)throw Error(begun?.code||'BATCH_BEGIN_UNCONFIRMED');
    for(let offset=0;offset<slugs.length;offset+=32){
     const chunk=slugs.slice(offset,offset+32);
     let out;
     try{out=await readPort('pcms-s00-coordinator','APPEND_CREATE_BATCH',{
       batchId,offset,slugs:chunk},20000);}catch{
       // Lost acknowledgement is reconciled by read-only persisted cursor.
       const check=await readPort('pcms-s00-coordinator','GET_CREATE_BATCH',{batchId},12000);
       if(check?.ok&&check.batch.appended>=offset+chunk.length)
        out={ok:true};
       else throw Error('BATCH_CHUNK_ACK_UNCERTAIN');
     }
     if(!out?.ok)throw Error(out?.code||'BATCH_CHUNK_HELD');
     appended=offset+chunk.length;
     status.textContent='Persisted '+appended+' of '+slugs.length+
       ' input requests; not yet finalized.';
    }
    let finalized;
    try{finalized=await readPort('pcms-s00-coordinator','FINALIZE_CREATE_BATCH',
      {batchId},20000);}catch{
      const check=await readPort('pcms-s00-coordinator','GET_CREATE_BATCH',{batchId},12000);
      if(check?.ok&&check.batch.state!=='INGESTING')finalized=check;
      else throw Error('BATCH_FINALIZATION_ACK_UNCERTAIN');
    }
    if(!finalized?.ok||finalized.batch?.state==='INGESTING')
      throw Error(finalized?.code||'BATCH_NOT_FINALIZED');
    status.textContent=slugs.length+' generator requests durably queued (batch '+
      batchId.slice(-8)+'). Background work continues with this page closed; '+
      'individual creation requires protected readback.';
    try{await browser.alarms.create('pcms-s04-creation-followup',
      {when:Date.now()+1000})}catch{}
    await loadGenerators();
   }catch(error){
    status.textContent='Input not confirmed as a complete batch ('+
      String(error?.message||'BATCH_UNAVAILABLE')+'). '+appended+
      ' of '+slugs.length+' names were persisted. Batch '+batchId+
      ' can be inspected; no remote create success is implied.';
   }finally{
    submit.disabled=false;input.disabled=false;choice.disabled=false;
    await showBatches();
   }
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
let accountReadEpoch=0;
async function loadAccounts(){
 const epoch=++accountReadEpoch;
 try{const result=await accounts();if(epoch!==accountReadEpoch)return state.lastAccountList;
  state.lastAccountList=Array.isArray(result.accounts)?result.accounts:[];state.errors.accounts='';
  if(state.route==='accounts')displayAccounts();return state.lastAccountList}
 catch(error){if(epoch!==accountReadEpoch)return state.lastAccountList;
  state.errors.accounts=error.message;if(state.route==='accounts')displayAccounts();return state.lastAccountList}
}
function displayAccounts(){if(state.route!=='accounts')return;
 const list=shadow('.account-list-scroll');if(!list)return;
 const query=state.acct.query.trim().toLowerCase(),filter=state.acct.filter,all=state.lastAccountList.filter(a=>!a.removed);
 const displayed=all.filter(a=>{const term=String(a.accountId||'').toLowerCase(),name=String(a.state||'');
  return (!query||term.includes(query)||String(a.personaUid||'').toLowerCase().includes(query))&&
   (filter==='All'||filter==='Connected'&&name==='VERIFIED'&&!accountNeedsAttention(a)||filter==='Archived'&&name==='ARCHIVED'||filter==='Attention'&&accountNeedsAttention(a));
 });
 const pages=Math.ceil(displayed.length/state.acct.perPage);if(state.acct.page>=pages)state.acct.page=Math.max(0,pages-1);
 const offset=state.acct.page*state.acct.perPage;
 const heading=shadow('.workspace-surface .card-title-row .h2 span');if(heading)heading.textContent=' · '+(state.errors.accounts?'unknown':all.length);
 if(state.errors.accounts){list.replaceChildren();renderEmpty(list,'Account records unavailable: '+state.errors.accounts,'pcms-error')}
 else if(!displayed.length){list.replaceChildren();renderEmpty(list,all.length?'No matching accounts.':'Add your first account to prepare a protected Persona and login tab.')}
 else{
  for(const child of [...list.children])if(!child.dataset.accountId)child.remove();
  accountWorkspace.renderRows(list,displayed.slice(offset,offset+state.acct.perPage));
 }
 const pagination=shadow('.pagination span');if(pagination)pagination.textContent=state.errors.accounts?'Account read unavailable':
  String(displayed.length?offset+1:0)+'–'+Math.min(offset+state.acct.perPage,displayed.length)+' of '+displayed.length+' accounts';
 const advice=shadow('#page .action-callout');
 if(advice)advice.textContent=!state.errors.accounts&&accountGrowthAdvice(all)?
  'Every managed account has at least 60 confirmed owned generators. Consider adding another account.':
  'Open an account to manage its login, protected route, inventory and recovery.';
 const prev=shadow('[data-action="account-prev"]'),next=shadow('[data-action="account-next"]');
 if(prev)prev.disabled=state.acct.page===0;if(next)next.disabled=offset+state.acct.perPage>=displayed.length;
}
async function startAccountEnrollment(){
 const button=shadow('[data-action="add-account"]');if(button?.disabled)return;if(button)button.disabled=true;
 notify('Preparing a protected Persona and route…');
 try{
  const out=await readPort('pcms-i03-accounts','ADD_ACCOUNT',{},90000);
  await loadAccounts();
  if(out?.ok){const account=state.lastAccountList.find(a=>a.accountId===out.accountId);
   if(account&&state.route==='accounts')openAccountManager(account);
   notify('Account setup started. Its protected route and login progress appear in Accounts.');
  }else notify(out?.message||'Account setup could not start ('+String(out?.code||'unavailable').toLowerCase().replaceAll('_',' ')+').');
 }catch{notify('Setup was not confirmed. Check Accounts before submitting another request.');await loadAccounts()}
 finally{if(button?.isConnected)button.disabled=false}
}
function openAccountManager(item){accountWorkspace.open(item)}
async function loadGenerators(){if(state.route!=='generators')return;
 const epoch=++state.renderEpoch,body=shadow('.workspace-surface table tbody');if(!body)return;
 renderEmpty(body,'Reading observed local generator inventory…');
 try{
  const [res,accountsResult]=await Promise.all([inventory({query:state.gen.query,offset:state.gen.offset,limit:state.gen.limit,ownerState:state.gen.filter==='ALL'?'ALL':state.gen.filter,accountId:state.gen.account==='ALL'?'':state.gen.account,sort:state.gen.sort}),accounts().catch(()=>null)]);
  if(epoch!==state.renderEpoch||state.route!=='generators')return;
  state.lastAccountList=accountsResult?.ok&&Array.isArray(accountsResult.accounts)?accountsResult.accounts:state.lastAccountList;
  state.gen.items=Array.isArray(res.items)?res.items:[];state.gen.total=safeCount(res.total)=== '—'?0:res.total;
  state.errors.generators='';displayGenerators();
 }catch(err){if(epoch!==state.renderEpoch)return;state.errors.generators=err.message;state.gen.items=[];state.gen.total=0;rowsError('.workspace-surface table tbody','Local inventory unavailable: '+err.message+'. No remote absence inferred.',7)}
}
function updateGeneratorSelection(){
 if(state.route!=='generators')return;
 const selected=generatorSelection.status(),bar=shadow('[data-generator-selection]');
 if(bar){bar.hidden=selected.count===0&&!selected.error;
  const count=bar.querySelector('[data-selection-count]');if(count)count.textContent=selected.count+' selected across pages';
  const error=bar.querySelector('[data-selection-error]');if(error){error.textContent=selected.error||(selected.saving?'Saving selection…':'');error.hidden=!selected.error&&!selected.saving}}
 for(const checkbox of root.querySelectorAll('[data-generator-select]')){
  const item=state.gen.items.find(x=>x.slug===checkbox.dataset.generatorSelect);
  if(item)checkbox.checked=generatorSelection.includes(item);
 }
 const all=shadow('[data-generator-select-page]');
 if(all){const count=state.gen.items.filter(x=>generatorSelection.includes(x)).length;
  all.checked=state.gen.items.length>0&&count===state.gen.items.length;
  all.indeterminate=count>0&&count<state.gen.items.length;all.disabled=state.gen.items.length===0}
}
async function openGeneratorPage(item){
 try{
  const out=await readPort('pcms-i04-inventory','OPEN_GENERATOR',{slug:item.slug,expectedRevision:item.revision},45000);
  notify(out?.ok&&out.opened?'Generator opened in its protected Persona.':
   out?.code==='STALE_REVISION'?'This generator changed. Refresh its current record before opening it.':
   out?.code==='ACCOUNT_ARCHIVED'?'Reactivate this account before opening its generator.':
   out?.code==='ACCOUNT_CONTEXT_CHANGED'?'Synchronize this account’s inventory after completing its login.':
   'The protected page could not be opened. Check the account’s login and route.');
 }catch{notify('Opening the generator was not confirmed. Check its account before retrying.')}
}
function openGeneratorSelection(){
 const targets=generatorSelection.snapshot();if(!targets.length)return;
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),dialog=el('section','drawer');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Selected generators');
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const header=el('div','drawer-head'),line=el('div','drawer-title-row');
 line.append(el('h2','drawer-title','Selected generators'),b('Close',close));header.append(line);
 const body=el('div','drawer-body'),status=el('p','setting-note','Reading '+targets.length+' current records…');
 status.setAttribute('role','status');const actions=el('div','form-foot'),list=el('div'),pager=el('div','pagination-actions');
 body.append(status,actions,list,pager);dialog.append(header,body);overlay.append(dialog);root.append(overlay);
 let rows=[],offset=0,busy=false;const size=25;
 function draw(focusLabel=null){
  list.replaceChildren();pager.replaceChildren();
  for(const item of rows.slice(offset,offset+size)){
   const frozen=targets.find(x=>x.slug===item.slug),row=el('section','setting-note');
   row.style.marginTop='10px';row.append(el('strong','',item.slug));
   row.append(el('p','',item.missing?'Local record unavailable. Remote absence has not been inferred.':
    (item.accountId!==frozen.accountId?'Account changed since selection. ':
     item.revision!==frozen.revision?'Updated since selection. ':'')+
     (ownerLabels[item.ownerState]||'Ownership needs checking')+' · '+item.accountId));
   if(!item.missing){
    row.append(b('Open Perchance',()=>void openGeneratorPage(item)),
     b('Source',()=>{close();openSourceManager(item)}),
     b('Manage account',()=>void (async()=>{
      const out=await accounts();const a=out.accounts?.find(a=>a.accountId===item.accountId);
      if(a){close();openAccountManager(a)}else notify('Account record unavailable.')
     })().catch(()=>notify('Account state could not be read.'))));
   }
   row.append(b('Remove from selection',()=>{void generatorSelection.remove(item.slug);
    rows=rows.filter(x=>x.slug!==item.slug);if(offset>=rows.length)offset=Math.max(0,offset-size);draw('Previous')}));list.append(row);
  }
  const back=b('Previous',()=>{offset=Math.max(0,offset-size);draw()});back.disabled=offset===0;
  const next=b('Next',()=>{offset+=size;draw('Next')});next.disabled=offset+size>=rows.length;
  pager.append(back,el('span','',String(rows.length?offset+1:0)+'–'+Math.min(offset+size,rows.length)+' of '+rows.length),next);
  if(focusLabel){const buttons=[...pager.querySelectorAll('button:not(:disabled)')];
   (buttons.find(b=>b.textContent===focusLabel)||buttons[0])?.focus({preventScroll:true})}
 }
 const sync=b('Sync selected accounts',()=>void (async()=>{
  if(busy)return;busy=true;sync.disabled=true;status.textContent='Synchronizing the selected accounts…';
  try{
   const found=await accounts(),ids=new Set(rows.filter(x=>!x.missing).map(x=>x.accountId));
   let confirmed=0,held=0;
   const queue=found.accounts.filter(a=>ids.has(a.accountId));let index=0;
   await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
    while(index<queue.length){const a=queue[index++];try{
     const out=await readPort('pcms-i04-inventory','SYNC_ACCOUNT',{accountId:a.accountId,expectedRevision:a.revision},100000);
     if(out?.ok&&!out.held)confirmed++;else held++;
    }catch{held++}}
   }));
   status.textContent=confirmed+' account inventories updated; '+held+' need attention. Use Manage account to recover login or routing.';
   await loadGenerators();
  }catch{status.textContent='Inventory synchronization was not confirmed. Your selection is preserved.'}
  finally{busy=false;sync.disabled=false}
 })(),'btn small');sync.disabled=true;actions.append(sync);
 void (async()=>{try{
  for(let i=0;i<targets.length;i+=100){
   const out=await readPort('pcms-i04-inventory','INSPECT_GENERATORS',{slugs:targets.slice(i,i+100).map(x=>x.slug)},20000);
   if(!out?.ok)throw Error('SELECTION_UNAVAILABLE');rows.push(...out.items);
  }
  if(!overlay.isConnected)return;status.textContent=rows.length+' selected records. Source and account actions always check current state.';
  sync.disabled=!rows.some(x=>!x.missing);draw();
 }catch{status.textContent='Selected records could not be read. Your saved selection is preserved.'}})();
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return}
  if(e.key==='Tab'){const controls=[...dialog.querySelectorAll('button:not(:disabled),a,input')].filter(n=>n.getClientRects().length);
   const at=controls.indexOf(root.activeElement);if(e.shiftKey&&at===0){e.preventDefault();controls.at(-1)?.focus()}
   else if(!e.shiftKey&&at===controls.length-1){e.preventDefault();controls[0]?.focus()}}
 });line.querySelector('button')?.focus({preventScroll:true});
}
function displayGenerators(){if(state.route!=='generators')return;
 const body=shadow('.workspace-surface table tbody');if(!body)return;body.replaceChildren();
 const accountsMap=new Map(state.lastAccountList.map(a=>[a.accountId,a]));const itemList=[...state.gen.items];
 // Server already sorted the complete matching fleet before slicing.
 state.gen.visibleItems=itemList;
 if(!itemList.length){rowsError('.workspace-surface table tbody',state.errors.generators?'Local inventory unavailable.': 'No matching local generator observations.',7)}
 for(const [i,item] of itemList.entries()){
  const tr=tableRow([item.slug],i);
  const selectCell=el('td','generator-select-cell'),checkbox=el('input');checkbox.type='checkbox';
  checkbox.dataset.generatorSelect=item.slug;checkbox.setAttribute('aria-label','Select '+item.slug);
  checkbox.checked=generatorSelection.includes(item);checkbox.addEventListener('click',e=>e.stopPropagation());
  checkbox.addEventListener('change',()=>void generatorSelection.set(item,checkbox.checked));selectCell.append(checkbox);
  const acct=accountsMap.get(item.accountId);const sourceState=item.source||'SOURCE_PENDING';const owner=item.ownerState||'UNKNOWN';
  const statusText=ownerLabels[owner]||owner.replaceAll('_',' ').toLowerCase();
  const td0=el('td','name-cell',item.slug||'Unknown');const td1=el('td','muted-cell',acct?.alias||item.accountId||'Unknown account');
  const td2=el('td');td2.append(statusPill(statusText,statusClasses[owner]||''));
  const td3=el('td','muted-cell',item.visibility||'UNKNOWN');
  const td4=el('td','muted-cell',sourceState+(item.lastObservedAt?' · '+fmtObservation({...item,observedAt:item.lastObservedAt}):''));
  const cue=el('td','open-col');cue.append(b('Open',e=>{e.stopPropagation();void openGeneratorPage(item)},'btn small'));
  td1.dataset.column='account';tr.append(selectCell,td0,td1,td2,td3,td4,cue);body.append(tr);
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
 updateGeneratorSelection();
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
 if(reset){q.opCursor='';q.noticeCursor='';q.aiCursor='';q.readyCursor='';q.history=[];q.nextOps=null;q.nextNotices=null;q.nextAi=null;q.nextReady=null;}
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
   q.aiCursor!==null?guardedRead('pcms-i10-ai','LIST_JOBS',{
     after:q.aiCursor,limit:20,query:q.query.slice(0,100),status:queueGroup(q.filter)
   }).catch(()=>({ok:false,jobs:[],more:false,nextCursor:null})):
     Promise.resolve({ok:true,jobs:[],more:false,nextCursor:null}),
   q.readyCursor!==null?guardedRead('pcms-s03-catalog','LIST_READY',{
     after:q.readyCursor,limit:20,query:q.query.slice(0,100),status:queueGroup(q.filter)
   }).catch(()=>({ok:false,items:[],more:false,nextCursor:null})):
     Promise.resolve({ok:true,items:[],more:false,nextCursor:null}),
   guardedRead('pcms-r4-folder-identity','LIST')
     .catch(()=>({ok:false,items:[],missingFolders:[]}))
 ];
 try{
  const [ops,notices,summary,noticeTotals,releases,ai,ready,identities]=await Promise.all(requested);
  if(state.route!=='work-queue'||q.epoch!==epoch)return;
  q.operations=ops.items||[];q.incidents=notices.items||[];
  q.nextOps=ops.more?ops.next:null;q.nextNotices=notices.more?notices.next:null;
  q.aiUnavailable=ai?.ok!==true;q.aiJobs=ai?.ok?(ai.jobs||[]):[];q.aiMore=ai?.ok&&ai.more===true;
  q.nextAi=q.aiMore?ai.nextCursor:null;
  q.readyUnavailable=ready?.ok!==true;q.readyItems=ready?.ok?(ready.items||[]):[];q.readyMore=ready?.ok&&ready.more===true;
  q.nextReady=q.readyMore?ready.nextCursor:null;
  q.more=Boolean(ops.more||notices.more||q.aiMore||q.readyMore);q.summary={...summary,attention:noticeTotals};
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
  if(q.aiUnavailable)
   holder.append(el('p','setting-note','AI development records could not be read. Their absence here does not mean there is no work.'));
  if(q.readyUnavailable)
   holder.append(el('p','setting-note','READY generator records could not be read. Check GitHub connection and local journal availability.'));
  if((q.filter==='Needs action'||q.filter==='All')&&!q.query)
   for(const review of q.reviews.filter(r=>['REVIEW_REQUIRED','RENAME_EXISTING_REQUESTED','REMOTE_RENAMED_LINK_PENDING'].includes(r.state)||r.stale)){
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
    }else if(review.state==='RENAME_EXISTING_REQUESTED'){
      const stateNote=el('p','setting-note','Reading the existing-generator rename stage…');
      const actions=el('div','form-foot');content.append(stateNote,actions);
      void (async()=>{
       let attempt;
       try{attempt=await readPort('pcms-r4-folder-identity','GET_RENAME_ATTEMPT',{
        newSlug:review.newSlug},15000)}
       catch{}
       if(!row.isConnected)return;
       actions.replaceChildren();
       if(!attempt?.ok){stateNote.textContent='Rename safety state unavailable. No live operation is permitted.';return;}
       const stage=attempt.state;
       const label=stage==='NOT_PREPARED'?'Pending owner/source verification':
         stage==='RENAME_PREPARED'?'Verified for one guarded rename attempt':
         stage==='DISPATCH_POSSIBLE'||stage==='OUTCOME_UNCERTAIN'?
          'Remote outcome uncertain — do not retry':
         stage==='REMOTE_RENAME_VERIFIED_LINK_PENDING'?
          'Remote identity verified; source association still pending':
          'The rename requires additional review';
       stateNote.textContent=label;
       async function next(type,revision){
        const text=type==='PREPARE_RENAME'?
          'Read the protected owner and entire existing source to prepare an exact one-time rename? No remote change occurs during preparation.':
          type==='EXECUTE_RENAME'?
          'Rename the EXISTING owned Perchance generator now? Renaming may break imports, URLs or slug-dependent storage. Its complete original source must remain unchanged. This request may have an uncertain outcome and will never be automatically retried.':
          'Read back the possibly completed remote rename without executing any new provider write?';
        if(!window.confirm(text))return;
        actions.querySelectorAll('button').forEach(x=>x.disabled=true);
        stateNote.textContent='Checking protected account, source and current Git identity…';
        try{
         const result=await readPort('pcms-r4-folder-identity',type,{
          newSlug:review.newSlug,expectedRevision:revision,
          ...(type==='EXECUTE_RENAME'?{consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME'}:{})},
          type==='EXECUTE_RENAME'?120000:95000);
         stateNote.textContent=result?.ok?
          type==='EXECUTE_RENAME'?'One rename attempt may have occurred. Reconcile the remote result; do not retry.':
          type==='RECONCILE_RENAME'?
           'Remote name and original source verified. Synchronize the account inventory and associate the new Git folder before any development.':
           'Existing owner and original source verified. A single rename attempt can now be explicitly authorized.':
          'The operation was held. Inspect the current scope before taking another action.';
        }catch{stateNote.textContent='Outcome could not be confirmed. Do not retry a possible rename. Read current stage.'}
        await loadQueue(true);
       }
       if(stage==='NOT_PREPARED')
         actions.append(b('Verify owner and prepare rename',()=>void next('PREPARE_RENAME',review.revision),'btn small'));
       if(stage==='RENAME_PREPARED')
         actions.append(b('Execute one verified rename',()=>void next('EXECUTE_RENAME',attempt.revision),'btn primary'));
       if(stage==='DISPATCH_POSSIBLE'||stage==='OUTCOME_UNCERTAIN')
         actions.append(b('Reconcile remote rename',()=>void next('RECONCILE_RENAME',attempt.revision),'btn small'));
       if(stage==='REMOTE_RENAME_VERIFIED_LINK_PENDING'){
         actions.append(b('Verify inventory and finish rename',()=>void (async()=>{
           if(!window.confirm('Finish reconciliation only if the new generator inventory and Git source association are independently verified? This does not perform another remote rename.'))return;
           stateNote.textContent='Checking new owner, remote identity and exact Git source association…';
           try{
             const result=await readPort('pcms-r4-folder-identity','FINALIZE_RENAME',{
               newSlug:review.newSlug,expectedRevision:attempt.revision},45000);
             stateNote.textContent=result?.ok&&result.state==='RENAME_COMPLETED'?
               'New identity and source association verified. Previous source history retained.':
               'The new inventory or source association is not yet independently verified. No remote change was attempted.';
           }catch{stateNote.textContent='Reconciliation could not be confirmed. Remote rename will not be repeated.'}
           await loadQueue(true);
         })(),'btn small'));
         actions.append(b('Open new generator source',()=>{
           state.gen.query=review.newSlug;state.gen.offset=0;routeTo('generators');
         },'btn small'));
       }
      })();
    }else if(review.state==='REMOTE_RENAMED_LINK_PENDING'){
      content.append(el('p','setting-note',
        'Remote rename readback was recorded. The inventory and new source link must still be verified.'));
      content.append(b('Open generators',()=>routeTo('generators'),'btn small'));
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
  for(const candidate of q.readyItems||[]){
   const active=Boolean(candidate.active),desired=Boolean(candidate.desired);
   const held=!!candidate.hold&&candidate.hold!=='NONE';
   const eligible=q.filter==='All'||
     (q.filter==='Needs action'&&(held||desired))||
     (q.filter==='Waiting'&&!held&&(active||desired))||
     (q.filter==='Completed'&&!held&&!active&&!desired);
   if(!eligible||(q.query&&!candidate.slug.includes(q.query.toLowerCase())))continue;
   const row=el('div','queue-item'),detail=el('div','row-body');
   const label=held?'Candidate needs review':desired?'New READY revision pending':
     active?'READY candidate recorded':'No currently eligible candidate';
   const heading=el('div','queue-head');
   heading.append(el('strong','',candidate.slug),statusPill(label,held?'amber':''));
   detail.append(heading,el('p','setting-note',
     'Committed main READY declaration · protected source, account, route and editor admission are verified separately.'));
   row.append(el('span','row-mark'+(held?' warn':'')),detail,
     b('Review READY',()=>void openReadyCandidate(candidate),'btn small'));
   holder.append(row);
  }
  for(const job of q.aiJobs||[]){
   const currentState=job.state||'NOT_VERIFIED';
   const complete=currentState==='TESTS_VERIFIED'||job.slotReleased===true;
   const needs=['HELD_RECONCILE','KNOWN_FAILURE','HELD_NO_PROGRESS','TESTS_UNVERIFIED','PENDING_NATIVE_SESSION'].includes(currentState);
   const running=job.nativeState==='RUNNING_OBSERVED';
   const match=q.filter==='All'||
     (q.filter==='Needs action'&&needs)||
     (q.filter==='Running'&&running)||
     (q.filter==='Waiting'&&!needs&&!running&&!complete)||
     (q.filter==='Completed'&&complete);
   if(!match||(q.query&&!job.slug.toLowerCase().includes(q.query.toLowerCase())))continue;
   const row=el('div','queue-item'),info=el('div','row-body');
   const title=el('div','queue-head');
   title.append(el('strong','',job.slug),
     statusPill(humanAiStatus(job),needs?'amber':complete?'green':''));
   info.append(title,el('p','setting-note',
    'AI development · '+(job.promptSource==='GIT_MAIN_CHAT1_PINNED'?
      'GitHub-pinned development instructions':'Local development instructions')+
    ' · Test evidence: '+(job.evidence?.state==='VERIFIED'?'Verified':
       'Not independently verified')));
   const open=b('Manage development',()=>void openAiJob(job.slug),'btn small');
   row.append(el('span','row-mark'+(needs?' warn':'')),info,open);holder.append(row);
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
    renderEmpty(holder,q.more?'No matches on this page. More recorded work may be available on subsequent pages.':
      'No matching verified local work records. This is not proof of remote health.');
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
  q.error?'Local journal unavailable':q.operations.length+q.incidents.length+q.aiJobs.length+q.readyItems.length+' journal, READY and AI records on this page · no remote success inferred';
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
 const releaseCommand=async(type,params)=>{
  if(type==='DISPATCH')return readPort('pcms-i13-release','DISPATCH',params,95000);
  if(type==='GET')return readPort('pcms-i13-release','GET',params,95000);
  if(type==='RECONCILE')return readPort('pcms-i13-release','RECONCILE',params,95000);
  throw Error('UNSUPPORTED_RELEASE_ACTION');
 };
 const renderPublication=out=>{
   status.textContent=out?.ok&&out.state==='CONFIRMED_PUBLIC'?
     'Published: independent owner, listing and exact-source readback verified.':
     out?.code==='PUBLICATION_ACTIVATION_HELD'?
     'Approval saved. Enable publication in Settings, then reopen this exact review to publish.':
     ['PUBLICATION_UNCERTAIN','DISPATCH_POSSIBLE','RECOVERY_HOLD'].includes(out?.state)?
     'Publication may have occurred. Only protected read-only reconciliation is permitted; no automatic retry.':
     'Publication not verified: '+(out?.code||'Unknown outcome')+'. Check current guarded state.';
 };
 let persisted;
 try{persisted=await releaseCommand('GET',{slug});}catch{persisted=null;}
 if(persisted?.ok&&persisted.state==='CONFIRMED_PUBLIC'){
   status.textContent='Published: independently confirmed for exact candidate '+persisted.sourceFingerprint+'.';
   return;
 }
 if(persisted?.ok&&['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(persisted.state)){
   status.textContent='Publication outcome uncertain. Do not send another publication effect.';
   const reconcile=b('Reconcile published state',()=>void (async()=>{
     reconcile.disabled=true;
     status.textContent='Checking protected source and listing without another write…';
     try{const row=await releaseCommand('GET',{slug});
       if(!row?.ok||!['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(row.state)){
         status.textContent='Current release record changed; reopen review.';return;
       }
       renderPublication(await releaseCommand('RECONCILE',{
         slug,expectedRevision:row.revision}));
     }catch{status.textContent='Independent publication readback unavailable. No write was retried.'}
     finally{reconcile.disabled=false;void loadQueue(true);}
   })(),'btn primary');
   body.append(reconcile);
   return;
 }
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
 const publish=async receipt=>{
  status.textContent='Revalidating exact candidate, route and Git source before the guarded publication…';
  const result=await advanceApprovedPublication({slug,approval:receipt,invoke:releaseCommand});
  renderPublication(result);
  await loadQueue(true);
 };
 const approve=b('Approve and publish exact candidate',()=>void (async()=>{
  if(!ack.checked){
   status.textContent='Inspect the exact source manifest and test observations before publication.';return;
  }
  if(!window.confirm('Approve and publish this exact candidate now? Only the currently verified owner, editor, route, Git revision and source can be used.'))return;
  approve.disabled=true;requestChanges.disabled=true;
  try{
   const r=await readPort('pcms-i13-release','APPROVE',{
    slug,expectedStageRevision:view.stageRevision,expectedJobRevision:view.jobRevision,
    fingerprint:view.sourceFingerprint,explicitApproval:true},95000);
   if(r?.ok&&r.state==='APPROVED')await publish(r);
   else status.textContent='Approval was not confirmed. No new publication was requested: '+(r?.code||'UNKNOWN')+'.';
  }catch{status.textContent='Approval outcome uncertain. Read the saved release record before any new request.'}
  finally{await loadQueue(true);}
 })(),'btn primary');
 footer.append(requestChanges,approve);
 if(persisted?.ok&&persisted.state==='APPROVED'&&
    persisted.sourceFingerprint===view.sourceFingerprint){
   // The exact approved record remains immutable; publishing it does not
   // require a second operator approval or a redundant source manifest crawl.
   approve.disabled=true;
   const resume=b('Publish previously approved candidate',()=>void (async()=>{
     if(!ack.checked){
       status.textContent='Inspect the exact source manifest and test observations before publication.';return;
     }
     if(!window.confirm('Publish the previously approved exact candidate now?'))return;
     resume.disabled=true;approve.disabled=true;
     await publish(persisted);
   })(),'btn primary');
   footer.append(resume);
 }
 body.append(instructions,checkLabel,footer);
}
// An operation inspector is a read-only projection. A possible dispatched
// effect cannot be retried from this drawer, even after browser restart.
function openReadyCandidate(candidate){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('div','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','READY candidate '+candidate.slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','READY · '+candidate.slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note',
   'This is a committed-main declaration, not evidence of a completed generator update.');
 status.setAttribute('role','status');
 const facts=el('dl');
 for(const [label,value] of [['Revision',String(candidate.revision)],
   ['Current source',candidate.active?.inputFingerprint?.slice(0,16)||'Unverified'],
   ['Pending source',candidate.desired?.inputFingerprint?.slice(0,16)||'None'],
   ['Safety hold',candidate.hold||'No local hold recorded']]){
  const row=el('div','kv');row.append(el('dt','',label),el('dd','',value));facts.append(row);
 }
 const actions=el('div','form-foot');
 async function act(type){
  if(type!=='ASSESS_READY'&&!window.confirm(
   type==='PREPARE_LOCAL'?
    'Prepare a local, revision-bound READY stage after verifying source, protected owner, route and current editor? This does not publish or save the remote generator.':
    type==='PAUSE_READY'?
    'Pause automatic development for this READY generator? In-flight uncertain provider writes remain held.':
    'Resume guarded READY eligibility? No remote effect occurs from this acknowledgment.'))return;
  [...actions.querySelectorAll('button')].forEach(x=>x.disabled=true);
  status.textContent=type==='ASSESS_READY'?
    'Checking current pinned main, owner, source, Persona and editor admission…':
    'Sending a revision-fenced guarded request. No provider outcome inferred.';
  try{
   const out=await readPort('pcms-s05-ready-operator',type,{
     slug:candidate.slug,expectedRevision:candidate.revision},95000);
   const friendly={
    S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED:'This public generator must first complete its protected sleep/unlisting workflow.',
    S05_NONEMPTY_TARGET_REQUIRES_RECOVERABLE_PREDECESSOR:'A recoverable previous source is required before this update.',
    S05_LOCAL_STAGE_PINNED:'A new exact local development stage is prepared. AI execution is separate.',
    S05_EDITOR_AND_NATIVE_ADMISSION_REQUIRED:'The editor and native AI prerequisites require separate verification.',
    READY_OPERATOR_PAUSED:'This generator is paused.',
    READY_REVOKED_NOT_READY:'The latest committed main is no longer READY.',
    STALE_REVISION:'The candidate changed. Reload the queue before acting again.'
   };
   status.textContent=friendly[out?.code]||(out?.ok?
      'Assessment or local-stage request recorded. Its real provider effects remain separately guarded.':
      'This operation cannot proceed until the current owner, source and protected editor are verified.');
  }catch{status.textContent='Outcome unavailable. Refresh the READY candidate before another action.'}
  await loadQueue(true);
 }
 const assess=b('Assess prerequisites',()=>void act('ASSESS_READY'),'btn small');
 const prepare=b('Prepare local development',()=>void act('PREPARE_LOCAL'),'btn primary');
 const pause=b(candidate.hold==='OPERATOR_PAUSED'?'Resume READY work':'Pause READY work',
  ()=>void act(candidate.hold==='OPERATOR_PAUSED'?'RESUME_READY':'PAUSE_READY'),'btn small');
 actions.append(assess,prepare,pause);body.append(facts,status,actions);panel.append(head,body);
 overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 assess.focus();
}
function humanAiStatus(job){
 const names={
  PENDING_NATIVE_SESSION:'Ready for guarded AI execution',
  HELD_RECONCILE:'Session outcome needs reconciliation',
  TESTS_UNVERIFIED:'Independent tests still required',
  TESTS_VERIFIED:'Tests independently verified',
  KNOWN_FAILURE:'Known failure — repair review',
  HELD_NO_PROGRESS:'Development held',
  HUMAN_OWNED:'Human-owned work',
  PREPARED:'Prepared',
  RUNNING:'In progress'
 };
 if(job.nativeState==='RUNNING_OBSERVED')return 'AI session running';
 return names[job.state]||'Development needs inspection';
}
// All progression remains in the original trusted I10 backend: operator inputs
// are limited to a slug, current revision and named native capability. Neither
// the UI nor AI text can self-assert tests, Git writes or publication.
async function openAiJob(slug){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('div','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','AI development for '+slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Develop · '+slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note','Checking the current exact AI job…');
 status.setAttribute('role','status');body.append(status);
 const metadata=el('dl'),actions=el('div','form-foot');
 body.append(metadata,actions);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 head.querySelector('button')?.focus();
 let pending=false;
 async function load(){
  metadata.replaceChildren();actions.replaceChildren();
  let j;try{j=await readPort('pcms-i10-ai','GET_JOB',{slug},22000)}catch{}
  if(!overlay.isConnected)return;
  if(!j?.ok){status.textContent='Canonical AI job unavailable. No action can be authorized.';return;}
  status.textContent=humanAiStatus(j)+
    '. Protected owner, clean-editor, session and source-readback checks are applied independently.';
  for(const [label,value] of [
   ['Current revision',String(j.revision)],['Saved source',j.sourceFingerprint?.slice(0,16)||'Not verified'],
   ['Prompt version',String(j.promptRevision??'Unavailable')],
   ['Native state',(j.nativeState||'Not started').replaceAll('_',' ').toLowerCase()],
   ['Tests',j.evidence?.state||'Unverified'],
   ['Provider outcome',j.hold||'No independent effect receipt loaded']]){
    const row=el('div','kv');row.append(el('dt','',label),el('dd','',value));metadata.append(row);
  }
  const opts=[
   ['Continue development','ADVANCE_JOB',null,
    !j.slotReleased&&!['TESTS_VERIFIED','HELD_NO_PROGRESS','HUMAN_OWNED'].includes(j.state)],
   ['Start Chat 1','BEGIN_NATIVE','CHAT1_SEND',j.state==='PENDING_NATIVE_SESSION'],
   ['Stop running session','BEGIN_NATIVE','STOP',j.nativeState==='RUNNING_OBSERVED'],
   ['Reconcile session','PROBE_NATIVE',null,
    ['HELD_RECONCILE','TESTS_UNVERIFIED','KNOWN_FAILURE'].includes(j.state)],
   ['Run independent tests','RUN_TESTS',null,j.state==='TESTS_UNVERIFIED'],
   ['Inspect Chat 2 workspace','INSPECT_WORKSPACE',null,
    j.nativeState==='CHAT2_OBSERVED_IDLE'&&!j.chat2IsolationVerified],
   ['Verify fresh Chat 2','VERIFY_FRESH_CHAT2',null,
    j.nativeState==='CHAT2_OBSERVED_IDLE'&&!j.chat2IsolationVerified],
   ['Repair observed failure','BEGIN_NATIVE',
    j.nativeState==='CHAT2_OBSERVED_IDLE'?'CHAT2_REPAIR':'CHAT1_REPAIR',
    j.state==='KNOWN_FAILURE'&&
    (j.nativeState==='CHAT1_OBSERVED_IDLE'||(j.nativeState==='CHAT2_OBSERVED_IDLE'&&j.chat2IsolationVerified))],
   ['Reset Chat 2','BEGIN_NATIVE','CHAT2_RESET',j.evidence?.chat1Pass===true],
   ['Start Chat 2','BEGIN_NATIVE','CHAT2_SEND',j.optionalTestingSha!==null]
  ];
  for(const [label,type,step,allowed] of opts){
   if(!allowed)continue;
   const button=b(label,()=>void(async()=>{
    if(pending)return;
    const mutates=['ADVANCE_JOB','BEGIN_NATIVE','RUN_TESTS','VERIFY_FRESH_CHAT2'].includes(type)&&step!=='STOP';
    if(mutates&&!window.confirm(
      'Run the selected guarded '+label.toLowerCase()+' step for '+slug+
      '? The exact AI job revision, protected account/route, source and native session are revalidated. A lost acknowledgment is never authorization to resend.'))return;
    pending=true;actions.querySelectorAll('button').forEach(x=>x.disabled=true);
    status.textContent=type==='PROBE_NATIVE'?
      'Reading the current session without sending again…':
      'Checking the exact job and protected runtime. No result is assumed from an acknowledgment.';
    try{
     const out=await readPort('pcms-i10-ai',type,{
      slug,expectedRevision:j.revision,...(step?{step}:{})},95000);
     status.textContent=out?.ok?
      type==='RUN_TESTS'?
       'Test command completed. Review independently observed assertion results and current job state.':
       'Controller response recorded. Reloading independently verified current job state.':
      'Action held or result unconfirmed. Read the current job before any further effect.';
    }catch{
     status.textContent='The outcome is uncertain. Do not resend a native AI command; reconcile the current session first.';
    }finally{pending=false;await load();void loadQueue(true);}
   })(),'btn small');
   actions.append(button);
  }
  if(!actions.children.length)
   actions.append(el('p','setting-note','No additional native step is currently eligible. Check the protected source or recoverable session.'));
 }
 await load();
}
function openAiPreparation(){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('div','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','Prepare verified AI development job');
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Prepare development'),b('Close',close));
 const body=el('div','drawer-body'),help=el('p','setting-note',
  'Use a generator with an independently verified private stage. PCMS reads the pinned GitHub instructions and saved-source revision before preparing the AI job.');
 const slug=el('input','form-input');slug.placeholder='generator-slug';
 slug.value=state.queue.query&&/^[a-z0-9-]{1,100}$/.test(state.queue.query)?state.queue.query:'';
 slug.setAttribute('aria-label','Generator slug for development');
 const status=el('p','setting-note','No job prepared.');status.setAttribute('role','status');
 const action=b('Verify stage and prepare',()=>void(async()=>{
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug.value)){
   status.textContent='Enter a valid lowercase generator name.';return;}
  action.disabled=true;status.textContent='Verifying private saved source and current stage revision…';
  try{
   const stage=await readPort('pcms-i09-staging','GET_STAGE',{slug:slug.value},16000);
   if(!stage?.ok||!Number.isSafeInteger(stage.revision)){
    status.textContent='Private source stage not independently verified. Finish source staging first.';return;}
   const out=await readPort('pcms-i10-ai','PREPARE_JOB',{
    slug:slug.value,expectedStageRevision:stage.revision},95000);
   status.textContent=out?.ok?
    'Exact development job prepared. AI execution and tests remain separately guarded.':
    'Preparation held. Check the stage, account, protected route and GitHub connection.';
   await loadQueue(true);
  }catch{status.textContent='Job preparation result uncertain. Check the canonical queue before retrying.'}
  finally{action.disabled=false}
 })(),'btn primary');
 body.append(help,slug,action,status);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 slug.focus();
}
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
  if(!window.confirm('Read the saved browser credential inside the background process, independently verify this exact private GitHub repository identity, and repair only local connection metadata? No token is exported; no remote write occurs.'))return;
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
    remoteRequested:report.remoteRequested,rows:report.rows.filter(row=>!['NATIVE_VAULT_HOST','BACKUP_HOST','DIAGNOSTIC_HOST','SECRET_SERVICE_ENVIRONMENT','SECRET_SERVICE'].includes(row.component)).map(row=>
      Object.fromEntries(keys.map(k=>[k,row[k]??null])))};
  const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});
  const uri=URL.createObjectURL(blob);const anchor=document.createElement('a');
  anchor.href=uri;anchor.download='pcms-readiness-sanitized.json';anchor.click();
  setTimeout(()=>URL.revokeObjectURL(uri),1000);
 },'btn small');
 exportButton.disabled=!state.readiness?.ok||state.readinessBusy;
 controls.append(local,remote,reconcile,exportButton);section.append(controls);
 const pendingGit=state.readiness?.rows?.some(r=>r.component==='GIT_PARTIAL_CONNECTION'&&r.state==='OUTCOME_UNCERTAIN');
 const vaultReachable=state.readiness?.rows?.some(r=>r.component==='BROWSER_GIT_STORE'&&r.state==='VERIFIED');
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
  const pending=state.readiness.rows.some(row=>row.component==='GIT_PARTIAL_CONNECTION'&&row.state==='OUTCOME_UNCERTAIN');
  summary.textContent=pending?
    'An interrupted GitHub connection needs read-only reconciliation.':
    'Readiness checked. Browser-local status is separate from independent provider and restore evidence.';
 }
 section.append(summary);
 const details=el('details','settings-section');
 const rows=(state.readiness?.rows||[]).filter(r=>!['NATIVE_VAULT_HOST','BACKUP_HOST','DIAGNOSTIC_HOST','SECRET_SERVICE_ENVIRONMENT','SECRET_SERVICE'].includes(r.component));
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
 state.readinessBusy=true;
 if(state.route==='settings'&&state.settings==='diagnostics')renderReadinessPanel(shadow('.settings-main'));

 try{
  const snapshot=await readPort('pcms-r3-readiness','CHECK',{remote},95000);
  if(!snapshot?.ok){state.readiness=snapshot;return;}
  // These existing canonical ports are independent of Git/native diagnosis.
  // They must not be converted into proof of a protected route or source save.
  const replies=await Promise.allSettled([accounts(),refresher({phase:'ALL',offset:0,limit:1}),portableBackupCommand({action:'STATUS'})]);
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
  const portable=replies[2].status==='fulfilled'?replies[2].value:null;
  snapshot.rows.push(make('PORTABLE_BACKUP_RUNTIME',portable?.ok?'VERIFIED':'UNREACHABLE',
    portable?.ok?'BROWSER_PORTABLE_BACKUP_RESPONDED':(portable?.code||'PORTABLE_BACKUP_UNAVAILABLE'),
    'PCMS_I15_PORTABLE','Only browser receipt readback is verified; reopen the downloaded file and inspect restoration separately.'));
  state.readiness=snapshot;
 }catch{state.readiness={ok:false,code:'READINESS_TRANSPORT_UNAVAILABLE'};}
 finally{state.readinessBusy=false;
  if(state.route==='settings'&&state.settings==='diagnostics')renderReadinessPanel(shadow('.settings-main'));
 }
}
function primarySettingCard(container,title,intro){
 const section=el('section','card settings-group'),header=el('h2','h2',title);
 section.append(header,el('p','setting-note',intro));container.append(section);
 return section;
}
// The protected catalog boundary returns one independently complete pinned
// main. Display its actual initial import scope and canonical prompt without
// inferring remote ownership, deletion, creation or publication.
function renderConnectedMain(section,snapshot){
 section.querySelector('[data-main-review]')?.remove();
 if(!snapshot?.ok||snapshot.complete!==true)return;
 const panel=el('section','settings-section');panel.dataset.mainReview='1';
 const summary=el('h3','','GitHub main · '+snapshot.recognizedCount+' recognized folders');
 const info=el('p','setting-note',
  'This is a complete read-only GitHub file snapshot. Generator ownership and live publication need separate verification.');
 panel.append(summary,info);
 const preview=snapshot.preview||{},items=preview.items||[];
 const listing=el('details','settings-section');listing.append(el('summary','','Review folder declarations and owner evidence'));
 const search=el('input','form-input');search.placeholder='Find a generator folder';search.maxLength=100;
 search.setAttribute('aria-label','Find GitHub generator folder');
 const list=el('div','queue-list'),pagination=el('div','form-foot');
 let offset=0;
 const prev=b('Previous',()=>{offset=Math.max(0,offset-30);draw()},'btn small');
 const next=b('Next',()=>{offset+=30;draw()},'btn small');
 const count=el('span','setting-note','');
 function draw(){
  list.replaceChildren();const query=search.value.trim().toLowerCase();
  const filtered=items.filter(x=>x.slug?.toLowerCase().includes(query));
  if(offset>=filtered.length)offset=Math.max(0,Math.floor(Math.max(0,filtered.length-1)/30)*30);
  const visible=filtered.slice(offset,offset+30);
  for(const item of visible){
   const row=el('div','queue-item'),data=el('div','row-body');
   data.append(el('strong','',item.slug),
    el('p','setting-note',
      (item.sourceState==='READY_UNVERIFIED_COHERENCE'?
       'READY declaration detected; source verification remains separate.':
       'Source declaration: '+String(item.sourceState||'not confirmed').replaceAll('_',' ').toLowerCase())+
      ' · '+(item.observed==='AMBIGUOUS'?'Account or owner not independently verified':
       'Owner observation: '+String(item.observed||'not confirmed').replaceAll('_',' ').toLowerCase())));
   row.append(data);list.append(row);
  }
  if(!visible.length)list.append(el('p','setting-note','No folder matches this search in the complete GitHub snapshot.'));
  count.textContent=filtered.length+' recognized folder(s) · '+(filtered.length?offset+1:0)+
   '–'+Math.min(offset+visible.length,filtered.length)+' shown';
  prev.disabled=offset===0;next.disabled=offset+30>=filtered.length;
 }
 search.addEventListener('input',()=>{offset=0;draw()});
 pagination.append(prev,next,count);listing.append(search,list,pagination);panel.append(listing);draw();
 if(preview.scopeDigest&&snapshot.importStatus!=='IMPORT_SCOPE_APPROVED'){
  const approval=b('Approve inspected inventory scope',()=>void(async()=>{
   if(!window.confirm('Approve this EXACT GitHub main folder inventory for local recognition? This does not create, rename, publish or allocate remote generators, and owner checks remain mandatory.'))return;
   approval.disabled=true;
   try{
    const r=await readPort('pcms-s03-catalog','APPROVE_IMPORT',{
     repositoryId:snapshot.repositoryId,scopeDigest:preview.scopeDigest},30000);
    info.textContent=r?.ok?
     'Exact initial GitHub folder scope approved. Account ownership and deployment remain separately unverified.':
     'Folder-scope approval could not be confirmed. Read main again before retrying.';
   }catch{info.textContent='Import approval result uncertain; re-scan before any further action.'}
   finally{approval.disabled=false}
  })(),'btn primary');
  panel.append(approval);
 }
 if(snapshot.prompt?.state==='PRESENT'&&typeof snapshot.prompt.text==='string'){
  const box=el('details','settings-section');
  box.append(el('summary','','Canonical Chat 1 prompt · GitHub-controlled'));
  box.append(el('p','setting-note',
   'The committed main prompt remains authoritative. Local drafts cannot change it without an explicit conditional Git commit and independent readback.'));
  const draft=el('textarea','form-input');draft.rows=10;draft.value=snapshot.prompt.text;
  draft.setAttribute('aria-label','Canonical Chat 1 prompt draft');
  const notes=el('p','setting-note','GitHub source loaded. No remote write was submitted. Saving a draft only changes local PCMS settings.');
  notes.setAttribute('role','status');
  const controls=el('div','form-foot');
  let base={repositoryId:snapshot.repositoryId,head:snapshot.head,oid:snapshot.prompt.oid},
   revision=0,dirty=false,uncertain=false,committed=false,loading=false;
  draft.addEventListener('input',()=>{dirty=true;});
  const save=b('Save local prompt draft',()=>void(async()=>{
   if(loading||!draft.value.trim()||draft.value.length>131072)return;
   loading=true;save.disabled=true;notes.textContent='Saving the local draft; GitHub remains unchanged.';
   try{
    const r=await readPort('pcms-s03-catalog','SAVE_PROMPT_DRAFT',{
      repositoryId:base.repositoryId,expectedRevision:revision,
      baseOid:base.oid,text:draft.value},20000);
    if(r?.ok){revision=r.revision;dirty=false;
     notes.textContent='Local prompt draft saved. GitHub main remains unchanged.'}
    else notes.textContent='Draft was not confirmed. Preserve your text and reload the current draft before retrying.';
   }catch{notes.textContent='Draft storage outcome uncertain. Preserve your edits and reload before retrying.'}
   finally{loading=false;save.disabled=false}
  })(),'btn small');
  const commit=b('Commit reviewed prompt to GitHub main',()=>void(async()=>{
   if(loading||revision<1||dirty||uncertain||committed){notes.textContent='Save and verify the current draft, then confirm the latest GitHub main before a new commit.';return}
   if(!window.confirm('Commit this exact saved Chat 1 prompt to the verified GitHub main? PCMS uses a revision-checked nonforced write, independent readback and no blind retry.'))return;
   loading=true;commit.disabled=true;notes.textContent='Checking standing Git permission and exact main revision…';
   try{
    const r=await readPort('pcms-s03-catalog','COMMIT_PROMPT',{
      repositoryId:base.repositoryId,expectedRevision:revision,
      expectedHead:base.head},95000);
    uncertain=!r?.ok&&r?.code==='PROMPT_GIT_UNCERTAIN_RECONCILE_REQUIRED';
    if(r?.ok)committed=true;
    notes.textContent=r?.ok?
      'Committed prompt verified on GitHub main. Re-scan before further source work.':
      uncertain?'Commit outcome uncertain. Use read-only reconciliation; do not retry the write.':
      'Commit held; GitHub source has not been independently verified. Preserve this draft.';
   }catch{uncertain=true;notes.textContent='GitHub commit outcome unknown. Do not resend. Reconcile the exact write first.'}
   finally{loading=false;commit.disabled=committed||uncertain}
  })(),'btn primary');
  const reconcile=b('Reconcile possible Git commit',()=>void(async()=>{
   if(loading)return;
   loading=true;reconcile.disabled=true;notes.textContent='Observing current GitHub history and exact prompt bytes without a write…';
   try{
    const r=await readPort('pcms-s03-catalog','RECONCILE_PROMPT',{
      repositoryId:base.repositoryId},60000);
    if(r?.ok){uncertain=false;committed=true;commit.disabled=true;
      notes.textContent='Prior Git prompt commit independently verified. Read main again before editing.'}
    else notes.textContent='Git prompt outcome remains unverified. No write was repeated.';
   }catch{notes.textContent='Read-only reconciliation unavailable. Preserve the original draft and uncertainty hold.'}
   finally{loading=false;reconcile.disabled=false}
  })(),'btn small');
  controls.append(save,commit,reconcile);
  box.append(draft,controls,notes);panel.append(box);
  void (async()=>{
   try{
    const r=await readPort('pcms-s03-catalog','GET_PROMPT_DRAFT',{},20000);
    if(!panel.isConnected||dirty)return;
    if(r?.ok){
     draft.value=r.record.text;revision=r.record.revision;
     uncertain=['DISPATCH_POSSIBLE','UNCERTAIN'].includes(r.record.effect?.state);
     if(r.record.baseOid!==base.oid){
      uncertain=true;notes.textContent='Saved draft is based on a different main revision. Reconcile before any commit.';
     }else notes.textContent='Existing local draft loaded. GitHub main remains authoritative.';
    }
   }catch{}
  })();
 }
 section.append(panel);
}
function primaryConnections(container){
 const section=primarySettingCard(container,'GitHub',
  'Connect once to the configured private repository. PCMS reads committed main only.');
 section.dataset.gitConnection='1';
 const form=el('div','pcms-git-connection-form');
 const repo=el('input','form-input');repo.value='Neb963/per-gens';repo.readOnly=true;
 repo.setAttribute('aria-label','Managed GitHub repository');
 const credential=el('input','form-input');credential.type='password';
 credential.autocomplete='new-password';credential.spellcheck=false;
 credential.placeholder='GitHub access token';credential.setAttribute('aria-label','GitHub access token');
 const tokenField=el('label','field');tokenField.append(el('span','','Access token'),credential);
 const status=el('p','setting-note','Checking saved connection…');status.setAttribute('role','status');
 const actions=el('div','pcms-settings-actions');
 let busy=false,view=null;
 const setBusy=value=>{
  busy=value;
  connect.disabled=value||view?.interrupted===true;
  inspect.disabled=value||!view?.configured||view?.interrupted===true;
  reconcile.disabled=value||!view?.canRecover;
  repair.disabled=value||!view?.canRecover;
 };
 const connect=b('Connect',()=>void perform('CONNECT_GIT'),'btn primary');
 const inspect=b('Read GitHub main',()=>void (async()=>{
  if(busy)return;setBusy(true);status.textContent='Reading the committed main inventory…';
  try{
   const out=await readPort('pcms-s03-catalog','SCAN_CONNECTED',{},95000);
   status.textContent=out?.ok&&out.complete?
     out.recognizedCount+' generator folders found on GitHub main.':
     'GitHub main could not be verified. No source was changed.';
   if(out?.ok&&out.complete)renderConnectedMain(section,out);
  }catch{status.textContent='GitHub read-only scan unavailable. No remote change was made.'}
  finally{setBusy(false)}
 })(),'btn small');
 const recovery=el('div','pcms-git-recovery');recovery.hidden=true;
 recovery.append(el('h3','h3','Finish interrupted connection'));
 const guidance=el('p','setting-description',
  'First verify any credential saved before the interruption. If it is missing, enter a token above and finish setup. Neither action writes to GitHub.');
 const recoveryActions=el('div','pcms-settings-actions');
 const reconcile=b('Reconcile saved access',()=>void(async()=>{
  if(busy)return;setBusy(true);status.textContent='Checking the saved credential and repository identity…';
  try{
   const out=await readPort('pcms-s03-catalog','RECONCILE_GIT',{},30000);
   if(out?.ok){status.textContent='GitHub connection recovered and verified.';await refreshConnection({retainStatus:true});}
   else status.textContent=out?.code==='GIT_RECONCILIATION_CREDENTIAL_UNAVAILABLE'?
     'No usable saved credential was found. Enter your token and select Finish setup.':
     friendlyConnectionIssue(out?.code);
  }catch{status.textContent='Recovery could not be confirmed. No write was repeated.'}
  finally{setBusy(false)}
 })(),'btn small');
 const repair=b('Finish setup with token',()=>void perform('RECOVER_GIT_CONNECTION'),'btn primary');
 recoveryActions.append(reconcile,repair);recovery.append(guidance,recoveryActions);
 async function perform(type){
  if(busy)return;
  const token=credential.value;
  if(!token){status.textContent='Enter a GitHub token to continue.';credential.focus();return}
  if(type==='RECOVER_GIT_CONNECTION'&&
     !window.confirm('Finish the interrupted GitHub connection with this token? The previous credential may be replaced. No GitHub files will change.'))return;
  // Clear the input before any asynchronous boundary call. Never log it.
  credential.value='';setBusy(true);
  status.textContent=type==='RECOVER_GIT_CONNECTION'?'Finishing the interrupted connection…':'Verifying GitHub access…';
  try{
   const out=await readPort('pcms-s03-catalog',type,{
     repository:repo.value,token,
     ...(type==='RECOVER_GIT_CONNECTION'?{acknowledgeCredentialReplacement:true}:{})
   },30000);
   status.textContent=out?.ok?'GitHub access saved. You can now read main.':
     out?.code==='GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED'?
     'Setup was interrupted. Use the recovery actions directly below.':
     out?.code==='GITHUB_AUTH_REJECTED'?'GitHub rejected this token. Check its access to the repository.':
     'Connection not confirmed. '+friendlyConnectionIssue(out?.code);
   await refreshConnection({retainStatus:true});
  }catch{
   status.textContent='Connection result uncertain. Use Reconcile saved access before another attempt.';
   await refreshConnection({retainStatus:true});
  }finally{setBusy(false)}
 }
 async function refreshConnection({retainStatus=false}={}){
  let result;
  try{result=await readPort('pcms-s03-catalog','GET_CONNECTION_STATE',{},12000)}
  catch{if(!retainStatus)status.textContent='Connection status unavailable. No changes made.';return}
  if(!section.isConnected||!result?.ok){if(!retainStatus)status.textContent='Connection status unavailable.';return}
  view=result;
  const pending=result.interrupted===true;
  recovery.hidden=!pending;
  connect.hidden=pending;
  inspect.disabled=busy||pending||!result.configured;
  repair.disabled=busy||!result.canRecover;
  reconcile.disabled=busy||!result.canRecover;
  if(!retainStatus)status.textContent=pending?
    'A previous connection setup was interrupted. Reconcile the saved credential or finish with a token below.':
    result.configured?'GitHub connection saved. Read main to verify current files.':
    'Not connected. Enter a GitHub token to connect.';
 }
 actions.append(connect,inspect);form.append(repo,tokenField,actions,status,recovery);
 section.append(form);
 void refreshConnection();
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
 const jobsSection=el('section','settings-section');
 jobsSection.append(el('h3','h3','Managed AI development'));
 const jobsInfo=el('p','setting-note',
  'Recorded AI jobs are source- and account-bound. A visible status is not evidence of a finished provider response.');
 jobsSection.append(jobsInfo);
 const jobs=el('div','queue-list'),pager=el('div','form-foot');
 let cursor='',history=[],nextCursor=null,loading=false;
 function jobLabel(state){
  return ({READY:'Ready for guarded progression',WAITING:'Waiting',
   HELD:'Paused for verification',COMPLETE:'Completed locally',
   SOURCE_VERIFIED:'Source verification recorded',FAILED:'Needs operator review',
   RUNNING:'Development in progress'})[state]||
    'Recorded AI state — inspect evidence';
 }
 async function showJobs(){
  if(loading)return;loading=true;jobs.replaceChildren();
  const msg=el('p','setting-note','Reading canonical development jobs…');
  jobs.append(msg);pager.replaceChildren();
  try{
   const r=await readPort('pcms-i10-ai','LIST_JOBS',{after:cursor,limit:15},20000);
   if(!jobsSection.isConnected)return;
   jobs.replaceChildren();
   if(!r?.ok){jobs.append(el('p','setting-note',
     'AI development records are unavailable. No provider activity was inferred.'));return}
   nextCursor=r.more?r.nextCursor:null;
   if(!r.jobs?.length)jobs.append(el('p','setting-note','No recorded AI jobs on this page.'));
   for(const job of r.jobs||[]){
    const row=el('div','queue-item'),body=el('div','row-body');
    body.append(el('strong','',job.slug),el('p','setting-note',jobLabel(job.state)+
      ' · source and test evidence must be verified separately.'));
    const action=b('Inspect',()=>void (async()=>{
     action.disabled=true;
     try{
      const current=await readPort('pcms-i10-ai','GET_JOB',{slug:job.slug},25000);
      if(!current?.ok){jobsInfo.textContent='The current AI record was not verified.';return}
      const j=current;
      jobsInfo.textContent=j.slug+' — '+jobLabel(j.state)+
       '; native session: '+(j.nativeState==='NOT_STARTED'?'not started':
        j.nativeState==='RUNNING'?'in progress':'needs verification')+
       '; required test evidence: '+(j.evidence?.status||'not independently verified')+
       '. Current source is revision '+j.revision+'.';
     }catch{jobsInfo.textContent='AI job could not be inspected. No remote state was inferred.'}
     finally{action.disabled=false}
    })(),'btn small');
    const advance=b('Advance guarded step',()=>void (async()=>{
     if(!window.confirm('Run one explicitly guarded AI development step for '+job.slug+'? This may contact Perchance or change its private editor. It will not publish or automatically retry a possibly completed effect.'))return;
     advance.disabled=true;
     try{
      const result=await readPort('pcms-i10-ai','ADVANCE_JOB',{
       slug:job.slug,expectedRevision:job.revision},110000);
      jobsInfo.textContent=result?.ok?
       'One protected development step was recorded for '+job.slug+
       '. Re-read the job before taking another action.':
       'The next development step was held or not confirmed. Read current job state before retrying.';
     }catch{jobsInfo.textContent='Development-step outcome uncertain. Do not retry without independent reconciliation.'}
     finally{advance.disabled=false;await showJobs()}
    })(),'btn small');
    if(['COMPLETE','HELD','FAILED'].includes(job.state))advance.disabled=true;
    row.append(body,action,advance);jobs.append(row);
   }
   const back=b('Previous jobs',()=>{const prev=history.pop();if(prev===undefined)return;
    cursor=prev;void showJobs()},'btn small');
   back.disabled=history.length===0;
   const next=b('More jobs',()=>{if(!nextCursor)return;
    history.push(cursor);cursor=nextCursor;void showJobs()},'btn small');
   next.disabled=!nextCursor;
   pager.append(back,next);
  }catch{jobs.replaceChildren(el('p','setting-note',
    'The local AI job journal did not respond. No work has been initiated.'))}
  finally{loading=false}
 }
 jobsSection.append(jobs,pager);section.append(jobsSection);
 void showJobs();
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
// I16 restore remains implemented by the original protected stage runner.
// This primary workflow mirrors its encrypted files and explicit review
// controls; it never reimplements or bypasses the restore gate.
function primaryRestore(container){
 const section=primarySettingCard(container,'Restore portable backup',
   'Inspect the complete plain archive and an independent pre-restore checkpoint. Imported routes, sessions and publication rights remain inactive.');
 const tpl=document.createElement('template');tpl.innerHTML=portableRestoreTemplate;
 const form=tpl.content.firstElementChild;
 form.className='form-stack';
 for(const input of form.querySelectorAll('input:not([type=checkbox]), select, textarea'))
   input.classList.add('form-input');
 for(const button of form.querySelectorAll('button'))button.classList.add('btn','small');
 section.append(form);
 // Reuse A02's exact production inspection, destination snapshot, CAS, and
 // inactive restore logic, scoped to the visible primary container.
 mountPortableRestore(section);
}
// A02's single background backup runner also handles these primary UI controls.
// A disconnected port or lost ACK is not evidence a download did not occur.
function portableBackupCommand(message,timeoutMs=90000){
 return new Promise(resolve=>{
  let port,settled=false;
  const timer=setTimeout(()=>finish({ok:false,code:'BACKUP_RESULT_UNKNOWN'}),timeoutMs);
  function finish(value){
   if(settled)return;settled=true;clearTimeout(timer);
   try{port?.disconnect()}catch{}
   resolve(value);
  }
  try{
   port=browser.runtime.connect({name:'pcms-i15-backup'});
   port.onMessage.addListener(finish);
   port.onDisconnect.addListener(()=>finish({ok:false,code:'BACKUP_RESULT_UNKNOWN'}));
   port.postMessage(message);
  }catch{finish({ok:false,code:'BACKUP_PORT_UNAVAILABLE'});}
 });
}
function primaryBackups(container){
 const section=primarySettingCard(container,'Portable backup',
  'Passwordless, unencrypted, source-complete archive. Firefox download completion does not independently verify disk bytes.');
 const status=el('p','setting-note','Reading portable backup receipts…');status.setAttribute('role','status');
 const actions=el('div','form-foot');
 const dailyLabel=el('label','setting-option');
 const daily=el('input');daily.type='checkbox';
 dailyLabel.append(daily,document.createTextNode(' Daily automatic backups (up to 14 tracked copies)'));
 section.append(dailyLabel,actions,status);
 const run=async (message,feedback)=>{
  for(const button of actions.querySelectorAll('button'))button.disabled=true;
  status.textContent=feedback;
  try{
   const r=await portableBackupCommand(message);
   if(r?.ok&&message.action==='ENABLE')daily.checked=r.enabled===true;
   status.textContent=r?.ok?
    message.action==='MANUAL'&&r.code==='BROWSER_REPORTED_COMPLETE'?
     'Firefox reports the archive download completed: '+r.bytes+' bytes, SHA-256 '+r.sha256+'. Independent disk readback not performed.':
     'Backup operation: '+(r.code||r.status||'ACKNOWLEDGED')+'. Check receipts before repeating uncertain effects.':
    'Backup held: '+(r?.code||'BACKUP_RESULT_UNKNOWN')+'. No additional download will be inferred or replayed.';
  }catch{status.textContent='Backup result uncertain. Check durable receipts and Firefox Downloads before retrying.'}
  finally{for(const button of actions.querySelectorAll('button'))button.disabled=false;}
 };
 const manual=b('Download complete backup',()=>void run({action:'MANUAL'},'Collecting exact source, sessions and recovery records…'),'btn primary');
 const save=b('Save daily schedule',()=>void run({action:'ENABLE',enabled:daily.checked},'Updating persistent daily schedule…'),'btn small');
 const now=b('Run daily backup now',()=>void run({action:'RUN_NOW'},'Checking durable backup schedule and receipts…'),'btn small');
 const refresh=b('Check receipts',()=>void (async()=>{
  const r=await portableBackupCommand({action:'STATUS'});
  if(!r?.ok){status.textContent='Backup status unavailable: '+(r?.code||'UNKNOWN');return}
  daily.checked=r.enabled===true;
  const manual=r.manual?(' Last manual: '+r.manual.status+' ('+r.manual.code+').'):'';
  status.textContent='Daily: '+(r.status||r.code||'NOT_OBSERVED')+
   '. Tracked successes: '+(r.retained??'unknown')+'.'+manual+
   ' Unknown download effects are held rather than repeated.';
 })(),'btn small');
 const audit=b('Audit stored source',()=>void (async()=>{
  audit.disabled=true;let db;
  try{
   db=await openCanonicalDatabase();
   const auditState=await snapshotCanonicalV2(db,{serializedValues:true});
   const outcome=await preflightSourceRecovery(auditState);
   status.textContent='Local source closure: '+outcome.manifests+' manifests, '+
    outcome.uniqueBlobs+' blobs, '+outcome.uniqueBytes+' bytes. No disk-backup proof implied.';
  }catch(error){status.textContent='Source audit held: '+String(error?.message||'UNKNOWN').slice(0,90)}
  finally{try{db?.close()}catch{}audit.disabled=false}
 })(),'btn small');
 actions.append(manual,save,now,refresh,audit);
 void refresh.click();
 primaryRestore(container);
}
function primaryDiagnostics(container){
 const section=primarySettingCard(container,'Operational diagnostics',
  'Runs through real guarded services for explicitly designated disposable resources. External process and disk evidence is NOT_TESTED unless independently measured.');
 const tpl=document.createElement('template');tpl.innerHTML=diagnosticTemplate;
 const form=tpl.content.firstElementChild;form.className='form-stack';
 for(const input of form.querySelectorAll('input:not([type=checkbox]), select, textarea'))
   input.classList.add('form-input');
 for(const button of form.querySelectorAll('button'))button.classList.add('btn','small');
 section.append(form);
 mountDiagnosticController(section);
}
function renderSettingsSection(){if(state.route!=='settings')return;
 const names=['connections','automation','ai','backups','diagnostics','advanced'];
 const select=names.includes(state.settings)?state.settings:'connections';
 for(const b of page().querySelectorAll('[data-settings]')){b.classList.toggle('active',b.dataset.settings===select);b.setAttribute('aria-current',b.dataset.settings===select?'page':'false')}
 const container=shadow('.settings-main');if(!container)return;
 // Each category owns its visible form. Do not rehydrate obsolete hidden service cards.
 if(select==='connections'){
  // Never mirror old service rows or native-host installation instructions.
  // The Git connection and its recovery live on the same visible Settings page.
  container.replaceChildren();
  primaryConnections(container);
  const routing=primarySettingCard(container,'PersonaMonkey routing',
    'Account protection and route verification are managed by PersonaMonkey.');
  routing.append(b('Open Accounts',()=>routeTo('accounts'),'btn small'));
  const backup=primarySettingCard(container,'Portable backups',
    'Use the browser-native manual and daily backup controls in Backup & Restore.');
  backup.append(b('Open Backup & Restore',()=>{
    state.settings='backups';renderSettingsSection();
  },'btn small'));
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
     'Optional Firefox userScripts permission and PersonaMonkey maintenance controls.'));
   const grant=b('Enable userScripts permission',()=>{
     if(!browser.permissions?.request){notify('Firefox permission request unavailable.');return}
     void browser.permissions.request({permissions:['userScripts']})
       .then(ok=>notify(ok?'userScripts permission granted.':'userScripts permission was not granted.'))
       .catch(()=>notify('Firefox rejected the permission request.'));
   },'btn small');
   const check=el('p','setting-note','Checking userScripts permission…');
   void browser.permissions?.contains({permissions:['userScripts']})
     .then(allowed=>{if(check.isConnected)check.textContent=allowed?
       'userScripts permission granted.':'userScripts permission not yet granted.'})
     .catch(()=>{if(check.isConnected)check.textContent='Permission status unavailable.'});
   section.append(grant,check);
   section.append(b('PersonaMonkey settings',()=>{
     void browser.tabs.create({url:browser.runtime.getURL('options/options.html')});
   },'btn small'));
   section.append(b('Emergency diagnostics',()=>{
     void browser.tabs.create({url:browser.runtime.getURL('pcms/emergency.html')});
   },'btn small'));
   container.append(section);
  }
 }
 if(select==='diagnostics')renderReadinessPanel(container);
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
 // The original controls are deliberately accessed from Settings -> Advanced,
 // not displayed as a second competing dashboard on every primary view.
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
 const accountStyle=document.createElement('link');accountStyle.rel='stylesheet';accountStyle.href=new URL('accounts.css',url).href;root.append(accountStyle);
 const addon=document.createElement('style');addon.textContent=':host{display:block;height:100dvh;min-height:0} .pcms-action-toast{pointer-events:none;position:fixed;bottom:20px;right:25px;z-index:100;padding:12px 16px;background:#253e55;color:white;border-radius:7px;box-shadow:0 5px 24px #0003;max-width:380px} .pcms-action-toast[hidden]{display:none}';root.append(addon);
 let initial=location.hash.slice(1);if(!routes.includes(initial))initial='overview';state.route=initial;
 routeHandlers();await render();
 const legacy=document.querySelector('body > .app');
 if(legacy)legacy.inert=true; // no hidden workflow focus or operator input
 document.body.classList.add('pcms-faithful-ready');
 window.addEventListener('hashchange',()=>{const dest=location.hash.slice(1);if(routes.includes(dest)&&dest!==state.route){state.route=dest;void render()}});
 // Foreground projection reads the same canonical background ports. Never
 // mirror an inaccessible hidden controller or infer completion from its DOM.
 const refreshOnWake=()=>{
  if(document.visibilityState==='hidden')return;
  if(state.route==='overview')displayOverview();
  else if(state.route==='work-queue')void loadQueue(true);
  else if(state.route==='generators')void loadGenerators();
  else if(state.route==='accounts')void loadAccounts();
  else if(state.route==='refresher')void loadRefresher();
  // Do not destroy active Settings forms on window focus/visibility changes.
  // The operator may be entering an unsaved Git token or restore path.
 };
 document.addEventListener('visibilitychange',refreshOnWake);
 window.addEventListener('focus',refreshOnWake);
 setInterval(()=>{if(document.visibilityState!=='hidden'&&state.route==='accounts')void loadAccounts()},2500);
}
mount().catch(error=>{
 // Fail closed for presentation faults; never silently activate the historical
 // hidden authoring dashboard or authorize a remote effect.
 console.error('PCMS primary UI unavailable',error);
 root.replaceChildren();
 const failure=document.createElement('section');
 failure.setAttribute('role','alert');
 failure.style.cssText='font:16px system-ui;color:#13283a;background:#fff;min-height:100dvh;padding:32px;max-width:840px;margin:0 auto';
 const title=document.createElement('h1');title.textContent='PCMS interface unavailable';
 const detail=document.createElement('p');detail.textContent='Protected operations have not been attempted. Reload the extension, or inspect the independent emergency diagnostics.';
 const retry=document.createElement('button');retry.type='button';retry.textContent='Reload PCMS';retry.addEventListener('click',()=>location.reload());
 const emergency=document.createElement('a');emergency.href=browser.runtime.getURL('pcms/emergency.html');emergency.textContent='Emergency diagnostics';
 failure.append(title,detail,retry,document.createTextNode(' '),emergency);
 root.append(failure);document.body.classList.add('pcms-faithful-ready');
});