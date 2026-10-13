// I10 settings and read-only AI-job preparation. Untrusted UI never supplies
// test evidence, native sessions, page code, helper credentials or Git writes.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {inspectGitSource} from './git-source.mjs';
import {verifyReadback} from './staging-core.mjs';
export const AI_PORT='pcms-i10-ai';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const ACT=new Set(['GET_PROMPTS','SET_PROMPT','IMPORT_PROMPT','EXPORT_PROMPTS',
  'LIST_JOBS','GET_JOB','PREPARE_JOB','BEGIN_NATIVE','PROBE_NATIVE']);
export function validateAiMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;
  try{json=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!message||typeof message!=='object'||Array.isArray(message)||
     Object.keys(message).some(k=>!['type','params'].includes(k))||
     !ACT.has(message.type)||!json||json.length>38000)return fail('INVALID_MESSAGE');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='GET_JOB'?['slug']:
    message.type==='PREPARE_JOB'?['slug','expectedStageRevision','token']:
    message.type==='BEGIN_NATIVE'?['slug','expectedRevision','step']:
    message.type==='PROBE_NATIVE'?['slug','expectedRevision']:
    message.type==='SET_PROMPT'?['text','tests','expectedRevision']:
    message.type==='IMPORT_PROMPT'?['envelope','expectedRevision']:[];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(['GET_JOB','PREPARE_JOB','BEGIN_NATIVE','PROBE_NATIVE'].includes(message.type)&&!SLUG.test(p.slug||''))
    return fail('INVALID_SLUG');
  if(message.type==='PREPARE_JOB'&&
     (!Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
      typeof p.token!=='string'||p.token.length<10||p.token.length>512))
    return fail('INVALID_PARAMS');
  if(['BEGIN_NATIVE','PROBE_NATIVE'].includes(message.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1||
      (message.type==='BEGIN_NATIVE'&&
       !['CHAT1_SEND','CHAT2_RESET','CHAT2_SEND','STOP'].includes(p.step))))
    return fail('INVALID_PARAMS');
  if(['SET_PROMPT','IMPORT_PROMPT'].includes(message.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createAiBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  storeFactory=createAiStore,stageFactory=createStagingStore,
  inspect=inspectGitSource,effectGate=()=>false
}={}){
  let databasePromise;
  const database=()=>databasePromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  async function run(message,sender){
    const auth=validateAiMessage(api,sender,message);
    if(!auth.ok)return auth;
    try{
      const db=await database(),store=storeFactory(db),p=message.params||{};
      if(message.type==='GET_PROMPTS')return store.getPrompt();
      if(message.type==='EXPORT_PROMPTS'){
        const history=await store.getPrompt();
        return history.ok?store.exportPrompt(history.history):history;
      }
      if(message.type==='LIST_JOBS')return store.list();
      if(message.type==='GET_JOB')return store.getJob(p.slug);
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(message.type==='SET_PROMPT')
        return store.changePrompt({text:p.text,tests:p.tests},p.expectedRevision);
      if(message.type==='IMPORT_PROMPT')
        return store.changePrompt(p.envelope,p.expectedRevision,true);
      if(['BEGIN_NATIVE','PROBE_NATIVE'].includes(message.type)){
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
        if(message.type==='BEGIN_NATIVE'){
          // Live native provider AI action is NEVER enabled by a green CI.
          if(effectGate({phase:'I10',job,stage:r,step:p.step})!==true)
            return fail('AI_PROVIDER_ACTIVATION_HELD');
          // Do not admit new AI work over human-owned or dirty source.
          const clean=await g.inspectStageEditor?.(r.personaUid,r.slug,r.nonce);
          if(clean?.ok!==true||clean.clean!==true)return fail('EDITOR_UNKNOWN');
          const text=p.step==='CHAT1_SEND'?job.prompt.text:
            p.step==='CHAT2_SEND'?job.optionalTesting?.text:null;
          if(['CHAT1_SEND','CHAT2_SEND'].includes(p.step)&&
             (typeof text!=='string'||!text.trim()))return fail('AI_PROMPT_UNVERIFIED');
          if((await sentinel.inspect()).held||effectGate({phase:'I10',job,stage:r,step:p.step})!==true)
            return fail('AI_PROVIDER_ACTIVATION_HELD');
          // Commit DISPATCH_POSSIBLE before ANY possible remote AI effect;
          // a lost page acknowledgment cannot be replayed.
          const armed=await store.armNative(p.slug,p.expectedRevision,p.step);
          if(!armed.ok)return armed;
          const after=await g.getSafeRouteReadiness(r.personaUid);
          if(!after?.ready||after.cookieStoreId!==route.cookieStoreId||
             after.routeId!==route.routeId)
            return fail('AI_DISPATCH_GUARD_CHANGED_RECONCILE');
          let observed;
          try{observed=await g.runNativeAiStep(r.personaUid,{
            slug:r.slug,nonce:r.nonce,
            action:p.step.endsWith('SEND')?'SEND':
              p.step==='CHAT2_RESET'?'NEW_CHAT':'STOP',
            ...(text?{text}:{}),
            chat:p.step==='CHAT2_SEND'?2:1
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
        const reconciled=await store.observeNative(p.slug,p.expectedRevision,observation);
        return reconciled.ok?{...reconciled,tests:'INDEPENDENT_ORACLE_REQUIRED'}:reconciled;
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
      const fresh=await inspect({folder:r.sourceFolder,token:p.token,includeTestingBytes:true});
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
      const testing=fresh.testingSha?{
        sha256:fresh.testingSha,text:fresh.testingText,tests:['optional_generator_tests']
      }:null;
      const result=await store.start(r,testing);
      if(!result.ok)return result;
      return {...result,help:'Job prepared with pinned Settings prompt and TESTING.md; native AI dispatch and independent test evidence remain held.'};
    }catch{return fail('AI_CANONICAL_HOLD');}
  }
  function register(){
    // Interrupted dispatch remains a hold. This never re-sends AI messages.
    Promise.resolve().then(async()=>{
      if(!(await sentinel.inspect()).held)
        await storeFactory(await database()).recoverNative();
    }).catch(()=>{});
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
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createAiBoundary(browser).register();
