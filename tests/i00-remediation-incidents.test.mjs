import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyShadow,reconcileShadow,advanceShadow,HOUR,MINUTE} from '../src/runtime/refresher-core.mjs';
const boot='browser_boot_01',hash='b'.repeat(64),at=100000;
function fleet(n,accounts){
  const inputs=Array.from({length:n},(_,i)=>({slug:'synthetic-'+String(i).padStart(4,'0'),
    accountId:'account_'+String(i%accounts).padStart(4,'0'),personaUid:'persona_'+i%accounts,
    bindingVersion:1,remoteId:'remote_'+String(i).padStart(8,'0'),
    ownerVerified:true,accountVerified:true,principalFingerprint:hash,
    releaseVerified:true,releaseFingerprint:hash,listing:'PUBLIC'}));
  const s=reconcileShadow(emptyShadow(),inputs).state;
  for(const r of s.rows){r.phase='ACTIVE';r.slot=true;}
  return s;
}
const receipt=(s,from,to,{bad=[],provider='HEALTHY',id})=>({source:'GUARDED_OPERATIONAL_INTERVAL',
  browserRunning:true,complete:true,id,bootId:boot,from,to,
  accounts:Object.entries(s.accounts).map(([accountId,a])=>({accountId,personaUid:a.personaUid,
    bindingVersion:a.bindingVersion,principalFingerprint:a.principalFingerprint,
    health:bad.includes(accountId)?'UNAVAILABLE':'HEALTHY',protected:true,sessionVerified:true})),
  witnesses:[0,1].map(i=>({accountId:'witness_'+i,domain:'independent_'+i,routeVerified:true,
    observedAt:to,result:provider==='HEALTHY'?'HEALTHY':'PROVIDER_UNAVAILABLE'}))});
let seq=0;
function step(s,from,to,opts={}){
  const x=advanceShadow(s,{now:to,bootId:boot,receipt:receipt(s,from,to,{...opts,id:'receipt_'+String(++seq).padStart(6,'0')})});
  assert.equal(x.ok,true);return x;
}
test('C-68/C-69 cross-feature: provider outage across 120 accounts is one incident, resolved on witnessed recovery',()=>{
  let s=fleet(240,120);
  const all=Object.keys(s.accounts);
  let x=step(s,at,at+2*HOUR,{provider:'OUTAGE',bad:all});s=x.state;
  const codes=x.changes.map(c=>c.code);
  assert.deepEqual(codes.filter(c=>c==='PROVIDER_OUTAGE'),['PROVIDER_OUTAGE']);
  assert.equal(codes.includes('ACCOUNT_GRACE_EXPIRED'),false,'outage never consumes per-account grace');
  assert.ok(s.rows.every(r=>r.activeRemaining===s.rows[0].activeRemaining),'whole fleet frozen equally, none starved');
  x=step(s,at+2*HOUR,at+3*HOUR,{provider:'OUTAGE',bad:all});s=x.state;
  assert.equal(x.changes.some(c=>c.code==='PROVIDER_OUTAGE'),false,'no repeat incident while ongoing');
  x=step(s,at+3*HOUR,at+4*HOUR);s=x.state;
  assert.deepEqual(x.changes.filter(c=>c.code.startsWith('PROVIDER')).map(c=>c.code),['PROVIDER_RECOVERED']);
});
test('C-69: an account route incident resolves only after an observed healthy route',()=>{
  let s=fleet(4,2);
  let x=step(s,at,at+2*HOUR,{bad:['account_0000']});s=x.state;
  assert.ok(x.changes.some(c=>c.code==='ACCOUNT_GRACE_EXPIRED'&&c.scopeId==='account_0000'));
  // Unknown health (no observation) is not recovery.
  x=advanceShadow(s,{now:at+3*HOUR,bootId:boot});s=x.state;
  assert.equal(x.changes.some(c=>c.code==='ACCOUNT_ROUTE_RECOVERED'),false);
  x=step(s,at+3*HOUR,at+3*HOUR+10*MINUTE);s=x.state;
  assert.deepEqual(x.changes.filter(c=>c.code==='ACCOUNT_ROUTE_RECOVERED').map(c=>c.scopeId),['account_0000']);
  x=step(s,at+3*HOUR+10*MINUTE,at+4*HOUR);
  assert.equal(x.changes.some(c=>c.code==='ACCOUNT_ROUTE_RECOVERED'),false,'recovery reported once');
});
