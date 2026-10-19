// I10 settings and read-only AI-job preparation. Untrusted UI never supplies
// test evidence, native sessions, page code, helper credentials or Git writes.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {inspectGitSource} from './git-source.mjs';
import {inspectReadyCandidate} from './catalog-declaration.mjs';
import {scanMainCatalog} from './git-catalog.mjs';
import {pinGitChatPrompt} from './ready-git-prompt.mjs';
import {createReadyStore} from './ready-store.mjs';
import {authorizeReadyAiAdvance,authorizeGitReadyAiAdvance} from './ready-ai-gate.mjs';
import {verifyReadback,exactSource} from './staging-core.mjs';
import {planAiStep} from './ai-supervisor.mjs';
import {AI_BROWSER_ASSERTIONS} from './perchance-ai-oracle.mjs';
import {supportedDeclarativeAssertion} from './ai-declarative-assertion.mjs';
import {pinTestingAssertions} from './ai-testing.mjs';
export const AI_PORT='pcms-i10-ai';
export const AI_PROGRESS_ALARM='pcms-i10-progress';
function encodeUtf8(text){
  const bytes=new TextEncoder().encode(text);let binary='';
  for(let i=0;i<bytes.length;i+=8192)
    binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const ACT=new Set(['GET_PROMPTS','SET_PROMPT','IMPORT_PROMPT','EXPORT_PROMPTS',
  'LIST_JOBS','GET_JOB','PREPARE_JOB','BEGIN_NATIVE','PROBE_NATIVE','RUN_TESTS',
  'GET_CONCURRENCY','SET_CONCURRENCY','ADVANCE_JOB','INSPECT_WORKSPACE','VERIFY_FRESH_CHAT2']);
export function validateAiMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;
  try{json=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!message||typeof message!=='object'||Array.isArray(message)||
     Object.keys(message).some(k=>!['type','params'].includes(k))||
     !ACT.has(message.type)||!json||json.length>38000)return fail('INVALID_MESSAGE');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='LIST_JOBS'?['after','limit']:
     message.type==='GET_JOB'?['slug']:
    message.type==='PREPARE_JOB'?['slug','expectedStageRevision','token']:
    message.type==='BEGIN_NATIVE'?['slug','expectedRevision','step']:
    ['PROBE_NATIVE','RUN_TESTS','ADVANCE_JOB','INSPECT_WORKSPACE','VERIFY_FRESH_CHAT2'].includes(message.type)?['slug','expectedRevision']:
    message.type==='SET_CONCURRENCY'?['perAccount','expectedRevision']:
    message.type==='SET_PROMPT'?['text','tests','expectedRevision']:
    message.type==='IMPORT_PROMPT'?['envelope','expectedRevision']:[];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(['GET_JOB','PREPARE_JOB','BEGIN_NATIVE','PROBE_NATIVE','RUN_TESTS','ADVANCE_JOB','INSPECT_WORKSPACE','VERIFY_FRESH_CHAT2'].includes(message.type)&&!SLUG.test(p.slug||''))
    return fail('INVALID_SLUG');
  if(message.type==='PREPARE_JOB'&&
     (!Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
      (p.token!==undefined&&
     (typeof p.token!=='string'||p.token.length<10||p.token.length>512))))
    return fail('INVALID_PARAMS');
  if(['BEGIN_NATIVE','PROBE_NATIVE','RUN_TESTS','ADVANCE_JOB','INSPECT_WORKSPACE','VERIFY_FRESH_CHAT2'].includes(message.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1||
      (message.type==='BEGIN_NATIVE'&&
       !['CHAT1_SEND','CHAT2_RESET','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR','STOP'].includes(p.step))))
    return fail('INVALID_PARAMS');
  if(message.type==='LIST_JOBS'&&
      ((p.after!==undefined&&(typeof p.after!=='string'||p.after.length>100))||
       (p.limit!==undefined&&(!Number.isInteger(p.limit)||p.limit<1||p.limit>200))))
    return fail('INVALID_PARAMS');
  if(['SET_PROMPT','IMPORT_PROMPT','SET_CONCURRENCY'].includes(message.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createAiBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  storeFactory=createAiStore,stageFactory=createStagingStore,
  inspect=inspectGitSource,inspectReady=inspectReadyCandidate,
  scanCatalog=scanMainCatalog,effectGate=()=>false,clock=Date.now
}={}){
  let databasePromise,tickBusy=false;
  const database=()=>databasePromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  async function executeTrusted(message){
    try{
      const db=await database(),store=storeFactory(db),p=message.params||{};
      if(message.type==='GET_PROMPTS')return store.getPrompt();
      if(message.type==='GET_CONCURRENCY')return store.getConcurrency();
      if(message.type==='EXPORT_PROMPTS'){
        const history=await store.getPrompt();
        return history.ok?store.exportPrompt(history.history):history;
      }
      if(message.type==='LIST_JOBS')return store.list(p);
      if(message.type==='GET_JOB')return store.getJob(p.slug);
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      // A fresh coherent READY successor revokes advancement authority for
      // the older AI candidate. Read-only PROBE_NATIVE remains available for
      // uncertain-session reconciliation; it never starts a new mutation.
      // STOP is a safety-quiescence action on the *already armed* old
      // native session, not a new repair or candidate development turn.
      // Its canonical native state and donor owner/route checks still apply.
      const safeStop=message.type==='BEGIN_NATIVE'&&p.step==='STOP';
      if(['ADVANCE_JOB','BEGIN_NATIVE','RUN_TESTS',
          'VERIFY_FRESH_CHAT2'].includes(message.type)&&!safeStop&&
          typeof store.getJobFull==='function'){
        const sealed=await store.getJobFull(p.slug);
        // Legacy tests and existing jobs are not S05 candidates. They must
        // not depend on the new READY IndexedDB ledger, nor gain authority
        // from its absence. The S05 path always has canonical getJobFull.
        if(sealed?.ok&&sealed.job?.readyIdentifier){
          const current=await createReadyStore(db).get(p.slug);
          const authorized=authorizeReadyAiAdvance(sealed.job,current);
          if(!authorized.ok)return authorized;
          // An earlier local READY observation is not permanent Git authority.
          // For every effectful new AI action, independently re-read coherent
          // current main through S03's protected persistent Git vault. No
          // model text, UI token, or cached candidate can self-certify this.
          if(['BEGIN_NATIVE','RUN_TESTS','VERIFY_FRESH_CHAT2'].includes(message.type)){
            const settings=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
            if(settings?.repository!=='Neb963/per-gens'||
               settings.repositoryId!==current.record.repositoryId)
              return fail('S05_AI_GIT_ASSOCIATION_CHANGED');
            const credential=(await api.runtime.sendNativeMessage(
              'local.pcms.backup_vault',{action:'git.get',
                repositoryId:settings.repositoryId}))?.credential;
            if(typeof credential!=='string'||credential.length<12||
               credential.length>512||/[^\x21-\x7e]/.test(credential))
              return fail('S05_AI_GIT_VAULT_UNAVAILABLE');
            const catalog=await scanCatalog({repository:settings.repository,token:credential});
            if(!catalog?.ok||!catalog.complete)
              return fail('S05_AI_GIT_MAIN_UNAVAILABLE');
            const coherent=await inspectReady({repository:settings.repository,
              token:credential,slug:p.slug,pinnedHead:catalog.head,
              includeSourceBytes:false});
            const fresh=authorizeGitReadyAiAdvance(sealed.job,catalog,coherent,{
              repositoryId:settings.repositoryId,slug:p.slug});
            if(!fresh.ok)return fresh;
          }
        }
      }
      if(message.type==='SET_CONCURRENCY')
        return store.changeConcurrency(p.expectedRevision,p.perAccount);
      if(message.type==='SET_PROMPT')
        return store.changePrompt({text:p.text,tests:p.tests},p.expectedRevision);
      if(message.type==='IMPORT_PROMPT')
        return store.changePrompt(p.envelope,p.expectedRevision,true);
      if(message.type==='ADVANCE_JOB'){
        // Exactly one policy-selected step per call. Never spin across a
        // potentially external effect, and never silently retry a lost ACK.
        const sealed=await store.getJobFull(p.slug);
        if(!sealed.ok)return sealed;
        if(sealed.job.revision!==p.expectedRevision)return fail('STALE_REVISION');
        const next=planAiStep(sealed.job,{oracleNames:AI_BROWSER_ASSERTIONS});
        if(!next.ok)return fail(next.code);
        const result=await executeTrusted({type:next.type,params:{
          slug:p.slug,expectedRevision:p.expectedRevision,
          ...(next.step?{step:next.step}:{})
        }});
        return {...result,plannedStep:next.type+(next.step?'_'+next.step:'')};
      }
      if(['BEGIN_NATIVE','PROBE_NATIVE','RUN_TESTS','INSPECT_WORKSPACE','VERIFY_FRESH_CHAT2'].includes(message.type)){
        const sealed=await store.getJobFull(p.slug);
        if(!sealed.ok)return sealed;
        const job=sealed.job;
        if(job.revision!==p.expectedRevision)return fail('STALE_REVISION');
        const stage=await stageFactory(db).getFull(p.slug);
        if(!stage.ok||stage.record.state!=='SOURCE_VERIFIED'||
           stage.record.revision!==job.stageRevision)return fail('AI_STAGE_CONTEXT_CHANGED');
        const r=stage.record,g=guard();
        if(!g?.runNativeAiStep||!g?.getSafeRouteReadiness)
          return fail('NATIVE_AI_GUARD_UNAVAILABLE');
        const route=await g.getSafeRouteReadiness(r.personaUid);
        if(!route?.ready)return fail(route?.code||'ROUTE_UNVERIFIED');
        if(message.type==='INSPECT_WORKSPACE'){
          // A local OPFS read is only a diagnostic; no server end ACK or
          // tools-worker workspace namespace proof is available.
          if(job.native?.state!=='CHAT2_OBSERVED_IDLE'||
             job.chat2?.state!=='FRESH_OBSERVED'||
             !job.chat2.sessionDigest||job.chat2.sessionDigest===job.chat1.sessionDigest)
            return fail('AI_CHAT2_SESSION_UNVERIFIED');
          const before=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE'
          });
          if(!before?.ok||before.busy||
             before.sessionDigest!==job.chat2.sessionDigest)
            return fail('AI_WORKSPACE_SESSION_CHANGED');
          const inspected=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE_OPFS'
          });
          const after=await g.getSafeRouteReadiness(r.personaUid);
          if(!after?.ready||after.cookieStoreId!==route.cookieStoreId||
             after.routeId!==route.routeId||(await sentinel.inspect()).held)
            return fail('AI_WORKSPACE_ROUTE_CHANGED');
          const again=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE'
          });
          if(!again?.ok||again.busy||again.sessionDigest!==before.sessionDigest)
            return fail('AI_WORKSPACE_CONTEXT_CHANGED');
          if(!inspected?.ok||inspected.sessionDigest!==before.sessionDigest||
             inspected.slug!==r.slug||
             inspected.isolation!=='UNVERIFIED'||
             inspected.serverEndAck!=='UNOBSERVED')
            return fail(inspected?.code||'AI_LOCAL_WORKSPACE_UNVERIFIED');
          return {ok:true,code:'OPFS_LOCAL_ONLY_SERVER_UNVERIFIED',
            localOpfsAccessible:inspected.localOpfsAccessible===true,
            attachmentState:inspected.attachmentState,
            workspaceRootState:inspected.workspaceRootState,
            workerNamespace:[
              'CURRENT_SESSION_WORKER_INIT_LOCK','STALE_PREVIOUS_SESSION_LOCK'
            ].includes(inspected.workerNamespace)?
              inspected.workerNamespace:'UNVERIFIED',
            isolation:'UNVERIFIED',serverEndAck:'UNOBSERVED',
            sourceFingerprint:job.sourceFingerprint,
            tests:'AI_CHAT2_ISOLATION_UNVERIFIED'};
        }
        if(message.type==='VERIFY_FRESH_CHAT2'){
          // A deliberate read-only server history request is still a live
          // provider observation. It is separately gated OFF by default;
          // a green PR or background alarm must never activate it.
          if(effectGate({phase:'I10',job,stage:r,step:'READ_ONLY_HISTORY'})!==true)
            return fail('AI_SERVER_HISTORY_ACTIVATION_HELD');
          if(job.native?.state!=='CHAT2_OBSERVED_IDLE'||
             job.chat2?.state!=='FRESH_OBSERVED'||
             !job.chat2.sessionDigest||!job.optionalTesting?.text||
             job.chat2.sessionDigest===job.chat1.sessionDigest||
             !job.finalSource||job.finalSource.fingerprint!==job.sourceFingerprint)
            return fail('AI_CHAT2_SESSION_UNVERIFIED');
          const before=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
          if(!before?.ok||before.busy!==false||
             before.sessionDigest!==job.chat2.sessionDigest||
             before.editorClean!==true||before.sourceSaved!==true||
             before.hasQueue!==false||before.inputOccupied!==false||
             before.attachmentsPending!==false)
            return fail('AI_CHAT2_CONTEXT_UNVERIFIED');
          const workspace=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE_OPFS'});
          // A missing or inaccessible namespace is NOT a negative assertion
          // of isolation: hold rather than searching/recreating directories.
          if(!workspace?.ok||
             workspace.workspaceRootState!=='PRESENT_UNTRUSTED'||
             workspace.sessionDigest!==before.sessionDigest||
             workspace.isolation!=='UNVERIFIED')
            return fail('AI_CHAT2_WORKSPACE_UNVERIFIED');
          if(workspace.workerNamespace==='STALE_PREVIOUS_SESSION_LOCK')
            return fail('AI_CHAT2_PREVIOUS_WORKER_LOCK_RELOAD_REQUIRED');
          if(workspace.workerNamespace!=='CURRENT_SESSION_WORKER_INIT_LOCK')
            return fail('AI_CHAT2_WORKER_UNVERIFIED');
          const history=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE_HISTORY',
            firstPrompt:job.optionalTesting.text});
          if(!history?.ok||history.sessionDigest!==before.sessionDigest||
             history.serverHistory!=='FIRST_USER_IS_T1')
            return fail(history?.code||'AI_CHAT2_SERVER_HISTORY_UNVERIFIED');
          const afterRoute=await g.getSafeRouteReadiness(r.personaUid);
          const after=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
          const stageNow=await stageFactory(db).getFull(p.slug);
          const editor=await g.inspectStageEditor?.(r.personaUid,r.slug,r.nonce);
          if(!afterRoute?.ready||
             afterRoute.cookieStoreId!==route.cookieStoreId||
             afterRoute.routeId!==route.routeId||
             !after?.ok||after.busy!==false||
             after.sessionDigest!==before.sessionDigest||
             after.editorClean!==true||after.sourceSaved!==true||
             after.hasQueue!==false||after.inputOccupied!==false||
             after.attachmentsPending!==false||
             !stageNow?.ok||stageNow.record.state!=='SOURCE_VERIFIED'||
             stageNow.record.revision!==r.revision||
             stageNow.record.nonce!==r.nonce||
             editor?.ok!==true||editor.clean!==true||
             (await sentinel.inspect()).held)
            return fail('AI_CHAT2_CONTEXT_CHANGED_DURING_HISTORY');
          return store.verifySecondChat(p.slug,p.expectedRevision,history,workspace);
        }
        if(message.type==='RUN_TESTS'){
          // No UI/model-supplied assertion source, result, test ID, frame,
          // run timestamp or claimed session: the guarded browser supplies it.
          if(!job.finalSource||job.finalSource.fingerprint!==job.sourceFingerprint||
             !['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.native?.state))
            return fail('EXACT_SAVED_FINAL_SOURCE_REQUIRED');
          const firstMissing=job.prompt.tests.some(name=>
            job.chat1.tests?.[name]?.result!=='PASS'||
            job.chat1.tests?.[name]?.sourceFingerprint!==job.sourceFingerprint);
          // Chat 2 edits must invalidate both suites. Re-run pinned Chat 1
          // assertions on final F even while the *native* helper remains
          // attached to Chat 2; execution oracle is browser-owned, not chat.
          const chat=firstMissing?1:2;
          if(chat===2&&(!job.chat2||job.chat2.state!=='FRESH_VERIFIED'))
            return fail('CHAT2_SESSION_NOT_READY');
          if(chat===2&&job.chat2?.state!=='FRESH_VERIFIED')
            return fail('AI_CHAT2_ISOLATION_UNVERIFIED');
          const needed=chat===1?job.prompt.tests:job.optionalTesting?.tests;
          const pending=(needed||[]).filter(name=>
            (chat===1?job.chat1:job.chat2).tests?.[name]?.result!=='PASS'||
            (chat===1?job.chat1:job.chat2).tests?.[name]?.sourceFingerprint!==job.sourceFingerprint);
          // Unknown tests remain unverified; never silently count a smoke
          // result as a different named or natural-language requirement.
          const assertion=pending.find(name=>AI_BROWSER_ASSERTIONS.includes(name)||
            supportedDeclarativeAssertion(name));
          if(!assertion)return fail('UNSUPPORTED_INDEPENDENT_ASSERTION');
          const before=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE'
          });
          if(!before?.ok||before.busy||before.editorClean!==true||
             before.sourceSaved!==true||
             before.sessionDigest!==(job.native.state==='CHAT2_OBSERVED_IDLE'?
               job.chat2:job.chat1)?.sessionDigest)
            return fail('AI_NATIVE_TEST_SESSION_UNVERIFIED');
          const result=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'ORACLE_SMOKE',name:assertion
          });
          if(result?.ok!==true||
             result.source!=='INDEPENDENT_BROWSER_ASSERTION'||
             result.name!==assertion||
             !['PASS','FAIL'].includes(result.result)||
             !Number.isSafeInteger(result.observedAt)||result.observedAt<1)
            return fail(result?.code||'INDEPENDENT_TEST_UNAVAILABLE');
          const after=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,action:'OBSERVE'
          });
          if(!after?.ok||after.busy||after.editorClean!==true||
             after.sourceSaved!==true||
             after.sessionDigest!==before.sessionDigest||
             (await sentinel.inspect()).held)
            return fail('AI_TEST_CONTEXT_CHANGED');
          const owner=await g.observeReadOnly(r.personaUid,false,r.slug);
          if(owner?.ok!==true||owner.principalFingerprint!==r.principalFingerprint||
             owner.original?.remotePublicId!==r.remotePublicId||
             owner.original?.ownerResult!=='IS_OWNER'||
             owner.original?.visibility!=='UNLISTED'||
             typeof owner.original?.pjs!=='string'||
             typeof owner.original?.html!=='string'||
             !Array.isArray(owner.original?.assets))
            return fail('AI_TEST_OWNER_OR_SOURCE_UNVERIFIED');
          const now=await exactSource([
            {path:'main.pjs',base64:encodeUtf8(owner.original.pjs)},
            {path:'index.html',base64:encodeUtf8(owner.original.html)},
            ...owner.original.assets
          ]);
          if(!now.ok||now.fingerprint!==job.sourceFingerprint)
            return fail('AI_TEST_SOURCE_CHANGED');
          const still=await g.getSafeRouteReadiness(r.personaUid);
          if(!still?.ready||still.cookieStoreId!==route.cookieStoreId||
             still.routeId!==route.routeId)
            return fail('AI_TEST_ROUTE_CHANGED');
          const stageStill=await stageFactory(db).getFull(p.slug);
          if(!stageStill?.ok||stageStill.record.state!=='SOURCE_VERIFIED'||
             stageStill.record.revision!==r.revision||
             stageStill.record.nonce!==r.nonce)
            return fail('AI_TEST_STAGE_CHANGED');
          return store.record(p.slug,p.expectedRevision,{
            type:'TEST',chat,name:assertion,
            sourceFingerprint:now.fingerprint,
            independentSource:'INDEPENDENT_BROWSER_ASSERTION',
            result:result.result,observedAt:result.observedAt
          });
        }
        if(message.type==='BEGIN_NATIVE'){
          // Live native provider AI action is NEVER enabled by a green CI.
          if(effectGate({phase:'I10',job,stage:r,step:p.step})!==true)
            return fail('AI_PROVIDER_ACTIVATION_HELD');
          // Do not admit new AI work over human-owned or dirty source.
          const clean=await g.inspectStageEditor?.(r.personaUid,r.slug,r.nonce);
          if(clean?.ok!==true||clean.clean!==true)return fail('EDITOR_UNKNOWN');
          const isRepair=p.step==='CHAT1_REPAIR'||p.step==='CHAT2_REPAIR';
          const text=p.step==='CHAT1_SEND'?job.prompt.text:
            p.step==='CHAT2_SEND'?job.optionalTesting?.text:isRepair?
            'A separate browser assertion previously observed a real failing required test. Re-examine the current generator-owned code and src files, make a bounded corrective change, save and run the tests again. Do not declare PASS without an independent browser observation. If no safe progress is possible, report a blocker.':null;
          if(['CHAT1_SEND','CHAT2_SEND','CHAT1_REPAIR','CHAT2_REPAIR'].includes(p.step)&&
             (typeof text!=='string'||!text.trim()))return fail('AI_PROMPT_UNVERIFIED');
          if((await sentinel.inspect()).held||effectGate({phase:'I10',job,stage:r,step:p.step})!==true)
            return fail('AI_PROVIDER_ACTIVATION_HELD');
          // Commit DISPATCH_POSSIBLE before ANY possible remote AI effect;
          // a lost page acknowledgment cannot be replayed.
          const armed=await store.armNative(p.slug,p.expectedRevision,p.step);
          if(!armed.ok)return armed;
          if(effectGate({phase:'I10',job,stage:r,step:p.step})!==true ||
             (await sentinel.inspect()).held)
            return fail('AI_ACTIVATION_REVOKED_AFTER_MARKER');
          const after=await g.getSafeRouteReadiness(r.personaUid);
          if(!after?.ready||after.cookieStoreId!==route.cookieStoreId||
             after.routeId!==route.routeId)
            return fail('AI_DISPATCH_GUARD_CHANGED_RECONCILE');
          let observed;
          try{observed=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,
            action:p.step.endsWith('SEND')||p.step.endsWith('REPAIR')?'SEND':
              p.step==='CHAT2_RESET'?'NEW_CHAT':'STOP',
            ...(text?{text}:{}),
            chat:p.step.startsWith('CHAT2')?2:1,
            ...(isRepair?{repair:true,
              expectedSessionDigest:p.step==='CHAT1_REPAIR'?
                job.chat1.sessionDigest:job.chat2.sessionDigest}:{})
          });}catch{}
          // All outcomes are uncertain until a distinct read-only OBSERVE.
          return {ok:false,code:'AI_DISPATCH_POSSIBLE_RECONCILE',
            receipt:armed.state,
            attempt:observed?.code||'NATIVE_AI_ACK_UNKNOWN'};
        }
        const observation=await g.runNativeAiStep(r.personaUid,{
          slug:r.slug,nonce:r.nonce,action:'OBSERVE'
        });
        const after=await g.getSafeRouteReadiness(r.personaUid);
        if(!after?.ready||after.cookieStoreId!==route.cookieStoreId||
           after.routeId!==route.routeId||(await sentinel.inspect()).held)
          return fail('AI_OBSERVATION_GUARD_CHANGED');
        if(!observation?.ok)return fail(observation?.code||'AI_NATIVE_UNVERIFIED');
        // External UI observations never prove test outcomes. The canonical
        // store retains only hashed native session identity and busy status.
        let reconciled;
        if(['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.native?.state)){
          // A previous idle probe may have seen an in-flight save. Subsequent
          // read-only probes must be possible without marking a new effect,
          // replaying the send or discarding previously proven test evidence.
          if(observation.busy||!observation.sessionDigest||
             observation.sessionDigest!==job.native.sessionDigest)
            return fail('AI_IDLE_RECHECK_SESSION_CHANGED');
          reconciled={ok:true,revision:job.revision};
        }else {
          reconciled=await store.observeNative(p.slug,p.expectedRevision,observation);
          if(!reconciled.ok)return reconciled;
        }
        if(observation.busy||!['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(
          (await store.getJobFull(p.slug)).job?.native?.state))
          return {...reconciled,tests:'NATIVE_BUSY_OR_ORACLE_REQUIRED'};
        if(observation.sourceSaved!==true||observation.editorClean!==true)
          return fail('AI_NATIVE_SOURCE_UNSAVED');
        const live=await g.observeReadOnly(r.personaUid,false,r.slug);
        if(live?.ok!==true||live.principalFingerprint!==r.principalFingerprint||
           live.original?.remotePublicId!==r.remotePublicId||
           live.original?.ownerResult!=='IS_OWNER'||
           live.original?.visibility!=='UNLISTED')
          return fail('AI_SOURCE_OWNER_UNVERIFIED');
        const original=live.original;
        if(typeof original.pjs!=='string'||typeof original.html!=='string'||
           !Array.isArray(original.assets))return fail('AI_SOURCE_BYTES_UNVERIFIED');
        const snapshot=await exactSource([
          {path:'main.pjs',base64:encodeUtf8(original.pjs)},
          {path:'index.html',base64:encodeUtf8(original.html)},
          ...original.assets
        ]);
        if(!snapshot.ok)return fail(snapshot.code||'AI_SOURCE_BYTES_UNVERIFIED');
        const editor=await g.inspectStageEditor?.(r.personaUid,r.slug,r.nonce);
        if(editor?.ok!==true||editor.clean!==true||(await sentinel.inspect()).held)
          return fail('AI_EDITOR_CHANGED_AFTER_READBACK');
        const afterSource=await g.getSafeRouteReadiness(r.personaUid);
        if(!afterSource?.ready||afterSource.cookieStoreId!==route.cookieStoreId||
           afterSource.routeId!==route.routeId)return fail('AI_POST_SOURCE_GUARD_CHANGED');
        // A full source readback may take seconds. An AI edit, human draft,
        // resume or changed native session during that interval invalidates
        // the initial idle observation; source F must not be checkpointed
        // against a stale conversation snapshot.
        const finalNative=await g.runNativeAiStep(r.personaUid,{
          slug:r.slug,nonce:r.nonce,action:'OBSERVE'
        });
        if(!finalNative?.ok||finalNative.busy!==false||
           finalNative.sessionDigest!==observation.sessionDigest||
           finalNative.sourceSaved!==true||finalNative.editorClean!==true||
           finalNative.inputOccupied!==false||
           finalNative.attachmentsPending!==false||
           finalNative.hasQueue!==false||(await sentinel.inspect()).held)
          return fail('AI_NATIVE_CHANGED_DURING_SOURCE_READBACK');
        // Stage identity also belongs to the source fence: a concurrent
        // human handoff or restage must not certify the previous owner.
        const stageNow=await stageFactory(db).getFull(p.slug);
        if(!stageNow?.ok||stageNow.record.revision!==r.revision||
           stageNow.record.state!=='SOURCE_VERIFIED'||
           stageNow.record.nonce!==r.nonce)
          return fail('AI_STAGE_CHANGED_DURING_SOURCE_READBACK');
        const checkpoint=await store.checkpointSource(p.slug,reconciled.revision,snapshot);
        return checkpoint.ok?{...checkpoint,tests:'INDEPENDENT_ORACLE_REQUIRED',
          source:'GUARDED_FULL_SOURCE_BYTES'}:checkpoint;
      }
      // Preparation only: no helper send, remote save, tab creation or test success.
      const stage=await stageFactory(db).getFull(p.slug);
      if(!stage.ok)return stage;
      const r=stage.record;
      if(r.state!=='SOURCE_VERIFIED'||r.revision!==p.expectedStageRevision||
         !r.verifiedAt)return fail('STAGE_RECONCILIATION_REQUIRED');
      const g=guard();
      if(!g?.getSafeRouteReadiness||!g?.inspectStageEditor||
         !g?.observeReadOnly)return fail('DONOR_GUARD_UNAVAILABLE');
      const before=await g.getSafeRouteReadiness(r.personaUid);
      if(!before?.ready)return fail(before?.code||'PROTECTED_ROUTE_UNVERIFIED');
      const editor=await g.inspectStageEditor(r.personaUid,r.slug,r.nonce);
      if(editor?.ok!==true||editor.clean!==true)return fail('EDITOR_UNKNOWN');
      let fresh,promptOverride=null;
      if(r.readyIdentifier){
        // S05 is Git-owned, not the inherited local Settings Chat 1 prompt.
        // The connected repository identity and OS-native vault control reads;
        // a UI token or source payload is never authority for this candidate.
        const config=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
        const queued=await createReadyStore(db).get(r.slug);
        if(!queued.ok||queued.record?.desired||
           queued.record?.hold==='READY_REVOKED_NOT_READY'||
           queued.record?.active?.identifier!==r.readyIdentifier||
           queued.record?.active?.inputFingerprint!==r.readyInputFingerprint||
           queued.record?.repositoryId!==config?.repositoryId||
           r.sourceFolder!=='generators/'+r.slug)
          return fail('S05_READY_ASSOCIATION_CHANGED');
        const vault=await api.runtime.sendNativeMessage(
          'local.pcms.backup_vault',{action:'git.get',repositoryId:config.repositoryId});
        const credential=vault?.credential;
        if(vault?.ok!==true||typeof credential!=='string'||
           credential.length<12||credential.length>512||
           /[^\x21-\x7e]/.test(credential))
          return fail('GIT_VAULT_UNAVAILABLE');
        const catalog=await scanCatalog({repository:config.repository,token:credential});
        if(!catalog?.ok||!catalog.complete||
           catalog.repositoryId!==config.repositoryId)
          return fail('S05_MAIN_CATALOG_UNVERIFIED');
        const coherent=await inspectReady({
          repository:config.repository,token:credential,slug:r.slug,
          pinnedHead:catalog.head,includeTestingText:true});
        const identity=coherent?.legacy?
          'legacy-'+coherent.declarationCommit+'-'+coherent.markerOid:
          'rev-'+coherent?.token;
        if(!coherent?.ok||coherent.code!=='READY_COHERENT_INPUT_PINNED'||
           identity!==r.readyIdentifier||
           coherent.inputFingerprint!==r.readyInputFingerprint)
          return fail('S05_READY_REVISED_OR_REVOKED');
        const local=await store.getPrompt();
        if(!local.ok)return local;
        const git=pinGitChatPrompt(catalog,local.current,{
          repository:config.repository,repositoryId:config.repositoryId});
        if(!git.ok)return git;
        promptOverride=git.prompt;
        fresh={ok:true,ready:true,fingerprint:r.gitFingerprint,
          testingSha:coherent.optionalTesting?.sha256||null,
          testingText:coherent.optionalTesting?.text||null};
      }else{
        fresh=await inspect({folder:r.sourceFolder,token:p.token,includeTestingBytes:true});
      }
      if(!fresh?.ok||!fresh.ready||fresh.fingerprint!==r.gitFingerprint||
         fresh.testingSha!==r.testingSha)return fail('READY_OR_TESTING_CHANGED');
      if(fresh.testingSha && (typeof fresh.testingText!=='string'||!fresh.testingText.trim()))
        return fail('TESTING_INPUT_UNVERIFIED');
      const current=await g.observeReadOnly(r.personaUid,false,r.slug);
      if(current?.ok!==true||current.principalFingerprint!==r.principalFingerprint||
         current?.original?.remotePublicId!==r.remotePublicId||
         current?.original?.ownerResult!=='IS_OWNER'||
         current?.original?.visibility!=='UNLISTED')
        return fail('REMOTE_OWNER_UNVERIFIED');
      // I09's previous good receipt does not prove the source is still saved
      // unchanged. Repeat the independent full PJS/HTML/src byte-readback.
      const original=current.original;
      const observed={ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
        slug:r.slug,accountId:r.accountId,personaUid:r.personaUid,
        principalFingerprint:current.principalFingerprint,
        remotePublicId:original.remotePublicId,ownerResult:original.ownerResult,
        visibility:original.visibility,pjs:original.pjs,html:original.html,
        assets:original.assets};
      const proof=await verifyReadback(r.candidate,observed,{
        slug:r.slug,accountId:r.accountId,personaUid:r.personaUid,
        principalFingerprint:r.principalFingerprint,remotePublicId:r.remotePublicId
      });
      if(!proof.ok)return fail(proof.code||'SOURCE_DRIFT');
      // Saved source already has a separate I09 full-byte proof. Its local
      // stage revision and owner must remain stable for I10 job admission.
      const restaged=await stageFactory(db).getFull(p.slug);
      if(!restaged.ok||restaged.record.revision!==r.revision||
         restaged.record.state!=='SOURCE_VERIFIED')
        return fail('STAGE_CHANGED');
      const after=await g.getSafeRouteReadiness(r.personaUid);
      if(!after?.ready||after.cookieStoreId!==before.cookieStoreId||
         after.routeId!==before.routeId||(await sentinel.inspect()).held)
        return fail('GUARD_CHANGED');
      const testPlan=fresh.testingSha?pinTestingAssertions(fresh.testingText):null;
      if(testPlan&&!testPlan.ok)return fail(testPlan.code);
      const testing=fresh.testingSha?{
        sha256:fresh.testingSha,text:fresh.testingText,tests:testPlan.tests
      }:null;
      const result=await store.start(r,testing,promptOverride);
      if(!result.ok)return result;
      return {...result,help:r.readyIdentifier?
        'S05 job prepared with Git-main Chat 1 and pinned optional tests; live effects separately gated.':
        'Legacy job prepared with pinned Settings prompt and optional tests; live effects separately gated.'};
    }catch{return fail('AI_CANONICAL_HOLD');}
  }
  async function run(message,sender){
    const auth=validateAiMessage(api,sender,message);
    return auth.ok?executeTrusted(message):auth;
  }
  // An alarm processes at most ONE bounded step per wake. It is disabled
  // unless a separate operator capability gate affirmatively authorizes
  // background native AI work; green CI never enables it. Cold wake and
  // lost ACK can only move into read-only observation, never blind replay.
  async function tick(){
    if(tickBusy)return fail('AI_TICK_BUSY');
    if(effectGate({phase:'I10',step:'AUTOMATION'})!==true)
      return fail('AI_PROVIDER_ACTIVATION_HELD');
    tickBusy=true;
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const store=storeFactory(await database());
      // Read every canonical job page before choosing global oldest eligible.
      // An omitted 201st job is not an empty queue or permission to starve it.
      const all=[],seen=new Set();
      let after='',finished=false;
      for(let page=0;page<64;page++){
        const listing=await store.list({after,limit:200});
        if(!listing?.ok||!Array.isArray(listing.jobs))
          return fail('AI_SCHEDULER_LIST_UNVERIFIED');
        for(const row of listing.jobs){
          if(typeof row.slug!=='string'||seen.has(row.slug)||row.slug<=after)
            return fail('AI_SCHEDULER_CURSOR_UNVERIFIED');
          seen.add(row.slug);
          const exact=await store.getJobFull(row.slug);
          if(!exact.ok)return fail('AI_SCHEDULER_JOB_UNKNOWN');
          all.push(exact.job);
        }
        if(!listing.more&&!listing.truncated){finished=true;break;}
        if(!listing.nextCursor||listing.nextCursor<=after||
           !seen.has(listing.nextCursor))
          return fail('AI_SCHEDULER_CURSOR_UNVERIFIED');
        after=listing.nextCursor;
      }
      if(!finished)return fail('AI_SCHEDULER_FLEET_BOUND_UNVERIFIED');
      const now=clock();
      if(!Number.isSafeInteger(now)||now<1)
        return fail('AI_SCHEDULER_CLOCK_UNVERIFIED');
      all.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||
        a.slug.localeCompare(b.slug,'en'));
      for(const job of all){
        // Deferred jobs are *not eligible* until their bounded independent
        // recheck window; a dead protected route must not starve a different
        // healthy account every wake. Durable across event-page suspension.
        if((job.schedulerDeferredUntil||0)>now)continue;
        const next=planAiStep(job,{oracleNames:AI_BROWSER_ASSERTIONS});
        if(!next.ok)continue;
        // One attempted guarded step per wake, never simultaneous provider
        // operations or a retry of DISPATCH_POSSIBLE.
        const outcome=await executeTrusted({type:'ADVANCE_JOB',params:{
          slug:job.slug,expectedRevision:job.revision
        }});
        if(outcome?.ok===false){
          // The operation may have advanced the journal before failing.
          // Re-read revision, never overwriting a concurrent human edit.
          const current=await store.getJobFull(job.slug);
          if(current?.ok){
            const code='AI_WAKE_'+String(outcome.code||'UNKNOWN')
              .replace(/[^A-Z0-9_]/g,'_').slice(0,55);
            const deferred=await store.deferScheduler(
              job.slug,current.job.revision,now+120000,code);
            if(!deferred?.ok&&deferred?.code!=='STALE_REVISION')
              return fail('AI_SCHEDULER_DEFER_UNVERIFIED');
          }
        }
        return outcome;
      }
      return {ok:true,code:'AI_NO_ELIGIBLE_WORK'};
    }catch{return fail('AI_TICK_UNVERIFIED');}
    finally{tickBusy=false;}
  }
  function schedule(){
    if(effectGate({phase:'I10',step:'AUTOMATION'})!==true)return;
    try{api.alarms.create(AI_PROGRESS_ALARM,{periodInMinutes:1});}catch{}
  }
  function register(){
    // Interrupted dispatch remains a hold. This never re-sends AI messages.
    Promise.resolve().then(async()=>{
      if(!(await sentinel.inspect()).held)
        await storeFactory(await database()).recoverNative();
    }).catch(()=>{});
    // Background operation remains extension-owned, not tied to a PCMS tab.
    // Firefox alarms are volatile across full process restarts.
    if(api.alarms?.onAlarm){
      api.alarms.onAlarm.addListener(alarm=>{
        if(alarm?.name===AI_PROGRESS_ALARM)void tick();
      });
      api.runtime.onStartup.addListener(schedule);
      api.runtime.onInstalled.addListener(schedule);
      schedule();
    }
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==AI_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(msg,port.sender))
          .then(v=>{try{port.postMessage(v);}catch{}})
          .catch(()=>{try{port.postMessage(fail('AI_CANONICAL_HOLD'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run,tick});
}
if(typeof browser!=='undefined')createAiBoundary(browser).register();
