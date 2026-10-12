// I06 immutable supply planning and conservative effect receipts.
// Pure logic: neither a UI claim nor a provider response is authorization.
export const SUPPLY_SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const ID=/^[a-zA-Z0-9_-]{8,100}$/;
const SAFE_STATE=new Set(['REJECTED','FROZEN','CREATE_PREPARED',
  'CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN','CREATE_OBSERVING',
  'CREATE_CONFIRMED','RENAME_PREPARED','RENAME_DISPATCH_POSSIBLE',
  'RENAME_UNCERTAIN','RENAME_OBSERVING','PROVIDER_CONFIRMED',
  'SOURCE_PENDING','CONFIRMED']);
const ERRORS=new Set(['INVALID_SLUG','SLUG_NOT_CANONICAL','DUPLICATE_SLUG',
  'ALREADY_OWNED','REMOTE_COLLISION','ACCOUNT_STALE','ROUTE_LOST',
  'GIT_UNAVAILABLE','SOURCE_COLLISION','RECONCILIATION_REQUIRED']);
const isId=v=>typeof v==='string'&&ID.test(v);
const error=code=>({ok:false,code});
export function slugIssue(slug) {
  if(typeof slug!=='string'||!SUPPLY_SLUG.test(slug)) {
    if(typeof slug==='string'&&SUPPLY_SLUG.test(slug.toLowerCase()))
      return 'SLUG_NOT_CANONICAL';
    return 'INVALID_SLUG';
  }
  return null;
}
export function freezeSupply({batchId,accountId,personaUid,
  accountRevision,bindingVersion,slugs}) {
  if(!isId(batchId)||batchId.length>95||!isId(accountId)||!isId(personaUid)||
     !Number.isSafeInteger(accountRevision)||accountRevision<1||
     !Number.isSafeInteger(bindingVersion)||bindingVersion<1||
     !Array.isArray(slugs)||slugs.length<1||slugs.length>100)
    return error('INVALID_BATCH');
  const seen=new Set();
  const items=slugs.map((slug,index)=>{
    const raw=typeof slug==='string'?slug:'';
    const duplicate=seen.has(raw.toLowerCase());
    seen.add(raw.toLowerCase());
    const issue=slugIssue(raw)|| (duplicate?'DUPLICATE_SLUG':null);
    return {itemId:batchId+'_'+String(index).padStart(3,'0'),
      index,requestedSlug:raw,accountId,personaUid,accountRevision,bindingVersion,
      state:issue?'REJECTED':'FROZEN',reason:issue,revision:1,
      createOperationId:null,renameOperationId:null,
      temporarySlug:null,remoteId:null,folder:null};
  });
  return {ok:true,batch:{batchId,accountId,personaUid,accountRevision,bindingVersion,
    state:'FROZEN',revision:1,items,createdAt:null,
    // No canonicalization, reallocation or implicit membership update later.
    frozen:true}};
}
export function validateOwnerContext(batch,account) {
  if(!batch||!account||account.accountId!==batch.accountId||
    account.personaUid!==batch.personaUid||
    account.revision!==batch.accountRevision||
    account.bindingVersion!==batch.bindingVersion||
    account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
    account.identity?.bindingVersion!==batch.bindingVersion)
    return error('ACCOUNT_STALE');
  return {ok:true};
}
export function moveSupply(item,event,proof={}) {
  if(!item||!SAFE_STATE.has(item.state)||!isId(item.itemId))
    return error('INVALID_ITEM');
  let state=item.state,reason=item.reason,temporarySlug=item.temporarySlug,
    remoteId=item.remoteId,folder=item.folder,
    createOperationId=item.createOperationId,renameOperationId=item.renameOperationId;
  switch(event) {
    case 'CREATE_PREPARED':
      if(state!=='FROZEN'||!isId(proof.operationId))return error('NOT_ADMISSIBLE');
      createOperationId=proof.operationId;state='CREATE_PREPARED';break;
    case 'CREATE_DISPATCH_POSSIBLE':
      if(state!=='CREATE_PREPARED')return error('NOT_ADMISSIBLE');
      state='CREATE_DISPATCH_POSSIBLE';break;
    case 'CREATE_UNCERTAIN':
      if(!['CREATE_DISPATCH_POSSIBLE','CREATE_OBSERVING'].includes(state))
        return error('NOT_ADMISSIBLE');
      state='CREATE_UNCERTAIN';reason='RECONCILIATION_REQUIRED';break;
    case 'CREATE_OBSERVING':
      if(!['CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN'].includes(state))
        return error('NOT_ADMISSIBLE');
      state='CREATE_OBSERVING';break;
    case 'CREATE_CONFIRMED':
      if(state!=='CREATE_OBSERVING'||proof.source!=='INDEPENDENT_READBACK'||
        proof.privateEmpty!==true||proof.ownerMatches!==true||
        !isId(proof.remoteId)||!SUPPLY_SLUG.test(proof.temporarySlug||'')||
        proof.temporarySlug===item.requestedSlug)
        return error('INDEPENDENT_CREATE_PROOF_REQUIRED');
      state='CREATE_CONFIRMED';reason=null;temporarySlug=proof.temporarySlug;
      remoteId=proof.remoteId;break;
    case 'RENAME_PREPARED':
      if(state!=='CREATE_CONFIRMED'||!isId(proof.operationId))
        return error('NOT_ADMISSIBLE');
      renameOperationId=proof.operationId;state='RENAME_PREPARED';break;
    case 'RENAME_DISPATCH_POSSIBLE':
      if(state!=='RENAME_PREPARED')return error('NOT_ADMISSIBLE');
      state='RENAME_DISPATCH_POSSIBLE';break;
    case 'RENAME_UNCERTAIN':
      if(!['RENAME_DISPATCH_POSSIBLE','RENAME_OBSERVING'].includes(state))
        return error('NOT_ADMISSIBLE');
      state='RENAME_UNCERTAIN';reason='RECONCILIATION_REQUIRED';break;
    case 'RENAME_OBSERVING':
      if(!['RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN'].includes(state))
        return error('NOT_ADMISSIBLE');
      state='RENAME_OBSERVING';break;
    case 'PROVIDER_CONFIRMED':
      if(state!=='RENAME_OBSERVING'||proof.source!=='INDEPENDENT_READBACK'||
        proof.privateEmpty!==true||proof.ownerMatches!==true||
        proof.remoteId!==remoteId||proof.slug!==item.requestedSlug||
        proof.previousSlug!==temporarySlug)return error('INDEPENDENT_RENAME_PROOF_REQUIRED');
      state='PROVIDER_CONFIRMED';reason=null;break;
    case 'SOURCE_PENDING':
      if(!['PROVIDER_CONFIRMED','SOURCE_PENDING'].includes(state))
        return error('NOT_ADMISSIBLE');
      state='SOURCE_PENDING';reason='GIT_UNAVAILABLE';break;
    case 'SOURCE_CONFIRMED':
      if(!['PROVIDER_CONFIRMED','SOURCE_PENDING'].includes(state)||
        proof.source!=='GIT_READBACK'||proof.ready!==false||
        proof.emptyFolder!==true||typeof proof.folder!=='string'||!proof.folder)
        return error('GIT_MARKER_PROOF_REQUIRED');
      state='CONFIRMED';folder=proof.folder;reason=null;break;
    case 'REJECT':
      if(state!=='FROZEN'||!ERRORS.has(proof.code))return error('NOT_ADMISSIBLE');
      state='REJECTED';reason=proof.code;break;
    default:return error('INVALID_TRANSITION');
  }
  return {ok:true,item:{...item,state,reason,temporarySlug,remoteId,folder,
    createOperationId,renameOperationId,revision:item.revision+1}};
}
export function publicSupply(batch) {
  return {batchId:batch.batchId,accountId:batch.accountId,revision:batch.revision,
    frozen:true,items:batch.items.map(item=>({
      itemId:item.itemId,slug:item.requestedSlug,state:item.state,reason:item.reason,
      revision:item.revision,source:item.folder?'NON_READY_FOLDER':'SOURCE_PENDING'
    }))};
}
