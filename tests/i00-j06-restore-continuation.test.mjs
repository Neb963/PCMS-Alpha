import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRestoreGate} from '../src/ui/restore-gate.mjs';
import {createRestoreStageEngine} from '../src/ui/restore-stage.mjs';
import {donorPreparationReceipt,observeDonorPreparation,donorBaselineReceipt,observeDonorBaseline} from '../src/runtime/restore-observation.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const h='a'.repeat(64),uid='11111111-1111-4111-8111-111111111111';
function storage(){const data={};return {data,get:async k=>({[k]:structuredClone(data[k])}),set:async v=>Object.assign(data,structuredClone(v)),remove:async k=>delete data[k]};}
const original=()=>({state:{global:{safe:true},routes:{},profiles:{untouched:{personaUid:'unrelated'}}},containers:[]});
const prepared=()=>({candidate:{global:{safe:true},routes:{},profiles:{untouched:{personaUid:'unrelated'},'firefox-container-1':{personaUid:uid,routeId:'__block__',killSwitch:true,blockLocalNetwork:true,managed:true}},scripts:{s:{id:'s',source:'EXACT_SOURCE_BYTES',enabled:false,autoRun:false}},workflows:{w:{id:'w',enabled:false}}},sourcePersonas:[{sourceUid:'old-persona',targetUid:uid,containerId:'firefox-container-1',sourceId:'old-container'}],scriptMap:{sourceScript:'s'},workflowMap:{sourceWorkflow:'w'}});
async function start(g){return g.begin({planSha256:h,archiveSha256:h,destinationSha256:h,checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3,protocol:2,donorBaseline:await donorBaselineReceipt(original()),recovery:{mode:'merge',mappings:{p:'__create__'}}});}
test('J06 durable donor receipt binds exact source, disabled workflows, blocked Persona and untouched destination',async()=>{
 const p=prepared(),r=await donorPreparationReceipt(p,original(),{p:'firefox-container-1'});
 assert.equal(JSON.stringify(r).includes('EXACT_SOURCE_BYTES'),false);
 const possible={...r,status:'COMMIT_POSSIBLE'},snapshot={state:p.candidate};
 assert.equal(await observeDonorPreparation(r,snapshot),false);
 assert.equal(await observeDonorPreparation(possible,snapshot),true);
 for(const mutate of [x=>x.scripts.s.source+=' changed',x=>x.profiles['firefox-container-1'].routeId='direct',x=>x.workflows.w.enabled=true,x=>x.profiles.untouched.personaUid='changed',x=>x.global.safe=false]){
  const altered=structuredClone(snapshot);mutate(altered.state);assert.equal(await observeDonorPreparation(possible,altered),false);
 }
 const baseline=await donorBaselineReceipt(original());assert.equal(await observeDonorBaseline(baseline,original()),true);
 const changed=original();changed.state.profiles.untouched.personaUid='new';assert.equal(await observeDonorBaseline(baseline,changed),false);
});
test('J06 container and donor commit intent survive cold recovery; a possibly invoked commit can never be prepared again',async()=>{
 const local=storage(),g=createRestoreGate(local);let row=await start(g);
 row=await g.advance({epoch:row.epoch,revision:row.revision,group:'donor-personas',step:'donor-personas',status:'BEFORE_DISPATCH',fingerprint:h});
 row=await g.advance({epoch:row.epoch,revision:row.revision,group:'donor-personas',step:'donor-personas',status:'DISPATCH_POSSIBLE'});
 row=await g.prepareContainer({epoch:row.epoch,revision:row.revision,personaKey:'p',name:'PCMS Restore '+row.epoch.slice(8,20)+' 000'});
 const cold=createRestoreGate(local);assert.equal((await cold.read()).containerIntents.p.status,'CREATE_POSSIBLE');
 await assert.rejects(()=>cold.prepareContainer({epoch:row.epoch,revision:row.revision,personaKey:'p',name:row.containerIntents.p.name}),/RESTORE_CONTAINER_ALREADY_POSSIBLE/);
 row=await cold.recordContainer({epoch:row.epoch,revision:row.revision,personaKey:'p',cookieStoreId:'firefox-container-1'});
 const receipt=await donorPreparationReceipt(prepared(),original(),{p:'firefox-container-1'});
 row=await cold.donorReceipt({epoch:row.epoch,revision:row.revision,receipt});
 row=await cold.donorReceipt({epoch:row.epoch,revision:row.revision,commitPossible:true});
 await assert.rejects(()=>g.donorReceipt({epoch:row.epoch,revision:row.revision,receipt}),/RESTORE_DONOR_RECEIPT_INVALID/);
 assert.equal((await g.read()).donorPreparation.status,'COMMIT_POSSIBLE');
});
test('J06 explicit continuation starts a never-dispatched prepared group once; possible effects only reconcile',async()=>{
 const g=createRestoreGate(storage());let row=await start(g),effects=0,visible=false;
 row=await g.advance({epoch:row.epoch,revision:row.revision,group:'donor-personas',step:'donor-personas',status:'BEFORE_DISPATCH',fingerprint:h});
 const engine=createRestoreStageEngine(g,{dispatch:async()=>{effects++;visible=true},readback:async()=>({source:'INDEPENDENT_READBACK',digest:visible?h:'0'.repeat(64)})});
 await assert.rejects(()=>engine.execute({epoch:row.epoch,revision:row.revision,group:'donor-personas',step:'donor-personas',fingerprint:h}),/RESTORE_GROUP_ALREADY_STARTED/);
 row=await engine.execute({epoch:row.epoch,revision:row.revision,group:'donor-personas',step:'donor-personas',fingerprint:h,continuePrepared:true});
 assert.equal(row.groups['donor-personas'].status,'OBSERVED');assert.equal(effects,1);
 const second=createRestoreStageEngine(g,{dispatch:async()=>{effects++;throw Error('ACK_LOST')},readback:async()=>({source:'INDEPENDENT_READBACK',digest:'0'.repeat(64)})});
 row=await second.execute({epoch:row.epoch,revision:row.revision,group:'donor-cookies',step:'donor-cookies',fingerprint:h});assert.equal(effects,2);
 await assert.rejects(()=>second.execute({epoch:row.epoch,revision:row.revision,group:'donor-cookies',step:'donor-cookies',fingerprint:h,continuePrepared:true}),/RESTORE_GROUP_ALREADY_STARTED/);
 row=await createRestoreStageEngine(g,{readback:async()=>({source:'INDEPENDENT_READBACK',digest:h})}).reconcile({epoch:row.epoch,revision:row.revision,group:'donor-cookies',step:'donor-cookies',fingerprint:h});
 assert.equal(row.groups['donor-cookies'].status,'OBSERVED');assert.equal(effects,2);
});

