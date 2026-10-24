// C89 binds the first Git import through execution, not merely queue intake.
// Reads/reconciliation remain available when approval/source has changed.
import {importTargetTuple} from './creation-preview.mjs';
import {scanMainCatalog} from './git-catalog.mjs';
import {browserGitCredentialPacket} from './git-local-secret.mjs';
const fail=code=>({ok:false,code});
export function createInitialImportGuard(api,{scan=scanMainCatalog,credential=browserGitCredentialPacket}={}){
 return async function check(db,item){
  if(item.sources?.some(s=>s.type==='OPERATOR'))return {ok:true};
  const sources=(item.sources||[]).filter(s=>s.type==='GITHUB_MAIN'&&s.initialImport);
  if(!sources.length)return {ok:true};
  const cfg=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
  if(!cfg)return fail('GIT_RECONNECT_REQUIRED');
  for(const source of sources){const binding=source.initialImport;
   const local=await new Promise((resolve,reject)=>{const tx=db.transaction(['meta'],'readonly');let approval=null,target=null;
    tx.oncomplete=()=>resolve({approval,target});tx.onabort=()=>reject(Error('IMPORT_AUTHORITY_UNAVAILABLE'));
    tx.objectStore('meta').get('s03-import-approval:'+source.repositoryId).onsuccess=e=>{approval=e.target.result?.approval};
    tx.objectStore('meta').get('inventory:'+item.slug).onsuccess=e=>{target=importTargetTuple(item.slug,e.target.result?.generator)};
   });
   const a=local.approval;
   if(cfg.repositoryId!==source.repositoryId||!a||a.revision!==binding.revision||a.scopeDigest!==binding.scopeDigest||
      JSON.stringify(a.targets?.find(t=>t.slug===item.slug))!==JSON.stringify(binding.target)||
      JSON.stringify(local.target)!==JSON.stringify(binding.target))return fail('INITIAL_IMPORT_SCOPE_REVIEW_REQUIRED');
   const secret=await credential({action:'git.get',repositoryId:cfg.repositoryId});
   if(!secret?.ok)return fail('GIT_RECONNECT_REQUIRED');
   const current=await scan({repository:cfg.repository,token:secret.credential});
   const row=current?.ok&&current.complete===true&&current.repositoryId===cfg.repositoryId&&current.generators.find(g=>g.slug===item.slug);
   if(!row||row.markerOid!==source.markerOid||binding.folderTreeOid&&row.folderTreeOid!==binding.folderTreeOid)
    return fail('INITIAL_IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED');
  }
  return {ok:true};
 };
}
