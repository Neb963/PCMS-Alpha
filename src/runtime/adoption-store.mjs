import {fail} from './journal.mjs';
import {validateAdoptionIntent,continuity,publicAdoption} from './adoption.mjs';
const key=slug=>'adoption:'+slug;
function tx(db,mode,cb){
  return new Promise((resolve,reject)=>{
    let result=fail('ADOPTION_TRANSACTION_INCOMPLETE'),t;
    try{t=db.transaction(['meta','events'],mode);}catch{return reject(Error('IDB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(result);
    t.onabort=()=>reject(Error('IDB_ABORTED'));
    t.onerror=()=>{};
    try{cb(t,v=>{result=v;});}catch{try{t.abort();}catch{}}
  });
}
export function createAdoptionStore(db){
  function get(slug){
    return tx(db,'readonly',(t,done)=>{
      t.objectStore('meta').get(key(slug)).onsuccess=e=>{
        const rec=e.target.result?.adoption;
        done(rec?publicAdoption(rec):fail('ADOPTION_NOT_FOUND'));
      };
    });
  }
  function list(){
    return tx(db,'readonly',(t,done)=>{
      const items=[];let truncated=false;
      t.objectStore('meta').openCursor().onsuccess=e=>{
        const c=e.target.result;
        if(!c){done({ok:true,items,truncated});return;}
        if(typeof c.key==='string'&&c.key.startsWith('adoption:')&&c.value?.adoption){
          if(items.length<1000)items.push(publicAdoption(c.value.adoption));
          else truncated=true;
        }
        c.continue();
      };
    });
  }
  function adopt({slug,expectedRevision,explicitPublicConsent},original){
    if(!original?.ok||original.source!=='INDEPENDENT_FULL_BYTE_READBACK')
      return Promise.resolve(fail('ORIGINAL_SOURCE_UNVERIFIED'));
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get('inventory:'+slug).onsuccess=ev=>{
        const row=ev.target.result?.generator;
        if(!row){done(fail('TARGET_NOT_OBSERVED'));return;}
        m.get('account:'+row.accountId).onsuccess=av=>{
          const account=av.target.result?.account;
          const eligible=validateAdoptionIntent(row,account,{slug,expectedRevision,explicitPublicConsent});
          if(!eligible.ok){done(eligible);return;}
          m.get('source-link:'+slug).onsuccess=lv=>{
            const link=lv.target.result?.link;
            if(link&&(link.accountId!==row.accountId||link.remoteId!==row.remoteId||
               link.bindingVersion!==row.bindingVersion)){
              done(fail('SOURCE_ASSOCIATION_CONFLICT'));return;
            }
            m.get(key(slug)).onsuccess=old=>{
              const prior=old.target.result?.adoption;
              const candidate={slug,accountId:row.accountId,personaUid:row.personaUid,
                bindingVersion:row.bindingVersion,accountRevision:account.revision,
                inventoryRevision:row.revision,remotePublicId:original.remotePublicId};
              const cont=continuity(prior,candidate);
              if(!cont.ok){done(cont);return;}
              if(prior){done({...publicAdoption(prior),duplicate:true});return;}
              const rec={...candidate,revision:1,archived:false,
                visibility:row.visibility,consent:row.visibility==='PUBLIC'?
                  'OPERATOR_EXPLICIT_PUBLIC':'AUTO_UNLISTED',
                management:row.visibility==='PUBLIC'?
                  'CONSENTED_ARCHIVE_PENDING':'DISCOVERED_ARCHIVE_PENDING',
                original,archiveState:'ARCHIVE_PENDING',createdAt:original.observedAt};
              m.add({key:key(slug),adoption:rec});
              t.objectStore('events').add({stage:'ORIGINAL_CAPTURED',slug,
                accountId:row.accountId,originalFingerprint:original.fingerprint,
                files:original.files.length,visibility:row.visibility});
              done({...publicAdoption(rec),duplicate:false});
            };
          };
        };
      };
    });
  }
  function archiveLocal(slug,expectedRevision){
    return tx(db,'readwrite',(t,done)=>{
      const m=t.objectStore('meta');
      m.get(key(slug)).onsuccess=e=>{
        const a=e.target.result?.adoption;
        if(!a){done(fail('ADOPTION_NOT_FOUND'));return;}
        if(a.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        if(a.archived){done(publicAdoption(a));return;}
        const next={...a,revision:a.revision+1,archived:true,management:'ARCHIVED_TOMBSTONE'};
        m.put({key:key(slug),adoption:next});
        t.objectStore('events').add({stage:'ADOPTION_ARCHIVED_TOMBSTONE',slug,
          originalFingerprint:a.original.fingerprint});
        done(publicAdoption(next));
      };
    });
  }
  return Object.freeze({get,list,adopt,archiveLocal});
}
