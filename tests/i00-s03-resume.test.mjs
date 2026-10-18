import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {scanMainCatalog} from '../src/runtime/git-catalog.mjs';
import {createGitResumeTransport} from '../src/runtime/catalog-resume.mjs';
globalThis.crypto??=webcrypto;
const repository='Neb963/per-gens',token='test-credential-not-stored';
const sha=s=>{const b=Buffer.from(s);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
const HEAD='a'.repeat(40),TREE='b'.repeat(40),DIR='c'.repeat(40),PROMPT='d'.repeat(40);
const blobs=new Map(),entries=[
 {path:'generators',type:'tree',mode:'040000',sha:DIR},
 {path:'pcms',type:'tree',mode:'040000',sha:PROMPT},
 {path:'pcms/prompts',type:'tree',mode:'040000',sha:'e'.repeat(40)}
];
function add(path,text){
  const content=Buffer.from(text),oid=sha(text);blobs.set(oid,content);
  entries.push({path,sha:oid,size:content.length,mode:'100644',type:'blob'});
}
add('pcms/prompts/default-chat1.md','existing Git prompt');
for(let i=0;i<12;i++){
  const folder='generators/g-'+i;
  entries.push({path:folder,type:'tree',mode:'040000',sha:'f'.repeat(40)});
  add(folder+'/DEPLOYMENT.md','Status: NOT_READY\n'+i);
}
const local=new Map();
const storage={
 get:async k=>local.has(k)?{[k]:structuredClone(local.get(k))}:{},
 set:async o=>{for(const [k,v] of Object.entries(o)){
   assert.ok(!JSON.stringify(v).includes(token),'Git credential leaked to cache');
   local.set(k,structuredClone(v));
 }}
};
let reads=0;
const response=(status,data)=>({status,json:async()=>data});
async function network(url,options){
  reads++;
  assert.equal(options.headers.Authorization,'Bearer '+token);
  const p=new URL(url).pathname.replace('/repos/'+repository,'');
  if(p==='')return response(200,{full_name:repository,private:true,id:42});
  if(p==='/git/ref/heads/main')return response(200,{ref:'refs/heads/main',
    object:{sha:HEAD,type:'commit'}});
  if(p==='/git/commits/'+HEAD)return response(200,{tree:{sha:TREE}});
  if(p==='/git/trees/'+TREE)return response(200,{truncated:false,tree:entries});
  if(p.startsWith('/git/blobs/')){
    const oid=p.split('/').at(-1),raw=blobs.get(oid);
    return raw?response(200,{sha:oid,size:raw.length,encoding:'base64',
      content:raw.toString('base64')}):response(404,{});
  }
  throw Error('unexpected '+p);
}
test('S03 immutable scan cache continues multiple interrupted wakenings without claiming partial inventory',async()=>{
  let complete=null,pauses=0;
  for(let wake=0;wake<20;wake++){
    const cache=createGitResumeTransport(storage,{
      repositoryId:'42',repository,network,maxNetwork:6
    });
    const result=await scanMainCatalog({token,repository},cache.transport);
    assert.ok(result.ok||result.code==='CATALOG_INCOMPLETE');
    if(result.ok){complete=result;break;}
    assert.equal(cache.status().paused,true);
    pauses++;
  }
  assert.ok(pauses>=2);
  assert.equal(complete?.recognizedCount,12);
  assert.equal(complete.prompt.text,'existing Git prompt');
  assert.equal([...local.keys()].some(k=>k.includes('/ref/heads/main')),false);
  assert.equal([...local.values()].some(v=>JSON.stringify(v).includes(token)),false);
  const before=reads;
  const cache=createGitResumeTransport(storage,{repositoryId:'42',repository,network,maxNetwork:6});
  assert.equal((await scanMainCatalog({token,repository},cache.transport)).ok,true);
  assert.ok(reads-before<=4,'immutable object cache should avoid repeated source network calls');
});
test('S03 scope isolation: different repository ID cannot replay immutable tree cache',async()=>{
  const prior=reads;
  const isolated=createGitResumeTransport(storage,{repositoryId:'99',repository,network,maxNetwork:6});
  const result=await scanMainCatalog({token,repository},isolated.transport);
  assert.equal(result.ok,false);
  assert.equal(isolated.status().paused,true);
  assert.ok(reads-prior>=5);
});
test('S03 invalid transport methods and origins never use checkpoint authority',async()=>{
  const v=createGitResumeTransport(storage,{repositoryId:'42',repository,network});
  await assert.rejects(v.transport('https://example.com/',{method:'GET',credentials:'omit',redirect:'error'}));
  await assert.rejects(v.transport('https://api.github.com/repos/'+repository+'/git/blobs/'+HEAD,
    {method:'POST',credentials:'omit',redirect:'error'}));
});
