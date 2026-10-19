// S04 immutable-by-protocol observed-original archive. Writes ONLY a new
// protected archival ref, never main or an originals/ tree on main.
// Actual remote tag protection is an E-05 external proof, not assumed here.
import {validRepository,recognizedSlug} from './git-catalog.mjs';
const sha=/^[a-f0-9]{40}$/,fp=/^[a-f0-9]{64}$/,id=/^[1-9][0-9]{0,19}$/;
const safe=/^[A-Za-z0-9_-]{8,100}$/;
const fail=code=>({ok:false,code});
const utf8=s=>new TextEncoder().encode(s);
const hex=x=>[...new Uint8Array(x)].map(b=>b.toString(16).padStart(2,'0')).join('');
const base64=x=>{let s='';for(let i=0;i<x.length;i+=8192)
  s+=String.fromCharCode(...x.subarray(i,i+8192));return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function shaDigest(algo,bytes){return hex(await crypto.subtle.digest(algo,bytes));}
async function blobSha(content){
  const head=utf8('blob '+content.length+'\0');
  const bytes=new Uint8Array(head.length+content.length);
  bytes.set(head);bytes.set(content,head.length);
  return shaDigest('SHA-1',bytes);
}
export function originalArchiveRef(remotePublicId,fingerprint){
  if(!safe.test(remotePublicId||'')||!fp.test(fingerprint||''))return null;
  return 'refs/tags/pcms-originals/'+remotePublicId+'/'+fingerprint;
}
const sourcePath=p=>typeof p==='string'&&
  (p==='main.pjs'||p==='index.html'||
    /^src\/[A-Za-z0-9][A-Za-z0-9._/-]{0,220}$/.test(p)&&
    !p.split('/').some(x=>!x||x==='.'||x==='..'||x.endsWith('.')));
export async function prepareOriginalArchive({original,slug}){
  if(!recognizedSlug(slug)||!original||
    !originalArchiveRef(original.remotePublicId,original.fingerprint)||
    !Array.isArray(original.files)||!Array.isArray(original.blobs)||
    original.files.length<2||original.files.length>500||
    original.files.length!==original.blobs.length)return fail('ARCHIVE_ORIGINAL_UNVERIFIED');
  const all=[],names=new Set();
  let size=0;
  try{
    for(const row of original.files){
      if(!sourcePath(row?.path)||names.has(row.path.toLowerCase())||
        !Number.isSafeInteger(row.size)||row.size<0||
        !fp.test(row.sha256||''))return fail('ARCHIVE_FILE_INVALID');
      const src=original.blobs.find(b=>b?.path===row.path);
      if(!src||typeof src.base64!=='string')return fail('ARCHIVE_FILE_MISSING');
      const data=decode(src.base64);
      if(data.length!==row.size||await shaDigest('SHA-256',data)!==row.sha256)
        return fail('ARCHIVE_FILE_BYTES_CHANGED');
      names.add(row.path.toLowerCase());size+=data.length;
      if(size>16*1024*1024)return fail('ARCHIVE_TOO_LARGE');
      all.push({path:'generators/'+slug+'/'+row.path,bytes:data,
        oid:await blobSha(data),size:data.length,sha256:row.sha256});
    }
    if(!names.has('main.pjs')||!names.has('index.html'))
      return fail('ARCHIVE_FILE_MISSING');
    const manifest=utf8(JSON.stringify({kind:'OBSERVED_PROVIDER_ORIGINAL',
      observedAt:original.observedAt,source:'NEW_ARCHIVE_OF_OBSERVATION',
      remotePublicId:original.remotePublicId,visibility:original.visibility,
      fingerprint:original.fingerprint,files:original.files},null,2)+'\n');
    all.push({path:'generators/'+slug+'/ORIGINAL.json',
      bytes:manifest,oid:await blobSha(manifest),
      size:manifest.length,sha256:await shaDigest('SHA-256',manifest)});
    return {ok:true,ref:originalArchiveRef(original.remotePublicId,original.fingerprint),
      files:all,slug,fingerprint:original.fingerprint};
  }catch{return fail('ARCHIVE_FILE_BYTES_CHANGED');}
}
export async function writeOriginalArchive(request,transport=fetch){
  if(!validRepository(request?.repository)||!id.test(request?.repositoryId||'')||
     typeof request.token!=='string'||request.token.length<12||
     request.token.length>512||!safe.test(request?.original?.remotePublicId||''))
    return fail('GIT_ARCHIVE_AUTHORITY_INVALID');
  const planned=await prepareOriginalArchive(request);
  if(!planned.ok)return planned;
  const root='https://api.github.com/repos/'+request.repository;
  let possible=false;
  async function api(method,path,body){
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
    try{
      const response=await transport(root+path,{
        method,redirect:'error',credentials:'omit',cache:'no-store',signal:ac.signal,
        headers:{Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+request.token,
          ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(![200,201].includes(response.status))
        return fail([401,403,404].includes(response.status)?
          'GIT_ACCESS_DENIED':'GIT_REMOTE_UNVERIFIED');
      const data=await response.json();
      return data&&typeof data==='object'&&!Array.isArray(data)?
        {ok:true,data}:fail('GIT_REMOTE_UNVERIFIED');
    }catch{return fail('GIT_TRANSPORT_UNKNOWN');}
    finally{clearTimeout(timer);}
  }
  const uncertain=()=>fail(possible?'GIT_ARCHIVE_UNCERTAIN':'GIT_ARCHIVE_NOT_ATTEMPTED');
  try{
    let r=await api('GET','');
    if(!r.ok||r.data.private!==true||
       r.data.full_name!==request.repository||
       String(r.data.id)!==request.repositoryId)
      return fail('GIT_REPOSITORY_IDENTITY_MISMATCH');
    r=await api('GET','/git/ref/heads/main');
    if(!r.ok||r.data.ref!=='refs/heads/main'||!sha.test(r.data.object?.sha||''))
      return fail('GIT_MAIN_UNVERIFIED');
    const baseHead=r.data.object.sha;
    // All detached tree paths are under generators/<slug>/. No operation
    // on refs/heads/main or a pre-existing development folder is permitted.
    possible=true;
    for(const file of planned.files){
      r=await api('POST','/git/blobs',{content:base64(file.bytes),encoding:'base64'});
      if(!r.ok||r.data.sha!==file.oid)return uncertain();
    }
    r=await api('POST','/git/trees',{tree:planned.files.map(f=>({
      path:f.path,type:'blob',mode:'100644',sha:f.oid}))});
    if(!r.ok||!sha.test(r.data.sha||''))return uncertain();
    const tree=r.data.sha;
    r=await api('POST','/git/commits',{
      message:'pcms observed original archive (not historical authoring)',
      parents:[baseHead],tree});
    if(!r.ok||!sha.test(r.data.sha||''))return uncertain();
    const commit=r.data.sha;
    r=await api('POST','/git/refs',{ref:planned.ref,sha:commit});
    if(!r.ok||r.data.ref!==planned.ref||
       r.data.object?.sha!==commit)return uncertain();
    r=await api('GET','/git/ref/'+planned.ref.slice(5));
    if(!r.ok||r.data.ref!==planned.ref||r.data.object?.sha!==commit)
      return uncertain();
    r=await api('GET','/git/commits/'+commit);
    if(!r.ok||r.data.tree?.sha!==tree)return uncertain();
    r=await api('GET','/git/trees/'+tree+'?recursive=1');
    if(!r.ok||r.data.truncated!==false||!Array.isArray(r.data.tree))
      return uncertain();
    const found=new Map(r.data.tree.filter(e=>e.type==='blob').map(e=>[e.path,e]));
    if(found.size!==planned.files.length)return uncertain();
    for(const file of planned.files){
      const entry=found.get(file.path);
      if(!entry||entry.sha!==file.oid||entry.mode!=='100644')return uncertain();
      const read=await api('GET','/git/blobs/'+file.oid);
      if(!read.ok||read.data.encoding!=='base64'||read.data.sha!==file.oid||
         read.data.content?.replace(/\s/g,'')!==base64(file.bytes))
        return uncertain();
    }
    return {ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK',
      archiveRef:planned.ref,prefix:'generators/'+planned.slug,
      fingerprint:planned.fingerprint,commit,head:baseHead,
      repositoryId:request.repositoryId};
  }catch{return uncertain();}
}

export async function inspectOriginalArchive(request,transport=fetch){
  if(!validRepository(request?.repository)||!id.test(request.repositoryId||'')||
     typeof request.token!=='string'||request.token.length<12||
     request.token.length>512)return fail('GIT_ARCHIVE_AUTHORITY_INVALID');
  const planned=await prepareOriginalArchive(request);
  if(!planned.ok)return planned;
  const root='https://api.github.com/repos/'+request.repository;
  const read=async path=>{
    const response=await transport(root+path,{
      method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        Authorization:'Bearer '+request.token}});
    if(response?.status!==200)throw Error('ARCHIVE_READ_UNAVAILABLE');
    return response.json();
  };
  try{
    const repo=await read('');
    if(repo.private!==true||repo.full_name!==request.repository||
       String(repo.id)!==request.repositoryId)
      return fail('GIT_REPOSITORY_IDENTITY_MISMATCH');
    const ref=await read('/git/ref/'+planned.ref.slice(5));
    if(ref.ref!==planned.ref||!sha.test(ref.object?.sha||''))
      return fail('ARCHIVE_REF_UNVERIFIED');
    const commit=await read('/git/commits/'+ref.object.sha);
    if(!sha.test(commit.tree?.sha||''))return fail('ARCHIVE_TREE_UNVERIFIED');
    const tree=await read('/git/trees/'+commit.tree.sha+'?recursive=1');
    if(tree.truncated!==false||!Array.isArray(tree.tree))
      return fail('ARCHIVE_TREE_INCOMPLETE');
    const found=new Map(tree.tree.filter(x=>x.type==='blob').map(x=>[x.path,x]));
    if(found.size!==planned.files.length)return fail('ARCHIVE_TREE_DIVERGENT');
    for(const f of planned.files){
      const e=found.get(f.path);
      if(!e||e.sha!==f.oid||e.mode!=='100644')
        return fail('ARCHIVE_TREE_DIVERGENT');
      const blob=await read('/git/blobs/'+f.oid);
      if(blob.sha!==f.oid||blob.encoding!=='base64'||
         blob.content?.replace(/\\s/g,'')!==base64(f.bytes))
        return fail('ARCHIVE_BYTES_DIVERGENT');
    }
    return {ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK',
      archiveRef:planned.ref,prefix:'generators/'+planned.slug,
      fingerprint:planned.fingerprint,commit:ref.object.sha,
      head:commit.parents?.[0]?.sha||null,
      repositoryId:request.repositoryId};
  }catch{return fail('ARCHIVE_READBACK_UNAVAILABLE');}
}
