// Complete a human-chosen same-resource rename from fresh independent live
// bytes and exact main source. Keeps old source/history; never renames remotely.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createGitCredentialResolver} from './git-credential.mjs';
import {inspectGitSource} from './git-source.mjs';
import {inspectCurrentImportItem} from './creation-import-authority.mjs';
import {verifyOriginal} from './adoption.mjs';
const fail=code=>({ok:false,code});
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
