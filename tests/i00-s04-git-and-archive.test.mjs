import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {writeS04Marker,S04_NOT_READY,validateS04MarkerRequest}
  from '../src/runtime/creation-git.mjs';
import {writeOriginalArchive,inspectOriginalArchive,prepareOriginalArchive,
  originalArchiveRef} from '../src/runtime/original-archive.mjs';
globalThis.crypto??=webcrypto;
const H='a'.repeat(40),T='b'.repeat(40),NEW_TREE='c'.repeat(40),
  C='d'.repeat(40),folderRoot='e'.repeat(40),generatorRoot='f'.repeat(40);
const token='fake-native-vault-token-12345',repo='Neb963/per-gens';
const oid=b=>{const data=Buffer.from(b);return createHash('sha1')
  .update('blob '+data.length+'\0').update(data).digest('hex');};
const req={repository:repo,repositoryId:'42',slug:'s04-disposable',
  folder:'generators/s04-disposable',expectedHead:H,token};
function markerFake({lostPatch=false,badRead=false,collision=false}={}){
  let head=H,patch=0,blob=0;const history=[];
  async function transport(url,options){
    assert.equal(new URL(url).origin,'https://api.github.com');
    assert.equal(options.headers.Authorization,'Bearer '+token);
    const path=new URL(url).pathname.replace('/repos/'+repo,'');
    const method=options.method;history.push(method+' '+path);
    let data,status=200;
    if(path===''&&method==='GET')data={id:42,private:true,full_name:repo};
    else if(path==='/git/ref/heads/main'&&method==='GET')
      data={ref:'refs/heads/main',object:{sha:head,type:'commit'}};
    else if(path==='/git/commits/'+H) data={tree:{sha:T}};
    else if(path==='/git/commits/'+C) data={tree:{sha:NEW_TREE}};
    else if(path==='/git/trees/'+T) data={truncated:false,tree:[]};
    else if(path==='/git/trees/'+NEW_TREE)
      data={truncated:false,tree:[{path:'generators',sha:folderRoot,type:'tree',mode:'040000'}]};
    else if(path==='/git/trees/'+folderRoot)
      data={truncated:false,tree:[{path:req.slug,sha:generatorRoot,type:'tree',mode:'040000'}]};
    else if(path==='/git/blobs'&&method==='POST'){
      blob++;assert.equal(JSON.parse(options.body).content,S04_NOT_READY);
      data={sha:oid(S04_NOT_READY)};status=201;
    }else if(path==='/git/blobs/'+oid(S04_NOT_READY))
      data={sha:oid(S04_NOT_READY),encoding:'base64',content:Buffer.from(
        badRead?'corrupted':S04_NOT_READY).toString('base64')};
    else if(path==='/git/trees'&&method==='POST'){
      const value=JSON.parse(options.body);
      assert.equal(value.base_tree,T);
      assert.deepEqual(value.tree,[{path:req.folder+'/DEPLOYMENT.md',
        type:'blob',mode:'100644',sha:oid(S04_NOT_READY)}]);
      data={sha:NEW_TREE};status=201;
    }else if(path==='/git/commits'&&method==='POST'){
      const value=JSON.parse(options.body);
      assert.deepEqual(value.parents,[H]);data={sha:C};status=201;
    }else if(path==='/git/refs/heads/main'&&method==='PATCH'){
      patch++;assert.equal(JSON.parse(options.body).force,false);
      head=C;if(lostPatch)throw Error('lost ref ACK');
      data={ref:'refs/heads/main',object:{sha:C}};
    }else throw Error('unexpected fake '+method+' '+path);
    return {status,json:async()=>data};
  }
  return {transport,history,counts:()=>({head,patch,blob})};
}
test('S04 D: configured private NOT_READY marker commits nonforced and independently reads bytes',async()=>{
  const fx=markerFake(),out=await writeS04Marker(req,fx.transport);
  assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.head,C);
  assert.equal(out.folder,req.folder);
  assert.deepEqual(fx.counts(),{head:C,patch:1,blob:1});
  assert.equal(fx.history.some(x=>x.includes('originals/')),false);
  assert.equal(validateS04MarkerRequest({...req,folder:'gens/s04-disposable'}).ok,false);
});
test('S04 D: lost ref ACK or wrong blob readback never reports successful Git association',async()=>{
  for(const flags of [{lostPatch:true},{badRead:true}]){
    const fx=markerFake(flags),out=await writeS04Marker(req,fx.transport);
    assert.equal(out.ok,false);
    assert.equal(out.code,'GIT_EFFECT_UNCERTAIN');
    assert.equal(fx.counts().patch,1);
  }
  const f=markerFake(),invalid=await writeS04Marker({...req,repositoryId:'99'},f.transport);
  assert.equal(invalid.code,'GIT_REPOSITORY_IDENTITY_MISMATCH');
  assert.equal(f.counts().patch,0);
});
const source=[
  {path:'main.pjs',data:Buffer.from('let observed=1')},
  {path:'index.html',data:Buffer.from('<main>original</main>')},
  {path:'src/x.bin',data:Buffer.from([0,1,255])}];
