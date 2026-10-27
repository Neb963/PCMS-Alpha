import {createInitialImportGuard} from './creation-import-authority.mjs';
import {ensureCreationInventory,recoverMissingCreationCensus} from './creation-inventory.mjs';
import {inventoryBoundary} from './inventory-boundary.mjs';
// S04 fixed, one-step guarded creation runner. No generic job engine.
// Canonical operator intent scopes private creation independently of Git;
// current account/route/owner and intent journal proofs remain mandatory.
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createS04GitContinuation} from './creation-git-runner.mjs';
import {createAdoptionStore} from './adoption-store.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';
const fingerprint=async data=>[...new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(JSON.stringify(data))))]
  .map(v=>v.toString(16).padStart(2,'0')).join('');
const routeSame=(before,after)=>before?.ready===true&&after?.ready===true&&
  before.personaUid===after.personaUid&&
  before.cookieStoreId===after.cookieStoreId&&
  before.routeId===after.routeId;
export function createCreationRunner(api,{open=openCanonicalDatabase,
  makeStore=createCoordinatorStore,guard=internalPcmsGuard,
  effectGate=()=>false,gitGate=()=>false,
  createGit=createS04GitContinuation,now=Date.now,
  syncInventory=(id,revision)=>inventoryBoundary?.syncAccount(id,revision),
  importGuard=createInitialImportGuard(api)}={}){
  const sentinel=createRestoreSentinel(api.storage.local);
  const git=createGit(api,{open,gate:gitGate});
  let dbPromise;
  const store=async()=>makeStore(await (dbPromise||=open().catch(e=>{
    dbPromise=null;throw e;})));
  async function advance(intentId,expectedRevision){
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const s=await store();
      const found=await s.getCreate(intentId);
      if(!found.ok)return found;
      const item=found.record;
      if(item.revision!==expectedRevision)return fail('STALE_REVISION');
      if(isI17Quarantined(item))return fail(I17_QUARANTINE_CODE);
      const reconciling=['CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN','CREATE_OBSERVING','RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN','RENAME_OBSERVING','GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN','GIT_OBSERVING'].includes(item.state);
      if((item.pinConflict||item.sourceDrift)&&!reconciling)return fail(item.hold||'SOURCE_CONFLICT');
      if(['WAITING_CAPABILITY','OWNER_MISSING_VERIFIED','PRIVATE_EMPTY_CONFIRMED','CREATE_PREPARED','RENAME_PREPARED'].includes(item.state)){
        const scope=await importGuard(await (dbPromise||=open()),item,{verifyGit:!['WAITING_CAPABILITY','CREATE_PREPARED','RENAME_PREPARED'].includes(item.state)});if(!scope.ok)return scope;
      }
      if(item.state==='WAITING_CAPABILITY'){
        const allocation=await s.allocateCreate(item.intentId,item.revision);
        if(allocation.ok||allocation.code!=='INITIAL_INVENTORY_UNKNOWN')return allocation;
        // The intake journal is already durable. Census recovery makes no
        // generator mutations, and never invents a zero count. One protected
        // account at a time limits load for mixed fleets and lost readers.
        const db=await (dbPromise||=open());
        const recovery=await recoverMissingCreationCensus({
          db,accountId:item.accountId||null,syncInventory});
        if(!recovery.ok)return recovery;
        const retried=await s.allocateCreate(item.intentId,item.revision);
        if(retried.ok||retried.code!=='INITIAL_INVENTORY_UNKNOWN')return retried;
        return fail('INITIAL_INVENTORY_REFRESHED'); // Observed progress; more accounts need census.
      }
      if(item.state==='OWNER_READBACK_PENDING'){
        const moved=await s.requeueArchivedUnattempted(item.intentId,item.revision);
        if(moved.ok)return moved;
        if(!['ACCOUNT_NOT_ARCHIVED','ALLOCATION_NOT_REDISTRIBUTABLE'].includes(moved.code))
          return moved;
      }
      const context=await s.refreshCreateAccountContext(item.intentId,item.revision);
      if(!context.ok||context.contextRefreshed)return context;
      if(item.state==='ADOPTION_ORIGINAL_PENDING'){
        const db=await (dbPromise||=open());
        const adopted=await createAdoptionStore(db).getFull(item.slug);
        if(!adopted.ok||adopted.record.archiveState!=='ARCHIVED_GIT_CONFIRMED'||
           adopted.record.originalCheckpoint?.qualified!==true)
          return fail('ADOPTION_SOURCE_CHECKPOINT_REQUIRED');
        return await s.confirmAdoption(item.intentId,item.revision,adopted.record);
      }
      if(item.state.startsWith('GIT_'))
        return await git.step(item.intentId,item.revision);
      const g=guard();
      if(!g?.getSafeRouteReadiness||!g?.runSupplyStep)
        return fail('DONOR_GUARD_UNAVAILABLE');
      const ready=await g.getSafeRouteReadiness(item.personaUid);
      if(!ready?.ready||ready.personaUid!==item.personaUid)
        return fail(ready?.code||'PROTECTED_ROUTE_UNVERIFIED');
      const current=await s.getCreate(item.intentId);
      if(!current.ok||current.record.revision!==item.revision)
        return fail('STALE_REVISION');
      const mutable=(await effectGate({intent:item,route:ready}))===true;
      const base={slug:item.slug,
        principalFingerprint:ready.principalFingerprint||
          item.principalFingerprint};
      // The actual bound principal comes from a fresh canonical account read.
      // No operator-provided fingerprint is accepted as a source of authority.
      const getAccount=async()=>{
        const db=await (dbPromise||=open());
        return new Promise((resolve,reject)=>{
          let result=null,tx;
          try{tx=db.transaction(['meta'],'readonly');}catch{return reject(Error('DB_UNAVAILABLE'));}
          tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('DB_ABORT'));
          tx.objectStore('meta').get('account:'+item.accountId).onsuccess=e=>{
            const a=e.target.result?.account;
            if(a?.state==='VERIFIED'&&a.revision===item.accountRevision&&
              a.personaUid===item.personaUid&&
              a.bindingVersion===item.bindingVersion&&
              a.identity?.source==='GUARDED_SESSION_READBACK'&&
              a.identity.bindingVersion===item.bindingVersion&&
              /^[a-f0-9]{64}$/.test(a.identity.principalFingerprint||''))
              result=a;
          };
        });
      };
      const account=await getAccount();
      if(!account)return fail('ACCOUNT_CONTEXT_CHANGED');
      base.principalFingerprint=account.identity.principalFingerprint;
      const read=async(kind,extra={})=>{
        let response;
        try{response=await g.runSupplyStep(item.personaUid,{...base,...extra,kind});}
        catch{return fail('PROVIDER_OUTCOME_UNKNOWN');}
        const after=await g.getSafeRouteReadiness(item.personaUid);
        if(after?.ready!==true)return fail(after?.code||'PROTECTED_ROUTE_UNVERIFIED');
        // A route/persona change can never be interpreted as a successful
        // read, even if the provider independently returned valid data.
        if(!routeSame(ready,after)||(await sentinel.inspect()).held)
          return fail('PROTECTED_CONTEXT_CHANGED');
        if(!response?.ok)return fail(response?.code||'PROVIDER_READBACK_UNKNOWN');
        return response;
      };
      const stage=(event,proof)=>s.stageEffect({
        intentId:item.intentId,expectedRevision:item.revision,event,proof});
      if(item.state==='OWNER_READBACK_PENDING'){
        const result=await read('READ_TARGET');
        return result.ok&&result.source==='INDEPENDENT_TARGET_READBACK'?
          stage('TARGET_OBSERVED',result):result;
      }
      if(item.state==='OWNER_MISSING_VERIFIED'){
        if(!mutable)return fail('PROVIDER_ACTIVATION_HELD');
        const inventory=await ensureCreationInventory({db:await (dbPromise||=open()),
          account,syncInventory,now});
        if(!inventory.ok)return inventory;
        // A prior readback is historical; recheck target immediately before
        // starting a possible remote CREATE.
        const target=await read('READ_TARGET');
        if(!target.ok)return target; // Preserve actual bridge, identity or provider-read failure.
        if(target.state!=='MISSING_VERIFIED')return fail('TARGET_STATE_CHANGED');
        const operationId='s04_create_'+crypto.randomUUID().replaceAll('-','');
        const fp=await fingerprint({intentId:item.intentId,accountId:item.accountId,
          accountRevision:item.accountRevision,bindingVersion:item.bindingVersion,
          personaUid:item.personaUid,slug:item.slug,kind:'CREATE'});
        return stage('CREATE_PREPARE',{operationId,fingerprint:fp});
      }
      if(item.state==='PRIVATE_EMPTY_CONFIRMED'){
        if(!mutable)return fail('PROVIDER_ACTIVATION_HELD');
        const target=await read('READ_TARGET');
        if(!target.ok)return target; // Preserve actual bridge, identity or provider-read failure.
        if(target.state!=='MISSING_VERIFIED')return fail('TARGET_STATE_CHANGED');
        const operationId='s04_rename_'+crypto.randomUUID().replaceAll('-','');
        const fp=await fingerprint({intentId:item.intentId,accountId:item.accountId,
          accountRevision:item.accountRevision,remoteId:item.remoteId,
          temporarySlug:item.temporarySlug,slug:item.slug,kind:'RENAME'});
        return stage('RENAME_PREPARE',{operationId,fingerprint:fp});
      }
      if(['CREATE_PREPARED','RENAME_PREPARED'].includes(item.state)){
        if(!mutable)return fail('PROVIDER_ACTIVATION_HELD');
        if(item.state==='CREATE_PREPARED'){
        const inventory=await ensureCreationInventory({db:await (dbPromise||=open()),
          account,syncInventory,now});
        if(!inventory.ok)return inventory;
        }
        // Prepared-only evidence may predate Archive or a human-created slug.
        // Re-observe immediately before dispatch; uncertainty is never replayed.
        const target=await read('READ_TARGET');
        if(!target.ok||target.source!=='INDEPENDENT_TARGET_READBACK'||target.slug!==item.slug||target.state!=='MISSING_VERIFIED')
          return fail(target.code||'TARGET_STATE_CHANGED');
        if(item.state==='RENAME_PREPARED'){
          const temporary=await read('READ_CREATE',{temporarySlug:item.temporarySlug,remoteId:item.remoteId});
          if(!temporary.ok)return temporary; // Keep bridge/provider readback reason before rename.
          if(temporary.source!=='INDEPENDENT_READBACK'||temporary.ownerMatches!==true||
             temporary.privateEmpty!==true||temporary.remoteId!==item.remoteId||
             temporary.temporarySlug!==item.temporarySlug)return fail('TEMPORARY_SOURCE_CHANGED');
        }

        // Read guards again before crossing the dispatch-possible marker.
        const scope=await importGuard(await (dbPromise||=open()),item);if(!scope.ok)return scope;
        const before=await g.getSafeRouteReadiness(item.personaUid);
        if(before?.ready!==true)return fail(before?.code||'PROTECTED_ROUTE_UNVERIFIED');
        if(!routeSame(ready,before)||(await sentinel.inspect()).held)
          return fail('PROTECTED_CONTEXT_CHANGED');
        const isCreate=item.state==='CREATE_PREPARED';
        const prepared=await stage(isCreate?'CREATE_DISPATCH':'RENAME_DISPATCH');
        if(!prepared.ok)return prepared;
        // Exact revision + operation receipt must exist before dispatch.
        const newer=prepared.record;
        const policyGeneration=effectGate.generation?.();
        const allowed=(await effectGate({intent:newer,route:before}))===true;
        const restoring=(await sentinel.inspect()).held;
        if(!allowed||restoring||policyGeneration!==effectGate.generation?.()){
          return await s.stageEffect({intentId:item.intentId,
            expectedRevision:newer.revision,
            event:isCreate?'CREATE_UNCERTAIN':'RENAME_UNCERTAIN'});
        }
        let result;
        try{result=await g.runSupplyStep(item.personaUid,{
          ...base,kind:isCreate?'CREATE':'RENAME',
          ...(isCreate?{}:{temporarySlug:newer.temporarySlug,
            remoteId:newer.remoteId})});}
        catch{result=fail('DISPATCH_OUTCOME_UNKNOWN');}
        // No automatic retry from DISPATCH_POSSIBLE regardless of ACK.
        const ack=result?.ok&&result.ack===(isCreate?'CREATED':'RENAMED');
        const event=ack?(isCreate?'CREATE_OBSERVING':'RENAME_OBSERVING'):
          (isCreate?'CREATE_UNCERTAIN':'RENAME_UNCERTAIN');
        return await s.stageEffect({intentId:item.intentId,
          expectedRevision:newer.revision,event,
          proof:isCreate&&typeof result?.temporarySlug==='string'?
            {temporarySlug:result.temporarySlug}:{}});
      }
      if(['CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN','CREATE_OBSERVING'].includes(item.state)){
        if(!item.ackTemporarySlug){
          if(item.state==='CREATE_DISPATCH_POSSIBLE')
            return stage('CREATE_UNCERTAIN',{});
          return fail('CREATE_OUTCOME_UNKNOWN_NO_IDENTITY');
        }
        const observing=item.state==='CREATE_OBSERVING'?{ok:true,record:item}:
          await stage('CREATE_OBSERVING',{temporarySlug:item.ackTemporarySlug});
        if(!observing.ok)return observing;
        const proof=await read('READ_CREATE',{temporarySlug:item.ackTemporarySlug});
        if(!proof.ok)return fail(proof.code||'CREATE_READBACK_PENDING');
        return await s.stageEffect({intentId:item.intentId,
          expectedRevision:observing.record.revision,event:'CREATE_CONFIRMED',proof});
      }
      if(['RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN','RENAME_OBSERVING'].includes(item.state)){
        const observing=item.state==='RENAME_OBSERVING'?{ok:true,record:item}:
          await stage('RENAME_OBSERVING',{});
        if(!observing.ok)return observing;
        const proof=await read('READ_RENAME',{temporarySlug:item.temporarySlug,
          remoteId:item.remoteId});
        if(!proof.ok)return fail(proof.code||'RENAME_READBACK_PENDING');
        return await s.stageEffect({intentId:item.intentId,
          expectedRevision:observing.record.revision,event:'RENAME_CONFIRMED',proof});
      }
      if(item.state==='GIT_INIT_PENDING')
        return fail('GIT_CONDITIONAL_ASSOCIATION_PENDING');
      return fail('CREATION_NO_SAFE_TRANSITION');
    }catch{return fail('S04_CREATION_RUNNER_UNAVAILABLE');}
  }
  async function step(intentId,expectedRevision){
    const result=await advance(intentId,expectedRevision);
    try{await (await store()).recordAttempt(intentId,result?.record?.revision??expectedRevision,result,now());}catch{}
    return result;
  }
  return Object.freeze({step});
}
