// S03 canonical Git-owned prompt drafts and remote-effect ledger.
// No credential, extension port or Git operation is accepted by this module.
const key=id=>'s03-prompt:'+id;
const fail=code=>({ok:false,code});
const oid=s=>typeof s==='string'&&/^[0-9a-f]{40}$/.test(s);
const repoId=s=>typeof s==='string'&&/^[1-9][0-9]{0,19}$/.test(s);
const idOK=s=>typeof s==='string'&&/^s03_[0-9a-f]{32}$/.test(s);
const draftOK=s=>typeof s==='string'&&s.length>0&&s.length<=131072&&new TextEncoder().encode(s).length<=262144;
function tx(db,write,fn){
  return new Promise((resolve,reject)=>{
    let out=fail('PROMPT_TX_INCOMPLETE'),t;
    try{t=db.transaction(write?['meta','events']:['meta'],write?'readwrite':'readonly');}
    catch{return reject(Error('PROMPT_DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(out);t.onabort=()=>reject(Error('PROMPT_DB_ABORT'));
    const m=t.objectStore('meta');
    try{fn(m,t,v=>{out=v;});}catch{try{t.abort();}catch{}}
  });
}
export function createGitPromptStore(db){
  function read(id){
    if(!repoId(id))return Promise.resolve(fail('REPOSITORY_INVALID'));
    return tx(db,false,(m,t,done)=>m.get(key(id)).onsuccess=e=>{
      const row=e.target.result?.record;
      done(row?{ok:true,record:row}:fail('PROMPT_DRAFT_ABSENT'));
    });
  }
  function save({repositoryId,expectedRevision,baseOid,text,updatedAt}){
    if(!repoId(repositoryId)||!oid(baseOid)||!draftOK(text)||
       !Number.isSafeInteger(expectedRevision)||expectedRevision<0||
       !Number.isSafeInteger(updatedAt)||updatedAt<1)
      return Promise.resolve(fail('PROMPT_DRAFT_INVALID'));
    return tx(db,true,(m,t,done)=>m.get(key(repositoryId)).onsuccess=e=>{
      const prior=e.target.result?.record;
      if((prior?.revision||0)!==expectedRevision){done(fail('PROMPT_DRAFT_STALE'));return;}
      if(prior?.effect&&prior.effect.state==='DISPATCH_POSSIBLE'){
        done(fail('PROMPT_WRITE_UNCERTAIN'));return;
      }
      const record={repositoryId,revision:expectedRevision+1,text,
        baseOid,updatedAt,effect:null};
      m.put({key:key(repositoryId),record});
      t.objectStore('events').add({stage:'S03_PROMPT_DRAFT_SAVED',repositoryId,
        revision:record.revision,baseOid});
      done({ok:true,code:'PROMPT_DRAFT_SAVED',revision:record.revision});
    });
  }
  function prepare({repositoryId,revision,operationId,baseHead,baseOid,updatedAt}){
    if(!repoId(repositoryId)||!idOK(operationId)||!oid(baseHead)||!oid(baseOid)||
       !Number.isSafeInteger(revision)||revision<1||!Number.isSafeInteger(updatedAt)||updatedAt<1)
      return Promise.resolve(fail('PROMPT_INTENT_INVALID'));
    return tx(db,true,(m,t,done)=>m.get(key(repositoryId)).onsuccess=e=>{
      const record=e.target.result?.record;
      if(!record||record.revision!==revision||record.baseOid!==baseOid){
        done(fail('PROMPT_DRAFT_STALE'));return;
      }
      if(record.effect){done(fail('PROMPT_EFFECT_ALREADY_RECORDED'));return;}
      const effect={operationId,baseHead,baseOid,revision,state:'DISPATCH_POSSIBLE',
        updatedAt,possibleCommit:null,terminal:null};
      m.put({key:key(repositoryId),record:{...record,effect}});
      t.objectStore('events').add({stage:'S03_PROMPT_DISPATCH_POSSIBLE',
        repositoryId,operationId,baseHead,baseOid,revision});
      done({ok:true,effect});
    });
  }
  function reconcile({repositoryId,operationId,state,possibleCommit=null,receipt=null}){
    if(!repoId(repositoryId)||!idOK(operationId)||
      !['VERIFIED','UNCERTAIN','CONFLICT'].includes(state)||
      !(possibleCommit===null||oid(possibleCommit)))
      return Promise.resolve(fail('PROMPT_RECEIPT_INVALID'));
    return tx(db,true,(m,t,done)=>m.get(key(repositoryId)).onsuccess=e=>{
      const record=e.target.result?.record;
      if(!record||record.effect?.operationId!==operationId){
        done(fail('PROMPT_EFFECT_NOT_FOUND'));return;
      }
      const prior=record.effect;
      if(prior.state==='VERIFIED'||prior.state==='UNCERTAIN'||prior.state==='CONFLICT'){
        done(prior.state===state&&prior.possibleCommit===possibleCommit?
          {ok:true,code:'PROMPT_RECEIPT_DUPLICATE',effect:prior}:
          fail('PROMPT_EFFECT_ALREADY_TERMINAL'));return;
      }
      const effect={...prior,state,possibleCommit,terminal:receipt?.code||state};
      m.put({key:key(repositoryId),record:{...record,effect}});
      t.objectStore('events').add({stage:'S03_PROMPT_'+state,
        repositoryId,operationId,possibleCommit});
      done({ok:true,code:'PROMPT_'+state,effect});
    });
  }
  return Object.freeze({read,save,prepare,reconcile});
}
