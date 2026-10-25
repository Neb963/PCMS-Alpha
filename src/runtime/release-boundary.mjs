import {updateWindowAvailable} from './update-window.mjs';
import {createLocalSourceReview} from './source-review.mjs';
import {captureExceptionalIdle,exceptionalIdleEvidence} from './exception-idle.mjs';
import {browserGitCredentialPacket} from './git-local-secret.mjs';
// I13 guarded source-bound human release. Same-XPI background authority;
// UI supplies ONLY slug, expected revisions, explicit approval and ephemeral
// read-only Git credential. No UI-selected browser tab, source or route.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createReleaseStore} from './release-store.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {planS06Writeback} from './s06-writeback-progress.mjs';
import {createS06ReviewQueue} from './s06-review-queue.mjs';
import {createS06ChangeStore} from './s06-request-changes.mjs';
import {createS06HumanStore,createS06HumanBoundary,humanReviewParentRevision} from './s06-human-review.mjs';
import {createS06ExceptionStore,createS06ExceptionBoundary,hasManualInfrastructure} from './s06-exception-review.mjs';
import {standingS06} from './s06-standing-authority.mjs';
import {createExistingStore} from './existing-update-store.mjs';
import {unlockPrevious} from './existing-update-core.mjs';
import {REFRESHER_KEY} from './refresher-core.mjs';
import {evaluation} from './ai-evidence.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {inspectGitSource} from './git-source.mjs';
import {exactSource,diffSource} from './staging-core.mjs';
import {releaseContext,releaseTestContext,candidateManifest,releaseGitContext,
  releaseEditorContext,approvalTuple,matchesApproval,publicationReadback,
  releaseCandidateTestContext,releaseCandidateKind}
  from './release-core.mjs';
