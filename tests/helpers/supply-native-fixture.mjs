import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
export async function withProvider(t,config,work){
  const email='fixture@example.invalid',token='synthetic-session-token';
  const raw=JSON.stringify({user:{loggedIn:true,email,sessionToken:token}});
  const fingerprint=Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256',
    new TextEncoder().encode(email)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const ledger=[],owned=new Map(config.preexistingOwned||[]);
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
    if(name==='getGeneratorPageData'){
      assert.equal(body.email,undefined);
      assert.equal(body.sessionToken,undefined);
    }else{
      assert.equal(body.email,email);
      assert.equal(body.sessionToken,token);
    }
    let out;
    if(name==='getGeneratorsByUser'){
      // An account census is an independent remote witness: it can lag,
      // omit a just-created/renamed slug, or still show the old temporary ID
      // even when page and ownership endpoints appear to agree.
      const rows=[...owned.entries()].filter(([key])=>
        !(config.omitTempFromCensus&&key==='server-temp-slug')&&
        !(config.omitFinalFromCensus&&key==='disposable-exact-slug'))
        .map(([key,g])=>({name:key,isPrivate:
          (config.tempPublicInCensus&&key==='server-temp-slug')||
          (config.finalPublicInCensus&&key==='disposable-exact-slug')
            ?false:g.isPrivate}));
      if(config.staleOldSlugAfterRename&&owned.has('disposable-exact-slug'))
        rows.push({name:'server-temp-slug',isPrivate:true});
      out={status:'success',generators:rows};
    }
    else if(name==='getGeneratorPageData'){
      if(body.generatorName==='minimal')out={status:'success',generator:template};
      else if(owned.has(body.generatorName))
        out={status:'success',generator:{...owned.get(body.generatorName),
          ...(body.generatorName==='server-temp-slug'
            ?config.tempReadbackExtras:config.finalReadbackExtras)}};
      else if(config.oldTempGloballyResolvableAfterRename&&
        body.generatorName==='server-temp-slug'&&
        owned.has('disposable-exact-slug'))
        out={status:'success',generator:{name:'server-temp-slug',
          isPrivate:true,modelText:'',outputTemplate:'',srcManifest:[],
          publicId:'servernewpublic'}};
      else out={status:config.ambiguousAbsence?'unverified':'not-found'};
    }else if(name==='checkGeneratorOwnership')
      out={status:body.generatorName==='minimal'?'is-not-owner':
        owned.has(body.generatorName)?'is-owner':'is-not-owner'};
    else if(name==='save'){
      assert.equal(ledger.some(e=>e.name==='getGeneratorPageData'&&
        e.body.generatorName==='disposable-exact-slug'),true);
      if(config.reportCreatedIdentity){
        // Model a provider which says "created" but returns a known owned
        // generator or the template ID. The fake remote ledger records the
        // dispatch but does not mint a novel resource.
        out={status:'created',name:config.reportCreatedIdentity};
      }else if(config.loseAck){
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
