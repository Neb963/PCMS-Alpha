// S08 operator-initiated, resumable live diagnostic. Uses ordinary production
// ports and canonical production receipts. Never invents a provider success.
import {DIAGNOSTIC_CONFIG,DIAGNOSTIC_RUN,STAGES,
  validateDisposable,evaluateDisposable,createDiagnosticRun,
  addDiagnosticEvent,diagnosticReport,recoverInterruptedDiagnostic} from './s08-diagnostic-core.mjs';
const by=id=>document.getElementById('pcms-diagnostic-'+id);
const consent=by('consent'),xpiSha=by('xpi-sha');
const account=by('account'),namespace=by('namespace'),save=by('designate'),
 start=by('run'),resume=by('resume'),rerun=by('rerun'),exporter=by('export'),
 status=by('status'),stages=by('stages'),scope=by('scope'),cleanup=by('cleanup');
let busy=false,configuration=null,run=null,designationError=null;
const PORT={accounts:'pcms-i03-accounts',git:'pcms-s03-catalog',
 auth:'pcms-s06-authority',creation:'pcms-s00-coordinator',
 ai:'pcms-i10-ai',writeback:'pcms-i11-writeback',
 release:'pcms-i13-release',refresher:'pcms-i12-refresher',
 cleanup:'pcms-s08-cleanup',
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
 save.disabled=busy;start.disabled=busy||!configuration||
   (run!==null&&run.status!=='NOT_TESTED');
 resume.disabled=busy||!run||!run.firstFailure;
 rerun.disabled=busy||!configuration;exporter.disabled=busy||!run;
 cleanup.disabled=busy||!run||run.cleanup==='VERIFIED_REMOTE_AND_GIT_ABSENT';
 account.disabled=busy;namespace.disabled=busy;xpiSha.disabled=busy;
}
function show(){
 if(designationError)scope.textContent=designationError;
 else if(configuration)scope.textContent='Test namespace '+configuration.namespace+
  ' · Selected account '+configuration.accountId+
  ' · Repo ID '+configuration.repositoryId+'. Other resources cannot be substituted.';
 else scope.textContent='Designate one disposable, verified PCMS account and test namespace.';
 status.textContent=run?
  'Test generator '+run.slug+' · '+run.status+' · next '+run.stage+
  (run.firstFailure?' · '+run.firstFailure.code+(
    run.firstFailure.code==='GIT_WRITE_GRANT_REQUIRED'?
      ' — Grant Git in Settings → Protected workflow activation, then Resume.':
    run.firstFailure.code==='ENABLE_GUARDED_REFRESHER_POLICY'?
      ' — Enable guarded marker saves in Refresher settings, then Resume.':
    run.firstFailure.code==='EXACT_CANDIDATE_HUMAN_APPROVAL_REQUIRED'?
      ' — Approve exact source in Publication, then Resume.':''):''):
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
  last=await probe();
  if(last?.done)return last.value;
  status.textContent='Test generator '+run.slug+' · waiting for '+label+
   (last?.code?' ('+last.code+')':'')+' · background automation continues if this page closes.';
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
 if(r.policy?.refreshEnabled!==true)pause('ENABLE_GUARDED_REFRESHER_POLICY');
 if(r.items?.filter(x=>x.slug===run.slug&&
      x.accountId===run.config.accountId)?.length!==1)
   pause('DESIGNATED_TEST_NOT_IN_REFRESHER');
 const result=await request('refresher','DIAGNOSTIC_TARGET_REFRESH',{
   slug:run.slug,accountId:run.config.accountId,runId:run.runId});
 if(!result?.ok)pause(result?.code||'TEST_REFRESH_UNAVAILABLE');
 if(result.effectVerified!==true)
   pause(result.code||'TEST_REFRESH_NOT_VERIFIED');
 return 'REFRESHER_MARKER_SOURCE_READBACK_VERIFIED';
}
async function isolatedRestart(){
 const sha=run.config.xpiSha256;
 if(!/^[a-f0-9]{64}$/.test(sha||''))pause('XPI_SHA256_REQUIRED');
 const response=await new Promise(resolve=>{
  let port,done=false;
  try{port=browser.runtime.connectNative('local.pcms.diagnostic_browser');}
  catch{return resolve({ok:false,code:'ISOLATED_HOST_NOT_INSTALLED'});}
  const timeout=setTimeout(()=>finish({ok:false,code:'ISOLATED_RESTART_TIMEOUT'}),930000);
  function finish(value){
   if(done)return;done=true;clearTimeout(timeout);
   try{port.disconnect();}catch{}
   resolve(value);
  }
  port.onMessage.addListener(finish);
  port.onDisconnect.addListener(()=>finish({ok:false,code:'ISOLATED_HOST_DISCONNECTED'}));
  try{port.postMessage({action:'RUN_ISOLATED_BROWSER',expectedSha256:sha});}
  catch{finish({ok:false,code:'ISOLATED_HOST_WRITE_FAILED'});}
 });
 if(!response?.ok||response.code!=='ISOLATED_CANDIDATE_FIREFOX_RESTART_VERIFIED'||
    response.xpiSha256!==sha||response.firefoxRestart!=='OS_OBSERVED'||
    response.persistentXpi!=='VERIFIED_IN_TEST_PROFILE')
   pause(response?.code||'ISOLATED_RESTART_NOT_VERIFIED');
 return 'ISOLATED_CANDIDATE_FIREFOX_RESTART_VERIFIED';
}
async function isolatedBackup(){
 const sha=run.config.xpiSha256;
 if(!/^[a-f0-9]{64}$/.test(sha||''))pause('XPI_SHA256_REQUIRED');
 const reply=await new Promise(resolve=>{
   let port,done=false;
   try{port=browser.runtime.connectNative('local.pcms.diagnostic_browser');}
   catch{return resolve({ok:false,code:'ISOLATED_HOST_NOT_INSTALLED'});}
   const timeout=setTimeout(()=>finish({ok:false,code:'ISOLATED_BACKUP_TIMEOUT'}),1260000);
   function finish(value){
     if(done)return;done=true;clearTimeout(timeout);
     try{port.disconnect();}catch{}
     resolve(value);
   }
   port.onMessage.addListener(finish);
   port.onDisconnect.addListener(()=>finish({ok:false,code:'ISOLATED_HOST_DISCONNECTED'}));
   try{port.postMessage({action:'RUN_ISOLATED_BACKUP_RESTORE',expectedSha256:sha});}
   catch{finish({ok:false,code:'ISOLATED_HOST_WRITE_FAILED'});}
 });
 if(!reply?.ok||reply.code!=='ISOLATED_PRODUCTION_BACKUP_RESTORE_VERIFIED'||
    reply.xpiSha256!==sha||reply.nativeArchive!=='REOPENED_AUTHENTICATED'||
    reply.restore!=='FRESH_PROFILE_INACTIVE_VERIFIED'||reply.testOnly!==true)
   pause(reply?.code||'ISOLATED_BACKUP_RESTORE_NOT_VERIFIED');
 run.isolatedRecoveryProof={version:1,xpiSha256:sha,
   archive:'REOPENED_AUTHENTICATED',restore:'FRESH_PROFILE_INACTIVE_VERIFIED'};
 await persist();
 return 'ISOLATED_PRODUCTION_BACKUP_ARCHIVE_VERIFIED';
}
async function isolatedRestore(){
 const receipt=run.isolatedRecoveryProof;
 if(receipt?.version!==1||receipt.xpiSha256!==run.config.xpiSha256||
    receipt.archive!=='REOPENED_AUTHENTICATED'||
    receipt.restore!=='FRESH_PROFILE_INACTIVE_VERIFIED')
   pause('ISOLATED_RESTORE_READBACK_REQUIRED');
 return 'ISOLATED_FRESH_PROFILE_DONOR_AND_CANONICAL_RESTORE_VERIFIED';
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
   repositoryId:git?.repositoryId,namespace:namespace.value.trim(),
    xpiSha256:xpiSha.value.trim().toLowerCase()};
  if(consent.checked!==true)throw Error('DISPOSABLE_SCOPE_CONSENT_REQUIRED');
  if(test.xpiSha256&& !/^[a-f0-9]{64}$/.test(test.xpiSha256))throw Error('XPI_SHA256_INVALID');
  const valid=evaluateDisposable(test,current,git,auth);
  if(!valid.ok)throw Error(valid.code);
  // Once a test has begun, the account, Persona, repo and namespace are
  // immutable. The local XPI hash may be provided later for restart tests.
  if(run){
    for(const key of ['accountId','personaUid','repositoryId','namespace'])
      if(run.config[key]!==test[key])throw Error('RUN_SCOPE_IMMUTABLE');
    run.config.xpiSha256=test.xpiSha256;
    await persist();
  }
  configuration=test;
  designationError=null;
  await browser.storage.local.set({[DIAGNOSTIC_CONFIG]:test});
  scope.textContent='Disposable scope saved. No remote write attempted.';
 }catch(e){designationError='Designation not saved: '+e.message;}
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
 if(busy||!configuration||run&&run.status!=='NOT_TESTED')return;
 if(!run){run=nextRun();await persist();}
 void drive();
});
resume.addEventListener('click',()=>{if(!busy&&run?.firstFailure)void drive();});
rerun.addEventListener('click',async()=>{
 if(busy||!configuration)return;
 if(run&&!confirm('Start a new test slug? Existing remote test artifacts are preserved; export the previous report first if needed.'))return;
 run=nextRun();await persist();void drive();
});
cleanup.addEventListener('click',async()=>{
 if(busy||!run)return;
 if(!confirm('This only verifies absence. First manually remove the exact test slug from Perchance and Git main. No other resources are touched. Continue?'))return;
 busy=true;controls();
 try{
  const config=run.config;
  const scopeNow=await prerequisite();
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
  run.cleanup='VERIFIED_REMOTE_AND_GIT_ABSENT';
  await persist();
  status.textContent='Test-only cleanup independently verified. No deletion was performed by the diagnostic.';
 }catch(error){
   run.cleanup='NOT_VERIFIED';
   await persist();
   status.textContent='Cleanup remains unverified: '+String(error?.message||'UNKNOWN').replace(/[^A-Za-z0-9_]/g,'_').slice(0,90);
 }finally{busy=false;controls();}
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
  run=saved[DIAGNOSTIC_RUN]?.version===1?
    recoverInterruptedDiagnostic(saved[DIAGNOSTIC_RUN]):null;
  if(run&&run!==saved[DIAGNOSTIC_RUN])
    await browser.storage.local.set({[DIAGNOSTIC_RUN]:run});
  if(configuration){namespace.value=configuration.namespace;
    xpiSha.value=configuration.xpiSha256||'';}
  await populateAccounts();
  show();
 }catch{scope.textContent='Diagnostic storage or account provider unavailable. No test started.';}
})();
