// C89 binds the first Git import through execution, not merely queue intake.
// Reads/reconciliation remain available when approval/source has changed.
import {importTargetTuple} from './creation-preview.mjs';

import {browserGitCredentialPacket} from './git-local-secret.mjs';
const fail=code=>({ok:false,code});
export async function inspectCurrentImportItem({repository,repositoryId,token,slug},transport=fetch){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository||'')||!/^generators\/[a-z0-9][a-z0-9-]{0,99}$/.test('generators/'+slug))return fail('INITIAL_IMPORT_SOURCE_UNVERIFIED');
 const sha=v=>/^[a-f0-9]{40}$/.test(v||'');
 try{const get=async path=>{const r=await transport('https://api.github.com/repos/'+repository+path,{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',
   headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});if(r?.status!==200)throw Error('GIT_UNAVAILABLE');return r.json()};
  const repo=await get('');if(repo.full_name!==repository||repo.private!==true||String(repo.id)!==repositoryId)return fail('GIT_IDENTITY_CHANGED');
  const ref=await get('/git/ref/heads/main');if(ref.ref!=='refs/heads/main'||ref.object?.type!=='commit'||!sha(ref.object.sha))throw Error('MAIN_UNVERIFIED');
  const commit=await get('/git/commits/'+ref.object.sha);if(!sha(commit.tree?.sha))throw Error('MAIN_UNVERIFIED');
  const tree=async oid=>{const out=await get('/git/trees/'+oid);if(out.truncated!==false||!Array.isArray(out.tree))throw Error('TREE_INCOMPLETE');return out.tree};
  const child=async(oid,name)=>{const rows=(await tree(oid)).filter(x=>x.path===name);if(rows.length!==1||rows[0].type!=='tree'||rows[0].mode!=='040000'||!sha(rows[0].sha))throw Error('FOLDER_MISSING');return rows[0].sha};
  const folderTreeOid=await child(await child(commit.tree.sha,'generators'),slug);
  const markers=(await tree(folderTreeOid)).filter(x=>x.path==='DEPLOYMENT.md');
  if(markers.length!==1||markers[0].type!=='blob'||markers[0].mode!=='100644'||!sha(markers[0].sha))throw Error('MARKER_UNVERIFIED');
  return {ok:true,repositoryId,head:ref.object.sha,slug,folderTreeOid,markerOid:markers[0].sha};
 }catch{return fail('INITIAL_IMPORT_SOURCE_UNAVAILABLE')}
}
export function createInitialImportGuard(api,{inspect=inspectCurrentImportItem,credential=browserGitCredentialPacket}={}){
 return async function check(db,item,{verifyGit=true}={}){
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
      !a.reviewedSources?.some(g=>g.slug===item.slug&&g.markerOid===source.markerOid&&(g.folderTreeOid||null)===(binding.folderTreeOid||null))||
      JSON.stringify(local.target)!==JSON.stringify(binding.target))return fail('INITIAL_IMPORT_SCOPE_REVIEW_REQUIRED');
   if(!verifyGit)continue;
   const secret=await credential({action:'git.get',repositoryId:cfg.repositoryId});
   if(!secret?.ok)return fail('GIT_RECONNECT_REQUIRED');
   const row=await inspect({repository:cfg.repository,repositoryId:cfg.repositoryId,token:secret.credential,slug:item.slug});
   if(!row?.ok||row.repositoryId!==cfg.repositoryId||row.markerOid!==source.markerOid||binding.folderTreeOid&&row.folderTreeOid!==binding.folderTreeOid)
    return fail('INITIAL_IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED');
  }
  return {ok:true};
 };
}
