// I06: guarded, canonical reservation admission. No web page, untrusted UI,
// or generic public donor API can invoke a provider write. Provider execution
// remains held until a separately proven, explicit capability gate activates.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId} from './journal.mjs';
import {createSupplyStore} from './supply-store.mjs';
import {createAccountStore} from './accounts.mjs';
import {freezeSupply,validateOwnerContext,publicSupply} from './supply-plan.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {writeNonReadyFolder,readNonReadyFolder,markerRequestAllowed} from './supply-git.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
export const SUPPLY_PORT='pcms-i06-supply';
const commands=new Set(['PREVIEW','FREEZE','GET_BATCH','LIST_BATCHES','EXECUTE_ITEM',
  'RECONCILE_ITEM','FINISH_SOURCE_FOLDER','RECONCILE_GIT',
  'ABORT_PREPARED','ARM_DISPOSABLE_TEST','ARM_DISPOSABLE_GIT','ARM_EXACT_ITEM','ARM_EXACT_GIT','ARM_EXACT_ITEM','ARM_EXACT_GIT','ARM_EXACT_ITEM','ARM_EXACT_GIT','ARM_EXACT_ITEM','ARM_EXACT_GIT']);
const hex=/^[a-f0-9]{64}$/;
// Only a disposable, explicitly named target may be tested live. This does
// not qualify general generator supply, Git writeback or publication.
const disposable=/^pcms-test-[a-z0-9-]{8,88}$/;
export function validateSupplyMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!message||typeof message!=='object'||Array.isArray(message)||
     typeof json!=='string'||json.length>12500||
     Object.keys(message).some(k=>!['type','params'].includes(k))||
     !commands.has(message.type))return fail('CAPABILITY_OFF');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='PREVIEW'||message.type==='FREEZE'
    ?['accountId','expectedAccountRevision','slugs','batchId']:
    message.type==='GET_BATCH'?['batchId']:
    message.type==='LIST_BATCHES'?[]:
    ['FINISH_SOURCE_FOLDER','RECONCILE_GIT'].includes(message.type)?
      ['batchId','itemId','expectedRevision','token']:
    ['ARM_DISPOSABLE_TEST','ARM_DISPOSABLE_GIT'].includes(message.type)?
      ['batchId','itemId','expectedRevision','confirmation']:
    ['batchId','itemId','expectedRevision'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(message.type==='PREVIEW'||message.type==='FREEZE'){
    if(!isSafeId(p.accountId)||!Number.isSafeInteger(p.expectedAccountRevision)||
       p.expectedAccountRevision<1||!Array.isArray(p.slugs)||p.slugs.length<1||
       p.slugs.length>100||p.slugs.some(s=>typeof s!=='string'||s.length>120)||
       (message.type==='FREEZE'&&(!isSafeId(p.batchId)||p.batchId.length>95)))
      return fail('INVALID_PARAMS');
  }else if(message.type==='GET_BATCH'&&!isSafeId(p.batchId))
    return fail('INVALID_PARAMS');
  else if(['EXECUTE_ITEM','RECONCILE_ITEM','FINISH_SOURCE_FOLDER','ABORT_PREPARED',
    'ARM_DISPOSABLE_TEST','ARM_DISPOSABLE_GIT','RECONCILE_GIT'].includes(message.type)&&
    (!isSafeId(p.batchId)||!isSafeId(p.itemId)||
     !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))
    return fail('INVALID_PARAMS');
  if(['FINISH_SOURCE_FOLDER','RECONCILE_GIT'].includes(message.type)&&
    (typeof p.token!=='string'||p.token.length>512))return fail('INVALID_PARAMS');
  if(['ARM_DISPOSABLE_TEST','ARM_DISPOSABLE_GIT'].includes(message.type)&&
    (typeof p.confirmation!=='string'||p.confirmation.length>120))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
async function fingerprint(parts){
  const data=new TextEncoder().encode(JSON.stringify(parts));
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
}
function redacted(out) {
  if(!out?.ok)return fail(out?.code||'SUPPLY_HELD');
  return {ok:true,itemId:out.item?.itemId,state:out.item?.state,
    revision:out.item?.revision,reason:out.item?.reason,
    source:out.item?.folder?'NON_READY_FOLDER':'SOURCE_PENDING'};
}
export function createSupplyBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  // Deliberately OFF in packaged extension. Tests must explicitly supply
  // an independently controlled synthetic gate and fake isolated executor.
  effectGate=()=>false,gitGate=()=>false,
  gitWrite=writeNonReadyFolder,gitRead=readNonReadyFolder,
  pilotClock=()=>performance.now(),
  makeStores=db=>({supply:createSupplyStore(db),accounts:createAccountStore(db)})
}={}){
  let dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const stores=()=>dbPromise ||=open().then(makeStores);
  // A pilot arm is never persisted. Firefox event-page suspension or restart
  // revokes it, and a possible dispatch consumes it before the remote call.
  let pilotArm=null,gitPilotArm=null;
  const pilotMatches=({account,batch,item})=>{
    const g=pilotArm;
    return !!g&&pilotClock()<g.expiresAt&&g.batchId===batch.batchId&&
      g.itemId===item.itemId&&g.itemRevision===item.revision&&
      g.itemState===item.state&&g.accountId===account.accountId&&
      g.accountRevision===account.revision&&
      g.bindingVersion===account.bindingVersion&&
      g.principalFingerprint===account.identity?.principalFingerprint;
  };
  const supplyAuthorized=ctx=>effectGate(ctx)===true||pilotMatches(ctx);
  const gitPilotMatches=({account,batch,item})=>{
    const a=gitPilotArm;
    return !!a&&pilotClock()<a.expiresAt&&
      a.batchId===batch.batchId&&a.itemId===item.itemId&&
      a.itemRevision===item.revision&&a.itemState===item.state&&
      a.accountId===account.accountId&&a.accountRevision===account.revision&&
      a.bindingVersion===account.bindingVersion&&
      a.principalFingerprint===account.identity?.principalFingerprint&&
      a.remoteId===item.remoteId;
  };
  const gitAuthorized=ctx=>gitGate(ctx)===true||gitPilotMatches(ctx);
  async function armDisposableGit(s,p){
    const found=await s.supply.get(p.batchId);
    if(!found.ok)return found;
    const b=found.batch,item=b.items.find(x=>x.itemId===p.itemId);
    if(!item)return fail('ITEM_NOT_FOUND');
    if(item.revision!==p.expectedRevision)return fail('STALE_REVISION');
    if(!['PROVIDER_CONFIRMED','SOURCE_PENDING'].includes(item.state))
      return fail('NOT_ADMISSIBLE');
    if(p.type==='ARM_DISPOSABLE_GIT'&&!disposable.test(item.requestedSlug))return fail('PILOT_DISPOSABLE_SLUG_REQUIRED');
    if(p.confirmation!=='GIT '+item.requestedSlug)return fail('PILOT_CONFIRMATION_REQUIRED');
    if(gitPilotArm&&pilotClock()<gitPilotArm.expiresAt)return fail('PILOT_ALREADY_ARMED');
    const foundAccount=await s.accounts.get(b.accountId);
    if(!foundAccount.ok||!validateOwnerContext(b,foundAccount.account).ok||
       !hex.test(foundAccount.account.identity?.principalFingerprint||''))
      return fail('ACCOUNT_STALE');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const g=guard(),route=await g?.getSafeRouteReadiness?.(b.personaUid);
    if(!route?.ready||route.personaUid!==b.personaUid||
       !route.cookieStoreId||!route.routeId)
      return fail(route?.code||'PROTECTED_ROUTE_UNVERIFIED');
    const again=await s.supply.get(b.batchId);
    const accountAgain=await s.accounts.get(b.accountId);
    const still=again.ok?again.batch.items.find(x=>x.itemId===item.itemId):null;
    if(!again.ok||!still||still.revision!==item.revision||
       !accountAgain.ok||!validateOwnerContext(b,accountAgain.account).ok||
       (await sentinel.inspect()).held)return fail('PILOT_CONTEXT_CHANGED');
    gitPilotArm={batchId:b.batchId,itemId:item.itemId,itemRevision:item.revision,
      itemState:item.state,accountId:b.accountId,accountRevision:b.accountRevision,
      bindingVersion:b.bindingVersion,principalFingerprint:accountAgain.account.identity.principalFingerprint,
      remoteId:item.remoteId,routeId:route.routeId,cookieStoreId:route.cookieStoreId,
      expiresAt:pilotClock()+120000};
    return {ok:true,scope:'SINGLE_EXACT_NON_READY_GIT_MARKER',expiresInSeconds:120};
  }
  async function armDisposablePilot(s,p){
    const found=await s.supply.get(p.batchId);
    if(!found.ok)return found;
    const b=found.batch,item=b.items.find(x=>x.itemId===p.itemId);
    if(!item)return fail('ITEM_NOT_FOUND');
    if(item.revision!==p.expectedRevision)return fail('STALE_REVISION');
    if(!['FROZEN','CREATE_CONFIRMED'].includes(item.state))return fail('NOT_ADMISSIBLE');
    if(p.type==='ARM_DISPOSABLE_TEST'&&!disposable.test(item.requestedSlug))return fail('PILOT_DISPOSABLE_SLUG_REQUIRED');
    const action=item.state==='FROZEN'?'CREATE':'RENAME';
    if(p.confirmation!==action+' '+item.requestedSlug)return fail('PILOT_CONFIRMATION_REQUIRED');
    if(pilotArm&&pilotClock()<pilotArm.expiresAt)return fail('PILOT_ALREADY_ARMED');
    const observed=await s.accounts.get(b.accountId);
    if(!observed.ok||!validateOwnerContext(b,observed.account).ok||
       !hex.test(observed.account.identity?.principalFingerprint||''))
      return fail('ACCOUNT_STALE');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const g=guard();
    if(!g?.getSafeRouteReadiness||!g.runSupplyStep)return fail('DONOR_GUARD_UNAVAILABLE');
    const route=await g.getSafeRouteReadiness(b.personaUid);
    if(!route?.ready||route.personaUid!==b.personaUid||
       !route.cookieStoreId||!route.routeId)
      return fail(route?.code||'PROTECTED_ROUTE_UNVERIFIED');
    // Re-read canonical owner after async route admission; a concurrent
    // rebind must never arm an old session or move a new generator.
    const again=await s.accounts.get(b.accountId);
    if(!again.ok||!validateOwnerContext(b,again.account).ok||
       (await sentinel.inspect()).held)return fail('ACCOUNT_STALE');
    pilotArm={batchId:b.batchId,itemId:item.itemId,itemRevision:item.revision,
      itemState:item.state,accountId:b.accountId,accountRevision:b.accountRevision,
      bindingVersion:b.bindingVersion,
      principalFingerprint:again.account.identity.principalFingerprint,
      cookieStoreId:route.cookieStoreId,routeId:route.routeId,
      expiresAt:pilotClock()+120000};
    return {ok:true,action,slug:item.requestedSlug,expiresInSeconds:120,
      scope:'SINGLE_EXACT_OPERATOR_STEP'};
  }
  async function frozenPlan(s,p,previewOnly){
    const current=await s.accounts.get(p.accountId);
    if(!current.ok)return current;
    if(current.account.revision!==p.expectedAccountRevision)
      return fail('STALE_ACCOUNT_REVISION');
    const account=current.account;
    if(account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
       account.identity?.bindingVersion!==account.bindingVersion||!hex.test(account.identity.principalFingerprint||''))
      return fail('ACCOUNT_IDENTITY_UNVERIFIED');
    const request={
      batchId:previewOnly?'preview_00000001':p.batchId,
      accountId:account.accountId,personaUid:account.personaUid,
      accountRevision:account.revision,bindingVersion:account.bindingVersion,
      slugs:p.slugs
    };
    if(previewOnly){
      const plan=freezeSupply(request);
      return plan.ok?{ok:true,batch:publicSupply(plan.batch),
        persistent:false,providerEffects:'OFF'}:plan;
    }
    const saved=await s.supply.freeze(request);
    return saved.ok?{...saved,persistent:true,providerEffects:'OFF'}:saved;
  }
  async function execute(s,p){
    // READ ONLY projection is available regardless of effect gate; no
    // speculative attempt to dispatch after a crashed/uncertain effect.
    const batchResult=await s.supply.get(p.batchId);
    if(!batchResult.ok)return batchResult;
    const b=batchResult.batch,item=b.items.find(i=>i.itemId===p.itemId);
    if(!item)return fail('ITEM_NOT_FOUND');
    if(item.revision!==p.expectedRevision)return fail('STALE_REVISION');
    if(!['FROZEN','CREATE_CONFIRMED'].includes(item.state))
      return fail(item.state.includes('UNCERTAIN')||item.state.includes('DISPATCH')||
        item.state.includes('OBSERVING')?'RECONCILIATION_REQUIRED':'NOT_ADMISSIBLE');
    const account=await s.accounts.get(b.accountId);
    if(!account.ok||!validateOwnerContext(b,account.account).ok)
      return fail('ACCOUNT_STALE');
    // Historic inventory and account verification alone are NOT authorization
    // to mutate. The gate is a local trusted integration decision, never UI.
    const ctx={account:account.account,batch:b,item};
    if(!supplyAuthorized(ctx))
      return fail('PROVIDER_ACTIVATION_HELD');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const g=guard();
    if(!g?.getSafeRouteReadiness||!g.runSupplyStep)
      return fail('DONOR_GUARD_UNAVAILABLE');
    const readiness=await g.getSafeRouteReadiness(b.personaUid);
    if(!readiness?.ready||readiness.personaUid!==b.personaUid)
      return fail(readiness?.code||'PROTECTED_ROUTE_UNVERIFIED');
    if(pilotMatches(ctx)&&(pilotArm.routeId!==readiness.routeId||
       pilotArm.cookieStoreId!==readiness.cookieStoreId))
      return fail('PILOT_ROUTE_CHANGED');
    const create=item.state==='FROZEN';
    const kind=create?'CREATE':'RENAME';
    const event=kind+'_PREPARED',operationId='supply_'+crypto.randomUUID().replaceAll('-','');
    const fp=await fingerprint({kind,accountId:b.accountId,
      personaUid:b.personaUid,accountRevision:b.accountRevision,
      bindingVersion:b.bindingVersion,slug:item.requestedSlug,
      temporarySlug:item.temporarySlug,remoteId:item.remoteId});
    let at=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:item.revision,event,operationId,fingerprint:fp});
    if(!at.ok)return at;
    // The last admission/capability/guard check is made BEFORE effect marker.
    const now=await s.accounts.get(b.accountId);
    if(!now.ok||!validateOwnerContext(b,now.account).ok||
       (await sentinel.inspect()).held||
       !supplyAuthorized({account:now.account,batch:b,item}))
      return fail('PREPARED_HELD');
    const guardAgain=await g.getSafeRouteReadiness(b.personaUid);
    if(!guardAgain?.ready||guardAgain.cookieStoreId!==readiness.cookieStoreId||
       guardAgain.routeId!==readiness.routeId)return fail('PREPARED_HELD');
    at=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:at.item.revision,event:kind+'_DISPATCH_POSSIBLE'});
    if(!at.ok)return at;  // no remote call without COMMITTED marker
    // A Pause or restore hold may arrive after journal commit but before
    // actual dispatch. This is now an UNCERTAIN fence, never a fresh retry.
    if(!supplyAuthorized({account:now.account,batch:b,item})||
       (await sentinel.inspect()).held){
      pilotArm=null;
      await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:at.item.revision,event:kind+'_UNCERTAIN'});
      return fail('HELD_BEFORE_DISPATCH');
    }
    // The one-off operator pilot is consumed before any remote effect. A
    // timeout, crash or lost acknowledgment cannot silently rearm a retry.
    if(pilotMatches({account:now.account,batch:b,item}))pilotArm=null;
    const params={
      kind,slug:item.requestedSlug,temporarySlug:item.temporarySlug,
      remoteId:item.remoteId,principalFingerprint:account.account.identity.principalFingerprint
    };
    let response;
    try{response=await g.runSupplyStep(b.personaUid,params);}
    catch{response={ok:false,code:'DISPATCH_OUTCOME_UNKNOWN'};}
    if(!response?.ok||response.ack!==(create?'CREATED':'RENAMED')||
       (create&&typeof response.temporarySlug!=='string')){
      const uncertain=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:at.item.revision,event:kind+'_UNCERTAIN'});
      return fail(uncertain.ok?'HELD_UNCERTAIN':'DISPATCH_OUTCOME_UNKNOWN');
    }
    // Acknowledged response alone cannot verify source, owner or visibility.
    const observed=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:at.item.revision,event:kind+'_OBSERVING'});
    if(!observed.ok)return fail('HELD_UNCERTAIN');
    const probe={...params,kind:create?'READ_CREATE':'READ_RENAME',
      temporarySlug:create?response.temporarySlug:item.temporarySlug};
    let evidence;
    try{evidence=await g.runSupplyStep(b.personaUid,probe);}
    catch{evidence={ok:false};}
    const valid=evidence?.ok===true&&evidence.source==='INDEPENDENT_READBACK'&&
      evidence.ownerMatches===true&&evidence.privateEmpty===true&&
      (create?evidence.temporarySlug===response.temporarySlug:
        evidence.slug===item.requestedSlug&&
        evidence.previousSlug===item.temporarySlug&&
        evidence.remoteId===item.remoteId);
    if(!valid){
      await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:observed.item.revision,event:kind+'_UNCERTAIN',
        proof:create?{temporarySlug:response.temporarySlug}:undefined});
      return fail('HELD_UNCERTAIN');
    }
    const confirmed=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:observed.item.revision,
      event:create?'CREATE_CONFIRMED':'PROVIDER_CONFIRMED',
      proof:evidence});
    if(!confirmed.ok)return fail('HELD_UNCERTAIN');
    // Git write/readback is separate conditional authority. Never promote
    // source READY or invent a folder if Git is not proven writable.
    if(!create){
      const pending=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:confirmed.item.revision,event:'SOURCE_PENDING'});
      return redacted(pending.ok?pending:confirmed);
    }
    return redacted(confirmed);
  }
  // Operator-triggered read-only reconciliation. A create with no returned
  // temporary identity is held: a random owned empty generator is not proof.
  async function reconcile(s,p){
    const found=await s.supply.get(p.batchId);
    if(!found.ok)return found;
    const b=found.batch,item=b.items.find(x=>x.itemId===p.itemId);
    if(!item)return fail('ITEM_NOT_FOUND');
    if(item.revision!==p.expectedRevision)return fail('STALE_REVISION');
    const create=item.state.startsWith('CREATE_');
    const kind=create?'CREATE':'RENAME';
    if(!['CREATE_UNCERTAIN','CREATE_DISPATCH_POSSIBLE','CREATE_OBSERVING',
          'RENAME_UNCERTAIN','RENAME_DISPATCH_POSSIBLE','RENAME_OBSERVING'].includes(item.state))
      return fail('NOT_ADMISSIBLE');
    const temporarySlug=create?item.ackTemporarySlug:item.temporarySlug;
    if(!temporarySlug)return fail('TEMP_IDENTITY_UNVERIFIED');
    const account=await s.accounts.get(b.accountId);
    if(!account.ok||!validateOwnerContext(b,account.account).ok)
      return fail('ACCOUNT_STALE');
    const g=guard();
    if(!g?.runSupplyStep||!g.getSafeRouteReadiness)
      return fail('DONOR_GUARD_UNAVAILABLE');
    const readiness=await g.getSafeRouteReadiness(b.personaUid);
    if(!readiness?.ready)return fail(readiness?.code||'PROTECTED_ROUTE_UNVERIFIED');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    let at={item};
    if(item.state.endsWith('DISPATCH_POSSIBLE')||item.state.endsWith('OBSERVING')){
      at=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:item.revision,event:kind+'_UNCERTAIN'});
      if(!at.ok)return at;
    }
    at=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:at.item.revision,event:kind+'_OBSERVING'});
    if(!at.ok)return at;
    let evidence;
    try{
      evidence=await g.runSupplyStep(b.personaUid,{
        kind:create?'READ_CREATE':'READ_RENAME',
        slug:item.requestedSlug,temporarySlug,remoteId:item.remoteId,
        principalFingerprint:account.account.identity.principalFingerprint});
    }catch{evidence={ok:false};}
    const valid=evidence?.ok===true&&evidence.source==='INDEPENDENT_READBACK'&&
      evidence.ownerMatches===true&&evidence.privateEmpty===true&&
      (create?evidence.temporarySlug===temporarySlug:
        evidence.slug===item.requestedSlug&&evidence.previousSlug===temporarySlug&&
        evidence.remoteId===item.remoteId);
    if(!valid){
      await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:at.item.revision,event:kind+'_UNCERTAIN'});
      return fail('RECONCILIATION_REQUIRED');
    }
    const confirmed=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:at.item.revision,
      event:create?'CREATE_CONFIRMED':'PROVIDER_CONFIRMED',proof:evidence});
    if(!confirmed.ok)return fail('RECONCILIATION_REQUIRED');
    if(!create){
      const pending=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:confirmed.item.revision,event:'SOURCE_PENDING'});
      return redacted(pending.ok?pending:confirmed);
    }
    return redacted(confirmed);
  }
  async function finishSource(s,p){
    const found=await s.supply.get(p.batchId);
    if(!found.ok)return found;
    const b=found.batch,item=b.items.find(x=>x.itemId===p.itemId);
    if(!item)return fail('ITEM_NOT_FOUND');
    if(item.revision!==p.expectedRevision)return fail('STALE_REVISION');
    if(!['PROVIDER_CONFIRMED','SOURCE_PENDING'].includes(item.state))
      return fail(item.state.startsWith('GIT_')?'RECONCILIATION_REQUIRED':'NOT_ADMISSIBLE');
    const foundAccount=await s.accounts.get(b.accountId);
    if(!foundAccount.ok||!validateOwnerContext(b,foundAccount.account).ok)
      return fail('ACCOUNT_STALE');
    const params={token:p.token,slug:item.requestedSlug,folder:'gens/'+item.requestedSlug};
    if(!markerRequestAllowed(params).ok)return fail('GITHUB_WRITE_TOKEN_REQUIRED');
    const gitCtx={account:foundAccount.account,batch:b,item};
    if(!gitAuthorized(gitCtx))return fail('GIT_WRITE_ACTIVATION_HELD');
    if(gitPilotMatches(gitCtx)){
      const g=guard(),route=await g?.getSafeRouteReadiness?.(b.personaUid);
      if(!route?.ready||route.personaUid!==b.personaUid||
         route.cookieStoreId!==gitPilotArm.cookieStoreId||
         route.routeId!==gitPilotArm.routeId)return fail('PILOT_ROUTE_CHANGED');
    }
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const id='source_'+crypto.randomUUID().replaceAll('-','');
    const fp=await fingerprint({kind:'GIT_MARKER',batchId:b.batchId,
      itemId:item.itemId,slug:item.requestedSlug,remoteId:item.remoteId,
      accountRevision:b.accountRevision,bindingVersion:b.bindingVersion,
      folder:params.folder});
    let at=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:item.revision,event:'GIT_PREPARED',
      operationId:id,fingerprint:fp});
    if(!at.ok)return at;
    const current=await s.accounts.get(b.accountId);
    if(!current.ok||!validateOwnerContext(b,current.account).ok||
       (await sentinel.inspect()).held||
       !gitAuthorized({account:current.account,batch:b,item}))
      return fail('PREPARED_HELD');
    at=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:at.item.revision,event:'GIT_DISPATCH_POSSIBLE'});
    if(!at.ok)return at;
    if(!gitAuthorized({account:current.account,batch:b,item})||
       (await sentinel.inspect()).held){
      gitPilotArm=null;
      await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:at.item.revision,event:'GIT_UNCERTAIN'});
      return fail('GIT_HELD_BEFORE_DISPATCH');
    }
    if(gitPilotMatches({account:current.account,batch:b,item}))gitPilotArm=null;
    let proof;
    try{proof=await gitWrite(params);}catch{proof={ok:false};}
    if(!proof?.ok||proof.source!=='GIT_READBACK'||proof.ready!==false||
       proof.emptyFolder!==true||proof.folder!==params.folder){
      await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:at.item.revision,event:'GIT_UNCERTAIN'});
      return fail('GIT_WRITE_UNCERTAIN');
    }
    const observing=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:at.item.revision,event:'GIT_OBSERVING'});
    if(!observing.ok)return fail('GIT_WRITE_UNCERTAIN');
    const confirmed=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:observing.item.revision,event:'SOURCE_CONFIRMED',
      proof});
    return confirmed.ok?redacted(confirmed):fail('GIT_WRITE_UNCERTAIN');
  }
  async function reconcileGit(s,p){
    const found=await s.supply.get(p.batchId);
    if(!found.ok)return found;
    const b=found.batch,item=b.items.find(x=>x.itemId===p.itemId);
    if(!item)return fail('ITEM_NOT_FOUND');
    if(item.revision!==p.expectedRevision)return fail('STALE_REVISION');
    if(!['GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN','GIT_OBSERVING'].includes(item.state))
      return fail('NOT_ADMISSIBLE');
    const account=await s.accounts.get(b.accountId);
    if(!account.ok||!validateOwnerContext(b,account.account).ok)
      return fail('ACCOUNT_STALE');
    const params={token:p.token,slug:item.requestedSlug,folder:'gens/'+item.requestedSlug};
    if(!markerRequestAllowed(params).ok)return fail('GITHUB_READ_TOKEN_REQUIRED');
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    let proof;
    try{proof=await gitRead(params);}catch{proof={ok:false};}
    if(!proof?.ok||proof.source!=='GIT_READBACK'||proof.ready!==false||
       proof.emptyFolder!==true||proof.folder!==params.folder){
      if(item.state!=='GIT_UNCERTAIN')await s.supply.stage({
        batchId:b.batchId,itemId:item.itemId,expectedRevision:item.revision,
        event:'GIT_UNCERTAIN'});
      return fail('GIT_RECONCILIATION_REQUIRED');
    }
    const accountAgain=await s.accounts.get(b.accountId);
    if(!accountAgain.ok||!validateOwnerContext(b,accountAgain.account).ok||
       (await sentinel.inspect()).held)return fail('GIT_PROOF_CONTEXT_CHANGED');
    const observed=item.state==='GIT_OBSERVING'?{ok:true,item}:
      await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
        expectedRevision:item.revision,event:'GIT_OBSERVING'});
    if(!observed.ok)return fail('GIT_RECONCILIATION_REQUIRED');
    const confirmed=await s.supply.stage({batchId:b.batchId,itemId:item.itemId,
      expectedRevision:observed.item.revision,event:'SOURCE_CONFIRMED',proof});
    return confirmed.ok?redacted(confirmed):fail('GIT_RECONCILIATION_REQUIRED');
  }
  async function run(message,sender){
    const allowed=validateSupplyMessage(api,sender,message);
    if(!allowed.ok)return allowed;
    const p=message.params||{};
    try{
      const s=await stores();
      if(message.type==='LIST_BATCHES'){
        const out=await s.supply.list();
        return out.ok?{...out,providerEffects:'OFF',activation:'HELD'}:out;
      }
      if(message.type==='GET_BATCH'){
        const out=await s.supply.get(p.batchId);
        return out.ok?{ok:true,batch:publicSupply(out.batch),
          providerEffects:'OFF',activation:'HELD'}:out;
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(message.type==='PREVIEW'||message.type==='FREEZE')
        return await frozenPlan(s,p,message.type==='PREVIEW');
      if(message.type==='ABORT_PREPARED'){
        const out=await s.supply.stage({...p,event:'ABORT_PREPARED'});
        return redacted(out);
      }
      if(['ARM_DISPOSABLE_TEST','ARM_EXACT_ITEM'].includes(message.type))return await armDisposablePilot(s,{...p,type:message.type});
      if(['ARM_DISPOSABLE_GIT','ARM_EXACT_GIT'].includes(message.type))return await armDisposableGit(s,{...p,type:message.type});
      if(message.type==='RECONCILE_ITEM')return await reconcile(s,p);
      if(message.type==='RECONCILE_GIT')return await reconcileGit(s,p);
      if(message.type==='FINISH_SOURCE_FOLDER')return await finishSource(s,p);
      return await execute(s,p);
    }catch{return fail('SUPPLY_CANONICAL_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==SUPPLY_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender)).then(result=>{
          try{port.postMessage(result);}catch{}
        }).catch(()=>{try{port.postMessage(fail('SUPPLY_CANONICAL_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createSupplyBoundary(browser).register();
