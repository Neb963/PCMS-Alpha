// S03 one-time initial Git import scope approval. Does not enqueue CREATE/RENAME
// and cannot override S04 independent owner/route/source/absence admission.
import {catalogScopeFingerprint} from './git-catalog.mjs';
const sha=/^[a-f0-9]{64}$/;
const id=/^[1-9][0-9]{0,19}$/;
const error=code=>({ok:false,code});
const key=repositoryId=>'s03-import-approval:'+repositoryId;
async function digest(value){
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function getImportScopeDigest(catalog){
  if(!catalog?.ok||catalog.complete!==true||!id.test(catalog.repositoryId||'')||
    !Array.isArray(catalog.generators))return null;
  return digest(JSON.stringify([catalog.repositoryId,catalog.repository,
    catalogScopeFingerprint(catalog.generators)]));
}
export function createImportApprovalStore(db){
  async function get(repositoryId){
    if(!id.test(repositoryId||''))return error('REPOSITORY_IDENTITY_UNVERIFIED');
    return new Promise((resolve,reject)=>{
      let output=error('IMPORT_UNAPPROVED'),tx;
      try{tx=db.transaction(['meta'],'readonly');}catch{return reject(Error('DB_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(output);tx.onabort=()=>reject(Error('DB_ABORT'));
      tx.objectStore('meta').get(key(repositoryId)).onsuccess=e=>{
        const row=e.target.result?.approval;
        output=row?{ok:true,approval:row}:output;
      };
    });
  }
  async function approve({repository,repositoryId,head,scopeDigest,
    recognizedSlugs,approvalAt,planDigest=null,targets=null,expectedRevision=0}){
    if(typeof repository!=='string'||repository.length>200||
      !id.test(repositoryId||'')||!/^[a-f0-9]{40}$/.test(head||'')||
      !sha.test(scopeDigest||'')||!Array.isArray(recognizedSlugs)||
      recognizedSlugs.some(s=>typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s))||
      new Set(recognizedSlugs).size!==recognizedSlugs.length||
      !Number.isSafeInteger(approvalAt)||approvalAt<1||
      (planDigest!==null&&(!sha.test(planDigest)||!Array.isArray(targets)||targets.length!==recognizedSlugs.length||
        targets.some((t,i)=>t?.slug!==recognizedSlugs[i])))||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)return error('IMPORT_INVALID');
    return new Promise((resolve,reject)=>{
      let result=error('IMPORT_UNAPPROVED'),tx;
      try{tx=db.transaction(['meta','events'],'readwrite');}
      catch{return reject(Error('DB_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('DB_ABORT'));
      const store=tx.objectStore('meta');
      store.get(key(repositoryId)).onsuccess=e=>{
        const previous=e.target.result?.approval;
        if(!previous&&expectedRevision!==0){result=error('IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');return;}
        if(previous&&previous.scopeDigest===scopeDigest&&previous.planDigest===planDigest){result={ok:true,code:'IMPORT_ALREADY_APPROVED',approval:previous};return;}
        if(previous&&!(planDigest&&Array.isArray(targets)&&expectedRevision===previous.revision)){
          result=previous.repository===repository&&previous.scopeDigest===scopeDigest?
            {ok:true,code:'IMPORT_ALREADY_APPROVED',approval:previous}:
            error('IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
          return;
        }
        const approval={repository,repositoryId,head,scopeDigest,
          recognizedSlugs,approvalAt,revision:(previous?.revision||0)+1,
          ...(planDigest?{planDigest,targets}:{}),source:'HUMAN_INITIAL_IMPORT_SCOPE',
          authorizedEffects:'NONE'};
        store.put({key:key(repositoryId),approval});
        tx.objectStore('events').add({stage:'S03_INITIAL_IMPORT_APPROVED',
          repositoryId,scopeDigest,head,recognizedCount:recognizedSlugs.length,
          providerEffects:'OFF'});
        result={ok:true,code:'IMPORT_SCOPE_APPROVED_NO_EFFECT',approval};
      };
    });
  }
  return Object.freeze({get,approve});
}
