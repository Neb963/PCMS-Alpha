import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRestoreGate} from '../src/ui/restore-gate.mjs';
import {prepareRestoredCanonical} from '../src/ui/restore-sanitize.mjs';
import {DB_STORES,serializeClone} from '../src/ui/backup-core.mjs';
import {emptyAuto,validAuto} from '../src/runtime/backup-auto-core.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))});
const h='a'.repeat(64),scope='portable_'+'b'.repeat(32);
function local(){
 const map=new Map();
 return {map,get:async k=>({[k]:structuredClone(map.get(k))}),
 set:async rows=>{for(const [k,v] of Object.entries(rows))map.set(k,structuredClone(v))},
 remove:async k=>map.delete(k)};
}
const seal=p=>({planSha256:h,archiveSha256:h,destinationSha256:h,checkpointSha256:h,
 reviewedPlanSha256:h,checkpointTier:3,recovery:{mode:'replace',mappings:{},portableStageScope:scope},
 preparation:{epoch:p.epoch,revision:p.revision}});
test('J06 PREPARING contains no invented proof, survives a cold gate, and cancels only before sealing',async()=>{
 const s=local(),g=createRestoreGate(s);const p=await g.prepare({stageScope:scope,archiveSha256:h});
 assert.equal(p.status,'PREPARING');assert.equal(p.planSha256,undefined);assert.equal(p.checkpointSha256,undefined);
 const cold=createRestoreGate(s);assert.equal((await cold.inspect()).held,true);
 await assert.rejects(()=>cold.advance({epoch:p.epoch,revision:p.revision,group:'donor-personas',step:'donor-personas',status:'BEFORE_DISPATCH'}),/RESTORE_NOT_SEALED/);
 const sealed=await cold.begin(seal(p));assert.equal(sealed.epoch,p.epoch);assert.equal(sealed.revision,p.revision+1);
 await assert.rejects(()=>g.cancel({epoch:sealed.epoch,revision:sealed.revision}),/RESTORE_CANCEL_DENIED/);
 assert.equal((await g.inspect()).held,true);
});
test('J06 cancellation invalidates late seal and serializes against another gate writer',async()=>{
 const s=local(),g=createRestoreGate(s),other=createRestoreGate(s);
 const p=await g.prepare({stageScope:scope,archiveSha256:h});
 const cancel=other.cancel({epoch:p.epoch,revision:p.revision}),late=g.begin(seal(p));
 assert.equal((await cancel).code,'RESTORE_PREPARATION_CANCELLED');
 await assert.rejects(()=>late,/RESTORE_STALE_PREPARATION/);assert.equal((await g.inspect()).held,false);
 const next=await g.prepare({stageScope:scope,archiveSha256:h});assert.notEqual(next.epoch,p.epoch);
 await assert.rejects(()=>other.cancel({epoch:p.epoch,revision:p.revision}),/RESTORE_STALE_GUARD/);
});
test('J06 foreign backup successes are inert history while destination successes survive replace',()=>{
 const incoming=empty(),current=empty(),runId='auto_'+'c'.repeat(32);
 const auto={...emptyAuto(),enabled:true,lastSuccessDay:12,lastAttemptDay:12,status:'COMPLETE',archives:[{
 kind:'AUTO',runId,downloadId:17,bytes:10,sha256:h,day:12,tier:2,state:'COMPLETE',filename:'/tmp/pcms-backups/pcms-alpha-'+runId+'.pcms.jsonl'}]};
 const manual={key:'backup:manual-last-complete',runId:'manual_'+'d'.repeat(32),status:'BROWSER_REPORTED_COMPLETE',tier:2,sha256:h,bytes:10,downloadId:18};
 incoming.stores.meta=[{key:'backup:auto-state',value:serializeClone({key:'backup:auto-state',state:auto})},{key:manual.key,value:serializeClone(manual)}];
 const fresh=prepareRestoredCanonical({incoming,current,mode:'replace'}),byKey=new Map(fresh.stores.meta.map(r=>[r.key,r.value]));
 const row=byKey.get('backup:auto-state');assert.equal(validAuto(row.state),true);assert.equal(row.state.enabled,false);
 assert.deepEqual(row.state.archives,[]);assert.equal(row.state.lastSuccessDay,-1);assert.equal(row.historicalArchives[0].runId,runId);
 assert.equal(byKey.get(manual.key).tier,0);assert.equal(byKey.get(manual.key).status,'RESTORED_HISTORY_ONLY');assert.equal(byKey.get(manual.key).downloadId,null);
 const localGood={...manual,runId:'manual_'+'e'.repeat(32),downloadId:29};
 current.stores.meta=[{key:manual.key,value:serializeClone(localGood)}];
 const restored=prepareRestoredCanonical({incoming,current,mode:'replace'});
 assert.deepEqual(JSON.parse(JSON.stringify(restored.stores.meta.find(r=>r.key===manual.key).value)),localGood);
});

test('J06 inactive import may recover a Direct-era Persona only with all imported routes blocked; duplicate destinations remain held',async()=>{
 const {inspectRestoreMappings}=await import('../src/ui/restore-core.mjs');
 const donor={personas:[{key:'one',profile:{routeMode:'direct'}},{key:'two',profile:{routeMode:'route'}}]};
 const containers=[{cookieStoreId:'firefox-container-1',name:'Existing'}];
 assert.equal(inspectRestoreMappings(donor,{one:'__create__',two:'firefox-container-1'},containers,{strict:false,inactive:true})[0].status,'CREATE_REQUESTED');
 assert.equal(inspectRestoreMappings(donor,{one:'firefox-container-1',two:'firefox-container-1'},containers,{strict:false,inactive:true})[1].status,'MAPPING_COLLISION');
 assert.throws(()=>inspectRestoreMappings({personas:[donor.personas[0]]},{one:'firefox-container-1'},containers),/RESTORE_DIRECT_REVIEW_REQUIRED/);
});
