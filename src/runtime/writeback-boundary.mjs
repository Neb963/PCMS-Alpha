// I11 privileged Git writeback command admission. Git only, never Perchance
// publication. Synthetic tests can inject guard/transport/effect gate; packaged
// capability is OFF until independently approved credential/provider activation.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createAiStore} from './ai-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createS06ExceptionStore,authorizeS06Exception} from './s06-exception-review.mjs';
import {exactSource,diffSource,verifyReadback} from './staging-core.mjs';
import {inspectWriteback,writeGitCandidate,observeGitCandidate,
  commitMessage,parseTerminalSuggestion} from './git-writeback.mjs';

export const WRITEBACK_PORT='pcms-i11-writeback';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const FP=/^[a-f0-9]{64}$/;
const ACTIONS=new Set(['GET_SETTINGS','SET_AUTO','LIST','GET','PREVIEW',
  'PREPARE','COMMIT','RECONCILE','CANCEL_PREPARED','ARM_AUTO','DISARM_AUTO']);
export function validateWritebackMessage(api,sender,msg){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(msg);}catch{return fail('INVALID_MESSAGE');}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||!json||
     json.length>1800||Object.keys(msg).some(x=>!['type','params'].includes(x))||
     !ACTIONS.has(msg.type))return fail('INVALID_MESSAGE');
  const p=msg.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed={
    GET_SETTINGS:[],SET_AUTO:['expectedRevision','autoEnabled'],LIST:[],
    GET:['slug'],PREVIEW:['slug'],
    PREPARE:['slug','expectedJobRevision','fingerprint','mode','message','token'],
    COMMIT:['slug','expectedRevision','token'],
    RECONCILE:['slug','expectedRevision','token'],
    CANCEL_PREPARED:['slug','expectedRevision'],
    ARM_AUTO:['slug','token'],DISARM_AUTO:['slug']
  };
  if(Object.keys(p).some(x=>!allowed[msg.type].includes(x))||
     (allowed[msg.type].includes('slug')&&!SLUG.test(p.slug||''))||
     (msg.type==='SET_AUTO'&&(!Number.isSafeInteger(p.expectedRevision)||
        p.expectedRevision<1||typeof p.autoEnabled!=='boolean'))||
     (msg.type==='PREPARE'&&(!Number.isSafeInteger(p.expectedJobRevision)||
        p.expectedJobRevision<1||!FP.test(p.fingerprint||'')||
        !['MANUAL','AUTO'].includes(p.mode)))||
     (['COMMIT','RECONCILE','CANCEL_PREPARED'].includes(msg.type)&&
        (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))||
     (['PREPARE','COMMIT','RECONCILE','ARM_AUTO'].includes(msg.type)&&
        (typeof p.token!=='string'||p.token.length<12||p.token.length>512)))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