test('J06 replace import preserves unrelated Persona script/workflow bytes and execution assignments',async()=>{
 const {preserveUnselectedDonorSources}=await import('../src/runtime/restore-preserve.mjs');
 const current={profiles:{unrelated:{scriptIds:['shared']}},scripts:{shared:{id:'shared',code:'UNTOUCHED EXACT SOURCE',profileIds:['unrelated','selected'],enabled:true,autoRun:true}},workflows:{flow:{id:'flow',enabled:true,steps:[{profileId:'unrelated',scriptIds:['shared']}]}}};
 const imported={state:{profiles:{selected:{scriptIds:['shared']}},scripts:{shared:{id:'shared',code:'IMPORTED SOURCE',profileIds:['selected'],enabled:false}},workflows:{flow:{id:'flow',enabled:false,steps:[{profileId:'selected',scriptIds:['shared']}]}}},maps:{script:new Map([['s','shared']]),workflow:new Map([['w','flow']])}};
 let next=0;preserveUnselectedDonorSources(imported,current,new Set(['selected']),{newId:kind=>kind+'-new-'+(++next)});
 const sid=imported.maps.script.get('s'),wid=imported.maps.workflow.get('w');
 assert.notEqual(sid,'shared');assert.notEqual(wid,'flow');
 assert.equal(imported.state.scripts.shared.code,current.scripts.shared.code);assert.equal(imported.state.scripts.shared.enabled,true);
 assert.deepEqual(imported.state.scripts.shared.profileIds,['unrelated']);
 assert.deepEqual(imported.state.workflows.flow,current.workflows.flow);
 assert.equal(imported.state.scripts[sid].code,'IMPORTED SOURCE');assert.deepEqual(imported.state.profiles.selected.scriptIds,[sid]);
 assert.deepEqual(imported.state.workflows[wid].steps[0].scriptIds,[sid]);
});
test('J06 exit exclusions union newer destination history; actual cross-account conflicts hold and no imported pin activates',async()=>{
 const {mergeRestoredExitLedgers}=await import('../src/runtime/restore-exits.mjs');
 const key='network:s01:exit-ownership-v1',binding={accountId:'account_fixture',bindingId:'binding_fixture',personaUid:uid,pin:'ACTIVE',routeId:'route_fixture',history:[]};
 const incoming={key,schema:2,revision:2,owners:{'IPv4:8.8.8.8':'account_fixture'},bindings:{binding_fixture:binding}};
 const current={key,schema:2,revision:8,owners:{'IPv4:8.8.8.8':'account_fixture','IPv4:9.9.9.9':'account_other'},bindings:{binding_fixture:binding,binding_other:{...binding,accountId:'account_other',bindingId:'binding_other'}}};
 const merged=mergeRestoredExitLedgers(incoming,current,{affectedAccounts:['account_fixture']});
 assert.equal(merged.owners['IPv4:9.9.9.9'],'account_other');assert.equal(merged.bindings.binding_fixture.pin,'HELD');assert.equal(merged.bindings.binding_other.pin,'ACTIVE');assert.equal(merged.revision,9);
 const fresh=mergeRestoredExitLedgers(incoming,null);assert.equal(fresh.bindings.binding_fixture.pin,'HELD');
 const conflict=structuredClone(incoming);conflict.owners['IPv4:9.9.9.9']='account_fixture';
 assert.throws(()=>mergeRestoredExitLedgers(conflict,current),/RESTORE_EXIT_HISTORY_CONFLICT/);
});
test('J06 complete restored automation history is terminal, mapped and stable without touching private donor jobs',async()=>{
 const {restoredAutomationHistory,canonicalWithAutomationHistory}=await import('../src/runtime/restore-observation.mjs');
 const payload={automationHistory:[{id:'source-job',state:'running',workflowId:'old-flow',tasks:[{profileId:'old-container'}]}]};
 const receipt={workflowMap:{'old-flow':'restored-flow'},sourcePersonas:[{sourceId:'old-container',containerId:'firefox-container-1'}]};
 const first=await restoredAutomationHistory(payload,receipt,'restore_'+'a'.repeat(32),1000),second=await restoredAutomationHistory(payload,receipt,'restore_'+'a'.repeat(32),1000);
 assert.deepEqual(first,second);assert.equal(first[0].state,'interrupted');assert.equal(first[0].workflowId,'restored-flow');assert.equal(first[0].tasks[0].profileId,'firefox-container-1');
 const base={schema:1,stores:{meta:[]}};const expected=canonicalWithAutomationHistory(base,first,'restore_'+'a'.repeat(32));
 assert.equal(expected.stores.meta[0].value.jobs[0].sourceHistoryId,'source-job');assert.equal(base.stores.meta.length,0);
});
