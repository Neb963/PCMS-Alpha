import {createPresentationWorkspace} from './presentation-workspace.mjs';
import {COLUMN_IDS} from '../presentation-preferences.mjs';
import {OPERATION_STATES,operationGroup} from '../operation-context.mjs';
import {installInteraction} from './interaction.mjs';
import {mountOperatorChecklist} from '../operator-checklist.mjs';
import {mountBackupWorkspace} from './backup-workspace.mjs';
import {acknowledgeIncident,incidentDestination,readIncidentContext,incidentPrimaryAction} from './attention.mjs';
import {createRefresherWorkspace} from './refresher-workspace.mjs';
import {matchesReviewGroup} from '../review-queue-state.mjs';
import {renderGitInventory,mountGitPromptEditor} from './git-workspace.mjs';
import {createSourceWorkspace} from './source-workspace.mjs';
import {mountSourceComparison,mountSourceHistory} from './source-comparison.mjs';
import {mountHumanRecovery,mountExceptionalReview} from './candidate-recovery.mjs';
import {createCleanPublicationWorkspace} from './clean-publication.mjs';
import {createGeneratorBatches} from './generator-batches.mjs';
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
const state={route:'overview',gen:{offset:0,limit:24,query:'',account:'ALL',sort:'fleet',filter:'ALL',owner:'ALL',source:'ALL',total:0,items:[]},
 ref:{offset:0,limit:25,query:'',account:'',phase:'ALL',snapshot:null,items:[],total:0},
 acct:{page:0,perPage:24,query:'',filter:'All',list:[]},queue:{filter:'Needs action',query:'',operations:[],incidents:[],opCursor:'',noticeCursor:'',history:[],nextOps:null,nextNotices:null,more:false,loading:false,error:null,summary:null,reviews:[],missing:[],missingCursor:'',reviewCursor:'',nextMissing:null,nextReview:null,missingTotal:null,missingUnfilteredTotal:null,reviewTotal:null,reviewUnfilteredTotal:null,identityUnavailable:false,releaseItems:[],releaseCursor:'',nextRelease:null,releaseUnavailable:false,aiJobs:[],aiCursor:'',nextAi:null,aiMore:false,readyItems:[],readyCursor:'',nextReady:null,readyMore:false,aiUnavailable:false,readyUnavailable:false,epoch:0},
 settings:'connections',settingsStatic:null,lastAccountList:[],lastInventoryTotal:null,lastRef:null,errors:{},
 renderEpoch:0,version:typeof browser==='object'?browser.runtime.getManifest().version:'Unavailable',readiness:null,readinessBusy:false};
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
const presentation=createPresentationWorkspace({root,el,b,notify,generator:state.gen,reload:()=>{presentation.mountTools();return loadGenerators()}});
const generatorSelection=createGeneratorSelection(typeof browser==='object'?browser.storage.local:{
 get:async()=>{throw Error('STORAGE_UNAVAILABLE')},set:async()=>{throw Error('STORAGE_UNAVAILABLE')}});
generatorSelection.subscribe(()=>updateGeneratorSelection());
const accountWorkspace=createAccountsWorkspace({root,el,b,request:readPort,reload:()=>loadAccounts(),notify});
const refresherWorkspace=createRefresherWorkspace({root,el,b,
 request:(type,params)=>readPort('pcms-i12-refresher',type,params,type==='OBSERVE_NOW'?90000:16000),
 snapshot:()=>state.ref.snapshot,reload:()=>loadRefresher(),accounts,notify,formatTime,
 manageAccount:async id=>{try{const r=await accounts();const account=r.accounts?.find(a=>a.accountId===id);
  if(account)accountWorkspace.open(account);else notify('This account is no longer available.');
 }catch{notify('Account details could not be read. Other schedule controls remain available.')}}});

const generatorBatches=createGeneratorBatches({root,el,b,request:readPort,accounts,
 reload:()=>loadGenerators(),manageAccount:openAccountManager,notify});
const cleanPublication=createCleanPublicationWorkspace({root,el,b,notify,openReview:openReleaseReview,
 request:(type,params)=>readPort('pcms-j04-clean-publication',type,params,120000)});
