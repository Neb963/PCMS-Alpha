// S01 canonical historical exit ledger and per-binding route pin. No native
// call, browser route mutation, probe or provider effect occurs here. Exits
// come only from donor route-probe evidence; a caller cannot assert a digest.
import {fail,isSafeId} from './journal.mjs';

export const LEDGER_KEY='network:s01:exit-ownership-v1';
const KEY=LEDGER_KEY;
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

const PIN=new Set(['PENDING','ACTIVE','HELD']);
const HISTORY=16;
// One parser for donor evidence. IPv4 must be an observed public Mullvad exit.
// IPv6 is either an observed public exit or a POSITIVE relay report that the
// IPv6 network is unreachable; an absent/failed IPv6 probe is UNKNOWN and holds.
export function normalizeRouteEvidence(e) {
 if(!e||e.ok!==true||e.source!=='DONOR_ROUTE_PROBE'||!isSafeId(e.evidenceId)||
    !isSafeId(e.routeId)||e.dns!=='VERIFIED_PROTECTED'||!number(e.observedAtMs))
   return fail('PROTECTED_EVIDENCE_UNVERIFIED');
 const v4=e.ipv4?.state==='OBSERVED'?ip4(e.ipv4.address):null;
 if(!v4)return fail('IPV4_EVIDENCE_UNVERIFIED');
 let v6=null;
 if(e.ipv6?.state==='OBSERVED'){
   v6=ip6(e.ipv6.address);
   if(!v6)return fail('IPV6_EVIDENCE_UNVERIFIED');
 }else if(e.ipv6?.state!=='BLOCKED_VERIFIED'||e.ipv6.basis!=='RELAY_REPORTED_IPV6_UNREACHABLE')
   return fail('IPV6_EVIDENCE_UNVERIFIED');
 const exits=[{family:'IPv4',address:v4},...(v6?[{family:'IPv6',address:v6}]:[])];
 return {ok:true,evidenceId:e.evidenceId,routeId:e.routeId,observedAtMs:e.observedAtMs,
   ipv6Disposition:v6?'OBSERVED':'BLOCKED_VERIFIED',exits};
}
export async function exitSetDigest(exits){return digest(exits);}
function emptyLedger(){return {key:KEY,schema:2,revision:0,owners:{},bindings:{}};}
// Schema 1 (pre-amendment S01) owners are preserved; its never-admitted
// reservations carry no network authority and are not converted into pins.
export function readLedger(raw){
 if(raw==null)return {ok:true,ledger:emptyLedger()};
 if(raw.key!==KEY||!raw.owners||typeof raw.owners!=='object'||Array.isArray(raw.owners)||
    !number(raw.revision))return fail('EXIT_LEDGER_CORRUPT');
 if(raw.schema===1)return {ok:true,ledger:{key:KEY,schema:2,revision:raw.revision,
   owners:{...raw.owners},bindings:{}}};
 if(raw.schema!==2||!raw.bindings||typeof raw.bindings!=='object'||Array.isArray(raw.bindings))
   return fail('EXIT_LEDGER_CORRUPT');
 for(const b of Object.values(raw.bindings))
   if(!b||!PIN.has(b.pin)||!isSafeId(b.accountId)||!isSafeId(b.bindingId))
     return fail('EXIT_LEDGER_CORRUPT');
 return {ok:true,ledger:raw};
}
function conflict(ledger,accountId,exits){
 for(const exit of exits){
   const owner=ledger.owners[exit.family+':'+exit.address];
   if(owner&&owner!==accountId)return true;
 }
 return false;
}
function claim(owners,accountId,exits){
 const next={...owners};
 for(const exit of exits)next[exit.family+':'+exit.address]=accountId;
 return next;
}
function bump(ledger,bindings,owners=ledger.owners){
 return {...ledger,revision:ledger.revision+1,owners,bindings};
}
// Reserve a probed candidate for one account binding. Historical owners are
// never released: a different account's exit is EXIT_HISTORICALLY_OWNED even
// after archive or route change. A route already pinned for another binding
// is never shared. The binding's previous route enters its history.
export function reserveCandidate(raw,p){
 const read=readLedger(raw);if(!read.ok)return read;
 const ledger=read.ledger;
 if(!p||![p.accountId,p.bindingId,p.personaUid,p.contextId,p.routeId,p.evidenceId].every(isSafeId)||
    !Array.isArray(p.exits)||!p.exits.length||!HEX.test(p.exitSetDigest||''))
   return fail('RESERVATION_INPUT_INVALID');
 for(const b of Object.values(ledger.bindings)){
   if(b.bindingId===p.bindingId)continue;
   if(b.accountId===p.accountId)return fail('ACCOUNT_HAS_OTHER_BINDING');
   if(b.personaUid===p.personaUid||b.contextId===p.contextId)return fail('PERSONA_BOUND_TO_OTHER_ACCOUNT');
   if(b.routeId===p.routeId)return fail('ROUTE_ASSIGNED_TO_OTHER_ACCOUNT');
 }
 const prior=ledger.bindings[p.bindingId];
 // A binding moves to a different Persona only as an explicit replacement of
 // a missing Persona, never while its pin is live.
 if(prior&&(prior.accountId!==p.accountId||(prior.personaUid!==p.personaUid&&
    (p.replacesPersona!==true||prior.pin==='ACTIVE'))))
   return fail('BINDING_IDENTITY_CONFLICT');
 if(conflict(ledger,p.accountId,p.exits))return fail('EXIT_HISTORICALLY_OWNED');
 const history=prior?[...(prior.history||[]),
   {routeId:prior.routeId,exitSetDigest:prior.exitSetDigest,pin:prior.pin}].slice(-HISTORY):[];
 const binding={accountId:p.accountId,bindingId:p.bindingId,personaUid:p.personaUid,
   contextId:p.contextId,routeId:p.routeId,exits:p.exits,exitSetDigest:p.exitSetDigest,
   ipv6Disposition:p.ipv6Disposition,evidenceId:p.evidenceId,verifiedAtMs:p.observedAtMs,
   pin:'PENDING',holdCode:null,history};
 return {ok:true,binding,ledger:bump(ledger,{...ledger.bindings,[p.bindingId]:binding},
   claim(ledger.owners,p.accountId,p.exits))};
}
// Observation of the ASSIGNED Persona route. Unowned new exits are claimed
// for this account; an exit owned by another account holds the pin. The
// pin becomes ACTIVE only from PENDING/ACTIVE on the exact reserved route.
export function observeAssigned(raw,{bindingId,routeId,exits,exitSetDigest,observedAtMs,activate=false}={}){
 const read=readLedger(raw);if(!read.ok)return read;
 const ledger=read.ledger,b=ledger.bindings[bindingId];
 if(!b)return fail('BINDING_RESERVATION_ABSENT');
 if(!Array.isArray(exits)||!exits.length||!HEX.test(exitSetDigest||'')||!number(observedAtMs))
   return fail('RESERVATION_INPUT_INVALID');
 if(b.routeId!==routeId){
   const held={...b,pin:'HELD',holdCode:'ROUTE_CHANGED_OUTSIDE_PCMS'};
   return {ok:false,code:'ROUTE_CHANGED_OUTSIDE_PCMS',binding:held,
     ledger:bump(ledger,{...ledger.bindings,[bindingId]:held})};
 }
 if(conflict(ledger,b.accountId,exits)){
   const held={...b,pin:'HELD',holdCode:'EXIT_DRIFT_CONFLICT'};
   return {ok:false,code:'EXIT_DRIFT_CONFLICT',binding:held,
     ledger:bump(ledger,{...ledger.bindings,[bindingId]:held})};
 }
 if(b.pin==='HELD'&&!activate)return {ok:false,code:b.holdCode||'ROUTE_HELD',binding:b,ledger};
 const next={...b,exits,exitSetDigest,verifiedAtMs:observedAtMs,
   pin:activate||b.pin==='ACTIVE'?'ACTIVE':b.pin,holdCode:null};
 return {ok:true,binding:next,ledger:bump(ledger,{...ledger.bindings,[bindingId]:next},
   claim(ledger.owners,b.accountId,exits))};
}
export function holdBinding(raw,bindingId,code){
 const read=readLedger(raw);if(!read.ok)return read;
 const b=read.ledger.bindings[bindingId];
 if(!b)return fail('BINDING_RESERVATION_ABSENT');
 const held={...b,pin:'HELD',holdCode:/^[A-Z0-9_]{3,64}$/.test(code)?code:'ROUTE_HELD'};
 return {ok:true,binding:held,ledger:bump(read.ledger,{...read.ledger.bindings,[bindingId]:held})};
}
export function activePins(raw){
 const read=readLedger(raw);if(!read.ok)return read;
 return {ok:true,pins:Object.values(read.ledger.bindings).filter(b=>b.pin==='ACTIVE')
   .map(b=>({bindingId:b.bindingId,personaUid:b.personaUid,contextId:b.contextId,routeId:b.routeId}))};
}
// Shared canonical PCMS IndexedDB meta object store; each change is one
// readwrite transaction with no await inside it.
export function createExitLedger(db){
 if(!db||typeof db.transaction!=='function')throw new TypeError('Canonical IndexedDB required');
 function change(fn){
   return new Promise((resolve,reject)=>{
     let result=fail('TRANSACTION_INCOMPLETE'),tx;
     try{tx=db.transaction('meta','readwrite');}
     catch{return reject(new Error('EXIT_LEDGER_TRANSACTION_FAILED'));}
     tx.oncomplete=()=>resolve(result);
     tx.onabort=()=>reject(new Error('EXIT_LEDGER_TRANSACTION_ABORTED'));
     tx.onerror=()=>{};
     const meta=tx.objectStore('meta');
     meta.get(KEY).onsuccess=event=>{
       result=fn(event.target.result);
       if(result?.ledger&&result.ledger!==event.target.result&&
          result.ledger.revision!==event.target.result?.revision)meta.put(result.ledger);
       if(result)result={...result,ledger:undefined};
     };
   });
 }
 function read(){
   return new Promise((resolve,reject)=>{
     let tx;
     try{tx=db.transaction('meta','readonly');}
     catch{return reject(new Error('EXIT_LEDGER_TRANSACTION_FAILED'));}
     const request=tx.objectStore('meta').get(KEY);
     request.onsuccess=()=>resolve(readLedger(request.result));
     request.onerror=()=>reject(new Error('EXIT_LEDGER_READ_FAILED'));
   });
 }
 async function inspect(){
   const out=await read();
   if(!out.ok)return out;
   const bindings=Object.values(out.ledger.bindings);
   return {ok:true,revision:out.ledger.revision,ownedExits:Object.keys(out.ledger.owners).length,
     reservations:bindings.length,activePins:bindings.filter(b=>b.pin==='ACTIVE').length};
 }
 async function binding(bindingId){
   const out=await read();
   if(!out.ok)return out;
   const b=out.ledger.bindings[bindingId];
   return b?{ok:true,binding:b}:fail('BINDING_RESERVATION_ABSENT');
 }
 return Object.freeze({
   reserve:p=>change(raw=>reserveCandidate(raw,p)),
   observe:p=>change(raw=>observeAssigned(raw,p)),
   hold:(bindingId,code)=>change(raw=>holdBinding(raw,bindingId,code)),
   read,inspect,binding,
   pins:async()=>{const out=await read();return out.ok?activePins(out.ledger):out;}
 });
}
