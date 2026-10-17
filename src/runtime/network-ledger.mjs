// S01 canonical protected exit reservation. No native call, browser route mutation,
// remote probe or provider effect is allowed by this module. A donor-authorized
// fixed-probe result is required before requesting a canonical reservation.
import {fail,isSafeId} from './journal.mjs';

const KEY='network:s01:exit-ownership-v1';
const HEX=/^[a-f0-9]{64}$/;
const number=n=>Number.isSafeInteger(n)&&n>=0;
function ip4(raw) {
 if(typeof raw!=='string'||!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw))return null;
 const p=raw.split('.');
 if(!p.every(t=>String(Number(t))===t && Number(t)<=255))return null;
 const a=p.map(Number);
 // Never treat local/private/reserved network addresses as public exits.
 if(a[0]===0||a[0]===10||a[0]===127||a[0]>=224||
   (a[0]===100&&a[1]>=64&&a[1]<128)||
   (a[0]===169&&a[1]===254)||
   (a[0]===172&&a[1]>=16&&a[1]<=31)||
   (a[0]===192&&(a[1]===168||a[1]===0||a[1]===88&&a[2]===99||a[1]===0&&a[2]===2))||
   (a[0]===198&&(a[1]===18||a[1]===19||a[1]===51&&a[2]===100))||
   (a[0]===203&&a[1]===0&&a[2]===113))return null;
 return p.join('.');
}
function ip6(raw) {
 if(typeof raw!=='string'||raw.length>80||!raw.includes(':')||
   raw.includes('%')||raw.includes('[')||raw.includes(']'))return null;
 try{
   const host=new URL('http://['+raw+']/').hostname.toLowerCase();
   if(!host.startsWith('[')||!host.endsWith(']'))return null;
   const value=host.slice(1,-1);
   // Global unicast 2000::/3. Never treat v4-mapped, link-local, multicast,
   // unspecified or ULA as independent public IPv6 exit evidence.
   const first=parseInt(value.split(':')[0],16);
   // RFC 3849 documentation space is inside 2000::/3, but not a public exit.
   if(!Number.isInteger(first)||first<0x2000||first>0x3fff||
      value.startsWith('2001:db8:')||value==='2001:db8::')return null;
   return value;
 }catch{return null;}
}
export function normalizeProtectedExitProof(e,nowMs) {
 if(!e||!number(nowMs)||!isSafeId(e.evidenceId)||
   e.source!=='DONOR_FIXED_PROBE'||e.dns!=='VERIFIED_PROTECTED'||
   e.protection!=='READY'||!number(e.observedAtMs)||
   !number(e.validUntilMs)||e.observedAtMs>nowMs||
   e.validUntilMs<=nowMs||!isSafeId(e.nativeLifetimeId)||
   !isSafeId(e.routeId)||!isSafeId(e.contextId))
   return fail('PROTECTED_EVIDENCE_UNVERIFIED');
 const ipv4=e.ipv4?.state==='VERIFIED' ? ip4(e.ipv4.address) : null;
 if(!ipv4)return fail('IPV4_EVIDENCE_UNVERIFIED');
 let ipv6=null;
 if(e.ipv6?.state==='VERIFIED') {
   ipv6=ip6(e.ipv6.address);
   if(!ipv6)return fail('IPV6_EVIDENCE_UNVERIFIED');
 } else if(e.ipv6?.state!=='BLOCKED_VERIFIED'||
   e.ipv6?.verifiedBlocking!==true||!isSafeId(e.ipv6.blockEvidenceId))
   return fail('IPV6_EVIDENCE_UNVERIFIED');
 const exits=ipv6?[{family:'IPv4',address:ipv4},{family:'IPv6',address:ipv6}]:
   [{family:'IPv4',address:ipv4}];
 return {ok:true,evidenceId:e.evidenceId,routeId:e.routeId,contextId:e.contextId,
   nativeLifetimeId:e.nativeLifetimeId,validUntilMs:e.validUntilMs,
   ipv6Disposition:ipv6?'VERIFIED':'BLOCKED_VERIFIED',exits};
}
async function digest(exits){
 // GB-01 v1: explicit version and length framing, never an ambiguous
 // concatenation of variable-length family/address strings.
 const encoder=new TextEncoder(),items=exits.map(e=>e.family+':'+e.address).sort();
 const parts=[encoder.encode('PCMS-EXIT-SET-V1'+String.fromCharCode(0))];
 for(const item of items){
   const bytes=encoder.encode(item),size=new Uint8Array(4);
   new DataView(size.buffer).setUint32(0,bytes.length,false);
   parts.push(size,bytes);
 }
 const total=parts.reduce((n,a)=>n+a.length,0),bytes=new Uint8Array(total);
 let offset=0;
 for(const item of parts){bytes.set(item,offset);offset+=item.length;}
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function proposeExitReservation(input,{nowMs=Date.now}={}){
 if(!input||!isSafeId(input.reservationId)||!isSafeId(input.bindingId)||
    !isSafeId(input.accountId)||!isSafeId(input.personaUid)||
    !number(input.expectedLedgerRevision))
   return fail('RESERVATION_INPUT_INVALID');
 const checked=normalizeProtectedExitProof(input.evidence,nowMs());
 if(!checked.ok)return checked;
 return {ok:true,proposal:Object.freeze({
   accountId:input.accountId,bindingId:input.bindingId,
   reservationId:input.reservationId,personaUid:input.personaUid,
   routeId:checked.routeId,contextId:checked.contextId,
   evidenceId:checked.evidenceId,nativeLifetimeId:checked.nativeLifetimeId,
   validUntilMs:checked.validUntilMs,ipv6Disposition:checked.ipv6Disposition,
   exits:checked.exits,exitSetDigest:await digest(checked.exits),
   expectedLedgerRevision:input.expectedLedgerRevision
 })};
}
export function transitionExitReservation(existing,proposal){
 if(!proposal||!isSafeId(proposal.bindingId)||!isSafeId(proposal.accountId)||
   !isSafeId(proposal.reservationId)||!isSafeId(proposal.personaUid)||
   !Array.isArray(proposal.exits)||proposal.exits.length<1||proposal.exits.length>2||
   !HEX.test(proposal.exitSetDigest)||!number(proposal.expectedLedgerRevision))
   return fail('RESERVATION_INPUT_INVALID');
 if(proposal.exits[0]?.family!=='IPv4'||
    proposal.exits.length===2&&proposal.exits[1]?.family!=='IPv6'||
    proposal.ipv6Disposition!==(proposal.exits.length===2?'VERIFIED':'BLOCKED_VERIFIED'))
   return fail('RESERVATION_EXIT_INVALID');
 const prior=existing||{key:KEY,schema:1,revision:0,owners:{},reservations:{}};
 if(prior.schema!==1||prior.key!==KEY||!number(prior.revision)||
   !prior.owners||!prior.reservations||Array.isArray(prior.owners)||
   Array.isArray(prior.reservations))return fail('EXIT_LEDGER_CORRUPT');
 const already=prior.reservations[proposal.bindingId];
 if(already?.reservationId===proposal.reservationId){
   const same=already.accountId===proposal.accountId&&
     already.personaUid===proposal.personaUid&&
     already.exitSetDigest===proposal.exitSetDigest&&
     already.routeId===proposal.routeId&&already.contextId===proposal.contextId&&
     already.evidenceId===proposal.evidenceId;
   return same?{ok:true,ledger:prior,reservation:already,duplicate:true}:fail('RESERVATION_ID_REUSED');
 }
 if(prior.revision!==proposal.expectedLedgerRevision)return fail('STALE_EXIT_LEDGER');
 if(already)return fail('BINDING_RESERVATION_BUSY');
 for(const reservation of Object.values(prior.reservations)) {
   if(reservation?.personaUid===proposal.personaUid&&
      reservation.accountId!==proposal.accountId)
     return fail('PERSONA_RESERVED_BY_ANOTHER_ACCOUNT');
 }
 for(const exit of proposal.exits){
   if(!exit||!['IPv4','IPv6'].includes(exit.family)||
      (exit.family==='IPv4'&&ip4(exit.address)!==exit.address)||
      (exit.family==='IPv6'&&ip6(exit.address)!==exit.address))return fail('RESERVATION_EXIT_INVALID');
   const owner=prior.owners[exit.family+':'+exit.address];
   if(owner&&owner!==proposal.accountId)return fail('EXIT_HISTORICALLY_OWNED');
 }
 const allocationRevision=prior.revision+1;
 const reservation={accountId:proposal.accountId,bindingId:proposal.bindingId,
   personaUid:proposal.personaUid,reservationId:proposal.reservationId,
   routeId:proposal.routeId,contextId:proposal.contextId,
   evidenceId:proposal.evidenceId,nativeLifetimeId:proposal.nativeLifetimeId,
   exitSetDigest:proposal.exitSetDigest,
   ipv6Disposition:proposal.ipv6Disposition,validUntilMs:proposal.validUntilMs,
   allocationRevision,ledgerEpoch:'ledger_'+crypto.randomUUID().replaceAll('-','')};
 const owners={...prior.owners};
 for(const exit of proposal.exits)owners[exit.family+':'+exit.address]=proposal.accountId;
 const ledger={key:KEY,schema:1,revision:allocationRevision,owners,
   reservations:{...prior.reservations,[proposal.bindingId]:reservation}};
 return {ok:true,ledger,reservation,duplicate:false};
}
// Shared canonical PCMS IndexedDB meta object store; no read-modify-write
// outside a single readwrite transaction, and no awaits within the transaction.
export function createExitLedger(db){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Canonical IndexedDB required');
 function reserve(proposal){
   return new Promise((resolve,reject)=>{
     let result=fail('TRANSACTION_INCOMPLETE');
     let tx;
     try{tx=db.transaction('meta','readwrite');}
     catch{return reject(new Error('EXIT_LEDGER_TRANSACTION_FAILED'));}
     tx.oncomplete=()=>resolve(result);
     tx.onabort=()=>reject(new Error('EXIT_LEDGER_TRANSACTION_ABORTED'));
     tx.onerror=()=>{};
     const meta=tx.objectStore('meta');
     meta.get(KEY).onsuccess=event=>{
       result=transitionExitReservation(event.target.result,proposal);
       if(result.ok&&!result.duplicate)meta.put(result.ledger);
     };
   });
 }
 function inspect(){
   return new Promise((resolve,reject)=>{
     let tx;
     try{tx=db.transaction('meta','readonly');}
     catch{return reject(new Error('EXIT_LEDGER_TRANSACTION_FAILED'));}
     const request=tx.objectStore('meta').get(KEY);
     request.onsuccess=()=>{
       const data=request.result;
       if(!data)return resolve({ok:true,revision:0,ownedExits:0,reservations:0});
       if(data.schema!==1||!number(data.revision)||
          !data.owners||!data.reservations)return resolve(fail('EXIT_LEDGER_CORRUPT'));
       resolve({ok:true,revision:data.revision,
         ownedExits:Object.keys(data.owners).length,
         reservations:Object.keys(data.reservations).length});
     };
     request.onerror=()=>reject(new Error('EXIT_LEDGER_READ_FAILED'));
   });
 }
 return Object.freeze({reserve,inspect});
}