function updateNav(){for(const a of root.querySelectorAll('[data-nav]'))a.setAttribute('aria-current',a.dataset.nav===state.route?'page':'false');
 const label=shadow('#breadcrumb');if(label)label.textContent=({'work-queue':'Work Queue',overview:'Overview',generators:'Generators',accounts:'Accounts',refresher:'Refresher',settings:'Settings'})[state.route];
 const t=shadow('[data-nav="work-queue"] .nav-count');if(t){
  const stats=state.queue.summary?.states,notices=state.queue.summary?.attention?.counts;
  const count=stats?Object.entries(stats).reduce((n,[key,value])=>n+(operationGroup(key)==='NEEDS_ACTION'?value:0),0)+
    (notices?.actionRequired||0)+(notices?.serious||0):0;
  t.textContent=count?String(count):'';t.hidden=!count;
 }
}
function routeTo(target){if(!routes.includes(target))target='overview';state.route=target;location.hash='#'+target;void render().then(()=>shadow('#page-heading')?.focus({preventScroll:true}))}
function openGlobalSearch(){
 const existing=shadow('.overlay');if(existing){existing.querySelector('input[type=search]')?.focus();return}
 const priorFocus=root.activeElement;
 const overlay=el('div','overlay');const modal=el('div','modal');
 const closeSearch=()=>{clearTimeout(delay);epoch++;overlay.remove();
  const restore=priorFocus?.isConnected?priorFocus:shadow('.top-search');restore?.focus({preventScroll:true});};modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Search PCMS records');
 const head=el('div','modal-head');head.append(el('h2','', 'Search PCMS'));
 const close=b('Close',closeSearch,'btn small');head.append(close);modal.append(head);
 const body=el('div','modal-body');
 const input=el('input');input.type='search';input.placeholder='Find a generator, account, source path or operation';input.setAttribute('aria-label','Search generators, accounts, source paths and operations');input.maxLength=512;
 input.style.width='100%';input.style.padding='11px';input.style.border='1px solid #c9d2da';input.style.borderRadius='7px';body.append(input);
 const caption=el('p','native-bridge-note','Search saved records and the latest complete Git source snapshot.');body.append(caption);
 const list=el('div','queue-list');body.append(list);modal.append(body);overlay.append(modal);root.append(overlay);
 let epoch=0,delay;
 async function search(){const query=input.value.trim(),n=++epoch;list.replaceChildren();if(query.length<2)return;
  list.append(el('p','pcms-unknown','Searching local records…'));
  const settled=await Promise.allSettled([inventory({query:query.slice(0,80),offset:0,limit:8}),accounts(),
   readPort('pcms-s03-catalog','SEARCH_PATHS',{query,limit:8},12000),guardedRead('pcms-i02-canonical-readonly','LIST_OPERATION_PAGE',{after:'',limit:8,status:'ALL',query:query.slice(0,80)}),guardedRead('pcms-i02-canonical-readonly','LIST_NOTICE_PAGE',{after:'',limit:8,query:query.slice(0,80)})]);if(n!==epoch||!overlay.isConnected)return;
  list.replaceChildren();const inv=settled[0].status==='fulfilled'?settled[0].value:null,acc=settled[1].status==='fulfilled'?settled[1].value:null;
  const found=[];
  for(const g of inv?.items||[])found.push({kind:'Generator',label:g.slug,execute:()=>{state.gen.query=g.slug;state.gen.offset=0;overlay.remove();routeTo('generators')}});
  for(const a of acc?.accounts||[])if([a.accountId,a.alias].filter(Boolean).some(x=>x.toLowerCase().includes(query.toLowerCase())))found.push({kind:'Account',label:a.alias||a.accountId,execute:()=>{state.acct.query=a.accountId;state.acct.page=0;overlay.remove();routeTo('accounts')}});
  const paths=settled[2].status==='fulfilled'?settled[2].value:null,operations=settled[3].status==='fulfilled'?settled[3].value:null;
  for(const source of paths?.items||[])found.push({kind:'Git source',label:source.path,execute:()=>{overlay.remove();openSourceManager({slug:source.slug,initialPath:source.path.startsWith(source.folder+'/')?source.path.slice(source.folder.length+1):null})}});
  const incidents=settled[4]?.status==='fulfilled'?settled[4].value:null;
  for(const notice of incidents?.items||[])found.push({kind:'Incident',label:notice.code.replaceAll('_',' ')+' · '+notice.scopeId,execute:()=>{overlay.remove();void openIncident(notice)}});
  for(const op of operations?.items||[])found.push({kind:'Operation',label:op.operationId,execute:()=>{state.queue.query=op.operationId;state.queue.filter='All';overlay.remove();routeTo('work-queue')}});
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
const openSourceManager=createSourceWorkspace({root,el,b,request:readPort,reload:()=>loadGenerators(),connect:()=>{state.settings='connections';routeTo('settings')}});
// Adoption is guarded by the protected account and owned-source readbacks.
// The visible button never creates a new generator, writes source or publishes.
function openAdoptionManager(item,{readOnly=false}={}){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Original source '+item.slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Original source · '+item.slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note','Reading original-source preservation…'),files=el('div');
 status.setAttribute('role','status');body.append(status,files);
 async function draw(){try{
  const out=await readPort('pcms-i07-adoption','GET_ADOPTION',{slug:item.slug},15000);
  if(!out.ok){status.textContent=item.management==='MANAGED_CREATED'?'PCMS created this generator empty and private. No prior human source was replaced.':
    'Automatic original-source capture is waiting for the protected account. Your published source remains unchanged.';return}
  status.textContent=out.originalProtected?'Original source is preserved in Git and a source-verified portable backup.':
   out.archive==='ARCHIVED_GIT_CONFIRMED'?'Original source is archived in Git; waiting for a verified portable backup.':
   'Original source is saved locally. Git archival continues automatically when the connection is available.';
  const manifest=await readPort('pcms-i07-adoption','INSPECT_ORIGINAL',{slug:item.slug});files.replaceChildren();
  for(const file of manifest.files||[]){const row=el('div','batch-item');row.append(el('strong','',file.path),el('p','setting-note',file.size+' bytes'),
   b('View original',()=>void(async()=>{try{
    const result=await readPort('pcms-i07-adoption','READ_ORIGINAL_FILE',{slug:item.slug,path:file.path},30000);
    if(!result.ok)throw Error();
    const bytes=Uint8Array.from(atob(result.base64),c=>c.charCodeAt(0));
    const old=files.querySelector('textarea');old?.remove();
    const view=el('textarea','form-input');view.readOnly=true;view.rows=16;view.setAttribute('aria-label','Original '+file.path);
    try{view.value=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{view.value='Binary asset · '+bytes.length+' bytes. Download to inspect.'}
    row.append(view);view.focus();
    row.append(b('Download original',()=>{const url=URL.createObjectURL(new Blob([bytes]));
      const a=el('a');a.href=url;a.download=item.slug+'-'+file.path.replaceAll('/','-');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}));
   }catch{notify('Original file could not be read. The saved original is preserved.')}})()));files.append(row)}
 }catch{status.textContent='Original-source status unavailable. Retry to read the saved state.'}}
 const actions=el('div','form-foot');
 if(!readOnly)actions.append(b('Retry preservation',()=>void(async()=>{
  status.textContent='Checking the next safe preservation step…';
  try{const out=await readPort('pcms-i07-adoption','RETRY_ADOPTION',{slug:item.slug},100000);
    if(!out.ok)notify('Preservation is waiting for its account or GitHub connection.');await draw();}
  catch{status.textContent='Check was not confirmed. Refresh the saved state before retrying.'}
 })()));
 actions.append(b('Refresh',()=>void draw()));
 if(item.accountId)actions.append(b('Manage account',()=>void(async()=>{
  const out=await accounts(),a=out.accounts.find(a=>a.accountId===item.accountId);if(a){close();openAccountManager(a)}
 })()));
 body.append(actions);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});overlay.addEventListener('keydown',e=>{if(e.key==='Escape')close()});void draw();head.querySelector('button').focus();
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
 } else{kv('Owner evidence',item.ownerState||'Unknown');kv('Perchance listing',item.visibility||'Unknown');kv('GitHub source',item.sourceStatus||item.source||'Unknown');
  const facets=generatorFacets(item);for(const label of ['Release','Refresher','Attention','Observed'])kv(label,facets[label.toLowerCase()]);}
 body.append(dl,el('p','native-bridge-note','Protected changes, source inspection and adoption remain subject to existing exact-record authorization and guarded runtime checks.'));
 const actions=el('div','form-foot');if(kind==='ref')actions.append(b('Open timing controls',()=>{backdrop.remove();nativeSelection('timing',item)}));
 else {for(const [label,kind] of [['Inspect source','source'],['Refresher timing','timing'],['Original source','adopt']])actions.append(b(label,()=>{backdrop.remove();nativeSelection(kind,item)}));
  actions.append(b('Open related work',()=>{backdrop.remove();state.queue.query=item.slug;routeTo('work-queue')}));}
 body.append(actions);drawer.append(body);backdrop.append(drawer);root.append(backdrop);
 const focusable=()=>[...drawer.querySelectorAll('button:not(:disabled),[href],input:not(:disabled)')];
 backdrop.addEventListener('keydown',event=>{if(event.key==='Escape'){backdrop.remove();if(priorFocus?.isConnected)priorFocus.focus({preventScroll:true});return}if(event.key==='Tab'){let all=focusable();let index=all.indexOf(root.activeElement);if(event.shiftKey&&index<=0){event.preventDefault();all.at(-1)?.focus()}if(!event.shiftKey&&index===all.length-1){event.preventDefault();all[0]?.focus()}}});
 backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove()});close.focus();
}
// Primary per-generator timing and activity controls reuse exact canonical
// Refresher revisions; they never claim a successful provider source save.
function openGlobalRefresherPolicy(){refresherWorkspace.openTiming()}
function openRefresherTiming(item){void refresherWorkspace.openGenerator(item)}

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
   const dialog=[...root.querySelectorAll('[role=dialog]')].at(-1);
   if(dialog){
    if(dialog.getAttribute('aria-label')==='Search PCMS records')dialog.querySelector('input[type=search]')?.focus();
    else notify('Close the current dialog to search other records.');
    return;
   }
   openGlobalSearch();
  }
 },true);
 root.addEventListener('click',event=>{const link=event.target.closest('button[data-action],button[data-settings]');if(!link)return;const action=link.dataset.action;const setting=link.dataset.settings;
 if(setting){state.settings=setting;void renderSettingsSection();return}
 if(!action)return;
 event.preventDefault();
 if(action==='search'){openGlobalSearch();return}
 if(action==='create'){openGeneratorCreator();return}
 if(action==='git-sources'){openGitWorkspace();return}
 if(action==='sync-inventory'){void syncManagedInventories();return}
 if(action==='queue'||action==='activity'){routeTo('work-queue');return}
 if(action==='diagnostics'||action==='health'){state.settings='diagnostics';routeTo('settings');return}
 if(action==='notifications'){routeTo('overview');return}
 if(action==='system-health'){routeTo('settings');return}
 if(action==='generator-filters'){const filters=shadow('[data-generator-extra-filters]');
  if(filters){filters.hidden=!filters.hidden;shadow('[data-action=generator-filters]')?.setAttribute('aria-expanded',String(!filters.hidden));
    if(!filters.hidden)shadow('#generator-owner')?.focus()}return}
 if(action==='creation-batches'){generatorBatches.openHistory();return}
 if(action==='gen-prev'){state.gen.offset=Math.max(0,state.gen.offset-state.gen.limit);void loadGenerators();return}
 if(action==='gen-next'){state.gen.offset+=state.gen.limit;void loadGenerators();return}
 if(action==='ref-prev'){state.ref.offset=Math.max(0,state.ref.offset-state.ref.limit);void loadRefresher();return}
 if(action==='ref-next'){state.ref.offset+=state.ref.limit;void loadRefresher();return}
 if(action==='account-prev'){state.acct.page=Math.max(0,state.acct.page-1);displayAccounts();return}
 if(action==='account-next'){state.acct.page++;displayAccounts();return}
 if(action==='queue-prev'){
   const prior=state.queue.history.pop();if(!prior)return;
   state.queue.opCursor=prior.op;state.queue.noticeCursor=prior.notice;
   state.queue.aiCursor=prior.ai;state.queue.readyCursor=prior.ready;state.queue.releaseCursor=prior.release;state.queue.missingCursor=prior.missing;state.queue.reviewCursor=prior.review;void loadQueue();return;
 }
 if(action==='queue-next'){
   if(!state.queue.more)return;
   state.queue.history.push({op:state.queue.opCursor,notice:state.queue.noticeCursor,ai:state.queue.aiCursor,ready:state.queue.readyCursor,release:state.queue.releaseCursor,missing:state.queue.missingCursor,review:state.queue.reviewCursor});
   state.queue.opCursor=state.queue.nextOps===null?null:state.queue.nextOps;
   state.queue.noticeCursor=state.queue.nextNotices===null?null:state.queue.nextNotices;
   state.queue.aiCursor=state.queue.nextAi===null?null:state.queue.nextAi;
   state.queue.readyCursor=state.queue.nextReady===null?null:state.queue.nextReady;
   state.queue.releaseCursor=state.queue.nextRelease===null?null:state.queue.nextRelease;
   state.queue.missingCursor=state.queue.nextMissing;state.queue.reviewCursor=state.queue.nextReview;
   void loadQueue();return;
 }
 if(action==='add-account'){void startAccountEnrollment();return}
 if(action==='feed-check'){void refresherWorkspace.checkNow();return}
 if(action==='edit-timing'){refresherWorkspace.openTiming();return}
 if(action==='pause-refresher'){void refresherWorkspace.pauseGlobal();return}
 if(action==='review-generator-selection'){openGeneratorSelection();return}
 if(action==='clear-generator-selection'){void generatorSelection.clear();return}
 if(action==='go-accounts'){routeTo('accounts');return}
 if(action==='refresh-accounts'){void loadAccounts();return}
 if(action==='queue-help'){notify('Work Queue shows pending work and items needing attention. Open an item to review its available actions.');return}
 if(action==='account-info'){notify('Use Manage to check an account’s login, protected route, inventory or recovery.');return}
 if(action.startsWith('check-service:')){state.settings='connections';void runReadiness(false);return}
 });
 root.addEventListener('click',event=>{const tab=event.target.closest('[data-filter]');if(tab){event.preventDefault();const [r,value]=tab.dataset.filter.split(':');if(r==='generators'){state.gen.filter=value;state.gen.offset=0;void loadGenerators()}if(r==='refresher'){state.ref.phase=value.toUpperCase();state.ref.offset=0;void loadRefresher()}if(r==='queue'){state.queue.filter=value;void loadQueue(true)}return}
 const row=event.target.closest('tr[data-item-index]');if(row){const i=Number(row.dataset.itemIndex);if(state.route==='refresher'&&state.ref.visibleItems?.[i])void refresherWorkspace.openGenerator(state.ref.visibleItems[i]);else if(state.route==='generators'&&state.gen.visibleItems?.[i])openDetails('gen',state.gen.visibleItems[i]);}
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
   event.preventDefault();row.tabIndex=-1;list[n].tabIndex=0;list[n].focus({preventScroll:true});list[n].scrollIntoView({block:'nearest',inline:'nearest'});
  }
 });
 root.addEventListener('change',event=>{const target=event.target;
 if(target.matches('[data-generator-select-page]')){void generatorSelection.setMany(state.gen.items,target.checked);return}
 if(target.id==='generator-account'){state.gen.account=target.value;state.gen.offset=0;void loadGenerators()}
 if(target.id==='generator-owner'){state.gen.owner=target.value;state.gen.offset=0;void loadGenerators()}
 if(target.id==='generator-source'){state.gen.source=target.value;state.gen.offset=0;void loadGenerators()}
 if(target.id==='generator-sort'){state.gen.sort=target.value;state.gen.offset=0;void loadGenerators()}
 if(target.id==='refresher-account'){state.ref.account=target.value;state.ref.offset=0;void loadRefresher();return}
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
async function proposeRefresherEnable(control){await refresherWorkspace.enable(control)}

function statusPill(label,kind=''){const p=el('span','pill'+(kind?' '+kind:''),label);return p}
function tableRow(cells,itemIndex){const tr=el('tr');tr.tabIndex=itemIndex===0?0:-1;tr.dataset.itemIndex=String(itemIndex);tr.setAttribute('role','row');tr.setAttribute('aria-label','Inspect '+cells[0]);return tr}
const statusClasses={ACTIVE:'green',SLEEPING:'',WAITING:'',HELD:'red',INELIGIBLE:'',OBSERVED_OWNER:'green',OWNER_UNVERIFIED:'',OWNER_DISPUTED:'red'};
const ownerLabels={OBSERVED_OWNER:'Owner observed',OWNER_UNVERIFIED:'Owner unknown',OWNER_DISPUTED:'Disputed',UNOBSERVED:'Unobserved',IDENTITY_CONFLICT:'Identity conflict',OWNER_CONFLICT:'Account conflict'};
function rowsError(tableSelector,message,colspan){const body=shadow(tableSelector);if(!body)return;body.replaceChildren();const tr=el('tr'),td=el('td','pcms-unknown',message);td.colSpan=colspan;tr.append(td);body.append(tr)}
function setCounts(tabSelector,map){for(const tab of shadow('#page')?.querySelectorAll(tabSelector)||[]){const x=tab.dataset.filter?.split(':')[1];const num=tab.querySelector('.count');if(num)num.textContent=map[x]??'—'}}
function fmtObservation(item){const at=item.lastObservedAt||item.observedAt;if(at&&Number.isFinite(at)){const mins=Math.max(0,Math.floor((Date.now()-at)/60000));return `${mins} min ago · historical`}return 'Not verified'}
function generatorFacets(item){
 const words=value=>String(value).toLowerCase().replaceAll('_',' ');
 return {release:item.releaseState&&item.releaseState!=='NOT_RECORDED'?words(item.releaseState)+' · recorded':'No release recorded',
  refresher:item.refresher?words(item.refresher.phase)+(item.refresher.blockers.length?' · '+item.refresher.blockers.map(words).join(', '):'')+' · recorded':words(item.refresherStatus||'NOT_OBSERVED'),
  attention:item.attention?.length?item.attention.map(words).join(' · '):'None recorded',observed:fmtObservation(item)};
}
// C-14/C-80: the accepted UI records durable intents through the same
// slug-coalescing coordinator as main-only Git discovery. Side effects are
// exclusively run later by the protected account/creation watcher.
function openGeneratorCreator(){generatorBatches.openCreator()}

async function syncManagedInventories(){
 const verified=state.lastAccountList.filter(a=>['VERIFIED','INVENTORY_PENDING'].includes(a.state));
 if(!verified.length){notify('No verified account is available for a protected inventory check.');return}
 notify('Checking owned inventory for '+verified.length+' verified account(s)…');
 let good=0,held=0;
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,verified.length)},async()=>{while(cursor<verified.length){const account=verified[cursor++];
  try{
   const out=await readPort('pcms-i03-accounts','SYNC_ACCOUNT',{
    accountId:account.accountId,expectedRevision:account.revision},100000);
   if(out?.ok)good++;else held++;
  }catch{held++;}
 }}));
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
  return (!query||term.includes(query)||String(a.alias||'').toLowerCase().includes(query)||String(a.personaUid||'').toLowerCase().includes(query))&&
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
async function loadGenerators(){
 presentation.rememberFilters();if(state.route!=='generators')return;
 const epoch=++state.renderEpoch,body=shadow('.workspace-surface table tbody');if(!body)return;
 const queryKey=JSON.stringify([state.gen.query,state.gen.offset,state.gen.limit,state.gen.filter,state.gen.source,state.gen.owner,state.gen.account,state.gen.sort,state.gen.management]);
 if(body.dataset.queryKey!==queryKey||!body.querySelector('tr[data-item-index]'))rowsError('.workspace-surface table tbody','Reading observed local generator inventory…',COLUMN_IDS.length+2);
 body.dataset.queryKey=queryKey;body.setAttribute('aria-busy','true');
 try{
  const [res,accountsResult]=await Promise.all([inventory({query:state.gen.query,offset:state.gen.offset,limit:state.gen.limit,workspace:true,status:state.gen.filter,source:state.gen.source,ownerState:state.gen.owner,accountId:state.gen.account==='ALL'?'':state.gen.account,sort:state.gen.sort,management:state.gen.management||'ALL'}),accounts().catch(()=>null)]);
  if(epoch!==state.renderEpoch||state.route!=='generators')return;
  state.lastAccountList=accountsResult?.ok&&Array.isArray(accountsResult.accounts)?accountsResult.accounts:state.lastAccountList;
  state.gen.items=Array.isArray(res.items)?res.items:[];state.gen.total=safeCount(res.total)=== '—'?0:res.total;
  state.gen.facets=res.facets||{};state.errors.generators='';displayGenerators();body.setAttribute('aria-busy','false');
 }catch(err){if(epoch!==state.renderEpoch)return;state.errors.generators=err.message;state.gen.items=[];state.gen.total=0;rowsError('.workspace-surface table tbody','Local inventory unavailable: '+err.message+'. No remote absence inferred.',COLUMN_IDS.length+2)}
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
     const out=await readPort('pcms-i03-accounts','SYNC_ACCOUNT',{accountId:a.accountId,expectedRevision:a.revision},100000);
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
 const body=shadow('.workspace-surface table tbody');if(!body)return;
 const active=root.activeElement,focused=body.contains(active)?active.closest('tr[data-presentation-key]'):null,
 focusKey=focused?.dataset.presentationKey,focusTag=active?.tagName,scroller=body.closest('.table-scroll'),scrollTop=scroller?.scrollTop;
 body.replaceChildren();
 const accountsMap=new Map(state.lastAccountList.map(a=>[a.accountId,a]));const itemList=[...state.gen.items];
 // Server already sorted the complete matching fleet before slicing.
 state.gen.visibleItems=itemList;
 if(!itemList.length){rowsError('.workspace-surface table tbody',state.errors.generators?'Local inventory unavailable.': 'No matching local generator observations.',COLUMN_IDS.length+2)}
 for(const [i,item] of itemList.entries()){
  const tr=tableRow([item.slug],i);tr.dataset.presentationKey=item.slug;
  const selectCell=el('td','generator-select-cell'),checkbox=el('input');checkbox.type='checkbox';
  checkbox.dataset.generatorSelect=item.slug;checkbox.setAttribute('aria-label','Select '+item.slug);
  checkbox.checked=generatorSelection.includes(item);checkbox.addEventListener('click',e=>e.stopPropagation());
  checkbox.addEventListener('change',()=>void generatorSelection.set(item,checkbox.checked));selectCell.append(checkbox);
  const acct=accountsMap.get(item.accountId);const sourceState=item.source||'SOURCE_PENDING';const owner=item.ownerState||'UNKNOWN';
  const statusText=({PUBLISHED:'Published',DEVELOPING:'Developing',REVIEW:'Needs review',HELD:'Needs attention',IDLE:'Private'})[item.workflowStatus]||ownerLabels[owner]||'Needs checking';
  const td0=el('td','name-cell',item.slug||'Unknown');const td1=el('td','muted-cell',acct?.alias||item.accountId||'Unknown account');
  const td2=el('td');td2.append(statusPill(statusText,statusClasses[owner]||''));
  const td3=el('td','muted-cell',item.visibility||'UNKNOWN');
  const td4=el('td','muted-cell',({GIT:'Git linked',PROTECTED:'Original protected',ORIGINAL_SAVED:'Original saved · archiving',CAPTURING:'Capturing original',PENDING:'Source pending'})[item.sourceStatus]||sourceState);
  const cue=el('td','open-col');cue.append(b('Open',e=>{e.stopPropagation();void openGeneratorPage(item)},'btn small'));
  const detail=generatorFacets(item),extra=['release','refresher','attention','observed'].map(key=>{const cell=el('td','muted-cell',detail[key]);cell.title=detail[key];return cell});
  td1.dataset.column='account';tr.append(selectCell,td0,td1,td2,td3,td4,...extra,cue);body.append(tr);
 }
 setPagination('.workspace-surface .pagination span','[data-action="gen-prev"]','[data-action="gen-next"]',state.gen.offset,state.gen.total,state.gen.limit,
 `${state.gen.total?state.gen.offset+1:0}–${Math.min(state.gen.offset+state.gen.limit,state.gen.total)} of ${state.gen.total} generators${state.gen.account!=='ALL'?' · filtered account':''}`);
 const labels={ALL:'All',PUBLISHED:'Published',DEVELOPING:'Developing',REVIEW:'Needs review',HELD:'Held'};
 for(const tab of shadow('#page')?.querySelectorAll('[data-filter^="generators:"]')||[]){
  const key=tab.dataset.filter.split(':')[1];
  tab.replaceChildren(document.createTextNode((labels[key]||key)+' '+(state.gen.facets?.[key]??0)));
  tab.setAttribute('aria-selected',String(state.gen.filter===key));tab.tabIndex=state.gen.filter===key?0:-1;
 }
 updateGeneratorSelection();presentation.mountTools();presentation.applyTable();
 if(focusKey){const row=[...body.querySelectorAll('tr[data-presentation-key]')].find(r=>r.dataset.presentationKey===focusKey);
  if(row){const target=focusTag==='INPUT'?row.querySelector('input'):focusTag==='BUTTON'?row.querySelector('button'):row;target?.focus({preventScroll:true});if(scroller)scroller.scrollTop=scrollTop}
  else shadow('#generator-search')?.focus({preventScroll:true});
 }
 const accountSelect=shadow('#generator-account');if(accountSelect){const prior=accountSelect.value;accountSelect.replaceChildren();const first=el('option','', 'All accounts');first.value='ALL';accountSelect.append(first);
  for(const a of state.lastAccountList){const option=el('option','',a.alias||a.accountId);option.value=a.accountId;accountSelect.append(option)}if(state.gen.account!=='ALL'&&![...accountSelect.options].some(x=>x.value===state.gen.account)){const missing=el('option','','Saved account · unavailable');missing.value=state.gen.account;accountSelect.append(missing)}accountSelect.value=state.gen.account;}
}
async function loadRefresher(){if(state.route!=='refresher')return;
 const epoch=++state.renderEpoch;
 const holder=shadow('.ref-table-scroll tbody');
 if(holder&&!state.ref.snapshot)rowsError('.ref-table-scroll tbody','Reading Refresher schedules…',4);
 try{
  const result=await refresher({query:state.ref.query,accountId:state.ref.account,phase:state.ref.phase,offset:state.ref.offset,limit:state.ref.limit});
  if(epoch!==state.renderEpoch||state.route!=='refresher')return;
  state.ref.snapshot=result;state.lastRef=result;state.ref.items=result.items||[];
  state.ref.total=result.total||0;state.errors.refresher='';displayRefresher();
  void refresherWorkspace.refreshAccounts();void refreshRefCounts(epoch);
 }catch(err){if(epoch!==state.renderEpoch)return;state.errors.refresher=err.message;
  if(state.ref.snapshot){
   const cached={...state.ref.snapshot,readUnavailable:true,
    recent:{...state.ref.snapshot.recent,complete:false,stale:true},
    items:state.ref.items.map(row=>({...row,presence:row.presence?{...row.presence,stale:true}:null}))};
   refresherWorkspace.render(cached,state.ref);
   text('.ref-table-heading .muted','Current schedules unavailable · previous values shown');
   text('.ref-feed-state strong','Current observation unavailable');
  }
  else rowsError('.ref-table-scroll tbody','Refresher unavailable. Retry Check now or reopen this page.',4);
 }
}
function displayRefresher(){if(state.route!=='refresher'||!state.ref.snapshot)return;
 state.ref.visibleItems=state.ref.items;refresherWorkspace.render(state.ref.snapshot,state.ref);
}
async function refreshRefCounts(epoch){
 const keys=['ACTIVE','SLEEPING','WAITING'];const reads=await Promise.allSettled(keys.map(p=>refresher({query:'',accountId:state.ref.account,phase:p,offset:0,limit:1})));
 if(epoch!==state.renderEpoch||state.route!=='refresher')return;
 const vals=shadow('.ref-kpi-strip')?.querySelectorAll('.ref-kpi strong.tabnums');if(vals)reads.forEach((r,i)=>{vals[i].textContent=r.status==='fulfilled'?safeCount(r.value.total):'—'});
}
// Canonical queue only: no status derived from native view text.
const queueState=OPERATION_STATES;
const operationTitle=op=>({supply_create_v1:'Generator creation',supply_rename_v1:'Generator rename',supply_git_marker_v1:'Git source setup'})[op.effectType]||'Recorded operation';
function queueGroup(filter){
 return ({'Needs action':'NEEDS_ACTION',Running:'RUNNING',Waiting:'WAITING',
   Completed:'COMPLETED',All:'ALL'})[filter]||'NEEDS_ACTION';
}
async function loadQueue(reset=false){
 if(state.route!=='work-queue')return;
 const q=state.queue;
 if(reset){q.opCursor='';q.noticeCursor='';q.aiCursor='';q.readyCursor='';q.releaseCursor='';q.missingCursor='';q.reviewCursor='';q.history=[];q.nextOps=null;q.nextNotices=null;q.nextAi=null;q.nextReady=null;q.nextRelease=null;q.nextMissing=null;q.nextReview=null;}
 const epoch=++q.epoch;
 q.loading=true;q.error=null;displayQueue();
 const includeNotices=['Needs action','All','Completed'].includes(q.filter);
 const noticeState=q.filter==='Completed'?'RESOLVED':q.filter==='All'?'ALL':'ACTIVE';
 const includeSources=q.filter==='Needs action'||q.filter==='All';
 const requested=[
   q.opCursor!==null?guardedRead('pcms-i02-canonical-readonly','LIST_OPERATION_PAGE',{
     after:q.opCursor,limit:20,status:queueGroup(q.filter),query:q.query.slice(0,80)}):
     Promise.resolve({ok:true,items:[],more:false,next:null}),
   includeNotices&&q.noticeCursor!==null?
     guardedRead('pcms-i02-canonical-readonly','LIST_NOTICE_GROUP_PAGE',{
       after:q.noticeCursor,limit:20,query:q.query.slice(0,80),state:noticeState}):Promise.resolve({ok:true,items:[],more:false,next:null}),
   guardedRead('pcms-i02-canonical-readonly','SUMMARY'),
   guardedRead('pcms-i02-canonical-readonly','NOTICE_SUMMARY'),
   q.releaseCursor!==null?guardedRead('pcms-i13-release','LIST_REVIEW',{after:q.releaseCursor,limit:20,query:q.query.slice(0,100),status:queueGroup(q.filter)})
     .catch(()=>({ok:false,items:[]})):Promise.resolve({ok:true,items:[],more:false,nextCursor:null}),
   q.aiCursor!==null?guardedRead('pcms-i10-ai','LIST_JOBS',{
     after:q.aiCursor,limit:20,query:q.query.slice(0,100),status:queueGroup(q.filter),legacyOnly:!q.releaseUnavailable
   }).catch(()=>({ok:false,jobs:[],more:false,nextCursor:null})):
     Promise.resolve({ok:true,jobs:[],more:false,nextCursor:null}),
   q.releaseUnavailable&&q.readyCursor!==null?guardedRead('pcms-s03-catalog','LIST_READY',{
     after:q.readyCursor,limit:20,query:q.query.slice(0,100),status:queueGroup(q.filter)
   }).catch(()=>({ok:false,items:[],more:false,nextCursor:null})):
     Promise.resolve({ok:true,items:[],more:false,nextCursor:null}),
   includeSources&&q.reviewCursor!==null?guardedRead('pcms-r4-folder-identity','LIST_PAGE',
     {kind:'REVIEW',after:q.reviewCursor,limit:20,query:q.query})
     .catch(()=>({ok:false,items:[]})):Promise.resolve({ok:true,items:[],total:includeSources?q.reviewTotal||0:0,unfilteredTotal:includeSources?q.reviewUnfilteredTotal||0:0,more:false,next:null}),
   includeSources&&q.missingCursor!==null?guardedRead('pcms-r4-folder-identity','LIST_PAGE',
     {kind:'MISSING',after:q.missingCursor,limit:20,query:q.query})
     .catch(()=>({ok:false,items:[]})):Promise.resolve({ok:true,items:[],total:includeSources?q.missingTotal||0:0,unfilteredTotal:includeSources?q.missingUnfilteredTotal||0:0,more:false,next:null})
 ];
 try{
  const [ops,notices,summary,noticeTotals,releases,ai,ready,identities,missing]=await Promise.all(requested);
  if(state.route!=='work-queue'||q.epoch!==epoch)return;
  q.operations=ops.items||[];q.incidents=(notices.items||[]).map(g=>({...g.notice,causalGroup:{...g,query:q.query.slice(0,80),queryState:noticeState}}));
  q.nextOps=ops.more?ops.next:null;q.nextNotices=notices.more?notices.next:null;
  q.aiUnavailable=ai?.ok!==true;q.aiJobs=ai?.ok?(ai.jobs||[]):[];q.aiMore=ai?.ok&&ai.more===true;
  q.nextAi=q.aiMore?ai.nextCursor:null;
  q.readyUnavailable=ready?.ok!==true;q.readyItems=ready?.ok?(ready.items||[]):[];q.readyMore=ready?.ok&&ready.more===true;
  q.nextReady=q.readyMore?ready.nextCursor:null;
  q.nextRelease=releases?.ok&&releases.more?releases.nextCursor:null;
  q.releaseUnavailable=releases?.ok!==true;
  q.more=Boolean(ops.more||notices.more||q.aiMore||q.readyMore||releases?.more||identities?.more||missing?.more);q.summary={...summary,attention:noticeTotals};
  q.releaseItems=releases?.ok?(releases.items||[]):[];
  q.reviews=identities?.ok?(identities.items||[]):[];
  q.missing=missing?.ok?(missing.items||[]).map(r=>r.slug):[];
  q.nextMissing=missing?.ok&&missing.more?missing.next:null;q.nextReview=identities?.ok&&identities.more?identities.next:null;
  q.missingTotal=missing?.ok?missing.total:null;q.missingUnfilteredTotal=missing?.ok?missing.unfilteredTotal:null;
  q.reviewTotal=identities?.ok?identities.total:null;q.reviewUnfilteredTotal=identities?.ok?identities.unfilteredTotal:null;
  q.identityUnavailable=identities?.ok!==true||missing?.ok!==true;
  q.error=null;
 }catch(err){
  if(q.epoch!==epoch)return;
  q.operations=[];q.incidents=[];q.more=false;q.error=err.message||'LOCAL_QUEUE_UNAVAILABLE';
 }finally{if(q.epoch===epoch){q.loading=false;displayQueue();}}
}
function displayQueue(){
 if(state.route!=='work-queue')return;
 const toolbar=shadow('.page-head .head-actions');if(toolbar)cleanPublication.mountToolbar(toolbar);
 const q=state.queue;const holder=shadow('.queue-list');
 if(!holder)return;
 if(q.loading&&holder.childElementCount)return;
 const signature=JSON.stringify([q.filter,q.query,q.error,q.operations,q.incidents,q.releaseItems,q.aiJobs,q.readyItems,q.reviews,q.missing,q.more,q.releaseUnavailable,q.aiUnavailable,q.readyUnavailable,q.identityUnavailable,q.missingTotal,q.missingUnfilteredTotal,q.reviewTotal,q.reviewUnfilteredTotal]);
 if(!q.loading&&q.renderedSignature===signature&&holder.childElementCount)return;
 if(!q.loading)q.renderedSignature=signature;holder.replaceChildren();
 if(q.loading)renderEmpty(holder,'Reading recorded operations and incidents…');
 else if(q.error)renderEmpty(holder,'The local work queue is unavailable. No operation result has been assumed.');
 else{
  if(q.releaseUnavailable)holder.append(el('p','setting-note','Publication records could not be read. Refresh the queue to try again.'));
  if(q.aiUnavailable)
   holder.append(el('p','setting-note','AI development records could not be read. Their absence here does not mean there is no work.'));
  if(q.identityUnavailable)holder.append(el('p','setting-note','Git source observations could not be read. Open Connections to check current access; previous history is preserved.'));
  if(q.readyUnavailable)
   holder.append(el('p','setting-note','READY generator records could not be read. Check GitHub connection and local journal availability.'));
  if((q.filter==='Needs action'||q.filter==='All'))
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
        'The Git source changed. Review its current files before continuing.'));
      content.append(b('Browse current source',()=>openSourceManager({slug:review.newSlug}),'btn small'),b('Update source review',()=>void(async()=>{
        try{const out=await readPort('pcms-r4-folder-identity','REFRESH_REVIEW',{newSlug:review.newSlug,expectedRevision:review.revision},120000);
         if(!out.ok)notify(out.code==='RENAME_READBACK_REQUIRED'?'Check the pending rename result before changing its source review.':'Source review could not be updated. The original identity and source are preserved.');await loadQueue(true);
        }catch{notify('GitHub is unavailable. The current review is preserved.')}
      })(),'btn small'),b('Check rename result',()=>void(async()=>{try{await readPort('pcms-r4-folder-identity','RUN_RENAME_JOB',{newSlug:review.newSlug},120000);await loadQueue(true)}catch{notify('Rename readback is unavailable. No rename was repeated.')}})(),'btn small'));

    }else if(review.state==='RENAME_EXISTING_REQUESTED'){
      const note=el('p','setting-note','Checking rename progress…'),actions=el('div','form-foot');content.append(note,actions);
      void (async()=>{try{const attempt=await readPort('pcms-r4-folder-identity','GET_RENAME_ATTEMPT',{newSlug:review.newSlug},15000);if(!row.isConnected)return;
       if(!attempt.ok){note.textContent='Rename status is unavailable. Retry when the account is available.';return}
       note.textContent=attempt.state==='REMOTE_RENAME_VERIFIED_LINK_PENDING'?'Rename verified. Connecting the new source automatically.':
        ['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN'].includes(attempt.state)?'Checking the remote result. The rename will not be repeated.':
        attempt.automaticApproved?'Rename queued. Owner, source and protected route are checked automatically.':'Approve this rename to continue. The original generator is unchanged.';
       const check=b(attempt.automaticApproved?'Check rename':'Approve rename',()=>void(async()=>{
        if(!attempt.automaticApproved&&!window.confirm('Rename '+review.oldSlug+' to '+review.newSlug+' after verified owner and source checks? URLs and imports may change. PCMS makes one attempt and verifies the outcome.'))return;
        check.disabled=true;
        try{const out=attempt.automaticApproved?await readPort('pcms-r4-folder-identity','RUN_RENAME_JOB',{newSlug:review.newSlug},120000):
          await readPort('pcms-r4-folder-identity','CHOOSE',{newSlug:review.newSlug,choice:'RENAME_EXISTING',expectedTreeOid:review.newTreeOid,expectedRevision:review.revision,authorizeRename:true},15000);
         if(!out.ok)notify('Rename is waiting for current owner, source or route verification. Its original history is preserved.');await loadQueue(true);
        }catch{note.textContent='Rename result is not confirmed. Check progress; no possible rename is repeated.'}finally{check.disabled=false}
       })(),'btn small');actions.append(check,b('Open original generator',()=>{state.gen.query=review.oldSlug;state.gen.offset=0;routeTo('generators')},'btn small'));
      }catch{note.textContent='Rename status is unavailable. The existing resource is preserved.'}})();
    }else if(review.state==='REMOTE_RENAMED_LINK_PENDING'){
      content.append(el('p','setting-note',
        'Remote rename readback was recorded. The inventory and new source link must still be verified.'));
      content.append(b('Open generators',()=>routeTo('generators'),'btn small'));
    }else{
      const actions=el('div','form-foot');
      async function choose(choice){
       const prompt=choice==='CREATE_SEPARATE'?
        'Keep the original generator unchanged and authorize a separate new generator from this Git folder? Normal owner, route, source and publication safety checks still apply.':
        'Rename '+review.oldSlug+' to '+review.newSlug+'? PCMS verifies ownership, protected route and unchanged source, makes one rename attempt and checks the result. URLs and imports may change.';
       if(!window.confirm(prompt))return;
       try{
        const answer=await readPort('pcms-r4-folder-identity','CHOOSE',{
         newSlug:review.newSlug,choice,expectedTreeOid:review.newTreeOid,
         expectedRevision:review.revision,...(choice==='RENAME_EXISTING'?{authorizeRename:true}:{})},12000);
        if(!answer?.ok){notify('The identity choice could not be confirmed. Refresh and review again.');return;}
        notify(choice==='CREATE_SEPARATE'?
          'Separate identity recorded. The next complete Git scan will check eligibility.':
          'Rename queued. PCMS will verify the original resource and preserve its source.');
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
  if((q.filter==='Needs action'||q.filter==='All'))
   for(const slug of q.missing){
    const row=el('div','queue-item'),mark=el('span','row-mark warn');mark.append(icon('alert'));
    const data=el('div','row-body');row.dataset.missingSlug=slug;
    data.append(el('strong','','Git source missing: '+slug),
      el('p','setting-note',
       'The folder was absent from a complete main snapshot. The live generator has not been deleted or unlisted.'));
    row.append(mark,data,b('Inspect source and history',()=>void openFolderContext(slug),'btn small'));holder.append(row);
   }
  for(const candidate of q.releaseItems.filter(x=>matchesReviewGroup(x.state,queueGroup(q.filter)))){
    if(q.query&&!candidate.slug.includes(q.query.toLowerCase()))continue;
    const row=el('div','queue-item');const detail=el('div','row-body');
    detail.append(el('strong','',candidate.slug),
      el('p','setting-note',candidate.state==='READY_FOR_REVIEW'?
        'Final tested source is ready for individual publication review.':
        candidate.state==='EXCEPTION_READY_FOR_REVIEW'?
        'Exceptional candidate — manual evidence and incomplete tests require individual review.':
        ({IN_DEVELOPMENT:'Development and independent tests continue automatically.',DEVELOPMENT_RUNNING:'The helper is working on this candidate.',WAITING_FOR_GIT:'Saving verified source to GitHub.',APPROVED:'Approved. Publication continues automatically.',APPROVED_HELD:'Approval is saved. Inspect the current hold or cancel unsent publication.',CONFIRMED_PUBLIC:'Published source was independently confirmed.',HUMAN_DEFERRED:'Your editor is preserved. Adopt its saved source when ready.',CHANGES_REQUESTED:'Your instructions are saved. Development will resume automatically.',PUBLICATION_UNCERTAIN:'Checking a possible publication without sending it again.'})[candidate.state]||'Inspect this candidate to resolve its current hold.'));
    const action=b('Inspect candidate',()=>void openReleaseReview(candidate.slug),'btn small'),manage=b(candidate.readyCandidate?.restoredHistorical?'Recover restored source':'Manage development',()=>candidate.readyCandidate?.restoredHistorical?openReadyCandidate(candidate.readyCandidate):candidate.development?void openAiJob(candidate.slug):openReadyCandidate(candidate.readyCandidate),'btn small');
    row.classList.add('candidate-item');const actions=el('div','candidate-actions');actions.append(action,manage);
    if(candidate.providerVisibility==='PUBLIC'&&candidate.state!=='CONFIRMED_PUBLIC')actions.append(b('Update now',()=>openReadyCandidate({...candidate.readyCandidate,updateNowAvailable:true})));
    row.append(cleanPublication.checkbox(candidate.slug),detail,actions);holder.append(row);
   }
  for(const candidate of (q.releaseUnavailable?q.readyItems:[])||[]){
   if(q.releaseItems.some(x=>x.slug===candidate.slug))continue;
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
   if(job.readyManaged&&!q.releaseUnavailable)continue;
   if(q.releaseItems.some(x=>x.slug===job.slug))continue;
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
   if(n.causalGroup?.memberCount>1){renderIncidentGroupRow(holder,n.causalGroup);continue;}
   const row=el('div','queue-item');row.dataset.noticeScope=n.scopeId;row.dataset.noticeCode=n.code;
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
    BACKUP_FAILED:'Backup needs attention'
   }[n.code]||'An operational issue needs review';
   header.append(el('strong','',issueTitle),
     statusPill(n.state==='RESOLVED'?'Recovered':n.reviewed?'Reviewed — still active':'Needs attention',n.state==='RESOLVED'?'green':'amber'));
   detail.append(header,el('div','row-meta',
     'Recorded local issue · '+(Number.isFinite(n.lastAt)?new Date(n.lastAt).toLocaleString():'time not recorded')));
   const action=el('button','btn small',n.state==='RESOLVED'?'Recovered':n.reviewed?'Reviewed':'Mark reviewed');
   action.type='button';
   action.addEventListener('click',async()=>{action.disabled=true;
    try{
     const out=await acknowledgeIncident(n,async(type,params)=>type==='ACK_NOTICE'?readQueueNoticeAck({...n,scopeId:params.scopeId,code:params.code,revision:params.expectedRevision}):guardedRead('pcms-i02-canonical-readonly',type,params));
     if(out?.ok&&out.stillActionable===true)await loadQueue(true);
     else{notify('Review not confirmed. Incident remains active.');if(out?.code==='STALE_REVISION')await loadQueue(true);}
    }catch{notify('Review not confirmed. Incident remains active.');}
    finally{action.disabled=n.reviewed;}
   });
   const recovery=b(incidentPrimaryAction(n).label,()=>void openIncident(n),'btn small');
   action.disabled=n.reviewed||n.state==='RESOLVED';row.append(marker,detail,recovery,action);holder.append(row);
  }
  for(const op of q.operations){
   const row=el('div','queue-item');const info=queueState[op.status]||['Not verified',''];
   const marker=el('span','row-mark'+(info[1]==='amber'?' warn':''));marker.append(icon(info[1]==='amber'?'alert':'activity'));
   const detail=el('div','row-body'),header=el('div','queue-head');
   header.append(el('strong','',operationTitle(op)),statusPill(info[0],info[1]));
   detail.append(header,el('div','row-meta',
     'Protected operation'+(Number.isFinite(op.updatedAt)?
      ' · last recorded '+new Date(op.updatedAt).toLocaleString():
      ' · last update not recorded')));
   const action=b('Inspect',()=>openOperationRecord(op));
   row.append(marker,detail,action);holder.append(row);
  }
  if(!holder.children.length)
    renderEmpty(holder,q.more?'No matches on this page. More recorded work may be available on subsequent pages.':
      'No matching work items.');
 }
 const records=holder.querySelectorAll('.queue-item').length,candidates=holder.querySelectorAll('.candidate-item').length;
 const counters=shadow('.queue-stats');if(counters){counters.replaceChildren();
  counters.append(el('span','',q.loading?'Loading work…':candidates+' candidates · '+Math.max(0,records-candidates)+' other items on this page'+
    (q.missingTotal!==null?' · '+q.missingTotal+' matching missing sources of '+q.missingUnfilteredTotal:'')+
    (q.reviewTotal!==null?' · '+q.reviewTotal+' matching identity reviews of '+q.reviewUnfilteredTotal:'')));
 }
 for(const tab of shadow('.tabs[aria-label="Work queue status"]')?.querySelectorAll('[data-filter]')||[]){
  const f=tab.dataset.filter.split(':')[1],badge=tab.querySelector('.count');if(badge)badge.hidden=true;
  tab.setAttribute('aria-selected',String(f===q.filter));
 }
 const foot=shadow('.pagination span');if(foot)foot.textContent=q.loading?'Loading work…':q.error?'Saved work is unavailable':records+' work '+(records===1?'item':'items')+' on this page'+(q.missingTotal!==null?' · '+q.missingTotal+' missing sources match':'');
 const prev=shadow('[data-action="queue-prev"]'),next=shadow('[data-action="queue-next"]');
 if(prev)prev.disabled=q.loading||q.history.length===0;
 if(next)next.disabled=q.loading||!q.more;
}
// Human publication review: sealed source evidence and exact candidate
// fingerprint are provided by the protected release boundary. The UI cannot
// invent PASS, bypass source/route checks or publish from a review ACK.
async function openReleaseReview(slug){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),dialog=el('div','drawer review-workspace');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Review exact candidate for '+slug);
 const close=()=>{overlay.remove();if(previous?.isConnected)previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Review '+slug),b('Close',close));
 dialog.append(head);
 const body=el('div','drawer-body'),status=el('p','setting-note','Verifying the exact final candidate and tests…');
 status.setAttribute('role','status');body.append(status);dialog.append(body);overlay.append(dialog);root.append(overlay);
 head.querySelector('button')?.focus();
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){
  const controls=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')].filter(x=>x.getClientRects().length);
  const i=controls.indexOf(root.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0]?.focus()}
 }});
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
 let local;
 try{local=await readPort('pcms-i13-release','GET_LOCAL_REVIEW',{slug},30000)}catch{}
 if(!overlay.isConnected)return;
 if(local?.ok){
  mountSourceComparison({container:body,view:local,el,b,request:(type,params)=>readPort('pcms-i13-release',type,params,30000)});
  const testsLabel=({TESTS_VERIFIED:'Tests verified',KNOWN_FAILURE:'A required test failed',TESTS_UNVERIFIED:'Testing incomplete',UNVERIFIED:'Not tested'})[local.tests?.state]||'Testing incomplete';
  const checks=el('details');checks.append(el('summary','','Test observations · '+testsLabel));
  for(const t of [...(local.tests?.default||[]),...(local.tests?.optional||[])])checks.append(el('p','setting-note',t.name+' — '+t.result));
  body.append(checks);
 }else body.append(el('p','setting-note','Saved source is not available for comparison yet.'));
 mountSourceHistory({container:body,slug,el,b,request:(type,params)=>readPort('pcms-i13-release',type,params,30000)});
 body.append(b('Refresh review',()=>{close();void openReleaseReview(slug)}));
 const recover={container:body,slug,el,b,request:(type,params)=>readPort('pcms-i13-release',type,params,95000),onChanged:()=>{close();void openReleaseReview(slug)}};
 await Promise.all([mountHumanRecovery(recover),mountExceptionalReview(recover)]);
 if(!overlay.isConnected)return;
 let persisted;
 try{persisted=await releaseCommand('GET',{slug});}catch{persisted=null;}
 if(persisted?.ok&&persisted.state==='CONFIRMED_PUBLIC'&&local?.currentReady&&
    persisted.stageRevision===local.stageRevision&&persisted.jobRevision===local.jobRevision&&persisted.sourceFingerprint===local.sourceFingerprint){
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
 if(persisted?.ok&&persisted.state==='CONFIRMED_PUBLIC')body.append(el('p','setting-note','A previous candidate was published. The source shown here requires its own review.'));
 if(persisted?.ok&&persisted.state==='APPROVED'){
  const cancel=b('Cancel unsent publication',()=>void(async()=>{
   cancel.disabled=true;
   try{const current=await releaseCommand('GET',{slug});
    const result=current?.ok&&current.state==='APPROVED'?await readPort('pcms-i13-release','CANCEL_APPROVED',{slug,expectedRevision:current.revision},30000):null;
    if(result?.ok){close();void openReleaseReview(slug);void loadQueue(true)}else status.textContent='Publication state changed. Refresh to inspect its current outcome.';
   }catch{status.textContent='Cancellation could not be confirmed. Refresh the saved publication state.'}finally{cancel.disabled=false}
  })());body.append(cancel,el('p','setting-note','Approval is saved. Publication continues automatically when its current checks are satisfied.'));
 }
 if(local?.ok&&local.requestChangesEligible){
 const instructions=el('textarea','form-input');instructions.rows=3;
 instructions.placeholder='Optional request: describe changes needed to the tested candidate';
 instructions.setAttribute('aria-label','Request changes to candidate');
 const requestChanges=b('Request changes',()=>void (async()=>{
  if(instructions.value.trim().length<3)return;
  const message=instructions.value.trim();
  if(!window.confirm('Request these changes? The current candidate will no longer be eligible for unchanged publication approval.'))return;
  requestChanges.disabled=true;
  try{
   const r=await readPort('pcms-i13-release','REQUEST_CHANGES',{
    slug,expectedStageRevision:local.stageRevision,expectedJobRevision:local.jobRevision,
    sourceFingerprint:local.sourceFingerprint,instructions:message,
    ...(persisted?.revision?{releaseRevision:persisted?.revision}:{})},95000);
   status.textContent=r?.ok?'Changes requested. New tested source needs fresh individual review.':
      'Changes were not requested: '+(r?.code||'unconfirmed outcome')+'. Your instructions are preserved.';
   if(r?.ok){instructions.value='';void loadQueue(true)}
  }catch{status.textContent='Change request outcome unconfirmed; check the candidate record.'}
  finally{requestChanges.disabled=false}
 })(),'btn small');
 body.append(instructions,requestChanges);
 }
 let view;
 try{view=await readPort('pcms-i13-release','PREVIEW',{slug},95000)}
 catch{status.textContent='Review cannot open until secure GitHub access and source evidence are available.';return}
 if(!overlay.isConnected)return;
 if(!view?.ok){status.textContent='The final source is not currently eligible for review. No approval or publication was attempted.';return}
 status.textContent=view.mode==='INDIVIDUAL_EXCEPTIONAL_MANUAL_REVIEW'?
  'Exceptional manual review: AI testing is not fully verified.':
  'Candidate source, test results and Git revision verified for this review snapshot.';
 if(!local?.ok||local.stageRevision!==view.stageRevision||local.jobRevision!==view.jobRevision||local.sourceFingerprint!==view.sourceFingerprint){
  status.textContent='The candidate changed while this review was opening. Refresh review to inspect the current source before approval.';return;
 }
 const provenance=el('details'),summary=el('dl');provenance.append(el('summary','','Source provenance'));
 for(const [label,value] of [['Candidate fingerprint',view.sourceFingerprint],['Previous fingerprint',view.previousFingerprint],['Pinned Git main',view.gitHead]]){
  const pair=el('div','kv');pair.append(el('dt','',label),el('dd','',value));summary.append(pair);
 }
 provenance.append(summary);body.append(provenance);
 const footer=el('div','form-foot');
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
  approve.disabled=true;
  try{
   const r=await readPort('pcms-i13-release','APPROVE',{
    slug,expectedStageRevision:view.stageRevision,expectedJobRevision:view.jobRevision,
    fingerprint:view.sourceFingerprint,explicitApproval:true},95000);
   if(r?.ok&&r.state==='APPROVED')await publish(r);
   else status.textContent='Approval was not confirmed. No new publication was requested: '+(r?.code||'UNKNOWN')+'.';
  }catch{status.textContent='Approval outcome uncertain. Read the saved release record before any new request.'}
  finally{await loadQueue(true);}
 })(),'btn primary');
 if(!view.operatorPaused)footer.append(approve);
 else body.append(el('p','setting-note','Development is paused. Resume it when you are ready to publish; you can still request changes.'));
 if(persisted?.ok&&persisted.state==='APPROVED')approve.remove();
 body.append(checkLabel,footer);
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
  if(!['ASSESS_READY','REQUALIFY_RESTORED'].includes(type)&&!window.confirm(
   type==='UPDATE_NOW'?'Update this public generator now, before its normal maintenance window? PCMS will preserve its previous source, wait for safe capacity, unlist it before editing, and require your approval before publishing.':
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
    UPDATE_NOW_QUEUED:'Update requested. PCMS will continue automatically when source, account and capacity checks are satisfied.',
    UPDATE_NOW_SAFE_PUBLIC_BASELINE_REQUIRED:'The public source or a current operation needs verification before this update can start.',
    S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED:'This public generator must first complete its protected sleep/unlisting workflow.',
    S05_NONEMPTY_TARGET_REQUIRES_RECOVERABLE_PREDECESSOR:'A recoverable previous source is required before this update.',
    RESTORED_SOURCE_REQUALIFIED:'Restored source is verified under this account. Old tests and approvals remain historical; guarded work can continue.',
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
  [...actions.querySelectorAll('button')].forEach(x=>x.disabled=false);
 }
 const assess=b('Assess prerequisites',()=>void act('ASSESS_READY'),'btn small');

 const pause=b(candidate.hold==='OPERATOR_PAUSED'?'Resume READY work':'Pause READY work',
  ()=>void act(candidate.hold==='OPERATOR_PAUSED'?'RESUME_READY':'PAUSE_READY'),'btn small');
 if(candidate.updateNowAvailable)actions.append(b('Update now',()=>void act('UPDATE_NOW'),'btn primary'));
 if(candidate.restoredHistorical)actions.append(b('Recheck restored source',()=>void act('REQUALIFY_RESTORED'),'btn primary'));
 actions.append(pause,assess);body.append(facts,status,actions);panel.append(head,body);
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
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','AI development for '+slug);
 let timer,pending=false,loading=false,current=null,lastSignature='';
 const close=()=>{clearInterval(timer);overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Develop · '+slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note','Reading development…');status.setAttribute('role','status');
 const metadata=el('dl'),details=el('details'),actions=el('div','form-foot');details.append(el('summary','','Development details'),metadata);
 const message=el('p','setting-note');message.setAttribute('role','status');
 const label=el('label','','New instructions'),instructions=el('textarea','form-input');instructions.rows=4;instructions.maxLength=4000;instructions.setAttribute('aria-label','New development instructions');
 label.append(instructions);const queued=el('p','setting-note'),give=b('Give new instructions',()=>void control('GIVE_INSTRUCTIONS',{instructions:instructions.value}),'btn primary');
 const form=el('div','development-instructions');form.append(label,queued,give);
 body.append(status,actions,form,message,details);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){
  const all=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary')].filter(x=>x.getClientRects().length),i=all.indexOf(root.activeElement);
  if(e.shiftKey&&i<=0){e.preventDefault();all.at(-1)?.focus()}else if(!e.shiftKey&&i===all.length-1){e.preventDefault();all[0]?.focus()}
 }});head.querySelector('button')?.focus();
 async function control(type,extra={}){if(pending||!current)return;if(type==='GIVE_INSTRUCTIONS'&&instructions.value.trim().length<3){message.textContent='Describe the change in at least three characters.';instructions.focus();return}
  pending=true;give.disabled=true;actions.querySelectorAll('button').forEach(x=>x.disabled=true);
  try{const out=await readPort('pcms-i10-ai',type,{slug,expectedRevision:current.revision,
    ...(['SET_PAUSED','GIVE_INSTRUCTIONS'].includes(type)?{expectedControlRevision:current.controlRevision}:{}),...extra},95000);
   message.textContent=out?.ok?type==='GIVE_INSTRUCTIONS'?'Instructions saved for the next eligible turn. The pinned testing prompt remains in force.':type==='SET_PAUSED'?(extra.paused?'Development paused. An active session will be stopped and its saved source checked.':'Development resumed. PCMS will continue when the account and source are ready.'):'Session checked.':
    out?.code==='AI_ACCOUNT_CONCURRENCY_HELD'?'Resume is waiting for account capacity. Other jobs continue. PCMS will continue automatically when a slot is available.':
    out?.code==='STALE_REVISION'?'Development changed. Your instructions are preserved; check the current state and retry.':'The request could not be confirmed. Your text is preserved; the current saved job is shown below.';
   if(out?.ok&&type==='GIVE_INSTRUCTIONS')instructions.value='';
  }catch{message.textContent='The response was lost. The current saved job will be read before another request; your text is preserved.'}
  finally{pending=false;lastSignature='';await load();void loadQueue(true)}
 }
 async function load(){if(loading||pending||!overlay.isConnected)return;loading=true;
  try{const j=await readPort('pcms-i10-ai','GET_JOB',{slug},22000);if(!overlay.isConnected)return;
   if(!j?.ok){status.textContent='Development is unavailable. Saved work is preserved; reconnect and retry.';return}
   current=j;status.textContent=(j.operatorPaused?(j.operatorJudgment?'Repair ended by you · ':'Paused · '):j.awaitingExecutionSlot?'Waiting for account capacity · ':humanAiStatus(j)+' · ')+(j.state==='TESTS_VERIFIED'||j.exceptionFrozen?'Ready for source review.':'PCMS advances development and independent tests automatically.');
   const signature=JSON.stringify([j.revision,j.controlRevision,j.nativeState,j.state,j.hold]);if(signature===lastSignature)return;lastSignature=signature;
   metadata.replaceChildren();actions.replaceChildren();
   for(const [name,value] of [['Job revision',j.revision],['Source',j.sourceFingerprint],['Pinned prompt',j.promptRevision],['Native session',j.nativeState],['Tests',j.evidence?.state],['Current hold',j.hold||'None']]){
    const row=el('div','kv');row.append(el('dt','',name),el('dd','',value));metadata.append(row)}
   if(j.state!=='HUMAN_OWNED')actions.append(b(j.operatorPaused?'Resume development':'Pause development',()=>void control('SET_PAUSED',{paused:!j.operatorPaused})));
   if(!j.operatorPaused&&!['TESTS_VERIFIED','HUMAN_OWNED'].includes(j.state)&&!j.exceptionFrozen)actions.append(b('End further repair',()=>{if(window.confirm('Confirm that further repair of this candidate is unproductive? PCMS will stop this repair and preserve its source, failures and history. You can resume later.'))void control('SET_PAUSED',{paused:true,judgment:'UNPRODUCTIVE'})}));
   actions.append(b('Inspect source and history',()=>{close();void openReleaseReview(slug)}));
   if(j.state==='TESTS_VERIFIED'||j.exceptionFrozen)actions.append(b('Review and request changes',()=>{close();void openReleaseReview(slug)}));
   if(['HELD_RECONCILE'].includes(j.state)||['DISPATCH_POSSIBLE','RUNNING_OBSERVED'].includes(j.nativeState))actions.append(b('Check session',()=>void control('PROBE_NATIVE')));
   form.hidden=['TESTS_VERIFIED','HUMAN_OWNED'].includes(j.state)||j.exceptionFrozen;queued.textContent=j.pendingInstruction?'Queued: '+j.pendingInstruction.text:'';
   give.disabled=!!j.pendingInstruction;give.textContent=j.pendingInstruction?'Instructions queued':'Give new instructions';
  }catch{status.textContent='Development could not be read. Retry when the extension responds.'}
  finally{loading=false}
 }
 await load();if(overlay.isConnected)timer=setInterval(()=>void load(),5000);
}
function openOperationRecord(op){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),dialog=el('div','drawer');
 dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-label','Recorded operation details');
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const header=el('div','drawer-head');
 header.append(el('h2','drawer-title',operationTitle(op)+' · '+(queueState[op.status]?.[0]||'Needs review')),b('Close',close));
 const body=el('div','drawer-body'),fields=el('dl'),context=el('div'),technical=el('details');
 context.setAttribute('role','status');technical.append(el('summary','','Recorded details'),fields);
 for(const [name,value] of [['Target',op.targetId],['Operation',op.operationId],
  ['Type',op.effectType||'Unknown'],['State',op.status||'Unknown'],
  ['Revision',String(op.revision??'Unknown')],
  ['Updated',Number.isSafeInteger(op.updatedAt)?new Date(op.updatedAt).toLocaleString():'Not recorded']]){
  const row=el('div','kv');row.append(el('dt','',name),el('dd','',value));fields.append(row);
 }
 body.append(context,technical);
 const help={
  PREPARED:'This operation is reserved locally. It has not been dispatched. Check account, route, permissions and scheduling before expecting a remote change.',
  READY_TO_DISPATCH:'This older request passed its recorded prerequisites. Its saved state must be checked before any further action.',
  PREFLIGHT_FAILED:'An earlier prerequisite check failed. Check the saved request and its account; a failure label alone does not prove whether a remote action occurred.',
  DISPATCH_POSSIBLE:'A remote effect may already have occurred. Do not retry. Reconcile the exact target using an independent provider readback.',
  OBSERVING:'The runtime is verifying the remote result. An acknowledgment alone does not confirm the effect.',
  HELD_UNCERTAIN:'The effect outcome is uncertain. It remains fenced; use the matching protected workflow’s reconciliation action, not a retry.',
  CONFIRMED:'The operation journal records an independently verified equivalent result. Review the exact source or listing separately if needed.',
  ABORTED:'The operation ended before dispatch. No remote effect was authorized by this record.',
  REJECTED:'The controller rejected the operation. Check current prerequisites and latest canonical state before creating a new request.'
 };
 const guidance=el('p','setting-note',help[op.status]||
  'This older request needs review. Its history is preserved and possible remote actions remain held.');
 body.append(guidance);
 const actions=el('div','drawer-foot');
 const check=b('Check saved status',()=>void loadContext(),'btn small');
 actions.append(check);
 actions.append(b('View current queue',()=>{close();void loadQueue(true)},'btn small'));
 dialog.append(header,body,actions);overlay.append(dialog);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 async function loadContext(){
  check.disabled=true;
  try{
   const out=await readPort('pcms-i02-canonical-readonly','GET_OPERATION_CONTEXT',{operationId:op.operationId},15000);
   if(!overlay.isConnected)return;
   if(!out?.ok){context.textContent='Saved request details could not be read. Retry; the original operation is preserved.';return}
   const c=out.context;context.replaceChildren();
   if(c.related?.slug)context.append(el('strong','',c.related.slug));
   if(c.evidence==='RECORDED_NO_DISPATCH')guidance.textContent='The saved checks failed before dispatch. No creation or rename was sent by this recorded attempt. Repair its account prerequisites; the original request remains preserved and is not replayed.';
   else if(c.status==='PREFLIGHT_FAILED')guidance.textContent='This historical request failed a prerequisite check, but its dispatch history is incomplete or conflicting. Keep its possible remote result held. Checking saved status never retries creation or rename.';
   else if(c.failure?.code==='CREATE_OUTCOME_UNKNOWN_NO_IDENTITY')guidance.textContent='Perchance may have created a temporary generator, but its response did not identify it. Open the account to inspect its owned inventory. This request stays held; do not resubmit it.';
   if(c.failure?.code){
    const note=el('p','setting-note',({INITIAL_INVENTORY_UNKNOWN:'An account’s initial owned inventory was not available.',
     TEMPLATE_UNVERIFIED:'The earlier creation check could not read its fixed template. Check the current template separately; the original failure is retained.',
     TEMPLATE_SOURCE_UNVERIFIED:'The original template source was unverified. Check the account and current template; the historical request is not retried.',
     TEMPLATE_OWNER_UNVERIFIED:'The earlier template ownership check was not verified. A current read does not replay that request.',
     MULLVAD_LOCAL_SERVICE_UNAVAILABLE:'The Mullvad connection was unavailable when this request was checked.',
     PROTECTED_ROUTE_NOT_PINNED:'This account did not have a verified protected route.',
     PROTECTED_ROUTE_UNVERIFIED:'This account’s protected route was not verified.'})[c.failure.code]||'The earlier check recorded a failure. Its original reason is retained in Recorded details.');context.append(note);
    fields.querySelector('[data-operation-failure]')?.remove();
    const reason=el('div','kv');reason.dataset.operationFailure='';reason.append(el('dt','',c.failure.kind==='LAST_ATTEMPT'?'Latest saved reason':'First recorded reason'),el('dd','',c.failure.code));fields.append(reason);
   }
   actions.querySelectorAll('[data-operation-related]').forEach(e=>e.remove());
   if(c.related?.accountId){
    const account=b('Open account',()=>void(async()=>{
     account.disabled=true;
     try{const out=await accounts(),a=out.accounts.find(a=>a.accountId===c.related.accountId);
      if(a){close();openAccountManager(a)}else notify('The original account is unavailable. Its request and history are preserved.');
     }catch{notify('The account could not be read. Retry without resubmitting the request.')}
     finally{account.disabled=false;}
    })());account.dataset.operationRelated='';actions.prepend(account);
   }
   if(c.provenance==='HISTORICAL_SUPPLY_V1'&&c.related?.batchId&&c.related?.accountId&&
     /^supply_(create|rename)_v1$/.test(c.effectType||'')){
    const observation=el('p','setting-note');observation.setAttribute('role','status');
    observation.dataset.templateReadback='UNOBSERVED';context.append(observation);
    const inspect=b('Check current creation template',()=>void(async()=>{
     inspect.disabled=true;observation.textContent='Reading the current template under the original account…';
     try{
      const out=await readPort('pcms-i06-supply','READ_TEMPLATE',{operationId:c.operationId},45000);
      if(!observation.isConnected)return;
      if(out?.ok===true&&out.providerEffects==='NONE'&&out.replayAllowed===false&&out.templateObservation){
       const t=out.templateObservation;observation.dataset.templateReadback=t.state;
       observation.textContent=t.state==='MISSING_VERIFIED'?
        'The current creation template is missing. This saved request and its original failure remain unchanged.':
        t.ownership==='OWNED'?
        'The current template is available and belongs to this account. This check does not resume the saved request.':
        'The current template is available and its ownership was checked. The saved request and original failure remain unchanged.';
      }else{
       observation.dataset.templateReadback='UNAVAILABLE';
       observation.textContent=out?.code==='ORIGINAL_ACCOUNT_IDENTITY_UNVERIFIED'?
        'Verify the original account login and protected connection before checking the current template. The saved request is preserved.':
        out?.code==='TEMPLATE_OWNER_UNVERIFIED'?
        'Current template ownership could not be verified. The original failure and request remain held.':
        out?.code==='HISTORICAL_SCOPE_UNVERIFIED'?
        'The original account scope is incomplete in this historical record. Its history is preserved; no request was replayed.':
        'The current template could not be verified. The saved request remains unchanged; no creation or rename was attempted.';
      }
     }catch{if(observation.isConnected){observation.dataset.templateReadback='UNAVAILABLE';
       observation.textContent='The template read did not finish. Check its status again when the account is available; no creation or rename was attempted.';}}
     finally{inspect.disabled=false;}
    })());inspect.dataset.operationRelated='';actions.append(inspect);
   }
   if(c.archived===true){
    guidance.textContent='This failed request was archived after verified no-dispatch evidence. Nothing was retried. Its original failure and permanent no-replay protection remain.';
   }
   if(c.evidence==='RECORDED_NO_DISPATCH'&&c.status==='PREFLIGHT_FAILED'&&
      c.provenance==='HISTORICAL_SUPPLY_V1'){
    const archive=b('Archive failed attempt',()=>void(async()=>{
     if(!window.confirm('Archive this historical failed attempt? Its full failure history and no-replay protection remain. Nothing is retried.'))return;
     archive.disabled=true;
     try{
      const result=await readPort('pcms-i02-canonical-readonly','ARCHIVE_HISTORICAL_NO_DISPATCH',
        {operationId:c.operationId,expectedRevision:c.revision},15000);
      if(result?.ok===true&&result.archived===true){
       close();notify('Historical failed attempt archived. No remote operation was attempted.');void loadQueue(true);
      }else{context.append(el('p','setting-note',result?.code==='STALE_REVISION'?
       'The record changed. Check current status before archiving.':
       'Archiving is held without independent no-dispatch evidence. Original record preserved.'));}
     }catch{context.append(el('p','setting-note','Archiving was not confirmed. Check the saved status before another decision.'));}
     finally{archive.disabled=false;}
    })(),'btn small');
    archive.dataset.operationRelated='';actions.append(archive);
   }
   if(c.evidence==='RECORDED_NO_DISPATCH'&&c.effectType==='supply_create_v1'&&c.related?.slug){
    const fresh=b('Start separate new request',()=>{close();routeTo('generators');openGeneratorCreator()},'btn primary');
    fresh.dataset.operationRelated='';actions.append(fresh);
   }
   if(c.related?.generatorObserved){const target=b('Inspect generator',()=>{close();openSourceManager({slug:c.related.slug})});target.dataset.operationRelated='';actions.append(target)}
  }catch{if(overlay.isConnected)context.textContent='Saved details could not be checked. Retry; nothing was dispatched.'}
  finally{check.disabled=false;}
 }
 void loadContext();
 header.querySelector('button')?.focus();
}
async function openIncident(n){
 const observed=await readIncidentContext(n,{
  getNotice:params=>readPort('pcms-i02-canonical-readonly','GET_NOTICE_CONTEXT',params),
  getAccount:accountId=>readPort('pcms-i03-accounts','INSPECT_ACCOUNT',{accountId}),
  getGenerator:async slug=>{
   const out=await readPort('pcms-i04-inventory','INSPECT_GENERATORS',{slugs:[slug]});
   const row=out.items?.find(g=>g.slug===slug&&!g.missing);
   return {...out,generator:row};
  },
  getOperation:operationId=>readPort('pcms-i02-canonical-readonly','GET_OPERATION_CONTEXT',{operationId})
 });
 const target=observed.destination;
 if(observed.ok&&observed.targetState==='CURRENT'&&['GIT_FOLDER_MISSING','GIT_FOLDER_RENAME_REVIEW'].includes(observed.notice.code)&&
   observed.notice.target?.kind==='GENERATOR'){
  void openFolderContext(observed.notice.target.id);return;
 }
 if(target.kind==='SETTINGS'&&incidentPrimaryAction(observed.notice).kind==='SETTINGS'){
  if(target.id==='refresher'){routeTo('refresher');return}
  state.settings=target.id;routeTo('settings');return;
 }
 if(observed.targetState==='CURRENT'){
  if(target.kind==='ACCOUNT'){openAccountManager(observed.entity);return}
  if(target.kind==='OPERATION'){openOperationRecord(observed.entity);return}
  if(target.kind==='GENERATOR'){
   if(n.code==='GIT_FOLDER_RENAME_REVIEW'){
    state.queue.query=target.id;state.queue.filter='All';routeTo('work-queue');return;
   }
   void openFolderContext(target.id);return;
  }
 }
 openIncidentContext(observed);
}
function openIncidentContext(observed){
 const n=observed.notice,previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
 panel.setAttribute('aria-label','Incident details');
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Incident details'),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note',
  observed.ok===false?'Saved incident details could not be read. Its outcome remains unverified.':
  n.state==='RESOLVED'?'Verified recovery is recorded. The incident history is retained.':
  n.reviewed?'Reviewed; this incident is still active.':'This incident is still active.');
 status.setAttribute('role','status');body.append(status);
 const help={
  ROUTE_UNAVAILABLE:'Check the affected account and its PersonaMonkey connection before new protected work.',
  ACCOUNT_UNVERIFIED:'Open Accounts to verify the original login and identity.',
  SOURCE_HELD:'Inspect the saved source and candidate history before changing the source.',
  RESTORE_IN_PROGRESS:'Open Backups to inspect the current restore and reconciliation hold.',
  CANONICAL_UNAVAILABLE:'Open Diagnostics to check browser-local records. Existing operations remain held.',
  OPERATION_UNCERTAIN:'A possible remote result remains held. Inspect its saved operation and original account; do not resubmit it.',
  PROVIDER_OUTAGE:'Open Refresher to inspect the current provider and account observations.',
  BACKUP_FAILED:'Open Backups to inspect the export and saved source status.',
  GIT_RECONNECT_REQUIRED:'Open Connections to read the current GitHub failure before replacing credentials.',
  GIT_FOLDER_MISSING:'Inspect missing Git sources and retained local history. The live generator is preserved.',
  GIT_FOLDER_RENAME_REVIEW:'Review the recorded old and new source identities before choosing how to proceed.'
 };
 body.append(el('p','setting-note',help[n.code]||'The saved incident has no verified affected-entity reference. Inspect its original cause and choose the appropriate domain before changing anything.'));
 if(observed.targetState==='STALE')body.append(el('p','setting-note','The original target is no longer available in current records. Its saved incident is preserved.'));
 else if(observed.targetState==='UNAVAILABLE')body.append(el('p','setting-note','The current target could not be verified. Retry the read when its records are available.'));
 const actions=el('div','form-foot');
 const openAccounts=()=>{close();state.acct.query='';routeTo('accounts')};
 const settings=id=>()=>{close();if(id==='refresher')routeTo('refresher');else{state.settings=id;routeTo('settings')}};
 if(['ROUTE_UNAVAILABLE','ACCOUNT_UNVERIFIED','OPERATION_UNCERTAIN'].includes(n.code))
  actions.append(b('Open Accounts',openAccounts));
 if(['GIT_FOLDER_MISSING','GIT_FOLDER_RENAME_REVIEW','SOURCE_HELD'].includes(n.code))
  actions.append(b('Inspect source work',()=>{close();state.queue.query='';state.queue.filter='All';routeTo('work-queue')}));
 const destination=['RESTORE_IN_PROGRESS','BACKUP_FAILED'].includes(n.code)?'backups':
  n.code.startsWith('GIT_')||n.code==='ROUTE_UNAVAILABLE'?'connections':
  n.code==='PROVIDER_OUTAGE'?'refresher':'diagnostics';
 actions.append(b(({backups:'Open Backups',connections:'Open Connections',refresher:'Open Refresher',diagnostics:'Open Diagnostics'})[destination],settings(destination)),
  b('Check saved incident',()=>{close();void openIncident(n)}));
 body.append(actions);
 const technical=el('details'),fields=el('dl');technical.append(el('summary','','Recorded incident'));
 for(const [name,value] of [['Problem',n.code],['Original cause',n.firstReason||n.firstCause||n.code],
  ['Current cause',n.reason||n.cause||n.code],['Events',n.count||1],
  ['First observed',Number.isSafeInteger(n.firstAt)?new Date(n.firstAt).toLocaleString():'Not recorded'],
  ['Last observed',Number.isSafeInteger(n.lastAt)?new Date(n.lastAt).toLocaleString():'Not recorded']]){
  const row=el('div','kv');row.append(el('dt','',name),el('dd','',value));fields.append(row);
 }
 technical.append(fields);
 for(const h of n.history||[])technical.append(el('p','setting-note',
  (h.event||'Recorded change')+(Number.isSafeInteger(h.at)?' · '+new Date(h.at).toLocaleString():'')+
  (h.evidence?' · '+h.evidence:'')+(h.reason?' · '+h.reason:'')));
 body.append(technical);panel.append(head,body);overlay.append(panel);root.append(overlay);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 head.querySelector('button')?.focus();
}


