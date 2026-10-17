import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {normalizeProtectedExitProof,proposeExitReservation,transitionExitReservation} from '../src/runtime/network-ledger.mjs';
globalThis.crypto??=webcrypto;
const evidence=(v4='45.66.77.88',v6='2a00:1450:4001:828::200e')=>({
 evidenceId:'evidence_001',source:'DONOR_FIXED_PROBE',dns:'VERIFIED_PROTECTED',
 protection:'READY',observedAtMs:1000,validUntilMs:5000,
 routeId:'route_001',contextId:'context_001',nativeLifetimeId:'native_001',
 ipv4:{state:'VERIFIED',address:v4},ipv6:{state:'VERIFIED',address:v6}
});
const input=(id,account,ev,revision)=>({reservationId:'reservation_'+id,
 bindingId:'binding_'+id,accountId:'account_'+account,personaUid:'persona_'+id,
 evidence:ev,expectedLedgerRevision:revision});
test('S01 E01 D: IPv4 and compressed IPv6 canonical, repeat same reservation idempotent',async()=>{
 const e=evidence('45.66.77.88','2a00:1450:4001:0828:0000:0000:0000:200e');
 const p=await proposeExitReservation(input('one_001','one_001',e,0),{nowMs:()=>1200});
 assert.equal(p.ok,true);
 assert.equal(p.proposal.exits[1].address,'2a00:1450:4001:828::200e');
 const one=transitionExitReservation(null,p.proposal);
 assert.equal(one.ok,true);assert.equal(one.ledger.revision,1);
 const duplicate=transitionExitReservation(one.ledger,p.proposal);
 assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);
});
test('S01 E01 D: reject overlapping historic v4 OR v6, stale revision and wrong account Persona',async()=>{
 const one=(await proposeExitReservation(input('one_001','one_001',evidence(),0),
 {nowMs:()=>1200})).proposal;
 const state=transitionExitReservation(null,one).ledger;
 const sameV4=await proposeExitReservation(input('two_002','two_002',
  evidence('45.66.77.88','2a01:4f8:1c1c::1'),1),{nowMs:()=>1200});
 assert.equal(transitionExitReservation(state,sameV4.proposal).code,'EXIT_HISTORICALLY_OWNED');
 const sameV6=await proposeExitReservation(input('three_003','three_003',
  evidence('45.66.77.89','2a00:1450:4001:0828:0:0:0:200e'),1),{nowMs:()=>1200});
 assert.equal(transitionExitReservation(state,sameV6.proposal).code,'EXIT_HISTORICALLY_OWNED');
 const clear=await proposeExitReservation(input('four_004','four_004',
  evidence('45.66.77.90','2a01:4f8:1c1c::2'),0),{nowMs:()=>1200});
 assert.equal(transitionExitReservation(state,clear.proposal).code,'STALE_EXIT_LEDGER');
 assert.equal(Object.keys(state.owners).length,2);
});
test('S01 E01 D: missing v6 is not allowed without verified network block; invalid proof holds',async()=>{
 let e=evidence();e.ipv6={state:'UNKNOWN'};
 assert.equal(normalizeProtectedExitProof(e,1200).code,'IPV6_EVIDENCE_UNVERIFIED');
 e.ipv6={state:'BLOCKED_VERIFIED',verifiedBlocking:true,blockEvidenceId:'block_evidence_001'};
 assert.equal(normalizeProtectedExitProof(e,1200).ok,true);
 const p=await proposeExitReservation(input('four_004','four_004',e,0),{nowMs:()=>1200});
 assert.equal(p.ok,true);assert.equal(p.proposal.exits.length,1);
 assert.equal(normalizeProtectedExitProof({...e,validUntilMs:1200},1200).ok,false);
 assert.equal(normalizeProtectedExitProof({...e,dns:'UNKNOWN'},1200).ok,false);
 assert.equal(normalizeProtectedExitProof({...e,ipv4:{state:'VERIFIED',address:'192.168.0.1'}},1200).ok,false);
 assert.equal(normalizeProtectedExitProof({...e,ipv4:{state:'VERIFIED',address:'45.066.77.88'}},1200).ok,false);
 const mapped=evidence('45.66.77.88','::ffff:45.66.77.88');
 assert.equal(normalizeProtectedExitProof(mapped,1200).ok,false);
});
test('S01 E01 D: possible old effect never lets a new reservation ID replay the same binding',async()=>{
 const p=(await proposeExitReservation(input('one_001','one_001',evidence(),0),
 {nowMs:()=>1200})).proposal;
 const state=transitionExitReservation(null,p).ledger;
 const changed={...p,reservationId:'reservation_new_002',expectedLedgerRevision:1};
 assert.equal(transitionExitReservation(state,changed).code,'BINDING_RESERVATION_BUSY');
 assert.equal(transitionExitReservation(state,{...p,accountId:'account_wrong_003'}).code,'RESERVATION_ID_REUSED');
});

test('S01 GB01: documentation addresses are not public exits; malformed forged family arrays held',async()=>{
 for(const candidate of ['192.0.2.3','198.51.100.4','203.0.113.5']){
  assert.equal(normalizeProtectedExitProof(evidence(candidate,'2a01:4f8:1c1c::1'),1200).ok,false);
 }
 assert.equal(normalizeProtectedExitProof(evidence('45.66.77.88','2001:db8::2'),1200).ok,false);
 const p=(await proposeExitReservation(input('one_001','one_001',evidence(),0),
   {nowMs:()=>1200})).proposal;
 assert.equal(transitionExitReservation(null,{...p,exits:[p.exits[0],p.exits[0]]}).code,'RESERVATION_EXIT_INVALID');
 assert.equal(transitionExitReservation(null,{...p,exits:[...p.exits].reverse()}).code,'RESERVATION_EXIT_INVALID');
 assert.equal(transitionExitReservation(null,{...p,exits:p.exits.slice(0,1),
   ipv6Disposition:'VERIFIED'}).code,'RESERVATION_EXIT_INVALID');
});