const original={remotePublicId:'public_12345678',visibility:'PUBLIC',
  observedAt:123456,fingerprint:'a'.repeat(64),
  files:source.map(x=>({path:x.path,size:x.data.length,
    sha256:createHash('sha256').update(x.data).digest('hex')})),
  blobs:source.map(x=>({path:x.path,base64:x.data.toString('base64')}))};
function archiveFake({lostTag=false,corruptRead=false}={}){
  let tag=null,post=0,patch=0;
  const blobs=new Map(),records=[];
  const archiveRef=originalArchiveRef(original.remotePublicId,original.fingerprint);
  let paths=[];
  const transport=async(url,opt)=>{
    const p=new URL(url).pathname.replace('/repos/'+repo,'');
    const method=opt.method;
    assert.equal(opt.headers.Authorization,'Bearer '+token);
    records.push(method+' '+p);
    let status=200,data;
    if(p===''&&method==='GET')data={id:42,private:true,full_name:repo};
    else if(p==='/git/ref/heads/main')data={ref:'refs/heads/main',object:{sha:H}};
    else if(p==='/git/ref/'+archiveRef.slice(5)&&method==='GET'){
      if(!tag){status=404;data={message:'Not Found'};}
      else data={ref:archiveRef,object:{sha:tag}};
    }else if(p==='/git/blobs'&&method==='POST'){
      post++;const v=JSON.parse(opt.body),bytes=Buffer.from(v.content,'base64');
      const sh=oid(bytes);blobs.set(sh,bytes);data={sha:sh};status=201;
    }else if(p.startsWith('/git/blobs/')&&method==='GET'){
      const sh=p.split('/').at(-1),v=blobs.get(sh);
      data={sha:sh,encoding:'base64',content:Buffer.from(
        corruptRead?'tampered':v).toString('base64')};
    }else if(p==='/git/trees'&&method==='POST'){
      post++;const v=JSON.parse(opt.body);
      assert.equal(v.base_tree,undefined);
      paths=v.tree.map(x=>({...x,path:x.path,type:'blob'}));
      data={sha:T};status=201;
    }else if(p==='/git/commits'&&method==='POST'){
      post++;const v=JSON.parse(opt.body);
      assert.deepEqual(v.parents,[H]);assert.equal(v.tree,T);
      data={sha:C};status=201;
    }else if(p==='/git/refs'&&method==='POST'){
      post++;const v=JSON.parse(opt.body);
      assert.equal(v.ref,archiveRef);tag=v.sha;
      if(lostTag)throw Error('lost tag response');
      data={ref:archiveRef,object:{sha:tag}};status=201;
    }else if(p==='/git/commits/'+C)
      data={tree:{sha:T},parents:[{sha:H}]};
    else if(p==='/git/trees/'+T+'?recursive=1')
      data={truncated:false,tree:paths};
    else if(p.startsWith('/git/refs/heads/')&&method==='PATCH'){
      patch++;throw Error('main must never move');
    }else throw Error('unexpected archive fake '+method+' '+p);
    return {status,json:async()=>data};
  };
  return {transport,counts:()=>({tag,post,patch}),records};
}
test('S04 D: archived original creates detached exact tag, never moves main',async()=>{
  const fx=archiveFake(),request={repository:repo,repositoryId:'42',slug:'archived',
    original,token};
  const plan=await prepareOriginalArchive(request);
  assert.equal(plan.ok,true);
  assert.ok(plan.files.every(x=>x.path.startsWith('generators/archived/')));
  const out=await writeOriginalArchive(request,fx.transport);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.archiveRef,originalArchiveRef(original.remotePublicId,original.fingerprint));
  assert.equal(fx.counts().patch,0);
  const recheck=await inspectOriginalArchive(request,fx.transport);
  assert.equal(recheck.ok,true,JSON.stringify(recheck));
  assert.equal(recheck.commit,out.commit);
});
test('S04 D: corrupt original rejected before Git, lost tag/corrupted remote remain held',async()=>{
  const r={repository:repo,repositoryId:'42',slug:'archived',original,token};
  const corrupted={...r,original:{...original,blobs:original.blobs.map(x=>
    x.path==='src/x.bin'?{...x,base64:'AA=='}:x)}};
  const fx=archiveFake();
  assert.equal((await writeOriginalArchive(corrupted,fx.transport)).ok,false);
  assert.equal(fx.records.length,0);
  for(const flags of [{lostTag:true},{corruptRead:true}]){
    const f=archiveFake(flags);
    assert.equal((await writeOriginalArchive(r,f.transport)).ok,false);
    assert.equal(f.counts().patch,0);
  }
});
