// S01 donor-side route pin. A Persona carrying a durable donor pcmsBindingId
// tag may use the network only while PCMS's canonical exit ledger holds an
// ACTIVE pin for that exact binding, Persona, container and route. This is a
// synchronous table read on every donor proxy/blocking decision; it is not a
// router, grant service or timer. It starts EMPTY on every background boot,
// so tagged Personas are blocked until the committed ledger has been read.
import {openCanonicalDatabase} from './journal.mjs';
import {createExitLedger} from './network-ledger.mjs';

const ID=/^[a-z0-9_-]{8,128}$/i;
let pins=new Map();
const holds=new Set();
let loaded=false,loading=null,generation=0,source=null;

function replace(list){
  const next=new Map();
  for(const p of list||[])
    if([p?.bindingId,p?.personaUid,p?.contextId,p?.routeId].every(v=>ID.test(v||'')))
      next.set(p.bindingId,Object.freeze({...p}));
  pins=next;loaded=true;
}
// Storage loss/replacement closes every PCMS pin immediately.
export function closeRoutePins(){pins=new Map();loaded=false;generation++;}

export function configureRoutePinSource(read){source=typeof read==='function'?read:null;}
async function defaultSource(){
  const db=await openCanonicalDatabase();
  db.addEventListener?.('versionchange',()=>{closeRoutePins();try{db.close();}catch{}});
  db.addEventListener?.('close',closeRoutePins);
  return createExitLedger(db).pins();
}
// Re-read committed ledger state. A read that started before a newer
// close/hold cannot publish older authority.
export function reloadRoutePins(){
  const mine=++generation;
  const run=(async()=>{
    try{
      const out=await (source||defaultSource)();
      if(mine!==generation)return false;
      if(out?.ok!==true){closeRoutePins();return false;}
      replace(out.pins);return true;
    }catch{if(mine===generation)closeRoutePins();return false;}
  })();
  loading=run.finally(()=>{if(loading===run)loading=null;});
  return run;
}
// Bounded wait used by the donor handlers for tagged Personas only.
export async function routePinsReady(timeoutMs=2000){
  if(loaded)return true;
  if(!loading)reloadRoutePins();
  await Promise.race([loading,new Promise(r=>setTimeout(r,timeoutMs))]);
  return loaded;
}
// Synchronous safety half: called BEFORE any ledger write that withdraws or
// changes a pin, and before any donor route mutation by PCMS.
export function holdRoutePin(bindingId){
  if(!ID.test(bindingId||''))throw new TypeError('Invalid binding');
  holds.add(bindingId);generation++;
}
export function releaseRoutePinHold(bindingId){holds.delete(bindingId);}

export function inspectRoutePin(profile){
  const bindingId=profile?.pcmsBindingId;
  if(typeof bindingId!=='string'||!bindingId)return {managed:false,allow:true};
  const pin=pins.get(bindingId);
  if(!loaded)return {managed:true,allow:false,reason:'PCMS_PINS_NOT_LOADED'};
  if(!pin||holds.has(bindingId))return {managed:true,allow:false,reason:'PCMS_ROUTE_NOT_PINNED'};
  if(pin.personaUid!==profile.personaUid||pin.contextId!==profile.containerId||
     pin.routeId!==profile.routeId||profile.managed!==true||profile.killSwitch===false)
    return {managed:true,allow:false,reason:'PCMS_ROUTE_PIN_MISMATCH'};
  return {managed:true,allow:true,reason:'PCMS_ROUTE_PINNED',routeId:pin.routeId};
}
export function routePinSummary(){return {loaded,active:pins.size,held:holds.size};}
