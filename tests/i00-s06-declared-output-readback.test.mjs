import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {inspectReadyCandidate} from '../src/runtime/catalog-declaration.mjs';
globalThis.crypto??=webcrypto;
const REPO='Neb963/per-gens',SLUG='output-witness',FOLDER='generators/'+SLUG,
  I='a'.repeat(40),H='b'.repeat(40),TREE_I='c'.repeat(40),TREE_H='d'.repeat(40),
  ID='rev-source20261019',OP='writeback_'+'2'.repeat(32),TOKEN='test-private-git-credential';
const raw=s=>Buffer.from(s),b64=x=>Buffer.from(x).toString('base64');
const hash=x=>createHash('sha1').update('blob '+Buffer.from(x).length+'\0')
  .update(Buffer.from(x)).digest('hex');
function fixture({alterAfterCommit=false,stripTrailer=false,unrelatedHead=false}={}){
 const blobs=new Map();
 const put=(path,content)=>{const x=raw(content),sha=hash(x);blobs.set(sha,x);
   return {path,sha,size:x.length,type:'blob',mode:'100644'};};
 const baseFiles=[put(FOLDER+'/DEPLOYMENT.md','Status: READY\nReady-Revision: source20261019\n'),
   put(FOLDER+'/main.pjs','old test source'),
   put(FOLDER+'/index.html','<main>old</main>')];
 const finalFiles=[baseFiles[0],put(FOLDER+'/main.pjs','new verified F'),
   put(FOLDER+'/index.html','<main>new F</main>')];
 const drift=alterAfterCommit?finalFiles.map(e=>e.path===FOLDER+'/main.pjs'?put(e.path,'third party drift'):e):finalFiles;
 const outer=e=>[
   {path:'generators',mode:'040000',type:'tree',sha:'e'.repeat(40)},
   {path:FOLDER,mode:'040000',type:'tree',sha:'f'.repeat(40)},
   ...e,{path:'other/info.md',mode:'100644',type:'blob',sha:hash('outside'),size:7}
 ];
 const trees=new Map([[TREE_I,outer(baseFiles)],[TREE_H,outer(drift)]]);
 const commits=new Map([[I,{tree:TREE_I,message:'original READY',parents:[]}],
   [H,{tree:TREE_H,message:stripTrailer?'unattributed':
     'PCMS verified source\n\nPCMS-Writeback-Operation: '+OP,parents:[I]}]]);
 const send=(status,data)=>({status,json:async()=>data});
 const transport=async(url,request)=>{
   const u=new URL(url),p=u.pathname.replace('/repos/'+REPO,'');
   assert.equal(request.method,'GET');
   if(p==='')return send(200,{full_name:REPO,private:true});
   if(p==='/git/ref/heads/main')return send(200,{ref:'refs/heads/main',
     object:{sha:H,type:'commit'}});
   if(p.startsWith('/commits?'))return send(200,[{sha:I}]);
   if(p.startsWith('/git/commits/')){
     const v=commits.get(p.split('/').at(-1));
     return v?send(200,{tree:{sha:v.tree},message:v.message,
       parents:v.parents.map(sha=>({sha}))}):send(404,{});
   }
   if(p.startsWith('/git/trees/')){
     const v=trees.get(p.split('/').at(-1));return v?
       send(200,{truncated:false,tree:v}):send(404,{});
   }
   if(p.startsWith('/git/blobs/')){
     const sha=p.split('/').at(-1),bytes=blobs.get(sha);
     return bytes?send(200,{sha,size:bytes.length,encoding:'base64',content:b64(bytes)}):send(404,{});
   }
   throw Error('unknown remote route '+p);
 };
 const input=[{path:'main.pjs',base64:b64('old test source')},
   {path:'index.html',base64:b64('<main>old</main>')}],
   final=[{path:'main.pjs',base64:b64('new verified F')},
   {path:'index.html',base64:b64('<main>new F</main>')}];
 return {transport,input,final};
}
test('S06 independently attributed Git F permits same frozen READY identity after authored main writeback',async()=>{
 const f=fixture(),input=await exactSource(f.input),final=await exactSource(f.final);
 const initial=await inspectReadyCandidate({repository:REPO,token:TOKEN,
   slug:SLUG,pinnedHead:H},f.transport);
 assert.equal(initial.code,'READY_SOURCE_DRIFT_AFTER_DECLARATION',JSON.stringify(initial));
 const outputProof={readyIdentifier:ID,readyInputFingerprint:input.fingerprint,
   testingSha:null,folder:FOLDER,operationId:OP,baseHead:I,expectedHead:I,
   commitSha:H,sealedSource:final};
 const accepted=await inspectReadyCandidate({repository:REPO,token:TOKEN,
   slug:SLUG,pinnedHead:H,outputProof},f.transport);
 assert.equal(accepted.ok,true,JSON.stringify(accepted));
 assert.equal(accepted.outputAttested,true);
 assert.equal(accepted.inputFingerprint,input.fingerprint);
 assert.notEqual(accepted.inputFingerprint,final.fingerprint);
});
test('S06 same-source third-party drift, missing operation trailer and counterfeit output are never READY',async()=>{
 const input=await exactSource(fixture().input),final=await exactSource(fixture().final);
 const proof={readyIdentifier:ID,readyInputFingerprint:input.fingerprint,
   testingSha:null,folder:FOLDER,operationId:OP,baseHead:I,expectedHead:I,
   commitSha:H,sealedSource:final};
 for(const [name,opts,change] of [
   ['third-party source changed',{alterAfterCommit:true},{}],
   ['unattributed Git commit',{stripTrailer:true},{}],
   ['wrong declaration ID',{}, {readyIdentifier:'rev-counterfeit'}],
   ['wrong claimed output',{}, {sealedSource:{...final,fingerprint:input.fingerprint}}]
 ]){
   const f=fixture(opts),r=await inspectReadyCandidate({repository:REPO,
     token:TOKEN,slug:SLUG,pinnedHead:H,outputProof:{...proof,...change}},f.transport);
   assert.equal(r.ok,false,name+': '+JSON.stringify(r));
 }
});
