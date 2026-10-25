import {checkpointed} from './work-checkpoint.mjs';
// I05: explicit read-only Git inspection and canonical one-to-one association.
// Credentials are used only for an operator-triggered call, never persisted.
import {openCanonicalDatabase, createRestoreSentinel, fail} from './journal.mjs';
import {createGitCredentialResolver} from './git-credential.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {inspectGitSource,readVerifiedGitFile,safeSourcePath, compareGitSource, safeFolder} from './git-source.mjs';
export const SOURCE_PORT='pcms-i05-source';
const slugOK=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const fpOK=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const shaOK=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
export function validateSourceMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let encoded;try{encoded=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(typeof encoded!=='string'||encoded.length>1700||!message||
     typeof message!=='object'||Array.isArray(message)||
     Object.keys(message).some(x=>!['type','params'].includes(x)))
    return fail('INVALID_MESSAGE');
  const types=['GET_ASSOCIATION','INSPECT_SOURCE','READ_SOURCE_FILE','ASSOCIATE_SOURCE','RECHECK_SOURCE'];
  if(!types.includes(message.type))return fail('CAPABILITY_OFF');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const keys=message.type==='READ_SOURCE_FILE'?['folder','path','pinnedHead','pinnedSha256']:
    message.type==='INSPECT_SOURCE'?['token','folder']:
    message.type==='GET_ASSOCIATION'?['slug']:
    message.type==='RECHECK_SOURCE'?['slug','token']:
    ['slug','folder','token','expectedRevision','pinnedFingerprint','pinnedHead','pinnedTestingSha'];
  if(Object.keys(p).some(k=>!keys.includes(k)))return fail('INVALID_PARAMS');
  if(!['INSPECT_SOURCE','READ_SOURCE_FILE'].includes(message.type)&&!slugOK(p.slug))return fail('INVALID_PARAMS');
  if(message.type==='READ_SOURCE_FILE'&&(!/^generators\/[a-z0-9][a-z0-9-]{0,99}$/.test(p.folder||'')||
    !safeSourcePath(p.path)||!shaOK(p.pinnedHead)||!fpOK(p.pinnedSha256)))return fail('INVALID_PARAMS');
  if(['ASSOCIATE_SOURCE','INSPECT_SOURCE'].includes(message.type)&&!safeFolder(p.folder))
    return fail('UNSAFE_SOURCE_PATH');
  if(message.type!=='GET_ASSOCIATION'&&p.token!==undefined&&(typeof p.token!=='string'||p.token.length>512))
    return fail('INVALID_PARAMS');
  if(message.type==='ASSOCIATE_SOURCE'&&
    (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1||
     !fpOK(p.pinnedFingerprint)||!shaOK(p.pinnedHead)||
     !(p.pinnedTestingSha===null||fpOK(p.pinnedTestingSha))))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
function txRead(db,slug){
  return new Promise((resolve,reject)=>{
    let out=fail('CANONICAL_HOLD'),t;
    try{t=db.transaction(['meta'],'readonly');}catch{return reject(Error('DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(out);t.onabort=()=>reject(Error('DB_ABORT'));
    t.objectStore('meta').get('source-link:'+slug).onsuccess=e=>{
      const link=e.target.result?.link;
      if(!link){out=fail('SOURCE_PENDING');return;}
      t.objectStore('meta').get('inventory:'+slug).onsuccess=v=>{
        const row=v.target.result?.generator;
        if(!row||row.remoteId!==link.remoteId||row.accountId!==link.accountId||
          row.bindingVersion!==link.bindingVersion||
          row.ownerState!=='OBSERVED_OWNER'){
          out=fail('SOURCE_ASSOCIATION_STALE');return;
        }
        t.objectStore('meta').get('account:'+row.accountId).onsuccess=a=>{
          const account=a.target.result?.account;
          if(!account||account.state!=='VERIFIED'||account.revision!==row.accountRevision||
             account.personaUid!==row.personaUid||account.bindingVersion!==row.bindingVersion||
             account.identity?.source!=='GUARDED_SESSION_READBACK'||
             account.identity?.bindingVersion!==row.bindingVersion) {
            out=fail('SOURCE_ASSOCIATION_STALE');return;
          }
          out={ok:true,link:{slug:link.slug,folder:link.folder,accountId:link.accountId,
            fingerprint:link.fingerprint,testingSha:link.testingSha,
            mainHead:link.mainHead,readyAtInspection:link.readyAtInspection,
            revision:link.revision,source:'HISTORICAL_GIT_INSPECTION'}};
        };
      };
    };
  });
}
function txAssociate(db,slug,expectedRevision,snapshot){
  return new Promise((resolve,reject)=>{
    let out=fail('CANONICAL_HOLD'),tx;
    try{tx=db.transaction(['meta','events'],'readwrite');}catch{return reject(Error('DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(Error('DB_ABORT'));
    const m=tx.objectStore('meta'),all=[];
    m.get('inventory:'+slug).onsuccess=e=>{
      const row=e.target.result?.generator;
      if(!row||row.revision!==expectedRevision||row.ownerState!=='OBSERVED_OWNER'||
        !row.remoteId||!row.accountId) {out=fail('TARGET_STALE_OR_UNVERIFIED');return;}
      m.get('account:'+row.accountId).onsuccess=a=>{
        const account=a.target.result?.account;
        if(!account||account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
          account.identity?.bindingVersion!==row.bindingVersion||
          account.revision!==row.accountRevision||
          account.bindingVersion!==row.bindingVersion||
          account.personaUid!==row.personaUid) {out=fail('ACCOUNT_CONTEXT_CHANGED');return;}
        m.openCursor().onsuccess=e=>{
          const cursor=e.target.result;
          if(cursor){
            if(typeof cursor.key==='string'&&cursor.key.startsWith('source-link:')&&
               cursor.value?.link)all.push(cursor.value.link);
            cursor.continue();return;
          }
          const existing=all.find(link=>link.slug===slug);
          if(existing) {
            out=existing.folder===snapshot.folder && existing.remoteId===row.remoteId &&
              existing.accountId===row.accountId &&
              existing.bindingVersion===row.bindingVersion?
              {ok:true,associated:true,duplicate:true,folder:existing.folder,
                readyAtInspection:existing.readyAtInspection,
                source:'HISTORICAL_GIT_INSPECTION'}:
              fail('SOURCE_REASSOCIATION_REQUIRES_REVIEW');
            return;
          }
          if(all.some(link=>link.folder.toLowerCase()===snapshot.folder.toLowerCase()))
            {out=fail('SOURCE_ASSOCIATION_CONFLICT');return;}
          const link={slug,remoteId:row.remoteId,accountId:row.accountId,
            personaUid:row.personaUid,bindingVersion:row.bindingVersion,
            folder:snapshot.folder,mainHead:snapshot.head,
            fingerprint:snapshot.fingerprint,testingSha:snapshot.testingSha,
            readyAtInspection:snapshot.ready,revision:1};
          m.add({key:'source-link:'+slug,link});
          tx.objectStore('events').add({stage:'SOURCE_ASSOCIATED',slug,
            folder:snapshot.folder,mainHead:snapshot.head,
            readiness:snapshot.ready?'READY':'SOURCE_PENDING'});
          out={ok:true,associated:true,duplicate:false,folder:snapshot.folder,
            readyAtInspection:snapshot.ready,source:'HISTORICAL_GIT_INSPECTION'};
        };
      };
    };
  });
}
export function createSourceBoundary(api,{
  open=openCanonicalDatabase,inspect=inspectGitSource,
  credential=createGitCredentialResolver(api),readFile=readVerifiedGitFile
}={}){
  let dbPromise;
  // One bounded, independently inspected manifest. No source bytes or token
  // are cached. Browsing this named main snapshot grants no effect authority.
  let workspace=null;
  const db=()=>dbPromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  async function run(message,sender){
    const auth=validateSourceMessage(api,sender,message);
    if(!auth.ok)return auth;
    let p=message.params||{};
    try{
      if(message.type==='GET_ASSOCIATION')return await txRead(await db(),p.slug);
      if(!p.token){
        const cred=await credential();if(!cred.ok)return cred;
        p={...p,token:cred.token};
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(message.type==='INSPECT_SOURCE'){
        const result=await inspect({token:p.token,folder:p.folder});
        if(result.ok)workspace={folder:result.folder,head:result.head,paths:result.paths};
        return result;
      }
      if(message.type==='READ_SOURCE_FILE'){
        const snapshot=workspace;
        const file=snapshot?.folder===p.folder&&snapshot.head===p.pinnedHead&&
          snapshot.paths.find(f=>f.path===p.path&&f.sha256===p.pinnedSha256);
        if(!file)return fail('SOURCE_SNAPSHOT_EXPIRED');
        const result=await readFile({token:p.token,file});
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        return result.ok?{...result,path:file.path,head:snapshot.head,source:'PINNED_MAIN_READ_ONLY'}:result;
      }
      if(message.type==='ASSOCIATE_SOURCE'){
        // Never let UI's self-asserted preview stand in for a new authoritative
        // Git read. HEAD may move; accept unrelated changes only when both
        // relevant source and pinned TESTING bytes are proven equivalent.
        const fresh=await inspect({token:p.token,folder:p.folder});
        if(!fresh.ok)return fresh;
        if(fresh.fingerprint!==p.pinnedFingerprint||
           fresh.testingSha!==p.pinnedTestingSha)return fail('SOURCE_DRIFT');
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        return await txAssociate(await db(),p.slug,p.expectedRevision,fresh);
      }
      const original=await txRead(await db(),p.slug);
      if(!original.ok)return original;
      const fresh=await inspect({token:p.token,folder:original.link.folder});
      if(!fresh.ok)return fresh;
      return compareGitSource({ok:true,ready:original.link.readyAtInspection,
        folder:original.link.folder,fingerprint:original.link.fingerprint,
        testingSha:original.link.testingSha},fresh);
    }catch{return fail('SOURCE_UNVERIFIED');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==SOURCE_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender)).then(v=>{
          try{port.postMessage(v);}catch{}
        }).catch(()=>{try{port.postMessage(fail('SOURCE_UNVERIFIED'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
    run=checkpointed(api,run,{allowDuringRestore:message=>["GET_ASSOCIATION","READ_SOURCE_FILE","INSPECT_SOURCE"].includes(message?.type)});
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createSourceBoundary(browser).register();
