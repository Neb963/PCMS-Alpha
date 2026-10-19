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
import {createExistingStore} from './existing-update-store.mjs';
import {unlockPrevious} from './existing-update-core.mjs';
import {REFRESHER_KEY} from './refresher-core.mjs';
import {evaluation} from './ai-evidence.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {inspectGitSource} from './git-source.mjs';
import {exactSource,diffSource} from './staging-core.mjs';
import {releaseContext,releaseTestContext,candidateManifest,releaseGitContext,
  releaseEditorContext,approvalTuple,matchesApproval,publicationReadback}
  from './release-core.mjs';
export const RELEASE_PORT='pcms-i13-release';
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const TYPES=new Set(['LIST','LIST_REVIEW','GET','PREVIEW','GET_REVIEW_CHUNK','APPROVE','CANCEL_APPROVED','DISPATCH','RECONCILE']);
export function validateReleaseMessage(api,sender,msg){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(msg);}catch{return fail('INVALID_MESSAGE');}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||!json||json.length>1800||
     Object.keys(msg).some(k=>!['type','params'].includes(k))||!TYPES.has(msg.type))
    return fail('INVALID_MESSAGE');
  const p=msg.params||{},allowed={
    LIST:[],LIST_REVIEW:['after','limit'],GET:['slug'],PREVIEW:['slug','token','passphrase'],
    GET_REVIEW_CHUNK:['slug','stageRevision','fingerprint','origin','path','offset'],
    APPROVE:['slug','token','expectedStageRevision','expectedJobRevision','fingerprint','explicitApproval','passphrase'],
    CANCEL_APPROVED:['slug','expectedRevision'],
    DISPATCH:['slug','token','expectedRevision','passphrase'],
    RECONCILE:['slug','token','expectedRevision']
  };
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).some(k=>!allowed[msg.type].includes(k))||
     (!['LIST','LIST_REVIEW'].includes(msg.type)&&!slug(p.slug))||
     (msg.type==='LIST_REVIEW'&&(
       (p.after!==undefined&&(typeof p.after!=='string'||p.after.length>100||
         !/^(?:[a-z0-9][a-z0-9-]{0,99})?$/.test(p.after)))||
       (p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100))))||
     (['PREVIEW','APPROVE','DISPATCH','RECONCILE'].includes(msg.type)&&
       (p.token!==undefined&&(typeof p.token!=='string'||p.token.length<12||
        p.token.length>512||!/^[\x21-\x7e]+$/.test(p.token))))||
     (p.passphrase!==undefined&&(typeof p.passphrase!=='string'||p.passphrase.length<12||p.passphrase.length>256))||
     (msg.type==='GET_REVIEW_CHUNK'&&(
       !Number.isSafeInteger(p.stageRevision)||p.stageRevision<1||
       !fp(p.fingerprint)||!['F','P'].includes(p.origin)||
       typeof p.path!=='string'||p.path.length>240||
       !/^(?:main\.pjs|index\.html|src\/[A-Za-z0-9._/-]+)$/.test(p.path)||
       !Number.isSafeInteger(p.offset)||p.offset<0||p.offset>16*1024*1024||
       p.offset%8192!==0))||
     (['DISPATCH','RECONCILE','CANCEL_APPROVED'].includes(msg.type)&&
       (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))||
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
  native=p=>api.runtime.sendNativeMessage('local.pcms.backup_vault',p),
  dispatch=async(g,r)=>g.runReleaseStep?.(r.personaUid,{
    slug:r.slug,nonce:r.nonce,action:'PUBLISH',remotePublicId:r.remotePublicId,
    principalFingerprint:r.principalFingerprint,files:r.releaseFiles})
}={}){
  let dbPromise;
  const db=()=>dbPromise ||=open().catch(e=>{dbPromise=null;throw e;});
  const sentinel=createRestoreSentinel(api.storage.local);
  async function vaultToken(explicit){
    if(typeof explicit==='string'&&explicit.length>=12)return explicit;
    const cfg=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
    if(cfg?.repository!=='Neb963/per-gens'||
       !/^[1-9][0-9]{0,19}$/.test(cfg.repositoryId||''))return null;
    const reply=await native({action:'git.get',repositoryId:cfg.repositoryId});
    return reply?.ok&&typeof reply.credential==='string'&&
      reply.credential.length>=12&&reply.credential.length<=512&&
      /^[\x21-\x7e]+$/.test(reply.credential)?reply.credential:null;
  }
  async function reviewPassphrase(explicit){
    if(typeof explicit==='string'&&explicit.length>=12)return explicit;
    const reply=await native({action:'get'});
    return reply?.ok&&typeof reply.passphrase==='string'&&
      reply.passphrase.length>=12&&reply.passphrase.length<=256?
      reply.passphrase:null;
  }
  async function checkCurrent(database,name,token,{requireEditor=true,passphrase=null}={}){
    const stage=await stageFactory(database).getFull(name),
      job=await aiFactory(database).getJobFull(name),
      facts=await ownerFacts(database,name);
    if(!stage.ok||!job.ok||!facts.ok)return fail('RELEASE_CANONICAL_EVIDENCE_MISSING');
    const r=stage.record,j=job.job,{account,inventory}=facts;
    const owner=releaseContext(r,account,inventory),tests=releaseTestContext(r,j);
    if(!owner.ok)return owner;
    if(!tests.ok)return tests;
    const privateNew=r.previous?.files?.length===2&&
      r.previous.files.every(f=>f.size===0);
    const existingRow=privateNew?null:
      await createExistingStore(database).getFull(name);
    if(!privateNew){
      if(!existingRow?.ok||existingRow.record.state!=='STAGE_CONFIRMED'||
         existingRow.record.nonce!==r.nonce||
         existingRow.record.previousFingerprint!==r.previous.fingerprint||
         existingRow.record.remotePublicId!==r.remotePublicId||
         existingRow.record.accountRevision!==r.accountRevision||
         existingRow.record.bindingVersion!==r.bindingVersion||
         !existingRow.record.stageSource?.ok)
        return fail('EXISTING_STAGE_OR_FINAL_F_UNVERIFIED');
      const unlocked=await unlockPrevious(existingRow.record.recovery,passphrase);
      if(!unlocked.ok||unlocked.source.fingerprint!==r.previous.fingerprint)
        return fail('EXISTING_RECOVERY_DECRYPTION_REQUIRED');
      const shadow=await new Promise((resolve,reject)=>{
        const tx=database.transaction('meta','readonly');
        const req=tx.objectStore('meta').get(REFRESHER_KEY);
        req.onsuccess=()=>resolve(req.result?.state);
        req.onerror=()=>reject(Error('SHADOW_READ_FAILED'));
      });
      const row=shadow?.rows?.find(v=>v.slug===name);
      if(!row||row.phase!=='SLEEPING'||row.slot===true||
         row.paused===true||shadow.globalPause===true||
         shadow.accounts?.[r.accountId]?.paused===true||
         row.remoteId!==r.remotePublicId||row.bindingVersion!==r.bindingVersion)
        return fail('EXISTING_SLEEP_REVOKED');
    }
    if(inventory.visibility!=='UNLISTED')
      return fail('UNLISTED_LISTING_OBSERVATION_REQUIRED');
    const source=await candidateManifest(r,j);
    if(!source.ok)return source;
    // The accepted READY workflow cannot be released merely because the
    // old I13 candidate seems locally tested. The *same* S05 revision must
    // have an independently attributed, byte-confirmed Git main commit.
    const ready=await createReadyStore(database).get(name);
    if(ready.ok){
      const wb=await createWritebackStore(database).getFull(name);
      const check=planS06Writeback({ready,stage,job,writeback:wb.ok?wb:null});
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
    const native=await g.runNativeAiStep(r.personaUid,{
      slug:r.slug,nonce:r.nonce,action:'OBSERVE'});
    const editor=await g.inspectStageEditor(r.personaUid,r.slug,r.nonce);
    const safe=releaseEditorContext({stage:r,route,previousRoute:route,native,editor});
    if(requireEditor&&!safe.ok)return safe;
    if(native?.sessionDigest!==j.native?.sessionDigest)
      return fail('AI_SESSION_CHANGED');
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
      previous,kind:privateNew?'PRIVATE_NEW':'EXISTING_UPDATE'});
    if(!approved.ok)return approved;
    return {ok:true,r,j,source,previous,approval:approved.tuple,
      kind:privateNew?'PRIVATE_NEW':'EXISTING_UPDATE',existing:existingRow?.record,
      editor,route:after,remote,git};
  }
  async function runTrusted(msg){
    const p=msg.params||{},database=await db(),store=releaseFactory(database);
    if(msg.type==='GET')return store.get(p.slug);
    if(msg.type==='LIST')return store.list();
    if(msg.type==='LIST_REVIEW')return createS06ReviewQueue(database).list({
      after:p.after||'',limit:p.limit||50});
    if(msg.type==='GET_REVIEW_CHUNK'){
      // Source is taken only from sealed canonical stage/job. Read-only,
      // revision-fenced review never grants publisher or Git authority.
      const stage=await stageFactory(database).getFull(p.slug),
        job=await aiFactory(database).getJobFull(p.slug);
      if(!stage.ok||!job.ok||stage.record.revision!==p.stageRevision||
         stage.record.slug!==p.slug||!releaseTestContext(stage.record,job.job).ok)
        return fail('REVIEW_OUTDATED');
      const f=await candidateManifest(stage.record,job.job);
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
    const token=await vaultToken(p.token);
    if(!token)return fail('S06_GIT_VAULT_UNAVAILABLE');
    if(msg.type==='RECONCILE'){
      const row=await store.getFull(p.slug);
      if(!row.ok||row.record.revision!==p.expectedRevision)return fail('STALE_RELEASE');
      const r=row.record;
      if(r.state==='CONFIRMED_PUBLIC')return store.get(p.slug);
      if(!['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(r.state))
        return fail('RECONCILIATION_NOT_REQUIRED');
      const g=guard(),route=await g.getSafeRouteReadiness(r.approval.personaUid);
      if(!route?.ready)return fail('PROTECTED_ROUTE_UNVERIFIED');
      const fresh=await inspect({token,folder:r.approval.gitFolder,includeSourceBytes:true});
      if(!releaseGitContext({sourceFolder:r.approval.gitFolder,
        testingSha:r.approval.gitTestingSha},fresh).ok)
        return fail('READY_REVOKED');
      const fromGit=await exactSource(fresh.sourceBytes);
      if(!fromGit.ok||fromGit.fingerprint!==r.approval.sourceFingerprint)
        return fail('GIT_F_CHANGED');
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
    const checked=await checkCurrent(database,p.slug,token,{
      passphrase:await reviewPassphrase(p.passphrase)});
    if(!checked.ok)return checked;
    if(msg.type==='PREVIEW'){
      return {ok:true,slug:p.slug,stageRevision:checked.r.revision,
        jobRevision:checked.j.revision,sourceFingerprint:checked.source.fingerprint,
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
        gitHead:checked.git.head,mode:'INDIVIDUAL_HUMAN_APPROVAL',
        warning:'Approval alone cannot publish; remote effects held until proven'};
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
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createReleaseBoundary(browser).register();
