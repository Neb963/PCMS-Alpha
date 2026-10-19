// S05 independently sourced, read-only admission diagnosis. No browser/native
// save, publication, Git ref write or unlocked provider capability lives here.
import {trustedExtensionPage} from './command-boundary.mjs';
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createS06ExceptionStore} from './s06-exception-review.mjs';
import {sealedS06OutputProof} from './s06-output-proof.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
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
 if(!['ASSESS_READY','PREPARE_LOCAL','PAUSE_READY','RESUME_READY'].includes(packet?.type)||!packet.params||
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
   if(r.hold==='READY_REVOKED_NOT_READY')return fail('READY_REVOKED_NOT_READY');
   if(message.type==='PAUSE_READY')
     return createReadyStore(db).pause(name,r.revision);
   if(r.hold==='OPERATOR_PAUSED'&&message.type!=='RESUME_READY')
     return fail('READY_OPERATOR_PAUSED');
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
      inventory.slug!==name||
      inventory.accountId!==account.accountId||
      inventory.personaUid!==account.personaUid||
      inventory.bindingVersion!==account.bindingVersion||
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
   const [confirmed,job,exception]=await Promise.all([
     createWritebackStore(db).getFull(name),
     createAiStore(db).getJobFull(name),
     createS06ExceptionStore(db).getFull(name)]);
   const output=sealedS06OutputProof({ready:initial,stage,
     writeback:confirmed,job,exception});
   const coherent=await inspect({repository:cfg.repository,
     token:secret.credential,pinnedHead:tree.head,
     slug:name,includeSourceBytes:message.type==='PREPARE_LOCAL',
     ...(output.ok?{outputProof:output.outputProof}:{})});
   const id=coherent?.legacy?
      'legacy-'+coherent.declarationCommit+'-'+coherent.markerOid:
      'rev-'+coherent?.token;
   if(!coherent?.ok||coherent.code!=='READY_COHERENT_INPUT_PINNED'||
      id!==expected.identifier||
      coherent.inputFingerprint!==expected.inputFingerprint)
    return fail('S05_READY_REVISED_OR_REVOKED');
   if(coherent.outputAttested&&message.type==='PREPARE_LOCAL')
     return fail('S06_ATTRIBUTED_OUTPUT_CANNOT_RESTAGE_OLD_READY_INPUT');
   if(message.type==='RESUME_READY')
     return createReadyStore(db).resume(name,r.revision,{
       identifier:id,inputFingerprint:coherent.inputFingerprint});
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
   if(message.type==='PREPARE_LOCAL'){
     // A nonempty, still-private source can be a later S05 development F.
     // It must have a retained SOURCE_VERIFIED predecessor and its exact
     // independently read saved F; unlike a PUBLIC target it needs no
     // additional unlist. The I09 actor delegates its nonempty replacement
     // to the fixed I13 native source adapter under the same donor lease.
     if(origin.visibility==='PUBLIC')
       return fail('S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED');
     if(!privateEmpty&&!(savedKnown&&stage?.state==='SOURCE_VERIFIED'))
       return fail('S05_NONEMPTY_TARGET_REQUIRES_RECOVERABLE_PREDECESSOR');
     if(pending||['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN',
         'RECOVERY_HOLD','PUBLISHING','PUBLISH_UNCERTAIN'].includes(release?.state))
       return fail('S05_UNCERTAIN_WRITER_HELD');
     // INITIAL private-empty admission cannot overtake a separate I13 source
     // actor or a release even if that actor has not armed a remote effect.
     // The later unified UPDATE flow will reconcile these explicitly.
     if(existing||release||(!stage&&ai))
       return fail('S05_COMPETING_SOURCE_ACTOR_RECONCILE');
     if(link.source!=='S04_INDEPENDENT_NOT_READY_ASSOCIATION'||
        inventory.management!=='MANAGED_CREATED'||
        !['SOURCE_PENDING','SOURCE_VERIFIED'].includes(inventory.source)||
        inventory.visibility!=='UNLISTED')
       return fail('S05_S04_PRIVATE_OWNER_REQUIRED');
     const compiled=await stageReadyGitSource({catalog:tree,coherent,
       ready:{active:expected,desired:null},slug:name,
       repositoryId:cfg.repositoryId});
     if(!compiled.ok)return compiled;
     // An interrupted retry is idempotent only for the exact same source,
     // owner and still-unmodified stage. In particular, HELD_UNCERTAIN is
     // never a successful local pin even when the READY token is unchanged.
     if(!r.desired&&stage?.readyIdentifier===expected.identifier){
       if(!['PINNED','SOURCE_VERIFIED'].includes(stage.state)||
          stage.readyInputFingerprint!==expected.inputFingerprint||
          stage.candidate?.fingerprint!==compiled.candidate.fingerprint||
          stage.previous?.fingerprint!==baseline.fingerprint||
          stage.accountId!==account.accountId||
          stage.personaUid!==account.personaUid||
          stage.remotePublicId!==inventory.remoteId||
          stage.bindingVersion!==account.bindingVersion)
         return fail('S05_PINNED_STAGE_RECONCILIATION_REQUIRED');
       return {ok:true,code:'S05_ALREADY_PINNED_LOCAL',
         revision:r.revision,stageRevision:stage.revision,
         providerEffects:'NONE'};
     }
     const permitted=evaluateStageSuccessor({prior:stage,previous:baseline,
       job:ai,existing,release,
       ready:{active:expected,desired:null},
       source:{...compiled.source,accountId:account.accountId,
         remotePublicId:inventory.remoteId,personaUid:account.personaUid,
         bindingVersion:account.bindingVersion}});
     if(!permitted.ok)return permitted;
     // Browser-local no-editor proof is independently guarded by donor lease;
     // no remote/collaboration claim is made. The I09 native script repeats
     // source, saved-state, Yjs peer and human-editor guards at dispatch.
     if(typeof g.inspectSourceEditorIdle!=='function')
       return fail('S05_EDITOR_IDLE_PROOF_UNAVAILABLE');
     const editor=await g.inspectSourceEditorIdle(account.personaUid,name);
     if(!editor?.ok||editor.clean!==true||
        editor.source!=='GUARDED_NO_LOCAL_EDITOR')
       return fail(editor?.code||'S05_EDITOR_CONFLICT');
     const verifiedAgain=await g.getSafeRouteReadiness(account.personaUid);
     const stable=await createReadyStore(db).get(name);
     if(!verifiedAgain?.ready||
        verifiedAgain.cookieStoreId!==before.cookieStoreId||
        verifiedAgain.routeId!==before.routeId||
        !stable.ok||stable.record.revision!==r.revision||
        (await sentinel.inspect()).held)
       return fail('S05_ADMISSION_CONTEXT_CHANGED');
     const isNativeIdle=!ai||(
       ai.native?.state==='CHAT1_OBSERVED_IDLE'||
       ai.native?.state==='CHAT2_OBSERVED_IDLE'||
       (ai.state==='PENDING_NATIVE_SESSION'&&!ai.native));
     if(!isNativeIdle)return fail('S05_NATIVE_NOT_IDLE');
     const readyStore=createReadyStore(db);
     let admitted={ok:true,record:stable.record};
     if(r.desired){
       admitted=await readyStore.handoff(name,r.revision,{
         source:'TRUSTED_S05_ADMISSION_BOUNDARY',
         accountOwnerVerified:true,protectedRouteReady:true,
         completeRecoverableBaseline:true,humanEditorClean:true,
         noUncertainWriter:true,writerIdle:true,nativeIdle:true,
         providerEffectResolved:true,approvalEffectResolved:true
       });
       if(!admitted.ok)return admitted;
     }
     const actual=await readyStore.get(name);
     if(!actual.ok||actual.record.desired||
        actual.record.active?.identifier!==expected.identifier||
        actual.record.active?.inputFingerprint!==expected.inputFingerprint)
       return fail('S05_READY_CHANGED_AFTER_HANDOFF');
     const pinned=await stagingFactory(db).pin({slug:name,
       candidate:compiled.candidate,previous:baseline,source:compiled.source,
       eligibility:{ok:true,account,item:inventory,link},
       nonce:crypto.randomUUID().replaceAll('-','')});
     if(!pinned.ok)return pinned;
     return {ok:true,code:'S05_LOCAL_STAGE_PINNED',
       revision:actual.record.revision,stageRevision:pinned.revision,
       readyIdentifier:expected.identifier,providerEffects:'NONE',
       next:'PROVIDER_STAGE_REMAINS_SEPARATELY_GATED'};
   }
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
 return Object.freeze({run,runTrusted:async message=>{
   if(!['ASSESS_READY','PREPARE_LOCAL','PAUSE_READY','RESUME_READY'].includes(message?.type))
     return fail('INVALID_INTERNAL_READY_ACTION');
   return run(message,{id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')});
 },register});
}
if(typeof browser!=='undefined')createReadyOperator(browser).register();
