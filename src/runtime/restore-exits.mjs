// Preserve every observed exclusion; restored bindings never assert a current
// route. A later independent donor probe remains the only way to activate one.
import {readLedger,LEDGER_KEY} from './network-ledger.mjs';
const fail=code=>{throw Error(code)};
export function mergeRestoredExitLedgers(incoming,current,{uidRemap={},affectedAccounts=[]}={}){
 const a=readLedger(incoming),b=readLedger(current);
 if(!a.ok||!b.ok)fail('RESTORE_EXIT_HISTORY_CORRUPT');
 const source=a.ledger,destination=b.ledger,owners={...destination.owners};
 for(const [exit,account] of Object.entries(source.owners)){
  if(owners[exit]&&owners[exit]!==account)fail('RESTORE_EXIT_HISTORY_CONFLICT');
  owners[exit]=account;
 }
 const affected=new Set(affectedAccounts),bindings=structuredClone(destination.bindings),
 history={...(source.restoredBindingHistory||{}),...(destination.restoredBindingHistory||{})};
 const byAccount=new Map(Object.values(bindings).map(r=>[r.accountId,r.bindingId]));
 for(const [id,raw] of Object.entries(source.bindings)){
  const row={...structuredClone(raw),personaUid:uidRemap[raw.personaUid]||raw.personaUid,
   pin:'HELD',holdCode:'RESTORED_ROUTE_REVERIFICATION'};
  if(bindings[id]&&bindings[id].accountId!==row.accountId)fail('RESTORE_EXIT_BINDING_CONFLICT');
  if(byAccount.has(row.accountId)){
   if(JSON.stringify(bindings[byAccount.get(row.accountId)])!==JSON.stringify(row))history[id]=row;
   continue;
  }
  bindings[id]=row;byAccount.set(row.accountId,id);
 }
 for(const [id,row] of Object.entries(bindings))if(affected.has(row.accountId))
  bindings[id]={...row,personaUid:uidRemap[row.personaUid]||row.personaUid,
   pin:'HELD',holdCode:'RESTORED_ROUTE_REVERIFICATION'};
 return {key:LEDGER_KEY,schema:2,revision:Math.max(source.revision,destination.revision)+1,
  owners,bindings,...(Object.keys(history).length?{restoredBindingHistory:history}:{})};
}
