import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {projectOperationContext,operationGroup} from '../src/runtime/operation-context.mjs';
import {validateCommand} from '../src/runtime/command-boundary.mjs';
const op={operationId:'supply_legacy_01',targetId:'batch_legacy_item_01',effectType:'supply_create_v1',
 status:'PREFLIGHT_FAILED',revision:2,effectBoundary:'NOT_DISPATCHED',
 firstFailure:{code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE',stage:'CREATE_PREFLIGHT',effectBoundary:'NOT_DISPATCHED',at:1792887000000}};
const batch={batchId:'batch_legacy_01',accountId:'account_legacy_01',items:[]};
const item={itemId:op.targetId,createOperationId:op.operationId,requestedSlug:'legacy-create-target',state:'CREATE_PREFLIGHT_FAILED'};
test('Issue60: legacy provenance joins exact item and failure without mutation or invented time',async()=>{
 const db=fakeDatabase(),tx=db.transaction(['operations','meta','events'],'readwrite');
 tx.objectStore('operations').put(op);tx.objectStore('meta').put({key:'supply-batch:'+batch.batchId,batch:{...batch,items:[item]}});
 tx.objectStore('events').add({stage:'SUPPLY_CREATE_PREFLIGHT_FAILED',operationId:op.operationId});
 await new Promise(resolve=>tx.oncomplete=resolve);
 const before=structuredClone(db.read('operations',op.operationId));
 const result=await createCanonicalStore(db).inspectOperationContext(op.operationId);
 assert.equal(result.ok,true);assert.equal(result.providerEffects,'NONE');
 assert.equal(result.context.evidence,'RECORDED_NO_DISPATCH');
 assert.equal(result.context.related.accountId,batch.accountId);assert.equal(result.context.related.slug,item.requestedSlug);
 assert.equal(result.context.failure.code,op.firstFailure.code);assert.equal(result.context.updatedAt,null);
 assert.equal(result.context.provenance,'HISTORICAL_SUPPLY_V1');assert.equal(result.context.replayAllowed,false);
 assert.deepEqual(db.read('operations',op.operationId),before);
 assert.deepEqual(db.read('meta','supply-batch:'+batch.batchId).batch.items,[item]);
});
test('Issue60: bare/contradictory preflight labels never prove no dispatch or authorize replay',()=>{
 const linked=[{batch,item}];
 for(const [record,links,events] of [
  [{...op,effectBoundary:undefined},linked,[]],
  [{...op,firstFailure:undefined},linked,[]],
  [op,[],[]],[op,[...linked,...linked],[]],
  [op,linked,[{stage:'SUPPLY_CREATE_DISPATCH_POSSIBLE'}]],
  [op,[{batch,item:{...item,ack:{classification:'UNKNOWN'}}}],[]],
  [{...op,remoteId:'already_effected'},linked,[]],
 ]){
  const c=projectOperationContext(record,links,events);assert.equal(c.evidence,'UNRESOLVED');assert.equal(c.replayAllowed,false);
 }
 assert.equal(operationGroup('PREFLIGHT_FAILED'),'NEEDS_ACTION');
 assert.equal(operationGroup('FUTURE_UNKNOWN'),'NEEDS_ACTION');
 assert.equal(operationGroup('READY_TO_DISPATCH'),'WAITING');
});
test('Issue60: contextual record inspection remains a trusted read-only command',()=>{
 const api={runtime:{id:'pcms',getURL:p=>'moz-extension://pcms/'+p}},sender={id:'pcms',url:'moz-extension://pcms/pcms/index.html#work-queue'};
 const message={type:'GET_OPERATION_CONTEXT',params:{operationId:op.operationId}};
 assert.equal(validateCommand(api,sender,message).ok,true);
 assert.equal(validateCommand(api,{...sender,id:'foreign'},message).code,'UNTRUSTED_SENDER');
 assert.equal(validateCommand(api,sender,{...message,params:{...message.params,retry:true}}).ok,false);
});
