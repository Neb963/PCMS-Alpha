import {scanMainCatalog} from './git-catalog.mjs';
// S03 initial empty private Git repository setup. Explicitly dormant:
// no installed port or scheduler calls this function. Callers must hold a
// canonical DISPATCH_POSSIBLE journal and a separately approved starter hash.
// Git ref creation is one-shot; lost ACK is reconciled, NEVER retried blindly.
import {validRepository} from './git-catalog.mjs';
const SHA=/^[a-f0-9]{40}$/,HEX=/^[a-f0-9]{64}$/;
const fail=code=>({ok:false,code,dispatchPossible:false});
const encode=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function hash(s){return hex(await crypto.subtle.digest('SHA-256',encode.encode(s)));}
export function validEmptyRepoIntent(v){
  return v?.phase==='DISPATCH_POSSIBLE'&&
    /^s03_[a-f0-9]{32}$/.test(v.operationId||'')&&
    /^[1-9][0-9]{0,19}$/.test(v.repositoryId||'')&&
    HEX.test(v.approvedStarterSha256||'')&&v.starterApproved===true;
}
export async function initializeEmptyPrivateGit({
  token,repository,intent,starterPrompt,beforeDispatch=async()=>true},transport=fetch,scan=scanMainCatalog){
  if(!validEmptyRepoIntent(intent)||!validRepository(repository)||
     typeof token!=='string'||token.length<12||token.length>512||
     typeof starterPrompt!=='string'||!starterPrompt.length||
     starterPrompt.length>131072)return fail('GIT_INITIALIZATION_AUTHORITY_REQUIRED');
  if(await hash(starterPrompt)!==intent.approvedStarterSha256)
    return fail('GIT_STARTER_NOT_APPROVED');
  const root='https://api.github.com/repos/'+repository;
  const get=async(method,path,body)=>{
    const r=await transport(root+path,{method,redirect:'error',credentials:'omit',
      cache:'no-store',headers:{Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r?.status,body:r?.status===200||r?.status===201?
      await r.json():null};
  };
  let possible=false,createdCommit=null;
  try{
    const repo=await get('GET','');
    if(repo.status!==200||repo.body?.full_name!==repository||
       repo.body.private!==true||String(repo.body.id)!==intent.repositoryId)
      return fail('GIT_REPOSITORY_UNVERIFIED');
    const main=await get('GET','/git/ref/heads/main');
    if(main.status===200)return fail('GIT_MAIN_ALREADY_EXISTS');
    if(main.status!==404)return fail('GIT_MAIN_NOT_PROVEN_ABSENT');
    // Both checks are required: a missing branch is not an empty repository.
    const refs=await get('GET','/git/refs');
    const history=await get('GET','/commits?per_page=1');
    if(![404,409].includes(refs.status)||!Array.isArray(history.body)&&
       ![404,409].includes(history.status))
      return fail('GIT_EMPTY_STATE_UNVERIFIED');
    if(history.status===200&&history.body.length!==0)
      return fail('GIT_NOT_EMPTY');
    const bytes=encode.encode(starterPrompt);
    let bin='';for(let i=0;i<bytes.length;i+=8192)
      bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
    const blob=await get('POST','/git/blobs',{content:btoa(bin),encoding:'base64'});
    if(blob.status!==201||!SHA.test(blob.body?.sha||''))return fail('GIT_BLOB_UNVERIFIED');
    const tree=await get('POST','/git/trees',{tree:[{path:'pcms/prompts/default-chat1.md',
      mode:'100644',type:'blob',sha:blob.body.sha}]});
    if(tree.status!==201||!SHA.test(tree.body?.sha||''))return fail('GIT_TREE_UNVERIFIED');
    const commit=await get('POST','/git/commits',{message:'pcms: approved first prompt\n\nPCMS-OP: '+intent.operationId,
      tree:tree.body.sha,parents:[]});
    if(commit.status!==201||!SHA.test(commit.body?.sha||''))return fail('GIT_COMMIT_UNVERIFIED');
    createdCommit=commit.body.sha;
    if((await beforeDispatch())!==true)return fail('GIT_AUTHORITY_REVOKED');
    possible=true;
    const set=await get('POST','/git/refs',{ref:'refs/heads/main',sha:createdCommit});
    if(set.status!==201||set.body?.object?.sha!==createdCommit)
      return {ok:false,code:'GIT_INITIAL_REF_UNCERTAIN',possibleCommit:createdCommit,dispatchPossible:true};
    const mainRead=await get('GET','/git/ref/heads/main');
    const checked=await get('GET','/git/commits/'+createdCommit);
    const snapshot=await scan({token,repository},transport);
    if(mainRead.body?.object?.sha!==createdCommit||
       checked.body?.tree?.sha!==tree.body.sha||
       !snapshot?.ok||snapshot.repositoryId!==intent.repositoryId||snapshot.head!==createdCommit||
       snapshot.prompt?.oid!==blob.body.sha||snapshot.prompt?.text!==starterPrompt)
      return {ok:false,code:'GIT_INITIAL_READBACK_UNCERTAIN',possibleCommit:createdCommit,dispatchPossible:true};
    return {ok:true,code:'GIT_INITIALIZED_VERIFIED',commit:createdCommit,head:createdCommit};
  }catch{
    return {ok:false,code:possible?'GIT_INITIAL_REF_UNCERTAIN':'GIT_PREPARE_UNCERTAIN',
      dispatchPossible:possible,...(createdCommit?{possibleCommit:createdCommit}:{})};
  }
}
