// Installed UI + real canonical incidents, with only two injected ACK faults.
export async function installAttentionFixture(){
 const {openCanonicalDatabase,createCanonicalStore}=await import('./journal.mjs'),{createCommandBoundary}=await import('./command-boundary.mjs');
 const db=await openCanonicalDatabase(),store=createCanonicalStore(db),scopeId='incident_j06_source',code='SOURCE_HELD',
 sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')},boundary=createCommandBoundary(browser,{open:async()=>db}),effects=[];
 const record=revision=>store.recordNotice({scopeId,code,severity:revision===1?'ACTION_REQUIRED':'SERIOUS',revision,target:{kind:'SETTINGS',id:'backups'}});
 await record(1);
 const connect=browser.runtime.connect.bind(browser.runtime);let acknowledgments=0;
 browser.runtime.connect=function(...args){if(args.at(-1)?.name!=='pcms-i02-canonical-readonly')return connect(...args);const messages=new Set(),disconnected=new Set();let closed=false;
  return {onMessage:{addListener:f=>messages.add(f)},onDisconnect:{addListener:f=>disconnected.add(f)},disconnect(){closed=true},async postMessage(packet){
   if(packet.type==='ACK_NOTICE'&&packet.notice.scopeId===scopeId){acknowledgments++;
    if(acknowledgments===1){effects.push('ACK_REJECTED_BEFORE_WRITE');if(!closed)for(const f of messages)f({ok:false,code:'CANONICAL_HOLD'});return}
    const out=await boundary.dispatch(packet,sender);effects.push({kind:'ACTUAL_ACK_COMMITTED_REPLY_LOST',out});if(!closed)for(const f of disconnected)f();return;
   }
   const out=await boundary.dispatch(packet,sender);if(!closed)for(const f of messages)f(out);
  }};
 };
 const inspect=()=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get('attention:'+scopeId+':'+code);q.onsuccess=()=>resolve({notice:q.result,acknowledgments,effects});q.onerror=reject});
 window.__j06attention={inspect,escalate:()=>record(2)};return {ok:true};
}
