// Read-only compatibility. Neither status vocabulary nor a preflight failure
// authorizes another effect. Original records and missing times stay intact.
export const OPERATION_STATES=Object.freeze({
 PREPARED:['Waiting',''],READY_TO_DISPATCH:['Waiting',''],
 PREFLIGHT_FAILED:['Prerequisites failed','amber'],
 DISPATCH_POSSIBLE:['Outcome not confirmed','amber'],OBSERVING:['Verifying result',''],
 HELD_UNCERTAIN:['Needs reconciliation','amber'],CONFIRMED:['Confirmed','green'],
 ABORTED:['Cancelled',''],REJECTED:['Rejected','amber']
});
export function operationGroup(status){
 if(['CONFIRMED','ABORTED'].includes(status))return 'COMPLETED';
 if(['PREPARED','READY_TO_DISPATCH'].includes(status))return 'WAITING';
 if(status==='OBSERVING')return 'RUNNING';
 return 'NEEDS_ACTION';
}
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x)?x:null;
const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x)?x:null;
const code=x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(x)?x:null;
export function projectOperationContext(op,links,events){
 const matches=links.filter(({batch,item})=>item.itemId===op.targetId&&
  [item.createOperationId,item.renameOperationId,item.gitOperationId].includes(op.operationId));
 const link=matches.length===1?matches[0]:null;
 const legacy=/^supply_(create|rename|git_marker)_v1$/.test(op.effectType||'');
 const phase=op.effectType==='supply_create_v1'?'CREATE':op.effectType==='supply_rename_v1'?'RENAME':'GIT';
 const failure=op.firstFailure||link?.item.diagnostic?.first;
 const laterDispatch=events.some(e=>/DISPATCH_POSSIBLE|ACKNOWLEDGED|OBSERVING|UNCERTAIN|CONFIRMED|INVESTIGATION/.test(e.stage||''));
 const noDispatch=legacy&&!!link&&op.status==='PREFLIGHT_FAILED'&&op.effectBoundary==='NOT_DISPATCHED'&&
   failure?.effectBoundary==='NOT_DISPATCHED'&&link.item.state===phase+'_PREFLIGHT_FAILED'&&
   !op.ack&&!op.remoteId&&!op.temporarySlug&&!link.item.ack&&!link.item.ackTemporarySlug&&!link.item.ackRemoteId&&!laterDispatch;
 return {operationId:op.operationId,targetId:op.targetId,effectType:op.effectType,status:op.status,revision:op.revision,
  updatedAt:Number.isSafeInteger(op.updatedAt)?op.updatedAt:null,
  provenance:legacy&&link?'HISTORICAL_SUPPLY_V1':legacy?'UNLINKED_SUPPLY_V1':'CANONICAL_OPERATION',
  evidence:noDispatch?'RECORDED_NO_DISPATCH':op.status==='CONFIRMED'?'JOURNAL_CONFIRMED':'UNRESOLVED',
  failure:{code:code(failure?.code)||code(link?.item.reason),stage:code(failure?.stage),
   at:Number.isSafeInteger(failure?.at)?failure.at:null},
  related:link?{batchId:id(link.batch.batchId),accountId:id(link.batch.accountId),itemId:id(link.item.itemId),
   slug:slug(link.item.requestedSlug),temporarySlug:slug(link.item.temporarySlug),state:code(link.item.state)}:null,
  ambiguous:matches.length>1,replayAllowed:false};
}