function scopeMatches(stage,job){
  if(!stage?.ok||!job?.ok||stage.record?.state!=='SOURCE_VERIFIED'||
     !stage.record.verifiedAt||
     job.job?.state!=='TESTS_VERIFIED'||!job.job?.executionSlotReleased||
     job.job.verifiedFinal!==job.job.sourceFingerprint||
     job.job.finalSource?.fingerprint!==job.job.verifiedFinal||
     job.job.stageRevision!==stage.record.revision||
     !['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.job.native?.state))
    return fail('TESTED_FINAL_SOURCE_REQUIRED');
  return {ok:true};
}
function context(r){
  return {slug:r.slug,accountId:r.accountId,personaUid:r.personaUid,
    principalFingerprint:r.principalFingerprint,remotePublicId:r.remotePublicId};
}
async function guardedReadback(g,stage,job,sourceFingerprint=job?.job?.verifiedFinal){
  const r=stage.record;
  if(!g?.observeReadOnly||!g?.getSafeRouteReadiness||
     !g?.inspectStageEditor||!g?.runNativeAiStep)
    return fail('DONOR_GUARD_UNAVAILABLE');
  const expectedSession=job.job.native?.sessionDigest;
  if(!FP.test(expectedSession||''))return fail('AI_SESSION_UNVERIFIED');
  const observeNative=()=>g.runNativeAiStep(r.personaUid,{
    slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
  const validNative=o=>o?.ok===true&&o.busy===false&&
    o.sessionDigest===expectedSession&&o.sourceSaved===true&&
    o.editorClean===true&&o.hasQueue===false&&
    o.inputOccupied===false&&o.attachmentsPending===false;
  const before=await g.getSafeRouteReadiness(r.personaUid);
  if(!before?.ready)return fail(before?.code||'ROUTE_UNVERIFIED');
  const idleBefore=await observeNative();
  const editorBefore=await g.inspectStageEditor(r.personaUid,r.slug,r.nonce);
  if(!validNative(idleBefore)||!editorBefore?.ok||editorBefore.clean!==true)
    return fail('EDITOR_OR_AI_SESSION_UNVERIFIED');
  const observed=await g.observeReadOnly(r.personaUid,false,r.slug);
  if(!observed?.ok||observed.principalFingerprint!==r.principalFingerprint||
     !observed.original||!Array.isArray(observed.original.assets))
    return fail('CURRENT_SOURCE_OWNER_UNVERIFIED');
  const packet={ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
    ...context(r),ownerResult:observed.original.ownerResult,
    remotePublicId:observed.original.remotePublicId,
    visibility:observed.original.visibility,pjs:observed.original.pjs,
    html:observed.original.html,assets:observed.original.assets};
  const exact=await exactSource(job.job.finalSource.blobs);
  if(!exact.ok||exact.fingerprint!==sourceFingerprint)
    return fail('FINAL_BYTES_CHANGED');
  const verified=await verifyReadback(exact,packet,context(r));
  if(!verified.ok)return verified;
  const editorAfter=await g.inspectStageEditor(r.personaUid,r.slug,r.nonce);
  const idleAfter=await observeNative();
  const after=await g.getSafeRouteReadiness(r.personaUid);
  if(!after?.ready||after.cookieStoreId!==before.cookieStoreId||
     after.routeId!==before.routeId||!editorAfter?.ok||
     editorAfter.clean!==true||!validNative(idleAfter))
    return fail('EDITOR_OR_ROUTE_CHANGED_DURING_READBACK');
  return {ok:true,source:exact,route:after};
}
export function createWritebackBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  storeFactory=createWritebackStore,aiFactory=createAiStore,
  stageFactory=createStagingStore,inspect=inspectWriteback,
  write=writeGitCandidate,observe=observeGitCandidate,
  effectGate=()=>false
}={}){
  let dbPromise;
  const database=()=>dbPromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  // Ephemeral tokens are intentionally lost on background restart; canonical
  // autoEnabled alone never authorizes a Git action or stores credentials.
  const autoCredentials=new Map();
  let autoBusy=false;
  async function runTrusted(msg){
    const p=msg.params||{},db=await database(),store=storeFactory(db);
    if(msg.type==='GET_SETTINGS')return store.settings();
    if(msg.type==='LIST')return store.list();
    if(msg.type==='GET')return store.get(p.slug);
    if(msg.type==='SET_AUTO'){
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const updated=await store.changeSettings(p.expectedRevision,p.autoEnabled);
      if(updated.ok&&updated.setting.autoEnabled===false)autoCredentials.clear();
      return updated;
    }
    if(msg.type==='DISARM_AUTO'){
      autoCredentials.delete(p.slug);
      return {ok:true,slug:p.slug,code:'AUTO_CREDENTIAL_DISARMED'};
    }
    if(msg.type==='ARM_AUTO'){
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const settings=await store.settings();
      if(!settings.ok||settings.setting.autoEnabled!==true)
        return fail('GIT_AUTO_NOT_ENABLED');
      if(effectGate({phase:'I11',step:'READ_ONLY_AI_TERMINAL'})!==true||
         effectGate({phase:'I11',step:'GIT_WRITE_AUTO'})!==true)
        return fail('GIT_AUTO_ACTIVATION_HELD');
      if(autoCredentials.size>=16&&!autoCredentials.has(p.slug))
        return fail('GIT_AUTO_EPHEMERAL_LIMIT');
      const prior=await store.get(p.slug);
      if(prior.ok&&!(
        (prior.state==='PREPARED'&&prior.mode==='AUTO')||
        prior.state==='CANCELED'))
        return fail('WRITEBACK_ALREADY_EXISTS');
      // Every explicit arm gets a NEW identity; disarm followed by rearm
      // with the same token cannot revive an old suspended attempt.
      autoCredentials.set(p.slug,{
        token:p.token,armId:crypto.randomUUID()});
      try{api.alarms?.create('pcms-i11-auto',{periodInMinutes:1});}catch{}
      return {ok:true,slug:p.slug,code:'AUTO_EPHEMERAL_ARMED',
        persistence:'NONE',publication:'OFF'};
    }
    if(msg.type==='CANCEL_PREPARED'){
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const result=await store.cancelPrepared(p.slug,p.expectedRevision);
      if(result.ok)autoCredentials.delete(p.slug);
      return result;
    }
    const stage=await stageFactory(db).getFull(p.slug),
      job=await aiFactory(db).getJobFull(p.slug);
    if(msg.type==='RECONCILE'){
      const row=await store.getFull(p.slug);
      if(!row.ok||row.record.revision!==p.expectedRevision)
        return fail('STALE_OR_MISSING_WRITEBACK');
      if(row.record.state==='CONFIRMED')
        return store.get(p.slug);
      if(!['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(row.record.state))
        return fail('RECONCILIATION_NOT_REQUIRED');
      // Recovery belongs to the historical Git intent, not a mutable
      // current AI job or stage. The original sealed F was stored in the
      // same canonical transaction as PREPARED.
      if(!row.record.sealedSource||
         row.record.sealedSource.fingerprint!==row.record.sourceFingerprint)
        return fail('GIT_RECONCILIATION_SOURCE_UNAVAILABLE');
      const found=await observe({token:p.token,folder:row.record.folder,
        baseHead:row.record.baseHead,expectedHead:row.record.expectedHead,
        source:row.record.sealedSource,operationId:row.record.operationId});
      if(found?.ok&&found.code==='GIT_COMMITTED_VERIFIED'&&
         found.attribution==='COMMIT_PARENT_AND_BYTES_VERIFIED')
        return store.finish(p.slug,row.record.revision,{
          verified:true,commitSha:found.commitSha});
      // Same-content independent commits are NOT success. Even an observed
      // missing commit could mean the branch changed or an ACK was lost.
      return {ok:false,state:'HELD_UNCERTAIN',code:found?.code||
        'GIT_RECONCILIATION_UNKNOWN',canRetry:false};
    }
    const priorWrite=msg.type==='COMMIT'?await store.getFull(p.slug):null;
    const exceptional=(msg.type==='PREPARE'&&p.mode==='S06_EXCEPTION')||
      (msg.type==='COMMIT'&&priorWrite?.ok&&
       priorWrite.record.mode==='S06_EXCEPTION');
    let exceptionProof=null;
    if(exceptional){
      const [ready,rec]=await Promise.all([
        createReadyStore(db).get(p.slug),
        createS06ExceptionStore(db).getFull(p.slug)]);
      exceptionProof=ready.ok&&rec.ok&&stage.ok&&job.ok?
        authorizeS06Exception({ready:ready.record,stage:stage.record,
          job:job.job,record:rec.record}):
        fail('S06_EXCEPTION_CANONICAL_EVIDENCE_MISSING');
      if(!exceptionProof.ok)return exceptionProof;
      if(msg.type==='COMMIT'&&
         priorWrite.record.exceptionRevision!==exceptionProof.revision)
        return fail('S06_EXCEPTION_WRITEBACK_REVISION_CHANGED');
    }else{
      const scope=scopeMatches(stage,job);
      if(!scope.ok)return scope;
    }
    const r=stage.record,j=job.job;
    if(msg.type==='PREVIEW'){
      const previous=await exactSource(r.candidate.blobs);
      const final=await exactSource(j.finalSource.blobs);
      if(!previous.ok||!final.ok||final.fingerprint!==j.verifiedFinal)
        return fail('PREVIEW_SOURCE_UNVERIFIED');
      const diff=diffSource(previous,final);
      if(!diff.ok)return diff;
      return {ok:true,slug:r.slug,folder:r.sourceFolder,
        sourceFingerprint:final.fingerprint,jobRevision:j.revision,
        stageRevision:r.revision,
        diff:diff.changes.map(x=>({...x,
          before:previous.files.find(f=>f.path===x.path)||null,
          after:final.files.find(f=>f.path===x.path)||null})),
        policy:'NO_READY_OR_TESTING_FILE_EDIT',
        publication:'OFF',review:'EXACT_FILE_HASH_AND_SIZE'};
    }
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    if(msg.type==='PREPARE'){
      if(p.expectedJobRevision!==j.revision||
         p.fingerprint!==(exceptional?exceptionProof.sourceFingerprint:j.verifiedFinal))
        return fail('STALE_PREVIEW');
      const local=await guardedReadback(guard(),stage,job,
        exceptional?exceptionProof.sourceFingerprint:j.verifiedFinal);
      if(!local.ok)return local;
      let message;
      if(p.mode==='MANUAL')message=commitMessage(p.message);
      else if(p.mode==='S06'){
        // Only trusted background S06 calls this mode; UI admission never can.
        if(p.message!=='PCMS verified '+p.slug+' candidate')
          return fail('S06_INTERNAL_WRITEBACK_INTENT_REQUIRED');
        message=commitMessage(p.message);
      }else if(p.mode==='S06_EXCEPTION'){
        if(!exceptional||p.message!=='PCMS exceptional '+p.slug+' candidate')
          return fail('S06_EXCEPTION_INTERNAL_WRITEBACK_REQUIRED');
        message=commitMessage(p.message);
      }else {
        // No untrusted UI-provided terminal text is accepted. Query only the
        // leased native assistant session; missing evidence holds AUTO.
        const g=guard(),session=j.native?.sessionDigest;
        if(!g?.runNativeAiStep||!FP.test(session||''))
          return fail('AI_TERMINAL_UNVERIFIED');
        if(effectGate({phase:'I11',step:'READ_ONLY_AI_TERMINAL'})!==true)
          return fail('AI_TERMINAL_HISTORY_ACTIVATION_HELD');
        const before=await g.runNativeAiStep(r.personaUid,
          {slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
        if(!before?.ok||before.busy!==false||before.editorClean!==true||
           before.sourceSaved!==true||before.sessionDigest!==session||
           before.hasQueue!==false||before.inputOccupied!==false||
           before.attachmentsPending!==false)
          return fail('AI_TERMINAL_NATIVE_NOT_IDLE');
        const reply=await g.runNativeAiStep(r.personaUid,
          {slug:r.slug,nonce:r.nonce,action:'OBSERVE_TERMINAL',
           firstPrompt:j.native.state==='CHAT2_OBSERVED_IDLE'?
             j.optionalTesting?.text:j.prompt.text});
        const after=await g.runNativeAiStep(r.personaUid,
          {slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
        if(!after?.ok||after.busy!==false||after.editorClean!==true||
           after.sourceSaved!==true||after.sessionDigest!==session||
           after.inputOccupied!==false||after.attachmentsPending!==false||
           after.hasQueue!==false)
          return fail('AI_TERMINAL_NATIVE_CHANGED');
        message=parseTerminalSuggestion(reply,session);
      }
      if(!message.ok)return message;
      const probe=await inspect({token:p.token,folder:r.sourceFolder,
        baseHead:r.sourceHead});
      if(!probe.ok)return probe;
      const receipt=await store.prepare({name:p.slug,stage:r,job:j,probe,
        mode:p.mode,message:message.text,
        operationId:'writeback_'+crypto.randomUUID().replaceAll('-','')});
      return receipt;
    }
    if(msg.type==='COMMIT'){
      const prior=await store.getFull(p.slug);
      if(!prior.ok||prior.record.revision!==p.expectedRevision)
        return fail('STALE_OR_MISSING_WRITEBACK');
      const record=prior.record;
      if(record.state!=='PREPARED')
        return fail('WRITEBACK_RECONCILIATION_REQUIRED');
      const autoAuthorized=()=>record.mode!=='AUTO'||(
        typeof p.autoArmId==='string'&&
        autoCredentials.get(p.slug)?.armId===p.autoArmId&&
        autoCredentials.get(p.slug)?.token===p.token);
      if(!autoAuthorized())return fail('GIT_AUTO_DISARMED');
      if(effectGate({phase:'I11',record})!==true)
        return fail('GITHUB_WRITE_ACTIVATION_HELD');
      const read=await guardedReadback(guard(),stage,job,
        exceptional?exceptionProof.sourceFingerprint:j.verifiedFinal);
      if(!read.ok)return read;
      // durable marker has all current AI/stage/settings CAS; duplicate
      // requests from different Firefox wakes cannot arm twice.
      const armed=await store.arm(p.slug,p.expectedRevision);
      if(!armed.ok)return armed;
      if(!autoAuthorized()||effectGate({phase:'I11',record})!==true||
         (await sentinel.inspect()).held){
        await store.finish(p.slug,armed.revision,{reason:'WRITEBACK_HELD_AFTER_ARM'});
        return fail('WRITEBACK_DISPATCH_UNCERTAIN');
      }
      let outcome;
      try{outcome=await write({token:p.token,folder:record.folder,
        baseHead:record.baseHead,expectedHead:record.expectedHead,
        message:record.message,operationId:record.operationId,
        source:read.source});}
      catch{outcome=fail('GIT_TRANSPORT_UNCERTAIN');}
      const completed=await store.finish(p.slug,armed.revision,{
        verified:outcome?.ok===true&&outcome.code==='GIT_COMMITTED_VERIFIED',
        commitSha:outcome?.commitSha,
        reason:outcome?.code||'WRITEBACK_OUTCOME_UNVERIFIED'
      });
      return completed.ok?{...completed,
        github:completed.state==='CONFIRMED'?'GIT_ONLY_CONFIRMED':'HELD_UNCERTAIN'}:
        fail('WRITEBACK_CHECKPOINT_UNCERTAIN');
    }
    return fail('COMMAND_NOT_ALLOWED');
  }
  async function run(message,sender){
    const valid=validateWritebackMessage(api,sender,message);
    if(!valid.ok)return valid;
    try{return await runTrusted(message);}
    catch{return fail('WRITEBACK_CANONICAL_HOLD');}
  }
  async function autoTick(){
    if(autoBusy||autoCredentials.size===0)return fail('GIT_AUTO_NO_WORK');
    autoBusy=true;
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const db=await database(),store=storeFactory(db);
      const enabled=await store.settings();
      if(!enabled.ok||!enabled.setting.autoEnabled){
        autoCredentials.clear();return fail('GIT_AUTO_NOT_ENABLED');
      }
      for(const [slug,credential] of autoCredentials){
        const {token,armId}=credential;
        const current=await store.get(slug);
        if(current.ok&&current.state!=='CANCELED'){
          if(current.state==='PREPARED'&&current.mode==='AUTO'){
            if(autoCredentials.get(slug)?.armId!==armId)
              return fail('GIT_AUTO_DISARMED');
            const result=await runTrusted({type:'COMMIT',params:{
              slug,token,autoArmId:armId,expectedRevision:current.revision}});
            if(autoCredentials.get(slug)?.armId===armId)
              autoCredentials.delete(slug);
            return result;
          }
          if(autoCredentials.get(slug)?.armId===armId)
            autoCredentials.delete(slug);
          continue;
        }
        const candidate=await runTrusted({type:'PREVIEW',params:{slug}});
        if(!candidate.ok)continue; // no verified final F; no Git effect
        const prepared=await runTrusted({type:'PREPARE',params:{
          slug,token,mode:'AUTO',message:'',
          expectedJobRevision:candidate.jobRevision,
          fingerprint:candidate.sourceFingerprint
        }});
        if(!prepared.ok){
          // Final F was eligible but its live evidence/remote comparison
          // failed. Do not poll/replay indefinitely on each browser wake.
          // Operator may explicitly re-arm after investigating the hold.
          if(autoCredentials.get(slug)?.armId===armId)
            autoCredentials.delete(slug);
          return fail(prepared.code||'GIT_AUTO_PREPARE_HELD');
        }
        // An operator may disarm while PREPARE awaits remote readbacks.
        // A matching ephemeral epoch is required again before and after
        // durable DISPATCH_POSSIBLE; concurrent alarms are single-flight.
        if(autoCredentials.get(slug)?.armId!==armId)
          return fail('GIT_AUTO_DISARMED');
        const result=await runTrusted({type:'COMMIT',params:{
          slug,token,autoArmId:armId,expectedRevision:prepared.revision}});
        if(autoCredentials.get(slug)?.armId===armId)
          autoCredentials.delete(slug);
        return result;
      }
      return {ok:true,code:'GIT_AUTO_WAITING_FOR_VERIFIED_F'};
    }catch{return fail('GIT_AUTO_HELD_UNVERIFIED');}
    finally{autoBusy=false;}
  }
  function register(){
    api.alarms?.onAlarm?.addListener(alarm=>{
      if(alarm?.name==='pcms-i11-auto')void autoTick();
    });
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==WRITEBACK_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(msg,port.sender))
          .then(v=>{try{port.postMessage(v);}catch{}})
          .catch(()=>{try{port.postMessage(fail('WRITEBACK_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run,autoTick,runTrusted});
}
if(typeof browser!=='undefined')createWritebackBoundary(browser).register();
