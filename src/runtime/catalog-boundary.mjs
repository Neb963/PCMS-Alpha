import {initializeEmptyPrivateGit} from './catalog-bootstrap.mjs';
import {DEFAULT_AI_PROMPT} from './ai-evidence.mjs';
// S03 fixed-purpose GitHub connection and main-only catalog boundary.
// Extension-background IndexedDB owns tokens; canonical state and UI never receive them.
import {trustedExtensionPage} from './command-boundary.mjs';
import {browserGitCredentialPacket} from './git-local-secret.mjs';
import {createRestoreSentinel,openCanonicalDatabase,fail} from './journal.mjs';
import {createImportApprovalStore,getImportScopeDigest} from './catalog-import.mjs';
import {createGitPromptStore} from './catalog-prompt-store.mjs';
import {buildImportPreview} from './catalog-import-preview.mjs';
import {standingS06} from './s06-standing-authority.mjs';
import {writeExistingGitPrompt,observeGitPromptWrite} from './git-prompt.mjs';
import {inspectReadyCandidate} from './catalog-declaration.mjs';
import {createDeclarationStore} from './catalog-ready-store.mjs';
import {createReadyStore} from './ready-store.mjs';
import {scanMainCatalog,validRepository,makeInitialImportPreview} from './git-catalog.mjs';
export const CATALOG_PORT='pcms-s03-catalog';
const STATE_KEY='pcmsS03Git';
const PENDING_KEY='pcmsS03GitPending';
const TOKEN=/^[\x21-\x7e]{12,512}$/;
const validConfig=c=>c&&typeof c==='object'&&validRepository(c.repository)&&
  typeof c.repositoryId==='string'&&/^[1-9][0-9]{0,19}$/.test(c.repositoryId);
