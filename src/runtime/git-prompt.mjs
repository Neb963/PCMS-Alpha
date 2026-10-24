// S03 proposed prompt write executor, intentionally not bound to any UI or alarm.
// A future privileged coordinator must persist DISPATCH_POSSIBLE before call
// and supply a protected secret. No direct Git write authority is installed.
import {scanMainCatalog} from './git-catalog.mjs';
const API='https://api.github.com/repos/';
const OID=/^[a-f0-9]{40}$/;
const OP=/^s03_[0-9a-f]{32}$/;
const bytes=s=>new TextEncoder().encode(s);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const err=code=>({ok:false,code,dispatchPossible:false});
async function blobSha(b){
  const pre=bytes('blob '+b.length+'\0'),all=new Uint8Array(pre.length+b.length);
  all.set(pre);all.set(b,pre.length);
  return hex(await crypto.subtle.digest('SHA-1',all));
}
function encodeBase64(b){
  let out='';
  for(let i=0;i<b.length;i+=8192)
    out+=String.fromCharCode(...b.subarray(i,i+8192));
  return btoa(out);
}
function http(token,repository,transport){
  return async(method,path,body)=>{
    const response=await transport(API+repository+path,{
      method,redirect:'error',credentials:'omit',cache:'no-store',
      headers:{Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28',
        Authorization:'Bearer '+token,
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(![200,201].includes(response?.status))throw Error(
      response?.status===409||response?.status===422?'GIT_CONFLICT':'GIT_UNAVAILABLE');
    return await response.json();
  };
}
export function validatePromptWriteIntent(intent){
  // Values are coordinator-internal, not a grant from an extension page.
  return intent?.phase==='DISPATCH_POSSIBLE' &&
    OP.test(intent.operationId||'')&&(intent.expectedOid===null||OID.test(intent.expectedOid||''))&&
    OID.test(intent.expectedHead||'')&&typeof intent.repositoryId==='string' &&
    /^\d+$/.test(intent.repositoryId)&&intent.source==='PINNED_MAIN_PROMPT_EDITOR';
}
export async function writeExistingGitPrompt({
  token,repository,intent,draft,beforeDispatch=async()=>true},transport=fetch,scan=scanMainCatalog){
  if(!validatePromptWriteIntent(intent))return err('GIT_INTENT_REQUIRED');
  if(typeof draft!=='string'||draft.length===0||draft.length>131072||
    bytes(draft).length>262144)return err('PROMPT_INVALID');
  const initial=await scan({token,repository},transport);
  if(!initial?.ok||!initial.complete)return err('CATALOG_INCOMPLETE');
  if(initial.repositoryId!==intent.repositoryId)return err('REPOSITORY_CHANGED');
  if(!(['PRESENT','ABSENT'].includes(initial.prompt.state))||initial.prompt.oid!==intent.expectedOid||
    (initial.prompt.state==='ABSENT'&&intent.expectedOid!==null))
    return err('PROMPT_CONFLICT');
  // Unrelated HEAD advances are acceptable; same prompt OID is the CAS guard.
  const parent=initial.head;
  if(parent!==intent.expectedHead && intent.requireExactHead===true)
    return err('GIT_HEAD_CHANGED');
  const raw=bytes(draft),newOid=await blobSha(raw);
  if(newOid===intent.expectedOid)return {ok:true,code:'PROMPT_UNCHANGED',head:parent};
  const call=http(token,repository,transport);
  let possible=false,newCommit=null;
  try{
    const blob=await call('POST','/git/blobs',{content:encodeBase64(raw),encoding:'base64'});
    if(blob?.sha!==newOid) return err('GIT_BLOB_UNVERIFIED');
    const tree=await call('POST','/git/trees',{base_tree:initial.rootTreeOid,
      tree:[{path:'pcms/prompts/default-chat1.md',mode:'100644',type:'blob',sha:newOid}]});
    if(!OID.test(tree?.sha||''))return err('GIT_TREE_UNVERIFIED');
    const message='pcms: update authoritative Chat 1 prompt\n\nPCMS-OP: '+intent.operationId;
    const commit=await call('POST','/git/commits',{message,tree:tree.sha,parents:[parent]});
    if(!OID.test(commit?.sha||''))return err('GIT_COMMIT_UNVERIFIED');
    newCommit=commit.sha;
    if((await beforeDispatch())!==true)return err('GIT_AUTHORITY_REVOKED');
    possible=true;
    // A PATCH refusal or lost ACK requires read-only reconciliation; never replay.
    const patch=await call('PATCH','/git/refs/heads/main',{sha:newCommit,force:false});
    if(patch?.object?.sha!==newCommit)return {...err('GIT_WRITE_UNCERTAIN'),dispatchPossible:true};
    const observed=await scan({token,repository},transport);
    if(!observed?.ok||observed.head!==newCommit||observed.prompt?.oid!==newOid||
      observed.prompt.text!==draft)return {ok:false,code:'GIT_READBACK_UNCERTAIN',
        operationId:intent.operationId,possibleCommit:newCommit,dispatchPossible:true};
    return {ok:true,code:'PROMPT_COMMITTED_VERIFIED',head:newCommit,priorHead:parent,
      promptOid:newOid,operationId:intent.operationId};
  }catch(e){
    return {ok:false,code:possible?'GIT_WRITE_UNCERTAIN':'GIT_PRECOMMIT_UNCERTAIN',
      operationId:intent.operationId,dispatchPossible:possible,...(newCommit?{possibleCommit:newCommit}:{})};
  }
}


// Independent observation after uncertain PATCH/HTTP acknowledgment. This
// function NEVER writes; an unlocated or unattributed effect remains UNKNOWN.
export async function observeGitPromptWrite({
  token,repository,operationId,expectedParent,draft,repositoryId,maxAncestors=128
},transport=fetch,scan=scanMainCatalog){
  if(!OP.test(operationId||'')||!(expectedParent===null||OID.test(expectedParent||''))||typeof draft!=='string'||
     !/^[1-9][0-9]{0,19}$/.test(repositoryId||'')||
     !Number.isSafeInteger(maxAncestors)||maxAncestors<1||maxAncestors>2048)
    return err('PROMPT_OBSERVATION_INVALID');
  const current=await scan({token,repository},transport);
  if(!current?.ok||!current.complete||current.repositoryId!==repositoryId)
    return err('PROMPT_OBSERVATION_UNAVAILABLE');
  const target=await blobSha(bytes(draft));
  const get=http(token,repository,transport);
  let sha=current.head,depth=0;
  try{
    while(OID.test(sha||'')&&depth++<maxAncestors){
      const commit=await get('GET','/git/commits/'+sha);
      if(!OID.test(commit?.tree?.sha||'')||!Array.isArray(commit.parents))
        return err('PROMPT_OBSERVATION_UNVERIFIED');
      const trailer='PCMS-OP: '+operationId;
      if(commit.message?.split(/\r?\n/).at(-1)===trailer){
        if(expectedParent===null?commit.parents.length!==0:commit.parents.length!==1||commit.parents[0]?.sha!==expectedParent)
          return err('PROMPT_ATTRIBUTION_UNVERIFIED');
        const tree=await get('GET','/git/trees/'+commit.tree.sha+'?recursive=1');
        if(tree?.truncated!==false||!Array.isArray(tree.tree))
          return err('PROMPT_OBSERVATION_INCOMPLETE');
        const entry=tree.tree.filter(x=>x.path==='pcms/prompts/default-chat1.md');
        if(entry.length!==1||entry[0].sha!==target||
          entry[0].type!=='blob'||entry[0].mode!=='100644')
          return err('PROMPT_ATTRIBUTION_UNVERIFIED');
        if(current.prompt?.oid!==target||current.prompt.text!==draft)
          return {ok:false,code:'PROMPT_COMMITTED_BUT_SUPERSEDED',commit:sha};
        return {ok:true,code:'PROMPT_COMMITTED_VERIFIED',commit:sha,
          head:current.head,promptOid:target,source:'REMOTE_PROMPT_OBSERVATION'};
      }
      if(commit.parents.length===0)return err('PROMPT_OPERATION_NOT_FOUND_IN_HISTORY');
      if(commit.parents.length!==1||!OID.test(commit.parents[0]?.sha||''))
        return err('PROMPT_OBSERVATION_UNVERIFIED');
      sha=commit.parents[0].sha;
    }
    return err('PROMPT_OBSERVATION_BOUNDED_HOLD');
  }catch{return err('PROMPT_OBSERVATION_UNAVAILABLE');}
}