function sourceConnectionMessage(code){
 return ({
  GIT_NOT_CONFIGURED:'GitHub is not connected.',
  GIT_CREDENTIAL_MISSING:'The saved Firefox GitHub credential is missing.',
  GIT_CREDENTIAL_REJECTED:'GitHub rejected the saved credential. Review its validity and repository access.',
  GIT_ACCESS_DENIED:'GitHub denied access. Check repository permissions; this does not prove that the credential is invalid.',
  GIT_IDENTITY_MISMATCH:'The repository identity differs from the saved connection.',
  GIT_LOCAL_STORAGE_UNAVAILABLE:'Firefox could not confirm the saved connection or observation.',
  GIT_NETWORK_UNAVAILABLE:'GitHub could not be reached. The saved credential is retained.',
  CATALOG_INCOMPLETE:'GitHub did not return a complete source observation.'
 })[code]||'The current Git observation could not be verified.';
}
async function openFolderContext(slug){
 if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)){notify('No verified source identity is available.');return;}
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer source-workspace');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Source context · '+slug);
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Source · '+slug),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note','Reading the recorded source association…');
 status.setAttribute('role','status');status.dataset.sourceObservation='UNAVAILABLE';
 const metadata=el('div'),actions=el('div','form-foot'),saved=el('div'),history=el('div');
 body.append(status,metadata,actions,saved,history);panel.append(head,body);overlay.append(panel);root.append(overlay);
 let busy=false,context=null;
 async function draw(fresh=null){
  if(busy)return;busy=true;
  try{
   const results=await Promise.allSettled([
    fresh?Promise.resolve(fresh):readPort('pcms-r4-folder-identity','GET_CONTEXT',{slug}),
    readPort('pcms-i13-release','GET_LOCAL_REVIEW',{slug},30000),
    readPort('pcms-i04-inventory','INSPECT_GENERATORS',{slugs:[slug]})
   ]);
   if(!overlay.isConnected)return;
   const value=i=>results[i].status==='fulfilled'?results[i].value:null;
   context=value(0);const local=value(1),inventory=value(2),generator=inventory?.items?.find(g=>g.slug===slug&&!g.missing);
   metadata.replaceChildren();actions.replaceChildren();saved.replaceChildren();history.replaceChildren();
   status.dataset.sourceObservation=context?.ok?context.presence:'UNAVAILABLE';
   status.textContent=context?.ok?
    context.presence==='MISSING_IN_COMPLETE_MAIN'?
     'This folder was absent from the last complete Git observation. The live generator and local history are preserved.':
    context.presence==='PRESENT_IN_COMPLETE_MAIN'?
     'This folder is present in the last complete Git observation. Local source history is shown separately.':
     'No current association was found in the recorded complete Git observation. Local history is preserved.':
    'The Git source association could not be read. Local source history can still be inspected.';
   if(context?.ok){
    metadata.append(el('p','setting-note','Last complete main: '+context.head+
     (Number.isSafeInteger(context.observedAt)?' · '+new Date(context.observedAt).toLocaleString():'')));
    if(context.currentConnectionCode&&context.currentConnectionCode!=='CATALOG_OBSERVED_READ_ONLY')
     metadata.append(el('p','setting-note',sourceConnectionMessage(context.currentConnectionCode)+' The earlier complete observation is retained.'));
    if(context.observation){
     const details=el('details');details.append(el('summary','','Recorded folder observations'));
     for(const [label,value] of [['First recorded absence',context.observation.firstAbsentHead],
       ['Latest complete absence',context.observation.lastAbsentHead],['Last recorded presence',context.observation.lastPresentHead],
       ['Reappearance',context.observation.returnedHead]])details.append(el('p','setting-note',label+': '+(value||'Not recorded')));
     metadata.append(details);
    }
    if(context.reviewTotal)metadata.append(el('p','setting-note',context.reviewTotal+' related identity reviews. No rename or separate creation is inferred.'));
   }
   const refresh=b('Read Git now',()=>void(async()=>{
    refresh.disabled=true;status.textContent='Reading complete Git main without starting provider work…';
    let out;try{out=await readPort('pcms-r4-folder-identity','REFRESH_OBSERVATION',{slug},95000);}catch{}
    if(!overlay.isConnected)return;
    refresh.disabled=false;
    if(out?.ok)await draw(out);else status.textContent=sourceConnectionMessage(out?.code)+' The prior source observation and history are preserved.';
   })());
   actions.append(refresh,b('Open Connections',()=>{close();state.settings='connections';routeTo('settings')}),
    b('Inspect preserved original',()=>openAdoptionManager(generator||{slug},{readOnly:true})));
   if(context?.reviewTotal)actions.append(b('Review source identities',()=>{close();state.queue.query=slug;state.queue.filter='All';routeTo('work-queue')}));
   if(local?.ok){
    saved.append(el('h3','','Saved source'));
    mountSourceComparison({container:saved,view:local,el,b,request:(type,params)=>readPort('pcms-i13-release',type,params,30000)});
    if(context?.presence!=='MISSING_IN_COMPLETE_MAIN')actions.append(b('Manage candidate',()=>{close();void openReleaseReview(slug)}));
   }else saved.append(el('p','setting-note','No current local candidate could be read. The preserved original and earlier checkpoints can be inspected separately.'));
   mountSourceHistory({container:history,slug,el,b,request:(type,params)=>readPort('pcms-i13-release',type,params,30000)});
  }finally{busy=false;}
 }
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 head.querySelector('button')?.focus();void draw();
}
function renderIncidentGroupRow(holder,g){
 const row=el('div','queue-item'),mark=el('span','row-mark warn');mark.append(icon('alert'));row.dataset.incidentGroup=g.key;
 const body=el('div','row-body'),n=g.notice,sharedHelper=['personamonkey_connection','PERSONAMONKEY_HELPER_OUTAGE'].includes(g.cause);
 body.append(el('strong','',sharedHelper?'Protected connection needs attention':n.code.replaceAll('_',' ').toLowerCase()),
  el('p','setting-note',g.affectedCount+' affected items · '+g.memberCount+' incident records · '+g.eventCount+' events'),
  statusPill(g.queryState==='RESOLVED'?'Recovered':g.reviewed?'Reviewed — still active':'Needs attention',g.queryState==='RESOLVED'?'green':'amber'));
 row.append(mark,body,b('Inspect affected items',()=>void openIncidentGroup(g),'btn small'));holder.append(row);
}
async function openIncidentGroup(group){
 const previous=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Affected incident items');
 const close=()=>{overlay.remove();previous?.isConnected&&previous.focus({preventScroll:true})};
 const head=el('div','drawer-head');head.append(el('h2','drawer-title','Affected items'),b('Close',close));
 const body=el('div','drawer-body'),status=el('p','setting-note'),list=el('div','queue-list'),pager=el('div','form-foot');
 status.setAttribute('role','status');body.append(status,list,pager);panel.append(head,body);overlay.append(panel);root.append(overlay);
 let after='',stack=[],busy=false;
 async function load(){
  if(busy)return;busy=true;status.textContent='Reading the actual incident members…';
  try{
   const [out,accountList]=await Promise.all([
    readPort('pcms-i02-canonical-readonly','LIST_NOTICE_GROUP_MEMBERS',{
     groupKey:group.key,after,limit:20,query:group.query||'',state:group.queryState||'ACTIVE'}),
    accounts().catch(()=>null)
   ]);
   if(!overlay.isConnected)return;
   if(!out?.ok)throw Error('MEMBERS_UNAVAILABLE');
   list.replaceChildren();pager.replaceChildren();status.textContent=out.total+' matching incident records of '+out.unfilteredTotal+' · review does not resolve an active hold.';
   const aliases=new Map((accountList?.accounts||[]).map(a=>[a.accountId,a.alias||'Affected account']));
   for(const n of out.items){
    const row=el('div','queue-item'),data=el('div','row-body');row.dataset.noticeScope=n.scopeId;row.dataset.noticeCode=n.code;
    const target=n.target,label=target?.kind==='ACCOUNT'?aliases.get(target.id)||'Account details unavailable':
     target?.kind==='GENERATOR'?target.id:target?.kind==='OPERATION'?'Recorded operation':
     target?.kind==='SETTINGS'?({backups:'Backups',connections:'Connections',refresher:'Refresher',diagnostics:'Diagnostics'})[target.id]:'Recorded affected item';
    data.append(el('strong','',label),el('p','setting-note',n.code.replaceAll('_',' ').toLowerCase()+' · '+n.count+' events'),
     statusPill(n.state==='RESOLVED'?'Recovered':n.reviewed?'Reviewed — still active':'Needs attention',n.state==='RESOLVED'?'green':'amber'));
    row.append(data,b(incidentPrimaryAction(n).label,()=>void openIncident(n)));
    if(n.state!=='RESOLVED'){
     const review=b(n.reviewed?'Reviewed':'Mark reviewed',()=>void(async()=>{
      review.disabled=true;
      try{const r=await acknowledgeIncident(n,async(type,params)=>type==='ACK_NOTICE'?
       readQueueNoticeAck({...n,scopeId:params.scopeId,code:params.code,revision:params.expectedRevision}):
       readPort('pcms-i02-canonical-readonly',type,params));
       if(!r?.ok)status.textContent='Review was not confirmed. The incident remains active.';
       else await load();
      }catch{status.textContent='Review was not confirmed. The incident remains active.'}
      finally{review.disabled=n.reviewed;}
     })());review.disabled=n.reviewed;row.append(review);
    }
    list.append(row);
   }
   if(!out.items.length)list.append(el('p','setting-note','No matching incident records remain in this view. Verified recovery remains in history.'));
   const prev=b('Previous affected items',()=>{after=stack.pop()||'';void load()}),next=b('Next affected items',()=>{stack.push(after);after=out.next;void load()});
   prev.disabled=!stack.length;next.disabled=!out.more;
   pager.append(prev,b('Refresh affected items',()=>{after='';stack=[];void load()}),next);
  }catch{if(overlay.isConnected)status.textContent='Incident members could not be read. Retry; no hold was dismissed.'}
  finally{busy=false;}
 }
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 head.querySelector('button')?.focus();void load();
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
 for(const [i,label] of ['Managed generators','Refresher','Work requiring attention','Last completed backup'].entries())
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
  guardedRead('pcms-i02-canonical-readonly','LIST_NOTICE_GROUP_PAGE',{limit:8,state:'ACTIVE'}),
  guardedRead('pcms-i02-canonical-readonly','LIST_OPERATION_PAGE',{limit:8,status:'RUNNING'}),
  portableBackupCommand({action:'STATUS'})
 ]).then(results=>{
  if(!still())return;
  const val=i=>results[i].status==='fulfilled'&&results[i].value?.ok?results[i].value:null;
  const inv=val(0),ref=val(1),summary=val(2),noticeTotals=val(3),ops=val(4),inc=val(5),running=val(6);
  stat(0,inv?.total===undefined?'—':String(inv.total),'Historical local inventory; not a live provider census');
  stat(1,ref?.ok?String(ref.occupied??'—'):'—',
    ref?.ok?'Currently occupied Refresher slots; provider visibility is separate':'Refresher state unavailable');
  const counts=summary?.states,attention=noticeTotals?.counts;
  const need=counts?Object.entries(counts).reduce((n,[key,value])=>n+(operationGroup(key)==='NEEDS_ACTION'?value:0),0)+
    (attention?.actionRequired||0)+(attention?.serious||0):null;
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
      el('div','row-meta',x.severity?x.causalGroup?.memberCount>1?x.causalGroup.affectedCount+' affected items · '+x.causalGroup.eventCount+' events':x.reviewed?'Reviewed; still active':'Needs attention':
        'Target '+x.targetId+' · '+(queueState[x.status]?.[0]||'Unknown status')));
    row.append(body,b(x.severity?incidentPrimaryAction(x).label:'Inspect operation',()=>x.severity?x.causalGroup?.memberCount>1?void openIncidentGroup(x.causalGroup):void openIncident(x):openOperationRecord(x)));panel.append(row);
   }
  };
  listRows(0,[...(inc?.items||[]).map(g=>({...g.notice,causalGroup:{...g,queryState:'ACTIVE'}})),...(ops?.items||[])].slice(0,8));
  listRows(1,running?.items||[]);
  for(const panel of blocks.slice(2)){const holder=panel.querySelector('.panel-scroll');
   if(holder){holder.replaceChildren();renderEmpty(holder,'No independent local proof has been loaded for this section.')}}
  // A native host or downloaded archive being present does not establish
  // an independently verified and recoverable backup.
  const backup=val(7),good=backup?.lastSuccess;
  stat(3,good?new Date(good.completedAt||good.day*86400000).toLocaleDateString():'—',
    good?'Firefox completed '+(good.kind==='MANUAL'?'manual':'daily')+' backup'+(backup.manual?.status==='FAILED'?' · latest manual attempt failed':''):
    backup?'No completed backup recorded':'Backup status unavailable');
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
 renderGitInventory({section,snapshot,el,b,request:readPort,refresh:async()=>{
  try{const out=await readPort('pcms-s03-catalog','SCAN_CONNECTED',{},95000);if(out.ok)renderConnectedMain(section,out);else notify('GitHub main could not be read. Retry when the connection is available.')}catch{notify('GitHub main is unavailable.')}
 },openSource:item=>openSourceManager({slug:item.slug}),openQueue:()=>routeTo('work-queue')});
}
function openGitWorkspace(){
 const prior=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer source-workspace');
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Git sources');
 const close=()=>{overlay.remove();prior?.isConnected&&prior.focus({preventScroll:true})};
 const head=el('div','drawer-head'),body=el('div','drawer-body');head.append(el('h2','drawer-title','Git sources'),b('Close',close));
 const feedback=el('p','setting-note','Reading GitHub main…');feedback.setAttribute('role','status');body.append(feedback);panel.append(head,body);overlay.append(panel);root.append(overlay);
 async function refresh(){try{const out=await readPort('pcms-s03-catalog','SCAN_CONNECTED',{},95000);if(!overlay.isConnected)return;
  if(!out.ok){feedback.textContent='Connect GitHub to browse and import source folders.';return}feedback.textContent='';
  renderGitInventory({section:body,snapshot:out,el,b,request:readPort,refresh,
   openSource:item=>{close();openSourceManager({slug:item.slug})},openQueue:()=>{close();routeTo('work-queue')}});
 }catch{feedback.textContent='GitHub is unavailable. Retry after checking the connection.'}}
 body.append(b('GitHub connection',()=>{close();state.settings='connections';routeTo('settings')},'btn small'),b('Retry',()=>void refresh(),'btn small'));
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}else if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(x=>!x.hidden);const i=controls.indexOf(root.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0]?.focus()}}});head.querySelector('button').focus();void refresh();
}
function primaryConnections(container){
 const section=primarySettingCard(container,'GitHub',
  'Connect once to enable background creation, development and tested-source writeback from main. Publication always needs your exact approval.');
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
   if(out?.ok){
    // First setup may enable accepted routine automation. Reconnect never
    // overrides an explicit, restored or ambiguous legacy pause.
    const policy=await readPort('pcms-s06-authority','GET',{},18000);
    if(policy?.onboardingAllowed&&policy.record.repositoryId===out.repositoryId)
      await readPort('pcms-s06-authority','SET',{repositoryId:out.repositoryId,expectedRevision:policy.record.revision,
        grants:{development:true,gitWrite:true,publication:true},consent:'I AUTHORIZE PROTECTED PCMS OPERATIONS'},18000);
   }
   status.textContent=out?.ok?'GitHub access saved. You can now read main.':
     out?.code==='GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED'?
     'Setup was interrupted. Use the recovery actions directly below.':
     out?.code==='GITHUB_AUTH_REJECTED'?'GitHub rejected this token. Check its access to the repository.':
     'Connection not confirmed. '+friendlyConnectionIssue(out?.code);
   await refreshConnection({retainStatus:true});
   if(out?.ok){const main=await readPort('pcms-s03-catalog','SCAN_CONNECTED',{},95000);if(main.ok)renderConnectedMain(section,main);}
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
  'Default instructions come from GitHub. Configure the required test set and workload limits below.');
 const feedback=el('p','setting-note','Loading the current AI settings…');
 feedback.setAttribute('role','status');
 mountGitPromptEditor({section,el,b,request:readPort,connect:()=>{state.settings='connections';renderSettingsSection()}});
 const testLabel=el('label','','Required test names (one per line)');
 const tests=el('textarea','form-input');tests.rows=4;
 tests.setAttribute('aria-label','Required test names');testLabel.append(tests);
 const countLabel=el('label','','Maximum concurrent AI tasks per verified account');
 const count=el('input','form-input');count.type='number';count.min='1';count.max='4';count.step='1';
 countLabel.append(count);
 const actions=el('div','form-foot'),save=b('Save required tests',()=>void(async()=>{
  const names=tests.value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
  if(!names.length||names.length>64||new Set(names).size!==names.length||
   names.some(x=>!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(x))){
   feedback.textContent='Enter 1–64 distinct valid required test names.';return}
  const current=state.aiCurrentPrompt;if(!current){feedback.textContent='Prompt revision unavailable. Reload current settings.';return}
  save.disabled=true;
  try{
   const out=await readPort('pcms-i10-ai','SET_PROMPT',{
    text:current.text,tests:names,expectedRevision:current.revision},16000);
   feedback.textContent=out?.ok?'Required test names saved for new jobs.':
      'Tests could not be saved. Reload the current revision before retrying.';
  }catch{feedback.textContent='Test settings were not confirmed. Read current revision before retrying.'}
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
 form.classList.add('git-ai-policy');form.append(testLabel,countLabel,actions,feedback);
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
    row.append(body,b('Manage development',()=>void openAiJob(job.slug),'btn small'));jobs.append(row);
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
   tests.value=(prompt.current.tests||[]).join('\n');
  }
  if(concurrency?.setting)count.value=String(concurrency.setting.perAccount);
  save.disabled=!prompt?.current;saveLimit.disabled=!concurrency?.setting;
  feedback.textContent=prompt?.current&&concurrency?.setting?
   'Required-test settings revision '+prompt.current.revision+
   '; maximum '+concurrency.setting.perAccount+' parallel job(s) per account. No test outcome inferred.':
   'AI settings could not be read. Changes remain unavailable until the canonical runtime responds.';
 }
 void refresh();
}
// I16 restore remains implemented by the original protected stage runner.
// Primary file inspection and choices bind the same guarded restore engine.
function primaryRestore(container){
 const section=primarySettingCard(container,'Restore a backup','');
 section.querySelector('h2').id='pcms-restore-title';section.querySelector('p')?.remove();
 const tpl=document.createElement('template');tpl.innerHTML=portableRestoreTemplate;
 const form=tpl.content.firstElementChild;
 form.querySelector('.panel-head')?.remove();
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
 mountBackupWorkspace(container,{card:primarySettingCard,el,b,request:portableBackupCommand,mountRestore:primaryRestore});
}
function primaryDiagnostics(container){
 const section=primarySettingCard(container,'Operational diagnostics',
  'Check each module, review saved results and test with a dedicated account when needed.');
 const tpl=document.createElement('template');tpl.innerHTML=diagnosticTemplate;
 const form=tpl.content.firstElementChild;form.className='form-stack';
 for(const input of form.querySelectorAll('input:not([type=checkbox]), select, textarea'))
   input.classList.add('form-input');
 for(const button of form.querySelectorAll('button'))button.classList.add('btn','small');
 section.append(form);
 mountDiagnosticController(section);
 mountOperatorChecklist(container,{card:primarySettingCard,el,b});
}
function renderSettingsSection(){if(state.route!=='settings')return;
 const names=['connections','automation','ai','backups','diagnostics','appearance','advanced'];
 const select=names.includes(state.settings)?state.settings:'connections';
 for(const b of page().querySelectorAll('[data-settings]')){b.classList.toggle('active',b.dataset.settings===select);b.setAttribute('aria-current',b.dataset.settings===select?'page':'false')}
 const container=shadow('.settings-main');if(!container)return;
 // Each category owns its visible form. Do not rehydrate obsolete hidden service cards.
 if(select==='appearance'){presentation.appearance(container);return}
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
 if(state.route==='work-queue'){
  const input=shadow('#queue-search');if(input)input.value=state.queue.query;
  for(const tab of root.querySelectorAll('[data-filter^="queue:"]')){const active=tab.dataset.filter==='queue:'+state.queue.filter;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  displayQueue();void loadQueue(true);
 }
 if(state.route==='generators'){
  presentation.mountTools();
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
 shadow('#main').scrollTop=0;
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
 const presentationStyle=document.createElement('link');presentationStyle.rel='stylesheet';presentationStyle.href=new URL('presentation.css',url).href;root.append(presentationStyle);
 const accountStyle=document.createElement('link');accountStyle.rel='stylesheet';accountStyle.href=new URL('accounts.css',url).href;root.append(accountStyle);
 const addon=document.createElement('style');addon.textContent=':host{display:block;height:100dvh;min-height:0} .pcms-action-toast{pointer-events:none;position:fixed;bottom:20px;right:25px;z-index:100;padding:12px 16px;background:#253e55;color:white;border-radius:7px;box-shadow:0 5px 24px #0003;max-width:380px} .pcms-action-toast[hidden]{display:none}';root.append(addon);
 let initial=location.hash.slice(1);if(!routes.includes(initial))initial='overview';state.route=initial;
 await presentation.ready;
 const version=shadow('.preview-label');if(version){version.textContent='PCMS '+state.version;version.setAttribute('aria-label','Installed PCMS version '+state.version)}
 installInteraction({root,preferences:presentation.preferences,route:()=>state.route,notify});
 routeHandlers();await render();
 const legacy=document.querySelector('body > .app');
 if(legacy)legacy.inert=true; // no hidden workflow focus or operator input
 document.body.classList.add('pcms-faithful-ready');
 window.addEventListener('pcms-find-test-generator',event=>{
  const slug=event.detail?.slug;if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))return;
  state.gen.query=slug;state.gen.offset=0;routeTo('generators');
 });
 window.addEventListener('hashchange',()=>{const dest=location.hash.slice(1);if(routes.includes(dest)&&dest!==state.route){state.route=dest;void render()}});
 // Foreground projection reads the same canonical background ports. Never
 // mirror an inaccessible hidden controller or infer completion from its DOM.
 const refreshOnWake=()=>{
  if(document.visibilityState==='hidden')return;
  if(state.route==='overview')displayOverview();
  else if(state.route==='work-queue')void loadQueue();
  else if(state.route==='generators')void loadGenerators();
  else if(state.route==='accounts')void loadAccounts();
  else if(state.route==='refresher')void loadRefresher();
  // Do not destroy active Settings forms on window focus/visibility changes.
  // The operator may be entering an unsaved Git token or restore path.
 };
 document.addEventListener('visibilitychange',refreshOnWake);
 window.addEventListener('focus',refreshOnWake);
 setInterval(()=>{if(document.visibilityState!=='hidden'&&state.route==='accounts')void loadAccounts()},2500);
 setInterval(()=>{if(document.visibilityState!=='hidden'&&state.route==='refresher')void loadRefresher()},20000);
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
