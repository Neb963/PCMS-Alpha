import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {independentReadOnlyResults,independentDiagnosticExport,
 DIAGNOSTIC_INDEPENDENT,createDiagnosticRun,addDiagnosticEvent,
 diagnosticReport} from '../src/ui/s08-diagnostic-core.mjs';
const readiness={ok:true,rows:[
 {component:'GITHUB_AUTH',state:'VERIFIED',code:'REPOSITORY_IDENTITY_VERIFIED'},
 {component:'GITHUB_MAIN_TREE',state:'VERIFIED',code:'MAIN_TREE_COMPLETE'},
 {component:'BROWSER_GIT_STORE',state:'VERIFIED',code:'LOCAL_GIT_SECRET_PRESENT'},
 {component:'PORTABLE_BACKUP_RUNTIME',state:'VERIFIED',code:'BROWSER_PORTABLE_BACKUP_RESPONDED'}]};
const good={
 readiness,accounts:{ok:true,accounts:[]},
 inventory:{ok:true,items:[],total:0},
 refresher:{ok:true,policy:{refreshEnabled:false}},
 authority:{ok:true,record:{grants:{development:false,gitWrite:false}}}
};
test('A09 independent probes do not require account inventory completeness or live grants',()=>{
 const out=independentReadOnlyResults(good,1000);
 assert.equal(out.rows.length,8);
 assert.ok(out.rows.every(x=>x.outcome==='PASS'));
 assert.ok(out.rows.every(x=>x.proof==='READ_ONLY_API_RESPONSE'));
 assert.ok(out.limitations.includes('NO_PERCHANCE_CREATE_OR_PUBLICATION_PROOF'));
 assert.equal(out.rows.find(x=>x.id==='GIT_MAIN').tier,'GIT');
 assert.equal(out.rows.find(x=>x.id==='BACKUP_RUNTIME').tier,'D');
 assert.equal(out.rows.find(x=>x.id==='STANDING_GRANTS').outcome,'PASS',
  'a disabled grant is not broken local grant storage');
});
test('A09 one failed independent port does not suppress other successes',()=>{
 const out=independentReadOnlyResults({...good,
   readiness:{ok:false,code:'READINESS_INTERNAL_UNAVAILABLE'},
   accounts:{ok:false,code:'ACCOUNT_PORT_DOWN'}},1000);
 assert.equal(out.rows.find(x=>x.id==='GIT_MAIN').outcome,'NOT_TESTED');
 assert.equal(out.rows.find(x=>x.id==='ACCOUNT_STORE').outcome,'NOT_TESTED');
 assert.equal(out.rows.find(x=>x.id==='INVENTORY_STORE').outcome,'PASS');
 assert.equal(out.rows.find(x=>x.id==='BACKUP_RUNTIME').outcome,'NOT_TESTED');
 assert.equal(out.rows.find(x=>x.id==='REFRESHER_POLICY').outcome,'PASS');
});
test('A09 report preserves HELD create and independently observed read-only modules',()=>{
 const conf={accountId:'account_test_01',personaUid:'persona_test_01',
 repositoryId:'1411034835',namespace:'pcms-test-qa'};
 const start=createDiagnosticRun(conf,'a'.repeat(32),1000);
 assert.equal(start.ok,true);
 let held=addDiagnosticEvent(start.run,'SCOPE','PASS','SCOPED_RESOURCES_VERIFIED',1001);
 held=addDiagnosticEvent(held,'CREATE','HELD','INITIAL_INVENTORY_UNKNOWN',1002);
 held.status='HELD';held.stage='CREATE';
 const independent=independentReadOnlyResults(good,1003);
 const report=independentDiagnosticExport(independent,held);
 assert.equal(report.format,'PCMS_S08_INDEPENDENT_SANITIZED');
 assert.equal(report.checks.length,8);
 assert.equal(report.chain.firstFailure.code,'INITIAL_INVENTORY_UNKNOWN');
 assert.equal(report.chain.stages.find(x=>x.stage==='GIT_SOURCE').outcome,'NOT_TESTED');
 assert.equal(report.checks.find(x=>x.id==='GIT_MAIN').outcome,'PASS');
 assert.equal(JSON.stringify(report).includes('account_test_01'),false);
 assert.equal(JSON.stringify(report).includes('github_pat_'),false);
 assert.equal(diagnosticReport(held).livePerchance,'NOT_TESTED');
 assert.equal(DIAGNOSTIC_INDEPENDENT,'pcmsS08IndependentReadOnly');
});
test('A09 S08 primary panel exposes standalone checks, tests settle independently',async()=>{
 const template=(await import('../src/ui/faithful/diagnostic-template.mjs')).diagnosticTemplate;
 const controller=await readFile(new URL('../src/ui/s08-diagnostics.mjs',import.meta.url),'utf8');
 for(const id of ['pcms-diagnostic-independent-run','pcms-diagnostic-independent-results',
  'pcms-diagnostic-independent-status'])assert.ok(template.includes(id),id);
 assert.match(controller,/Promise\.allSettled\(probes\.map/);
 assert.match(controller,/independentButton\.addEventListener\('click'/);
 assert.match(controller,/DIAGNOSTIC_INDEPENDENT/);
 assert.match(controller,/independentDiagnosticExport\(independent,run\)/);
 assert.doesNotMatch(controller,/if\(document\.getElementById\('pcms-diagnostic-run'\)\)mountDiagnosticController\(document\)/,
   'hidden legacy diagnostic controller must never initialize during primary bridge imports');
 assert.match(template,/without a disposable generator/);
});
