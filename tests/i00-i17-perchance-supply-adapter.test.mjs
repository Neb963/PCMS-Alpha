import test from 'node:test';
import assert from 'node:assert/strict';
import {withProvider} from './helpers/supply-native-fixture.mjs';
import {perchanceSupplyIsolated as nativeSupply} from '../src/runtime/perchance-supply.mjs';

async function perchanceSupplyIsolated(request){
  if(['CREATE','RENAME'].includes(request.kind)){
    request={...request,operationId:'supply_fixture_operation'};
    const pre=await nativeSupply({...request,kind:'PREFLIGHT_'+request.kind});
    if(!pre.ok)return pre;
    return nativeSupply({...request,preflight:pre.preflight});
  }
  return nativeSupply(request);
}

const req={kind:'CREATE',slug:'disposable-exact-slug',
  principalFingerprint:'f'.repeat(64)};
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
    assert.deepEqual(save[0].body.srcManifest,{});
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
    {html:'old html'}, {pjs:'old pjs'}, {src:{'asset.txt':'bytes'}},
    {assets:[{path:'old.dat',body:'content'}]},
    {sourceFiles:{'main.pjs':'old content'}},
    {generatorCode:'old source'}, {plugins:[{name:'unsafe-clone'}]},
    {css:'body{background:red}'}, {script:'alert(1)'}]){
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

test('P56-06 X: alternate public/listed template metadata cannot override private-first save',async t=>{
  for(const template of [{isPublic:true},{isListed:true},{listed:'yes'},
    {published:true},{showInRecent:true},{isFeatured:true},
    {visibility:'PUBLIC'},{privacy:{mode:'public'}}]){
    await withProvider(t,{template},async({ledger,fingerprint})=>{
      const result=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(result.ack,'CREATED');
      assert.equal(ledger.filter(x=>x.name==='save').length,1);
      assert.equal(ledger.find(x=>x.name==='save').body.generator.isPublic,undefined);
    });
  }
  // Explicitly false aliases cannot override isPrivate:true; they may be
  // preserved when supplied by a template, but do not authorize publishing.
  await withProvider(t,{template:{isPublic:false,isListed:false,
    visibility:'private'}},async({ledger,fingerprint})=>{
    const result=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(result.ok,true,result.code);
    assert.equal(ledger.filter(x=>x.name==='save').length,1);
    assert.equal(ledger.find(x=>x.name==='save').body.generator.isPrivate,true);
  });
});

test('P56-06 X: native first save uses an explicit private/empty allowlist, never template metadata',async t=>{
  await withProvider(t,{template:{
    imports:[],collabEditModeIsEnabled:false,
    customEditorState:{unsaved:'operator-owned'},privateNotes:'do not clone',
    revisionToken:'a-previous-remote-version',arbitraryOwnerId:'other-owner'
  }},async({ledger,fingerprint})=>{
    const res=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
    assert.equal(res.ok,true,res.code);
    const saves=ledger.filter(x=>x.name==='save');
    assert.equal(saves.length,1);
    assert.deepEqual(Object.keys(saves[0].body.generator).sort(),[
      'collabEditModeIsEnabled','imports','isPrivate','modelText','name',
      'outputTemplate'].sort());
    assert.deepEqual(saves[0].body.generator.imports,[]);
    assert.equal(saves[0].body.generator.collabEditModeIsEnabled,false);
    assert.equal(saves[0].body.generator.name,'minimal');
  });
});

test('P56-06 X: imported template dependencies are rejected before any create effect',async t=>{
  for(const template of [{imports:['upstream-plugin']},
    {modelTextImports:['remote-generator']},
    {imports:{'upstream-plugin':true}}]){
    await withProvider(t,{template},async({ledger,fingerprint})=>{
      const res=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(res.code,'TEMPLATE_SOURCE_UNVERIFIED');
      assert.equal(ledger.filter(x=>x.name==='save').length,0);
    });
  }
});

test('P56-06 X: contradictory readback metadata blocks create proof and rename',async t=>{
  for(const tempReadbackExtras of [{imports:['inherited-plugin']},
    {modelTextImports:['unverified-import']},
    {collabEditModeIsEnabled:true},{isListed:true},
    {visibility:'public'},{privacy:'PUBLIC'}]){
    await withProvider(t,{tempReadbackExtras},async({ledger,fingerprint})=>{
      const create=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(create.ok,true,create.code);
      const probe=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
        principalFingerprint:fingerprint,temporarySlug:create.temporarySlug});
      assert.equal(probe.code,'PRIVATE_EMPTY_OWNER_UNVERIFIED');
      const rename=await perchanceSupplyIsolated({...req,kind:'RENAME',
        principalFingerprint:fingerprint,temporarySlug:create.temporarySlug,
        remoteId:'public_servernewpublic'});
      assert.equal(rename.code,'TEMP_OWNER_UNVERIFIED');
      assert.equal(ledger.filter(x=>x.name==='save').length,1);
      assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,0);
    });
  }
});

test('P56-06 X: old temporary URL still resolves after rename despite its absence from account census',async t=>{
  await withProvider(t,{oldTempGloballyResolvableAfterRename:true},
    async({ledger,fingerprint})=>{
      const created=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(created.ok,true,created.code);
      const first=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
        principalFingerprint:fingerprint,temporarySlug:created.temporarySlug});
      assert.equal(first.ok,true,first.code);
      const renamed=await perchanceSupplyIsolated({...req,kind:'RENAME',
        principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
        remoteId:first.remoteId});
      assert.equal(renamed.ack,'RENAMED');
      const proof=await perchanceSupplyIsolated({...req,kind:'READ_RENAME',
        principalFingerprint:fingerprint,temporarySlug:created.temporarySlug,
        remoteId:first.remoteId});
      assert.equal(proof.code,'OLD_SLUG_PAGE_UNVERIFIED');
      assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,1);
      assert.equal(ledger.filter(x=>x.name==='save').length,1);
    });
});

test('P56-06 X: untyped collaboration readback cannot prove a private empty generator',async t=>{
  await withProvider(t,{tempReadbackExtras:{collabEditModeIsEnabled:'true'}},
    async({ledger,fingerprint})=>{
      const result=await perchanceSupplyIsolated({...req,principalFingerprint:fingerprint});
      assert.equal(result.ok,true,result.code);
      const probe=await perchanceSupplyIsolated({...req,kind:'READ_CREATE',
        principalFingerprint:fingerprint,temporarySlug:result.temporarySlug});
      assert.equal(probe.code,'PRIVATE_EMPTY_OWNER_UNVERIFIED');
      assert.equal(ledger.filter(x=>x.name==='changeGeneratorName').length,0);
    });
});
