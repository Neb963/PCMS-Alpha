// R3: read-only, evidence-scoped operational preflight. Does not install hosts,
// persist connection state, read provider content or dispatch an external write.
import {trustedExtensionPage} from './command-boundary.mjs';
import {scanMainCatalog,validRepository} from './git-catalog.mjs';
export const READINESS_PORT='pcms-r3-readiness';
const GIT_CONFIG='pcmsS03Git',PENDING='pcmsS03GitPending';
const EXPECTED_ID='persona-route-manager@local';
const VAULT='local.pcms.backup_vault';
const BACKUP='local.pcms.backup_v2';
const DIAGNOSTIC='local.pcms.diagnostic_browser';
const RID=/^[1-9][0-9]{0,19}$/;
const TOKEN=/^[\x21-\x7e]{12,512}$/;
const STATES=new Set(['NOT_CONFIGURED','OFF_BY_POLICY','MISSING_CAPABILITY','SECURITY_HELD','UNREACHABLE','OUTCOME_UNCERTAIN','STALE','NOT_TESTED','VERIFIED']);
const short=s=>typeof s==='string'?s.replace(/[^A-Z0-9_.-]/gi,'_').slice(0,80):'UNKNOWN';
function result(component,state,stage,code,dependency,safeRecovery,evidenceKind='D',evidenceSource='RUNTIME',retrySafety='READ_ONLY',scope='LOCAL',now=Date.now()){
  return {component,scope,state:STATES.has(state)?state:'OUTCOME_UNCERTAIN',stage,code:short(code),dependency,
    observedAt:now,evidenceKind,evidenceSource,safeRecovery,retrySafety};
}
export function validateReadinessMessage(api,sender,msg){
  if(!trustedExtensionPage(api,sender))return {ok:false,code:'UNTRUSTED_SENDER'};
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||
      Object.keys(msg).some(k=>!['type','params'].includes(k))||msg.type!=='CHECK')
    return {ok:false,code:'INVALID_MESSAGE'};
  const p=msg.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>k!=='remote')||
      (p.remote!==undefined&&typeof p.remote!=='boolean'))return {ok:false,code:'INVALID_PARAMS'};
  return {ok:true};
}
const probeClassification=(value,transportError)=>{
  if(transportError)return {host:'UNREACHABLE',vault:'NOT_TESTED',code:'NATIVE_TRANSPORT_UNAVAILABLE'};
  if(!value||typeof value!=='object'||typeof value.ok!=='boolean')
    return {host:'OUTCOME_UNCERTAIN',vault:'OUTCOME_UNCERTAIN',code:'NATIVE_PROTOCOL_UNRECOGNIZED'};
  if(value.ok===true)return {host:'VERIFIED',vault:'VERIFIED',code:'VAULT_ENTRY_PRESENT'};
  if(value.code==='MISSING_OR_INVALID')return {host:'VERIFIED',vault:'OUTCOME_UNCERTAIN',code:'VAULT_ENTRY_MISSING_OR_INVALID'};
  if(value.code==='TIMEOUT'||value.code==='UNAVAILABLE')return {host:'VERIFIED',vault:'UNREACHABLE',code:'SECRET_SERVICE_'+value.code};
  return {host:'VERIFIED',vault:'OUTCOME_UNCERTAIN',code:'VAULT_'+short(value.code)};
};
export {probeClassification};
export function createReadinessBoundary(api,{native=(host,p)=>api.runtime.sendNativeMessage(host,p),
  scan=scanMainCatalog,transport=fetch,clock=Date.now,knownRepositoryId='1411034835'}={}){
  async function check({remote=false}={}){
    const rows=[],add=(component,state,stage,code,dependency,recovery,evidence='D',source='RUNTIME',retry='READ_ONLY',scope='LOCAL')=>
      rows.push(result(component,state,stage,code,dependency,recovery,evidence,source,retry,scope,clock()));
    let manifest=null;
    try{manifest=api.runtime.getManifest();}catch{}
    const identity=manifest?.browser_specific_settings?.gecko?.id===EXPECTED_ID&&
      typeof api.runtime.id==='string';
    add('EXTENSION_RUNTIME',identity?'VERIFIED':'MISSING_CAPABILITY','MANIFEST',identity?'RUNTIME_LISTENER_RESPONSIVE':'MANIFEST_IDENTITY_UNVERIFIED',
      'Firefox extension','Confirm this runtime in about:addons; exact installed XPI bytes need independent verification','RUNTIME','ACTIVE_EXTENSION_MANIFEST');
    add('INSTALLED_XPI_IDENTITY','NOT_TESTED','INDEPENDENT_PACKAGE_PROOF',
      'XPI_SHA256_NOT_INDEPENDENTLY_WITNESSED','EXTENSION_RUNTIME',
      'Use installed-Firefox package verification with exact XPI SHA-256; a manifest string alone is not installed-artifact proof',
      'B','NOT_OBSERVED');
    let settings=null,storageError=false;
    try{settings=await api.storage.local.get([GIT_CONFIG,PENDING,'pcmsS06StandingAuthority',
      'pcmsI12Status','pcmsRestoreInProgress','pcmsS08DisposableScope']);}catch{storageError=true;settings={};}
    add('LOCAL_CONFIGURATION',storageError?'UNREACHABLE':'VERIFIED','STORAGE_READ',storageError?'LOCAL_STORAGE_READ_FAILED':'LOCAL_STORAGE_READ_OK',
      'Firefox storage','Inspect browser profile storage availability','RUNTIME','EXTENSION_LOCAL_STORAGE');
    const config=settings[GIT_CONFIG],valid=config&&validRepository(config.repository)&&RID.test(config.repositoryId||'');
    const malformed=Boolean(config)&&!valid;
    const pending=settings[PENDING];
    const pendingValid=pending&&validRepository(pending.repository)&&RID.test(pending.repositoryId||'');
    const repoId=valid?config.repositoryId:pendingValid?pending.repositoryId:RID.test(knownRepositoryId)?knownRepositoryId:'1';
    const expectedRepo=valid?config.repository:pendingValid?pending.repository:'Neb963/per-gens';
    add('GIT_CONFIG',valid?'VERIFIED':malformed?'SECURITY_HELD':pendingValid?'OUTCOME_UNCERTAIN':'NOT_CONFIGURED','CONFIG_READ',
      valid?'GIT_CONFIG_PRESENT':malformed?'GIT_CONFIG_INVALID':pendingValid?'GIT_PENDING_CONNECTION':'GIT_CONFIG_ABSENT','LOCAL_CONFIGURATION',
      valid?'Read vault and authenticate repository before relying on Git':'Connect GitHub in Settings; do not assume a previous vault write was rolled back',
      'D','LOCAL_CONFIG_METADATA','READ_ONLY','GITHUB');
    let vaultReply=null,vaultError=null;
    try{vaultReply=await native(VAULT,{action:'git.status',repositoryId:repoId});}catch{vaultError=true;}
    // New hosts expose a nonsecret environment-only protocol; old installed
    // hosts explicitly report the missing method, never an invented OK.
    let envReply=null,envError=false;
    try{envReply=await native(VAULT,{action:'diagnostic.environment'});}catch{envError=true;}
    const environmentOK=envReply?.ok===true&&envReply.protocol===2&&
      envReply.dbusSession===true&&envReply.secretTool===true&&envReply.runtimeDir===true;
    add('SECRET_SERVICE_ENVIRONMENT',environmentOK?'VERIFIED':
      envError?'UNREACHABLE':envReply?.code==='DENIED'?'MISSING_CAPABILITY':
      'OUTCOME_UNCERTAIN','HOST_ENVIRONMENT',
      environmentOK?'ENVIRONMENT_PREREQUISITES_PRESENT':
      envError?'NATIVE_ENVIRONMENT_PROBE_UNREACHABLE':
      envReply?.code==='DENIED'?'HOST_DIAGNOSTIC_METHOD_NOT_INSTALLED':
      envReply?.secretTool===false?'SECRET_TOOL_UNAVAILABLE':
      envReply?.dbusSession===false?'DBUS_SESSION_UNAVAILABLE':
      envReply?.runtimeDir===false?'XDG_RUNTIME_DIR_UNAVAILABLE':'ENVIRONMENT_UNVERIFIED',
      'NATIVE_VAULT_HOST',
      'Check DBus session, libsecret and native host version. Environment availability is not proof the keyring is unlocked.',
      'H','NONSECRET_NATIVE_ENVIRONMENT');
    const classified=probeClassification(vaultReply,vaultError);
    add('NATIVE_VAULT_HOST',classified.host,'NATIVE_MESSAGE',classified.code,'Firefox nativeMessaging',
      'Verify local.pcms.backup_vault manifest, executable path and allowed Firefox extension ID','H','NATIVE_REPLY');
    const vaultState=classified.vault==='VERIFIED'&&!valid?'OUTCOME_UNCERTAIN':classified.vault;
    add('SECRET_SERVICE',vaultState,'SECRET_LOOKUP',classified.code,'NATIVE_VAULT_HOST',
      valid?'Unlock KDE Secret Service or reconnect the scoped Git credential if necessary':
        'Vault-only state may survive a failed configuration write; inspect and reconcile before reconnecting',
      'H','NONSECRET_GIT_STATUS');
    if(!valid&&classified.vault==='VERIFIED')add('GIT_PARTIAL_CONNECTION','OUTCOME_UNCERTAIN','RECONCILIATION',
      'CREDENTIAL_WITHOUT_CONFIGURATION','GIT_CONFIG + SECRET_SERVICE',
      'Do not clear or overwrite the stored credential; reconcile exact repository identity and config',
      'D','VAULT_AND_CONFIG_READBACK','MANUAL_RECONCILE','GITHUB');
    else add('GIT_PARTIAL_CONNECTION',pendingValid?'OUTCOME_UNCERTAIN':'NOT_TESTED','RECONCILIATION',
      pendingValid?'PENDING_CONNECTION_UNRESOLVED':'NO_PARTIAL_STATE_CONFIRMED','GIT_CONFIG + SECRET_SERVICE',
      'Do not infer vault absence from an unavailable Secret Service lookup','D','LOCAL_CONFIG_METADATA','READ_ONLY','GITHUB');
    const grants=settings.pcmsS06StandingAuthority;
    for(const k of ['development','gitWrite','publication']){
      const active=valid&&grants?.schema===1&&grants.repository===config.repository&&
        grants.repositoryId===config.repositoryId&&grants.grants?.[k]===true;
      const stale=grants&&(!valid||grants.repositoryId!==config.repositoryId||grants.repository!==config.repository);
      add('GRANT_'+k.toUpperCase(),active?'VERIFIED':stale?'STALE':'OFF_BY_POLICY','STANDING_AUTHORITY',
        active?'GRANT_RECORD_CURRENT':stale?'GRANT_SCOPE_MISMATCH':'OPERATOR_GRANT_OFF',
        'GIT_CONFIG + RESTORE_HOLD','Inspect Settings standing authorization; a grant alone does not prove live effects',
        'D','LOCAL_GRANT_RECORD','READ_ONLY','AUTHORIZATION');
    }
    const restore=storageError||settings.pcmsRestoreInProgress!==undefined;
    if(restore)add('RESTORE_HOLD','SECURITY_HELD','RESTORE',storageError?'RESTORE_SENTINEL_UNREADABLE':'RESTORE_REACTIVATION_REQUIRED','LOCAL_CONFIGURATION',
      'Complete the guarded restore review before permitting dependent effects','D','RESTORE_SENTINEL');
    else add('RESTORE_HOLD','NOT_TESTED','RESTORE','NO_LOCAL_RESTORE_MARKER','LOCAL_CONFIGURATION',
      'Absence of a marker is not proof of every downstream safety guard','D','RESTORE_SENTINEL');
    const ref=settings.pcmsI12Status;
    add('REFRESHER_POLICY',ref?.mode==='GUARDED_REFRESH_ENABLED'?'STALE':'NOT_TESTED','POLICY_SNAPSHOT',
      ref?.mode==='GUARDED_REFRESH_ENABLED'?'PREVIOUS_ENABLE_RECEIPT_ONLY':'CANONICAL_POLICY_NOT_READ',
      'CANONICAL_REFRESHER','Open Refresher for the current canonical policy, route, feed and saved-byte evidence',
      'D','NONAUTHORITATIVE_STATUS_BREADCRUMB','READ_ONLY','REFRESHER');
    add('PERSONA_AND_SESSION','NOT_TESTED','ROUTE_AND_IDENTITY','NO_LIVE_ROUTE_READBACK',
      'PERSONAMONKEY','Use guarded Accounts route and session verification; never fall back to Direct',
      'L','NOT_OBSERVED','CONSENT_REQUIRED','ACCOUNTS');
    add('BACKUP_RESTORE','NOT_TESTED','BACKUP','NO_FRESH_RESTORE_EVIDENCE',
      'NATIVE_BACKUP_HOST','Run guarded backup/restore verification on a disposable profile',
      'H','NOT_OBSERVED','CONSENT_REQUIRED','BACKUP');
    for(const [component,host,action] of [
      ['BACKUP_HOST',BACKUP,{action:'resource.inspect'}],
      ['DIAGNOSTIC_HOST',DIAGNOSTIC,{action:'resource.inspect'}]]){
      try{const response=await native(host,action);
        add(component,response&&typeof response==='object'?'VERIFIED':'OUTCOME_UNCERTAIN','NATIVE_MESSAGE',
          response?.code==='DENIED'?'READ_ONLY_PROBE_DENIED_HOST_RESPONDED':
          response&&typeof response==='object'?'NATIVE_HOST_RESPONDED':'NATIVE_PROTOCOL_UNRECOGNIZED',
          'Firefox nativeMessaging',`Verify ${host} host registration; response does not prove backup/diagnostic success`,
          'H','NATIVE_REPLY');
      }catch{add(component,'UNREACHABLE','NATIVE_MESSAGE','NATIVE_TRANSPORT_UNAVAILABLE',
        'Firefox nativeMessaging',`Install/repair ${host} through the separately authorized host installer`,
        'H','NATIVE_TRANSPORT');}
    }
    if(!remote){
      add('GITHUB_AUTH','NOT_TESTED','REMOTE_READ','AUTH_CHECK_NOT_REQUESTED','GIT_CONFIG + SECRET_SERVICE',
        'Select authenticated read-only GitHub verification after reviewing the requested scope',
        'GIT','NOT_REQUESTED','CONSENT_REQUIRED','GITHUB');
      add('GITHUB_MAIN_TREE','NOT_TESTED','MAIN_SCAN','COMPLETE_TREE_NOT_REQUESTED','GITHUB_AUTH',
        'Authenticated complete main scan requires explicit operator action',
        'GIT','NOT_REQUESTED','CONSENT_REQUIRED','GITHUB');
    }else if(!valid||classified.vault!=='VERIFIED'){
      for(const component of ['GITHUB_AUTH','GITHUB_MAIN_TREE'])add(component,'SECURITY_HELD',
        'REMOTE_READ','GIT_PREREQUISITES_UNVERIFIED','GIT_CONFIG + SECRET_SERVICE',
        'Repair configuration/Secret Service before authenticated read-only verification',
        'GIT','NO_NETWORK','READ_ONLY','GITHUB');
    }else{
      // Credential never crosses the extension background/UI trust boundary.
      let secret=null;
      try{secret=await native(VAULT,{action:'git.get',repositoryId:config.repositoryId});}catch{}
      if(!secret?.ok||!TOKEN.test(secret.credential||'')){
        for(const component of ['GITHUB_AUTH','GITHUB_MAIN_TREE'])add(component,'OUTCOME_UNCERTAIN',
          'VAULT_GET','GIT_CREDENTIAL_UNAVAILABLE','SECRET_SERVICE',
          'Unlock Secret Service/reconnect without exposing token in diagnostics',
          'GIT','NO_NETWORK','READ_ONLY','GITHUB');
      }else{
        let response=null;
        try{response=await transport('https://api.github.com/repos/'+config.repository,{
          method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
          headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+secret.credential,
            'X-GitHub-Api-Version':'2022-11-28'}});}catch{}
        const status=response?.status;
        let obj=null;
        if(status===200)try{obj=await response.json();}catch{}
        const good=status===200&&obj?.full_name===config.repository&&obj?.private===true&&
          String(obj?.id)===config.repositoryId;
        const code=good?'REPOSITORY_IDENTITY_VERIFIED':
          status===401?'GITHUB_AUTH_REJECTED':status===403?'GITHUB_ACCESS_FORBIDDEN':
          status===404?'GITHUB_REPOSITORY_NOT_ACCESSIBLE':status>=500?'GITHUB_SERVICE_UNAVAILABLE':
          status===200?'REPOSITORY_IDENTITY_MISMATCH':status?'GITHUB_HTTP_'+status:'GITHUB_TRANSPORT_UNAVAILABLE';
        add('GITHUB_AUTH',good?'VERIFIED':status===401||status===403||status===404?'SECURITY_HELD':'UNREACHABLE',
          'REPOSITORY_IDENTITY',code,'GIT_CONFIG + SECRET_SERVICE',
          good?'Authentication and private repository identity verified for this read only':
            'Check least-privilege repository access, token validity and configured repo ID',
          'GIT','AUTHENTICATED_REPOSITORY_GET','READ_ONLY','GITHUB');
        if(good){let value=null;
          try{value=await scan({repository:config.repository,token:secret.credential});}catch{}
          add('GITHUB_MAIN_TREE',value?.ok&&value.complete&&value.repositoryId===config.repositoryId?
            'VERIFIED':value?.complete===false?'STALE':'OUTCOME_UNCERTAIN',
            'PINNED_MAIN_TREE',value?.ok&&value.complete?'MAIN_TREE_COMPLETE':
              value?.code||'MAIN_TREE_UNVERIFIED','GITHUB_AUTH',
            'Inspect complete pinned main or retry read-only after transient GitHub failure',
            'GIT','SCOPED_PINNED_MAIN_SCAN','READ_ONLY','GITHUB');
        }else add('GITHUB_MAIN_TREE','SECURITY_HELD','MAIN_SCAN','AUTHENTICATION_REQUIRED',
          'GITHUB_AUTH','Restore authentication before tree observation',
          'GIT','NO_SCAN','READ_ONLY','GITHUB');
      }
    }
    // The entire result is a strict nonsecret projection. No raw exception,
    // credential, native response, account inventory or private Git data escapes.
    return {ok:true,schema:1,checkedAt:clock(),remoteRequested:remote,rows};
  }
  async function run(message,sender){const a=validateReadinessMessage(api,sender,message);
    if(!a.ok)return a;
    try{return await check(message.params||{});}catch{return {ok:false,code:'READINESS_INTERNAL_UNAVAILABLE'};}
  }
  function register(){api.runtime.onConnect.addListener(port=>{
    if(port?.name!==READINESS_PORT)return;
    let busy=false;port.onMessage.addListener(message=>{
      if(busy){try{port.postMessage({ok:false,code:'BUSY'});}catch{}return;}
      busy=true;void run(message,port.sender).then(r=>{try{port.postMessage(r);}catch{}})
        .catch(()=>{try{port.postMessage({ok:false,code:'READINESS_INTERNAL_UNAVAILABLE'});}catch{}})
        .finally(()=>{busy=false;});
    });
  });}
  return Object.freeze({run,check,register});
}
if(typeof browser!=='undefined')createReadinessBoundary(browser).register();
