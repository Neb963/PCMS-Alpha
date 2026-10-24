// OFFLINE external Git HTTP model with an independent ref/effect ledger.
// Production scanners, blob verification, journals and conditional writers run
// unchanged. This fixture is never included in the XPI or a live Git claim.
export async function createGitModel(saved=null){
 const encoder=new TextEncoder(),hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
 const hash=async(text,kind='SHA-1')=>hex(await crypto.subtle.digest(kind,encoder.encode(text)));
 const b64=raw=>{let s='';for(let i=0;i<raw.length;i+=8192)s+=String.fromCharCode(...raw.subarray(i,i+8192));return btoa(s)};
 const state=saved||{head:null,blobs:{},trees:{},commits:{},refs:{},effects:[],loseNextRef:false,denyNextRef:false,sequence:0};
 const blob=async content=>{const raw=typeof content==='string'?encoder.encode(content):content;
  const header=encoder.encode('blob '+raw.length+'\0'),all=new Uint8Array(header.length+raw.length);all.set(header);all.set(raw,header.length);
  const oid=hex(await crypto.subtle.digest('SHA-1',all));state.blobs[oid]={sha:oid,size:raw.length,encoding:'base64',content:b64(raw)};return oid;};
 const makeTree=async paths=>{
  const children=new Map();for(const [path,value] of Object.entries(paths)){const [name,...rest]=path.split('/');if(rest.length){let c=children.get(name);if(!c||c.type!=='tree')c={type:'tree',paths:{}};c.paths[rest.join('/')]=value;children.set(name,c)}else children.set(name,{type:'blob',sha:value})}
  const tree=[];for(const [path,c] of [...children].sort(([a],[b])=>a.localeCompare(b))){if(c.type==='tree')tree.push({path,type:'tree',mode:'040000',sha:await makeTree(c.paths)});else tree.push({path,type:'blob',mode:'100644',sha:c.sha,size:state.blobs[c.sha].size})}
  const sha=await hash(JSON.stringify(tree));state.trees[sha]=tree;return sha;
 };
 const flatten=sha=>{const all=[];function visit(oid,prefix=''){for(const c of state.trees[oid]||[]){const entry={...c,path:prefix+c.path};all.push(entry);if(c.type==='tree')visit(c.sha,entry.path+'/')}}visit(sha);return all};
 const sourcePaths=()=>state.head?Object.fromEntries(flatten(state.commits[state.head].tree.sha).filter(x=>x.type==='blob').map(x=>[x.path,x.sha])):{};
 const commit=async({tree,parents,message})=>{const sha=await hash(JSON.stringify([tree,parents,message,++state.sequence]));state.commits[sha]={sha,tree:{sha:tree},parents:parents.map(sha=>({sha})),message};return sha;};
 async function merge(files,message='external reviewed merge'){const paths=sourcePaths();for(const [path,content] of Object.entries(files))if(content===null)delete paths[path];else paths[path]=await blob(content);
  const tree=await makeTree(paths),sha=await commit({tree,parents:state.head?[state.head]:[],message});state.head=sha;return sha;}
 const response=(status,data)=>({status,json:async()=>structuredClone(data)});
 async function transport(url,options){
  const u=new URL(url),prefix='/repos/Neb963/per-gens';if(u.origin!=='https://api.github.com'||!u.pathname.startsWith(prefix)||options.credentials!=='omit'||options.redirect!=='error')throw Error('OFFLINE_GIT_REQUEST_OUTSIDE_SCOPE');
  const path=u.pathname.slice(prefix.length),method=options.method,body=options.body?JSON.parse(options.body):null;
  if(method==='GET'){
   if(!path)return response(200,{id:42,private:true,full_name:'Neb963/per-gens'});
   if(path==='/git/ref/heads/main')return state.head?response(200,{ref:'refs/heads/main',object:{type:'commit',sha:state.head}}):response(404,{});
   if(path==='/git/refs'||path==='/commits')return state.head?response(200,[{sha:state.head}]):response(409,{});
   if(path.startsWith('/git/commits/'))return state.commits[path.slice(13)]?response(200,state.commits[path.slice(13)]):response(404,{});
   if(path.startsWith('/git/trees/')){const sha=path.slice(11);return state.trees[sha]?response(200,{sha,truncated:false,tree:u.searchParams.get('recursive')==='1'?flatten(sha):state.trees[sha]}):response(404,{});}
   if(path.startsWith('/git/blobs/'))return state.blobs[path.slice(11)]?response(200,state.blobs[path.slice(11)]):response(404,{});
   return response(404,{});
  }
  if(method==='POST'&&path==='/git/blobs'){const raw=body.encoding==='base64'?Uint8Array.from(atob(body.content),x=>x.charCodeAt(0)):encoder.encode(body.content);return response(201,{sha:await blob(raw)})}
  if(method==='POST'&&path==='/git/trees'){
   const paths=body.base_tree?Object.fromEntries(flatten(body.base_tree).filter(x=>x.type==='blob').map(x=>[x.path,x.sha])):{};
   for(const file of body.tree){if(file.sha===null)delete paths[file.path];else paths[file.path]=file.sha}return response(201,{sha:await makeTree(paths)});
  }
  if(method==='POST'&&path==='/git/commits')return response(201,{sha:await commit(body)});
  if((method==='PATCH'&&path==='/git/refs/heads/main')||(method==='POST'&&path==='/git/refs')){
   const next=state.commits[body.sha];state.effects.push({method,path,from:state.head,to:body.sha,force:body.force===true});
   if(!next||body.force===true||state.denyNextRef){state.denyNextRef=false;return response(422,{})}
   if(method==='POST'&&state.head||method==='PATCH'&&next.parents[0]?.sha!==state.head)return response(422,{});
   state.head=body.sha;if(state.loseNextRef){state.loseNextRef=false;throw Error('OFFLINE_LOST_REF_ACK_AFTER_EFFECT')}
   return response(method==='POST'?201:200,{ref:'refs/heads/main',object:{sha:state.head}});
  }
  throw Error('OFFLINE_UNEXPECTED_GIT_EFFECT '+method+' '+path);
 }
 return {state,transport,merge,paths:sourcePaths,serialize:()=>structuredClone(state)};
}
