// S05 canonical READY queue: local intent only, no provider/native/Git effects.
import {normalizeReadyWitness,planReadyObservation,planReadyHandoff} from './ready-planner.mjs';
const fail=code=>({ok:false,code});
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/;
const key=s=>'s05-ready:'+s;
const history=s=>'s05-ready-history:'+s+':';
const seen=(s,identity)=>'s05-ready-seen:'+s+':'+identity;
const view=r=>({slug:r.slug,repositoryId:r.repositoryId,revision:r.revision,
 active:r.active&&{identifier:r.active.identifier,state:r.active.state,
  inputFingerprint:r.active.inputFingerprint},
 desired:r.desired&&{identifier:r.desired.identifier,
  inputFingerprint:r.desired.inputFingerprint},hold:r.hold});
function tx(db,mode,fn){
 return new Promise((resolve,reject)=>{
  let t,out=fail('READY_TRANSACTION_INCOMPLETE');
  try{t=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
  catch{return reject(Error('READY_DB_UNAVAILABLE'));}
  t.oncomplete=()=>resolve(out);t.onabort=()=>reject(Error('READY_DB_ABORTED'));
  t.onerror=()=>{};
  try{fn(t,v=>{out=v;});}catch{try{t.abort();}catch{}}
 });
}
export function createReadyStore(db){
 function get(slug){
  if(!ID.test(slug||''))return Promise.resolve(fail('READY_SLUG_INVALID'));
  return tx(db,'readonly',(t,done)=>{
   t.objectStore('meta').get(key(slug)).onsuccess=e=>{
    const record=e.target.result?.record;
    done(record?{ok:true,record:structuredClone(record)}:fail('READY_NOT_OBSERVED'));
   };
  });
 }
 function observe(witness){
  if(!normalizeReadyWitness(witness).ok)
   return Promise.resolve(fail('READY_WITNESS_UNVERIFIED'));
  return tx(db,'readwrite',(t,done)=>{
   const m=t.objectStore('meta'),k=key(witness.slug);
   m.get(k).onsuccess=e=>{
    const old=e.target.result?.record;
    const checked=normalizeReadyWitness(witness);
    m.get(seen(witness.slug,checked.identity)).onsuccess=priorRequest=>{
      const prior=priorRequest.target.result?.witness;
      // A committed READY token can never gain new bytes or become a newly
      // eligible candidate by reverting main to an earlier observed token.
      if(prior&&(prior.inputFingerprint!==checked.inputFingerprint||
         prior.markerOid!==checked.markerOid||
         prior.declarationCommit!==checked.declarationCommit)){
        done(fail('READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE'));return;
      }
      const current=old?.desired?.identity===checked.identity||
        old?.active?.identity===checked.identity;
      if(prior&&!current){
        done({ok:true,changed:false,code:'READY_PREVIOUSLY_CONSUMED',
          record:view(old)});return;
      }
      const planned=planReadyObservation(old,witness);
      if(!planned.ok){done(planned);return;}
      if(!planned.changed){done({...planned,record:view(old)});return;}
      if(!prior)m.add({key:seen(witness.slug,checked.identity),
        witness:checked,firstSeenAt:Date.now()});
      if(old?.desired&&old.desired.identity!==planned.next.desired?.identity)
       m.add({key:history(witness.slug)+old.revision,
        previous:structuredClone(old.desired),reason:'SUPERSEDED_BEFORE_ADMISSION'});
      m.put({key:k,record:planned.next});
      t.objectStore('events').add({stage:'S05_READY_QUEUED',slug:witness.slug,
        identifier:witness.identifier,revision:planned.next.revision,providerEffects:'NONE'});
      done({ok:true,changed:true,code:planned.code,record:view(planned.next)});
    };
   };
  });
 }
 // The trusted internal source-owner must establish the required independent
 // facts before calling this; never expose handoff on an untrusted UI port.
 function handoff(slug,expectedRevision,proof){
  if(!ID.test(slug||'')||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   return Promise.resolve(fail('READY_COMMAND_INVALID'));
  return tx(db,'readwrite',(t,done)=>{
   const m=t.objectStore('meta');
   m.get(key(slug)).onsuccess=e=>{
    const old=e.target.result?.record;
    const planned=planReadyHandoff(old,expectedRevision,proof);
    if(!planned.ok){done(planned);return;}
    if(planned.retired)m.add({key:history(slug)+old.revision,
      previous:structuredClone(planned.retired),reason:'SAFE_HANDOFF'});
    m.put({key:key(slug),record:planned.next});
    t.objectStore('events').add({stage:'S05_READY_LOCAL_HANDOFF',slug,
      identifier:planned.next.active.identifier,revision:planned.next.revision,
      providerEffects:'NONE'});
    done({ok:true,code:planned.code,record:view(planned.next)});
   };
  });
 }
 function list({after='',limit=100}={}){
  if(typeof after!=='string'||after.length>100||
     !Number.isInteger(limit)||limit<1||limit>200)
   return Promise.resolve(fail('READY_PAGE_INVALID'));
  return tx(db,'readonly',(t,done)=>{
   const items=[];let more=false;
   t.objectStore('meta').openCursor().onsuccess=e=>{
    const c=e.target.result;
    if(!c){done({ok:true,items,nextCursor:more?items.at(-1)?.slug||null:null,more});return;}
    const name=typeof c.key==='string'&&c.key.startsWith('s05-ready:')?
      c.key.slice('s05-ready:'.length):null;
    if(name&&name>after&&c.value?.record){
      if(items.length<limit)items.push(view(c.value.record));else more=true;
    }
    c.continue();
   };
  });
 }
 return Object.freeze({get,observe,handoff,list});
}