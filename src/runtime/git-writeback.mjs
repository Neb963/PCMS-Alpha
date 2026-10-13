// I11 Git-only conditional writeback. No provider/Persona/publication access.
// Caller MUST persist DISPATCH_POSSIBLE before invoking writeGitCandidate.
import {exactSource} from './staging-core.mjs';
import {safeFolder} from './git-source.mjs';
import {fail} from './journal.mjs';

const ROOT='https://api.github.com/repos/Neb963/per-gens';
const SHA=/^[0-9a-f]{40}$/, HEX=/^[0-9a-f]{64}$/;
const encoder=new TextEncoder();
const decode=s=>Uint8Array.from(atob(s.replace(/\s/g,'')),x=>x.charCodeAt(0));
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async(algorithm,bytes)=>hex(await crypto.subtle.digest(algorithm,bytes));
const gitBlob=async bytes=>{
  const pre=encoder.encode('blob '+bytes.length+'\0'),data=new Uint8Array(pre.length+bytes.length);
  data.set(pre);data.set(bytes,pre.length);return digest('SHA-1',data);
};
const pathOK=p=>typeof p==='string'&&p.length<=512&&p===p.normalize('NFC')&&
  p.split('/').every(s=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s)&&
    s!=='.'&&s!=='..'&&!s.endsWith('.'));
const deployable=p=>p==='main.pjs'||p==='index.html'||p.startsWith('src/');
const validToken=t=>typeof t==='string'&&t.length>=12&&t.length<=512&&/^[\x21-\x7e]+$/.test(t);
const validMessage=m=>typeof m==='string'&&m.length>=3&&m.length<=120&&
  /^[\x20-\x7e]+$/.test(m)&&m.trim()===m&&!/^(?:PCMS_COMMIT_MESSAGE:)/.test(m);