export const RELEASE_PORT='pcms-i13-release';
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const TYPES=new Set(['LIST','LIST_REVIEW','LIST_SOURCE_HISTORY','GET_LOCAL_REVIEW','GET_LOCAL_CHUNK','GET','GET_CHANGE','REQUEST_CHANGES','HUMAN_CONTEXT','GET_HUMAN','OPEN_HUMAN_EDITOR','DEFER_HUMAN','ADOPT_HUMAN','GET_EXCEPTION','EXCEPTION_CONTEXT','RECORD_EXCEPTION','PREVIEW','GET_REVIEW_CHUNK','APPROVE','CANCEL_APPROVED','DISPATCH','RECONCILE']);
export function validateReleaseMessage(api,sender,msg){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(msg);}catch{return fail('INVALID_MESSAGE');}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||!json||
     json.length>(msg.type==='REQUEST_CHANGES'?5500:
       msg.type==='RECORD_EXCEPTION'?130000:1800)||
     Object.keys(msg).some(k=>!['type','params'].includes(k))||!TYPES.has(msg.type))
    return fail('INVALID_MESSAGE');
  const p=msg.params||{},allowed={
    LIST:[],LIST_REVIEW:['after','limit','query','status'],LIST_SOURCE_HISTORY:['slug','before','limit'],GET_LOCAL_REVIEW:['slug','historyRevision'],GET_LOCAL_CHUNK:['slug','stageRevision','jobRevision','fingerprint','origin','path','offset','historyRevision'],GET:['slug'],GET_CHANGE:['slug'],
     HUMAN_CONTEXT:['slug'],GET_HUMAN:['slug'],
     DEFER_HUMAN:['slug','expectedStageRevision','expectedJobRevision','expectedFingerprint'],
     ADOPT_HUMAN:['slug','expectedRevision'],OPEN_HUMAN_EDITOR:['slug','expectedRevision'],
     GET_EXCEPTION:['slug'],EXCEPTION_CONTEXT:['slug'],RECORD_EXCEPTION:['slug','mode','checks','consent',
       'expectedStageRevision','expectedJobRevision','sourceFingerprint'],
    REQUEST_CHANGES:['slug','token','expectedStageRevision',
      'expectedJobRevision','sourceFingerprint','instructions','releaseRevision'],
    PREVIEW:['slug','token'],
    GET_REVIEW_CHUNK:['slug','stageRevision','fingerprint','origin','path','offset'],
    APPROVE:['slug','token','expectedStageRevision','expectedJobRevision','fingerprint','explicitApproval'],
    CANCEL_APPROVED:['slug','expectedRevision'],
    DISPATCH:['slug','token','expectedRevision'],
    RECONCILE:['slug','token','expectedRevision']
  };
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).some(k=>!allowed[msg.type].includes(k))||
     (!['LIST','LIST_REVIEW'].includes(msg.type)&&!slug(p.slug))||
     (msg.type==='LIST_REVIEW'&&(
       (p.after!==undefined&&(typeof p.after!=='string'||p.after.length>100||
         !/^(?:[a-z0-9][a-z0-9-]{0,99})?$/.test(p.after)))||
       (p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100))||
       (p.query!==undefined&&(typeof p.query!=='string'||p.query.length>100))||
       (p.status!==undefined&&!['ALL','NEEDS_ACTION','RUNNING','WAITING','COMPLETED'].includes(p.status))))||
     (['PREVIEW','APPROVE','DISPATCH','RECONCILE','REQUEST_CHANGES'].includes(msg.type)&&
       (p.token!==undefined&&(typeof p.token!=='string'||p.token.length<12||
        p.token.length>512||!/^[\x21-\x7e]+$/.test(p.token))))||
     (['GET_LOCAL_REVIEW','GET_LOCAL_CHUNK'].includes(msg.type)&&p.historyRevision!==undefined&&(!Number.isSafeInteger(p.historyRevision)||p.historyRevision<1))||
     (msg.type==='LIST_SOURCE_HISTORY'&&((p.before!==undefined&&(!Number.isSafeInteger(p.before)||p.before<0))||(p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100))))||
     (['GET_REVIEW_CHUNK','GET_LOCAL_CHUNK'].includes(msg.type)&&(
       (msg.type==='GET_LOCAL_CHUNK'&&(!Number.isSafeInteger(p.jobRevision)||p.jobRevision<0))||
       !Number.isSafeInteger(p.stageRevision)||p.stageRevision<1||
       !fp(p.fingerprint)||!['F','P'].includes(p.origin)||
       typeof p.path!=='string'||p.path.length>240||
       !/^(?:main\.pjs|index\.html|src\/[A-Za-z0-9._/-]+)$/.test(p.path)||
       !Number.isSafeInteger(p.offset)||p.offset<0||p.offset>16*1024*1024||
       p.offset%8192!==0))||
     (['DISPATCH','RECONCILE','CANCEL_APPROVED'].includes(msg.type)&&
       (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))||
     (msg.type==='RECORD_EXCEPTION'&&(
       !['MANUAL_INFRASTRUCTURE','OPTIONAL_CHAT2_INCOMPLETE'].includes(p.mode)||
       !Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
       !Number.isSafeInteger(p.expectedJobRevision)||p.expectedJobRevision<1||
       !fp(p.sourceFingerprint)||p.consent!=='I PERFORMED THE RECORDED MANUAL CHECKS'||
       !Array.isArray(p.checks)||p.checks.length>128||
       p.checks.some(x=>!x||typeof x!=='object'||Array.isArray(x)||
          Object.keys(x).some(k=>!['name','result','observation'].includes(k))||
          typeof x.name!=='string'||x.name.length>80||
          x.result!=='PASS'||typeof x.observation!=='string'||
          x.observation.length>2000)))||
     (msg.type==='DEFER_HUMAN'&&(
       !Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
       !Number.isSafeInteger(p.expectedJobRevision)||p.expectedJobRevision<1||
       !fp(p.expectedFingerprint)))||
     (['ADOPT_HUMAN','OPEN_HUMAN_EDITOR'].includes(msg.type)&&(
       !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))||
     (msg.type==='REQUEST_CHANGES'&&(
       !Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
       !Number.isSafeInteger(p.expectedJobRevision)||p.expectedJobRevision<1||
       !fp(p.sourceFingerprint)||typeof p.instructions!=='string'||
       p.instructions.length<3||p.instructions.length>4000||
       (p.releaseRevision!==undefined&&(!Number.isSafeInteger(p.releaseRevision)||
         p.releaseRevision<1))))||
     (msg.type==='APPROVE'&&(
       !Number.isSafeInteger(p.expectedStageRevision)||p.expectedStageRevision<1||
       !Number.isSafeInteger(p.expectedJobRevision)||p.expectedJobRevision<1||
       !fp(p.fingerprint)||p.explicitApproval!==true)))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
