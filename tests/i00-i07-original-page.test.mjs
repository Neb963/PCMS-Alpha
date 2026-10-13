import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {perchanceReadIsolated} from '../src/runtime/perchance-observer.mjs';

test('P52-03 F: guarded original source reads committed full PJS, HTML and src bytes without effects',async()=>{
  const old={location:globalThis.location,localStorage:globalThis.localStorage,
    fetch:globalThis.fetch,crypto:globalThis.crypto};
  const user={loggedIn:true,email:'user@example.test',sessionToken:'secret-token-123'};
  const raw=JSON.stringify({user});
  const key='a'.repeat(32)+'.png';
  const source=Buffer.from([0,55,180,255]);
  const calls=[];
  globalThis.crypto??=webcrypto;
  globalThis.location={origin:'https://perchance.org'};
  globalThis.localStorage={getItem:k=>k==='app-storage'?raw:
    k==='sessionTokenLastChangeTime'?'time-one':null};
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    assert.equal(options.method,url.includes('uploads.dev')?'GET':'POST');
    assert.equal(options.redirect,'error');
    if(url.includes('uploads.dev'))return {status:200,headers:new Headers({
      'content-length':String(source.length)}),arrayBuffer:async()=>Uint8Array.from(source).buffer};
    const path=url.split('/api/')[1];
    const args=JSON.parse(options.body);
    if(path==='getGeneratorPageData'){
      assert.deepEqual(args,{generatorName:'alpha'});
      return {status:200,headers:new Headers({'content-type':'application/json'}),
        json:async()=>({status:'success',generator:{name:'alpha',isPrivate:false,
          publicId:'resource123',modelText:'let a=1',outputTemplate:'<p>saved</p>',
          srcManifest:{'src/a.png':{key,size:source.length}}}})};
    }
    assert.equal(args.email,'user@example.test');
    assert.equal(args.sessionToken,user.sessionToken);
    if(path==='getGeneratorsByUser')return {status:200,
      headers:new Headers({'content-type':'application/json'}),
      json:async()=>({status:'success',generators:[{name:'alpha',isPrivate:false}],
        generatorFolderMap:{}})};
    if(path==='checkGeneratorOwnership')return {status:200,
      headers:new Headers({'content-type':'application/json'}),
      json:async()=>({status:'is-owner'})};
    throw Error('unexpected provider call');
  };
  try{
    const result=await perchanceReadIsolated({originalSlug:'alpha'});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal(result.original.ownerResult,'IS_OWNER');
    assert.equal(result.original.visibility,'PUBLIC');
    assert.equal(result.original.assets.length,1);
    assert.equal(Buffer.from(result.original.assets[0].base64,'base64').equals(source),true);
    assert.equal(result.original.assets[0].sha256,createHash('sha256').update(source).digest('hex'));
    assert.equal(calls.some(c=>c.url==='https://user.uploads.dev/file/'+key),true);
    assert.equal(calls.some(c=>c.options.method!=='GET'&&c.options.method!=='POST'),false);
    assert.equal(calls.some(c=>c.url.includes('/api/save')),false);
    assert.equal(JSON.stringify(result).includes(user.sessionToken),false);
    assert.equal(JSON.stringify(result).includes(user.email),false);
  }finally{
    for(const [k,v] of Object.entries(old)){
      if(v===undefined)delete globalThis[k];else globalThis[k]=v;
    }
  }
});
