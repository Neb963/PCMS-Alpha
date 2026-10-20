// One-button diagnostic: conditional Git declaration of a minimal disposable
// test generator. Exact-path, exact-head, non-force write to the designated
// test folder only, following the S04 marker writer's verification pattern.
// The caller durably records DISPATCH_POSSIBLE first; an uncertain outcome is
// reconciled by readback (observeDiagnosticReady), never replayed.
import {validRepository,recognizedSlug} from './git-catalog.mjs';
import {S04_NOT_READY} from './creation-git.mjs';
const sha=/^[a-f0-9]{40}$/,id=/^[1-9][0-9]{0,19}$/;
const fail=code=>({ok:false,code});
const enc=new TextEncoder();
export function diagnosticReadyFiles(slug,readyRevision){
  // Deliberately small, valid Perchance source. Native AI development and
  // its tests then run through the ordinary READY pipeline.
  return [
    {path:'DEPLOYMENT.md',text:'Status: READY\nReady-Revision: '+readyRevision+'\n'},
    {path:'index.html',text:'<h1>PCMS diagnostic</h1>\n<p id="out">[output]</p>\n'},
    {path:'main.pjs',text:'// PCMS disposable diagnostic generator '+slug+'\noutput\n  PCMS diagnostic {ok|ready}\n'}
  ];
}
async function blobSha(text){
  const raw=enc.encode(text),pre=enc.encode('blob '+raw.length+'\0');
  const all=new Uint8Array(pre.length+raw.length);all.set(pre);all.set(raw,pre.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1',all))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
}
function validate(r){
  if(!r||!validRepository(r.repository)||!id.test(r.repositoryId||'')||
     !recognizedSlug(r.slug)||!sha.test(r.expectedHead||'')||
     !/^diag-[a-f0-9]{12,32}$/.test(r.readyRevision||'')||
     typeof r.token!=='string'||!/^[\x21-\x7e]{12,512}$/.test(r.token))
    return fail('INVALID_DIAGNOSTIC_READY_INTENT');
  return {ok:true};
}
function client(request,transport){
  const root='https://api.github.com/repos/'+request.repository;
  return async(method,route,body)=>{
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),15000);
    try{
      const out=await transport(root+route,{method,redirect:'error',credentials:'omit',
        cache:'no-store',signal:ac.signal,headers:{Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+request.token,
          ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      if(![200,201].includes(out.status))return fail(
        [401,403,404].includes(out.status)?'GIT_ACCESS_DENIED':'GIT_REMOTE_UNVERIFIED');
      const data=await out.json();
      return data&&typeof data==='object'?{ok:true,data}:fail('GIT_REMOTE_UNVERIFIED');
    }catch{return fail('GIT_TRANSPORT_UNKNOWN');}
    finally{clearTimeout(timer);}
  };
}
async function folderItems(call,tree,slug){
  const top=await call('GET','/git/trees/'+tree);
  if(!top.ok||top.data.truncated!==false||!Array.isArray(top.data.tree))return null;
  const gens=top.data.tree.find(x=>x.path==='generators'&&x.type==='tree');
  if(!gens)return null;
  const list=await call('GET','/git/trees/'+gens.sha);
  if(!list.ok||list.data.truncated!==false||!Array.isArray(list.data.tree))return null;
  const folder=list.data.tree.find(x=>x.path===slug&&x.type==='tree');
  if(!folder)return [];
  const items=await call('GET','/git/trees/'+folder.sha);
  return items.ok&&items.data.truncated===false&&Array.isArray(items.data.tree)?items.data.tree:null;
}
// Read-only: does main carry exactly this run's declaration and files?
export async function observeDiagnosticReady(request,transport=fetch){
  const checked=validate(request);if(!checked.ok)return checked;
  const call=client(request,transport);
  const ref=await call('GET','/git/ref/heads/main');
  if(!ref.ok||!sha.test(ref.data.object?.sha||''))return fail('GIT_HEAD_UNVERIFIED');
  const commit=await call('GET','/git/commits/'+ref.data.object.sha);
  if(!commit.ok||!sha.test(commit.data.tree?.sha||''))return fail('GIT_TREE_UNVERIFIED');
  const items=await folderItems(call,commit.data.tree.sha,request.slug);
  if(!items)return fail('GIT_TREE_INCOMPLETE');
  const files=diagnosticReadyFiles(request.slug,request.readyRevision);
  for(const f of files){
    const want=await blobSha(f.text);
    if(!items.some(x=>x.path===f.path&&x.type==='blob'&&x.sha===want))
      return {ok:true,present:false,head:ref.data.object.sha};
  }
  return {ok:true,present:true,head:ref.data.object.sha};
}
export async function writeDiagnosticReady(request,transport=fetch){
  const checked=validate(request);if(!checked.ok)return checked;
  const call=client(request,transport);
  let possible=false;
  const unverified=code=>possible?fail('GIT_EFFECT_UNCERTAIN'):fail(code);
  try{
    let r=await call('GET','');
    if(!r.ok||r.data.private!==true||r.data.full_name!==request.repository||
       String(r.data.id)!==request.repositoryId)return fail('GIT_REPOSITORY_IDENTITY_MISMATCH');
    r=await call('GET','/git/ref/heads/main');
    if(!r.ok||r.data.object?.sha!==request.expectedHead)return fail('GIT_HEAD_CHANGED');
    r=await call('GET','/git/commits/'+request.expectedHead);
    if(!r.ok||!sha.test(r.data.tree?.sha||''))return fail('GIT_TREE_UNVERIFIED');
    const rootTree=r.data.tree.sha;
    // Only the PCMS-created NOT_READY marker folder for this exact test slug.
    const items=await folderItems(call,rootTree,request.slug);
    if(!items)return fail('GIT_TREE_INCOMPLETE');
    const marker=await blobSha(S04_NOT_READY);
    if(items.length!==1||items[0].path!=='DEPLOYMENT.md'||items[0].sha!==marker)
      return fail('TEST_FOLDER_NOT_PCMS_NOT_READY');
    possible=true;
    const files=diagnosticReadyFiles(request.slug,request.readyRevision),tree=[];
    for(const f of files){
      const want=await blobSha(f.text);
      r=await call('POST','/git/blobs',{content:f.text,encoding:'utf-8'});
      if(!r.ok||r.data.sha!==want)return unverified('GIT_BLOB_UNVERIFIED');
      tree.push({path:'generators/'+request.slug+'/'+f.path,mode:'100644',type:'blob',sha:want});
    }
    r=await call('POST','/git/trees',{base_tree:rootTree,tree});
    if(!r.ok||!sha.test(r.data.sha||''))return unverified('GIT_TREE_UNVERIFIED');
    const newTree=r.data.sha;
    r=await call('POST','/git/commits',{message:'pcms: diagnostic READY '+request.slug+
      '\n\nPCMS-Diagnostic: '+request.readyRevision,tree:newTree,parents:[request.expectedHead]});
    if(!r.ok||!sha.test(r.data.sha||''))return unverified('GIT_COMMIT_UNVERIFIED');
    const commit=r.data.sha;
    r=await call('GET','/git/ref/heads/main');
    if(!r.ok||r.data.object?.sha!==request.expectedHead)return unverified('GIT_HEAD_CHANGED');
    r=await call('PATCH','/git/refs/heads/main',{sha:commit,force:false});
    if(!r.ok)return unverified('GIT_REF_OUTCOME_UNKNOWN');
    const seen=await observeDiagnosticReady(request,transport);
    if(!seen.ok||seen.present!==true||seen.head!==commit)return unverified('GIT_READBACK_UNVERIFIED');
    return {ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK',head:commit,ready:true};
  }catch{return unverified('GIT_EFFECT_UNCERTAIN');}
}
