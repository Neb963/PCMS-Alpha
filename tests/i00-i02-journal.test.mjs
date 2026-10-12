import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transition, createRestoreSentinel, DB_NAME } from '../src/runtime/journal.mjs';
import { validateCommand, trustedExtensionPage } from '../src/runtime/command-boundary.mjs';
import { createSafeReport } from '../src/ui/safe-report.mjs';
import { makeSafeArchive } from '../src/ui/diagnostic-archive.mjs';
import { createNoticeDispatcher } from '../src/runtime/notices.mjs';

const target = { id:'target_alpha_001', revision:1, activeOperationId:null };
const intent = { type:'RESERVE', targetId:target.id,
  operationId:'operation_alpha_001', expectedRevision:1,
  fingerprint:'a'.repeat(64), effectType:'source_save_01' };

test('P51-03 F: canonical target revision, duplicate fingerprint and target conflict', () => {
  const first = transition(target,null,intent);
  assert.equal(first.ok,true);
  assert.equal(first.operation.status,'PREPARED');
  assert.equal(first.entity.revision,2);
  assert.equal(transition(first.entity,first.operation,intent).duplicate,true);
  assert.equal(transition(first.entity,first.operation,{...intent,fingerprint:'b'.repeat(64)}).code,'OPERATION_ID_REUSED');
  assert.equal(transition(first.entity,null,{...intent,operationId:'operation_alpha_002',expectedRevision:1}).code,'STALE_REVISION');
  assert.equal(transition(first.entity,null,{...intent,operationId:'operation_alpha_002',expectedRevision:2}).code,'TARGET_BUSY');
  assert.equal(transition(target,null,{...intent,operationId:'..'}).code,'INVALID_TARGET');
  assert.equal(transition(null,null,intent).code,'TARGET_UNVERIFIED');
});

test('P51-04 F: no fake effect without marker; lost ack holds target and cannot replay', () => {
  let entity = { ...target }, op = null;
  const remoteLedger = [];
  function apply(a) {
    const result = transition(entity,op,a);
    if (result.ok && result.changed) { entity=result.entity; op=result.operation; }
    return result;
  }
  assert.equal(remoteLedger.length,0);
  assert.equal(apply(intent).operation.status,'PREPARED');
  assert.equal(remoteLedger.length,0);
  // Crash before marker and failed journal write never reach the external boundary.
  assert.equal(apply({ type:'MARK_DISPATCH',operationId:op.operationId,targetId:target.id,expectedRevision:0 }).code,'STALE_REVISION');
  assert.equal(remoteLedger.length,0);
  assert.equal(apply({ type:'MARK_DISPATCH',operationId:op.operationId,targetId:target.id,expectedRevision:1 }).operation.status,'DISPATCH_POSSIBLE');
  remoteLedger.push({ operationId:op.operationId,accepted:true });
  assert.equal(apply({ type:'MARK_DISPATCH',operationId:op.operationId,targetId:target.id,expectedRevision:2 }).code,'DISPATCH_NOT_ADMISSIBLE');
  assert.equal(apply({ type:'CANCEL',operationId:op.operationId,targetId:target.id,expectedRevision:2 }).code,'CANNOT_CANCEL_POSSIBLE_EFFECT');
  assert.equal(apply({ type:'RECOVER',operationId:op.operationId,targetId:target.id,expectedRevision:2 }).operation.status,'HELD_UNCERTAIN');
  assert.equal(remoteLedger.length,1);
  assert.equal(entity.activeOperationId,op.operationId,'uncertain target remains conflict-fenced');
  assert.equal(apply({ type:'BEGIN_OBSERVATION',operationId:op.operationId,targetId:target.id,expectedRevision:3 }).operation.status,'OBSERVING');
  assert.equal(apply({ type:'OBSERVED_CONFLICT',operationId:op.operationId,targetId:target.id,expectedRevision:4 }).operation.status,'HELD_UNCERTAIN');
  assert.equal(entity.activeOperationId,op.operationId);
  assert.equal(remoteLedger.length,1);
  assert.equal(apply({ type:'BEGIN_OBSERVATION',operationId:op.operationId,targetId:target.id,expectedRevision:5 }).ok,true);
  assert.equal(apply({type:'OBSERVED_EQUIVALENT',operationId:op.operationId,
    targetId:target.id,expectedRevision:6}).code,'INDEPENDENT_PROOF_REQUIRED');
  assert.equal(entity.activeOperationId,op.operationId);
  assert.equal(apply({type:'OBSERVED_EQUIVALENT',operationId:op.operationId,
    targetId:target.id,expectedRevision:6,
    proof:{source:'INDEPENDENT_READBACK',disposition:'EQUIVALENT',
      observationId:'observation_fixture_01',observedFingerprint:'b'.repeat(64)}
  }).code,'INDEPENDENT_PROOF_REQUIRED');
  const independentReadback=remoteLedger.find(item=>item.operationId===op.operationId);
  assert.equal(independentReadback?.accepted,true,'fake remote ledger is independent of PCMS state');
  assert.equal(apply({type:'OBSERVED_EQUIVALENT',operationId:op.operationId,
    targetId:target.id,expectedRevision:6,
    proof:{source:'INDEPENDENT_READBACK',disposition:'EQUIVALENT',
      observationId:'observation_fixture_01',observedFingerprint:intent.fingerprint}
  }).operation.status,'CONFIRMED');
  assert.equal(entity.activeOperationId,null);
  assert.equal(remoteLedger.length,1,'readback does not create a new effect');
});

