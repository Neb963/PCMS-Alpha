import test from 'node:test';
import assert from 'node:assert/strict';
import {classifySessionResponse,classifyOwnerResponse,normalizeReadOnlyInventory,
  createReadOnlyInterpreter} from '../src/runtime/perchance-readback.mjs';
import {validateInventoryObservation} from '../src/runtime/inventory.mjs';
import {readFile} from 'node:fs/promises';
const account={accountId:'account_alpha_01',personaUid:'persona-aaaa-0001',
  revision:3,bindingVersion:1,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:'a'.repeat(64),bindingVersion:1}};
const context={accountId:account.accountId,personaUid:account.personaUid,
  accountRevision:3,bindingVersion:1,principalFingerprint:account.identity.principalFingerprint,
  routeId:'route-safe',cookieStoreId:'firefox-container-1'};
const entry={name:'owned-gen',isPrivate:true};
const sessionReply={httpStatus:200,body:{status:'success',
  generators:[entry],generatorFolderMap:{}}};
const ownerReplies=new Map([['owned-gen',{httpStatus:200,body:{status:'is-owner'}}]]);
const args=()=>({sessionReply,items:sessionReply.body.generators,ownerReplies,
  account,context,observationId:'observation_0001',observedAt:1791841200000});

test('P52-01 F: authenticated session success needs exact JSON and validated token status',()=>{
  assert.equal(classifySessionResponse(200,{status:'success',generators:[],generatorFolderMap:{}}).ok,true);
  for(const [status,response] of [
    [200,{status:'session-token-error'}],[200,{status:'success'}],
    [403,'<!doctype html>'],[200,{status:'captcha-needed'}],
    [500,{status:'success',generators:[],generatorFolderMap:{}}]])
    assert.equal(classifySessionResponse(status,response).ok,false);
});

test('P52-01 F: editability is never ownership; mismatch cannot be promoted',()=>{
  assert.equal(classifyOwnerResponse(200,{status:'is-owner'}).ownerResult,'IS_OWNER');
  assert.equal(classifyOwnerResponse(200,{status:'is-not-owner'}).ownerResult,'NOT_OWNER');
  assert.equal(classifyOwnerResponse(200,{status:'session-token-error'}).code,'SESSION_REJECTED');
  assert.equal(classifyOwnerResponse(403,{status:'is-owner'}).ok,false);
  const good=normalizeReadOnlyInventory(args());
  assert.equal(good.ok,true);
  assert.equal(good.observation.generators[0].identityBasis,'SLUG_ONLY');
  assert.equal(good.observation.generators[0].visibility,'UNLISTED');
  assert.equal(validateInventoryObservation(account,good.observation).ok,true);
  const collaborator=new Map([['owned-gen',{httpStatus:200,body:{status:'is-not-owner',canEdit:true,editKey:'secret'}}]]);
  const other=normalizeReadOnlyInventory({...args(),ownerReplies:collaborator});
  assert.equal(other.observation.generators[0].ownerResult,'NOT_OWNER');
  assert.equal(other.observation.generators[0].ownerPrincipalFingerprint,null);
  const tokenError=new Map([['owned-gen',{httpStatus:200,body:{status:'session-token-error'}}]]);
  assert.equal(normalizeReadOnlyInventory({...args(),ownerReplies:tokenError}).code,'SESSION_REJECTED');
});

test('I04 F: provider drift, mismatched account, duplicate slug and incomplete owner lookups hold',()=>{
  const a=args();
  assert.equal(normalizeReadOnlyInventory({...a,account:{...account,state:'OVERRIDDEN'}}).ok,false);
  assert.equal(normalizeReadOnlyInventory({...a,context:{...context,routeId:'direct',bindingVersion:4}}).ok,false);
  assert.equal(normalizeReadOnlyInventory({...a,ownerReplies:new Map()}).ok,false);
  assert.equal(normalizeReadOnlyInventory({...a,items:[entry]}).ok,false);
  const duplicate={...sessionReply,body:{...sessionReply.body,generators:[entry,entry]}};
  assert.equal(normalizeReadOnlyInventory({...a,sessionReply:duplicate,items:duplicate.body.generators,
    ownerReplies:new Map([['owned-gen',{httpStatus:200,body:{status:'is-owner'}}]])}).ok,false);
  const badshape={...sessionReply,body:{...sessionReply.body,generators:[{name:'private-gen'}]}};
  assert.equal(normalizeReadOnlyInventory({...a,sessionReply:badshape,items:badshape.body.generators,
    ownerReplies:new Map([['private-gen',{httpStatus:200,body:{status:'is-owner'}}]])}).ok,false);
});

test('I04 F: deterministic combined package includes the dormant verifier',async()=>{
  const overlay=await readFile(new URL('../src/runtime/overlay.mjs',import.meta.url),'utf8');
  assert.ok(overlay.includes("'perchance-readback.mjs'"));
});

test('I04 F: interpreter passes only de-identified observations, not session secrets',async()=>{
  const adapter=createReadOnlyInterpreter({
    readProtectedPage:async ctx=>{
      assert.deepEqual(ctx,context);
      return {ok:true,principalFingerprint:account.identity.principalFingerprint,
        sessionReply,ownerReplies:[...ownerReplies]};
    },now:()=>1791841200000,newObservationId:()=>'observation_0001'
  });
  const out=await adapter(context,account);
  assert.equal(validateInventoryObservation(account,out).ok,true);
  assert.doesNotMatch(JSON.stringify(out),/sessionToken|email|authorization/);
  const leaking=createReadOnlyInterpreter({readProtectedPage:async()=>({
    sessionReply,ownerReplies,sessionToken:'must-stay-in-page',email:'user@example.test'
  })});
  assert.equal((await leaking(context,account)).ok,false,
    'credential-bearing page envelope must not be admitted');
  const blocked=createReadOnlyInterpreter({readProtectedPage:async()=>({
    ok:false,principalFingerprint:account.identity.principalFingerprint,
    sessionReply:{httpStatus:403,body:'challenge'},ownerReplies:[]
  })});
  assert.equal((await blocked(context,account)).ok,false);
  const nestedLeak=createReadOnlyInterpreter({readProtectedPage:async()=>({
    ok:true,principalFingerprint:account.identity.principalFingerprint,
    sessionReply:{httpStatus:200,body:{...sessionReply.body,sessionToken:'secret'}},
    ownerReplies:[...ownerReplies]
  })});
  assert.equal((await nestedLeak(context,account)).ok,false);
});
