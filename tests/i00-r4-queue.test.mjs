import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {validateCommand} from '../src/runtime/command-boundary.mjs';
// D-tier bounded IDB callback harness: no provider, network or hidden DOM.
const former=globalThis.IDBKeyRange;
globalThis.IDBKeyRange={lowerBound:(value,open=false)=>({value,open})};
function dbFrom({operations=[],notices=[]}={}){
 const data={
  operations:operations.map(x=>[x.operationId,x]),
  meta:notices.map(x=>['attention:'+x.scopeId+':'+x.code,{...x,key:'attention:'+x.scopeId+':'+x.code}])
 };
 return {transaction:(names,mode)=>{
   assert.equal(mode,'readonly');
   const tx={oncomplete:null,onabort:null,onerror:null,
    objectStore(name){return {openCursor(range){
      const src=[...(data[name]||[])].sort((a,b)=>a[0].localeCompare(b[0]));
      const arr=src.filter(([key])=>!range||range.open?(!range||key>range.value):key>=range.value);
      let i=0;const request={onsuccess:null};
      const deliver=()=>{if(!request.onsuccess)return;
       const pair=arr[i];
       const cursor=pair?{key:pair[0],value:pair[1],continue(){i++;queueMicrotask(deliver)}}:null;
       request.onsuccess({target:{result:cursor}});
      };
      queueMicrotask(deliver);return request;
    }}}
   };
   setTimeout(()=>tx.oncomplete?.(),20);
   return tx;
  }};
}
const statuses=['PREPARED','DISPATCH_POSSIBLE','OBSERVING','HELD_UNCERTAIN','CONFIRMED','ABORTED','REJECTED'];
test('R4 queue: stable paginated operation identities, no DOM-derived statuses',async()=>{
 const operations=Array.from({length:110},(_,i)=>({
  operationId:'op_'+String(i).padStart(8,'0'),
  targetId:'target_'+String(i).padStart(8,'0'),
  effectType:'CREATE',revision:i+1,status:statuses[i%statuses.length]}));
 const store=createCanonicalStore(dbFrom({operations}));
 const a=await store.listOperationPage({limit:25,status:'ALL'});
 assert.equal(a.ok,true);assert.equal(a.items.length,25);assert.equal(a.more,true);
 assert.equal(a.items[0].operationId,'op_00000000');
 assert.equal(a.items[0].updatedAt,null,'legacy unknown timestamps never invented');
 const b=await store.listOperationPage({limit:25,after:a.next});
 assert.equal(b.items[0].operationId,'op_00000025');
 assert.equal(new Set([...a.items,...b.items].map(x=>x.operationId)).size,50);
 const needs=await store.listOperationPage({limit:100,status:'NEEDS_ACTION'});
 assert.ok(needs.items.every(x=>['HELD_UNCERTAIN','REJECTED','DISPATCH_POSSIBLE'].includes(x.status)));
 const search=await store.listOperationPage({limit:5,query:'target_00000042'});
 assert.equal(search.items.length,1);assert.equal(search.items[0].targetId,'target_00000042');
 assert.equal((await store.listOperationPage({limit:1000})).code,'INVALID_QUEUE_FILTER');
});
test('R4 queue: independently paginated unresolved incidents and unchanged ACK semantics',async()=>{
 const notices=Array.from({length:55},(_,i)=>({
  scopeId:'incident_'+String(i).padStart(8,'0'),code:'GIT_FOLDER_MISSING',
  severity:'ACTION_REQUIRED',revision:1,reviewed:false,state:i===2?'RESOLVED':'ACTIVE'}));
 const store=createCanonicalStore(dbFrom({notices}));
 const first=await store.pageNotices({limit:20});
 assert.equal(first.ok,true);assert.equal(first.items.length,20);assert.equal(first.more,true);
 assert.ok(first.items.every(n=>n.scopeId!=='incident_00000002'));
 const second=await store.pageNotices({limit:20,after:first.next});
 assert.equal(second.items.length,20);assert.ok(second.items[0].cursor>first.next);
 const searched=await store.pageNotices({limit:20,query:'incident_00000042'});
 assert.equal(searched.items.length,1);
});
test('R4 primary queue uses protected typed pages, not legacy text heuristics',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 const section=ui.slice(ui.indexOf('function displayQueue(){'),ui.indexOf('function displayOverview(){'));
 assert.ok(section.includes('queueState[op.status]'));
 assert.ok(section.includes('q.incidents'));
 assert.doesNotMatch(section,/observedReceipts\(\)|nativeControl\('pcms-/);
 const api={runtime:{id:'combined-id',getURL:s=>'moz-extension://test/'+s}};
 const sender={id:'combined-id',url:'moz-extension://test/pcms/index.html#work-queue'};
 assert.equal(validateCommand(api,sender,{type:'LIST_OPERATION_PAGE',params:{limit:20,after:'',status:'WAITING'}}).ok,true);
 assert.equal(validateCommand(api,sender,{type:'LIST_NOTICE_PAGE',params:{limit:20,query:'git'}}).ok,true);
 assert.equal(validateCommand(api,sender,{type:'LIST_OPERATION_PAGE',params:{limit:500}}).ok,false);
 assert.equal(validateCommand(api,sender,{type:'LIST_OPERATION_PAGE',params:{status:'ALL',effect:'DISPATCH'}}).ok,false);
 assert.equal(validateCommand(api,{...sender,id:'other'},{type:'LIST_OPERATION_PAGE',params:{limit:20}}).ok,false);
});
