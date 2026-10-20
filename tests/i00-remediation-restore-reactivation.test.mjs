import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestoreGate,RESTORE_GUARD_KEY} from '../src/ui/restore-gate.mjs';
import {createRestoreSentinel} from '../src/runtime/journal.mjs';
function storage(){
  const map=new Map();
  return {map,async get(k){return {[k]:map.get(k)};},
    async set(v){for(const [k,x] of Object.entries(v))map.set(k,structuredClone(x));},
    async remove(k){map.delete(k);}};
}
const h='f'.repeat(64);
async function restore(s,{complete=true}={}){
  const gate=createRestoreGate(s,{now:()=>1000,uuid:()=>'a'.repeat(32)});
  let row=await gate.begin({planSha256:h,archiveSha256:h,destinationSha256:h,
    checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3,fresh:true});
  const groups=['donor-personas','donor-cookies','donor-portable','pcms-canonical'];
  for(const [i,group] of groups.entries()){
    row=await gate.advance({epoch:row.epoch,revision:row.revision,step:group,group,status:'BEFORE_DISPATCH'});
    row=await gate.advance({epoch:row.epoch,revision:row.revision,step:group,group,status:'DISPATCH_POSSIBLE'});
    if(!complete&&i===3){
      row=await gate.advance({epoch:row.epoch,revision:row.revision,step:group,group,status:'HELD_UNCERTAIN'});break;}
    row=await gate.advance({epoch:row.epoch,revision:row.revision,step:group,group,status:'OBSERVED',
      observation:{source:'INDEPENDENT_READBACK',digest:h}});
  }
  return {gate,row};
}
test('restore reactivation: a completed, fully observed restore can be explicitly reactivated',async()=>{
  const s=storage(),{gate,row}=await restore(s);
  assert.equal(row.status,'COMPLETE_INACTIVE');
  const sentinel=createRestoreSentinel(s);
  assert.equal((await sentinel.inspect()).held,true,'every boundary is held after restore');
  const receipt=await gate.inspect();
  assert.equal(receipt.revision,row.revision);
  await assert.rejects(()=>gate.reactivate({epoch:row.epoch,revision:row.revision-1}),/RESTORE_STALE_GUARD/);
  const out=await gate.reactivate({epoch:receipt.epoch,revision:receipt.revision});
  assert.equal(out.code,'CONTROLLER_REACTIVATED');
  assert.equal(s.map.has(RESTORE_GUARD_KEY),false);
  assert.equal((await sentinel.inspect()).held,false,'PCMS can operate again');
  assert.equal(s.map.get('pcmsRestoreHistory').length,1);
});
test('restore reactivation: a partial or uncertain restore stays held',async()=>{
  const s=storage(),{gate,row}=await restore(s,{complete:false});
  assert.equal(row.status,'RESTORE_PARTIAL_HELD');
  await assert.rejects(()=>gate.reactivate({epoch:row.epoch,revision:row.revision}),/RESTORE_NOT_COMPLETE_INACTIVE/);
  assert.equal((await createRestoreSentinel(s).inspect()).held,true);
});
