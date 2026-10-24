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
  const eligible=accounts.filter(a=>a?.state!=='ARCHIVED');
  if(eligible.some(a=>!valid(a)||a.identity?.source!=='GUARDED_SESSION_READBACK'&&
     a.state==='VERIFIED'))return bad('ACCOUNT_COUNT_UNVERIFIED');
  if(eligible.length===0)return bad('NO_MANAGED_ACCOUNTS');
  if(eligible.some(a=>a.inventoryComplete!==true))
    return bad('INITIAL_INVENTORY_UNKNOWN');
  const owners=new Map(eligible.map(a=>[a.accountId,0]));
  for(const row of inventory){
    if(!row||typeof row.slug!=='string'||typeof row.accountId!=='string')
      return bad('INVENTORY_COUNT_UNVERIFIED');
    if(owners.has(row.accountId)){
      // A disputed owner/identity is neither known-free nor definitely
      // safe for a new allocation. It must be resolved independently.
      if(['OWNER_CONFLICT','IDENTITY_CONFLICT','OWNER_UNVERIFIED'].includes(row.ownerState))
        return bad('INVENTORY_COUNT_UNVERIFIED');
      if(row.ownerState!=='OWNER_DISPUTED')owners.set(row.accountId,owners.get(row.accountId)+1);
    }
  }
  const pendingCounts=new Map(eligible.map(a=>[a.accountId,0]));
  const archived=new Set(accounts.filter(a=>a?.state==='ARCHIVED').map(a=>a.accountId));
  for(const item of pending){
    if(item?.state==='REJECTED'||item?.state==='ABORTED'||item?.state==='ARCHIVED')continue;
    if(archived.has(item?.accountId))continue; // preserve its job without charging another account
    if(typeof item?.accountId!=='string'||!Number.isSafeInteger(pendingCounts.get(item.accountId)))
      return bad('PENDING_COUNT_UNVERIFIED');
    pendingCounts.set(item.accountId,pendingCounts.get(item.accountId)+1);
  }
  // Preserve unavailable accounts' historical owned/pending counts, but
  // never assign a *new* generator to an account whose protected identity
  // and route are currently unavailable. A pinned unavailable account holds
  // instead of silently rebinding to a different principal.
  const ready=eligible.filter(a=>a.state==='VERIFIED');
  const candidates=intent.accountId?
    ready.filter(a=>a.accountId===intent.accountId):ready;
  if(intent.accountId&&candidates.length!==1)return bad('PINNED_ACCOUNT_UNAVAILABLE');
  if(!candidates.length)return bad('NO_VERIFIED_ACCOUNTS');
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
