import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDisposable,evaluateDisposable,createDiagnosticRun,addDiagnosticEvent,diagnosticReport} from '../src/ui/s08-diagnostic-core.mjs';
const cfg={accountId:'account_test_01',personaUid:'persona_test_01',repositoryId:'1411034835',namespace:'pcms-test-alpha'};
const accounts={ok:true,accounts:[{accountId:cfg.accountId,personaUid:cfg.personaUid,state:'VERIFIED',identity:'VERIFIED',protectedRoute:'PCMS_PINNED',revision:9}]};
const git={ok:true,repositoryId:cfg.repositoryId};
const authority={ok:true,record:{repositoryId:cfg.repositoryId,grants:{development:true,gitWrite:true,publication:false}}};
test('C-64 disposable scope must be explicit and verified at execution time',()=>{
 assert.equal(validateDisposable(cfg).ok,true);
 for(const namespace of ['production','pcms-test-..','pcms-test-','pcms-test-a/1'])
   assert.equal(validateDisposable({...cfg,namespace}).ok,false);
 assert.equal(evaluateDisposable(cfg,accounts,git,authority).ok,true);
 assert.equal(evaluateDisposable(cfg,{...accounts,accounts:[]},git,authority).ok,false);
 assert.equal(evaluateDisposable(cfg,{...accounts,accounts:[{...accounts.accounts[0],personaUid:'foreign_01234'}]},git,authority).ok,false);
 assert.equal(evaluateDisposable(cfg,accounts,{...git,repositoryId:'123456789'},authority).ok,false);
 assert.equal(evaluateDisposable(cfg,accounts,git,{...authority,record:{...authority.record,grants:{development:true,gitWrite:false}}}).ok,false);
});
test('C-66/C-71 fresh test-owned immutable slug and sanitized resumable evidence',()=>{
 const created=createDiagnosticRun(cfg,'a'.repeat(32),100);assert.equal(created.ok,true);
 assert.equal(created.run.slug,'pcms-test-alpha-'+'a'.repeat(12));
 const run=addDiagnosticEvent(created.run,'SCOPE','PASS','SCOPE_VERIFIED',110);
 const paused=addDiagnosticEvent(run,'CREATE','HELD','PROTECTED_ROUTE_UNVERIFIED',115);
 const report=diagnosticReport(paused);
 assert.equal(report.stages.find(s=>s.stage==='CREATE').outcome,'HELD');
 assert.equal(report.stages.find(s=>s.stage==='BACKUP').outcome,'NOT_TESTED');
 assert.equal(report.scope.slug,'REDACTED');
 assert.equal(JSON.stringify(report).includes(cfg.accountId),false);
 assert.equal(report.remoteArtifactsPreserved,true);
});

test('R3: missing secure Git connection is distinct from valid namespace and account',()=>{
 const interrupted={...cfg,repositoryId:undefined};
 assert.equal(validateDisposable(interrupted).code,'TEST_GITHUB_CONNECTION_REQUIRED');
 assert.equal(validateDisposable({...cfg,namespace:'production'}).code,'TEST_NAMESPACE_INVALID');
 assert.equal(validateDisposable({...cfg,personaUid:undefined}).code,'TEST_PERSONA_BINDING_INVALID');
 assert.equal(validateDisposable(cfg).ok,true);
});

test('J06 cleanup readback stays usable with write permissions revoked; effectful tests still require the grants',()=>{
 const config={accountId:'account_fixture',personaUid:'persona_fixture',repositoryId:'42',namespace:'pcms-test-fixture'};
 const accounts={ok:true,accounts:[{accountId:config.accountId,personaUid:config.personaUid,state:'VERIFIED',identity:'VERIFIED',protectedRoute:'PCMS_PINNED',revision:4}]},git={ok:true,repositoryId:'42'};
 assert.equal(evaluateDisposable(config,accounts,git,null,{readOnly:true}).ok,true);
 assert.equal(evaluateDisposable(config,accounts,git,null).ok,false);
 assert.equal(evaluateDisposable(config,{...accounts,held:true},git,null,{readOnly:true}).code,'RESTORE_HOLD');
 const run=createDiagnosticRun(config,'a'.repeat(16),100).run;run.remoteVisibility='PUBLIC';run.remoteObservedAt=120;run.build={version:'1.2.13',extensionId:'persona-route-manager@local'};
 const report=diagnosticReport(run);assert.equal(report.remoteVisibility,'PUBLIC');assert.equal(report.installedBuild.version,'1.2.13');assert.equal(report.installedBuild.artifactSha256,null);assert.equal(report.scope.slug,'REDACTED');
});
