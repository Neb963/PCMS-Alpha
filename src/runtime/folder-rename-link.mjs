import {auditSourceClosureRows} from './backup-source-closure.mjs';
// Complete a human-chosen same-resource rename from fresh independent live
// bytes and exact main source. Keeps old source/history; never renames remotely.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createGitCredentialResolver} from './git-credential.mjs';
import {inspectGitSource} from './git-source.mjs';
import {inspectCurrentImportItem} from './creation-import-authority.mjs';
import {verifyOriginal} from './adoption.mjs';
const fail=code=>({ok:false,code});
export async function preserveRenameBaseline(db,facts,original){
 if(original?.source!=='INDEPENDENT_FULL_BYTE_READBACK'||original.ok!==true)return fail('ORIGINAL_SOURCE_UNVERIFIED');
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([facts.row.accountId,facts.row.remoteId,facts.row.personaUid,facts.row.bindingVersion,original.fingerprint]))))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const key='rename-original:'+digest;
 return new Promise((resolve,reject)=>{const tx=db.transaction(['meta','events'],'readwrite'),m=tx.objectStore('meta');let out=fail('RENAME_BASELINE_UNAVAILABLE');
  tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(Error('BASELINE_TRANSACTION_ABORTED'));
  m.get('inventory:'+facts.row.slug).onsuccess=e=>{const row=e.target.result?.generator;
   if(!row||row.revision!==facts.row.revision||row.remoteId!==original.remotePublicId||row.accountId!==facts.account.accountId)return;
   m.get('account:'+facts.account.accountId).onsuccess=e=>{const a=e.target.result?.account;if(a?.state!=='VERIFIED'||a.revision!==facts.account.revision||a.identity?.principalFingerprint!==facts.account.identity.principalFingerprint)return;
    m.get(key).onsuccess=e=>{if(!e.target.result){m.add({key,record:{slug:row.slug,accountId:row.accountId,remoteId:row.remoteId,personaUid:row.personaUid,bindingVersion:row.bindingVersion,
      principalFingerprint:a.identity.principalFingerprint,original}});tx.objectStore('events').add({stage:'EXISTING_RENAME_BASELINE_SAVED',slug:row.slug,fingerprint:original.fingerprint});}
     out={ok:true,baselineKey:key};
    };
   };
  };
 });
}
export async function verifyRenameBaseline(db,attempt){
 try{const value=await new Promise((resolve,reject)=>{const tx=db.transaction(['meta'],'readonly');let row;tx.oncomplete=()=>resolve(row);tx.onabort=reject;tx.objectStore('meta').get(attempt.baselineKey).onsuccess=e=>{row=e.target.result}});
  const r=value?.record;if(!r||r.remoteId!==attempt.remoteId||r.accountId!==attempt.accountId||r.personaUid!==attempt.personaUid||r.bindingVersion!==attempt.bindingVersion||
   r.principalFingerprint!==attempt.principalFingerprint||r.original?.fingerprint!==attempt.sourceFingerprint)return fail('RENAME_BASELINE_UNAVAILABLE');
  await auditSourceClosureRows([{key:attempt.baselineKey,value}]);return {ok:true};
 }catch{return fail('RENAME_BASELINE_UNAVAILABLE')}
}
export function createRenameGitVerifier(api,{credential=createGitCredentialResolver(api),inspectItem=inspectCurrentImportItem}={}){
 return async review=>{try{const secret=await credential();if(!secret.ok)return secret;if(secret.repositoryId!==review.repositoryId||secret.repository!=='Neb963/per-gens')return fail('GIT_IDENTITY_CHANGED');
  const item=await inspectItem({repository:secret.repository,repositoryId:secret.repositoryId,token:secret.token,slug:review.newSlug,absentSlug:review.oldSlug});
  return item.ok&&item.oldAbsent===true&&item.folderTreeOid===review.newTreeOid&&item.markerOid===review.markerOid?{ok:true}:fail('RENAME_GIT_IDENTITY_CHANGED');
 }catch{return fail('RENAME_GIT_IDENTITY_CHANGED')}};
}
export function createRenamedIdentityLinker(api,{open=openCanonicalDatabase,guard=internalPcmsGuard,
 credential=createGitCredentialResolver(api),inspect=inspectGitSource,inspectItem=inspectCurrentImportItem}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 return async function link(attempt){
  if(attempt?.state!=='REMOTE_RENAME_VERIFIED_LINK_PENDING')return fail('RENAME_READBACK_REQUIRED');
  try{if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   const db=await open();let account;
   await new Promise((resolve,reject)=>{const tx=db.transaction(['meta'],'readonly');tx.oncomplete=resolve;tx.onabort=reject;
    tx.objectStore('meta').get('account:'+attempt.accountId).onsuccess=e=>{account=e.target.result?.account};});
   if(account?.state!=='VERIFIED'||account.personaUid!==attempt.personaUid||account.bindingVersion!==attempt.bindingVersion||
      account.identity?.source!=='GUARDED_SESSION_READBACK'||account.identity.principalFingerprint!==attempt.principalFingerprint)return fail('RENAMED_ACCOUNT_OR_REMOTE_ID_CHANGED');
   const g=guard(),before=await g.getSafeRouteReadiness(attempt.personaUid);if(!before?.ready)return fail('PROTECTED_ROUTE_UNVERIFIED');
   const packet=await g.observeReadOnly(attempt.personaUid,false,attempt.newSlug);
   const original=await verifyOriginal(packet,{slug:attempt.newSlug,remoteId:attempt.remoteId,accountId:attempt.accountId,
     personaUid:attempt.personaUid,bindingVersion:attempt.bindingVersion,visibility:attempt.visibility},account);
   const after=await g.getSafeRouteReadiness(attempt.personaUid);
   if(!original.ok||original.remotePublicId!==attempt.remoteId||original.fingerprint!==attempt.sourceFingerprint||
      after?.ready!==true||after.routeId!==before.routeId||after.cookieStoreId!==before.cookieStoreId)return fail('RENAMED_OWNER_OR_SOURCE_UNVERIFIED');
   const secret=await credential();if(!secret.ok)return secret;
   if(secret.repositoryId!==attempt.repositoryId||secret.repository!=='Neb963/per-gens')return fail('GIT_IDENTITY_CHANGED');
   const item=await inspectItem({repository:secret.repository,repositoryId:secret.repositoryId,token:secret.token,slug:attempt.newSlug});
   if(!item.ok||item.folderTreeOid!==attempt.folderTreeOid||item.markerOid!==attempt.markerOid)return fail('RENAME_GIT_IDENTITY_CHANGED');
   const source=await inspect({token:secret.token,folder:'generators/'+attempt.newSlug});
   if(!source.ok||source.head!==item.head)return fail('RENAME_GIT_IDENTITY_CHANGED');
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   return await new Promise((resolve,reject)=>{const tx=db.transaction(['meta','events'],'readwrite'),m=tx.objectStore('meta');let result=fail('RENAMED_ASSOCIATION_OR_OWNER_UNVERIFIED');
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('LINK_TRANSACTION_ABORTED'));
    m.get('account:'+attempt.accountId).onsuccess=e=>{const a=e.target.result?.account;
     if(a?.state!=='VERIFIED'||a.revision!==account.revision||a.personaUid!==attempt.personaUid||a.bindingVersion!==attempt.bindingVersion||a.identity?.principalFingerprint!==attempt.principalFingerprint)return;
     m.get('inventory:'+attempt.oldSlug).onsuccess=e=>{const old=e.target.result?.generator;
      if(!old||old.remoteId!==attempt.remoteId||old.accountId!==attempt.accountId||old.bindingVersion!==attempt.bindingVersion)return;
      m.get('inventory:'+attempt.newSlug).onsuccess=e=>{const current=e.target.result?.generator;
       if(current&&(current.accountId!==attempt.accountId||current.bindingVersion!==attempt.bindingVersion||
          ![attempt.remoteId,'slug-'+attempt.newSlug].includes(current.remoteId)))return;
       m.get('source-link:'+attempt.newSlug).onsuccess=e=>{const previous=e.target.result?.link;
        if(previous&&(previous.remoteId!==attempt.remoteId||previous.accountId!==attempt.accountId||previous.folder!=='generators/'+attempt.newSlug))return;
        const row={...old,...current,slug:attempt.newSlug,renamedFrom:attempt.oldSlug,remoteId:attempt.remoteId,
          accountId:attempt.accountId,personaUid:attempt.personaUid,bindingVersion:attempt.bindingVersion,accountRevision:a.revision,
          ownerState:'OBSERVED_OWNER',visibility:attempt.visibility,lastObservedAt:Date.now(),revision:(current?.revision||0)+1,
          identitySchema:2,identityBasis:'INDEPENDENT_FULL_BYTE_READBACK',identityAliases:['slug-'+attempt.newSlug],
          identityProof:{fingerprint:original.fingerprint},identityHold:null};
        m.put({key:'inventory:'+attempt.newSlug,generator:row});
        m.put({key:'inventory:'+attempt.oldSlug,generator:{...old,ownerState:'UNOBSERVED',renamedTo:attempt.newSlug,revision:old.revision+1}});
        m.put({key:'source-link:'+attempt.newSlug,link:{slug:attempt.newSlug,folder:'generators/'+attempt.newSlug,
          remoteId:attempt.remoteId,accountId:attempt.accountId,personaUid:attempt.personaUid,bindingVersion:attempt.bindingVersion,
          mainHead:source.head,fingerprint:source.fingerprint,testingSha:source.testingSha,readyAtInspection:source.ready,
          source:'INDEPENDENT_EXISTING_RENAME_LINK',revision:(previous?.revision||0)+1}});
        tx.objectStore('events').add({stage:'EXISTING_RENAME_IDENTITY_LINKED',oldSlug:attempt.oldSlug,newSlug:attempt.newSlug,remoteId:attempt.remoteId});
        result={ok:true,source:'INDEPENDENT_EXISTING_RENAME_LINK'};
       };
      };
     };
    };
   });
  }catch{return fail('RENAME_SOURCE_LINK_UNAVAILABLE')}
 };
}
