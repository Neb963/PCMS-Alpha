import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {parseReadyDeclaration,inspectReadyCandidate} from '../src/runtime/catalog-declaration.mjs';
globalThis.crypto??=webcrypto;
const repository='Neb963/per-gens',token='test-only-secret-12345',slug='ready-generator';
const HEAD='a'.repeat(40),INTRO='b'.repeat(40),CURRENT='c'.repeat(40),OLD='d'.repeat(40);
const pref='generators/'+slug+'/';
function gitSha(text){
 const b=Buffer.from(text);
 return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
}
const source={
 'DEPLOYMENT.md':'Status: READY\nReady-Revision: unique-revision-001\n',
 'main.pjs':'my list = [x]',
 'index.html':'<main>ok</main>',
 'src/nested/style.css':'body{display:block}',
 'TESTING.md':'Check preview'
};
function fixture({drift=false,tamper=false,truncated=false,legacy=false}={}){
 const blobs=new Map();
 const rows=[{path:'generators',sha:'e'.repeat(40),type:'tree',mode:'040000'},
   {path:'generators/'+slug,sha:'f'.repeat(40),type:'tree',mode:'040000'}];
 const all={...source};
 if(legacy)all['DEPLOYMENT.md']='Status: READY\n';
 for(const [path,contents] of Object.entries(all)){
   const b=Buffer.from(contents),oid=gitSha(contents);
   blobs.set(oid,b);rows.push({path:pref+path,sha:oid,size:b.length,type:'blob',mode:'100644'});
 }
 const now=drift?rows.map(x=>x.path===pref+'index.html'?
   {...x,sha:gitSha('unexpected source edit'),size:22}:x):rows;
 let effects=0;
 const as=(status,v)=>({status,json:async()=>v});
 async function transport(url,init){
   assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
   assert.equal(init.headers.Authorization,'Bearer '+token);effects++;
   const u=new URL(url),path=u.pathname.replace('/repos/'+repository,'');
   if(path==='')return as(200,{full_name:repository,private:true,id:42});
   if(path==='/git/ref/heads/main')return as(200,{ref:'refs/heads/main',object:{sha:HEAD,type:'commit'}});
   if(path==='/git/commits/'+HEAD)return as(200,{tree:{sha:CURRENT}});
   if(path==='/git/commits/'+INTRO)return as(200,{tree:{sha:OLD}});
   if(path==='/git/trees/'+CURRENT+'?recursive=1')
      return as(200,{truncated:false,tree:now});
   if(path==='/git/trees/'+OLD+'?recursive=1')
      return as(200,{truncated:false,tree:rows});
   if(path.startsWith('/commits?'))return as(200,[{sha:INTRO}]);
   if(path.startsWith('/git/blobs/')){
     const oid=path.split('/').at(-1),raw=blobs.get(oid);
     return raw?as(200,{sha:oid,size:raw.length,encoding:'base64',
       content:(tamper?Buffer.from('corrupt'):raw).toString('base64')}):as(404,{});
   }
   throw Error('Unexpected '+path);
 }
 return {transport,metrics:()=>effects};
}
const inspect=(f,overrides={})=>inspectReadyCandidate({
 repository,token,slug,pinnedHead:HEAD,...overrides},f.transport);
test('S03 exact Status READY and Ready-Revision parser with duplicate/malformed holds',()=>{
 assert.deepEqual(parseReadyDeclaration('Status: READY\nReady-Revision: unique-revision-001\n'),
   {ok:true,ready:true,token:'unique-revision-001',legacy:false});
 assert.equal(parseReadyDeclaration('Status: READY\n').legacy,true);
 assert.equal(parseReadyDeclaration('Status: SOURCE_PENDING\n').ready,false);
 for(const text of ['Status: READY\nStatus: READY\n','Status: READY \n',
   'Status: READY\nReady-Revision: short\n','Status: READY\nReady-Revision: abcdefghi\nReady-Revision: zzzz\n']){
   assert.equal(parseReadyDeclaration(text).ok,false,text);
 }
});
test('S03 verifies exact declared source bytes, per-file hashes and explicit TESTING OID',async()=>{
 const f=fixture(),r=await inspect(f);
 assert.equal(r.code,'READY_COHERENT_INPUT_PINNED',JSON.stringify(r));
 assert.equal(r.token,'unique-revision-001');
 assert.equal(r.declarationCommit,INTRO);
 assert.deepEqual(r.files.map(x=>x.path),['index.html','main.pjs','src/nested/style.css']);
 assert.ok(r.files.every(x=>x.sha256.length===64));
 assert.equal(r.optionalTesting.state,'PRESENT');
 assert.equal(r.optionalTesting.oid,gitSha(source['TESTING.md']));
 assert.equal(r.files.some(x=>'base64' in x),false);
 assert.ok(f.metrics()>5);
});
test('S03 legacy first READY is pinned to historical marker-changing commit',async()=>{
 const r=await inspect(fixture({legacy:true}));
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.legacy,true);
 assert.match(r.declarationIdentity,/^legacy:/);
});
test('S03 drift after declaration and corrupted blob fail closed without deploying',async()=>{
 assert.equal((await inspect(fixture({drift:true}))).code,'READY_SOURCE_DRIFT_AFTER_DECLARATION');
 assert.equal((await inspect(fixture({tamper:true}))).code,'READY_BLOB_UNVERIFIED');
 assert.equal((await inspect(fixture(),{pinnedHead:INTRO})).code,'READY_MAIN_MOVED');
});
