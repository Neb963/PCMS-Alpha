// Developer controller, injected only into an owned disposable background.
// Native Messaging is the sole dependency substituted here. All registered
// production ports, stores, donor routes, proxy listeners and page readers run.
export async function installIssue60NativeFixture({url,key}){
 const nativeFetch=window.fetch.bind(window);
 const event=()=>{const listeners=new Set();return {addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f),emit:m=>{for(const f of [...listeners])f(m)}}};
 browser.runtime.connectNative=name=>{
  if(name!=='com.persona.mullvad_router')throw Error('FIXTURE_UNEXPECTED_NATIVE_HOST');
  let closed=false,chain=Promise.resolve();const port={onMessage:event(),onDisconnect:event(),
   disconnect(){closed=true},postMessage(message){chain=chain.then(async()=>{
    try{const response=await nativeFetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Fixture-Key':key},body:JSON.stringify(message)});
     const result=await response.json();if(!closed)port.onMessage.emit({id:message.id,...result});
    }catch{if(!closed){closed=true;port.onDisconnect.emit()}}
   })}};return port;
 };
 const {openCanonicalDatabase}=await import(browser.runtime.getURL('pcms/journal.mjs'));
 const db=await openCanonicalDatabase();
 const read=async name=>new Promise(resolve=>{const rows=[],r=db.transaction([name],'readonly').objectStore(name).openCursor();
  r.onsuccess=e=>{const row=e.target.result;if(!row)return resolve(rows);rows.push(row.value);row.continue()}});
 window.__issue60={
  async inspect(){
   const meta=await read('meta'),operations=await read('operations');
   return {accounts:meta.filter(r=>r.key?.startsWith('account:')).map(r=>r.account),
    inventories:meta.filter(r=>r.key?.startsWith('inventory-batch:')),
    creates:meta.filter(r=>r.key?.startsWith('s00-create-intent:')),
    ledger:meta.find(r=>r.key==='network:s01:exit-ownership-v1')||null,
    legacy:meta.filter(r=>r.key?.startsWith('supply-batch:')),
    operations,pending:Object.keys(await browser.storage.local.get(null)).filter(k=>k.startsWith('personaMullvadPendingPrepare:'))};
  },
  async seedLegacy(accountId){
   const accounts=(await this.inspect()).accounts,a=accounts.find(a=>a.accountId===accountId);
   if(!a)throw Error('FIXTURE_ACCOUNT_MISSING');
   const batchId='batch_issue60_legacy',itemId='batch_issue60_legacy_item',operationId='supply_issue60_legacy';
   const item={itemId,requestedSlug:'issue60-old-request',state:'CREATE_PREFLIGHT_FAILED',revision:2,createOperationId:operationId};
   const batch={batchId,accountId:a.accountId,personaUid:a.personaUid,accountRevision:a.revision,bindingVersion:a.bindingVersion,revision:2,items:[item]};
   const quarantine={batchId:'batch_e2c328e54f9c4a6ab89f1084134fde52',accountId:a.accountId,revision:4,items:[{
    itemId:'original_i17_uncertain',requestedSlug:'pcms-test-esr-chain-20261015-a01',state:'CREATE_UNCERTAIN',revision:4,createOperationId:'supply_original_i17_uncertain'}]};
   const tx=db.transaction(['meta','operations','events'],'readwrite'),m=tx.objectStore('meta'),ops=tx.objectStore('operations');
   m.put({key:'supply-batch:'+batchId,batch});m.put({key:'supply-batch:'+quarantine.batchId,batch:quarantine});
   ops.put({operationId,targetId:itemId,effectType:'supply_create_v1',status:'PREFLIGHT_FAILED',revision:2,effectBoundary:'NOT_DISPATCHED',
    firstFailure:{stage:'CREATE_PREFLIGHT',code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE',effectBoundary:'NOT_DISPATCHED',at:1792887000000}});
   ops.put({operationId:'supply_original_i17_uncertain',targetId:'original_i17_uncertain',effectType:'supply_create_v1',status:'HELD_UNCERTAIN',revision:4});
   tx.objectStore('events').add({stage:'SUPPLY_CREATE_PREFLIGHT_FAILED',operationId});
   m.put({key:'account:'+a.accountId,account:{...a,setup:{phase:'COMPLETE',code:'MULLVAD_LOCAL_SERVICE_UNAVAILABLE'}}});
   await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=reject});
   return {batchId,operationId};
  },
  async corruptPending(routeId){
   const key='personaMullvadPendingPrepare:'+routeId;
   const row=(await browser.storage.local.get(key))[key];if(!row)throw Error('FIXTURE_PENDING_MISSING');
   window.__issue60Pending=structuredClone(row);await browser.storage.local.set({[key]:{...row,password:'f'.repeat(64)}});return true;
  },
  async restorePending(){const row=window.__issue60Pending;if(!row)throw Error('FIXTURE_PENDING_MISSING');
   await browser.storage.local.set({['personaMullvadPendingPrepare:'+row.routeId]:row});delete window.__issue60Pending;return true;}
 };
 return {ok:true,scope:'NATIVE_API_SUBSTITUTION_REAL_SOCKS_TLS_DONOR_AND_PROVIDER_PROTOCOL'};
}
