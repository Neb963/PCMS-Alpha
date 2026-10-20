// S08 operator-initiated, resumable live diagnostic. Uses ordinary production
// ports and canonical production receipts. Never invents a provider success.
import {DIAGNOSTIC_CONFIG,DIAGNOSTIC_RUN,STAGES,
  validateDisposable,evaluateDisposable,createDiagnosticRun,
  addDiagnosticEvent,diagnosticReport} from './s08-diagnostic-core.mjs';
const by=id=>document.getElementById('pcms-diagnostic-'+id);
const account=by('account'),namespace=by('namespace'),save=by('designate'),
 start=by('run'),resume=by('resume'),rerun=by('rerun'),exporter=by('export'),
 status=by('status'),stages=by('stages'),scope=by('scope');
let busy=false,configuration=null,run=null;
const PORT={accounts:'pcms-i03-accounts',git:'pcms-s03-catalog',
 auth:'pcms-s06-authority',creation:'pcms-s00-coordinator',
 ai:'pcms-i10-ai',writeback:'pcms-i11-writeback',
 release:'pcms-i13-release',refresher:'pcms-i12-refresher',
 backup:'pcms-i15-backup'};
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
 save.disabled=busy;start.disabled=busy||!configuration;
 resume.disabled=busy||!run||!run.firstFailure;
 rerun.disabled=busy||!configuration;exporter.disabled=busy||!run;
 account.disabled=busy;namespace.disabled=busy;
}
function show(){
 if(configuration)scope.textContent='Test namespace '+configuration.namespace+
  ' · Selected account '+configuration.accountId+
  ' · Repo ID '+configuration.repositoryId+'. Other resources cannot be substituted.';
 else scope.textContent='Designate one disposable, verified PCMS account and test namespace.';
 status.textContent=run?
  'Test generator '+run.slug+' · '+run.status+' · next '+run.stage+
  (run.firstFailure?' · '+run.firstFailure.code:''):
  'No diagnostic run. No external operations attempted.';
 stages.replaceChildren();
 const list=document.createElement('ol');
 for(const name of STAGES){
  const row=document.createElement('li'),e=run?.events?.find(x=>x.stage===name);
  row.textContent=name+' — '+(e?.outcome||'NOT_TESTED')+
    (e?.code?' · '+e.code:'');
  list.append(row);
 }
 stages.append(list);
 controls();
}
async function persist(){
 run.updatedAt=Date.now();
 await browser.storage.local.set({[DIAGNOSTIC_RUN]:run});
 show();
}
async function mark(stage,outcome,code){
 run=addDiagnosticEvent(run,stage,outcome,code,Date.now());
 run.status=outcome==='PASS'?'RUNNING':outcome;
 if(outcome==='PASS')run.firstFailure=null;
 await persist();
}
async function prerequisite(){
 const [accounts,git,auth]=await Promise.all([
  request('accounts','LIST_ACCOUNTS'),
  request('git','GIT_STATUS'),
  request('auth','GET')]);
 const assessed=evaluateDisposable(run.config,accounts,git,auth);
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
  if(state==='ASSOCIATED_NOT_READY')return 'CREATE_AND_GIT_ASSOCIATION_VERIFIED';
  // A possible dispatch must be reconciled by its production effect journal
  // before any operator-driven reentry; never spam CREATE/RENAME.
  if(['CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN','CREATE_OBSERVING',
       'RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN','RENAME_OBSERVING',
       'GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN','GIT_OBSERVING'].includes(state))
    pause('CREATION_EFFECT_RECONCILE_REQUIRED');
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
 if(!match.ready)pause('TEST_READY_SOURCE_DECLARATION_REQUIRED');
 return 'TEST_READY_MAIN_SOURCE_PRESENT';
}
async function ready(){
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
 const r=await request('ai','GET_JOB',{slug:run.slug});
 if(!r?.ok)pause(r?.code||'TEST_AI_JOB_NOT_ADMITTED');
 if(r.state==='TESTS_VERIFIED')return 'NATIVE_AI_TESTS_VERIFIED';
 if(r.state==='KNOWN_FAILURE'||r.state==='HELD_RECONCILE')
   pause('TEST_AI_RECONCILIATION_REQUIRED');
 pause('TEST_AI_NOT_YET_VERIFIED');
}
async function writeback(){
 const r=await request('writeback','GET',{slug:run.slug});
 if(!r?.ok)pause(r?.code||'TEST_WRITEBACK_UNAVAILABLE');
 if(r.state==='CONFIRMED')return 'TESTED_SOURCE_GIT_WRITEBACK_VERIFIED';
 if(['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(r.state))
   pause('GIT_EFFECT_RECONCILIATION_REQUIRED');
 pause('TESTED_GIT_WRITEBACK_NOT_YET_CONFIRMED');
}
async function publication(){
 const r=await request('release','GET',{slug:run.slug});
 if(!r?.ok)pause(r?.code||'TEST_RELEASE_NOT_READY');
 if(r.state==='CONFIRMED_PUBLIC')
   return 'HUMAN_APPROVED_PUBLICATION_READBACK_VERIFIED';
 if(['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN'].includes(r.state))
   pause('PUBLICATION_READBACK_REQUIRED');
 // The diagnostic does not ever create or forge an exact-source approval.
 pause('EXACT_CANDIDATE_HUMAN_APPROVAL_REQUIRED');
}
async function refresher(){
 const r=await request('refresher','GET_REFRESHER',{
  query:run.slug,accountId:run.config.accountId,limit:50,offset:0});
 if(!r?.ok)pause(r?.code||'REFRESHER_STATE_UNAVAILABLE');
 // Global OBSERVE_NOW can refresh unrelated accounts/generators. This port
 // intentionally has no test-only target selector; cannot fake scoped proof.
 pause('TEST_ONLY_REFRESHER_WRITER_NOT_AVAILABLE');
}
const ACTION={
 SCOPE:async()=>{await prerequisite();return 'SCOPED_RESOURCES_VERIFIED';},
 CREATE:creation,GIT_SOURCE:catalog,READY:ready,AI_TEST:ai,
 GIT_WRITEBACK:writeback,PUBLICATION:publication,REFRESHER:refresher,
 BACKUP:async()=>{const r=await request('backup','STATUS');
   if(!r?.ok)pause(r?.code||'BACKUP_STATUS_UNAVAILABLE');
   pause('TEST_ONLY_BACKUP_RESTORE_ISOLATION_REQUIRED');},
 RESTORE:async()=>pause('ISOLATED_RESTORE_PROFILE_REQUIRED'),
 PROCESS_RESTART:async()=>pause('ISOLATED_RESTART_SUPERVISOR_REQUIRED')
};
async function drive(){
 if(busy||!run)return;busy=true;controls();
 try{
  const at=Math.max(0,STAGES.indexOf(run.stage));
  for(let i=at;i<STAGES.length;i++){
   const stage=STAGES[i];run.stage=stage;run.status='RUNNING';await persist();
   try{
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
   run.status='PASS';run.firstFailure=null;await persist();
  }
 }finally{busy=false;show();}
}
async function populateAccounts(){
 const response=await request('accounts','LIST_ACCOUNTS');
 account.replaceChildren();
 if(!response?.ok){scope.textContent='Account list unavailable. Check Accounts.';return;}
 for(const a of response.accounts||[]){
  if(a.state!=='VERIFIED'||a.identity!=='VERIFIED'||
     a.protectedRoute!=='PCMS_PINNED')continue;
  const option=document.createElement('option');
  option.value=a.accountId;
  option.textContent=a.accountId+' · '+a.personaUid;
  account.append(option);
 }
 if(configuration)account.value=configuration.accountId;
}
save.addEventListener('click',async()=>{
 if(busy)return;busy=true;controls();
 try{
  const selected=account.value;
  const current=await request('accounts','LIST_ACCOUNTS');
  const item=current?.accounts?.find(a=>a.accountId===selected);
  const git=await request('git','GIT_STATUS');
  const auth=await request('auth','GET');
  const test={accountId:selected,personaUid:item?.personaUid,
   repositoryId:git?.repositoryId,namespace:namespace.value.trim()};
  const valid=evaluateDisposable(test,current,git,auth);
  if(!valid.ok)throw Error(valid.code);
  configuration=test;
  await browser.storage.local.set({[DIAGNOSTIC_CONFIG]:test});
  scope.textContent='Disposable scope saved. No remote write attempted.';
 }catch(e){scope.textContent='Designation not saved: '+e.message;}
 finally{busy=false;show();}
});
function nextRun(){
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 const created=createDiagnosticRun(configuration,hex,Date.now());
 if(!created.ok)throw Error(created.code);
 return created.run;
}
start.addEventListener('click',async()=>{
 if(busy||!configuration)return;
 if(run&&run.firstFailure){status.textContent='Use Resume for the existing test or Full rerun for a new test slug.';return;}
 if(!run){run=nextRun();await persist();}
 void drive();
});
resume.addEventListener('click',()=>{if(!busy&&run)void drive();});
rerun.addEventListener('click',async()=>{
 if(busy||!configuration)return;
 if(run&&!confirm('Start a new test slug? Existing remote test artifacts are preserved; export the previous report first if needed.'))return;
 run=nextRun();await persist();void drive();
});
exporter.addEventListener('click',()=>{
 if(!run)return;
 const blob=new Blob([JSON.stringify(diagnosticReport(run),null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='pcms-s08-sanitized-diagnostic.json';
 a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
});
(async()=>{
 try{
  const saved=await browser.storage.local.get([DIAGNOSTIC_CONFIG,DIAGNOSTIC_RUN]);
  if(validateDisposable(saved[DIAGNOSTIC_CONFIG]).ok)
   configuration=saved[DIAGNOSTIC_CONFIG];
  run=saved[DIAGNOSTIC_RUN]?.version===1?saved[DIAGNOSTIC_RUN]:null;
  if(configuration)namespace.value=configuration.namespace;
  await populateAccounts();
  show();
 }catch{scope.textContent='Diagnostic storage or account provider unavailable. No test started.';}
})();
