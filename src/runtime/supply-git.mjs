// I06 one-time private per-gens folder marker. NEVER call before durable Git
// DISPATCH_POSSIBLE and separately authorized write capability. Every ref
// update is nonforced; errors after object creation mean UNKNOWN, not retry.
import {safeFolder} from './git-source.mjs';
import {fail} from './journal.mjs';
const ROOT='https://api.github.com/repos/Neb963/per-gens';
const SHA=/^[a-f0-9]{40}$/;
const marker='Status: NOT_READY\n';  // Exact approved deployment declaration.
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const utf8=s=>new TextEncoder().encode(s);
const own=o=>o&&typeof o==='object'&&!Array.isArray(o);
const rootFolder=folder=>safeFolder(folder)&&folder.startsWith('generators/')&&
  folder.split('/').length===2&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(folder.slice(11));
export const NON_READY_MARKER=marker;
export function markerRequestAllowed({folder,slug,token}){
  if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     folder!=='generators/'+slug||!rootFolder(folder))return fail('UNSAFE_SOURCE_PATH');
  if(typeof token!=='string'||token.length<12||token.length>512||
     /[\s\r\n]/.test(token))return fail('GITHUB_WRITE_TOKEN_REQUIRED');
  return {ok:true};
}
export async function writeNonReadyFolder(request,transport=fetch){
  const permitted=markerRequestAllowed(request);
  if(!permitted.ok)return permitted;
  const {folder,token}=request;
  let effectAttempted=false;
  async function api(method,path,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await transport(ROOT+path,{
        method,redirect:'error',credentials:'omit',cache:'no-store',
        signal:controller.signal,
        headers:{
          Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',
          Authorization:'Bearer '+token,
          ...(body===undefined?{}:{'Content-Type':'application/json'})
        },
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if(![200,201].includes(response.status))return fail(
        response.status===401||response.status===403?'GITHUB_ACCESS_DENIED':
        response.status===404?'GITHUB_UNINITIALIZED':'GIT_WRITE_UNCERTAIN');
      const data=await response.json();
      return own(data)?{ok:true,data}:fail('GIT_RESPONSE_UNVERIFIED');
    }catch{return fail('GIT_TRANSPORT_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  }
  const uncertain=x=>effectAttempted?fail('GIT_WRITE_UNCERTAIN'):x;
  try {
    let r=await api('GET','');
    if(!r.ok)return r;
    if(r.data.private!==true||r.data.full_name!=='Neb963/per-gens')
      return fail('PRIVATE_REPO_UNVERIFIED');
    r=await api('GET','/git/ref/heads/main');
    if(!r.ok)return r;
    const head=r.data.object?.sha;
    if(r.data.ref!=='refs/heads/main'||!SHA.test(head))
      return fail('GITHUB_UNINITIALIZED');
    r=await api('GET','/git/commits/'+head);
    if(!r.ok)return r;
    const tree=r.data.tree?.sha;
    if(!SHA.test(tree))return fail('GIT_TREE_UNVERIFIED');
    r=await api('GET','/git/trees/'+tree+'?recursive=1');
    if(!r.ok)return r;
    if(r.data.truncated!==false||!Array.isArray(r.data.tree)||
       r.data.tree.length>20000)return fail('GIT_TREE_UNVERIFIED');
    const folderLower=folder.toLowerCase(),markerPath=folder+'/DEPLOYMENT.md';
    if(r.data.tree.some(entry=>{
      const p=entry?.path;
      return typeof p!=='string'||p.toLowerCase()===folderLower||
        p.toLowerCase().startsWith(folderLower+'/');
    }))return fail('SOURCE_FOLDER_COLLISION');
    // A completely new one-file folder avoids ever overwriting human source.
    effectAttempted=true;
    r=await api('POST','/git/blobs',{content:marker,encoding:'utf-8'});
    if(!r.ok||!SHA.test(r.data?.sha))return uncertain(fail('GIT_BLOB_UNVERIFIED'));
    const markerSha=r.data.sha;
    r=await api('POST','/git/trees',{
      base_tree:tree,tree:[{path:markerPath,mode:'100644',type:'blob',sha:markerSha}]});
    if(!r.ok||!SHA.test(r.data?.sha))return uncertain(fail('GIT_TREE_UNVERIFIED'));
    const newTree=r.data.sha;
    r=await api('POST','/git/commits',{
      message:'supply: reserve '+request.slug+' (not ready)',
      tree:newTree,parents:[head]});
    if(!r.ok||!SHA.test(r.data?.sha))return uncertain(fail('GIT_COMMIT_UNVERIFIED'));
    const candidate=r.data.sha;
    // Explicit expected-head fence. Nonforced PATCH is still required.
    const latest=await api('GET','/git/ref/heads/main');
    if(!latest.ok||latest.data.object?.sha!==head)
      return fail('GIT_HEAD_DRIFT');
    r=await api('PATCH','/git/refs/heads/main',{sha:candidate,force:false});
    if(!r.ok)return fail('GIT_WRITE_UNCERTAIN');
    // Read the actual remote ref and blob; a success reply is not acceptance.
    r=await api('GET','/git/ref/heads/main');
    if(!r.ok||r.data.object?.sha!==candidate)
      return fail('GIT_READBACK_UNCERTAIN');
    r=await api('GET','/git/commits/'+candidate);
    if(!r.ok||r.data.tree?.sha!==newTree)
      return fail('GIT_READBACK_UNCERTAIN');
    r=await api('GET','/git/trees/'+newTree+'?recursive=1');
    if(!r.ok||r.data.truncated!==false||!Array.isArray(r.data.tree))
      return fail('GIT_READBACK_UNCERTAIN');
    const owned=r.data.tree.filter(x=>typeof x.path==='string'&&
      x.path.toLowerCase().startsWith(folderLower+'/'));
    if(owned.length!==1||owned[0].path!==markerPath||
       owned[0].type!=='blob'||owned[0].mode!=='100644'||
       owned[0].sha!==markerSha)return fail('GIT_READBACK_UNCERTAIN');
    r=await api('GET','/git/blobs/'+markerSha);
    if(!r.ok||r.data.encoding!=='base64'||r.data.content?.replace(/\s/g,'')!==b64(utf8(marker)))
      return fail('GIT_READBACK_UNCERTAIN');
    return {ok:true,source:'GIT_READBACK',ready:false,emptyFolder:true,
      folder,head:candidate,markerSha};
  }catch{return uncertain(fail('GIT_WRITE_UNCERTAIN'));}
}
