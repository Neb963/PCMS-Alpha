// S05: independently inspect main READY inputs and record local candidate intent.
// The S03 complete-scan proof is a prerequisite, not an authoring permission.
// No provider, native-AI, Git write or publication effects occur here.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {inspectReadyCandidate} from './catalog-declaration.mjs';
import {createDeclarationStore} from './catalog-ready-store.mjs';
import {createImportApprovalStore,getImportScopeDigest} from './catalog-import.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';
import {createReadyStore} from './ready-store.mjs';
const KEY='pcmsS05ReadyScanCursor';
const SHA=/^[a-f0-9]{40}$/;
const RID=/^[1-9][0-9]{0,19}$/;
const fail=code=>({ok:false,code});
export function createReadyIntake(api,{open=openCanonicalDatabase,
 inspect=inspectReadyCandidate,maxPerWake=16}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let dbPromise;
 async function run({catalog,repository,token,transport=fetch}={}){
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  if(!catalog?.ok||catalog.complete!==true||
     catalog.source!=='PINNED_MAIN_READ_ONLY'||
     catalog.recognizedCount!==catalog.generators?.length||
     !SHA.test(catalog.head||'')||
     !RID.test(catalog.repositoryId||'')||catalog.repository!==repository||
     !Array.isArray(catalog.generators)||typeof token!=='string'||token.length<12||
     !Number.isSafeInteger(maxPerWake)||maxPerWake<1||maxPerWake>64)
    return fail('READY_CATALOG_UNVERIFIED');
  const db=await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;}));
  const approval=await createImportApprovalStore(db).get(catalog.repositoryId);
  if(!approval.ok||approval.approval.repository!==repository||
     approval.approval.source!=='HUMAN_INITIAL_IMPORT_SCOPE')
    return fail('INITIAL_IMPORT_SCOPE_UNAPPROVED');
  const digest=await getImportScopeDigest(catalog);
  if(!digest)return fail('READY_CATALOG_UNVERIFIED');
  const s04=(await api.storage.local.get('pcmsS04CatalogIntakeProgress'))
    ?.pcmsS04CatalogIntakeProgress;
  const completed=s04?.repositoryId===catalog.repositoryId&&
    s04.initialScopeDigest===approval.approval.scopeDigest&&
    s04.initialImportCompleted===true;
  if(!completed&&digest!==approval.approval.scopeDigest)
    return fail('INITIAL_IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
  const names=new Set();
  for(const item of catalog.generators){
    if(typeof item?.slug!=='string'||
       !/^[a-z0-9][a-z0-9-]{0,99}$/.test(item.slug)||
       typeof item.ready!=='boolean'||names.has(item.slug))
      return fail('READY_CATALOG_UNVERIFIED');
    names.add(item.slug);
  }
  // Process explicit NOT_READY changes too; a previous active admission must
  // not remain executable merely because its folder is now filtered out.
  const scope=catalog.generators.map(x=>({slug:x.slug,ready:x.ready}))
    .sort((a,b)=>a.slug.localeCompare(b.slug,'en'));
  const before=(await api.storage.local.get(KEY))?.[KEY];
  const start=before?.repositoryId===catalog.repositoryId&&
    before.head===catalog.head&&Number.isSafeInteger(before.nextIndex)&&
    before.nextIndex>=0&&before.nextIndex<=scope.length?before.nextIndex:0;
  const end=Math.min(scope.length,start+maxPerWake);
  const declarations=createDeclarationStore(db),queue=createReadyStore(db);
  let observed=0,revoked=0;const held=[];
  for(let i=start;i<end;i++){
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   const {slug,ready}=scope[i];
   if(isI17Quarantined({slug})){
     held.push({slug,code:I17_QUARANTINE_CODE});continue;
   }
   if(!ready){
     const hold=await queue.holdNotReady({slug,
       repositoryId:catalog.repositoryId,head:catalog.head});
     if(!hold.ok){held.push({slug,code:hold.code});continue;}
     if(hold.changed)revoked++;
     continue;
   }
   let evidence;
   try{evidence=await inspect({repository,token,slug,
      pinnedHead:catalog.head,includeSourceBytes:false},transport);}
   catch{evidence=fail('READY_INSPECTION_UNAVAILABLE');}
   if(!evidence?.ok||evidence.code!=='READY_COHERENT_INPUT_PINNED'){
    held.push({slug,code:evidence?.code||'READY_INSPECTION_UNAVAILABLE'});continue;
   }
   const witness=await declarations.witness({repositoryId:catalog.repositoryId,
     slug,coherent:evidence});
   if(!witness.ok){held.push({slug,code:witness.code});continue;}
   const record=witness.record;
   const result=await queue.observe({
     repositoryId:catalog.repositoryId,slug,identifier:record.identifier,
     declarationCommit:record.declarationCommit,markerOid:record.markerOid,
     inputFingerprint:record.inputFingerprint,testingOid:record.testingOid});
   if(!result.ok){held.push({slug,code:result.code});continue;}
   observed++;
  }
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  const config=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
  if(config?.repositoryId!==catalog.repositoryId||config.repository!==repository)
    return fail('GIT_CONNECTION_CHANGED');
  // Cursor is non-authoritative. A crash replays read-only observation and
  // canonical deduplication. A new main HEAD always restarts the entire scan.
  await api.storage.local.set({[KEY]:{
    repositoryId:catalog.repositoryId,head:catalog.head,
    nextIndex:end===scope.length?0:end}});
  return {ok:true,code:'READY_LOCAL_OBSERVATION_ONLY',observed,revoked,
    examined:end-start,more:end<scope.length,held:held.slice(0,16),
    providerEffects:'OFF'};
 }
 return Object.freeze({run});
}