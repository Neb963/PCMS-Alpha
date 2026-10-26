import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRestoreSentinel} from '../src/runtime/journal.mjs';
import {checkpointed,settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';

// Exercise the production callback verbatim, as the staged donor tests do.
// Dependency barriers cut the actual asynchronous write admission boundary.
const source=await readFile(new URL('../src/runtime/account-boundary.mjs',import.meta.url),'utf8');
const marker='hold:(bindingId,code,accountId,current=()=>true)=>{';
assert.equal(source.split(marker).length,2,'one production readiness hold callback');
const start=source.indexOf(marker)+'hold:'.length,end=source.indexOf('},activePersonas:',start);
assert.ok(end>start,'the production callback must remain explicitly wired');
const make=Function('pins','checkpointed','api','exitLedger','store','sentinel',
 'return ('+source.slice(start,end+1)+');');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
function fixture({beforeLedger=async()=>{},duringLedger=async()=>{},beforeAccounts=async()=>{}}={}){
 let restore,failedStorage=false;const calls=[];
 const api={storage:{local:{get:async key=>{
  if(failedStorage)throw Error('unavailable');
  return restore===undefined?{}:{[key]:restore};
 }}}};
 const pins={hold:id=>calls.push(['pin',id])};
 const sentinel=createRestoreSentinel(api.storage.local);
 const exitLedger=async()=>{calls.push(['ledger-open']);await beforeLedger();return {
  hold:async(id,code)=>{calls.push(['ledger-write',id,code]);await duringLedger();}
 }};
 const store=async()=>{calls.push(['account-open']);await beforeAccounts();return {
  applyCurrent:async command=>{calls.push(['account-write',command]);return {ok:true}}
 }};
 const hold=make(pins,checkpointed,api,exitLedger,store,sentinel);
 return {calls,hold,setRestore:value=>{restore=value},failStorage:()=>{failedStorage=true}};
}
const binding='binding_restore_cut',account='account_restore_cut',code='MULLVAD_PROXY_UNREACHABLE';
const count=(f,name)=>f.calls.filter(c=>c[0]===name).length;

test('F1 readiness hold commits a current dependency loss and withdraws the pin synchronously',async()=>{
 const f=fixture(),task=f.hold(binding,code,account);
 assert.deepEqual(f.calls,[['pin',binding]]);
 await task;
 assert.equal(count(f,'ledger-write'),1);
 assert.equal(count(f,'account-write'),1);
 const command=f.calls.find(c=>c[0]==='account-write')[1];
 assert.deepEqual({type:command.type,accountId:command.accountId,status:command.status,code:command.code},
  {type:'ROUTE_STATUS',accountId:account,status:'HELD',code});
 assert.ok(Number.isSafeInteger(command.at));
});

test('F1 a restore beginning during readiness database acquisition forbids the subsequent ledger write',async()=>{
 const entered=deferred(),release=deferred();
 const f=fixture({beforeLedger:async()=>{entered.resolve();await release.promise}});
 const task=f.hold(binding,code,account);
 await entered.promise;f.setRestore({active:true,status:'PREPARING'});release.resolve();
 await task;
 assert.equal(count(f,'pin'),1);
 assert.equal(count(f,'ledger-write'),0,'a pre-await restore check cannot admit a later canonical write');
 assert.equal(count(f,'account-write'),0);
 await settlePcmsWork();
});

test('F1 held, invalid and inaccessible restore markers deny canonical readiness writes',async()=>{
 for(const marker of [{active:true,status:'PREPARING'},{active:true,status:'GUARD_INSTALLED'},{active:false},'inaccessible']){
  const f=fixture();if(marker==='inaccessible')f.failStorage();else f.setRestore(marker);
  assert.equal((await f.hold(binding,code,account)).code,'RESTORE_HOLD');
  assert.equal(count(f,'pin'),1);
  assert.equal(count(f,'ledger-open'),0);
  assert.equal(count(f,'ledger-write'),0);
  assert.equal(count(f,'account-write'),0);
 }
});

test('F1 a newer native observation while database acquisition waits fences the old failure writer',async()=>{
 const entered=deferred(),release=deferred();let current=true;
 const f=fixture({beforeLedger:async()=>{entered.resolve();await release.promise}});
 const task=f.hold(binding,code,account,()=>current);
 await entered.promise;current=false;release.resolve();await task;
 assert.equal(count(f,'ledger-write'),0);assert.equal(count(f,'account-write'),0);
});

test('F1 an already admitted ledger write remains in the restore drain and cannot write the account after restore begins',async()=>{
 const entered=deferred(),release=deferred();
 const f=fixture({duringLedger:async()=>{entered.resolve();await release.promise}});
 const task=f.hold(binding,code,account);
 await entered.promise;f.setRestore({active:true,status:'GUARD_INSTALLED'});
 let settled=false;const drain=settlePcmsWork().then(()=>{settled=true});
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(settled,false,'actual pre-guard work must stay owned until it settles');
 release.resolve();await task;await drain;
 assert.equal(count(f,'ledger-write'),1);assert.equal(count(f,'account-write'),0);
 assert.equal(settled,true);
});

test('F1 restore beginning during the account-store await denies the later account update',async()=>{
 const entered=deferred(),release=deferred();
 const f=fixture({beforeAccounts:async()=>{entered.resolve();await release.promise}});
 const task=f.hold(binding,code,account);
 await entered.promise;f.setRestore({active:true,status:'PREPARING'});release.resolve();await task;
 assert.equal(count(f,'ledger-write'),1);assert.equal(count(f,'account-write'),0);
});
