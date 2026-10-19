// S04: bounded, read-only-derived automatic Git main intake.
// This does NOT perform Perchance, Git writes, donor/native operations or
// ownership allocation. The human-approved initial import is a prerequisite.
// Each recognized folder becomes one held canonical slug intent.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createImportApprovalStore,getImportScopeDigest} from './catalog-import.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {validateGitCreationWitness} from './creation-intake.mjs';

const PROGRESS='pcmsS04CatalogIntakeProgress';
const RECEIPT='pcmsS04CatalogIntakeReceipt';
const MAX_BATCH=128;
const fail=code=>({ok:false,code});
export function validateCreationCatalog(catalog){
  if(!catalog?.ok||catalog.complete!==true||
     catalog.source!=='PINNED_MAIN_READ_ONLY'||
     typeof catalog.repository!=='string'||!Array.isArray(catalog.generators)||
     !Number.isSafeInteger(catalog.recognizedCount)||
     catalog.recognizedCount!==catalog.generators.length)return fail('S04_CATALOG_UNVERIFIED');
  const seen=new Set();
  for(const g of catalog.generators){
    if(!g||typeof g!=='object'||Array.isArray(g))return fail('S04_CATALOG_UNVERIFIED');
    if(seen.has(g.slug))return fail('S04_CATALOG_DUPLICATE_SLUG');
    seen.add(g.slug);
    const w={repository:catalog.repository,repositoryId:catalog.repositoryId,
      slug:g.slug,head:catalog.head,markerOid:g.markerOid,
      complete:true,verifiedMain:true};
    // Quarantine is a per-slug hold, not a reason to suppress all healthy
    // slugs in the independently verified catalog.
    const verified=validateGitCreationWitness(w);
    if(!verified.ok&&verified.code!=='I17_ORIGINAL_EFFECT_QUARANTINED')
      return fail('S04_CATALOG_UNVERIFIED');
  }
  return {ok:true};
}
export function createCreationCatalogIntake(api,{open=openCanonicalDatabase,
  makeApproval=createImportApprovalStore,makeCoordinator=createCoordinatorStore,
  maxItems=MAX_BATCH,now=Date.now}={}){
  if(!Number.isSafeInteger(maxItems)||maxItems<1||maxItems>512)
    throw Error('S04_INVALID_BATCH_BOUND');
  let dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const stores=async()=>{
    const db=await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;}));
    return {approval:makeApproval(db),creation:makeCoordinator(db)};
  };
  async function run(catalog){
    const valid=validateCreationCatalog(catalog);
    if(!valid.ok)return valid;
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    try{
      const {approval,creation}=await stores();
      const approved=await approval.get(catalog.repositoryId);
      if(!approved.ok||approved.approval.repository!==catalog.repository||
         approved.approval.source!=='HUMAN_INITIAL_IMPORT_SCOPE')
        return fail('INITIAL_IMPORT_SCOPE_UNAPPROVED');
      const earlier=(await api.storage.local.get(PROGRESS))?.[PROGRESS];
      const scopeDigest=await getImportScopeDigest(catalog);
      if(!scopeDigest)return fail('S04_CATALOG_UNVERIFIED');
      const firstImportCompleted=earlier?.repositoryId===catalog.repositoryId&&
        earlier?.initialScopeDigest===approved.approval.scopeDigest&&
        earlier?.initialImportCompleted===true;
      // A different initial folder set cannot become an automatic source of
      // effects before the exactly approved first scope was durably consumed.
      if(!firstImportCompleted&&scopeDigest!==approved.approval.scopeDigest)
        return fail('INITIAL_IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
      const continued=earlier?.repositoryId===catalog.repositoryId&&
        earlier?.scopeDigest===scopeDigest&&
        Number.isSafeInteger(earlier.next)&&earlier.next>=0&&
        earlier.next<=catalog.generators.length;
      const from=continued?earlier.next:0;
      let next=from,added=0,duplicates=0,held=0;
      for(;next<catalog.generators.length&&next<from+maxItems;next++){
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        const g=catalog.generators[next];
        const out=await creation.ingestVerifiedMain({
          repository:catalog.repository,repositoryId:catalog.repositoryId,
          slug:g.slug,head:catalog.head,markerOid:g.markerOid,
          complete:true,verifiedMain:true
        });
        if(!out.ok){
          if(out.code==='I17_ORIGINAL_EFFECT_QUARANTINED'){
            held++;continue;
          }
          // Preserve cursor: this slug was not durably accepted. Do not
          // skip over a failed local DB transaction or inconsistent intent.
          await api.storage.local.set({[RECEIPT]:{
            code:out.code||'S04_INTAKE_HELD',repositoryId:catalog.repositoryId,
            head:catalog.head,next,observedAt:now(),providerEffects:'OFF'}});
          return fail(out.code||'S04_INTAKE_HELD');
        }
        if(out.changed)added++;else duplicates++;
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const more=next<catalog.generators.length;
      const progress={repositoryId:catalog.repositoryId,head:catalog.head,
        scopeDigest,initialScopeDigest:approved.approval.scopeDigest,
        initialImportCompleted:firstImportCompleted||!more,
        next,total:catalog.generators.length,observedAt:now()};
      await api.storage.local.set({[PROGRESS]:progress,[RECEIPT]:{
        code:more?'S04_LOCAL_INTAKE_CHECKPOINTED':'S04_LOCAL_INTAKE_COMPLETE',
        ...progress,added,duplicates,held,providerEffects:'OFF',gitEffects:'OFF'}});
      return {ok:true,more,next,total:catalog.generators.length,added,duplicates,held,
        code:more?'S04_LOCAL_INTAKE_CHECKPOINTED':'S04_LOCAL_INTAKE_COMPLETE'};
    }catch{return fail('S04_INTAKE_UNAVAILABLE');}
  }
  return Object.freeze({run});
}
