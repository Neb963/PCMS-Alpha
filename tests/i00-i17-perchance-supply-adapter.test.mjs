import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';

const req={kind:'CREATE',slug:'disposable-exact-slug',
  principalFingerprint:'f'.repeat(64)};
async function withProvider(t,config,work){
  const email='fixture@example.invalid',token='synthetic-session-token';
  const raw=JSON.stringify({user:{loggedIn:true,email,sessionToken:token}});
  const fingerprint=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',
    new TextEncoder().encode(email)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const ledger=[],owned=new Map();
  const template={name:'minimal',isPrivate:false,modelText:'example template',
    outputTemplate:'example html',srcManifest:[],id:'template-id-old',
    publicId:'template-public-old',owner:'somebody-else',
    ...config.template};
  let stored=raw,change='timestamp-zero';
  const fetch=async(url,opts)=>{
    assert.equal(url.startsWith('https://perchance.org/api/'),true);
    assert.equal(opts.method,'POST');
    assert.equal(opts.credentials,'same-origin');
    assert.equal(opts.redirect,'error');
    assert.equal(opts.cache,'no-store');
    const name=url.slice('https://perchance.org/api/'.length);
    const body=JSON.parse(opts.body);
    ledger.push({name,body});
    assert.equal(body.email,email);
    assert.equal(body.sessionToken,token);
    let out;
    if(name==='getGeneratorsByUser')out={status:'success',
      generators:[...owned.entries()].map(([key,g])=>({name:key,isPrivate:g.isPrivate}))};
    else if(name==='getGeneratorPageData'){
      if(body.generatorName==='minimal')out={status:'success',generator:template};
      else if(owned.has(body.generatorName))
        out={status:'success',generator:owned.get(body.generatorName)};
      else out={status:config.ambiguousAbsence?'unverified':'not-found'};
    }else if(name==='checkGeneratorOwnership')
      out={status:body.generatorName==='minimal'?'is-not-owner':
        owned.has(body.generatorName)?'is-owner':'is-not-owner'};
    else if(name==='save'){
      assert.equal(ledger.some(e=>e.name==='getGeneratorPageData'&&
        e.body.generatorName==='disposable-exact-slug'),true);
      if(config.loseAck){
        owned.set('server-temp-slug',{name:'server-temp-slug',isPrivate:true,
          modelText:'',outputTemplate:'',srcManifest:[],publicId:'servernewpublic'});
        out={status:'unverified'};
      }else{
        owned.set('server-temp-slug',{name:'server-temp-slug',isPrivate:true,
          modelText:body.generator.modelText,outputTemplate:body.generator.outputTemplate,
          srcManifest:body.srcManifest,publicId:'servernewpublic'});
        out={status:'created',name:'server-temp-slug'};
      }
      if(config.rotateSessionAfterSave)change='timestamp-rotated';
    }else if(name==='changeGeneratorName'){
      const old=owned.get(body.currentName);
      if(old){owned.delete(body.currentName);owned.set(body.newName,
        {...old,name:body.newName});out={status:'success'};}
      else out={status:'unverified'};
    }else assert.fail('Unexpected provider endpoint '+name);
    return {status:200,headers:{get:k=>k==='content-type'?'application/json':null},
      json:async()=>out};
  };
  const old=new Map(['location','localStorage','crypto','fetch'].map(k=>
    [k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  for(const [k,v] of Object.entries({
    location:{origin:'https://perchance.org'},
    localStorage:{getItem:k=>k==='app-storage'?stored:
      k==='sessionTokenLastChangeTime'?change:null},
    crypto:webcrypto,fetch
  }))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
  try{
    return await work({ledger,owned,fingerprint,rotateSession:()=>{change='trotated';}});
  }finally{
    for(const [key,desc] of old)desc?
      Object.defineProperty(globalThis,key,desc):delete globalThis[key];
  }
}
test('P56-06 / P52-02 F/X: private empty first save excludes copied template authority and proves exact new ID',async t=>{
  await withProvider(t,{},async({ledger,fingerprint})=>{
    const r=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(r.ok,true,r.code);
    assert.equal(r.temporarySlug,'server-temp-slug');
    const save=ledger.filter(x=>x.name==='save');
    assert.equal(save.length,1);
    assert.equal(save[0].body.generator.modelText,'');
    assert.equal(save[0].body.generator.outputTemplate,'');
    assert.equal(save[0].body.generator.isPrivate,true);
    assert.deepEqual(save[0].body.srcManifest,[]);
    for(const inherited of ['id','publicId','owner'])
      assert.equal(Object.hasOwn(save[0].body.generator,inherited),false,inherited);
    const observed=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
      principalFingerprint:fingerprint,temporarySlug:r.temporarySlug});
    assert.equal(observed.ok,true,observed.code);
    assert.equal(observed.privateEmpty,true);
    assert.equal(observed.ownerMatches,true);
    assert.equal(observed.remoteId,'public_servernewpublic');
    const rename=await perchanceSupplyIsolated({...req,kind:'RENAME',
      principalFingerprint:fingerprint,temporarySlug:r.temporarySlug,
      remoteId:observed.remoteId});
    assert.equal(rename.ack,'RENAMED');
    const after=await perchanceSupplyIsolated({...req,kind:'READ_RENAME',
      principalFingerprint:fingerprint,temporarySlug:r.temporarySlug,
      remoteId:observed.remoteId});
    assert.equal(after.ok,true,after.code);
    assert.equal(after.remoteId,observed.remoteId);
    assert.equal(ledger.filter(x=>x.name==='save').length,1);
    assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,1);
  });
});
test('P56-06 X: unverified template assets or clone-bearing code never reaches provider save',async t=>{
  for(const template of [{srcManifest:[{path:'main.pjs',content:'code'}]},
    {html:'old html'}, {pjs:'old pjs'}, {src:{'asset.txt':'bytes'}}]){
    await withProvider(t,{template},async({ledger,fingerprint})=>{
      const res=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(res.ok,false,res);
      assert.equal(res.code,'TEMPLATE_SOURCE_UNVERIFIED');
      assert.equal(ledger.filter(x=>x.name==='save').length,0);
    });
  }
});
test('P56-06 X: failed remote absence, old template ownership or lost ACK never becomes confirmed',async t=>{
  await withProvider(t,{ambiguousAbsence:true},async({ledger,fingerprint})=>{
    const v=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(v.code,'REMOTE_ABSENCE_UNVERIFIED');
    assert.equal(ledger.some(x=>x.name==='save'),false);
  });
});
test('P56-06 X: lost save acknowledgement and session rotation remain uncertain, no implicit retry',async t=>{
  await withProvider(t,{loseAck:true},async({ledger,fingerprint})=>{
    const v=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(v.code,'CREATE_ACK_UNCERTAIN');
    assert.equal(ledger.filter(x=>x.name==='save').length,1);
  });
  await withProvider(t,{rotateSessionAfterSave:true},async({ledger,fingerprint})=>{
    const v=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(v.code,'SESSION_CHANGED_AFTER_EFFECT');
    assert.equal(ledger.filter(x=>x.name==='save').length,1);
  });
});
