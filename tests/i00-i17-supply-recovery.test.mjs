import test from 'node:test';
import assert from 'node:assert/strict';
import {withProvider} from './helpers/supply-native-fixture.mjs';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
import {createSupplyBoundary} from '../src/runtime/supply-boundary.mjs';
import {freezeSupply,moveSupply,publicSupply,validateOwnerContext} from '../src/runtime/supply-plan.mjs';
import {transitionAccount} from '../src/runtime/accounts.mjs';
const slug='disposable-exact-slug';
const api={runtime:{id:'self',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async()=>({})}}};
const sender={id:'self',url:api.runtime.getURL('pcms/index.html')};
async function scenario(config,work){
  return withProvider(null,config,async fixture=>{
    const account={accountId:'account_repair_01',personaUid:'persona-repair-001',revision:2,bindingVersion:1,state:'VERIFIED',
      identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:fixture.fingerprint}};
    let batch=freezeSupply({batchId:'batch_repair_001',accountId:account.accountId,personaUid:account.personaUid,
      accountRevision:2,bindingVersion:1,principalFingerprint:fixture.fingerprint,slugs:[slug]}).batch;
    const transitions=[],effectsBefore=()=>fixture.ledger.filter(x=>['save','changeGeneratorName'].includes(x.name));
    const stores={accounts:{get:async()=>({ok:true,account})},supply:{get:async()=>({ok:true,batch}),
      list:async()=>({ok:true,batches:[publicSupply(batch)]}),
      stage:async p=>{const old=batch.items[0];assert.equal(p.expectedRevision,old.revision);
        const r=moveSupply(old,p.event,p.event.endsWith('_PREPARED')?{operationId:p.operationId}:p.proof);
        if(!r.ok)return r;batch={...batch,items:[r.item],revision:batch.revision+1};transitions.push(p.event);
        return {ok:true,item:r.item};}}};
    const g={getSafeRouteReadiness:async()=>({ready:true,personaUid:account.personaUid,routeId:'protected',cookieStoreId:'container'}),
      runSupplyStep:async(_,request)=>{
        if(['CREATE','RENAME'].includes(request.kind))assert.equal(transitions.at(-1),request.kind+'_DISPATCH_POSSIBLE');
        return perchanceSupplyIsolated(request);
      }};
    const boundary=createSupplyBoundary(api,{open:async()=>({}),makeStores:()=>stores,guard:()=>g});
    const cmd=(type,extra={})=>boundary.run({type,params:{batchId:batch.batchId,itemId:batch.items[0].itemId,
      expectedRevision:batch.items[0].revision,...extra}},sender);
    const execute=async action=>{const arm=await cmd('ARM_EXACT_ITEM',{confirmation:action+' '+slug});
      assert.equal(arm.ok,true,arm.code);return cmd('EXECUTE_ITEM');};
    return work({...fixture,cmd,execute,transitions,effectsBefore,account,
      item:()=>batch.items[0],batch:()=>batch,legacy:()=>{
        batch={...batch,principalFingerprint:null,items:[{...batch.items[0],state:'CREATE_UNCERTAIN',reason:'RECONCILIATION_REQUIRED',
          createOperationId:'supply_historical_001',preflight:undefined,ackTemporarySlug:null,temporarySlug:null}]};}});
  });
}
test('I17 F/X actual provider preflight failure preserves cause and zero save; unsent intent can be explicitly cancelled',async()=>{
  for(const [config,cause] of [[{template:{modelText:null}},'TEMPLATE_SOURCE_UNVERIFIED'],
    [{template:{isPrivate:null}},'TEMPLATE_VISIBILITY_UNVERIFIED'],[{ambiguousAbsence:true},'REMOTE_ABSENCE_UNVERIFIED']]){
    await scenario(config,async f=>{
      const out=await f.execute('CREATE');assert.equal(out.code,cause);assert.equal(out.dispatchMayHaveOccurred,false);
      assert.equal(f.item().state,'CREATE_PREFLIGHT_FAILED');assert.equal(f.effectsBefore().length,0);
      assert.equal(f.transitions.includes('CREATE_DISPATCH_POSSIBLE'),false);
      assert.equal((await f.cmd('GET_DIAGNOSTIC')).diagnostic.firstFailure.code,cause);
      assert.equal((await f.cmd('ABORT_PREPARED')).state,'FROZEN');
    });
  }
});
test('I17 F actual first create/rename use top-level empty manifest; ACK precedes independent confirmation',async()=>{
  await scenario({},async f=>{
    assert.equal((await f.execute('CREATE')).state,'CREATE_CONFIRMED');
    assert.equal((await f.execute('RENAME')).state,'SOURCE_PENDING');
    assert.deepEqual(f.effectsBefore().map(x=>x.name),['save','changeGeneratorName']);
    assert.deepEqual(f.effectsBefore()[0].body.srcManifest,{});
    assert.equal('srcManifest' in f.effectsBefore()[0].body.generator,false);
    assert.ok(f.transitions.indexOf('CREATE_ACKNOWLEDGED')<f.transitions.indexOf('CREATE_CONFIRMED'));
  });
});
test('I17 X delayed census recovers the original ACK identity without another save; first cause retained',async()=>{
  const config={omitTempFromCensus:true};await scenario(config,async f=>{
    const failed=await f.execute('CREATE');assert.equal(failed.code,'TEMP_NOT_IN_ACCOUNT_INVENTORY');
    assert.equal(f.item().ackTemporarySlug,'server-temp-slug');assert.equal(f.item().state,'CREATE_UNCERTAIN');
    config.omitTempFromCensus=false;
    assert.equal((await f.cmd('RECONCILE_ITEM')).state,'CREATE_CONFIRMED');
    assert.equal(f.effectsBefore().length,1);assert.equal(f.item().diagnostic.first.code,'TEMP_NOT_IN_ACCOUNT_INVENTORY');
  });
});
test('I17 X lost identity and ambiguous census remain quarantined; no unfamiliar resource is automatically attributed',async()=>{
  await scenario({loseAck:true},async f=>{
    assert.equal((await f.execute('CREATE')).code,'CREATE_ACK_UNCERTAIN');
    const investigated=await f.cmd('RECONCILE_ITEM');
    assert.equal(investigated.resolution,'QUARANTINED_UNRESOLVED');
    assert.equal(investigated.diagnostic.independentReadback.candidates.length,1);
    assert.equal(investigated.diagnostic.independentReadback.candidates[0].attributable,false);
    assert.equal(investigated.diagnostic.independentReadback.attribution,'UNPROVEN');
    assert.equal(f.item().state,'CREATE_INVESTIGATION');
    assert.equal((await f.cmd('EXECUTE_ITEM')).code,'RECONCILIATION_REQUIRED');
    assert.equal(f.effectsBefore().length,1);
    f.owned.set('concurrent-human-create',{name:'concurrent-human-create',isPrivate:true,modelText:'',outputTemplate:'',srcManifest:{},publicId:'concurrentpublic'});
    await f.cmd('INVESTIGATE_ITEM');assert.equal(f.item().investigation.candidates.length,2);
    assert.equal(f.effectsBefore().length,1);
  });
});
test('I17 legacy uncertain record with no identity preserves operation and supports bounded investigation and diagnostic export',async()=>{
  await scenario({},async f=>{
    f.legacy();const old=f.item().createOperationId;
    const out=await f.cmd('INVESTIGATE_ITEM');assert.equal(out.resolution,'QUARANTINED_UNRESOLVED');
    assert.equal(f.item().createOperationId,old);assert.equal(f.item().investigation.baselineAvailable,false);
    const d=(await f.cmd('GET_DIAGNOSTIC')).diagnostic;
    assert.equal(d.operationId,old);assert.equal(d.dispatchMayHaveOccurred,true);
    assert.equal(JSON.stringify(d).includes('sessionStamp'),false);assert.equal(f.effectsBefore().length,0);
  });
});
test('I17 unchanged verification keeps binding authority; changed principal invalidates old supply',async()=>{
  const a={accountId:'account_repair_01',personaUid:'persona-repair-001',revision:2,bindingVersion:1,state:'VERIFIED',
    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
  const action={type:'VERIFY',accountId:a.accountId,expectedRevision:2,proof:{source:'GUARDED_SESSION_READBACK',verified:true,
    personaUid:a.personaUid,principalFingerprint:'a'.repeat(64),observationId:'observation_0001'}};
  const unchanged=transitionAccount(a,action,[]).account;assert.equal(unchanged.revision,2);assert.equal(unchanged.bindingVersion,1);
  const b={accountId:a.accountId,personaUid:a.personaUid,accountRevision:2,bindingVersion:1,principalFingerprint:a.identity.principalFingerprint};
  assert.equal(validateOwnerContext(b,{...unchanged,revision:9}).ok,true);
  const changed=transitionAccount(a,{...action,proof:{...action.proof,principalFingerprint:'b'.repeat(64)}},[]).account;
  assert.equal(changed.bindingVersion,2);assert.equal(validateOwnerContext(b,changed).ok,false);
});