export function commitMessage(text){
  if(!validMessage(text))return fail('COMMIT_MESSAGE_INVALID');
  return {ok:true,text};
}
// Only a guarded, independently session-attributed terminal assistant turn
// can be parsed. Caller does not get an authorization boolean from its prose.
export function parseTerminalSuggestion(packet,sessionDigest){
  if(packet?.kind!=='TERMINAL_ASSISTANT'||
     packet?.origin!=='DONOR_GUARDED_NATIVE_HISTORY'||
     packet?.sessionDigest!==sessionDigest||!HEX.test(sessionDigest||'')||
     packet?.settled!==true||typeof packet.text!=='string'||
     packet.text.length>8192)return fail('AI_TERMINAL_UNVERIFIED');
  const markers=packet.text.split(/\r?\n/).filter(s=>s.startsWith('PCMS_COMMIT_MESSAGE:'));
  if(markers.length!==1)return fail('AI_COMMIT_SUGGESTION_ABSENT_OR_AMBIGUOUS');
  const match=/^PCMS_COMMIT_MESSAGE: ([\x20-\x7e]{3,120})$/.exec(markers[0]);
  return match?commitMessage(match[1]):fail('AI_COMMIT_SUGGESTION_INVALID');
}
function client(token,transport){
  let requests=0;
  return async(method,route,body)=>{
    if(++requests>1030)return fail('GIT_REQUEST_LIMIT');
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),14000);
    try{
      const response=await transport(ROOT+route,{
        method,credentials:'omit',cache:'no-store',redirect:'error',
        signal:ac.signal,headers:{Accept:'application/vnd.github+json',
          'X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token,
          ...(body===undefined?{}:{'Content-Type':'application/json'})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if(![200,201].includes(response?.status))return fail(
        response?.status===401||response?.status===403?'GIT_ACCESS_OR_POLICY_DENIED':
        response?.status===404?'GIT_SOURCE_NOT_FOUND':
        response?.status===409||response?.status===422?'GIT_CONFLICT':'GIT_TRANSPORT_UNAVAILABLE');
      const data=await response.json();
      return data&&typeof data==='object'&&!Array.isArray(data)?{ok:true,data}:
        fail('GIT_RESPONSE_UNVERIFIED');
    }catch{return fail('GIT_TRANSPORT_UNAVAILABLE');}
    finally{clearTimeout(timer);}
  };
}
async function readTree(api,commitSha){
  const commit=await api('GET','/git/commits/'+commitSha);
  if(!commit.ok||!SHA.test(commit.data?.tree?.sha||''))
    return fail('GIT_COMMIT_UNVERIFIED');
  const tree=await api('GET','/git/trees/'+commit.data.tree.sha+'?recursive=1');
  if(!tree.ok||tree.data.truncated!==false||!Array.isArray(tree.data.tree)||
    tree.data.tree.length>30000)return fail('GIT_TREE_UNVERIFIED');
  const entries=new Map(),seen=new Set();
  for(const e of tree.data.tree){
    if(!pathOK(e.path)||!SHA.test(e.sha||'')||
       !['100644','040000'].includes(e.mode)||
       !['blob','tree'].includes(e.type)||
       (e.type==='blob'&&(e.mode!=='100644'||!Number.isSafeInteger(e.size)||
          e.size<0||e.size>12*1024*1024))||
       (e.type==='tree'&&e.mode!=='040000')||
       seen.has(e.path.toLowerCase()))return fail('GIT_MANIFEST_UNSAFE');
    seen.add(e.path.toLowerCase());
    entries.set(e.path,{sha:e.sha,mode:e.mode,type:e.type,size:e.size});
  }
  return {ok:true,treeSha:commit.data.tree.sha,entries,parents:commit.data.parents};
}
const folderSet=(tree,folder)=>{
  const m=new Map(),prefix=folder+'/';
  for(const [path,item] of tree.entries){
    if(path===folder||path.startsWith(prefix))m.set(path,item);
  }
  return m;
};
function equalFolder(left,right){
  if(left.size!==right.size)return false;
  for(const [path,a] of left){
    const b=right.get(path);
    if(!b||a.type!==b.type||a.mode!==b.mode||a.sha!==b.sha||
       a.size!==b.size)return false;
  }
  return true;
}
async function readyMarker(api,folder,tree){
  const item=tree.entries.get(folder+'/DEPLOYMENT.md');
  if(!item||item.type!=='blob'||item.size>8192)return fail('READY_MARKER_UNVERIFIED');
  const blob=await api('GET','/git/blobs/'+item.sha);
  if(!blob.ok||blob.data.sha!==item.sha||blob.data.size!==item.size||
     blob.data.encoding!=='base64'||typeof blob.data.content!=='string')
    return fail('READY_MARKER_UNVERIFIED');
  let bytes;try{bytes=decode(blob.data.content);}
  catch{return fail('READY_MARKER_UNVERIFIED');}
  if(bytes.length!==item.size||await gitBlob(bytes)!==item.sha)
    return fail('READY_MARKER_UNVERIFIED');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  return text.split(/\r?\n/).filter(s=>/^\s*Status\s*:/.test(s)).length===1&&
    text.split(/\r?\n/).includes('Status: READY')?
    {ok:true,sha:item.sha}:fail('READY_REVOKED');
}
export async function inspectWriteback({token,folder,baseHead},transport=fetch){
  if(!validToken(token))return fail('GIT_WRITE_ACCESS_REQUIRED');
  if(!safeFolder(folder)||!SHA.test(baseHead||''))return fail('GIT_TARGET_UNVERIFIED');
  const api=client(token,transport);
  const repo=await api('GET','');
  if(!repo.ok||repo.data.full_name!=='Neb963/per-gens'||repo.data.private!==true)
    return fail('PRIVATE_REPOSITORY_UNVERIFIED');
  const ref=await api('GET','/git/ref/heads/main');
  if(!ref.ok||ref.data.ref!=='refs/heads/main'||ref.data.object?.type!=='commit'||
     !SHA.test(ref.data.object.sha||''))return fail('GIT_MAIN_UNVERIFIED');
  const head=ref.data.object.sha;
  const base=await readTree(api,baseHead),now=await readTree(api,head);
  if(!base.ok||!now.ok)return fail('GIT_BASE_OR_HEAD_UNVERIFIED');
  const old=folderSet(base,folder),current=folderSet(now,folder);
  if(!equalFolder(old,current))return fail('GIT_RELEVANT_PATH_CONFLICT');
  const ready=await readyMarker(api,folder,now);
  if(!ready.ok)return ready;
  return {ok:true,head,baseHead,treeSha:now.treeSha,folder,
    readySha:ready.sha,
    files:[...current].filter(([p,x])=>x.type==='blob').map(([path,x])=>({
      path,sha:x.sha,size:x.size
    }))};
}
function pathsFromFiles(files,folder){
  const old=files.filter(x=>x.path.startsWith(folder+'/')).map(x=>x.path);
  return old.filter(p=>deployable(p.slice(folder.length+1)));
}
function encode(bytes){
  let value='';
  for(let i=0;i<bytes.length;i+=8192)
    value+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(value);
}
async function expectedBytes(source){
  if(!HEX.test(source?.fingerprint||''))return fail('WRITEBACK_SOURCE_UNVERIFIED');
  const exact=await exactSource(source.blobs);
  if(!exact.ok||exact.fingerprint!==source.fingerprint||
     JSON.stringify(exact.files)!==JSON.stringify(source.files))
    return fail('WRITEBACK_SOURCE_DRIFT');
  const result=[];
  for(const file of exact.blobs){
    const bytes=decode(file.base64);
    result.push({path:file.path,bytes,sha:await gitBlob(bytes),
      sha256:await digest('SHA-256',bytes)});
  }
  return {ok:true,files:result,fingerprint:exact.fingerprint};
}
// Independent remote bytes are required; the API's own SHA field or tree
// metadata does not independently prove file bytes.
async function verifyFiles(api,head,folder,expected,baseHead,commitSha=null){
  const tree=await readTree(api,head);
  if(!tree.ok)return tree;
  const scope=folderSet(tree,folder),wanted=new Map(expected.files.map(f=>[
    folder+'/'+f.path,f]));
  for(const [path,item] of scope){
    const relative=path.slice(folder.length+1);
    if(item.type==='blob'&&deployable(relative)&&!wanted.has(path))
      return fail('GIT_DELETION_NOT_APPLIED');
  }
  for(const [path,f] of wanted){
    const item=scope.get(path);
    if(item?.type!=='blob'||item.mode!=='100644'||item.sha!==f.sha||
       item.size!==f.bytes.length)return fail('GIT_READBACK_SOURCE_MISMATCH');
    const fetched=await api('GET','/git/blobs/'+item.sha);
    if(!fetched.ok||fetched.data.sha!==item.sha||
       fetched.data.encoding!=='base64'||fetched.data.size!==f.bytes.length)
      return fail('GIT_READBACK_BYTES_UNVERIFIED');
    let raw;try{raw=decode(fetched.data.content);}
    catch{return fail('GIT_READBACK_BYTES_UNVERIFIED');}
    if(raw.length!==f.bytes.length||
       await digest('SHA-256',raw)!==f.sha256||
       await gitBlob(raw)!==f.sha)return fail('GIT_READBACK_BYTES_CHANGED');
  }
  if(commitSha!==null&&head!==commitSha)return fail('GIT_HEAD_MOVED_AFTER_WRITE');
  return {ok:true,head,treeSha:tree.treeSha,sourceFingerprint:expected.fingerprint,
    attribution:commitSha===null?'UNPROVEN':'COMMIT_HEAD_OBSERVED'};
}
export async function observeGitCandidate(request,transport=fetch){
  if(!validToken(request?.token)||!safeFolder(request?.folder)||
     !SHA.test(request?.baseHead||''))return fail('GIT_OBSERVATION_INVALID');
  const expected=await expectedBytes(request.source);
  if(!expected.ok)return expected;
  const api=client(request.token,transport);
  const repo=await api('GET','');
  if(!repo.ok||repo.data.full_name!=='Neb963/per-gens'||repo.data.private!==true)
    return fail('PRIVATE_REPOSITORY_UNVERIFIED');
  const ref=await api('GET','/git/ref/heads/main');
  if(!ref.ok||!SHA.test(ref.data.object?.sha||'')||
     ref.data.ref!=='refs/heads/main')return fail('GIT_HEAD_UNVERIFIED');
  const head=ref.data.object.sha;
  const result=await verifyFiles(api,head,request.folder,expected,
    request.baseHead,request.commitSha||null);
  if(!result.ok)return result;
  // Content equivalence is NOT provenance, especially after a lost ACK.
  return {...result,code:request.commitSha?'GIT_CONFIRMED':'GIT_EQUIVALENT_ATTRIBUTION_UNKNOWN'};
}
export async function writeGitCandidate(request,transport=fetch){
  if(!validMessage(request?.message)||!SHA.test(request?.expectedHead||''))
    return fail('WRITEBACK_REQUEST_INVALID');
  const expected=await expectedBytes(request.source);
  if(!expected.ok)return expected;
  const check=await inspectWriteback(request,transport);
  if(!check.ok)return check;
  if(check.head!==request.expectedHead)return fail('GIT_HEAD_DRIFT');
  const api=client(request.token,transport);
  const entries=[];
  const old=pathsFromFiles(check.files,check.folder);
  const newPaths=new Set(expected.files.map(f=>check.folder+'/'+f.path));
  for(const path of old)if(!newPaths.has(path))
    entries.push({path,mode:'100644',type:'blob',sha:null});
  // Return uncertainty for any ambiguous object write; never blindly replay.
  for(const f of expected.files){
    const blob=await api('POST','/git/blobs',{content:encode(f.bytes),encoding:'base64'});
    if(!blob.ok||blob.data.sha!==f.sha)return fail('GIT_WRITE_UNCERTAIN');
    entries.push({path:check.folder+'/'+f.path,mode:'100644',type:'blob',sha:f.sha});
  }
  const tree=await api('POST','/git/trees',{base_tree:check.treeSha,tree:entries});
  if(!tree.ok||!SHA.test(tree.data.sha||''))return fail('GIT_WRITE_UNCERTAIN');
  const commit=await api('POST','/git/commits',{
    message:request.message,tree:tree.data.sha,parents:[check.head]});
  if(!commit.ok||!SHA.test(commit.data.sha||''))return fail('GIT_WRITE_UNCERTAIN');
  // Non-forced fast-forward from the checked parent. No alternative REST
  // Contents writes or force-push are permitted.
  const before=await api('GET','/git/ref/heads/main');
  if(!before.ok||before.data.object?.sha!==check.head)return fail('GIT_HEAD_DRIFT');
  const update=await api('PATCH','/git/refs/heads/main',
    {sha:commit.data.sha,force:false});
  if(!update.ok||update.data.object?.sha!==commit.data.sha)
    return fail('GIT_WRITE_UNCERTAIN');
  const verified=await observeGitCandidate({...request,
    commitSha:commit.data.sha},transport);
  if(!verified.ok)return fail('GIT_READBACK_UNCERTAIN');
  return {...verified,code:'GIT_COMMITTED_VERIFIED',commitSha:commit.data.sha,
    parent:check.head,changedPaths:entries.map(x=>x.path).sort()};
}
