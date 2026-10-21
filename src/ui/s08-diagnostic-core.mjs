// S08 diagnostic identity and evidence model. No provider capability in this module.
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const NS=/^pcms-test-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const RID=/^[1-9][0-9]{0,19}$/;
const HEX=/^[a-f0-9]{12,32}$/;
export const DIAGNOSTIC_CONFIG='pcmsS08DisposableScope';
export const DIAGNOSTIC_RUN='pcmsS08DiagnosticRun';
export const STAGES=Object.freeze(['SCOPE','CREATE','GIT_SOURCE','READY','AI_TEST',
  'GIT_WRITEBACK','PUBLICATION','REFRESHER','BACKUP','RESTORE','PROCESS_RESTART']);
export function validateDisposable(config){
 if(!config||!ID.test(config.accountId||''))return {ok:false,code:'TEST_ACCOUNT_SELECTION_INVALID'};
 if(!ID.test(config.personaUid||''))return {ok:false,code:'TEST_PERSONA_BINDING_INVALID'};
 if(!RID.test(config.repositoryId||''))return {ok:false,code:'TEST_GITHUB_CONNECTION_REQUIRED'};
 if(!NS.test(config.namespace||''))return {ok:false,code:'TEST_NAMESPACE_INVALID'};
 return {ok:true};
}
export function evaluateDisposable(config,accounts,git,authority){
 const checked=validateDisposable(config);if(!checked.ok)return checked;
 if(!accounts?.ok||!Array.isArray(accounts.accounts))
   return {ok:false,code:'TEST_ACCOUNT_LIST_UNAVAILABLE'};
 const item=accounts.accounts.find(a=>a.accountId===config.accountId);
 if(!item||item.personaUid!==config.personaUid||
   item.state!=='VERIFIED'||item.identity!=='VERIFIED'||
   item.protectedRoute!=='PCMS_PINNED')
   return {ok:false,code:'TEST_ACCOUNT_NOT_PROTECTED_VERIFIED'};
 if(accounts.held)return {ok:false,code:'RESTORE_HOLD'};
 if(!git?.ok||git.repositoryId!==config.repositoryId)
   return {ok:false,code:'TEST_GIT_SCOPE_CHANGED'};
 if(!authority?.ok||authority.record?.repositoryId!==config.repositoryId)
   return {ok:false,code:'TEST_AUTHORITY_SCOPE_CHANGED'};
 if(authority.record.grants?.development!==true||
   authority.record.grants?.gitWrite!==true)
   return {ok:false,code:'ENABLE_SCOPED_DEVELOPMENT_AND_GIT'};
 return {ok:true,accountRevision:item.revision};
}
export function createDiagnosticRun(config,hex,now){
 if(!validateDisposable(config).ok||!HEX.test(hex||'')||
    !Number.isSafeInteger(now)||now<1)
   return {ok:false,code:'TEST_RUN_INVALID'};
 const slug=config.namespace+'-'+hex.slice(0,12);
 if(slug.length>100)return {ok:false,code:'TEST_SLUG_INVALID'};
 return {ok:true,run:{
   version:1,runId:'s08_'+hex,slug,intentId:'intent_s08_'+hex,
   config:{...config},stage:'SCOPE',status:'NOT_TESTED',
   firstFailure:null,events:[],startedAt:now,updatedAt:now,
   created:false,remoteArtifactsPreserved:true,
   cleanup:'NOT_ATTEMPTED'}};
}
export function addDiagnosticEvent(run,stage,outcome,code,now){
 if(!STAGES.includes(stage)||!['PASS','NOT_TESTED','HELD','UNCERTAIN'].includes(outcome)||
   typeof code!=='string'||!/^[A-Z0-9_]{1,110}$/.test(code)||
   !Number.isSafeInteger(now)||now<run.startedAt)throw Error('DIAGNOSTIC_EVENT_INVALID');
 const events=run.events.filter(e=>e.stage!==stage).concat([{stage,outcome,code,at:now}]);
 return {...run,events,updatedAt:now,
   ...(outcome==='PASS'?{}:{firstFailure:{stage,code}})};
}
export function diagnosticReport(run){
 if(!run||run.version!==1)return {ok:false,code:'REPORT_UNAVAILABLE'};
 return {format:'PCMS_S08_SANITIZED',version:1,runId:run.runId,
  startedAt:run.startedAt,updatedAt:run.updatedAt,
  stage:run.stage,status:run.status,
  firstFailure:run.firstFailure,
  stages:STAGES.map(stage=>run.events.find(e=>e.stage===stage)||
    {stage,outcome:'NOT_TESTED',code:'NOT_REACHED'}),
  scope:{account:'DESIGNATED_TEST_ACCOUNT',persona:'DESIGNATED_TEST_PERSONA',
   repository:'DESIGNATED_PRIVATE_GIT',namespace:'REDACTED',slug:'REDACTED'},
  remoteArtifactsPreserved:run.remoteArtifactsPreserved===true,
  cleanup:run.cleanup||'NOT_ATTEMPTED',
  livePerchance:run.events.some(e=>e.stage==='CREATE'&&e.outcome==='PASS')?
    'CREATE_VERIFIED_OTHER_OPERATIONS_INDEPENDENT':'NOT_TESTED'};
}

// Browser shutdown while a stage was executing is not a PASS or permission to
// silently rerun a possibly dispatched provider effect. Preserve run identity.
export function recoverInterruptedDiagnostic(run){
 if(run?.version!==1||run.status!=='RUNNING')return run;
 if(run.stage==='COMPLETED'&&STAGES.every(stage=>run.events?.some(e=>e.stage===stage&&e.outcome==='PASS')))
   return {...run,status:'PASS',firstFailure:null};
 if(!STAGES.includes(run.stage))return {...run,status:'HELD',
   firstFailure:{stage:run.stage,code:'INTERRUPTED_STAGE_UNKNOWN'}};
 return {...run,status:'HELD',
   firstFailure:{stage:run.stage,code:'BROWSER_INTERRUPTED_RECONCILE_BEFORE_RESUME'}};
}