function observation(packet,r){
  const o=packet?.original;
  return {ok:packet?.ok===true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
    slug:r.slug,accountId:r.accountId,personaUid:r.personaUid,
    principalFingerprint:packet?.principalFingerprint,
    remotePublicId:o?.remotePublicId,ownerResult:o?.ownerResult,
    visibility:o?.visibility,pjs:o?.pjs,html:o?.html,assets:o?.assets};
}
const binary=s=>{
  let data='';const bytes=new TextEncoder().encode(s);
  for(let i=0;i<bytes.length;i+=8192)
    data+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(data);
};
async function readRemote(g,r){
  const raw=await g.observeReadOnly(r.personaUid,false,r.slug);
  const o=observation(raw,r);
  if(!o.ok||o.principalFingerprint!==r.principalFingerprint||
     o.ownerResult!=='IS_OWNER'||o.remotePublicId!==r.remotePublicId||
     !['PUBLIC','UNLISTED'].includes(o.visibility)||typeof o.pjs!=='string'||
     typeof o.html!=='string'||!Array.isArray(o.assets))return fail('RELEASE_REMOTE_OWNER_UNVERIFIED');
  const source=await exactSource([
    {path:'main.pjs',base64:binary(o.pjs)},
    {path:'index.html',base64:binary(o.html)},...o.assets
  ]);
  return source.ok?{ok:true,packet:o,source}:source;
}
function ownerFacts(db,slugName){
  return new Promise((resolve,reject)=>{
    let tx,result=fail('RELEASE_TARGET_NOT_FOUND');
    try{tx=db.transaction(['meta'],'readonly');}
    catch{return reject(Error('RELEASE_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(Error('RELEASE_DB_ABORTED'));
    tx.objectStore('meta').get('inventory:'+slugName).onsuccess=e=>{
      const inventory=e.target.result?.generator;
      if(!inventory)return;
      tx.objectStore('meta').get('account:'+inventory.accountId).onsuccess=a=>{
        const account=a.target.result?.account;
        result=account?{ok:true,inventory,account}:fail('RELEASE_ACCOUNT_NOT_FOUND');
      };
    };
  });
}
export function createReleaseBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  stageFactory=createStagingStore,aiFactory=createAiStore,
  releaseFactory=createReleaseStore,inspect=inspectGitSource,
  // Only an independently activated fixed native publish adapter may
  // change listing. Default packaged capability is held.
  effectGate=()=>false,
  gitCredential=browserGitCredentialPacket,
  dispatch=async(g,r)=>g.runReleaseStep?.(r.personaUid,{
    slug:r.slug,nonce:r.nonce,action:'PUBLISH',remotePublicId:r.remotePublicId,
    principalFingerprint:r.principalFingerprint,files:r.releaseFiles})
}={}){
  let dbPromise,localSourceReview;
  const db=()=>dbPromise ||=open().catch(e=>{dbPromise=null;throw e;});
  const sentinel=createRestoreSentinel(api.storage.local);
  async function vaultToken(explicit){
    if(typeof explicit==='string'&&explicit.length>=12)return explicit;
    const cfg=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
    if(cfg?.repository!=='Neb963/per-gens'||
       !/^[1-9][0-9]{0,19}$/.test(cfg.repositoryId||''))return null;
    const reply=await gitCredential({action:'git.get',repositoryId:cfg.repositoryId});
    return reply?.ok&&typeof reply.credential==='string'&&
      reply.credential.length>=12&&reply.credential.length<=512&&
      /^[\x21-\x7e]+$/.test(reply.credential)?reply.credential:null;
  }
  async function checkCurrent(database,name,token,{requireEditor=true,physicalManualEditor=false,allowPausedReview=false}={}){
    const stage=await stageFactory(database).getFull(name),
      job=await aiFactory(database).getJobFull(name),
      facts=await ownerFacts(database,name);
    if(!stage.ok||!job.ok||!facts.ok)return fail('RELEASE_CANONICAL_EVIDENCE_MISSING');
    const r=stage.record,j=job.job,{account,inventory}=facts;
    if(j.operatorPaused&&!allowPausedReview)return fail('AI_OPERATOR_PAUSED');
    const [ready,exception]=await Promise.all([
      createReadyStore(database).get(name),
      createS06ExceptionStore(database).getFull(name)]);
    const reviewContext={ready:ready.ok?ready.record:null,
      exception:exception.ok?exception.record:null};
    const owner=releaseContext(r,account,inventory),
      tests=releaseCandidateTestContext(r,j,reviewContext);
    if(!owner.ok)return owner;
    if(!tests.ok)return tests;
    const existingRow=await createExistingStore(database).getFull(name);
    const candidateKind=releaseCandidateKind(r,inventory,existingRow.ok?existingRow.record:null),privateNew=candidateKind!=='EXISTING_UPDATE';
    if(!privateNew){
      if(!existingRow?.ok||existingRow.record.state!=='STAGE_CONFIRMED'||
         existingRow.record.nonce!==r.nonce||
         existingRow.record.previousFingerprint!==r.previous.fingerprint||
         existingRow.record.remotePublicId!==r.remotePublicId||
         existingRow.record.accountRevision!==r.accountRevision||
         existingRow.record.bindingVersion!==r.bindingVersion||
         !existingRow.record.stageSource?.ok)
        return fail('EXISTING_STAGE_OR_FINAL_F_UNVERIFIED');
      const unlocked=await unlockPrevious(existingRow.record.recovery);
      if(!unlocked.ok||unlocked.source.fingerprint!==r.previous.fingerprint)
        return fail('EXISTING_RECOVERY_CHECKPOINT_UNVERIFIED');
      const shadow=await new Promise((resolve,reject)=>{
        const tx=database.transaction('meta','readonly');
        const req=tx.objectStore('meta').get(REFRESHER_KEY);
        req.onsuccess=()=>resolve(req.result?.state);
        req.onerror=()=>reject(Error('SHADOW_READ_FAILED'));
      });
      const row=shadow?.rows?.find(v=>v.slug===name);
      if(!row||!updateWindowAvailable(shadow,row,ready.record,r,existingRow.record.previousFingerprint)||
         row.paused===true||shadow.globalPause===true||
         shadow.accounts?.[r.accountId]?.paused===true||
         row.remoteId!==r.remotePublicId||row.bindingVersion!==r.bindingVersion)
        return fail('EXISTING_SLEEP_REVOKED');
    }
    if(inventory.visibility!=='UNLISTED')
      return fail('UNLISTED_LISTING_OBSERVATION_REQUIRED');
    const source=await candidateManifest(r,j,reviewContext);
    if(!source.ok)return source;
    // The accepted READY workflow cannot be released merely because the
    // old I13 candidate seems locally tested. The *same* S05 revision must
    // have an independently attributed, byte-confirmed Git main commit.
    if(r.readyIdentifier){
      if(!ready.ok)return fail('S06_CURRENT_READY_RECORD_REQUIRED');
      const wb=await createWritebackStore(database).getFull(name);
      const check=planS06Writeback({ready,stage,job:allowPausedReview?{...job,job:{...j,operatorPaused:false}}:job,writeback:wb.ok?wb:null,
        exception:exception.ok?exception:null});
      if(!check.ok||check.type!=='REVIEW'||
         !/^[0-9a-f]{40}$/.test(check.commitSha||''))
        return fail('S06_CURRENT_CANDIDATE_GIT_PROOF_REQUIRED');
    }

    const fresh=await inspect({token,folder:r.sourceFolder,includeSourceBytes:true});
    const git=releaseGitContext(r,fresh);
    if(!git.ok)return git;
    const gitBytes=await exactSource(fresh.sourceBytes);
    if(!gitBytes.ok||gitBytes.fingerprint!==source.fingerprint)
      return fail('CURRENT_GIT_SOURCE_NOT_FINAL_F');
    const g=guard();
    if(!g?.getSafeRouteReadiness||!g?.observeReadOnly||
       !g?.inspectStageEditor||!g?.runNativeAiStep)
      return fail('RELEASE_DONOR_GUARD_UNAVAILABLE');
    const route=await g.getSafeRouteReadiness(r.personaUid);
    if(!route?.ready)return fail(route?.code||'ROUTE_UNVERIFIED');
    let native=null,editor;
    if(tests.mode==='EXCEPTION_MANUAL_REVIEW'&&j.exceptionQuiescence==='NEVER_DISPATCHED_SOURCE'&&!j.native){
      const proof=await captureExceptionalIdle({guard:g,stage:r,job:j,held:async()=>(await sentinel.inspect()).held}),evidence=exceptionalIdleEvidence(proof,r,j);
      if(!evidence)return fail(proof.code||'MANUAL_SOURCE_UNVERIFIED');
      editor=evidence.editor;
      if(physicalManualEditor&&editor.noEditors)return fail('MANUAL_PUBLICATION_EDITOR_PENDING');
    }else{
      native=await g.runNativeAiStep(r.personaUid,{slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
      editor=await g.inspectStageEditor(r.personaUid,r.slug,r.nonce);
      const safe=releaseEditorContext({stage:r,route,previousRoute:route,native,editor});
      if(requireEditor&&!safe.ok)return safe;
      if(native?.sessionDigest!==j.native?.sessionDigest)return fail('AI_SESSION_CHANGED');
    }
    const remote=await readRemote(g,r);
    if(!remote.ok)return remote;
    if(remote.packet.visibility!=='UNLISTED'||
       remote.source.fingerprint!==source.fingerprint)
      return fail('UNLISTED_FINAL_F_NOT_VERIFIED');
    const after=await g.getSafeRouteReadiness(r.personaUid);
    if(!after?.ready||after.routeId!==route.routeId||
       after.cookieStoreId!==route.cookieStoreId)return fail('ROUTE_CHANGED');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const previous=await exactSource(r.previous.blobs);
    if(!previous.ok||previous.fingerprint!==r.previous.fingerprint)
      return fail('PREVIOUS_SOURCE_CORRUPT');
    const approved=approvalTuple({slug:name,stage:r,job:j,source,git,
      previous,kind:candidateKind,testContext:tests});
    if(!approved.ok)return approved;
    return {ok:true,r,j,source,previous,approval:approved.tuple,
      kind:candidateKind,existing:existingRow?.record,
      editor,route:after,remote,git,testContext:tests};
  }
  async function runTrusted(msg){
    const p=msg.params||{},database=await db(),store=releaseFactory(database);
    if(msg.type==='LIST_SOURCE_HISTORY')return (localSourceReview||=createLocalSourceReview(database,{stageFactory,aiFactory})).history(p.slug,p);
    if(msg.type==='GET_LOCAL_REVIEW')return (localSourceReview||=createLocalSourceReview(database,{stageFactory,aiFactory})).view(p.slug,p.historyRevision);
    if(msg.type==='GET_LOCAL_CHUNK')return (localSourceReview||=createLocalSourceReview(database,{stageFactory,aiFactory})).chunk(p);
    if(msg.type==='GET')return store.get(p.slug);
    if(msg.type==='LIST')return store.list();
    if(msg.type==='GET_CHANGE')return createS06ChangeStore(database).get(p.slug);
    if(msg.type==='GET_HUMAN')return createS06HumanStore(database).get(p.slug);
    if(msg.type==='GET_EXCEPTION')return createS06ExceptionStore(database).get(p.slug);
    if(msg.type==='EXCEPTION_CONTEXT'){
      const [stage,job,ready]=await Promise.all([
        stageFactory(database).getFull(p.slug),aiFactory(database).getJobFull(p.slug),
        createReadyStore(database).get(p.slug)]);
      const saved=job?.job?.finalSource||(!job?.job?.native?stage?.record?.candidate:null);
      if(!stage.ok||!job.ok||!ready.ok||
        job.job.stageRevision!==stage.record.revision||
        ready.record.active?.identifier!==stage.record.readyIdentifier||
        ready.record.active?.inputFingerprint!==stage.record.readyInputFingerprint||
        !saved||saved.fingerprint!==job.job.sourceFingerprint)
        return fail('S06_EXCEPTION_CONTEXT_UNAVAILABLE');
      const verdict=evaluation(job.job);
      return {ok:true,slug:p.slug,stageRevision:stage.record.revision,
        jobRevision:job.job.revision,sourceFingerprint:job.job.sourceFingerprint,
        evidenceState:verdict.state,chat1Verified:verdict.chat1Pass===true,
        chat2Verified:verdict.chat2Pass===true,
        nativeHold:job.job.hold||null,schedulerHold:job.job.schedulerHold||null,
        requiredChecks:[...new Set([...(job.job.prompt?.tests||[]),
          ...(job.job.optionalTesting?.tests||[])])],
        optionalConfigured:!!job.job.optionalTesting,
        manualInfrastructureObserved:hasManualInfrastructure(job.job),
        publication:'NOT_AUTHORIZED'};
    }
    if(msg.type==='RECORD_EXCEPTION')return createS06ExceptionBoundary(api,{
      open:async()=>database,guard}).runTrusted(msg);
    if(msg.type==='HUMAN_CONTEXT'){
      const [stage,job,human]=await Promise.all([
        stageFactory(database).getFull(p.slug),
        aiFactory(database).getJobFull(p.slug),
        createS06HumanStore(database).get(p.slug)]);
      if(!stage.ok||!job.ok||job.job.stageRevision!==humanReviewParentRevision(stage.record)&&!(human.ok&&human.state==='ADOPTED_UNTESTED'))
        return fail('S06_HUMAN_CONTEXT_UNAVAILABLE');
      return {ok:true,slug:p.slug,stageRevision:stage.record.revision,
        jobRevision:job.job.revision,sourceFingerprint:job.job.verifiedFinal,
        human:human.ok?human:null,tested:job.job.state==='TESTS_VERIFIED',publication:'NO_ACTION'};
    }
    if(msg.type==='DEFER_HUMAN'){
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      return createS06HumanStore(database).defer({
        name:p.slug,expectedStageRevision:p.expectedStageRevision,
        expectedJobRevision:p.expectedJobRevision,
        expectedFingerprint:p.expectedFingerprint});
    }
    if(['ADOPT_HUMAN','OPEN_HUMAN_EDITOR'].includes(msg.type))return createS06HumanBoundary(api,{
      open:async()=>database,guard}).runTrusted(msg);
    if(msg.type==='LIST_REVIEW')return createS06ReviewQueue(database).list({
      after:p.after||'',limit:p.limit||50,query:p.query||'',status:p.status||'ALL'});
    if(msg.type==='GET_REVIEW_CHUNK'){
      // Source is taken only from sealed canonical stage/job. Read-only,
      // revision-fenced review never grants publisher or Git authority.
      const [stage,job,ready,exception]=await Promise.all([
        stageFactory(database).getFull(p.slug),aiFactory(database).getJobFull(p.slug),
        createReadyStore(database).get(p.slug),
        createS06ExceptionStore(database).getFull(p.slug)]);
      const evidence={ready:ready.ok?ready.record:null,
        exception:exception.ok?exception.record:null};
      if(!stage.ok||!job.ok||stage.record.revision!==p.stageRevision||
         stage.record.slug!==p.slug||
         !releaseCandidateTestContext(stage.record,job.job,evidence).ok)
        return fail('REVIEW_OUTDATED');
      const f=await candidateManifest(stage.record,job.job,evidence);
      if(!f.ok||f.fingerprint!==p.fingerprint)return fail('REVIEW_FINAL_F_STALE');
      const selected=p.origin==='F'?f:await exactSource(stage.record.previous.blobs);
      if(!selected.ok||selected.fingerprint!==stage.record.previous?.fingerprint&&p.origin==='P')
        return fail('REVIEW_PREVIOUS_CORRUPT');
      const file=selected.blobs.find(x=>x.path===p.path);
      if(!file)return fail('REVIEW_FILE_NOT_FOUND');
      const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
      if(p.offset>bytes.length)return fail('REVIEW_OFFSET_INVALID');
      const part=bytes.subarray(p.offset,p.offset+8192);
      let raw='';for(let i=0;i<part.length;i++)raw+=String.fromCharCode(part[i]);
      const metadata=selected.files.find(x=>x.path===p.path);
      return {ok:true,slug:p.slug,stageRevision:p.stageRevision,
        fingerprint:f.fingerprint,origin:p.origin,path:p.path,
        offset:p.offset,length:part.length,total:bytes.length,
        fileSha256:metadata.sha256,base64:btoa(raw),
        nextOffset:p.offset+part.length<bytes.length?p.offset+8192:null};
    }
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    if(msg.type==='CANCEL_APPROVED')return store.cancelApproved(p.slug,p.expectedRevision);
    if(msg.type==='RECONCILE'){
      const row=await store.getFull(p.slug);
      if(!row.ok||row.record.revision!==p.expectedRevision)return fail('STALE_RELEASE');
      const r=row.record;
      if(r.state==='CONFIRMED_PUBLIC')return store.get(p.slug);
      if(!['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(r.state))
        return fail('RECONCILIATION_NOT_REQUIRED');
      const g=guard(),route=await g.getSafeRouteReadiness(r.approval.personaUid);
      if(!route?.ready)return fail('PROTECTED_ROUTE_UNVERIFIED');
      const remote=await readRemote(g,{slug:r.slug,...r.approval});
      if(!remote.ok)return remote;
      const after=await g.getSafeRouteReadiness(r.approval.personaUid);
      if(!after?.ready||after.routeId!==route.routeId||
         after.cookieStoreId!==route.cookieStoreId)return fail('PROTECTED_ROUTE_CHANGED');
      const evidence=await publicationReadback(r.approval,
        {...remote.packet,observedAt:Date.now(),
          observationId:'observed_'+crypto.randomUUID().replaceAll('-','')},
        {guardReady:true});
      return store.settle(p.slug,p.expectedRevision,{
        proof:evidence.ok?evidence:null,reason:evidence.code||'PUBLICATION_UNCERTAIN'
      });
    }
    if(msg.type==='REQUEST_CHANGES'){
      // Persist local F-scoped intent even when Git or the provider is
      // unavailable. Admission and every later effect have fresh guards.
      const [stage,job,existing]=await Promise.all([
        stageFactory(database).getFull(p.slug),aiFactory(database).getJobFull(p.slug),store.get(p.slug)]);
      if(!stage.ok||!job.ok||p.expectedStageRevision!==stage.record.revision||
         p.expectedJobRevision!==job.job.revision)return fail('S06_REQUEST_PREVIEW_STALE');
      const saved=await exactSource(job.job.finalSource?.blobs);
      if(!saved.ok||saved.fingerprint!==p.sourceFingerprint||saved.fingerprint!==job.job.sourceFingerprint)
        return fail('S06_REQUEST_PREVIEW_STALE');
      if(p.releaseRevision!==(existing.ok?existing.revision:undefined))
        return fail('S06_REQUEST_RELEASE_REVISION_STALE');
      return createS06ChangeStore(database).request({name:p.slug,stage:stage.record,job:job.job,
        expectedStageRevision:p.expectedStageRevision,expectedJobRevision:p.expectedJobRevision,
        sourceFingerprint:p.sourceFingerprint,instructions:p.instructions,
        releaseRevision:existing.ok?existing.revision:null,
        requestId:'change_'+crypto.randomUUID().replaceAll('-','')});
    }
    const token=await vaultToken(p.token);
    if(!token)return fail('S06_GIT_VAULT_UNAVAILABLE');
    if(msg.type==='DISPATCH'){
      const [release,job,stage]=await Promise.all([store.getFull(p.slug),aiFactory(database).getJobFull(p.slug),stageFactory(database).getFull(p.slug)]);
      if(release.ok&&release.record.state==='APPROVED'&&release.record.revision===p.expectedRevision&&job.ok&&stage.ok&&
        job.job.exceptionQuiescence==='NEVER_DISPATCHED_SOURCE'&&!job.job.native){
        if(effectGate({phase:'I13',record:release.record})!==true)return fail('PUBLICATION_ACTIVATION_HELD');
        const prepared=await guard()?.prepareManualEditor?.(stage.record.personaUid,p.slug,stage.record.nonce);
        if(!prepared?.ok)return fail(prepared?.code||'MANUAL_PUBLICATION_EDITOR_PENDING');
      }
    }
    const checked=await checkCurrent(database,p.slug,token,{physicalManualEditor:msg.type==='DISPATCH',allowPausedReview:msg.type==='PREVIEW'});
    if(!checked.ok)return checked;
    const change=await createS06ChangeStore(database).get(p.slug);
    if(change.ok&&change.state==='REQUESTED'&&change.parentStageRevision===checked.r.revision)
      return fail('S06_PENDING_REQUEST_BLOCKS_APPROVAL');
    if(msg.type==='PREVIEW'){
      return {ok:true,slug:p.slug,stageRevision:checked.r.revision,
        operatorPaused:checked.j.operatorPaused===true,jobRevision:checked.j.revision,sourceFingerprint:checked.source.fingerprint,
        previousFingerprint:checked.previous.fingerprint,files:checked.source.files,
        priorFiles:checked.previous.files,
        promptRevision:checked.j.prompt.revision,
        testingSha:checked.j.optionalTesting?.sha256||null,
        tests:{default:checked.j.prompt.tests.map(name=>({name,
          result:checked.j.chat1.tests[name]?.result||'UNVERIFIED'})),
          optional:checked.j.optionalTesting?.tests?.map(name=>({name,
            result:checked.j.chat2?.tests[name]?.result||'UNVERIFIED'}))||[],
          state:evaluation(checked.j).state},
        diff:diffSource(checked.previous,checked.source).changes,
        gitHead:checked.git.head,
        releaseRevision:(await store.get(p.slug))?.revision||null,
        mode:checked.testContext.mode==='EXCEPTION_MANUAL_REVIEW'?
          'INDIVIDUAL_EXCEPTIONAL_MANUAL_REVIEW':'INDIVIDUAL_HUMAN_APPROVAL',
        aiVerified:checked.testContext.mode==='VERIFIED_AI',
        exceptionEvidenceMode:checked.testContext.evidenceMode||null,
        warning:checked.testContext.mode==='EXCEPTION_MANUAL_REVIEW'?
          'EXCEPTIONAL MANUAL/INCOMPLETE TESTING: AI verified tests remain UNVERIFIED. Confirm the exact manual checks, incomplete Chat 2 warning and F before individual approval; a green review is NOT a test PASS.':
          'Approval alone cannot publish; remote effects held until proven'};
    }
    if(msg.type==='APPROVE'){
      if(p.expectedStageRevision!==checked.r.revision||
         p.expectedJobRevision!==checked.j.revision||
         p.fingerprint!==checked.source.fingerprint)return fail('APPROVAL_VIEW_STALE');
      if(checked.kind==='EXISTING_UPDATE'&&
         checked.existing.stagedFingerprint!==checked.source.fingerprint){
        const stored=await createExistingStore(database).setFinal(p.slug,
          checked.existing.revision,checked.source);
        if(!stored.ok)return stored;
      }
      const facts=await ownerFacts(database,p.slug);
      return store.approve({approval:{ok:true,tuple:checked.approval},
        stage:checked.r,job:checked.j,account:facts.account,
        inventory:facts.inventory,source:checked.source,
        previous:checked.previous,kind:checked.kind,
        bulkAuthorization:msg.bulkAuthorization===undefined?null:msg.bulkAuthorization,
        releaseId:'release_'+crypto.randomUUID().replaceAll('-','')});
    }
    if(msg.type==='DISPATCH'){
      const stored=await store.getFull(p.slug);
      if(!stored.ok||stored.record.revision!==p.expectedRevision)
        return fail('STALE_RELEASE');
      if(!matchesApproval(stored.record.approval,checked.approval).ok)
        return fail('APPROVAL_STALE');
      if(checked.kind==='EXISTING_UPDATE'&&
         checked.existing.stagedFingerprint!==checked.source.fingerprint)
        return fail('EXISTING_FINAL_F_NOT_PINNED');
      if(typeof guard()?.runReleaseStep!=='function')
        return fail('RELEASE_EXECUTOR_UNAVAILABLE');
      if(effectGate({phase:'I13',record:stored.record})!==true)
        return fail('PUBLICATION_ACTIVATION_HELD');
      // The dispatch-possible transition commits *before* the only effect.
      const armed=await store.markDispatch(p.slug,p.expectedRevision,checked.approval);
      if(!armed.ok)return armed;
      if(effectGate({phase:'I13',record:stored.record})!==true||
         (await sentinel.inspect()).held)return store.settle(p.slug,armed.revision,
           {reason:'ACTIVATION_REVOKED_AFTER_DISPATCH_MARK'});
      let attempt;
      try{attempt=await dispatch(guard(),{...checked.r,releaseFiles:checked.source.blobs});}
      catch{attempt=fail('PUBLISH_RESPONSE_UNKNOWN');}
      // Even ACK is NOT public proof. Reconcile with a fresh remote read,
      // and never automatically retry a possible publication effect.
      const held=await store.settle(p.slug,armed.revision,{
        reason:attempt?.code||'INDEPENDENT_PUBLICATION_READBACK_REQUIRED'});
      return held.ok?{...held,ack:attempt?.ok===true?'UNVERIFIED_ACK':'UNKNOWN'}:held;
    }
    return fail('COMMAND_NOT_ALLOWED');
  }
  async function run(msg,sender){
    const auth=validateReleaseMessage(api,sender,msg);
    if(!auth.ok)return auth;
    try{return await runTrusted(msg);}
    catch{return fail('RELEASE_CANONICAL_HOLD');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==RELEASE_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(msg,port.sender))
          .then(out=>{try{port.postMessage(out);}catch{}})
          .catch(()=>{try{port.postMessage(fail('RELEASE_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run,runTrusted:async msg=>{
    if(!['GET','PREVIEW','APPROVE','DISPATCH','RECONCILE'].includes(msg?.type))return fail('COMMAND_NOT_ALLOWED');
    try{return await runTrusted(msg)}catch{return fail('RELEASE_CANONICAL_HOLD')}
  }});
}
if(typeof browser!=='undefined')createReleaseBoundary(browser,{
  effectGate:()=>standingS06?.gate('publication')===true}).register();
