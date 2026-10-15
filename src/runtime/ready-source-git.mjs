// I17: one exact, human-reviewed initial source promotion from an isolated
// PCMS-created non-READY marker. No mutation without caller's durable
// DISPATCH_POSSIBLE. A Git ACK is never proof of READY.
import {inspectGitSource} from './git-source.mjs';
import {exactSource} from './staging-core.mjs';
import {NON_READY_MARKER} from './supply-git.mjs';
const ROOT='https://api.github.com/repos/Neb963/per-gens';
const sha=/^[a-f0-9]{40}$/;
const slugOK=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const tokenOK=t=>typeof t==='string'&&t.length>=12&&t.length<=512&&!/\s/.test(t);
const enc=new TextEncoder();
const base64=b=>{let s='';for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const bad=code=>({ok:false,code});
export async function exactInitialSource({slug,pjs,html,assets=[]}={}){
  if(!slugOK(slug)||typeof pjs!=='string'||typeof html!=='string'||
     !pjs.trim()||!html.trim()||pjs.includes('\0')||html.includes('\0')||
     enc.encode(pjs).length>1048576||enc.encode(html).length>1048576)
    return bad('INITIAL_SOURCE_INVALID');
  if(!Array.isArray(assets)||assets.length>500||assets.some(f=>!f||
    typeof f.path!=='string'||!f.path.startsWith('src/')||Object.keys(f).some(k=>!['path','base64'].includes(k))))
    return bad('INITIAL_ASSETS_INVALID');
  const full=await exactSource([{path:'main.pjs',base64:base64(enc.encode(pjs))},
    {path:'index.html',base64:base64(enc.encode(html))},...assets]);
  if(!full.ok)return bad('INITIAL_ASSETS_INVALID');
  if(assets.length){
    const fingerprint=hex(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify({version:2,slug,source:full.fingerprint}))));
    return {ok:true,slug,fingerprint,files:full.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.size}))};
  }
  // Canonical length-prefix framing prevents concatenation aliasing.
  const a=enc.encode(pjs),b=enc.encode(html);
  const frame=JSON.stringify({version:1,slug,pjsBytes:a.length,htmlBytes:b.length})+'\n';
  const bytes=new Uint8Array(enc.encode(frame).length+a.length+b.length);
  let i=0;bytes.set(enc.encode(frame),i);i+=enc.encode(frame).length;
  bytes.set(a,i);bytes.set(b,i+a.length);
  const fingerprint=hex(await crypto.subtle.digest('SHA-256',bytes));
  return {ok:true,slug,fingerprint,files:[
    {path:'main.pjs',sha256:hex(await crypto.subtle.digest('SHA-256',a)),bytes:a.length},
    {path:'index.html',sha256:hex(await crypto.subtle.digest('SHA-256',b)),bytes:b.length}]};
}
export async function writeInitialReadySource({slug,pjs,html,assets=[],token,expectedHead,fingerprint}={},transport=fetch){
  if(!slugOK(slug)||!tokenOK(token)||!sha.test(expectedHead||''))return bad('READY_GIT_INPUT_INVALID');
  const exact=await exactInitialSource({slug,pjs,html,assets});
  if(!exact.ok||exact.fingerprint!==fingerprint)return bad('READY_SOURCE_FINGERPRINT_MISMATCH');
  const folder='gens/'+slug, markerPath=folder+'/DEPLOYMENT.md';
  let effectPossible=false;
  async function api(method,path,body){
    const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),12000);
    try{
      const res=await transport(ROOT+path,{
        method,redirect:'error',credentials:'omit',cache:'no-store',signal:ac.signal,
        headers:{Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token,
          ...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{})
      });
      if(![200,201].includes(res.status))return bad(res.status===401||res.status===403?
        'READY_GIT_ACCESS_DENIED':'READY_GIT_UNVERIFIED');
      return {ok:true,data:await res.json()};
    }catch{return bad('READY_GIT_TRANSPORT_UNKNOWN');}
    finally{clearTimeout(timeout);}
  }
  const uncertain=()=>bad(effectPossible?'READY_GIT_OUTCOME_UNKNOWN':'READY_GIT_PREFLIGHT_HELD');
  try{
    let r=await api('GET','');
    if(!r.ok||r.data.private!==true||r.data.full_name!=='Neb963/per-gens')return uncertain();
    r=await api('GET','/git/ref/heads/main');
    if(!r.ok||r.data.object?.sha!==expectedHead)return bad('READY_GIT_HEAD_CHANGED');
    r=await api('GET','/git/commits/'+expectedHead);
    if(!r.ok||!sha.test(r.data.tree?.sha||''))return bad('READY_GIT_TREE_UNVERIFIED');
    const oldTree=r.data.tree.sha;
    r=await api('GET','/git/trees/'+oldTree+'?recursive=1');
    if(!r.ok||r.data.truncated!==false||!Array.isArray(r.data.tree))return bad('READY_GIT_TREE_UNVERIFIED');
    const own=r.data.tree.filter(x=>typeof x.path==='string'&&
      x.path.toLowerCase().startsWith(folder.toLowerCase()+'/'));
    if(own.length!==1||own[0].path!==markerPath||own[0].type!=='blob')
      return bad('READY_SOURCE_NOT_ISOLATED');
    r=await api('GET','/git/blobs/'+own[0].sha);
    if(!r.ok||r.data.encoding!=='base64'||r.data.content?.replace(/\s/g,'')!==base64(enc.encode(NON_READY_MARKER)))
      return bad('READY_MARKER_CHANGED');
    const marker='Status: READY\nSource SHA-256: '+fingerprint+'\n';
    const files=[{path:'main.pjs',base64:base64(enc.encode(pjs))},{path:'index.html',base64:base64(enc.encode(html))},...assets,{path:'DEPLOYMENT.md',base64:base64(enc.encode(marker))}];
    const entries=[];
    effectPossible=true; // object creations may already have happened even if ref stays unchanged
    for(const file of files){
      r=await api('POST','/git/blobs',{content:file.base64,encoding:'base64'});
      if(!r.ok||!sha.test(r.data.sha||''))return uncertain();
      entries.push({path:folder+'/'+file.path,mode:'100644',type:'blob',sha:r.data.sha});
    }
    r=await api('POST','/git/trees',{base_tree:oldTree,tree:entries});
    if(!r.ok||!sha.test(r.data.sha||''))return uncertain();
    const newTree=r.data.sha;
    const message='pcms: approve initial exact source '+slug+' '+fingerprint;
    r=await api('POST','/git/commits',{message,tree:newTree,parents:[expectedHead]});
    if(!r.ok||!sha.test(r.data.sha||''))return uncertain();
    const commit=r.data.sha;
    const before=await api('GET','/git/ref/heads/main');
    if(!before.ok||before.data.object?.sha!==expectedHead)return uncertain();
    const update=await api('PATCH','/git/refs/heads/main',{sha:commit,force:false});
    if(!update.ok)return uncertain();
    // Independent remote HEAD/tree/byte readback, never success by PATCH ACK.
    const remote=await api('GET','/git/ref/heads/main');
    const readCommit=await api('GET','/git/commits/'+commit);
    if(!remote.ok||remote.data.object?.sha!==commit||
       !readCommit.ok||readCommit.data.tree?.sha!==newTree||
       readCommit.data.parents?.length!==1||
       readCommit.data.parents?.[0]?.sha!==expectedHead||
       readCommit.data.message!==message)return uncertain();
    const readTree=await api('GET','/git/trees/'+newTree+'?recursive=1');
    if(!readTree.ok||readTree.data.truncated!==false||!Array.isArray(readTree.data.tree))return uncertain();
    const saved=readTree.data.tree.filter(x=>typeof x.path==='string'&&
      x.path.toLowerCase().startsWith(folder.toLowerCase()+'/'));
    if(saved.filter(x=>x.type==='blob').length!==entries.length||saved.some(x=>
      x.type==='tree'?!entries.some(e=>e.path.startsWith(x.path+'/')):
      !entries.some(e=>e.path===x.path&&e.sha===x.sha&&e.mode===x.mode&&e.type===x.type)))return uncertain();
    for(const entry of entries){
      const b=await api('GET','/git/blobs/'+entry.sha);
      const wanted=files.find(f=>folder+'/'+f.path===entry.path);
      if(!b.ok||b.data.encoding!=='base64'||
        b.data.content?.replace(/\s/g,'')!==wanted.base64)return uncertain();
    }
    const finalHead=await api('GET','/git/ref/heads/main');
    if(!finalHead.ok||finalHead.data.object?.sha!==commit)return uncertain();
    return {ok:true,source:'INDEPENDENT_GIT_HEAD_TREE_BYTES',ready:true,folder,
      head:commit,baseHead:expectedHead,fingerprint};
  }catch{return uncertain();}
}
export async function inspectInitialReadySource({slug,token,expectedHead,fingerprint,files}={},
  inspect=inspectGitSource,transport=fetch){
  if(!slugOK(slug)||!tokenOK(token)||!sha.test(expectedHead||'')||
    !/^[a-f0-9]{64}$/.test(fingerprint||''))return bad('READY_RECONCILE_INVALID');
  const folder='gens/'+slug;
  let current;
  try{current=await inspect({folder,token,includeSourceBytes:false});}
  catch{return bad('READY_RECONCILE_UNAVAILABLE');}
  if(!current?.ok||!current.ready||current.folder!==folder||
     current.repo!=='Neb963/per-gens'||!sha.test(current.head||'')||
     current.paths?.length!==files?.length+1)return bad('READY_RECONCILE_HELD');
  try{
    const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),12000);
    let response;
    try{response=await transport(ROOT+'/git/commits/'+current.head,{method:'GET',
      redirect:'error',credentials:'omit',cache:'no-store',signal:ac.signal,
      headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
        Authorization:'Bearer '+token}});}
    finally{clearTimeout(timeout);}
    if(response.status!==200)return bad('READY_RECONCILE_HELD');
    const commit=await response.json();
    if(commit.parents?.length!==1||commit.parents[0].sha!==expectedHead||
       commit.message!=='pcms: approve initial exact source '+slug+' '+fingerprint)
      return bad('READY_GIT_ATTRIBUTION_UNVERIFIED');
    // Independently hashed remote source bytes must match the journal.
    if(!Array.isArray(files)||files.length<2||files.length>502||
       files.some(expected=>{
         const observed=current.paths.find(p=>p.path===expected.path);
         return !observed||observed.sha256!==expected.sha256||
           observed.size!==expected.bytes;
       }))return bad('READY_SOURCE_BYTES_CHANGED');
    const md=current.paths.find(p=>p.path==='DEPLOYMENT.md');
    // Exact manifest/source can only be proven from current inspected bytes.
    if(!md)return bad('READY_MARKER_UNVERIFIED');
    const manifest='Status: READY\nSource SHA-256: '+fingerprint+'\n';
    const expected=hex(await crypto.subtle.digest('SHA-256',enc.encode(manifest)));
    if(md.sha256!==expected)return bad('READY_MARKER_UNVERIFIED');
    return {ok:true,source:'INDEPENDENT_GIT_COMMIT_AND_SOURCE_MANIFEST',ready:true,
      folder,head:current.head,baseHead:expectedHead,fingerprint};
  }catch{return bad('READY_RECONCILE_UNAVAILABLE');}
}
