// I09 private-only stage orchestration. UI cannot supply tab ids, page code,
// source bytes, route or operation proof. There is NO automatic retry of a
// possible provider write, including after a Firefox restart.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createStagingStore,findEligibleSupply} from './staging-store.mjs';
import {exactSource,verifyReadback} from './staging-core.mjs';
import {inspectGitSource} from './git-source.mjs';

export const STAGING_PORT='pcms-i09-staging';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const actions=new Set(['LIST_STAGES','GET_STAGE','PIN_STAGE','STAGE_PRIVATE','RECONCILE_STAGE','HANDOFF_STAGE','ARM_DISPOSABLE_STAGE']);
const disposable=/^pcms-test-[a-z0-9-]{8,88}$/;
export function validateStagingMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;
  try{json=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!message||typeof message!=='object'||Array.isArray(message)||
     typeof json!=='string'||json.length>1200||
     Object.keys(message).some(k=>!['type','params'].includes(k))||
     !actions.has(message.type))return fail('INVALID_MESSAGE');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='LIST_STAGES'?[]:
    ['PIN_STAGE','STAGE_PRIVATE'].includes(message.type)?['slug','token','expectedRevision']:
    message.type==='ARM_DISPOSABLE_STAGE'?['slug','expectedRevision','confirmation']:
    message.type==='GET_STAGE'?['slug']:['slug','expectedRevision'];
  if(Object.keys(p).some(k=>!allowed.includes(k))||
     (message.type!=='LIST_STAGES'&&!SLUG.test(p.slug||''))||
     (['PIN_STAGE','STAGE_PRIVATE'].includes(message.type)&&
       (typeof p.token!=='string'||p.token.length<10||p.token.length>512))||
     (['STAGE_PRIVATE','RECONCILE_STAGE','HANDOFF_STAGE','ARM_DISPOSABLE_STAGE'].includes(message.type)&&
       (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))||
     (message.type==='ARM_DISPOSABLE_STAGE'&&
       (typeof p.confirmation!=='string'||p.confirmation.length>120)))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
const b64=s=>{
  let binary='';const bytes=new TextEncoder().encode(s);
  for(let i=0;i<bytes.length;i+=8192)
    binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
};
function asEvidence(packet,r){
  const o=packet?.original;
  return {ok:packet?.ok===true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
    slug:r.slug,accountId:r.accountId,personaUid:r.personaUid,
    principalFingerprint:packet?.principalFingerprint,
    remotePublicId:o?.remotePublicId,ownerResult:o?.ownerResult,
    visibility:o?.visibility,pjs:o?.pjs,html:o?.html,assets:o?.assets};
}
async function readPrevious(guard,r) {
  const p=await guard.observeReadOnly(r.personaUid,false,r.slug);
  if(p?.ok!==true||p.principalFingerprint!==r.principalFingerprint)
    return fail('OWNER_SOURCE_UNVERIFIED');
  const v=asEvidence(p,r);
  if(v.remotePublicId!==r.remotePublicId||v.visibility!=='UNLISTED'||
     v.ownerResult!=='IS_OWNER'||!Array.isArray(v.assets)||
     typeof v.pjs!=='string'||typeof v.html!=='string')
    return fail('PRIVATE_EMPTY_OWNER_UNVERIFIED');
  const source=await exactSource([
    {path:'main.pjs',base64:b64(v.pjs)},
    {path:'index.html',base64:b64(v.html)},
    ...v.assets
  ]);
  return source.ok?{ok:true,source,packet:v}:source;
}
const recordContext=r=>({slug:r.slug,accountId:r.accountId,personaUid:r.personaUid,
  principalFingerprint:r.principalFingerprint,remotePublicId:r.remotePublicId});

