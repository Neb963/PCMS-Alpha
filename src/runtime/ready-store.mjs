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
 restoredHistorical:r.restoredHistorical===true,desired:r.desired&&{identifier:r.desired.identifier,
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
      if(!prior)m.put({key:seen(witness.slug,checked.identity),
        witness:checked,firstSeenAt:Date.now()});
      if(old?.desired&&old.desired.identity!==planned.next.desired?.identity)
       m.put({key:history(witness.slug)+old.revision,
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
    if(planned.retired)m.put({key:history(slug)+old.revision,
      previous:structuredClone(planned.retired),reason:'SAFE_HANDOFF'});
    m.put({key:key(slug),record:planned.next});
    t.objectStore('events').add({stage:'S05_READY_LOCAL_HANDOFF',slug,
      identifier:planned.next.active.identifier,revision:planned.next.revision,
      providerEffects:'NONE'});
    done({ok:true,code:planned.code,record:view(planned.next)});
   };
  });
 }
 // A coherent complete main scan says this recognized folder is NOT_READY.
 // Retain lineage and source history; revoke advancement, never infer remote
 // deletion or free a possible in-flight provider/native writer.
 function holdNotReady({slug,repositoryId,head}){
  if(!ID.test(slug||'')||!/^[1-9][0-9]{0,19}$/.test(repositoryId||'')||
     !/^[a-f0-9]{40}$/.test(head||''))
   return Promise.resolve(fail('READY_HOLD_PROOF_INVALID'));
  return tx(db,'readwrite',(t,done)=>{
   const m=t.objectStore('meta');
   m.get(key(slug)).onsuccess=e=>{
     const old=e.target.result?.record;
     if(!old){done({ok:true,changed:false,code:'READY_NEVER_ADMITTED'});return;}
     if(old.repositoryId!==repositoryId){
       done(fail('READY_REPOSITORY_ASSOCIATION_CHANGED'));return;
     }
     if(old.hold==='READY_REVOKED_NOT_READY'){
       done({ok:true,changed:false,code:'READY_ALREADY_HELD',
         record:view(old)});return;
     }
     const next={...old,revision:old.revision+1,
       hold:'READY_REVOKED_NOT_READY',revokedAtHead:head};
     m.put({key:key(slug),record:next});
     t.objectStore('events').add({stage:'S05_READY_REVOKED_NOT_READY',
       slug,repositoryId,head,revision:next.revision,providerEffects:'NONE'});
     done({ok:true,changed:true,code:'READY_REVOKED_NOT_READY',
       record:view(next)});
   };
  });
 }
 // Local operator pause is not a cancellation or native Stop. It preserves
 // any possible prior effect, READY history and source bytes without granting
 // permission for new provider/native development.
 function pause(slug,expectedRevision){
  if(!ID.test(slug||'')||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   return Promise.resolve(fail('READY_COMMAND_INVALID'));
  return tx(db,'readwrite',(t,done)=>{
   const m=t.objectStore('meta');
   m.get(key(slug)).onsuccess=e=>{
     const old=e.target.result?.record;
     if(!old){done(fail('READY_NOT_OBSERVED'));return;}
     if(old.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
     if(old.hold==='READY_REVOKED_NOT_READY')
       {done(fail('READY_REVOKED_NOT_READY'));return;}
     if(old.hold==='OPERATOR_PAUSED')
       {done({ok:true,changed:false,code:'READY_ALREADY_PAUSED',record:view(old)});return;}
     const next={...old,revision:old.revision+1,hold:'OPERATOR_PAUSED',
       pausedAt:Date.now()};
     m.put({key:key(slug),record:next});
     t.objectStore('events').add({stage:'S05_READY_OPERATOR_PAUSED',
       slug,revision:next.revision,providerEffects:'NONE'});
     done({ok:true,changed:true,code:'READY_OPERATOR_PAUSED',record:view(next)});
   };
  });
 }
 // Resume only after the privileged caller has independently re-pinned Git
 // main to the exact candidate. A stale UI revision never clears the hold.
 function resume(slug,expectedRevision,{identifier,inputFingerprint}={}){
  if(!ID.test(slug||'')||!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
     typeof identifier!=='string'||!/^[a-f0-9]{64}$/.test(inputFingerprint||''))
   return Promise.resolve(fail('READY_COMMAND_INVALID'));
  return tx(db,'readwrite',(t,done)=>{
   const m=t.objectStore('meta');
   m.get(key(slug)).onsuccess=e=>{
     const old=e.target.result?.record;
     if(!old){done(fail('READY_NOT_OBSERVED'));return;}
     if(old.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
     if(old.hold!=='OPERATOR_PAUSED')
       {done(fail('READY_RESUME_NOT_PAUSED'));return;}
     const current=old.desired||old.active;
     if(!current||current.identifier!==identifier||
        current.inputFingerprint!==inputFingerprint)
       {done(fail('READY_RESUME_CANDIDATE_CHANGED'));return;}
     const next={...old,revision:old.revision+1,hold:
       old.active&&old.desired?'WAIT_FOR_SAFE_SOURCE_HANDOFF':null,
       pausedAt:null};
     m.put({key:key(slug),record:next});
     t.objectStore('events').add({stage:'S05_READY_OPERATOR_RESUMED',
       slug,revision:next.revision,providerEffects:'NONE'});
     done({ok:true,changed:true,code:'READY_OPERATOR_RESUMED',record:view(next)});
   };
  });
 }
 function list({after='',limit=100,query='',status='ALL'}={}){
  if(typeof query!=='string'||query.length>100||
     !['ALL','NEEDS_ACTION','RUNNING','WAITING','COMPLETED'].includes(status))
    return Promise.resolve(fail('READY_PAGE_INVALID'));
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
    if(name&&name>after&&name.toLowerCase().includes(query.toLowerCase())&&c.value?.record){
      const item=view(c.value.record);
      const held=Boolean(item.hold&&item.hold!=='NONE');
      const active=Boolean(item.active),desired=Boolean(item.desired);
      const matches=status==='ALL'||status==='NEEDS_ACTION'&&(held||desired)||
        status==='RUNNING'&&false||
        status==='WAITING'&&!held&&(active||desired)||
        status==='COMPLETED'&&!held&&!active&&!desired;
      if(matches){
        if(items.length<limit)items.push(item);else more=true;
      }
    }
    c.continue();
   };
  });
 }
 return Object.freeze({get,observe,handoff,holdNotReady,pause,resume,list});
}