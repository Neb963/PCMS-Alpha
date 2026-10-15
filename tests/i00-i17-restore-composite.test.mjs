import test from 'node:test';
import assert from 'node:assert/strict';
import {createRestoreGate,safeRestoreReceipt,RESTORE_GUARD_KEY}
  from '../src/ui/restore-gate.mjs';
import {prepareRestoredCanonical} from '../src/ui/restore-sanitize.mjs';
import {DB_STORES,serializeClone,deserializeClone} from '../src/ui/backup-core.mjs';
import {restoreReadiness} from '../src/ui/restore-core.mjs';

const H='a'.repeat(64),K='b'.repeat(64);
function state(){
  const stores=Object.fromEntries(DB_STORES.map(k=>[k,[]]));
  const row=(store,key,value)=>stores[store].push({key,value:serializeClone(value)});
  row('meta','account:acct01',{account:{accountId:'acct01',personaUid:'persona-old-01',
    state:'VERIFIED',revision:4,bindingVersion:2,identity:{source:'GUARDED_SESSION_READBACK'}}});
  row('meta','inventory:gen01',{generator:{slug:'gen01',accountId:'acct01',
    personaUid:'persona-old-01',bindingVersion:2,accountRevision:4,
    ownerState:'OBSERVED_OWNER',ownerVerified:true,visibility:'PUBLIC',source:'READY'}});
  row('meta','release:gen01',{release:{state:'APPROVED',approval:{sourceFingerprint:H}}});
  row('meta','writeback:gen01',{record:{state:'DISPATCH_POSSIBLE'}});
  row('meta','refresher:shadow:v1',{state:{globalPause:false,
    rows:[{stableId:'rf01',personaUid:'persona-old-01',slot:true,paused:false}],
    accounts:{acct01:{personaUid:'persona-old-01',paused:false,
      verifiedIdentity:true,principalFingerprint:H}},
    inflight:[{claimId:'pending01'}],dueIndex:[1],nextWakeAt:123,nextAdmissionAt:456}});
  row('operations',5,{operationId:'op-pending',status:'DISPATCH_POSSIBLE',revision:2});
  return {schema:1,stores};
}
const value=(snap,key)=>deserializeClone(snap.stores.meta.find(x=>x.key===key).value);
test('P56-04 F/X: authentic restored history remains inert across approvals, IDB effects, accounts and queue',()=>{
  const incoming=state();
  const current={schema:1,stores:Object.fromEntries(DB_STORES.map(x=>[x,[]]))};
  const result=prepareRestoredCanonical({incoming,current,mode:'replace',
    uidRemap:{'persona-old-01':'persona-new-01'}});
  const a=value(result,'account:acct01').account;
  assert.equal(a.state,'VERIFICATION_PENDING');
  assert.equal(a.personaUid,'persona-new-01');
  assert.equal(a.identity,null);
  assert.equal(a.bindingVersion,3);
  const gen=value(result,'inventory:gen01').generator;
  assert.equal(gen.ownerState,'OWNER_UNVERIFIED');
  assert.equal(gen.visibility,'UNKNOWN');
  assert.equal(gen.source,'SOURCE_PENDING');
  assert.equal(gen.reviewHeld,true);
  assert.equal(gen.bindingVersion,a.bindingVersion);
  const release=value(result,'release:gen01').release;
  assert.equal(release.state,'RESTORE_REVIEW_REQUIRED');
  assert.equal(release.approval,null);
  assert.equal(value(result,'writeback:gen01').record.state,'RESTORE_REVIEW_REQUIRED');
  const queued=result.stores.operations[0].value;
  assert.equal(queued.status,'HELD_UNCERTAIN');
  const schedule=value(result,'refresher:shadow:v1').state;
  assert.equal(schedule.rows[0].slot,false);
  assert.equal(schedule.rows[0].personaUid,'persona-new-01');
  assert.equal(schedule.accounts.acct01.verifiedIdentity,false);
  assert.equal(schedule.inflight.length,0);
  assert.equal(schedule.nextWakeAt,0);
  assert.equal(schedule.nextAdmissionAt,0);
  assert.equal(incoming.stores.operations[0].value.status,'DISPATCH_POSSIBLE');
  assert.equal(value(incoming,'release:gen01').release.state,'APPROVED');
});
test('P56-04 X: crash at first dispatch retains independent external hold; stale/forged confirmation never restarts it',async()=>{
  const map=new Map();
  const storage={async get(k){return {[k]:map.get(k)};},
    async set(x){for(const [k,v] of Object.entries(x))map.set(k,structuredClone(v));}};
  const gate=()=>createRestoreGate(storage,{uuid:()=> 'f'.repeat(32),now:()=>1700000000000});
  const first=gate();
  const begun=await first.begin({planSha256:H,archiveSha256:K,
    destinationSha256:H,checkpointSha256:K,reviewedPlanSha256:H,
    checkpointTier:3,fresh:true,
    recovery:{mode:'replace',mappings:{one:'__create__'}}});
  const before=await first.advance({epoch:begun.epoch,revision:begun.revision,
    step:'donor-personas',group:'donor-personas',status:'BEFORE_DISPATCH',fingerprint:K});
  const possible=await first.advance({epoch:before.epoch,revision:before.revision,
    step:'donor-personas',group:'donor-personas',status:'DISPATCH_POSSIBLE',fingerprint:K});
  // Simulate process death and a new Core instance. The independent guard
  // remains active; a UI claim is never an independent readback.
  const restarted=gate();
  const observed=await restarted.inspect();
  assert.equal(observed.held,true);
  assert.equal(observed.controller,'INACTIVE');
  assert.equal(observed.groups[0].status,'DISPATCH_POSSIBLE');
  assert.equal(map.get(RESTORE_GUARD_KEY).epoch,begun.epoch);
  await assert.rejects(()=>restarted.advance({epoch:possible.epoch,
    revision:possible.revision,step:'donor-personas',
    group:'donor-personas',status:'OBSERVED',
    observation:{source:'UI_PROMISE',digest:K}}),/RESTORE_INDEPENDENT_READBACK_REQUIRED/);
  await assert.rejects(()=>restarted.advance({epoch:possible.epoch,
    revision:possible.revision,step:'donor-personas',
    group:'donor-personas',status:'BEFORE_DISPATCH'}),/RESTORE_STEP_TRANSITION_DENIED/);
  await assert.rejects(()=>restarted.advance({epoch:possible.epoch,
    revision:possible.revision-1,step:'donor-personas',
    group:'donor-personas',status:'OBSERVED',
    observation:{source:'INDEPENDENT_READBACK',digest:K}}),/RESTORE_STALE_GUARD/);
  assert.equal(safeRestoreReceipt(await restarted.read()).activation,'OFF');
  assert.equal(restoreReadiness({planSha256:H,plan:{archiveSha256:K,
    groups:[],fresh:true}},{verified:true,tier:3}).code,'RESTORE_FRESH_CONTROLLER_INACTIVE');
});


test('I17 restore invalidates source-transform consent, recurring qualification and reviewer trust while retaining provenance history',()=>{
  const incoming=state(),current={schema:1,stores:Object.fromEntries(DB_STORES.map(x=>[x,[]]))};
  for(const key of ['refresh-source:gen01','refresh-reviewer:v1','refresh-resource:v1'])
    incoming.stores.meta.push({key,value:serializeClone({record:{consent:{revision:1},qualification:{validUntil:999999},
      scheduleEnabled:true,publicKey:{kty:'EC'},lastReceipt:{source:'PCMS_REFRESH_MARKER',effectiveCurrentFingerprint:H}}})});
  const result=prepareRestoredCanonical({incoming,current,mode:'replace',uidRemap:{'persona-old-01':'persona-new-01'}});
  for(const key of ['refresh-source:gen01','refresh-reviewer:v1','refresh-resource:v1']){
    const r=value(result,key).record;assert.equal(r.restoredHistorical,true);assert.equal(r.consent,null);
    assert.equal(r.qualification,null);assert.equal(r.scheduleEnabled,false);assert.equal(r.revoked,true);
    assert.equal(r.lastReceipt.effectiveCurrentFingerprint,H);
  }
});