export function createStagingBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,inspect=inspectGitSource,
  // Packaged provider capability remains locked until current guarded editor
  // contract is independently proven and operator activation is authorized.
  effectGate=()=>false,storeFactory=createStagingStore,
  pilotClock=()=>performance.now(),supplyLookup=findEligibleSupply
}={}){
  let databasePromise;
  const database=()=>databasePromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  // In-memory, exact-target one-step operator authority. Event-page
  // suspension, timeout, or a first possible effect invalidates the arm.
  let pilotArm=null;
  const stagePilotMatches=r=>{
    const a=pilotArm;
    return !!a&&pilotClock()<a.expiresAt&&a.slug===r.slug&&
      a.revision===r.revision&&a.state===r.state&&a.state==='PINNED'&&
      a.accountId===r.accountId&&a.accountRevision===r.accountRevision&&
      a.bindingVersion===r.bindingVersion&&a.personaUid===r.personaUid&&
      a.remotePublicId===r.remotePublicId&&a.principalFingerprint===r.principalFingerprint&&
      a.nonce===r.nonce&&a.candidateFingerprint===r.candidate.fingerprint&&
      a.gitFingerprint===r.gitFingerprint;
  };
  const stageAuthorized=r=>effectGate({phase:'I09',stage:r})===true||stagePilotMatches(r);
  async function armDisposableStage(s,r,p,g){
    if(r.state!=='PINNED')return fail('STAGE_NOT_PINNED');
    if(!disposable.test(r.slug))return fail('PILOT_DISPOSABLE_SLUG_REQUIRED');
    if(p.confirmation!=='STAGE '+r.slug)return fail('PILOT_CONFIRMATION_REQUIRED');
    if(pilotArm&&pilotClock()<pilotArm.expiresAt)return fail('PILOT_ALREADY_ARMED');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const eligible=await supplyLookup(await database(),r.slug);
    if(!eligible.ok||eligible.account.accountId!==r.accountId||
       eligible.account.revision!==r.accountRevision||
       eligible.account.personaUid!==r.personaUid||
       eligible.account.bindingVersion!==r.bindingVersion||
       eligible.account.identity?.principalFingerprint!==r.principalFingerprint||
       eligible.item.remoteId!==r.remotePublicId)
      return fail('TARGET_CONTEXT_CHANGED');
    const route=await g.getSafeRouteReadiness(r.personaUid);
    if(!route?.ready||!route.routeId||!route.cookieStoreId)
      return fail(route?.code||'PROTECTED_ROUTE_UNVERIFIED');
    const still=await s.getFull(r.slug);
    if(!still.ok||still.record.revision!==r.revision||
       still.record.state!=='PINNED'||
       (await sentinel.inspect()).held)return fail('STAGE_CONTEXT_CHANGED');
    pilotArm={slug:r.slug,revision:r.revision,state:r.state,
      accountId:r.accountId,accountRevision:r.accountRevision,
      bindingVersion:r.bindingVersion,personaUid:r.personaUid,
      remotePublicId:r.remotePublicId,principalFingerprint:r.principalFingerprint,
      nonce:r.nonce,candidateFingerprint:r.candidate.fingerprint,
      gitFingerprint:r.gitFingerprint,routeId:route.routeId,
      cookieStoreId:route.cookieStoreId,expiresAt:pilotClock()+120000};
    return {ok:true,scope:'SINGLE_DISPOSABLE_PRIVATE_STAGE',expiresInSeconds:120};
  }
  async function statusFor(msg,s){
    const p=msg.params||{};
    if(msg.type==='LIST_STAGES')return s.list();
    if(msg.type==='GET_STAGE')return s.get(p.slug);
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const g=guard();
    if(!g?.observeReadOnly||!g?.getSafeRouteReadiness)
      return fail('DONOR_GUARD_UNAVAILABLE');
    if(msg.type==='PIN_STAGE'){
      const eligible=await supplyLookup(await database(),p.slug);
      if(!eligible.ok)return eligible;
      const {item,account,link}=eligible;
      const route=await g.getSafeRouteReadiness(account.personaUid);
      if(!route?.ready)return fail(route?.code||'ROUTE_UNVERIFIED');
      const fresh=await inspect({folder:link.folder,token:p.token,includeSourceBytes:true});
      if(!fresh.ok||!fresh.ready)return fail('READY_REVOKED_OR_CHANGED');
      const candidate=await exactSource(fresh.sourceBytes);
      if(!candidate.ok)return candidate;
      const owner={slug:p.slug,accountId:account.accountId,personaUid:account.personaUid,
        remotePublicId:item.remoteId,principalFingerprint:account.identity.principalFingerprint};
      const baseline=await readPrevious(g,owner);
      if(!baseline.ok)return baseline;
      if(baseline.source.files.length!==2||baseline.source.files.some(f=>f.size!==0))
        return fail('NOT_PRIVATE_EMPTY_NEW_TARGET');
      const routeAfter=await g.getSafeRouteReadiness(account.personaUid);
      if(!routeAfter?.ready||routeAfter.cookieStoreId!==route.cookieStoreId||
         routeAfter.routeId!==route.routeId)return fail('ROUTE_CHANGED');
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      return s.pin({slug:p.slug,candidate,previous:baseline.source,source:fresh,
        eligibility:eligible,nonce:crypto.randomUUID().replaceAll('-','')});
    }
    const stored=await s.getFull(p.slug);
    if(!stored.ok)return stored;
    const r=stored.record;
    if(r.revision!==p.expectedRevision)return fail('STALE_REVISION');
    if(msg.type==='ARM_DISPOSABLE_STAGE')
      return armDisposableStage(s,r,p,g);
    if(msg.type==='HANDOFF_STAGE'){
      if(r.state==='HUMAN_OWNED')return {ok:true,state:'HUMAN_OWNED'};
      // Commit durable human intent FIRST. If crash, no automatic cleanup or
      // readmission; a tab with lost ownership evidence must remain open.
      const held=await s.move(r.slug,r.revision,'HANDOFF_REQUESTED',
        {reason:'HUMAN_TAKEOVER'});
      if(!held.ok)return held;
      if(!g.releaseStagingTab)return fail('HANDOFF_RELEASE_UNVERIFIED');
      let released;
      try{released=await g.releaseStagingTab(r.personaUid,r.slug,r.nonce);}
      catch{return fail('HANDOFF_RELEASE_UNVERIFIED');}
      if(released?.ok!==true)return fail('HANDOFF_RELEASE_UNVERIFIED');
      return s.move(r.slug,held.revision,'HUMAN_OWNED');
    }
    if(msg.type==='STAGE_PRIVATE'){
      if(r.state!=='PINNED')return fail('RECONCILIATION_REQUIRED');
      if(!stageAuthorized(r))
        return fail('PROVIDER_ACTIVATION_HELD');
      // READY is current effect admission, not an eternal property of an
      // earlier SOURCE_PENDING association. Compare only the pinned bytes.
      const current=await inspect({folder:r.sourceFolder,token:p.token});
      if(!current.ok||!current.ready||
         current.fingerprint!==r.gitFingerprint||
         current.testingSha!==r.testingSha)
        return fail('READY_REVOKED_OR_CHANGED');
      const pinnedBytes=await exactSource(r.candidate.blobs);
      if(!pinnedBytes.ok||pinnedBytes.fingerprint!==r.candidate.fingerprint)
        return fail('PINNED_SOURCE_BYTES_CHANGED');
      const eligible=await supplyLookup(await database(),r.slug);
      if(!eligible.ok||eligible.account.accountId!==r.accountId||
         eligible.account.revision!==r.accountRevision||
         eligible.item.remoteId!==r.remotePublicId)
        return fail('TARGET_CONTEXT_CHANGED');
      const guarded=await g.getSafeRouteReadiness(r.personaUid);
      if(!guarded?.ready)return fail(guarded?.code||'ROUTE_UNVERIFIED');
      if(stagePilotMatches(r)&&
         (pilotArm.routeId!==guarded.routeId||
          pilotArm.cookieStoreId!==guarded.cookieStoreId))
        return fail('PILOT_ROUTE_CHANGED');
      const original=await readPrevious(g,r);
      if(!original.ok||original.source.fingerprint!==r.previous.fingerprint)
        return fail('REMOTE_SOURCE_DRIFT');
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      let intent=await s.move(r.slug,r.revision,'PREPARED');
      if(!intent.ok)return intent;
      if(!stageAuthorized(r)){
        pilotArm=null;
        await s.move(r.slug,intent.revision,'PINNED',{reason:'ACTIVATION_REVOKED'});
        return fail('PROVIDER_ACTIVATION_HELD');
      }
      const again=await g.getSafeRouteReadiness(r.personaUid);
      if(!again?.ready||again.cookieStoreId!==guarded.cookieStoreId||
         again.routeId!==guarded.routeId){pilotArm=null;return fail('PREPARED_GUARD_CHANGED');}
      intent=await s.move(r.slug,intent.revision,'DISPATCH_POSSIBLE');
      if(!intent.ok)return intent;
      // Do not touch the remote after a lost permission/restore state. Since
      // DISPATCH_POSSIBLE committed, hold uncertain instead of reissuing.
      if(!stageAuthorized(r)||(await sentinel.inspect()).held){
        pilotArm=null;
        await s.move(r.slug,intent.revision,'HELD_UNCERTAIN',
          {reason:'ACTIVATION_REVOKED_AFTER_MARKER'});
        return fail('STAGING_HELD_BEFORE_DISPATCH');
      }
      if(stagePilotMatches(r))pilotArm=null;
      // Marker is committed; any transport failure is now ambiguous.
      let result;
      try{result=await g.runStageStep(r.personaUid,{
        slug:r.slug,nonce:r.nonce,remotePublicId:r.remotePublicId,
        previousFingerprint:r.previous.fingerprint,
        candidate:r.candidate.blobs
      });}catch{}
      const after=await s.getFull(r.slug);
      if(!after.ok||after.record.state!=='DISPATCH_POSSIBLE')return fail('STAGING_UNCERTAIN');
      if(result?.ok!==true){
        await s.move(r.slug,after.record.revision,'HELD_UNCERTAIN',
          {reason:result?.code||'STAGING_EFFECT_UNCERTAIN'});
        return fail('STAGING_EFFECT_UNCERTAIN');
      }
      const receipt=await s.move(r.slug,after.record.revision,'SAVED_UNVERIFIED',{
        tab:result.tab,reason:'INDEPENDENT_READBACK_REQUIRED'});
      return receipt.ok?{...receipt,verified:false}:receipt;
    }
    if(!['DISPATCH_POSSIBLE','HELD_UNCERTAIN','SAVED_UNVERIFIED'].includes(r.state))
      return fail('RECONCILIATION_NOT_REQUIRED');
    const guarded=await g.getSafeRouteReadiness(r.personaUid);
    if(!guarded?.ready)return fail(guarded?.code||'ROUTE_UNVERIFIED');
    const observed=await g.observeReadOnly(r.personaUid,false,r.slug);
    const proof=await verifyReadback(r.candidate,asEvidence(observed,r),recordContext(r));
    if(!proof.ok)return {ok:false,code:proof.code||'SOURCE_UNVERIFIED',
      ...(proof.paths?{paths:proof.paths}:{} )};
    // A remote saved response does not prove the human editor is clean.
    // Missing/stale tab nonce, collaboration state or buffered edits retain
    // an independent, scope-local hold even after byte-exact saved readback.
    const editor=await g.inspectStageEditor?.(r.personaUid,r.slug,r.nonce);
    if(!editor?.ok||editor.clean!==true)
      return fail(editor?.code||'EDITOR_UNKNOWN');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    return s.move(r.slug,r.revision,'SOURCE_VERIFIED',{verified:proof});
  }
  async function run(message,sender){
    const auth=validateStagingMessage(api,sender,message);
    if(!auth.ok)return auth;
    try{return await statusFor(message,storeFactory(await database()));}
    catch{return fail('STAGING_CANONICAL_HOLD');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==STAGING_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(msg,port.sender))
          .then(v=>{try{port.postMessage(v);}catch{}})
          .catch(()=>{try{port.postMessage(fail('STAGING_CANONICAL_HOLD'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });

    // The editor strip is a content script in one EXACT PCMS-tagged tab.
    // Web page JS cannot request privileged handoff by forging a port sender.
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!=='pcms-i09-editor-handoff')return;
      const sender=port.sender,tab=sender?.tab;
      const tabURL=typeof sender?.url==='string'?sender.url:'';
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve().then(async()=>{
          if(sender?.id!==api.runtime.id||!Number.isSafeInteger(tab?.id)||
             typeof msg?.slug!=='string'||!SLUG.test(msg.slug)||
             typeof msg.nonce!=='string'||!/^[a-f0-9]{32}$/.test(msg.nonce)||
             tabURL!=='https://perchance.org/'+msg.slug+'#edit'||
             Object.keys(msg).some(k=>!['slug','nonce'].includes(k)))
            return fail('UNTRUSTED_EDITOR');
          const tag=await api.sessions?.getTabValue(tab.id,'pcmsI09Owned');
          const actual=await api.tabs.get(tab.id);
          if(tag?.nonce!==msg.nonce||tag.slug!==msg.slug||
             tag.createdBy!=='PCMS_I09'||actual?.cookieStoreId!==tag.cookieStoreId||
             actual?.url!==tabURL)return fail('TAB_OWNER_UNKNOWN');
          const db=await database(),store=storeFactory(db),saved=await store.getFull(msg.slug);
          if(!saved.ok)return saved;
          const record=saved.record;
          if(record.nonce!==msg.nonce||record.personaUid!==tag.personaUid||
             record.state==='HUMAN_OWNED')return fail('HANDOFF_CONTEXT_CHANGED');
          if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
          // Durable intent precedes untag. If interrupted, tab must survive
          // and no auto retry of a dirty/ambiguous editor may occur.
          const next=await store.move(msg.slug,record.revision,
            'HANDOFF_REQUESTED',{reason:'HUMAN_TAKEOVER'});
          if(!next.ok)return next;
          const release=await guard()?.releaseStagingTab?.(record.personaUid,msg.slug,msg.nonce);
          if(release?.ok!==true)return fail('HANDOFF_RELEASE_UNVERIFIED');
          return store.move(msg.slug,next.revision,'HUMAN_OWNED');
        }).then(v=>{try{port.postMessage(v);}catch{}})
          .catch(()=>{try{port.postMessage(fail('HANDOFF_UNVERIFIED'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });

    // Never repeat dispatch after restart. HOLD possible effect; keep tabs.
    Promise.resolve().then(async()=>{
      if(!(await sentinel.inspect()).held)
        await storeFactory(await database()).recover();
    }).catch(()=>{});
  }
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createStagingBoundary(browser).register();
