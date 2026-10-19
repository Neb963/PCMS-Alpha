// S05 independently sourced, read-only admission diagnosis. No browser/native
// save, publication, Git ref write or unlocked provider capability lives here.
import {trustedExtensionPage} from './command-boundary.mjs';
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {stageReadyGitSource} from './ready-git-source.mjs';
import {evaluateStageSuccessor} from './ready-source-safety.mjs';
import {scanMainCatalog} from './git-catalog.mjs';
import {inspectReadyCandidate} from './catalog-declaration.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {exactSource} from './staging-core.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';
export const READY_OPERATOR_PORT='pcms-s05-ready-operator';
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const b64=text=>{
 let bin='';const raw=new TextEncoder().encode(text);
 for(let i=0;i<raw.length;i+=8192)
  bin+=String.fromCharCode(...raw.subarray(i,i+8192));
 return btoa(bin);
};
export function validateReadyOperator(api,sender,packet){
 if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
 if(!['ASSESS_READY','PREPARE_LOCAL'].includes(packet?.type)||!packet.params||
    typeof packet.params!=='object'||Array.isArray(packet.params)||
    Object.keys(packet).some(k=>!['type','params'].includes(k))||
    Object.keys(packet.params).some(k=>!['slug','expectedRevision'].includes(k))||
    !slug(packet.params.slug)||!Number.isSafeInteger(packet.params.expectedRevision)||
    packet.params.expectedRevision<1)return fail('INVALID_READY_COMMAND');
 return {ok:true};
}
function facts(db,name){
 return new Promise((resolve,reject)=>{
  let out=fail('READY_AUTHORITY_UNAVAILABLE'),t;
  try{t=db.transaction('meta','readonly');}catch{return reject(Error('READY_DB_UNAVAILABLE'));}
  t.oncomplete=()=>resolve(out);t.onabort=()=>reject(Error('READY_DB_ABORT'));
  const m=t.objectStore('meta');
  m.get('source-link:'+name).onsuccess=l=>{
   const link=l.target.result?.link;
   if(!link){out=fail('S04_SOURCE_ASSOCIATION_REQUIRED');return;}
   m.get('account:'+link.accountId).onsuccess=a=>{
    m.get('inventory:'+name).onsuccess=i=>{
     m.get('adoption:'+name).onsuccess=ad=>{
      m.get('stage:'+name).onsuccess=st=>{
       m.get('ai-job:'+name).onsuccess=ai=>{
        m.get('existing-update:'+name).onsuccess=ex=>{
         m.get('release:'+name).onsuccess=re=>{
          out={ok:true,link,account:a.target.result?.account,
           inventory:i.target.result?.generator,
           adoption:ad.target.result?.adoption,stage:st.target.result?.record,
           ai:ai.target.result?.job,existing:ex.target.result?.record,
           release:re.target.result?.release};
         };
        };
       };
      };
     };
    };
   };
  };
 });
}
export function createReadyOperator(api,{open=openCanonicalDatabase,
 guard=internalPcmsGuard,scan=scanMainCatalog,inspect=inspectReadyCandidate,
 stagingFactory=createStagingStore,
 native=p=>api.runtime.sendNativeMessage('local.pcms.backup_vault',p)}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let dbPromise;
 async function run(message,sender){
  const valid=validateReadyOperator(api,sender,message);
  if(!valid.ok)return valid;
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  const {slug:name,expectedRevision}=message.params;
  if(isI17Quarantined({slug:name}))return fail(I17_QUARANTINE_CODE);
  try{
   const db=await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;}));
   const initial=await createReadyStore(db).get(name);
   if(!initial.ok)return initial;
   const r=initial.record;
   if(r.revision!==expectedRevision)return fail('STALE_REVISION');
   const expected=r.desired||r.active;
   if(!expected)return fail('READY_NOT_QUEUED');
   const current=await facts(db,name);
   if(!current.ok)return current;
   const {link,account,inventory,adoption,stage,ai,existing,release}=current;
   if(link.folder!=='generators/'+name||link.slug!==name||
      link.accountId!==account?.accountId||
      link.personaUid!==account?.personaUid||
      link.bindingVersion!==account?.bindingVersion||
      link.remoteId!==inventory?.remoteId||
      inventory.ownerState!=='OBSERVED_OWNER'||
      account.state!=='VERIFIED'||
      account.identity?.source!=='GUARDED_SESSION_READBACK')
    return fail('S05_OWNER_ASSOCIATION_UNVERIFIED');
   const cfg=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
   if(cfg?.repositoryId!==r.repositoryId||cfg?.repository!=='Neb963/per-gens')
    return fail('S05_REPOSITORY_RECONNECT_REQUIRED');
   const secret=await native({action:'git.get',repositoryId:cfg.repositoryId});
   if(!secret?.ok||typeof secret.credential!=='string'||
      secret.credential.length<12||secret.credential.length>512)
    return fail('GIT_VAULT_UNAVAILABLE');
   const tree=await scan({repository:cfg.repository,token:secret.credential});
   if(!tree?.ok||!tree.complete||tree.repositoryId!==cfg.repositoryId)
    return fail('S05_GIT_MAIN_UNVERIFIED');
   const coherent=await inspect({repository:cfg.repository,
     token:secret.credential,pinnedHead:tree.head,
     slug:name,includeSourceBytes:message.type==='PREPARE_LOCAL'}
   const id=coherent?.legacy?
      'legacy-'+coherent.declarationCommit+'-'+coherent.markerOid:
      'rev-'+coherent?.token;
   if(!coherent?.ok||id!==expected.identifier||
      coherent.inputFingerprint!==expected.inputFingerprint)
    return fail('S05_READY_REVISED_OR_REVOKED');
   const g=guard();
   if(!g?.getSafeRouteReadiness||!g?.observeReadOnly)
    return fail('S05_PROTECTED_GUARD_UNAVAILABLE');
   const before=await g.getSafeRouteReadiness(account.personaUid);
   if(!before?.ready||before.personaUid!==account.personaUid)
    return fail(before?.code||'S05_ROUTE_UNVERIFIED');
   const observed=await g.observeReadOnly(account.personaUid,false,name);
   const origin=observed?.original;
   if(!observed?.ok||
      observed.principalFingerprint!==account.identity.principalFingerprint||
      origin?.remotePublicId!==link.remoteId||
      origin?.ownerResult!=='IS_OWNER'||
      !['UNLISTED','PUBLIC'].includes(origin.visibility)||
      typeof origin.pjs!=='string'||typeof origin.html!=='string'||
      !Array.isArray(origin.assets))
    return fail('S05_INDEPENDENT_OWNER_SOURCE_UNVERIFIED');
   const baseline=await exactSource([
    {path:'main.pjs',base64:b64(origin.pjs)},
    {path:'index.html',base64:b64(origin.html)},...origin.assets]);
   if(!baseline.ok)return baseline;
   const after=await g.getSafeRouteReadiness(account.personaUid);
   const again=await createReadyStore(db).get(name);
   if(!after?.ready||after.cookieStoreId!==before.cookieStoreId||
      after.routeId!==before.routeId||
      (await sentinel.inspect()).held||
      !again.ok||again.record.revision!==r.revision)
    return fail('S05_CONTEXT_CHANGED_DURING_READBACK');
   const pending=existing&&['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN',
     'STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN',
     'RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN'].includes(existing.state);
   const savedKnown=stage?.state==='SOURCE_VERIFIED'&&
      (ai?.finalSource?.fingerprint||stage.candidate?.fingerprint)===baseline.fingerprint;
   const privateEmpty=origin.visibility==='UNLISTED'&&
     baseline.files.length===2&&baseline.files.every(f=>f.size===0);
   const protectedOriginal=adoption?.originalCheckpoint?.qualified===true&&
     adoption.archiveState==='ARCHIVED_GIT_CONFIRMED';
   const code=pending?'S05_UNCERTAIN_WRITER_HELD':
      origin.visibility==='PUBLIC'?'S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED':
      stage&&!savedKnown?'S05_SAVED_SOURCE_DRIFT':
      !privateEmpty&&!savedKnown&&!protectedOriginal?'S05_RECOVERABLE_BASELINE_REQUIRED':
      'S05_EDITOR_AND_NATIVE_ADMISSION_REQUIRED';
   return {ok:true,code,slug:name,revision:r.revision,
     readyIdentifier:expected.identifier,providerVisibility:origin.visibility,
     savedFingerprint:baseline.fingerprint,providerEffects:'NONE',
     action:'ASSESS_ONLY'};
  }catch{return fail('S05_ASSESSMENT_UNAVAILABLE');}
 }
 function register(){
  api.runtime.onConnect.addListener(port=>{
   if(port?.name!==READY_OPERATOR_PORT)return;
   let busy=false;
   port.onMessage.addListener(message=>{
    if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
    busy=true;
    Promise.resolve(run(message,port.sender)).then(r=>{
      try{port.postMessage(r);}catch{}
    }).catch(()=>{try{port.postMessage(fail('S05_ASSESSMENT_UNAVAILABLE'));}catch{}})
      .finally(()=>{busy=false;});
   });
  });
 }
 return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createReadyOperator(browser).register();
