// Preserve every observed exclusion; restored bindings never assert a current
// route. A later independent donor probe remains the only way to activate one.
import {readLedger,LEDGER_KEY} from './network-ledger.mjs';
const fail=code=>{throw Error(code)};
export function mergeRestoredExitLedgers(incoming,current,{uidRemap={},affectedAccounts=[],accountTargets=null}={}){
 const a=readLedger(incoming),b=readLedger(current);
 if(!a.ok||!b.ok)fail('RESTORE_EXIT_HISTORY_CORRUPT');
 const source=a.ledger,destination=b.ledger,owners={...destination.owners};
 for(const [exit,account] of Object.entries(source.owners)){
  if(owners[exit]&&owners[exit]!==account)fail('RESTORE_EXIT_HISTORY_CONFLICT');
  owners[exit]=account;
 }
 const importedHistory=structuredClone(source.restoredBindingHistory||{});
 for(const row of Object.values(importedHistory))delete row.destinationRetired;
 const affected=new Set(affectedAccounts),bindings=structuredClone(destination.bindings),
 history={...importedHistory,...(destination.restoredBindingHistory||{})};
 const byAccount=new Map(Object.values(bindings).map(r=>[r.accountId,r.bindingId]));
 for(const [id,raw] of Object.entries(source.bindings)){
  const row={...structuredClone(raw),personaUid:uidRemap[raw.personaUid]||raw.personaUid,
   pin:'HELD',holdCode:'RESTORED_ROUTE_REVERIFICATION'};
  delete row.destinationRetired;
  if(bindings[id]&&bindings[id].accountId!==row.accountId)fail('RESTORE_EXIT_BINDING_CONFLICT');
  if(byAccount.has(row.accountId)){
   if(!destination.restoredBindingHistory?.[id]&&JSON.stringify(bindings[byAccount.get(row.accountId)])!==JSON.stringify(row))history[id]=row;
   continue;
  }
  bindings[id]=row;byAccount.set(row.accountId,id);
 }
 for(const [id,row] of Object.entries(bindings))if(affected.has(row.accountId))
  bindings[id]={...row,personaUid:uidRemap[row.personaUid]||row.personaUid,
   pin:'HELD',holdCode:'RESTORED_ROUTE_REVERIFICATION'};
 if(accountTargets){
  // Only a matching destination-owned tag can be an active binding. Preserve
  // every old allocation as exclusion/history; normal enrollment upgrades a
  // newly created untagged Persona with its existing narrow TAG permit.
  for(const [id,row] of Object.entries(bindings))if(affected.has(row.accountId)){
   const target=accountTargets[row.accountId];
   if(!target?.bindingId||target.bindingId!==id){
    const historical={...(destination.bindings[id]||source.bindings[id]||row),pin:'HELD',holdCode:'RESTORED_ROUTE_REVERIFICATION'};
    delete historical.destinationRetired;
    if(destination.bindings[id])historical.destinationRetired=true;
    history[id]=historical;delete bindings[id];
   }
   else bindings[id]={...row,personaUid:target.personaUid,pin:'HELD',holdCode:'RESTORED_ROUTE_REVERIFICATION'};
  }
  for(const [accountId,target] of Object.entries(accountTargets))if(target.bindingId&&
    (!bindings[target.bindingId]||bindings[target.bindingId].accountId!==accountId))
    fail('RESTORE_TARGET_BINDING_UNVERIFIED');
 }
 return {key:LEDGER_KEY,schema:2,revision:Math.max(source.revision,destination.revision)+1,
  owners,bindings,...(Object.keys(history).length?{restoredBindingHistory:history}:{})};
}
