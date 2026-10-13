// I07: append-only original archive. Never edits a development source.
// Only an explicitly requested, pre-journaled write may call writeArchive.
import {fail} from './journal.mjs';
import {safeFolder} from './git-source.mjs';
const ROOT='https://api.github.com/repos/Neb963/per-gens';
const sha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const slugOK=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const utf8=s=>new TextEncoder().encode(s);
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async(alg,bytes)=>hex(new Uint8Array(await crypto.subtle.digest(alg,bytes)));
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const encode=bytes=>btoa([...bytes].map(c=>String.fromCharCode(c)).join(''));
const gitSha=async bytes=>{
  const prefix=utf8('blob '+bytes.length+'\0');
  const all=new Uint8Array(prefix.length+bytes.length);
  all.set(prefix);all.set(bytes,prefix.length);
  return hash('SHA-1',all);
};
export function archiveLocation(slug,fingerprint){
  if(!slugOK(slug)||!fp(fingerprint))return null;
  return 'originals/'+slug+'/'+fingerprint;
}
async function archiveFiles({slug,original,folder}){
  if(!archiveLocation(slug,original?.fingerprint)||!safeFolder(folder)||
     !Array.isArray(original.files)||!Array.isArray(original.blobs)||
     original.files.length!==original.blobs.length||
     original.files.length<2||original.files.length>500)
    return fail('ARCHIVE_SOURCE_UNVERIFIED');
  const files=[],prefix=archiveLocation(slug,original.fingerprint),seen=new Set();
  try{
    for(const entry of original.files){
      if(typeof entry.path!=='string'||entry.path.length>240||
         entry.path.startsWith('/')||entry.path.includes('..')||
         entry.path.includes('\\')||entry.path.includes('%')||
         seen.has(entry.path.toLowerCase())||
         !Number.isSafeInteger(entry.size)||entry.size<0||
         !fp(entry.sha256))return fail('ARCHIVE_SOURCE_UNVERIFIED');
      const blob=original.blobs.find(b=>b.path===entry.path);
      if(!blob||typeof blob.base64!=='string')return fail('ARCHIVE_SOURCE_UNVERIFIED');
      const bytes=decode(blob.base64);
      if(bytes.length!==entry.size||
         await hash('SHA-256',bytes)!==entry.sha256)
        return fail('ARCHIVE_BYTES_CHANGED');
      seen.add(entry.path.toLowerCase());
      files.push({path:prefix+'/'+entry.path,bytes,sha:await gitSha(bytes),
        sha256:entry.sha256,size:bytes.length});
    }
    const manifest=JSON.stringify({schema:'PCMS_ORIGINAL_V1',slug,
      remotePublicId:original.remotePublicId,visibility:original.visibility,
      observedAt:original.observedAt,fingerprint:original.fingerprint,
      files:original.files},null,2)+'\n';
    const m=utf8(manifest);
    files.push({path:prefix+'/ORIGINAL.json',bytes:m,
      sha:await gitSha(m),sha256:await hash('SHA-256',m),size:m.length});
    return {ok:true,files,prefix};
  }catch{return fail('ARCHIVE_BYTES_CHANGED');}
}
function validToken(token){
  return typeof token==='string'&&token.length>=12&&token.length<=512&&
    /^[\x21-\x7e]+$/.test(token);
}
function apiClient(token,transport){
  return async(method,path,body)=>{
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),14000);
    try{
      const r=await transport(ROOT+path,{method,signal:ac.signal,
        credentials:'omit',cache:'no-store',redirect:'error',
        headers:{Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',
          Authorization:'Bearer '+token,
          ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(![200,201].includes(r?.status))return fail(
        r?.status===401||r?.status===403?'GITHUB_ACCESS_DENIED':
        r?.status===404||r?.status===409?'GITHUB_UNINITIALIZED':'GIT_UNAVAILABLE');
      const data=await r.json();
      return data&&typeof data==='object'&&!Array.isArray(data)?
        {ok:true,data}:fail('GIT_RESPONSE_INVALID');
    }catch{return fail('GIT_TRANSPORT_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  };
}
async function headTree(api){
  let r=await api('GET','');
  if(!r.ok)return r;
  if(r.data.full_name!=='Neb963/per-gens'||r.data.private!==true)
    return fail('PRIVATE_REPO_UNVERIFIED');
  r=await api('GET','/git/ref/heads/main');
  if(!r.ok)return r;
  const head=r.data.object?.sha;
  if(r.data.ref!=='refs/heads/main'||!sha(head))return fail('GITHUB_UNINITIALIZED');
  const commit=await api('GET','/git/commits/'+head);
  if(!commit.ok||!sha(commit.data.tree?.sha))return fail('GIT_TREE_UNVERIFIED');
  const tree=await api('GET','/git/trees/'+commit.data.tree.sha+'?recursive=1');
  if(!tree.ok||tree.data.truncated!==false||!Array.isArray(tree.data.tree)||
     tree.data.tree.length>25000)return fail('GIT_TREE_UNVERIFIED');
  return {ok:true,head,treeSha:commit.data.tree.sha,entries:tree.data.tree};
}
async function checkArchive(api,files,entries){
  const index=new Map(entries.map(x=>[x.path,x]));
  for(const file of files){
    const item=index.get(file.path);
    if(!item||item.type!=='blob'||item.mode!=='100644'||item.sha!==file.sha||
       item.size!==file.size)return fail('GIT_ARCHIVE_NOT_EQUIVALENT');
    const b=await api('GET','/git/blobs/'+file.sha);
    if(!b.ok||b.data.encoding!=='base64'||typeof b.data.content!=='string')
      return fail('GIT_ARCHIVE_READBACK_UNAVAILABLE');
    let bytes;try{bytes=decode(b.data.content.replace(/\s/g,''));}
    catch{return fail('GIT_ARCHIVE_READBACK_UNAVAILABLE');}
    if(bytes.length!==file.size||await hash('SHA-256',bytes)!==file.sha256)
      return fail('GIT_ARCHIVE_BYTES_CHANGED');
  }
  return {ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK'};
}
export async function inspectArchive(request,transport=fetch){
  if(!validToken(request?.token))return fail('GITHUB_WRITE_TOKEN_REQUIRED');
  const spec=await archiveFiles(request);
  if(!spec.ok)return spec;
  const api=apiClient(request.token,transport);
  const remote=await headTree(api);
  if(!remote.ok)return remote;
  const proof=await checkArchive(api,spec.files,remote.entries);
  return proof.ok?{...proof,folder:request.folder,prefix:spec.prefix,
    head:remote.head,ready:false}:proof;
}
export async function writeArchive(request,transport=fetch){
  if(!validToken(request?.token))return fail('GITHUB_WRITE_TOKEN_REQUIRED');
  const spec=await archiveFiles(request);
  if(!spec.ok)return spec;
  const api=apiClient(request.token,transport);
  const before=await headTree(api);
  if(!before.ok)return before;
  const prefix=spec.prefix.toLowerCase()+'/',folder=request.folder.toLowerCase()+'/';
  if(before.entries.some(e=>typeof e.path!=='string'||
     e.path.toLowerCase()===spec.prefix.toLowerCase()||
     e.path.toLowerCase().startsWith(prefix)))
    return fail('ORIGINAL_ARCHIVE_COLLISION');
  const existingFolder=before.entries.some(e=>
    typeof e.path==='string'&&(e.path.toLowerCase()===request.folder.toLowerCase()||
      e.path.toLowerCase().startsWith(folder)));
  // A pre-existing development folder must never be touched, even by adding
  // a "harmless" marker. The archive itself lives in a distinct root.
  const all=[...spec.files];
  if(!existingFolder){
    const bytes=utf8('Status: SOURCE_PENDING\n');
    all.push({path:request.folder+'/DEPLOYMENT.md',bytes,
      sha:await gitSha(bytes),sha256:await hash('SHA-256',bytes),size:bytes.length});
  }
  let mayHaveEffect=false;
  const uncertain=()=>fail(mayHaveEffect?'GIT_WRITE_UNCERTAIN':'GIT_NOT_ATTEMPTED');
  for(const item of all){
    mayHaveEffect=true;
    const blob=await api('POST','/git/blobs',{content:encode(item.bytes),encoding:'base64'});
    if(!blob.ok||blob.data.sha!==item.sha)return uncertain();
  }
  const newTree=await api('POST','/git/trees',{
    base_tree:before.treeSha,tree:all.map(f=>({
      path:f.path,mode:'100644',type:'blob',sha:f.sha}))});
  if(!newTree.ok||!sha(newTree.data.sha))return uncertain();
  const commit=await api('POST','/git/commits',{
    message:'archive: preserve original '+request.slug+' (non-READY)',
    tree:newTree.data.sha,parents:[before.head]});
  if(!commit.ok||!sha(commit.data.sha))return uncertain();
  const current=await api('GET','/git/ref/heads/main');
  if(!current.ok||current.data.object?.sha!==before.head)
    return fail('GIT_HEAD_DRIFT');
  const moved=await api('PATCH','/git/refs/heads/main',
    {sha:commit.data.sha,force:false});
  if(!moved.ok)return uncertain();
  const after=await headTree(api);
  if(!after.ok||after.head!==commit.data.sha||
     after.treeSha!==newTree.data.sha)return fail('GIT_READBACK_UNCERTAIN');
  const proof=await checkArchive(api,all,after.entries);
  return proof.ok?{...proof,folder:request.folder,
    prefix:spec.prefix,head:after.head,ready:false,
    createdMarker:!existingFolder}:fail('GIT_READBACK_UNCERTAIN');
}
