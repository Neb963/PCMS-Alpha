// A03/E-05: independently complete 1,000+ folder main trees, refusing
// truncated descendants and unauthorized URL/path inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {scanMainCatalog} from '../src/runtime/git-catalog.mjs';
const ROOT='a'.repeat(40),HEAD='b'.repeat(40),FOLDERS='c'.repeat(40);
const BLOB='Status: NOT_READY\n';
const blobOid=createHash('sha1').update('blob '+Buffer.byteLength(BLOB)+'\0'+BLOB).digest('hex');
const dirOid=i=>(i+1).toString(16).padStart(40,'0');
const slug=i=>'fixture-'+String(i).padStart(5,'0');
const count=1105,repository='Neb963/per-gens';
const json=v=>({status:200,json:async()=>v});
function catalogNetwork({truncateChild=-1,collision=false}={}){
 let fetches=0,writes=0;
 const transport=async(url,init)=>{
  fetches++;if(init.method!=='GET')writes++;
  assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');
  assert.equal(init.headers.Authorization,'Bearer '+TOKEN);
  const route=url.split('/repos/'+repository)[1];
  if(route==='')return json({full_name:repository,private:true,id:42});
  if(route==='/git/ref/heads/main')return json({
    ref:'refs/heads/main',object:{type:'commit',sha:HEAD}});
  if(route==='/git/commits/'+HEAD)return json({tree:{sha:ROOT}});
  if(route==='/git/trees/'+ROOT+'?recursive=1')
    return json({truncated:true,tree:[]}); // GitHub must not supply a partial scope.
  if(route==='/git/trees/'+ROOT)return json({truncated:false,tree:[
    {path:'generators',type:'tree',mode:'040000',sha:FOLDERS}
  ]});
  if(route==='/git/trees/'+FOLDERS)return json({truncated:false,tree:
    Array.from({length:count},(_,i)=>({path:collision&&i===count-1?slug(0).toUpperCase():slug(i),
      type:'tree',mode:'040000',sha:dirOid(i)}))});
  const idx=Number.parseInt(route?.replace('/git/trees/',''),16)-1;
  if(route?.startsWith('/git/trees/')&&Number.isInteger(idx)&&idx>=0&&idx<count){
    return json({truncated:truncateChild===idx,tree:[
      {path:'DEPLOYMENT.md',sha:blobOid,type:'blob',mode:'100644',size:BLOB.length}]});
  }
  if(route==='/git/blobs/'+blobOid)return json({encoding:'base64',sha:blobOid,size:BLOB.length,
    content:Buffer.from(BLOB).toString('base64')});
  throw Error('UNEXPECTED_GIT_URL:'+route);
 };
 return {transport,metrics:()=>({fetches,writes})};
}
const TOKEN='github_pat_'+'q'.repeat(42);
test('A03 pinned main: 1105 managed folders survive GitHub recursive truncation by bounded subtree fallback',async()=>{
 const fixture=catalogNetwork();
 const result=await scanMainCatalog({repository,token:TOKEN},fixture.transport);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.complete,true);
 assert.equal(result.recognizedCount,count);
 assert.equal(result.generators.length,count);
 assert.equal(result.generators[0].slug,slug(0));
 assert.equal(result.generators.at(-1).slug,slug(count-1));
 assert.equal(result.generators[0].ready,false);
 assert.equal(result.repositoryId,'42');
 assert.equal(result.head,HEAD);
 assert.equal(fixture.metrics().writes,0);
 assert.ok(fixture.metrics().fetches>=1100);
 assert.doesNotMatch(JSON.stringify(result),/github_pat_/);
});
test('A03 incomplete descendant makes entire scan unavailable; never returns partial generator list',async()=>{
 const fixture=catalogNetwork({truncateChild:20});
 const result=await scanMainCatalog({repository,token:TOKEN},fixture.transport);
 assert.equal(result.ok,false);assert.equal(result.complete,false);
 assert.equal(result.code,'CATALOG_INCOMPLETE');
 assert.equal('generators' in result,false);
 assert.equal(fixture.metrics().writes,0);
});
test('A03 path case collision cannot be interpreted as two independent managed generators',async()=>{
 const fixture=catalogNetwork({collision:true});
 const result=await scanMainCatalog({repository,token:TOKEN},fixture.transport);
 assert.equal(result.ok,false);assert.equal(result.complete,false);
 assert.equal(result.code,'CATALOG_CONFLICT');
});
