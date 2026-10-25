import {createOperatorRecords,downloadOperatorFile} from './operator-records.mjs';
// S08 operator-initiated, resumable live diagnostic. Uses ordinary production
// ports and canonical production receipts. Never invents a provider success.
import {DIAGNOSTIC_CONFIG,DIAGNOSTIC_RUN,STAGES,
  validateDisposable,evaluateDisposable,createDiagnosticRun,
  addDiagnosticEvent,diagnosticReport,recoverInterruptedDiagnostic,canStartNewDiagnostic,
  recoverDiagnosticIfInactive,DIAGNOSTIC_INDEPENDENT,
  independentReadOnlyResults,independentDiagnosticExport} from './s08-diagnostic-core.mjs';
// A07 one-document execution owner. A settings remount must not race an
// already dispatched diagnostic or convert RUNNING to a false cold-start hold.
let activeDiagnosticDrive=false;
const mountedViews=new Set();
function refreshMountedViews(){for(const update of mountedViews)update();}
// A07: direct primary UI mount; isolated per-view state and genuine guarded ports.
export function mountDiagnosticController(root=document){
const by=id=>root.querySelector('#pcms-diagnostic-'+id);
const consent=by('consent');
const account=by('account'),namespace=by('namespace'),save=by('designate'),
 start=by('run'),resume=by('resume'),rerun=by('rerun'),exporter=by('export'),
 independentButton=by('independent-run'),independentStatus=by('independent-status'),
 independentRows=by('independent-results'),
 status=by('status'),stages=by('stages'),scope=by('scope'),cleanup=by('cleanup');
const locate=by('locate'),gitFolder=by('git-folder'),historyLocate=by('history-locate');
function locateRun(selected){
 if(!selected||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(selected.slug||''))return;
 window.dispatchEvent(new CustomEvent('pcms-find-test-generator',{detail:{slug:selected.slug}}));
}
locate.addEventListener('click',()=>locateRun(run));
gitFolder.addEventListener('click',async()=>{
 if(!run)return;
 try{
  const cfg=(await browser.storage.local.get('pcmsS03Git')).pcmsS03Git;
  if(cfg?.repositoryId!==run.config.repositoryId||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(cfg.repository||''))throw Error('REPOSITORY_CHANGED');
  await browser.tabs.create({url:'https://github.com/'+cfg.repository+'/tree/main/generators/'+encodeURIComponent(run.slug),active:true});
 }catch{status.textContent='Reconnect the test repository in Connections before opening its folder.'}
});
let busy=false,independentBusy=false,independent=null,
  configuration=null,run=null,designationError=null;
const STAGE_LABELS={SCOPE:'Test setup',CREATE:'Private test generator',GIT_SOURCE:'Preserved source',READY:'Development input',AI_TEST:'Development and tests',GIT_WRITEBACK:'Saved source in Git',PUBLICATION:'Reviewed publication',REFRESHER:'Visibility refresh',BACKUP:'Complete backup',RESTORE:'Isolated local restore',PROCESS_RESTART:'Firefox restart',COMPLETED:'Complete'};
const CHECK_LABELS={GIT_AUTH:'GitHub access',GIT_MAIN:'GitHub file scan',GIT_CREDENTIAL:'Saved Git credential',BACKUP_RUNTIME:'Backup service',BACKUP_ARCHIVE:'Backup archive integrity',RESTORE_LOCAL_DATA:'Local data restore',ACCOUNT_STORE:'Account records',INVENTORY_STORE:'Generator inventory',REFRESHER_POLICY:'Refresher settings',STANDING_GRANTS:'Automation permissions'};
const OUTCOME_LABELS={PASS:'Passed',FAIL:'Failed',HELD:'Needs attention',NOT_TESTED:'Not verified',UNCERTAIN:'Checking an uncertain result',RUNNING:'Running'};
const records=createOperatorRecords();
const history=by('history'),historyExport=by('history-export'),historyView=by('history-view'),historyStatus=by('history-status');
let savedReports=[];
function selectedReport(){return savedReports.find(r=>r.key===history.value)?.record}
function showSavedReport(){
 const selected=selectedReport();historyExport.disabled=!selected;historyLocate.disabled=!selected?.run;
 const report=selected?.report||selected?.independent&&independentDiagnosticExport(selected.independent);
 historyView.textContent=report?JSON.stringify(report,null,2):'';
 if(selected?.run)historyStatus.textContent='Test generator '+selected.run.slug+' · Last observed visibility: '+(selected.run.remoteVisibility||'not recorded')+'. Resources are preserved until you remove them explicitly.';
}
async function loadReports(){
 historyStatus.textContent='Reading saved reports…';
 try{
  savedReports=(await records.list('ui:diagnostic-report:')).filter(r=>r.record?.run||r.record?.independent).sort((a,b)=>(b.record?.run?.updatedAt||b.record?.independent?.checkedAt||0)-(a.record?.run?.updatedAt||a.record?.independent?.checkedAt||0));
  const chosen=history.value;history.replaceChildren();
  for(const row of savedReports){const option=document.createElement('option');option.value=row.key;
   const stamp=row.record?.run?.updatedAt||row.record?.independent?.checkedAt;
   option.textContent=(row.record?.independent?'Independent checks':'Disposable diagnostic')+' · '+(stamp?new Date(stamp).toLocaleString():'Imported history')+(row.record?.run?.status?' · '+row.record.run.status:'');history.append(option)}
  if(savedReports.some(r=>r.key===chosen))history.value=chosen;
  historyStatus.textContent=savedReports.length+' saved report(s).';showSavedReport();
 }catch{historyStatus.textContent='Saved reports could not be read. Retry Reload reports.'}
}
historyLocate.addEventListener('click',()=>locateRun(selectedReport()?.run));
history.addEventListener('change',showSavedReport);by('history-refresh').addEventListener('click',()=>void loadReports());
historyExport.addEventListener('click',()=>{
 const selected=selectedReport();if(!selected)return;
 const report=selected.report||selected.independent&&independentDiagnosticExport(selected.independent);
 if(report)downloadOperatorFile('pcms-saved-diagnostic.json',JSON.stringify(report,null,2)+'\n','application/json');
});
void loadReports();
const SCOPE_HELP={
 TEST_ACCOUNT_SELECTION_INVALID:'Select a verified test account from the list.',
 TEST_PERSONA_BINDING_INVALID:'The selected test account has no valid Persona binding. Check Accounts.',
 TEST_GITHUB_CONNECTION_REQUIRED:'GitHub connection is not verified. Use Settings → Connections to reconcile stored access; no extra native helper is required.',
 TEST_NAMESPACE_INVALID:'Use a test name starting with pcms-test-, followed by lowercase letters, numbers or hyphens.',
 TEST_ACCOUNT_LIST_UNAVAILABLE:'Account details are unavailable. Open Accounts and check the selected account.',
 TEST_ACCOUNT_NOT_PROTECTED_VERIFIED:'This account has not passed protected route and ownership verification. Check Accounts.',
 TEST_GIT_SCOPE_CHANGED:'The connected GitHub repository has changed. Review the test scope.',
 TEST_AUTHORITY_SCOPE_CHANGED:'The selected repository is not covered by the current permissions. Review permissions in Settings.',
 ENABLE_SCOPED_DEVELOPMENT_AND_GIT:'Development and Git write permissions are not enabled for this repository. Review Settings permissions.',
 RESTORE_HOLD:'A restore is awaiting review. Finish it before starting live tests.'
};
function scopeIssue(code){return SCOPE_HELP[code]||'The test setup could not be verified. Open Settings → Diagnostics for details.';}

const PORT={accounts:'pcms-i03-accounts',git:'pcms-s03-catalog',
 readiness:'pcms-r3-readiness',inventory:'pcms-i04-inventory',
 auth:'pcms-s06-authority',creation:'pcms-s00-coordinator',
 ai:'pcms-i10-ai',writeback:'pcms-i11-writeback',
 release:'pcms-i13-release',refresher:'pcms-i12-refresher',
 cleanup:'pcms-s08-cleanup',
 backup:'pcms-i15-backup',startup:'pcms-s08-startup'};
const pause=(code)=>{const err=new Error(code);err.code=code;throw err;};
function request(which,type,params={}){
 return new Promise((resolve,reject)=>{
  const port=browser.runtime.connect({name:PORT[which]});
  let complete=false;
  const timer=setTimeout(()=>finish(null,Error('DIAGNOSTIC_PORT_TIMEOUT')),90000);
  function finish(answer,error){
   if(complete)return;complete=true;clearTimeout(timer);
   try{port.disconnect();}catch{}
   error?reject(error):resolve(answer);
  }
  port.onMessage.addListener(answer=>finish(answer));
  port.onDisconnect.addListener(()=>finish(null,Error('DIAGNOSTIC_PORT_DISCONNECTED')));
  try{port.postMessage(which==='backup'?{action:type,...params}:{type,params});}
  catch{finish(null,Error('DIAGNOSTIC_PORT_UNAVAILABLE'));}
 });
}
function controls(){
 const locked=busy||activeDiagnosticDrive;
 save.disabled=locked;start.disabled=locked||!configuration||
   !canStartNewDiagnostic(run);
 resume.disabled=locked||!run||!run.currentHold||run.restoredHistorical===true;
 rerun.disabled=locked||!configuration;exporter.disabled=locked||(!run&&!independent);
 independentButton.disabled=independentBusy;
 cleanup.disabled=locked||!run||run.cleanup==='VERIFIED_REMOTE_AND_GIT_ABSENT';
 locate.disabled=gitFolder.disabled=!run;
 account.disabled=locked;namespace.disabled=locked;
}
function show(){
 if(designationError)scope.textContent=designationError;
 else if(configuration)scope.textContent='Test name '+configuration.namespace+' · '+(account.selectedOptions[0]?.textContent||'Configured test account')+'. The selected account and repository are checked before each stage.';
 else scope.textContent='Choose your dedicated test account and a test name. PCMS will verify the connection and permissions before running anything.';
 status.textContent=run?
  'Test generator '+run.slug+' · '+(OUTCOME_LABELS[run.status]||'Waiting')+' · '+(STAGE_LABELS[run.stage]||'Check details')+
  (run.created?' · Last observed visibility: '+(run.remoteVisibility||'unknown')+'. Test resources are preserved.':'')+
  (run.currentHold?' · '+run.currentHold.code+(
    run.currentHold.code==='INITIAL_INVENTORY_UNKNOWN'?
      ' — In Accounts, synchronize the generator inventory for every non-archived managed account under its verified protected route. Then Resume this same run; do not start a new slug. Independent module checks below remain available.':
    run.currentHold.code==='GIT_WRITE_GRANT_REQUIRED'?
      ' — Grant Git in Settings → Protected workflow activation, then Resume.':
    run.currentHold.code==='ENABLE_GUARDED_REFRESHER_POLICY'?
      ' — Enable guarded marker saves in Refresher settings, then Resume.':
    run.currentHold.code==='EXACT_CANDIDATE_HUMAN_APPROVAL_REQUIRED'?
      ' — Review the test source in Work Queue. The diagnostic continues after exact publication is verified.':
    run.currentHold.code==='REFRESH_NOT_DUE_YET'?
      ' — A visibility refresh is not yet due under the normal Refresher policy. Resume this stage when it becomes due; independent checks remain available.':
    run.currentHold.code==='RESTART_FIREFOX_TO_FINISH'?
      ' — Close Firefox completely, reopen it and return to Diagnostics. This same run will continue.':''):''):
  'No diagnostic run. No external operations attempted.';
 stages.replaceChildren();
 const list=document.createElement('ol');
 for(const name of STAGES){
  const row=document.createElement('li'),e=run?.events?.find(x=>x.stage===name);
  row.textContent=STAGE_LABELS[name]+' — '+(OUTCOME_LABELS[e?.outcome]||'Not tested');
  if(e?.code){const detail=document.createElement('details'),head=document.createElement('summary');head.textContent='Details';const code=document.createElement('code');code.textContent=e.code;detail.append(head,code);row.append(detail)}
  list.append(row);
 }
 stages.append(list);
 independentRows.replaceChildren();
 const checks=document.createElement('ol');
 for(const row of independent?.rows||[]){
  const li=document.createElement('li');
  li.dataset.checkId=row.id;li.dataset.outcome=row.outcome;
  li.textContent=(CHECK_LABELS[row.id]||'Module check')+' — '+(OUTCOME_LABELS[row.outcome]||'Not verified');
  const details=document.createElement('details'),summary=document.createElement('summary'),code=document.createElement('code');summary.textContent='Details';code.textContent=row.code+' · '+row.proof;details.append(summary,code);li.append(details);
  checks.append(li);
 }
 independentRows.append(checks);
 independentStatus.textContent=independentBusy?'Checking each independent module…':
  independent?'Independent checks: '+independent.rows.filter(x=>x.outcome==='PASS').length+
    '/'+independent.rows.length+' responded. These results do not verify live provider actions, protected exits or downloaded files.':
  'No independent checks run. These can run even when generator creation is held.';
 controls();
}
async function persist(){
 run.updatedAt=Date.now();
 const written=await records.put('ui:diagnostic-report:'+run.runId,{schema:1,run:structuredClone(run),report:diagnosticReport(run)},{mirror:'RUN'});
 if(!written?.ok)throw Error(written?.code||'OPERATOR_RECORD_WRITE_UNKNOWN');

 show();refreshMountedViews();
}
async function mark(stage,outcome,code){
 run=addDiagnosticEvent(run,stage,outcome,code,Date.now());
 run.status=outcome==='PASS'?'RUNNING':outcome;
 await persist();
}
async function prerequisite({readOnly=false}={}){
 const [accounts,git,auth]=await Promise.all([
  request('accounts','LIST_ACCOUNTS'),
  request('git','GIT_STATUS'),
  readOnly?Promise.resolve(null):request('auth','GET')]);
 const assessed=evaluateDisposable(run.config,accounts,git,auth,{readOnly});
 if(!assessed.ok)pause(assessed.code);
 return {accounts,git,auth};
}
async function creation(){
 // One immutable intent ID and slug are checkpointed *before* the first send.
 // Lost acknowledgment: first inspect canonical state; never invent a new ID.
 for(let turn=0;turn<12;turn++){
  await prerequisite();
  let got=await request('creation','GET_CREATE_INTENT',{intentId:run.intentId});
  if(got?.ok!==true){
   if(got?.code!=='INTENT_NOT_FOUND')pause(got?.code||'CREATE_RECEIPT_UNAVAILABLE');
   const admitted=await request('creation','ACCEPT_CREATE_INTENT',{
     intentId:run.intentId,slug:run.slug,origin:'OPERATOR',
     accountId:run.config.accountId});
   if(!admitted?.ok){
    // An uncertain local ACK is reconciled by GET, not by a second intent.
    got=await request('creation','GET_CREATE_INTENT',{intentId:run.intentId});
    if(!got?.ok)pause('CREATE_INTAKE_ACK_UNCERTAIN');
   }else{
    got=await request('creation','GET_CREATE_INTENT',{intentId:run.intentId});
   }
  }
  if(!got?.ok||got.record?.slug!==run.slug||
     got.record?.accountId!==run.config.accountId)
    pause('TEST_CREATE_SCOPE_MISMATCH');
  const state=got.record.state;
  if(state==='ASSOCIATED_NOT_READY'){run.created=true;run.remoteVisibility='UNLISTED';run.remoteObservedAt=Date.now();return 'CREATE_AND_GIT_ASSOCIATION_VERIFIED';}
  // Possible external dispatch is reconciled ONLY by the existing production
  // runner, which retains the same canonical operation identity and readback fences.
  if(state==='TARGET_COLLISION_HELD')pause('TEST_SLUG_COLLISION');
  const outcome=await request('creation','RUN_CREATE_STEP',{
   intentId:run.intentId,expectedRevision:got.record.revision});
  if(!outcome?.ok)pause(outcome?.code||'CREATION_STEP_NOT_VERIFIED');
  const verified=await request('creation','GET_CREATE_INTENT',{intentId:run.intentId});
  if(!verified?.ok||verified.record?.slug!==run.slug)
   pause('CREATION_STEP_ACK_UNCERTAIN');
  if(verified.record.state===state)pause('CREATION_NO_VERIFIED_PROGRESS');
 }
 pause('CREATION_REQUIRES_MORE_VERIFIED_TURNS');
}
async function catalog(){
 const observed=await request('git','SCAN_CONNECTED');
 if(!observed?.ok||observed.complete!==true||
    observed.repositoryId!==run.config.repositoryId)
  pause(observed?.code||'TEST_CATALOG_UNVERIFIED');
 const match=observed.generators?.find(x=>x.slug===run.slug);
 if(!match)pause('TEST_GIT_FOLDER_NOT_OBSERVED');
 return match.ready?'TEST_READY_MAIN_SOURCE_PRESENT':
   'TEST_GIT_FOLDER_CONFIRMED_NOT_READY';
}
// Background automation (READY intake, native AI, tests, writeback) is the
// ordinary production progression; the diagnostic waits for it with a
// bounded, resumable poll instead of asking the operator to drive steps.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(label,probe,{minutes=45,every=20000}={}){
 const until=Date.now()+minutes*60000;let last=null;
 while(Date.now()<until){
  await prerequisite();
  last=await probe();
  if(last?.done)return last.value;
  const explanation=last?.code==='EXACT_CANDIDATE_HUMAN_APPROVAL_REQUIRED'?'Review the exact test source in Work Queue. This run continues after verified publication.':
    last?.code==='REFRESH_NOT_DUE_YET'?'A visibility refresh is not yet due. Normal Refresher timing is preserved.':
    last?.code==='AWAITING_RECENT_FEED'?'The source save is verified; waiting for its independent recent-feed observation.':'';
  status.textContent='Test generator '+run.slug+' · waiting for '+label+'. '+explanation+' Background work continues if you open another workspace.';
  await sleep(every);
 }
 pause(last?.code||label.toUpperCase().replace(/[^A-Z]/g,'_')+'_TIMEOUT');
}
async function ready(){
 let catalog=await request('git','SCAN_CONNECTED');
 if(!catalog?.ok||catalog.complete!==true||
    catalog.repositoryId!==run.config.repositoryId)
  pause(catalog?.code||'TEST_CATALOG_UNVERIFIED');
 let match=catalog.generators?.find(x=>x.slug===run.slug);
 if(!match)pause('TEST_GIT_FOLDER_NOT_OBSERVED');
 if(!match.ready){
  // Disposable test only: PCMS declares READY for its own test generator
  // through the conditional Git writer (Git grant required, no replay).
  const declared=await request('cleanup','DECLARE_TEST_READY',
    {intentId:run.intentId,runId:run.runId});
  if(!declared?.ok)pause(declared?.code||'TEST_READY_DECLARATION_NOT_VERIFIED');
  catalog=await request('git','SCAN_CONNECTED');
  match=catalog?.generators?.find(x=>x.slug===run.slug);
  if(!match?.ready)pause('TEST_READY_NOT_OBSERVED_ON_MAIN');
 }
 return waitFor('READY intake',async()=>{
  try{return {done:true,value:await readyRecorded()};}
  catch(e){if(['TEST_READY_NOT_DISCOVERED'].includes(e.code))return {done:false,code:e.code};throw e;}
 },{minutes:20,every:15000});
}
async function readyRecorded(){
 let after='';
 for(let page=0;page<80;page++){
  const r=await request('git','LIST_READY',{after,limit:200});
  if(!r?.ok)pause(r?.code||'READY_QUEUE_UNAVAILABLE');
  const row=r.items?.find(x=>x.slug===run.slug);
  if(row){
   if(row.repositoryId!==run.config.repositoryId)
     pause('TEST_READY_REPOSITORY_CHANGED');
   if(!row.active&&!row.desired)
     pause(row.hold||'TEST_READY_NOT_ADMITTED');
   return 'TEST_READY_RECORDED';
  }
  if(!r.more)pause('TEST_READY_NOT_DISCOVERED');
  if(!r.nextCursor||r.nextCursor<=after)pause('READY_QUEUE_PAGINATION_UNVERIFIED');
  after=r.nextCursor;
 }
 pause('READY_QUEUE_PAGE_BUDGET_EXCEEDED');
}
async function ai(){
 return waitFor('native AI development and tests',async()=>{
  const r=await request('ai','GET_JOB',{slug:run.slug});
  if(!r?.ok)return {done:false,code:r?.code||'TEST_AI_JOB_NOT_ADMITTED'};
  if(r.state==='TESTS_VERIFIED')return {done:true,value:'NATIVE_AI_TESTS_VERIFIED'};
  if(r.state==='HELD_RECONCILE')pause('TEST_AI_RECONCILIATION_REQUIRED');
  if(r.state==='HELD_NO_PROGRESS')pause('TEST_AI_HELD_NO_PROGRESS');
  return {done:false,code:r.state};
 },{minutes:60});
}
async function writeback(){
 return waitFor('conditional Git writeback',async()=>{
  const r=await request('writeback','GET',{slug:run.slug});
  if(r?.ok&&r.state==='CONFIRMED')return {done:true,value:'TESTED_SOURCE_GIT_WRITEBACK_VERIFIED'};
  if(r?.ok&&['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(r.state))
   pause('GIT_EFFECT_RECONCILIATION_REQUIRED');
  return {done:false,code:r?.code||r?.state||'TESTED_GIT_WRITEBACK_NOT_YET_CONFIRMED'};
 },{minutes:20});
}
async function publication(){
 return waitFor('your exact test-source approval and publication',async()=>{
  const r=await request('release','GET',{slug:run.slug});
  if(!r?.ok)return {done:false,code:r?.code||'TEST_RELEASE_NOT_READY'};
  if(r.state==='CONFIRMED_PUBLIC'){run.remoteVisibility='PUBLIC';run.remoteObservedAt=Date.now();return {done:true,value:'HUMAN_APPROVED_PUBLICATION_READBACK_VERIFIED'};}
  if(['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN'].includes(r.state)){run.remoteVisibility='UNKNOWN';pause('PUBLICATION_READBACK_REQUIRED');}
  return {done:false,code:'EXACT_CANDIDATE_HUMAN_APPROVAL_REQUIRED'};
 },{minutes:60,every:10000});
}
async function refresher(){
 return waitFor('the normal visibility refresh',async()=>{
  const r=await request('refresher','GET_REFRESHER',{query:run.slug,accountId:run.config.accountId,limit:50,offset:0});
  if(!r?.ok)pause(r?.code||'REFRESHER_STATE_UNAVAILABLE');
  if(r.policy?.refreshEnabled!==true)pause('ENABLE_GUARDED_REFRESHER_POLICY');
  if(r.items?.filter(x=>x.slug===run.slug&&x.accountId===run.config.accountId)?.length!==1)pause('DESIGNATED_TEST_NOT_IN_REFRESHER');
  const result=await request('refresher','DIAGNOSTIC_TARGET_REFRESH',{slug:run.slug,accountId:run.config.accountId,runId:run.runId});
  if(!result?.ok)pause(result?.code||'TEST_REFRESH_UNAVAILABLE');
  if(result.effectVerified===true&&result.sourceVerified===true&&result.feedVerified===true)return {done:true,value:'REFRESHER_MARKER_SOURCE_AND_RECENT_FEED_VERIFIED'};
  return {done:false,code:result.code==='NO_REFRESH_DUE'?'REFRESH_NOT_DUE_YET':result.code||'TEST_REFRESH_NOT_VERIFIED'};
 },{minutes:60,every:20000});
}
// Functional local tests remain independently executable. A normal Firefox
// startup receipt is honest browser observation, never an invented OS PID proof.
async function isolatedBackup(){
 const out=await request('backup','MANUAL');
 if(!out?.ok||out.code!=='BROWSER_REPORTED_COMPLETE')pause(out?.code||'BACKUP_DOWNLOAD_NOT_VERIFIED');
 return 'FIREFOX_DOWNLOAD_COMPLETE_FILE_REOPEN_SEPARATE';
}
async function isolatedRestore(){
 const out=await request('backup','CHECK_RESTORE');
 if(!out?.ok)pause(out?.code||'ISOLATED_DATA_RESTORE_NOT_VERIFIED');
 return out.code;
}
async function isolatedRestart(){
 const observed=await request('startup','STATUS',{runId:run.runId});
 if(observed?.ok&&observed.observed===true)return 'FIREFOX_STARTUP_OBSERVED_OS_PROOF_SEPARATE';
 const armed=await request('startup','ARM',{runId:run.runId});
 if(!armed?.ok)pause(armed?.code||'STARTUP_CHECK_NOT_ARMED');
 pause('RESTART_FIREFOX_TO_FINISH');
}
const ACTION={
 SCOPE:async()=>{await prerequisite();return 'SCOPED_RESOURCES_VERIFIED';},
 CREATE:creation,GIT_SOURCE:catalog,READY:ready,AI_TEST:ai,
 GIT_WRITEBACK:writeback,PUBLICATION:publication,REFRESHER:refresher,
 BACKUP:isolatedBackup,
 RESTORE:isolatedRestore,
 PROCESS_RESTART:isolatedRestart
};
async function drive(){
 if(busy||!run||activeDiagnosticDrive)return;
 busy=true;activeDiagnosticDrive=true;controls();refreshMountedViews();
 try{
  const at=Math.max(0,STAGES.indexOf(run.stage));
  for(let i=at;i<STAGES.length;i++){
   const stage=STAGES[i];run.stage=stage;run.status='RUNNING';await persist();
   try{
    await prerequisite();
    const result=await ACTION[stage]();
    await mark(stage,'PASS',result);
    run.stage=STAGES[i+1]||'COMPLETED';await persist();
   }catch(error){
    await mark(stage,/UNCERTAIN|RECONCILE/.test(error.code||error.message)?
      'UNCERTAIN':'HELD',(error.code||error.message||'DIAGNOSTIC_UNKNOWN').replace(/[^A-Z0-9_]/g,'_').slice(0,110));
    break;
   }
  }
  if(run.stage==='COMPLETED'){
   run.status=run.events.some(event=>event.outcome!=='PASS')?'NOT_TESTED':'PASS';
     run.currentHold=null;await persist();
  }
 }catch(error){
  run.currentHold={stage:run.stage,code:'LOCAL_REPORT_SAVE_UNAVAILABLE'};
  run.firstFailure ||= structuredClone(run.currentHold);run.status='HELD';
 }finally{busy=false;activeDiagnosticDrive=false;show();refreshMountedViews();}

}
// Standalone checks do NOT depend on S08's disposable generator or its
// create/publish chain. Each request settles independently; a failure in one
// module never suppresses observations from the remaining modules.
async function runIndependentChecks(){
 if(independentBusy)return;
 independentBusy=true;show();
 const probes=[['readiness','CHECK',{remote:true}],
  ['accounts','LIST_ACCOUNTS',{}],['inventory','LIST_INVENTORY',{limit:1}],
  ['refresher','GET_REFRESHER',{limit:1}],['auth','GET',{}],['backup','STATUS',{}]];
 try{
  const settled=await Promise.allSettled(probes.map(([which,type,params])=>
    request(which,type,params)));
  const values=settled.map(x=>x.status==='fulfilled'?x.value:
   {ok:false,code:'READ_ONLY_PORT_UNAVAILABLE'});
  const check=async type=>{try{return await request('backup',type)}catch{return {ok:false,code:'BACKUP_PORT_UNAVAILABLE'}}};
  const archive=await check('CHECK_ARCHIVE'),localRestore=await check('CHECK_RESTORE');
  independent=independentReadOnlyResults({
    readiness:values[0],accounts:values[1],inventory:values[2],
    refresher:values[3],authority:values[4],backup:values[5],archive,localRestore},Date.now());
  const written=await records.put('ui:diagnostic-report:independent_'+independent.checkedAt,{schema:1,independent},{mirror:'INDEPENDENT'});
  if(!written?.ok)throw Error(written?.code||'OPERATOR_RECORD_WRITE_UNKNOWN');

 }catch{independentStatus.textContent='Independent results could not be saved. Run the checks again to save a new report.';}
 finally{independentBusy=false;show();}
}
independentButton.addEventListener('click',()=>void runIndependentChecks());
async function populateAccounts(){
 const response=await request('accounts','LIST_ACCOUNTS');
 account.replaceChildren();
 if(!response?.ok){scope.textContent='Account list unavailable. Check Accounts.';return;}
 for(const a of response.accounts||[]){
  if(a.state!=='VERIFIED'||a.identity!=='VERIFIED'||
     a.protectedRoute!=='PCMS_PINNED')continue;
  const option=document.createElement('option');
  option.value=a.accountId;
  option.textContent=a.alias||a.accountId;
  account.append(option);
 }
 if(configuration)account.value=configuration.accountId;
}
save.addEventListener('click',async()=>{
 if(busy||activeDiagnosticDrive)return;busy=true;controls();
 try{
  const selected=account.value;
  const current=await request('accounts','LIST_ACCOUNTS');
  const item=current?.accounts?.find(a=>a.accountId===selected);
  const git=await request('git','GIT_STATUS');
  const auth=await request('auth','GET');
  const test={accountId:selected,personaUid:item?.personaUid,
   repositoryId:git?.repositoryId,namespace:namespace.value.trim()};
  if(consent.checked!==true)throw Error('DISPOSABLE_SCOPE_CONSENT_REQUIRED');
  const valid=evaluateDisposable(test,current,git,auth);
  if(!valid.ok)throw Error(valid.code);
  // Once a test has begun, the account, Persona, repo and namespace are
  // immutable. Installed-version observation is recorded automatically.
  if(run?.restoredHistorical){
    const written=await records.put('ui:diagnostic-report:'+run.runId,{schema:1,run:structuredClone(run),report:diagnosticReport(run)},{mirror:'ARCHIVE_RUN'});
 if(!written?.ok)throw Error(written?.code||'OPERATOR_RECORD_WRITE_UNKNOWN');
    run=null;
  }
  if(run){
    for(const key of ['accountId','personaUid','repositoryId','namespace'])
      if(run.config[key]!==test[key])throw Error('RUN_SCOPE_IMMUTABLE');
    await persist();
  }
  configuration=test;
  designationError=null;
  const saved=await records.put('ui:diagnostic-report:configuration',{schema:1,configuration:test},{mirror:'CONFIG'});
  if(!saved?.ok)throw Error(saved?.code||'OPERATOR_RECORD_WRITE_UNKNOWN');
  scope.textContent='Disposable scope saved. No remote write attempted.';
 }catch(e){designationError='Test setup not saved. '+scopeIssue(e.message);}
 finally{busy=false;show();}
});
function nextRun(){
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 const created=createDiagnosticRun(configuration,hex,Date.now());
 if(!created.ok)throw Error(created.code);
 return {...created.run,build:{version:browser.runtime.getManifest().version,extensionId:browser.runtime.id,proof:'RUNTIME_MANIFEST_ONLY'}};
}
start.addEventListener('click',async()=>{
 if(busy||activeDiagnosticDrive||!configuration||!canStartNewDiagnostic(run))return;
 if(!run){run=nextRun();await persist();}
 void drive();
});
resume.addEventListener('click',()=>{if(!busy&&!activeDiagnosticDrive&&run?.currentHold&&run.restoredHistorical!==true)void drive();});
rerun.addEventListener('click',async()=>{
 if(busy||activeDiagnosticDrive||!configuration)return;
 if(run&&!confirm('Start a new test slug? Existing remote test artifacts are preserved; export the previous report first if needed.'))return;
 run=nextRun();await persist();void drive();
});
cleanup.addEventListener('click',async()=>{
 if(busy||activeDiagnosticDrive||!run)return;
 if(!confirm('This only verifies absence. First manually remove the exact test slug from Perchance and Git main. No other resources are touched. Continue?'))return;
 busy=true;controls();
 try{
  const config=run.config;
  const scopeNow=await prerequisite({readOnly:true});
  const remote=await request('cleanup','VERIFY_TEST_REMOTE_ABSENCE',{
    intentId:run.intentId,runId:run.runId});
  if(remote?.ok!==true||remote.code!=='TEST_REMOTE_ABSENCE_INDEPENDENTLY_VERIFIED'||
     remote.slug!==run.slug||remote.accountId!==config.accountId)
    throw Error(remote?.code||'TEST_REMOTE_CLEANUP_NOT_VERIFIED');
  const latest=await request('git','SCAN_CONNECTED');
  if(!latest?.ok||latest.complete!==true||latest.repositoryId!==config.repositoryId)
    throw Error(latest?.code||'TEST_GIT_SCAN_NOT_VERIFIED');
  if(latest.generators?.some(item=>item.slug===run.slug))
    throw Error('TEST_GIT_FOLDER_STILL_PRESENT');
  const second=await request('cleanup','VERIFY_TEST_REMOTE_ABSENCE',{
    intentId:run.intentId,runId:run.runId});
  if(second?.ok!==true||second.slug!==run.slug)
    throw Error('TEST_REMOTE_RECHECK_NOT_VERIFIED');
  run.cleanup='VERIFIED_REMOTE_AND_GIT_ABSENT';run.remoteVisibility='MISSING_VERIFIED';run.remoteObservedAt=Date.now();
  await persist();
  status.textContent='Test-only cleanup independently verified. No deletion was performed by the diagnostic.';
 }catch(error){
   run.cleanup='NOT_VERIFIED';
   await persist();
   status.textContent='Cleanup remains unverified: '+String(error?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,90);
 }finally{busy=false;controls();}
});
exporter.addEventListener('click',()=>{
 if(!run&&!independent)return;
 const report=independent?independentDiagnosticExport(independent,run):diagnosticReport(run);
 const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='pcms-s08-sanitized-diagnostic.json';
 a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
});
// Detached views cannot own effects, but they may observe canonical progress.
// No observer ever persists, retries or infers a remote effect.
async function refreshFromCanonical(){
 if(!scope.isConnected){mountedViews.delete(refreshFromCanonical);return;}
 if(busy)return;
 try{
  const saved=await browser.storage.local.get(DIAGNOSTIC_RUN);
  const latest=saved[DIAGNOSTIC_RUN];
  if(latest?.version===1){run=latest;show();}
 }catch{/* leave current evidence displayed as unverified */}
}
mountedViews.add(refreshFromCanonical);
(async()=>{
 try{
  const saved=await browser.storage.local.get([DIAGNOSTIC_CONFIG,DIAGNOSTIC_RUN,DIAGNOSTIC_INDEPENDENT]);
  if(saved[DIAGNOSTIC_INDEPENDENT]?.schema===1&&
     saved[DIAGNOSTIC_INDEPENDENT]?.mode==='INDEPENDENT_READ_ONLY')
    independent=saved[DIAGNOSTIC_INDEPENDENT];
  if(validateDisposable(saved[DIAGNOSTIC_CONFIG]).ok)
   configuration=saved[DIAGNOSTIC_CONFIG];
  run=saved[DIAGNOSTIC_RUN]?.version===1?
    recoverDiagnosticIfInactive(saved[DIAGNOSTIC_RUN],activeDiagnosticDrive):null;
  if(run&&run!==saved[DIAGNOSTIC_RUN])await persist();
  
  if(configuration)namespace.value=configuration.namespace;
  await populateAccounts();
  show();
  if(run?.stage==='PROCESS_RESTART'&&run.currentHold?.code==='RESTART_FIREFOX_TO_FINISH'&&run.restoredHistorical!==true){
   const receipt=await request('startup','STATUS',{runId:run.runId});
   if(receipt?.observed===true)void drive();
  }
 }catch{scope.textContent='Diagnostic storage or account provider unavailable. No test started.';}
})();

}
// The PRIMARY Settings panel owns diagnostics and calls mountDiagnosticController
// explicitly. Do not auto-mount against the hidden legacy dashboard: it has a
// different DOM contract and its missing controls can abort primary UI import.
// The accepted single primary controller must be the only active S08 driver.
