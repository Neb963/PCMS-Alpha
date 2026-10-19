// S04 exact-path conditional Git marker. The caller must durably mark a
// possible Git effect BEFORE invoking this helper. This function cannot
// grant permission to dispatch or interpret a 404 as an empty repository.
import {validRepository,recognizedSlug} from './git-catalog.mjs';
const sha=/^[a-f0-9]{40}$/;
const id=/^[1-9][0-9]{0,19}$/;
const fail=code=>({ok:false,code});
export const S04_NOT_READY='Status: NOT_READY\n';
const bytes=s=>new TextEncoder().encode(s);
const base64=u=>btoa([...u].map(n=>String.fromCharCode(n)).join(''));
export function validateS04MarkerRequest(r){
  if(!r||!validRepository(r.repository)||!id.test(r.repositoryId||'')||
     !recognizedSlug(r.slug)||r.folder!=='generators/'+r.slug||
     !sha.test(r.expectedHead||'')||
     typeof r.token!=='string'||r.token.length<12||r.token.length>512||
     !/^[\x21-\x7e]+$/.test(r.token))
    return fail('INVALID_S04_GIT_INTENT');
  return {ok:true};
}
export async function writeS04Marker(request,transport=fetch){
  const checked=validateS04MarkerRequest(request);
  if(!checked.ok)return checked;
  const root='https://api.github.com/repos/'+request.repository;
  let possibleEffect=false;
  const call=async(method,route,body)=>{
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
    try{
      const out=await transport(root+route,{
        method,redirect:'error',credentials:'omit',cache:'no-store',signal:ac.signal,
        headers:{Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',
          Authorization:'Bearer '+request.token,
          ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if(![200,201].includes(out.status))return fail(
        [401,403,404].includes(out.status)?'GIT_ACCESS_DENIED':'GIT_REMOTE_UNVERIFIED');
      const data=await out.json();
      return data&&typeof data==='object'&&!Array.isArray(data)?
        {ok:true,data}:fail('GIT_REMOTE_UNVERIFIED');
    }catch{return fail('GIT_TRANSPORT_UNKNOWN');}
    finally{clearTimeout(timer);}
  };
  const unverified=code=>possibleEffect?fail('GIT_EFFECT_UNCERTAIN'):fail(code);
  try{
    let r=await call('GET','');
    if(!r.ok||r.data.private!==true||r.data.full_name!==request.repository||
       String(r.data.id)!==request.repositoryId)return fail('GIT_REPOSITORY_IDENTITY_MISMATCH');
    r=await call('GET','/git/ref/heads/main');
    if(!r.ok||r.data.ref!=='refs/heads/main'||r.data.object?.type!=='commit'||
       !sha.test(r.data.object?.sha)||r.data.object.sha!==request.expectedHead)
      return fail('GIT_HEAD_CHANGED');
    const originalHead=r.data.object.sha;
    r=await call('GET','/git/commits/'+originalHead);
    if(!r.ok||!sha.test(r.data.tree?.sha))return fail('GIT_TREE_UNVERIFIED');
    const rootTree=r.data.tree.sha;
    const exact=async tree=>{
      const res=await call('GET','/git/trees/'+tree);
      if(!res.ok||res.data.truncated!==false||!Array.isArray(res.data.tree))
        return fail('GIT_TREE_INCOMPLETE');
      if(res.data.tree.some(v=>!v||typeof v.path!=='string'||
         v.path.includes('/')||typeof v.sha!=='string'||!sha.test(v.sha)))
        return fail('GIT_TREE_INCOMPLETE');
      return {ok:true,items:res.data.tree};
    };
    const top=await exact(rootTree);
    if(!top.ok)return top;
    let parent=top.items.find(x=>x.path==='generators');
    if(parent){
      if(parent.type!=='tree'||parent.mode!=='040000')
        return fail('GIT_GENERATORS_ROOT_CONFLICT');
      const folders=await exact(parent.sha);
      if(!folders.ok)return folders;
      if(folders.items.some(x=>x.path.toLowerCase()===request.slug.toLowerCase()))
        return fail('GIT_FOLDER_EXISTS');
    }
    // Only after verifying nonexistence at an independently pinned main tree
    // may a detached blob/tree/commit be created. The caller already marked
    // DISPATCH_POSSIBLE; uncertain outcome is never retried blindly.
    possibleEffect=true;
    const markerBytes=bytes(S04_NOT_READY);
    const prefix=bytes('blob '+markerBytes.length+'\0');
    const all=new Uint8Array(prefix.length+markerBytes.length);
    all.set(prefix);all.set(markerBytes,prefix.length);
    const expectedBlob=[...new Uint8Array(await crypto.subtle.digest('SHA-1',all))]
      .map(n=>n.toString(16).padStart(2,'0')).join('');
    r=await call('POST','/git/blobs',{content:S04_NOT_READY,encoding:'utf-8'});
    if(!r.ok||r.data.sha!==expectedBlob)return unverified('GIT_BLOB_UNVERIFIED');
    r=await call('POST','/git/trees',{
      base_tree:rootTree,
      tree:[{path:request.folder+'/DEPLOYMENT.md',
        mode:'100644',type:'blob',sha:expectedBlob}]
    });
    if(!r.ok||!sha.test(r.data.sha))return unverified('GIT_TREE_UNVERIFIED');
    const newTree=r.data.sha;
    r=await call('POST','/git/commits',{
      message:'pcms: initialize '+request.slug+' NOT_READY',
      tree:newTree,parents:[originalHead]});
    if(!r.ok||!sha.test(r.data.sha))return unverified('GIT_COMMIT_UNVERIFIED');
    const commit=r.data.sha;
    r=await call('GET','/git/ref/heads/main');
    if(!r.ok||r.data.object?.sha!==originalHead)return unverified('GIT_HEAD_CHANGED');
    r=await call('PATCH','/git/refs/heads/main',{sha:commit,force:false});
    if(!r.ok)return unverified('GIT_REF_OUTCOME_UNKNOWN');
    r=await call('GET','/git/ref/heads/main');
    if(!r.ok||r.data.object?.sha!==commit)return unverified('GIT_READBACK_UNVERIFIED');
    r=await call('GET','/git/commits/'+commit);
    if(!r.ok||r.data.tree?.sha!==newTree)return unverified('GIT_READBACK_UNVERIFIED');
    r=await call('GET','/git/blobs/'+expectedBlob);
    if(!r.ok||r.data.sha!==expectedBlob||r.data.encoding!=='base64'||
       r.data.content?.replace(/\s/g,'')!==base64(markerBytes))
      return unverified('GIT_READBACK_UNVERIFIED');
    // The newly created tree was based on the exact verified old root.
    // Independently fetch its exact path identity, not just the PATCH reply.
    r=await call('GET','/git/trees/'+newTree);
    if(!r.ok||r.data.truncated!==false)return unverified('GIT_READBACK_UNVERIFIED');
    const item=r.data.tree?.find(x=>x.path==='generators');
    if(!item||item.type!=='tree')return unverified('GIT_READBACK_UNVERIFIED');
    const folderList=await exact(item.sha);
    if(!folderList.ok||!folderList.items.some(x=>x.path===request.slug&&x.type==='tree'))
      return unverified('GIT_READBACK_UNVERIFIED');
    return {ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK',head:commit,
      folder:request.folder,markerOid:expectedBlob,ready:false,
      repositoryId:request.repositoryId};
  }catch{return unverified('GIT_EFFECT_UNCERTAIN');}
}
