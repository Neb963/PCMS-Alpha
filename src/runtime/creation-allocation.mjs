// S04 deterministic allocation. The caller provides a single consistent
// canonical IDB snapshot. Counts are historic owned+pending, never a guess
// from online status, and unavailable accounts stay in the balancing set.
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';
const bad=code=>({ok:false,code});
const valid=a=>a&&typeof a.accountId==='string'&&a.accountId.length>=8&&
  Number.isSafeInteger(a.revision)&&a.revision>0&&
  Number.isSafeInteger(a.bindingVersion)&&a.bindingVersion>0;
export function selectS04Account({intent,accounts,inventory,pending}){
  if(!intent||typeof intent.slug!=='string'||!Array.isArray(accounts)||
    !Array.isArray(inventory)||!Array.isArray(pending))
    return bad('ALLOCATION_INPUT_UNVERIFIED');
  if(isI17Quarantined(intent))return bad(I17_QUARANTINE_CODE);
  if(intent.pinConflict||intent.sourceDrift||intent.state!=='WAITING_CAPABILITY')
    return bad('ALLOCATION_HELD');
  const managed=accounts.filter(a=>a?.state!=='ARCHIVED');
  // Explicit selection scopes counting to that account; automatic balancing
  // still needs every managed account's trustworthy initial inventory.
  const eligible=intent.accountId?managed.filter(a=>a.accountId===intent.accountId):managed;
  if(intent.accountId&&eligible.length!==1)return bad('PINNED_ACCOUNT_UNAVAILABLE');
  if(eligible.some(a=>!valid(a)||a.identity?.source!=='GUARDED_SESSION_READBACK'&&
     a.state==='VERIFIED'))return bad('ACCOUNT_COUNT_UNVERIFIED');
  if(eligible.length===0)return bad('NO_MANAGED_ACCOUNTS');
  if(eligible.some(a=>a.inventoryComplete!==true||
      (a.inventoryCount&&'lastConfirmedCount' in a.inventoryCount&&
       !Number.isSafeInteger(a.inventoryCount.lastConfirmedCount))))
    return bad('INITIAL_INVENTORY_UNKNOWN');
  const snapshots=new Map(eligible.filter(a=>Number.isSafeInteger(a.inventoryCount?.lastConfirmedCount))
    .map(a=>[a.accountId,a.inventoryCount]));
  const owners=new Map(eligible.map(a=>[a.accountId,snapshots.get(a.accountId)?.lastConfirmedCount||0]));
  for(const row of inventory){
    if(intent.accountId&&row?.accountId!==intent.accountId)continue;
    if(!row||typeof row.slug!=='string'||typeof row.accountId!=='string')
      return bad('INVENTORY_COUNT_UNVERIFIED');
    if(owners.has(row.accountId)&&!snapshots.has(row.accountId)){
      // A disputed owner/identity is neither known-free nor definitely
      // safe for a new allocation. It must be resolved independently.
      if(['OWNER_CONFLICT','IDENTITY_CONFLICT','OWNER_UNVERIFIED'].includes(row.ownerState))
        return bad('INVENTORY_COUNT_UNVERIFIED');
      if(row.ownerState!=='OWNER_DISPUTED')owners.set(row.accountId,owners.get(row.accountId)+1);
    }
  }
  const pendingCounts=new Map(eligible.map(a=>[a.accountId,0]));
  // Confirmed owned resources are already charged above. Their pending Git
  // or original-archive continuation is not a second remote generator.
  const materialized=new Set();
  for(const row of inventory)if(row?.ownerState==='OBSERVED_OWNER'&&
    (!intent.accountId||row.accountId===intent.accountId)&&typeof row.remoteId==='string'){
    const identities=[row.remoteId];
    if(row.identitySchema===2&&row.identityBasis==='INDEPENDENT_FULL_BYTE_READBACK'&&
       /^[a-f0-9]{64}$/.test(row.identityProof?.fingerprint||'')&&Array.isArray(row.identityAliases))
      identities.push(...row.identityAliases);
    for(const id of identities)materialized.add(JSON.stringify([row.accountId,row.slug,id]));
  }
  const archived=new Set(accounts.filter(a=>a?.state==='ARCHIVED').map(a=>a.accountId));
  for(const item of pending){
    if(intent.accountId&&item?.accountId!==intent.accountId)continue;
    if(item?.state==='REJECTED'||item?.state==='ABORTED'||item?.state==='ARCHIVED')continue;
    const snapshot=snapshots.get(item?.accountId);
    if(snapshot){
      if(snapshot.ownedSlugs?.includes(item?.slug)||snapshot.ownedSlugs?.includes(item?.temporarySlug)||
         (item?.createdObservedAt&&item.createdObservedAt<=snapshot.countObservedAt))continue;
    }else if(materialized.has(JSON.stringify([item?.accountId,item?.slug,item?.remoteId])))continue;
    if(archived.has(item?.accountId))continue; // preserve its job without charging another account
    if(typeof item?.accountId!=='string'||!Number.isSafeInteger(pendingCounts.get(item.accountId)))
      return bad('PENDING_COUNT_UNVERIFIED');
    pendingCounts.set(item.accountId,pendingCounts.get(item.accountId)+1);
  }
  // C36/C37: assignment is a durable plan, never effect admission. A
  // temporarily unavailable account with confirmed inventory and a known
  // original principal remains in NEW balancing; its work waits for current
  // guarded identity/inventory before any provider effect.
  const knownPrincipal=a=>/^[a-f0-9]{64}$/.test(a.boundPrincipal||'')||
    (a.identity?.source==='GUARDED_SESSION_READBACK'&&
     a.identity.bindingVersion===a.bindingVersion&&
     /^[a-f0-9]{64}$/.test(a.identity.principalFingerprint||''));
  if(eligible.some(a=>!knownPrincipal(a)))return bad('ACCOUNT_COUNT_UNVERIFIED');
  const candidates=intent.accountId?
    eligible.filter(a=>a.accountId===intent.accountId):eligible;
  if(intent.accountId&&candidates.length!==1)return bad('PINNED_ACCOUNT_UNAVAILABLE');
  if(!candidates.length)return bad('NO_MANAGED_ACCOUNTS');
  const ranked=candidates.map(a=>({account:a,owned:owners.get(a.accountId),
    pending:pendingCounts.get(a.accountId)}))
    .sort((a,b)=>(a.owned+a.pending)-(b.owned+b.pending)||
      a.account.accountId.localeCompare(b.account.accountId));
  const choice=ranked[0];
  if(!choice)return bad('ALLOCATION_UNAVAILABLE');
  return {ok:true,accountId:choice.account.accountId,
    accountRevision:choice.account.revision,
    bindingVersion:choice.account.bindingVersion,
    personaUid:choice.account.personaUid,
    owned:choice.owned,pending:choice.pending,
    readyForEffect:choice.account.state==='VERIFIED'};
}
