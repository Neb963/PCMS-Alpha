import test from 'node:test';
import assert from 'node:assert/strict';
import {NON_READY_MARKER,markerRequestAllowed,writeNonReadyFolder}
  from '../src/runtime/supply-git.mjs';
const H='a'.repeat(40),T='b'.repeat(40),B='c'.repeat(40),
  N='d'.repeat(40),C='e'.repeat(40);
const folder='gens/example-private',slug='example-private',token='offline-test-token-0001';
function fixture({privateRepo=true,existing=false,drift=false,lostPatch=false,
  missingMain=false,wrongBlob=false}={}){
  let head=H,refReads=0;
  const calls=[],ledger=[],blob64=Buffer.from(NON_READY_MARKER).toString('base64');
  async function transport(url,options){
    const u=new URL(url),path=u.pathname;
    assert.equal(u.origin,'https://api.github.com');
    assert.ok(path==='/repos/Neb963/per-gens'||path.startsWith('/repos/Neb963/per-gens/'));
    assert.equal(options.headers.Authorization,'Bearer '+token);
    assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    calls.push({method:options.method,path,body:options.body?JSON.parse(options.body):null});
    let response,status=200;
    if(path==='/repos/Neb963/per-gens'&&options.method==='GET')
      response={full_name:'Neb963/per-gens',private:privateRepo};
    else if(path.endsWith('/git/ref/heads/main')&&options.method==='GET'){
      refReads++;
      if(missingMain)return {status:404,json:async()=>({message:'not found'})};
      if(drift&&refReads===2)head='f'.repeat(40);
      response={ref:'refs/heads/main',object:{sha:head,type:'commit'}};
    }else if(path.endsWith('/git/commits/'+H))
      response={sha:H,tree:{sha:T}};
    else if(path.endsWith('/git/trees/'+T))
      response={truncated:false,tree:existing?
        [{path:folder+'/human.txt',type:'blob',mode:'100644',sha:B}]:[]};
    else if(path.endsWith('/git/blobs')&&options.method==='POST'){
      assert.equal(options.body&&JSON.parse(options.body).content,NON_READY_MARKER);
      ledger.push({effect:'BLOB',value:NON_READY_MARKER});response={sha:B};status=201;
    }else if(path.endsWith('/git/trees')&&options.method==='POST'){
      const v=JSON.parse(options.body);
      assert.equal(v.base_tree,T);
      assert.deepEqual(v.tree,[{path:folder+'/DEPLOYMENT.md',type:'blob',mode:'100644',sha:B}]);
      ledger.push({effect:'TREE',value:v.tree});response={sha:N};status=201;
    }else if(path.endsWith('/git/commits')&&options.method==='POST'){
      const v=JSON.parse(options.body);
      assert.deepEqual(v.parents,[H]);
      assert.equal(v.tree,N);
      ledger.push({effect:'COMMIT',value:v.message});response={sha:C};status=201;
    }else if(path.endsWith('/git/refs/heads/main')&&options.method==='PATCH'){
      const v=JSON.parse(options.body);
      assert.equal(v.force,false);
      assert.equal(v.sha,C);
      ledger.push({effect:'REF',value:C});
      head=C;
      if(lostPatch)throw Error('socket lost after ref accepted');
      response={ref:'refs/heads/main',object:{sha:C}};
    }else if(path.endsWith('/git/commits/'+C))
      response={sha:C,tree:{sha:N}};
    else if(path.endsWith('/git/trees/'+N))
      response={truncated:false,tree:[{path:folder+'/DEPLOYMENT.md',type:'blob',
        mode:'100644',sha:B}]};
    else if(path.endsWith('/git/blobs/'+B))
      response={encoding:'base64',content:wrongBlob?'ZmFrZQ==':blob64};
    else throw Error('unhandled fake Git API '+options.method+' '+url);
    return {status,json:async()=>response};
  }
  return {transport,calls,ledger};
}
test('S6-I06-GIT-MARKER-SAFETY F: only non-READY marker and nonforced CAS with byte-exact readback',async()=>{
  const f=fixture(),out=await writeNonReadyFolder({token,folder,slug},f.transport);
  assert.equal(out.ok,true,out.code);
  assert.equal(out.source,'GIT_READBACK');
  assert.equal(out.ready,false);assert.equal(out.emptyFolder,true);
  assert.equal(out.head,C);
  assert.equal(f.ledger.filter(x=>x.effect==='REF').length,1);
  assert.equal(f.ledger.find(x=>x.effect==='BLOB').value,'Status: SOURCE_PENDING\n');
  assert.equal(f.ledger.every(x=>JSON.stringify(x).includes('READY')===false||
    JSON.stringify(x).includes('SOURCE_PENDING')),true);
});
test('S6-I06-GIT-MARKER-SAFETY F: known occupied path, uninitialized main and public repo never write',async()=>{
  for(const flags of [{existing:true},{missingMain:true},{privateRepo:false}]){
    const f=fixture(flags),out=await writeNonReadyFolder({token,folder,slug},f.transport);
    assert.equal(out.ok,false);
    assert.equal(f.ledger.length,0,JSON.stringify(flags));
  }
  const f=fixture();
  for(const bad of [{folder:'gens/../escape',slug},{folder:'gens/other',slug},
    {folder:'gens/EXAMPLE-private',slug},{folder,slug,token:'short'},
    {folder:'gens/other/private',slug}]){
    const res=await writeNonReadyFolder({token,...bad},f.transport);
    assert.equal(res.ok,false);
  }
  assert.equal(f.calls.length,0);
});
test('S6-I06-GIT-MARKER-SAFETY F: HEAD drift means no ref change, never force',async()=>{
  const f=fixture({drift:true}),out=await writeNonReadyFolder({token,folder,slug},f.transport);
  assert.equal(out.code,'GIT_HEAD_DRIFT');
  assert.equal(f.ledger.some(x=>x.effect==='REF'),false);
});
test('S6-I06-GIT-MARKER-SAFETY F: lost PATCH reply or bad readback cannot claim folder',async()=>{
  for(const flags of [{lostPatch:true},{wrongBlob:true}]){
    const f=fixture(flags),out=await writeNonReadyFolder({token,folder,slug},f.transport);
    assert.equal(out.ok,false);
    assert.ok(['GIT_WRITE_UNCERTAIN','GIT_READBACK_UNCERTAIN'].includes(out.code));
    assert.equal(f.ledger.filter(x=>x.effect==='REF').length,1);
  }
});
test('S6-I06-GIT-MARKER-SAFETY F: marker policy excludes READY and path traversal',()=>{
  assert.equal(NON_READY_MARKER.includes('Status: READY\n'),false);
  assert.equal(markerRequestAllowed({folder,slug,token}).ok,true);
  assert.equal(markerRequestAllowed({folder:'../gens/foo',slug,token}).ok,false);
});
