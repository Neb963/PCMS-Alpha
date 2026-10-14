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
        out={status:'success',generator:owned.get(body.generatorName)};
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

test('P56-06 F/X: page and owner agree, but missing temporary slug in account census refuses create proof and rename',async t=>{
  await withProvider(t,{omitTempFromCensus:true},async({ledger,fingerprint})=>{
    const created=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(created.ok,true,created.code);
    const check=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug});
    assert.equal(check.code,'TEMP_NOT_IN_ACCOUNT_INVENTORY');
    const rename=await perchanceSupplyIsolated({...req,kind:'RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:'public_servernewpublic'});
    assert.equal(rename.code,'TEMP_NOT_IN_ACCOUNT_INVENTORY');
    assert.equal(ledger.filter(x=>x.name==='save').length,1);
    assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,0);
  });
});
test('P56-06 F/X: rename ACK and owner/page readback cannot confirm final slug absent from account census',async t=>{
  await withProvider(t,{omitFinalFromCensus:true},async({ledger,fingerprint})=>{
    const created=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(created.ok,true,created.code);
    const first=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug});
    assert.equal(first.ok,true,first.code);
    const renamed=await perchanceSupplyIsolated({...req,kind:'RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:first.remoteId});
    assert.equal(renamed.ack,'RENAMED');
    const check=await perchanceSupplyIsolated({...req,kind:'READ_RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:first.remoteId});
    assert.equal(check.code,'FINAL_SLUG_NOT_IN_ACCOUNT_INVENTORY');
    assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,1);
  });
});
test('P56-06 F/X: stale temporary census after rename cannot confirm completion',async t=>{
  await withProvider(t,{staleOldSlugAfterRename:true},async({ledger,fingerprint})=>{
    const created=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(created.ok,true,created.code);
    const checked=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug});
    assert.equal(checked.ok,true,checked.code);
    const renamed=await perchanceSupplyIsolated({...req,kind:'RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:checked.remoteId});
    assert.equal(renamed.ack,'RENAMED');
    const after=await perchanceSupplyIsolated({...req,kind:'READ_RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:checked.remoteId});
    assert.equal(after.code,'OLD_SLUG_STILL_PRESENT');
    assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,1);
  });
});

test('P56-06 F/X: inventory reports temporary slug public despite private page; create confirmation and rename held',async t=>{
  await withProvider(t,{tempPublicInCensus:true},async({ledger,fingerprint})=>{
    const created=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(created.ok,true,created.code);
    const observed=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug});
    assert.equal(observed.code,'TEMP_ACCOUNT_PRIVACY_UNVERIFIED');
    const rename=await perchanceSupplyIsolated({...req,kind:'RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:'public_servernewpublic'});
    assert.equal(rename.code,'TEMP_ACCOUNT_PRIVACY_UNVERIFIED');
    assert.equal(ledger.filter(x=>x.name==='save').length,1);
    assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,0);
  });
});
test('P56-06 F/X: final account census reports public despite private page/owner; no rename confirmation',async t=>{
  await withProvider(t,{finalPublicInCensus:true},async({ledger,fingerprint})=>{
    const created=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(created.ok,true,created.code);
    const checked=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug});
    assert.equal(checked.ok,true,checked.code);
    const renamed=await perchanceSupplyIsolated({...req,kind:'RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:checked.remoteId});
    assert.equal(renamed.ack,'RENAMED');
    const observed=await perchanceSupplyIsolated({...req,kind:'READ_RENAME',
      principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
      remoteId:checked.remoteId});
    assert.equal(observed.code,'FINAL_ACCOUNT_PRIVACY_UNVERIFIED');
    assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,1);
  });
});

test('P56-06 X: created ACK naming pre-owned resource or template never becomes a newly verified generator',async t=>{
  const preexisting={name:'owned-previous-generator',isPrivate:true,
    modelText:'old human content',outputTemplate:'old html',
    srcManifest:[],publicId:'previousownerid'};
  for(const responseName of ['owned-previous-generator','minimal',
    'disposable-exact-slug']){
    await withProvider(t,{preexistingOwned:[['owned-previous-generator',preexisting]],
      reportCreatedIdentity:responseName},async({ledger,fingerprint,owned})=>{
      const result=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(result.ok,false,result);
      assert.equal(result.code,'CREATE_ACK_UNCERTAIN');
      assert.equal(ledger.filter(x=>x.name==='save').length,1,
        'a potentially dispatched effect must not be blindly repeated');
      assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,0);
      assert.deepEqual(owned.get('owned-previous-generator'),preexisting,
        'existing operator source remains untouched');
    });
  }
});
