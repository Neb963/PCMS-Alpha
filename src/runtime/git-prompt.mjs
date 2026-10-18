// S03 proposed prompt write executor, intentionally not bound to any UI or alarm.
// A future privileged coordinator must persist DISPATCH_POSSIBLE before call
// and supply a protected secret. No direct Git write authority is installed.
import {scanMainCatalog} from './git-catalog.mjs';
const API='https://api.github.com/repos/';
const OID=/^[a-f0-9]{40}$/;
const OP=/^s03_[0-9a-f]{32}$/;
const bytes=s=>new TextEncoder().encode(s);
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const err=code=>({ok:false,code});
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
    OP.test(intent.operationId||'')&&OID.test(intent.expectedOid||'')&&
    OID.test(intent.expectedHead||'')&&typeof intent.repositoryId==='string' &&
    /^\d+$/.test(intent.repositoryId)&&intent.source==='PINNED_MAIN_PROMPT_EDITOR';
}
export async function writeExistingGitPrompt({
  token,repository,intent,draft},transport=fetch,scan=scanMainCatalog){
  if(!validatePromptWriteIntent(intent))return err('GIT_INTENT_REQUIRED');
  if(typeof draft!=='string'||draft.length===0||draft.length>131072||
    bytes(draft).length>262144)return err('PROMPT_INVALID');
  const initial=await scan({token,repository},transport);
  if(!initial?.ok||!initial.complete)return err('CATALOG_INCOMPLETE');
  if(initial.repositoryId!==intent.repositoryId)return err('REPOSITORY_CHANGED');
  if(initial.prompt.state!=='PRESENT'||initial.prompt.oid!==intent.expectedOid)
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
    possible=true;
    // A PATCH refusal or lost ACK requires read-only reconciliation; never replay.
    const patch=await call('PATCH','/git/refs/heads/main',{sha:newCommit,force:false});
    if(patch?.object?.sha!==newCommit)return err('GIT_WRITE_UNCERTAIN');
    const observed=await scan({token,repository},transport);
    if(!observed?.ok||observed.head!==newCommit||observed.prompt?.oid!==newOid||
      observed.prompt.text!==draft)return {ok:false,code:'GIT_READBACK_UNCERTAIN',
        operationId:intent.operationId,possibleCommit:newCommit};
    return {ok:true,code:'PROMPT_COMMITTED_VERIFIED',head:newCommit,priorHead:parent,
      promptOid:newOid,operationId:intent.operationId};
  }catch(e){
    return {ok:false,code:possible?'GIT_WRITE_UNCERTAIN':'GIT_PRECOMMIT_UNCERTAIN',
      operationId:intent.operationId,...(newCommit?{possibleCommit:newCommit}:{})};
  }
}
