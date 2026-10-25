import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticRun,addDiagnosticEvent,recoverInterruptedDiagnostic,independentReadOnlyResults} from '../src/ui/s08-diagnostic-core.mjs';
import {createDiagnosticStartup} from '../src/runtime/diagnostic-startup.mjs';
const config={accountId:'account_fixture',personaUid:'persona_fixture',repositoryId:'91',namespace:'pcms-test-fixture'};
test('J06 first causal failure and chronological events survive successful recovery and a later failure',()=>{
 let run=createDiagnosticRun(config,'a'.repeat(32),100).run;
 run=addDiagnosticEvent(run,'CREATE','HELD','INITIAL_INVENTORY_UNKNOWN',101);
 run=addDiagnosticEvent(run,'CREATE','PASS','CREATE_VERIFIED',102);
 assert.equal(run.firstFailure.code,'INITIAL_INVENTORY_UNKNOWN');assert.equal(run.currentHold,null);
 run=addDiagnosticEvent(run,'AI_TEST','UNCERTAIN','NATIVE_ACK_UNKNOWN',103);
 assert.equal(run.firstFailure.code,'INITIAL_INVENTORY_UNKNOWN');assert.equal(run.currentHold.code,'NATIVE_ACK_UNKNOWN');
 assert.equal(run.eventHistory.length,3);assert.equal(run.events.find(e=>e.stage==='CREATE').outcome,'PASS');
 const cold=recoverInterruptedDiagnostic({...run,status:'RUNNING'});assert.equal(cold.firstFailure.code,'INITIAL_INVENTORY_UNKNOWN');
});
test('J06 actual backup status and functional checks are independent of failed CREATE/Git probes',()=>{
 const result=independentReadOnlyResults({readiness:{ok:false},accounts:{ok:false},backup:{ok:true},
 archive:{ok:true,code:'IN_MEMORY_SOURCE_AND_DONOR_VERIFIED'},localRestore:{ok:true,code:'ISOLATED_CANONICAL_RESTORE_REOPEN_VERIFIED'}},100);
 for(const id of ['BACKUP_RUNTIME','BACKUP_ARCHIVE','RESTORE_LOCAL_DATA'])assert.equal(result.rows.find(r=>r.id===id).outcome,'PASS');
 assert.equal(result.rows.find(r=>r.id==='GIT_MAIN').outcome,'NOT_TESTED');
});
test('J06 page/extension reload cannot produce a Firefox startup receipt; version and trusted sender are fenced',async()=>{
 const data={},api={storage:{local:{get:async k=>({[k]:structuredClone(data[k])}),set:async o=>Object.assign(data,structuredClone(o))}},runtime:{id:'fixture-xpi',getURL:p=>'moz-extension://fixture-xpi/'+p,getManifest:()=>({version:'1.2.13'})}};
 const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html#settings')},runId='s08_'+'a'.repeat(32),request=type=>({type,params:{runId}});
 const first=createDiagnosticStartup(api,{clock:()=>100});assert.equal((await first.handle(request('ARM'),sender)).ok,true);
 const cold=createDiagnosticStartup(api,{clock:()=>200});assert.equal((await cold.handle(request('STATUS'),sender)).observed,false);
 assert.equal((await cold.handle(request('ARM'),{...sender,id:'untrusted'})).code,'UNTRUSTED_SENDER');
 await cold.startup();const receipt=await cold.handle(request('STATUS'),sender);
 assert.equal(receipt.observed,true);assert.equal(receipt.independentProcessProof,false);assert.equal(receipt.observedAt,200);
 api.runtime.getManifest=()=>({version:'1.2.14'});assert.equal((await cold.handle(request('STATUS'),sender)).observed,false);
});
