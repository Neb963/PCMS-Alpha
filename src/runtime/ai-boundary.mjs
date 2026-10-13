// I10 settings and read-only AI-job preparation. Untrusted UI never supplies
// test evidence, native sessions, page code, helper credentials or Git writes.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {inspectGitSource} from './git-source.mjs';
export const AI_PORT='pcms-i10-ai';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const ACT=new Set(['GET_PROMPTS','SET_PROMPT','IMPORT_PROMPT','EXPORT_PROMPTS',
  'LIST_JOBS','GET_JOB','PREPARE_JOB']);
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
    message.type==='SET_PROMPT'?['text','tests','expectedRevision']:
    message.type==='IMPORT_PROMPT'?['envelope','expectedRevision']:[];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(['GET_JOB','PREPARE_JOB'].includes(message.type)&&!SLUG.test(p.slug||''))
    return fail('INVALID_SLUG');
  if(message.type==='PREPARE_JOB'&&
     (!Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
      typeof p.token!=='string'||p.token.length<10||p.token.length>512))
    return fail('INVALID_PARAMS');
  if(['SET_PROMPT','IMPORT_PROMPT'].includes(message.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createAiBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  storeFactory=createAiStore,stageFactory=createStagingStore,
  inspect=inspectGitSource
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
