// S03 immutable external declaration provenance observations. Not deployment
// admission, publication or permission to write. Prevent reused READY tokens
// from laundering different complete source inputs through later scans.
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const RID=/^[1-9][0-9]{0,19}$/;
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const KEY=(id,slug,identifier)=>'s03-ready:'+id+':'+slug+':'+identifier;
const fail=code=>({ok:false,code});
export function createDeclarationStore(db){
  async function witness({repositoryId,slug,coherent}){
    const c=coherent;
    if(!RID.test(repositoryId||'')||!SLUG.test(slug||'')||
       c?.ok!==true||c.code!=='READY_COHERENT_INPUT_PINNED'||
       !SHA40.test(c.declarationCommit||'')||!SHA40.test(c.markerOid||'')||
       !SHA64.test(c.inputFingerprint||'')||
       !(c.legacy===true||typeof c.token==='string'&&/^[A-Za-z0-9_.:-]{8,128}$/.test(c.token)))
      return fail('DECLARATION_WITNESS_INVALID');
    const id=c.legacy?'legacy-'+c.declarationCommit+'-'+c.markerOid:'rev-'+c.token;
    return new Promise((resolve,reject)=>{
      let out=fail('DECLARATION_TX_UNAVAILABLE'),tx;
      try{tx=db.transaction(['meta','events'],'readwrite');}
      catch{return reject(Error('DECLARATION_DB_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(Error('DECLARATION_DB_ABORT'));
      const meta=tx.objectStore('meta'),key=KEY(repositoryId,slug,id);
      meta.get(key).onsuccess=e=>{
        const existing=e.target.result?.record;
        if(existing){
          out=existing.inputFingerprint===c.inputFingerprint &&
            existing.declarationCommit===c.declarationCommit &&
            existing.markerOid===c.markerOid?
            {ok:true,code:'DECLARATION_ALREADY_OBSERVED',record:existing}:
            fail('READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
          return;
        }
        const record={repositoryId,slug,identifier:id,declarationCommit:c.declarationCommit,
          markerOid:c.markerOid,inputFingerprint:c.inputFingerprint,
          testingOid:c.optionalTesting?.oid||null,
          source:'PINNED_MAIN_READ_ONLY_WITNESS',authorizedEffects:'NONE'};
        meta.put({key,record});
        tx.objectStore('events').add({stage:'S03_READY_INPUT_OBSERVED',repositoryId,slug,
          declarationCommit:c.declarationCommit,markerOid:c.markerOid,
          inputFingerprint:c.inputFingerprint,providerEffects:'OFF'});
        out={ok:true,code:'DECLARATION_OBSERVED_NO_EFFECT',record};
      };
    });
  }
  return Object.freeze({witness});
}
