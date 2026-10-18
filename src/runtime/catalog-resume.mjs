// S03 immutable Git object checkpoint cache for bounded, restartable catalog reads.
// This is advisory acceleration only: every wake revalidates repo identity/main
// and the catalog scanner independently validates blob OIDs and completeness.
// Never persist credentials, HTTP auth headers, failed/partial HTTP bodies or
// current main refs. Local cache cannot grant source or provider authority.
const BASE='pcmsS03GitImmutableV1';
const SHA=/^[0-9a-f]{40}$/;
const MAX_OBJECT=256*1024;
const MAX_NETWORK_PER_TURN=128;
const validId=s=>typeof s==='string'&&/^[1-9][0-9]{0,19}$/.test(s);
export function createGitResumeTransport(storage,{
  repositoryId,repository,network=fetch,maxNetwork=MAX_NETWORK_PER_TURN
}={}){
  if(!validId(repositoryId)||typeof repository!=='string'||!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw Error('GIT_CHECKPOINT_SCOPE_INVALID');
  if(!Number.isSafeInteger(maxNetwork)||maxNetwork<1||maxNetwork>2048)
    throw Error('GIT_CHECKPOINT_BUDGET_INVALID');
  let fresh=0,cached=0,paused=false;
  const origin='https://api.github.com/repos/'+repository;
  async function transport(url,options){
    if(typeof url!=='string'||!url.startsWith(origin+'/')&&url!==origin||
      options?.method!=='GET'||options.credentials!=='omit'||options.redirect!=='error')
      throw Error('GIT_CHECKPOINT_REQUEST_INVALID');
    const route=url.slice(origin.length);
    const match=/^\/git\/(trees|blobs)\/([a-f0-9]{40})$/.exec(route);
    const key=match&&SHA.test(match[2])?
      BASE+':'+repositoryId+':'+match[1]+':'+match[2]:null;
    if(key){
      try{
        const prior=(await storage.get(key))?.[key];
        if(prior?.oid===match[2]&&prior.kind===match[1]&&
           prior.response&&typeof prior.response==='object'){
          cached++;
          return {status:200,json:async()=>prior.response};
        }
      }catch{/* Storage failure must not become success. */}
    }
    if(fresh>=maxNetwork){paused=true;throw Error('GIT_CHECKPOINT_PAUSED');}
    fresh++;
    const response=await network(url,options);
    if(key&&response?.status===200){
      const data=await response.json();
      let serial;
      try{serial=JSON.stringify(data);}catch{}
      if(serial&&serial.length<=MAX_OBJECT){
        // Checkpoint is last: later readers never observe an unparsed response.
        try{await storage.set({[key]:{kind:match[1],oid:match[2],response:data}});}
        catch{/* Missing cache is benign; next wake can re-fetch. */}
      }
      return {status:200,json:async()=>data};
    }
    return response;
  }
  return Object.freeze({transport,status:()=>({fresh,cached,paused})});
}