export function validateCatalogMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  if(!message||typeof message!=='object'||Array.isArray(message)||
      Object.keys(message).some(k=>!['type','params'].includes(k)))
    return fail('CAPABILITY_OFF');
  const types=['SEARCH_PATHS','SCAN_CATALOG','CONNECT_GIT','SCAN_CONNECTED','GIT_STATUS','GET_CONNECTION_STATE','DISCONNECT_GIT','RECONCILE_GIT','RECOVER_GIT_CONNECTION','APPROVE_IMPORT','GET_PROMPT_DRAFT','SAVE_PROMPT_DRAFT','COMMIT_PROMPT','RECONCILE_PROMPT','INSPECT_DECLARATION','LIST_READY'];
  if(!types.includes(message.type))return fail('CAPABILITY_OFF');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  if(message.type==='SEARCH_PATHS'){
    if(Object.keys(p).some(k=>!['query','limit'].includes(k))||typeof p.query!=='string'||p.query.length>512||!Number.isInteger(p.limit)||p.limit<1||p.limit>50)return fail('INVALID_PARAMS');
  }else if(['SCAN_CATALOG','CONNECT_GIT','RECOVER_GIT_CONNECTION'].includes(message.type)){
    if(Object.keys(p).some(k=>!['repository','token',...(message.type==='RECOVER_GIT_CONNECTION'?['acknowledgeCredentialReplacement']:[])].includes(k))||
      !validRepository(p.repository)||!TOKEN.test(p.token||'')||
      (message.type==='RECOVER_GIT_CONNECTION'&&p.acknowledgeCredentialReplacement!==true))
      return fail('INVALID_PARAMS');
  } else if(message.type==='SAVE_PROMPT_DRAFT'){
    if(Object.keys(p).some(k=>!['repositoryId','expectedRevision','baseOid','text'].includes(k))||
      typeof p.repositoryId!=='string'||!/^[1-9][0-9]{0,19}$/.test(p.repositoryId)||
      !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0||
      !(p.baseOid===null||typeof p.baseOid==='string'&&/^[0-9a-f]{40}$/.test(p.baseOid))||
      typeof p.text!=='string'||p.text.length===0||p.text.length>131072)
      return fail('INVALID_PARAMS');
  } else if(message.type==='INSPECT_DECLARATION'){
    if(Object.keys(p).some(k=>k!=='slug')||typeof p.slug!=='string'||
      !/^[a-z0-9][a-z0-9-]{0,99}$/.test(p.slug))return fail('INVALID_PARAMS');
  } else if(message.type==='COMMIT_PROMPT'){
    if(Object.keys(p).some(k=>!['repositoryId','expectedRevision','expectedHead'].includes(k))||
      typeof p.repositoryId!=='string'||!/^[1-9][0-9]{0,19}$/.test(p.repositoryId)||
      !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1||
      !(p.expectedHead===null||typeof p.expectedHead==='string'&&/^[a-f0-9]{40}$/.test(p.expectedHead)))
      return fail('INVALID_PARAMS');
  } else if(message.type==='APPROVE_IMPORT'){
    if(Object.keys(p).some(k=>!['repositoryId','scopeDigest','planDigest','expectedRevision'].includes(k))||
      typeof p.repositoryId!=='string'||!/^[1-9][0-9]{0,19}$/.test(p.repositoryId)||
      typeof p.scopeDigest!=='string'||!/^[0-9a-f]{64}$/.test(p.scopeDigest)||
      !/^[0-9a-f]{64}$/.test(p.planDigest||'')||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0)
      return fail('INVALID_PARAMS');
  } else if(message.type==='RECONCILE_PROMPT'){
    if(Object.keys(p).some(k=>k!=='repositoryId')||
      typeof p.repositoryId!=='string'||!/^[1-9][0-9]{0,19}$/.test(p.repositoryId))
      return fail('INVALID_PARAMS');
  } else if(message.type==='LIST_READY'){
    if(Object.keys(p).some(k=>!['after','limit','query','status'].includes(k))||
      (p.after!==undefined&&(typeof p.after!=='string'||p.after.length>100))||
      (p.limit!==undefined&&(!Number.isInteger(p.limit)||p.limit<1||p.limit>200))||
       (p.query!==undefined&&(typeof p.query!=='string'||p.query.length>100))||
       (p.status!==undefined&&
         !['ALL','NEEDS_ACTION','RUNNING','WAITING','COMPLETED'].includes(p.status)))
      return fail('INVALID_PARAMS');
  } else if(message.type==='GET_PROMPT_DRAFT'){ 
    if(Object.keys(p).length)return fail('INVALID_PARAMS');
  } else if(Object.keys(p).length)return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createCatalogBoundary(api,{scan=scanMainCatalog,transport=fetch,
  open=openCanonicalDatabase,writePrompt=writeExistingGitPrompt,
  observePrompt=observeGitPromptWrite,initialize=initializeEmptyPrivateGit,
  inspectDeclaration=inspectReadyCandidate,
  // Product gate stays inactive until independently authorized Git H/GIT proof.
  promptWriteGate=()=>false,authorityGeneration=()=>standingS06?.policyGeneration(),
  native=packet=>browserGitCredentialPacket(packet)}={}){
  let importDb;
  const approvalStore=async()=>createImportApprovalStore(await (importDb ||= open().catch(e=>{importDb=null;throw e;})));
  const promptStore=async()=>createGitPromptStore(await (importDb ||= open().catch(e=>{importDb=null;throw e;})));
  const declarationStore=async()=>createDeclarationStore(await (importDb ||= open().catch(e=>{importDb=null;throw e;})));
  const sentinel=createRestoreSentinel(api.storage.local);
  const readConfig=async()=>{
    const c=(await api.storage.local.get(STATE_KEY))?.[STATE_KEY];
    return validConfig(c)?c:null;
  };
  async function getSecret(config){
    const result=await native({action:'git.get',repositoryId:config.repositoryId});
    return result?.ok&&TOKEN.test(result.credential||'')?
      {ok:true,token:result.credential}:fail('GIT_VAULT_UNAVAILABLE');
  }
  async function scanAndPreview(repository,token,expectedId){
    const result=await scan({repository,token});
    if(!result?.ok||!result.complete)return result?.code?
      {ok:false,complete:false,code:result.code}:fail('CATALOG_INCOMPLETE');
    if(expectedId&&result.repositoryId!==expectedId)return fail('GIT_IDENTITY_CHANGED');
    const scopeDigest=await getImportScopeDigest(result);
    let preview={...makeInitialImportPreview(result),scopeDigest};
    if(!expectedId)return {...result,preview};
    preview={...await buildImportPreview(await (importDb ||= open()),result),scopeDigest};
    if(!preview.ok)return preview;
    let approved=null;
    try{approved=await (await approvalStore()).get(expectedId);}catch{}
    // There is no existing managed item to review in a genuinely empty
    // scope. Connection establishes onboarding for future merged folders;
    // no human approval or provider observation is fabricated.
    if(!approved?.ok&&result.generators.length===0&&/^[a-f0-9]{40}$/.test(result.head||'')){
      const empty=await (await approvalStore()).approve({repository:result.repository,repositoryId:expectedId,
        head:result.head,scopeDigest,recognizedSlugs:[],approvalAt:Date.now(),planDigest:preview.planDigest,targets:[],reviewedSources:[],emptyOnboarding:true});
      if(empty.ok){approved=empty;await api.storage.local.set({pcmsS04CatalogIntakeProgress:{repositoryId:expectedId,head:result.head,
        scopeDigest,initialScopeDigest:scopeDigest,initialImportCompleted:true,initialApprovalRevision:empty.approval.revision,next:0,total:0}});}
    }
    const progress=(await api.storage.local.get('pcmsS04CatalogIntakeProgress'))?.pcmsS04CatalogIntakeProgress;
    const completed=progress?.repositoryId===expectedId&&progress.initialImportCompleted===true&&progress.initialScopeDigest===approved?.approval?.scopeDigest;
    const importStatus=completed&&!preview.initialReviewRequired?'IMPORT_SETUP_COMPLETE':approved?.ok?
      approved.approval.scopeDigest===scopeDigest&&approved.approval.planDigest===preview.planDigest?'IMPORT_SCOPE_APPROVED':'IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED':
      'IMPORT_SCOPE_UNAPPROVED';
    if(result.head)await api.storage.local.set({pcmsS03SearchSnapshot:{repository:result.repository,repositoryId:result.repositoryId,head:result.head,complete:true,
      generators:result.generators.map(g=>({slug:g.slug,folder:g.folder,paths:g.paths||[]}))}});
    return {...result,...(result.prompt?.state==='ABSENT'?{starterPrompt:DEFAULT_AI_PROMPT,starterVersion:'pcms.chat1-starter/1'}:{}),preview,importStatus,approvalRevision:approved?.approval?.revision||0};
  }
  async function run(message,sender){
    const auth=validateCatalogMessage(api,sender,message);
    if(!auth.ok)return auth;
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const p=message.params||{};
    let stage='UNCLASSIFIED';
    try{
      if(message.type==='SEARCH_PATHS'){
        const cfg=await readConfig();if(!cfg)return fail('GIT_RECONNECT_REQUIRED');
        const snapshot=(await api.storage.local.get('pcmsS03SearchSnapshot'))?.pcmsS03SearchSnapshot;
        if(!snapshot?.complete||snapshot.repositoryId!==cfg.repositoryId)return {ok:true,items:[],snapshotAvailable:false};
        const query=p.query.toLowerCase(),items=[];
        for(const g of snapshot.generators){for(const path of [g.folder,...g.paths.map(path=>g.folder+'/'+path)]){
          if(path.toLowerCase().includes(query)){items.push({slug:g.slug,path,folder:g.folder,head:snapshot.head});if(items.length>=p.limit)return {ok:true,items,snapshotAvailable:true};}
        }}return {ok:true,items,snapshotAvailable:true};
      }
      if(message.type==='GET_CONNECTION_STATE'){
        // Read-only nonsecret status. A pending intent cannot be treated as
        // no connection: it may follow an ambiguous browser-IDB credential write.
        const configured=await readConfig();
        const pending=(await api.storage.local.get(PENDING_KEY))?.[PENDING_KEY];
        const validPending=validConfig(pending)?pending:null;
        return {ok:true,configured:!!configured,interrupted:!!pending,
          repository:configured?.repository||validPending?.repository||null,
          canRecover:!!validPending,
          credentialPresence:'NOT_CHECKED',remoteIdentityVerified:false};
      }
      if(message.type==='LIST_READY')
        return createReadyStore(await (importDb ||= open())).list(p);
      if(message.type==='SCAN_CATALOG')
        return await scanAndPreview(p.repository,p.token,null);
      if(message.type==='CONNECT_GIT'||message.type==='RECOVER_GIT_CONNECTION'){
        const recovery=message.type==='RECOVER_GIT_CONNECTION';
        // Repository identity first. No local secret write on an
        // unauthenticated, transient or wrong-repository response.
        let response;
        stage='GITHUB_TRANSPORT';
        try{response=await transport('https://api.github.com/repos/'+p.repository,{
          method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
          headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+p.token,
            'X-GitHub-Api-Version':'2022-11-28'}});}
        catch{return fail('GITHUB_TRANSPORT_UNAVAILABLE');}
        if(response?.status!==200){
          return fail(response?.status===401?'GITHUB_AUTH_REJECTED':
            response?.status===403?'GITHUB_ACCESS_FORBIDDEN':
            response?.status===404?'GITHUB_REPOSITORY_INACCESSIBLE':
            response?.status===429?'GITHUB_RATE_LIMITED':
            response?.status>=500?'GITHUB_SERVICE_UNAVAILABLE':
            'GITHUB_UNEXPECTED_HTTP_STATUS');
        }
        stage='GITHUB_RESPONSE';
        let obj;
        try{obj=await response.json();}catch{return fail('GITHUB_RESPONSE_INVALID');}
        if(obj?.full_name!==p.repository||obj?.private!==true||
          !/^[1-9][0-9]{0,19}$/.test(String(obj.id||'')))
          return fail('REPOSITORY_IDENTITY_UNVERIFIED');
        const id=String(obj.id);
        stage='CONFIG_READ';
        const current=await readConfig();
        const previousPending=(await api.storage.local.get(PENDING_KEY))?.[PENDING_KEY];
        if(recovery){
          if(!previousPending||!validConfig(previousPending))
            return fail('GIT_RECOVERY_REQUIRES_PENDING');
          if(previousPending.repository!==p.repository||previousPending.repositoryId!==id)
            return fail('GIT_RECOVERY_SCOPE_MISMATCH');
        }else if(previousPending)return fail('GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED');
        if(current&&(current.repositoryId!==id||current.repository!==p.repository))
          return fail('GIT_CONNECTION_REPLACE_REQUIRES_DISCONNECT');
        // Nonsecret intent survives the exact IndexedDB-before-config interruption.
        // Never assume interrupted storage confirms absence of the credential.
        stage='PENDING_INTENT';
        await api.storage.local.set({[PENDING_KEY]:{
          repository:p.repository,repositoryId:id,startedAt:Date.now(),
          ...(recovery?{explicitCredentialReplacement:true}:{})}});
        stage='VAULT_STORE';
        let saved;
        try{saved=await native({action:'git.store',repositoryId:id,credential:p.token});}
        catch{return fail('GIT_VAULT_STORE_OUTCOME_UNCERTAIN');}
        if(saved?.ok!==true)return fail(saved?.code==='TIMEOUT'?'GIT_SECRET_SERVICE_TIMEOUT':
          saved?.code==='UNAVAILABLE'?'GIT_SECRET_SERVICE_UNAVAILABLE':
          saved?.code==='DENIED'?'GIT_VAULT_OPERATION_DENIED':'GIT_VAULT_STORE_OUTCOME_UNCERTAIN');
        stage='CONFIG_COMMIT';
        await api.storage.local.set({[STATE_KEY]:{repository:p.repository,repositoryId:id}});
        stage='CONFIG_READBACK';
        const committed=await readConfig();
        if(committed?.repository!==p.repository||committed.repositoryId!==id)
          return fail('GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN');
        stage='VAULT_READBACK';
        let status;
        try{status=await native({action:'git.status',repositoryId:id});}
        catch{return fail('GIT_CONFIGURED_VAULT_STATUS_UNAVAILABLE');}
        if(status?.ok!==true)return fail('GIT_CONFIGURED_VAULT_STATUS_UNAVAILABLE');
        // Cleanup is best effort. A successful readback is not invalidated by
        // failure to clear nonsecret intent, which preflight can reconcile.
        try{await api.storage.local.remove(PENDING_KEY);}catch{}
        return {ok:true,code:'GIT_CONNECTED_LOCALLY_VERIFIED',repository:p.repository,
          repositoryId:id,remoteIdentityVerified:true,vaultPresenceVerified:true,
          mainTreeVerified:false};
      }
      if(message.type==='RECONCILE_GIT'){
        // Explicitly requested recovery, never part of preflight or a retry.
        // Only repairs local metadata after background secret + GitHub identity readback.
        stage='CONFIG_READ';
        const stored=await readConfig();
        const pending=(await api.storage.local.get(PENDING_KEY))?.[PENDING_KEY];
        const expected=pending&&validRepository(pending.repository)&&
          /^[1-9][0-9]{0,19}$/.test(pending.repositoryId)?pending:
          stored;
        if(!expected)return fail('GIT_RECONNECT_REQUIRED');
        if(stored&&(stored.repository!==expected.repository||
          stored.repositoryId!==expected.repositoryId))return fail('GIT_RECONCILIATION_IDENTITY_CONFLICT');
        stage='VAULT_RECONCILIATION';
        let secret;
        try{secret=await native({action:'git.get',repositoryId:expected.repositoryId});}
        catch{return fail('GIT_RECONCILIATION_VAULT_UNAVAILABLE');}
        if(!secret?.ok||!TOKEN.test(secret.credential||''))
          return fail('GIT_RECONCILIATION_CREDENTIAL_UNAVAILABLE');
        stage='GITHUB_RECONCILIATION';
        let response;
        try{response=await transport('https://api.github.com/repos/'+expected.repository,{
          method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
          headers:{Accept:'application/vnd.github+json',
            Authorization:'Bearer '+secret.credential,
            'X-GitHub-Api-Version':'2022-11-28'}});}catch{return fail('GIT_RECONCILIATION_NETWORK_UNAVAILABLE');}
        if(response?.status!==200)return fail(response?.status===401?'GITHUB_AUTH_REJECTED':
          response?.status===403?'GITHUB_ACCESS_FORBIDDEN':
          response?.status===404?'GITHUB_REPOSITORY_INACCESSIBLE':
          'GIT_RECONCILIATION_HTTP_UNAVAILABLE');
        let obj;
        try{obj=await response.json();}catch{return fail('GITHUB_RESPONSE_INVALID');}
        if(obj?.full_name!==expected.repository||obj?.private!==true||
          String(obj.id)!==expected.repositoryId)return fail('GIT_RECONCILIATION_IDENTITY_CONFLICT');
        const again=await readConfig();
        if(again&&(again.repository!==expected.repository||
          again.repositoryId!==expected.repositoryId))return fail('GIT_RECONCILIATION_IDENTITY_CONFLICT');
        stage='CONFIG_COMMIT';
        await api.storage.local.set({[STATE_KEY]:{
          repository:expected.repository,repositoryId:expected.repositoryId}});
        stage='CONFIG_READBACK';
        const confirmed=await readConfig();
        if(confirmed?.repository!==expected.repository||
          confirmed.repositoryId!==expected.repositoryId)return fail('GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN');
        try{await api.storage.local.remove(PENDING_KEY);}catch{}
        return {ok:true,code:'GIT_RECONCILED_LOCALLY_VERIFIED',
          repository:expected.repository,repositoryId:expected.repositoryId,
          remoteIdentityVerified:true,mainTreeVerified:false};
      }
      stage='CONFIG_READ';
      const config=await readConfig();
      if(!config)return fail('GIT_RECONNECT_REQUIRED');
      if(message.type==='INSPECT_DECLARATION'){
        const secret=await getSecret(config);if(!secret.ok)return secret;
        const current=await scanAndPreview(config.repository,secret.token,config.repositoryId);
        if(!current.ok)return current;
        if(!current.generators.some(g=>g.slug===p.slug&&g.ready))
          return fail('READY_DECLARATION_NOT_PRESENT');
        const witnessed=await inspectDeclaration({
          repository:config.repository,token:secret.token,slug:p.slug,
          pinnedHead:current.head,includeSourceBytes:false
        },transport);
        if(!witnessed.ok)return witnessed;
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        const recorded=await (await declarationStore()).witness({
          repositoryId:config.repositoryId,slug:p.slug,coherent:witnessed});
        if(!recorded.ok)return recorded;
        // Never return Git token or full private source bytes to a UI port.
        return {ok:true,code:witnessed.code,declarationCommit:witnessed.declarationCommit,
          declarationIdentity:witnessed.declarationIdentity,
          legacy:witnessed.legacy,token:witnessed.token,inputFingerprint:witnessed.inputFingerprint,
          files:witnessed.files.map(f=>({path:f.path,size:f.size,sha256:f.sha256})),
          optionalTesting:witnessed.optionalTesting,pinnedHead:current.head,
          slug:p.slug,providerEffects:'OFF'};
      }
      if(message.type==='GET_PROMPT_DRAFT'){
        const value=await (await promptStore()).read(config.repositoryId);
        // Canonical draft only, no credentials and no effect authority.
        return value;
      }
      if(message.type==='SAVE_PROMPT_DRAFT'){
        if(p.repositoryId!==config.repositoryId)return fail('GIT_IDENTITY_CHANGED');
        return await (await promptStore()).save({repositoryId:config.repositoryId,
          expectedRevision:p.expectedRevision,baseOid:p.baseOid,
          text:p.text,updatedAt:Date.now()});
      }
      if(message.type==='RECONCILE_PROMPT'){
        if(p.repositoryId!==config.repositoryId)return fail('GIT_IDENTITY_CHANGED');
        const prior=await (await promptStore()).read(config.repositoryId);
        if(!prior.ok||!['UNCERTAIN','DISPATCH_POSSIBLE'].includes(
           prior.record.effect?.state))return fail('PROMPT_NO_UNCERTAIN_EFFECT');
        const secret=await getSecret(config);if(!secret.ok)return secret;
        const observation=await observePrompt({
          token:secret.token,repository:config.repository,
          operationId:prior.record.effect.operationId,
          expectedParent:prior.record.effect.baseHead,
          draft:prior.record.text,repositoryId:config.repositoryId
        },transport,scan);
        if(!observation.ok)return {ok:false,code:observation.code,
          retainsDraft:true};
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        const stamped=await (await promptStore()).reconcile({
          repositoryId:config.repositoryId,
          operationId:prior.record.effect.operationId,
          state:'VERIFIED',possibleCommit:observation.commit,receipt:observation
        });
        return stamped.ok?{ok:true,code:'PROMPT_RECONCILED_VERIFIED',
          commit:observation.commit}:stamped;
      }
      if(message.type==='COMMIT_PROMPT'){
        if(p.repositoryId!==config.repositoryId)return fail('GIT_IDENTITY_CHANGED');
        const grantGeneration=authorityGeneration();
        if(promptWriteGate()!==true)return fail('GIT_WRITE_ACTIVATION_HELD');
        const currentDraft=await (await promptStore()).read(config.repositoryId);
        if(!currentDraft.ok||currentDraft.record.revision!==p.expectedRevision||
           currentDraft.record.effect)return fail('PROMPT_DRAFT_STALE_OR_UNCERTAIN');
        const secret=await getSecret(config);if(!secret.ok)return secret;
        const current=await scanAndPreview(config.repository,secret.token,config.repositoryId);
        if(!current.ok)return current;
        if(current.prompt.oid!==currentDraft.record.baseOid)return fail('PROMPT_CONFLICT_KEEP_DRAFT');
        const operationId='s03_'+crypto.randomUUID().replaceAll('-','');
        const journal=await (await promptStore()).prepare({repositoryId:config.repositoryId,
          revision:p.expectedRevision,operationId,baseHead:current.head,
          baseOid:current.prompt.oid,updatedAt:Date.now()});
        if(!journal.ok)return journal;
        const beforeDispatch=async()=>{
          if(promptWriteGate()!==true||(await sentinel.inspect()).held)return false;
          const live=await readConfig();return promptWriteGate()===true&&authorityGeneration()===grantGeneration&&live?.repositoryId===config.repositoryId&&live.repository===config.repository;
        };
        beforeDispatch.current=()=>promptWriteGate()===true&&authorityGeneration()===grantGeneration;
        let result;
        try{
        if(current.head===null){
          const approvedStarterSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(currentDraft.record.text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
          result=await initialize({token:secret.token,repository:config.repository,starterPrompt:currentDraft.record.text,beforeDispatch,
            intent:{phase:'DISPATCH_POSSIBLE',operationId,repositoryId:config.repositoryId,approvedStarterSha256,starterApproved:true}},transport,scan);
        }else result=await writePrompt({token:secret.token,repository:config.repository,
          draft:currentDraft.record.text,beforeDispatch,intent:{
            phase:'DISPATCH_POSSIBLE',operationId,repositoryId:config.repositoryId,
            expectedHead:current.head,expectedOid:current.prompt.oid,
            requireExactHead:true,source:'PINNED_MAIN_PROMPT_EDITOR'
          }},transport,scan);
        }catch{result={ok:false,dispatchPossible:true,code:'PROMPT_DISPATCH_UNCONFIRMED'};}
        // Uncertain or missing ACK must not be blindly replayed.
        const state=result?.ok&&['PROMPT_COMMITTED_VERIFIED','PROMPT_UNCHANGED','GIT_INITIALIZED_VERIFIED'].includes(result.code)?'VERIFIED':result?.dispatchPossible===false?'CONFLICT':'UNCERTAIN';
        const terminal=await (await promptStore()).reconcile({
          repositoryId:config.repositoryId,operationId,state,
          possibleCommit:result?.possibleCommit||
            (state==='VERIFIED'?result.head:null),receipt:result});
        return {...terminal,ok:terminal.ok&&state==='VERIFIED',code:state==='VERIFIED'?'PROMPT_GIT_VERIFIED':
          state==='CONFLICT'?'PROMPT_CONFLICT_KEEP_DRAFT':'PROMPT_GIT_UNCERTAIN_RECONCILE_REQUIRED',writeCode:result?.code};
      }
      if(message.type==='GIT_STATUS'){
        stage='VAULT_STATUS';
        const result=await native({action:'git.status',repositoryId:config.repositoryId});
        return {ok:result?.ok===true,code:result?.ok===true?'GIT_CREDENTIAL_PRESENT_UNAUTHENTICATED':
          result?.code==='TIMEOUT'?'GIT_SECRET_SERVICE_TIMEOUT':
          result?.code==='UNAVAILABLE'?'GIT_SECRET_SERVICE_UNAVAILABLE':
          result?.code==='MISSING_OR_INVALID'?'GIT_CREDENTIAL_MISSING_OR_INVALID':
          'GIT_VAULT_STATUS_UNCERTAIN',repository:config.repository,repositoryId:config.repositoryId,
          remoteIdentityVerified:false,mainTreeVerified:false};
      }
      if(message.type==='DISCONNECT_GIT'){
        stage='VAULT_REMOVE';
        const result=await native({action:'git.remove',repositoryId:config.repositoryId});
        if(!result?.ok)return fail('GIT_VAULT_UNAVAILABLE');
        stage='CONFIG_REMOVE';
        await api.storage.local.remove(STATE_KEY);
        try{await api.storage.local.remove(PENDING_KEY);}catch{}
        return {ok:true,code:'GIT_DISCONNECTED'};
      }
      if(message.type==='SCAN_CONNECTED'||message.type==='APPROVE_IMPORT'){
        if(message.type==='APPROVE_IMPORT'&&p.repositoryId!==config.repositoryId)
          return fail('GIT_IDENTITY_CHANGED');
        const secret=await getSecret(config);
        if(!secret.ok)return secret;
        const current=await scanAndPreview(config.repository,secret.token,config.repositoryId);
        if(!current?.ok)return current;
        if(message.type==='SCAN_CONNECTED')return current;
        if(current.preview.scopeDigest!==p.scopeDigest||current.preview.planDigest!==p.planDigest||current.approvalRevision!==p.expectedRevision)
          return fail('IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        const still=await readConfig();
        if(still?.repositoryId!==config.repositoryId||still.repository!==config.repository)
          return fail('GIT_CONNECTION_CHANGED');
        const approved=await (await approvalStore()).approve({
          repository:current.repository,repositoryId:current.repositoryId,
          head:current.head,scopeDigest:p.scopeDigest,
          recognizedSlugs:current.generators.map(g=>g.slug),approvalAt:Date.now(),
          planDigest:p.planDigest,targets:current.preview.targets,expectedRevision:p.expectedRevision,
          reviewedSources:current.generators.map(g=>({slug:g.slug,markerOid:g.markerOid,folderTreeOid:g.folderTreeOid||null}))
        });
        if(approved.ok)try{await api.alarms.create('pcms-s03-main-resume',{when:Date.now()+500});}catch{}
        return approved;
      }
      return fail('CAPABILITY_OFF');
    }catch{
      // No raw exception or credential-bearing request leaves this boundary.
      // A failed acknowledgment after any write is explicitly uncertain.
      return fail(({CONFIG_READ:'GIT_CONFIG_READ_FAILED',
        PENDING_INTENT:'GIT_PENDING_INTENT_FAILED',
        CONFIG_COMMIT:'GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN',
        CONFIG_READBACK:'GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN',
        VAULT_STATUS:'GIT_VAULT_STATUS_UNAVAILABLE',
        VAULT_RECONCILIATION:'GIT_RECONCILIATION_VAULT_UNAVAILABLE',
        GITHUB_RECONCILIATION:'GIT_RECONCILIATION_NETWORK_UNAVAILABLE',
        VAULT_REMOVE:'GIT_VAULT_REMOVE_OUTCOME_UNCERTAIN',
        CONFIG_REMOVE:'GIT_CONFIG_REMOVE_OUTCOME_UNCERTAIN'}[stage])||
        'CATALOG_COMMAND_FAILED');
    }
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==CATALOG_PORT)return;
      let pending=false;
      port.onMessage.addListener(message=>{
        if(pending){try{port.postMessage(fail('BUSY'));}catch{}return;}
        pending=true;
        Promise.resolve(run(message,port.sender)).then(result=>{
          try{port.postMessage(result);}catch{}
        }).catch(()=>{try{port.postMessage(fail('CATALOG_INCOMPLETE'));}catch{}})
          .finally(()=>{pending=false;});
      });
    });
  }
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createCatalogBoundary(browser,{
  promptWriteGate:()=>standingS06?.gate('gitWrite')===true
}).register();
