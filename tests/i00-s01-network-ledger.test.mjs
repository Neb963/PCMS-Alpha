import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {normalizeRouteEvidence,reserveCandidate,observeAssigned,holdBinding,activePins,
  readLedger,exitSetDigest,LEDGER_KEY} from '../src/runtime/network-ledger.mjs';
globalThis.crypto??=webcrypto;
const ev=(v4,v6={state:'BLOCKED_VERIFIED',basis:'RELAY_REPORTED_IPV6_UNREACHABLE'})=>({ok:true,
  source:'DONOR_ROUTE_PROBE',evidenceId:'evidence_0001',routeId:'mullvad-0001',
  ipv4:{state:'OBSERVED',address:v4},ipv6:typeof v6==='string'?{state:'OBSERVED',address:v6}:v6,
  dns:'VERIFIED_PROTECTED',observedAtMs:1000});
async function proposal(account,binding,route,e){
  const n=normalizeRouteEvidence(e);assert.equal(n.ok,true,JSON.stringify(n));
  return {accountId:'account_'+account,bindingId:'binding_'+binding,personaUid:'persona_'+binding,
    contextId:'context_'+binding,routeId:route,exits:n.exits,exitSetDigest:await exitSetDigest(n.exits),
    evidenceId:n.evidenceId,observedAtMs:n.observedAtMs,ipv6Disposition:n.ipv6Disposition};
}
test('S01 E-01 D: evidence parser canonicalizes IPv6 and rejects private, documentation, mapped and unknown families',()=>{
  const v6=normalizeRouteEvidence(ev('45.66.77.88','2A00:1450:4001:0828:0000:0000:0000:200E'));
  assert.equal(v6.exits[1].address,'2a00:1450:4001:828::200e');
  for(const bad of ['10.1.2.3','192.168.0.1','100.64.0.1','192.0.2.3','198.51.100.4','203.0.113.5','45.066.77.88'])
    assert.equal(normalizeRouteEvidence(ev(bad)).ok,false,bad);
  for(const bad of ['2001:db8::2','::ffff:45.66.77.88','fe80::1','fd00::1'])
    assert.equal(normalizeRouteEvidence(ev('45.66.77.88',bad)).code,'IPV6_EVIDENCE_UNVERIFIED',bad);
  assert.equal(normalizeRouteEvidence(ev('45.66.77.88',{state:'UNKNOWN'})).code,'IPV6_EVIDENCE_UNVERIFIED');
  assert.equal(normalizeRouteEvidence(ev('45.66.77.88',{state:'BLOCKED_VERIFIED',basis:'IPV4_SUCCEEDED'})).code,
    'IPV6_EVIDENCE_UNVERIFIED','IPv4 success is never IPv6 blocking evidence');
  assert.equal(normalizeRouteEvidence({...ev('45.66.77.88'),dns:'UNKNOWN'}).ok,false);
  assert.equal(normalizeRouteEvidence({...ev('45.66.77.88'),source:'CALLER'}).ok,false);
});
test('S01 C-05/C-06 D: v4 OR v6 overlap, shared route and shared Persona are rejected; own history reusable',async()=>{
  const a=await proposal('a0001','a0001','mullvad-0001',ev('45.66.77.88','2a01:4f8::1'));
  const one=reserveCandidate(null,a);assert.equal(one.ok,true);
  const v4=await proposal('b0002','b0002','mullvad-0002',ev('45.66.77.88','2a01:4f8::2'));
  assert.equal(reserveCandidate(one.ledger,v4).code,'EXIT_HISTORICALLY_OWNED');
  const v6=await proposal('b0002','b0002','mullvad-0002',ev('45.66.77.89','2a01:4f8:0::1'));
  assert.equal(reserveCandidate(one.ledger,v6).code,'EXIT_HISTORICALLY_OWNED');
  const route=await proposal('b0002','b0002','mullvad-0001',ev('45.66.77.90'));
  assert.equal(reserveCandidate(one.ledger,route).code,'ROUTE_ASSIGNED_TO_OTHER_ACCOUNT');
  const persona={...await proposal('b0002','b0002','mullvad-0003',ev('45.66.77.91')),personaUid:'persona_a0001'};
  assert.equal(reserveCandidate(one.ledger,persona).code,'PERSONA_BOUND_TO_OTHER_ACCOUNT');
  // Same account may return to its own historical exit after a route change.
  const moved=reserveCandidate(one.ledger,await proposal('a0001','a0001','mullvad-0009',ev('45.66.77.92')));
  const back=reserveCandidate(moved.ledger,await proposal('a0001','a0001','mullvad-0001',ev('45.66.77.88','2a01:4f8::1')));
  assert.equal(back.ok,true);
  assert.equal(back.ledger.owners['IPv4:45.66.77.92'],'account_a0001','history never released');
});
test('S01 D: pins are ACTIVE only after assigned verification; drift and route change hold',async()=>{
  const a=await proposal('a0001','a0001','mullvad-0001',ev('45.66.77.88'));
  let l=reserveCandidate(null,a).ledger;
  assert.deepEqual(activePins(l).pins,[]);
  const ok=observeAssigned(l,{bindingId:a.bindingId,routeId:a.routeId,exits:a.exits,
    exitSetDigest:a.exitSetDigest,observedAtMs:2000,activate:true});
  assert.equal(ok.ok,true);l=ok.ledger;
  assert.equal(activePins(l).pins.length,1);
  const b=await proposal('b0002','b0002','mullvad-0002',ev('45.66.77.99'));
  l=reserveCandidate(l,b).ledger;
  const drift=observeAssigned(l,{bindingId:b.bindingId,routeId:b.routeId,exits:a.exits,
    exitSetDigest:a.exitSetDigest,observedAtMs:3000,activate:true});
  assert.equal(drift.code,'EXIT_DRIFT_CONFLICT');assert.equal(drift.binding.pin,'HELD');
  const changed=observeAssigned(l,{bindingId:a.bindingId,routeId:'mullvad-other',exits:a.exits,
    exitSetDigest:a.exitSetDigest,observedAtMs:3000});
  assert.equal(changed.code,'ROUTE_CHANGED_OUTSIDE_PCMS');
  assert.equal(holdBinding(l,a.bindingId,'ROUTE_REPAIR').binding.pin,'HELD');
});
test('S01 migration D: pre-amendment schema-1 owners are preserved; corrupt ledger fails closed',()=>{
  const old={key:LEDGER_KEY,schema:1,revision:4,owners:{'IPv4:45.66.77.88':'account_x0001'},
    reservations:{binding_x:{}}};
  const read=readLedger(old);
  assert.equal(read.ok,true);
  assert.deepEqual(read.ledger.owners,old.owners);
  assert.deepEqual(read.ledger.bindings,{},'never-admitted schema-1 reservations grant nothing');
  assert.equal(readLedger({key:LEDGER_KEY,schema:2,revision:1,owners:[],bindings:{}}).code,'EXIT_LEDGER_CORRUPT');
  assert.equal(readLedger({key:LEDGER_KEY,schema:2,revision:1,owners:{},bindings:{x:{pin:'OPEN'}}}).code,'EXIT_LEDGER_CORRUPT');
});
