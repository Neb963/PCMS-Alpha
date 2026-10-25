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