test('P51-04 F: safe cancel before dispatch frees only its own target', () => {
  const p=transition(target,null,intent);
  const stop=transition(p.entity,p.operation,{type:'CANCEL',targetId:target.id,operationId:intent.operationId,expectedRevision:1});
  assert.equal(stop.operation.status,'ABORTED');
  assert.equal(stop.entity.activeOperationId,null);
  assert.equal(stop.entity.revision,3);
  assert.equal(transition(stop.entity,stop.operation,{type:'MARK_DISPATCH',targetId:target.id,operationId:intent.operationId,expectedRevision:2}).code,'DISPATCH_NOT_ADMISSIBLE');
});

test('P51-03 F: browser-supplied sender identity and command shape, denied mutation', () => {
  const api={runtime:{id:'persona-route-manager@local',getURL: p=>'moz-extension://synthetic/pcms/'.replace('pcms/','')+p}};
  const ui={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
  const external={id:api.runtime.id,url:'https://perchance.org/pcms/index.html'};
  assert.equal(trustedExtensionPage(api,ui),true);
  assert.equal(validateCommand(api,ui,{type:'HEALTH'}).ok,true);
  assert.equal(validateCommand(api,external,{type:'HEALTH'}).code,'UNTRUSTED_SENDER');
  assert.equal(validateCommand(api,{...ui,url:api.runtime.getURL('options/options.html')},{type:'HEALTH'}).code,'UNTRUSTED_SENDER');
  assert.equal(validateCommand(api,ui,{type:'SUBMIT_INTENT',targetId:target.id}).code,'CAPABILITY_OFF');
  assert.equal(validateCommand(api,ui,{type:'HEALTH',data:'x'.repeat(3000)}).code,'MESSAGE_TOO_LARGE');
  assert.equal(validateCommand(api,ui,{type:'GET_OPERATION',operationId:'../secret'}).code,'INVALID_TARGET');
});

test('P51-06 F: restore sentinel failures always hold, only absent marker may proceed', async () => {
  const unavailable=createRestoreSentinel({get:async()=>{throw Error('token=SECRET');}});
  assert.deepEqual(await unavailable.inspect(),{held:true,code:'RESTORE_MARKER_UNAVAILABLE'});
  assert.equal((await createRestoreSentinel({get:async()=>({})}).inspect()).held,false);
  assert.equal((await createRestoreSentinel({get:async()=>({pcmsRestoreInProgress:{active:true}})}).inspect()).code,'RESTORE_IN_PROGRESS');
  assert.equal((await createRestoreSentinel({get:async()=>({pcmsRestoreInProgress:{active:false}})}).inspect()).held,true);
});

test('P55-11 F: diagnostic schema cannot leak sentinels in hostile nested input', () => {
  const sentinel='Bearer-PRIVATE-123 / IP 10.64.0.1 secret=CANARY query?token=canary';
  const hostile={ wakeCount:4,alarmCount:9,lastWake:'alarm',previousBoot:true,
    restoreActive:true, rawSource:sentinel, route:{host:sentinel},
    chat:{sessionId:sentinel}, cookies:[sentinel], note:sentinel,
    nested:Array.from({length:100},()=>({password:sentinel})) };
  const report=createSafeReport(hostile);
  const rendered=JSON.stringify(report);
  assert.equal(rendered.includes('CANARY'),false);
  assert.equal(rendered.includes('10.64'),false);
  assert.deepEqual(Object.keys(report).sort(),['effects','phase','schema','sections','wake']);
  assert.deepEqual(Object.keys(report.wake).sort(),['alarmCount','count','lastEvent','previousBootObserved']);
  assert.equal(report.sections.canonical,'section_unavailable');
  assert.equal(createSafeReport(null).sections.wake,'section_unavailable');
  assert.equal(createSafeReport({wakeCount:99,lastWake:sentinel}).wake.lastEvent,'UNKNOWN');
  assert.equal(createSafeReport({wakeCount:Infinity}).wake.count,null);
});

test('I02 build entry preserves donor wake registration and implements isolated diagnostics without privileged imports',async()=>{
  const entry=await readFile(new URL('../src/runtime/entry.mjs',import.meta.url),'utf8');
  const overlay=await readFile(new URL('../src/runtime/overlay.mjs',import.meta.url),'utf8');
  const diag=await readFile(new URL('../src/ui/emergency.mjs',import.meta.url),'utf8');
  const controller=await readFile(new URL('../src/runtime/command-boundary.mjs',import.meta.url),'utf8');
  assert.ok(entry.indexOf('recovery-bootstrap.js')<entry.indexOf('wake.mjs'));
  assert.ok(entry.indexOf('wake.mjs')<entry.indexOf('command-boundary.mjs'));
  assert.match(overlay,/journal.mjs/);
  const executable = diag.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');
  assert.doesNotMatch(executable, /PersonaGuard|nativeMessaging|cookieStore|srcManifest|sendNativeMessage|management-integration/);
  assert.doesNotMatch(controller,/fetch\s*\(|sendNativeMessage|runtime\.sendMessage/);
  assert.equal(DB_NAME,'pcms-alpha-canonical');
});

test('P55-11 F: archive structure only has predefined files and excludes hostile source sentinel',()=>{
  const sentinel='secret_canary_unreviewed_token_url_payload';
  const report=createSafeReport({wakeCount:3,alarmCount:0,lastWake:'alarm',
    sourceBytes:sentinel,notes:sentinel,restoreActive:true});
  const bytes=makeSafeArchive({...report,sourceBytes:sentinel,
    wake:{...report.wake,privateNote:sentinel}});
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes[0],0x50); assert.equal(bytes[1],0x4b);
  assert.ok(bytes.length<65536);
  const archiveText=new TextDecoder().decode(bytes);
  assert.ok(archiveText.includes('report.json'));
  assert.ok(archiveText.includes('README.md'));
  assert.ok(archiveText.includes('PCMS_SAFE_DIAGNOSTIC_V1'));
  assert.ok(!archiveText.includes(sentinel));
  assert.ok(!archiveText.includes('cookieStoreId'));
  assert.throws(()=>makeSafeArchive({schema:'unknown',sourceBytes:sentinel}),/Unvalidated/);
});

test('S6-I02-NOTIFICATIONS F: scoped notices dedupe success bursts and desktop fallback without leaking IDs',async()=>{
  const saved=[];
  const os=[];
  const store={async recordNotice(receipt){
    saved.push(receipt);
    if(receipt.code==='SOURCE_HELD')return {ok:true,changed:true};
    if(saved.length===1)return {ok:true,changed:true};
    return {ok:true,changed:false};
  }};
  const api={runtime:{getURL:p=>'moz-extension://disposable/'+p},
    notifications:{async create(opts){os.push(opts);return 'notice';}}};
  const dispatcher=createNoticeDispatcher(api,store);
  const serious={scopeId:'account_fake_01',code:'ROUTE_UNAVAILABLE',
    severity:'SERIOUS',revision:2};
  assert.equal((await dispatcher.emit(serious)).desktop,'REQUESTED');
  for(let i=0;i<50;i++)
    assert.equal((await dispatcher.emit({...serious,severity:'INFORMATIONAL'})).changed,false);
  assert.equal(os.length,1,'deduped burst yields one desktop notice');
  assert.equal(JSON.stringify(os).includes('account_fake_01'),false);
  assert.equal(JSON.stringify(os).includes('10.64.0.1'),false);
  const fallback=createNoticeDispatcher({
    ...api,notifications:{create:async()=>{throw Error('notifications permission denied');}}
  },{recordNotice:async()=>({ok:true,changed:true})});
  assert.equal((await fallback.emit({...serious,code:'SOURCE_HELD'})).desktop,
    'UNAVAILABLE_DASHBOARD_ONLY');
  const informational=createNoticeDispatcher(api,{recordNotice:async()=>({ok:true,changed:true})});
  assert.equal((await informational.emit({...serious,severity:'INFORMATIONAL'})).desktop,undefined);
  assert.equal(os.length,1);
});
