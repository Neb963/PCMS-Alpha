// I13 existing-generator guarded orchestration. No credentials in canonical
// state, no UI-defined payloads, no effect without durable dispatch marker.
// One local transaction before each remote action; all reconciliation read-only.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createExistingStore} from './existing-update-store.mjs';
import {authorizeSleepingUpdate,sealPrevious,unlockPrevious} from './existing-update-core.mjs';
import {createStagingStore} from './staging-store.mjs';
import {exactSource,verifyReadback} from './staging-core.mjs';
import {inspectGitSource} from './git-source.mjs';
import {REFRESHER_KEY} from './refresher-core.mjs';

export const EXISTING_PORT='pcms-i13-existing';
const valid=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const allowed={
  GET:['slug'],PREPARE:['slug','passphrase'],
  UNLIST:['slug','expectedRevision','passphrase'],
  RECHECK_UNLIST:['slug','expectedRevision'],
  PIN_STAGE:['slug','expectedRevision','passphrase','token'],
  STAGE:['slug','expectedRevision','passphrase'],
  RECHECK_STAGE:['slug','expectedRevision'],
  RECOVERY_UNLIST:['slug','expectedRevision'],
  RECHECK_RECOVERY_UNLIST:['slug','expectedRevision'],
  RESTORE:['slug','expectedRevision','passphrase'],
  RECHECK_RESTORE:['slug','expectedRevision']
};
export function validateExistingMessage(api,sender,m){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(m);}catch{return fail('INVALID_MESSAGE');}
  if(!m||typeof m!=='object'||Array.isArray(m)||!json||json.length>1700||
     Object.keys(m).some(k=>!['type','params'].includes(k))||
     !Object.hasOwn(allowed,m.type))return fail('COMMAND_NOT_ALLOWED');
  const p=m.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p)||
     Object.keys(p).some(k=>!allowed[m.type].includes(k))||
     !valid(p.slug)||('expectedRevision'in p&&
       (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))||
     ('passphrase'in p&&(typeof p.passphrase!=='string'||
       p.passphrase.length<12||p.passphrase.length>256))||
     ('token'in p&&(typeof p.token!=='string'||p.token.length<12||
       p.token.length>512||!/^[\x21-\x7e]+$/.test(p.token)))||
     (allowed[m.type].includes('expectedRevision')&&!Number.isSafeInteger(p.expectedRevision))||
     (allowed[m.type].includes('passphrase')&&!('passphrase'in p))||
     (allowed[m.type].includes('token')&&!('token'in p)))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
function canonical(db,name){
  return new Promise((resolve,reject)=>{
    let tx,result=fail('EXISTING_CANONICAL_CONTEXT_MISSING');
    try{tx=db.transaction('meta','readonly');}
    catch{return reject(Error('EXISTING_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('EXISTING_DB_ABORTED'));
    const m=tx.objectStore('meta');
    m.get('inventory:'+name).onsuccess=i=>{
      const inventory=i.target.result?.generator;if(!inventory)return;
      m.get('account:'+inventory.accountId).onsuccess=a=>{
        m.get('adoption:'+name).onsuccess=o=>{
          m.get(REFRESHER_KEY).onsuccess=s=>{
            m.get('source-link:'+name).onsuccess=l=>{
              const account=a.target.result?.account,
                adoption=o.target.result?.adoption,
                shadow=s.target.result?.state,
                row=shadow?.rows?.find(z=>z.slug===name);
              result=account&&adoption&&row?{
                ok:true,account,adoption,inventory,shadow,row,
                link:l.target.result?.link}:fail('EXISTING_SOURCE_OR_SLEEP_NOT_FOUND');
            };
          };
        };
      };
    };
  });
}
const b64=s=>{
  let text='';const bytes=new TextEncoder().encode(s);
  for(let i=0;i<bytes.length;i+=8192)
    text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(text);
};
async function observe(g,record) {
  const data=await g.observeReadOnly(record.personaUid,false,record.slug);
  const o=data?.original;
  if(!data?.ok||data.principalFingerprint!==record.principalFingerprint||
     !o||o.ownerResult!=='IS_OWNER'||
     o.remotePublicId!==record.remotePublicId||
     !['PUBLIC','UNLISTED'].includes(o.visibility)||
     typeof o.pjs!=='string'||typeof o.html!=='string'||!Array.isArray(o.assets))
    return fail('EXISTING_OWNER_OR_BYTES_UNVERIFIED');
  const source=await exactSource([{path:'main.pjs',base64:b64(o.pjs)},
    {path:'index.html',base64:b64(o.html)},...o.assets]);
  return source.ok?{ok:true,source,visibility:o.visibility,
    proof:{ok:true,source:'INDEPENDENT_FULL_BYTE_READBACK',
      ownerResult:'IS_OWNER',remotePublicId:o.remotePublicId,
      fingerprint:source.fingerprint,visibility:o.visibility}}:source;
}
export function createExistingBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,
  existingFactory=createExistingStore,stageFactory=createStagingStore,
  inspect=inspectGitSource,effectGate=()=>false
}={}){
  let promise;
  const db=()=>promise ||=open().catch(e=>{promise=null;throw e;});
  const sentinel=createRestoreSentinel(api.storage.local);
  async function safeGuard(personaUid) {
    const g=guard();
    if(!g?.runExistingStep||!g?.observeReadOnly||!g?.getSafeRouteReadiness)
      return fail('EXISTING_DONOR_UNAVAILABLE');
    const before=await g.getSafeRouteReadiness(personaUid);
    return before?.ready?{ok:true,g,before}:fail(before?.code||'PROTECTED_ROUTE_UNVERIFIED');
  }
  async function recheck(g,personaUid,before) {
    const after=await g.getSafeRouteReadiness(personaUid);
    if(!after?.ready||after.cookieStoreId!==before.cookieStoreId||
       after.routeId!==before.routeId||(await sentinel.inspect()).held)
      return fail('EXISTING_OWNER_ROUTE_OR_RESTORE_CHANGED');
    return {ok:true};
  }
  async function runTrusted(m){
    const p=m.params,database=await db(),store=existingFactory(database);
    if(m.type==='GET')return store.get(p.slug);
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    if(m.type==='PREPARE'){
      const f=await canonical(database,p.slug);
      if(!f.ok)return f;
      const authority=await safeGuard(f.account.personaUid);
      if(!authority.ok)return authority;
      if(f.shadow.globalPause===true||f.shadow.accounts?.[f.account.accountId]?.paused===true)
        return fail('EXISTING_PAUSED');
      const record={slug:p.slug,personaUid:f.account.personaUid,
        principalFingerprint:f.account.identity?.principalFingerprint,
        remotePublicId:f.inventory.remoteId};
      const remote=await observe(authority.g,record);
      if(!remote.ok)return remote;
      const original=await exactSource(f.adoption.original?.blobs);
      if(!original.ok)return fail('EXISTING_ORIGINAL_BYTES_UNVERIFIED');
      if(!authorizeSleepingUpdate({account:f.account,inventory:f.inventory,
        adoption:f.adoption,shadow:f.row,original,remote:{
          ok:true,remotePublicId:f.inventory.remoteId,ownerResult:'IS_OWNER',
          visibility:remote.visibility,source:remote.source}}).ok)
        return fail('EXISTING_SLEEP_OR_ARCHIVED_ORIGINAL_UNVERIFIED');
      const sealed=await sealPrevious(original,p.passphrase);
      if(!sealed.ok)return sealed;
      const unlocked=await unlockPrevious(sealed,p.passphrase);
      if(!unlocked.ok)return unlocked;
      if(!(await recheck(authority.g,record.personaUid,authority.before)).ok)
        return fail('EXISTING_GUARD_CHANGED');
      return store.prepare({context:{ok:true},original,seal:sealed,
        remote:{ok:true,remotePublicId:record.remotePublicId,
          ownerResult:'IS_OWNER',visibility:remote.visibility,source:remote.source},
        shadow:f.row,account:f.account,inventory:f.inventory,adoption:f.adoption});
    }
    const saved=await store.getFull(p.slug);
    if(!saved.ok)return saved;
    const r=saved.record;
    if(r.revision!==p.expectedRevision)return fail('STALE_REVISION');
    const authority=await safeGuard(r.personaUid);
    if(!authority.ok)return authority;
    const {g,before}=authority;
    // All read-only reconciliation survives activation being disabled.
    if(m.type.startsWith('RECHECK_')){
      const o=await observe(g,r);
      if(!o.ok)return o;
      const target=m.type==='RECHECK_UNLIST'?r.previousFingerprint:r.stagedFingerprint;
      if(m.type==='RECHECK_RESTORE'){
        if(o.visibility!=='UNLISTED'||o.source.fingerprint!==r.previousFingerprint)
          return fail('PREVIOUS_P_NOT_VERIFIED_UNLISTED');
      }else if(o.visibility!=='UNLISTED'||o.source.fingerprint!==target)
        return fail('EXISTING_READBACK_CONTRADICTION');
      if(!(await recheck(g,r.personaUid,before)).ok)return fail('EXISTING_GUARD_CHANGED');
      if(m.type==='RECHECK_STAGE'){
        const staged=await stageFactory(database).getFull(p.slug);
        if(!staged.ok||staged.record.nonce!==r.nonce||
           !['DISPATCH_POSSIBLE','HELD_UNCERTAIN','SAVED_UNVERIFIED'].includes(staged.record.state)||
           staged.record.candidate.fingerprint!==r.stagedFingerprint)
          return fail('EXISTING_STAGE_JOURNAL_CHANGED');
        const editor=await g.inspectStageEditor?.(r.personaUid,p.slug,r.nonce);
        if(!editor?.ok||editor.clean!==true)
          return fail('EXISTING_DIRTY_OR_AMBIGUOUS_EDITOR');
        const sourceProof=await verifyReadback(staged.record.candidate,{
          ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:p.slug,
          accountId:r.accountId,personaUid:r.personaUid,
          principalFingerprint:r.principalFingerprint,
          remotePublicId:r.remotePublicId,ownerResult:'IS_OWNER',
          visibility:'UNLISTED',
          pjs:new TextDecoder('utf-8',{fatal:true}).decode(
            Uint8Array.from(atob(o.source.blobs.find(x=>x.path==='main.pjs').base64),c=>c.charCodeAt(0))),
          html:new TextDecoder('utf-8',{fatal:true}).decode(
            Uint8Array.from(atob(o.source.blobs.find(x=>x.path==='index.html').base64),c=>c.charCodeAt(0))),
          assets:o.source.blobs.filter(x=>x.path.startsWith('src/'))
        },{slug:p.slug,accountId:r.accountId,personaUid:r.personaUid,
          principalFingerprint:r.principalFingerprint,remotePublicId:r.remotePublicId});
        if(!sourceProof.ok)return fail('EXISTING_FULL_F_NOT_REVERIFIED');
        const moved=await stageFactory(database).move(p.slug,staged.record.revision,
          'SOURCE_VERIFIED',{verified:sourceProof});
        if(!moved.ok)return moved;
      }
      const event={
        RECHECK_UNLIST:'UNLIST_CONFIRMED',
        RECHECK_STAGE:'STAGE_CONFIRMED',
        RECHECK_RECOVERY_UNLIST:'RECOVERY_UNLIST_CONFIRMED',
        RECHECK_RESTORE:'RESTORE_CONFIRMED'}[m.type];
      return store.move(p.slug,r.revision,event,{proof:o.proof});
    }
    const unlock=async()=>{
      const unlocked=await unlockPrevious(r.recovery,p.passphrase);
      if(!unlocked.ok||unlocked.source.fingerprint!==r.previousFingerprint)
        return fail('RECOVERY_DECRYPTION_REQUIRED');
      return unlocked;
    };
    if(m.type==='PIN_STAGE'){
      if(r.state!=='UNLIST_CONFIRMED')return fail('UNLIST_FIRST');
      const opened=await unlock();
      if(!opened.ok)return opened;
      const f=await canonical(database,p.slug);
      if(!f.ok||f.account.revision!==r.accountRevision||
         f.inventory.remoteId!==r.remotePublicId||!f.link||
         f.link.accountId!==r.accountId||
         f.link.bindingVersion!==r.bindingVersion||
         f.link.remoteId!==r.remotePublicId)
        return fail('EXISTING_SOURCE_LINK_CHANGED');
      const remote=await observe(g,r);
      if(!remote.ok||remote.visibility!=='UNLISTED'||
         remote.source.fingerprint!==r.previousFingerprint)
        return fail('EXISTING_PREVIOUS_SOURCE_CHANGED');
      const git=await inspect({folder:f.link.folder,token:p.token,
        includeSourceBytes:true});
      if(!git?.ok||!git.ready||git.folder!==f.link.folder)
        return fail('EXISTING_GIT_READY_UNVERIFIED');
      const candidate=await exactSource(git.sourceBytes);
      if(!candidate.ok)return candidate;
      if(!(await recheck(g,r.personaUid,before)).ok)return fail('EXISTING_GUARD_CHANGED');
      const stage=stageFactory(database);
      const result=await stage.pin({slug:p.slug,candidate,
        previous:opened.source,source:git,
        eligibility:{ok:true,account:f.account,item:{
          remoteId:r.remotePublicId}},nonce:r.nonce});
      if(!result.ok)return result;
      const pinned=await store.pinStage(p.slug,r.revision,{candidate,source:git});
      return pinned.ok?{...pinned,stageRevision:result.revision,
        stage:'PINNED',sourceFingerprint:candidate.fingerprint}:pinned;
    }
    if(m.type==='UNLIST'||m.type==='STAGE'||m.type==='RESTORE'||m.type==='RECOVERY_UNLIST'){
      if(m.type==='UNLIST'&&r.state!=='PREPARED'||
         m.type==='STAGE'&&r.state!=='UNLIST_CONFIRMED'||
         m.type==='RESTORE'&&!['STAGE_CONFIRMED','RECOVERY_UNLIST_CONFIRMED'].includes(r.state)||
         m.type==='RECOVERY_UNLIST'&&r.state!=='STAGE_CONFIRMED')
        return fail('EXISTING_RECONCILIATION_REQUIRED');
      let prior;
      if(m.type==='UNLIST'||m.type==='STAGE'||m.type==='RESTORE'){
        prior=await unlock();if(!prior.ok)return prior;
      }
      const remote=await observe(g,r);
      if(!remote.ok)return remote;
      const mustBePublic=['UNLIST','RECOVERY_UNLIST'].includes(m.type);
      const fingerprint=m.type==='UNLIST'?r.previousFingerprint:r.stagedFingerprint;
      if(remote.visibility!==(mustBePublic?'PUBLIC':'UNLISTED')||
         remote.source.fingerprint!==fingerprint)
        return fail('EXISTING_REMOTE_SOURCE_OR_LISTING_DRIFT');
      if(m.type==='RECOVERY_UNLIST'){
        const release=await new Promise((resolve,reject)=>{
          const tx=database.transaction('meta','readonly');
          const req=tx.objectStore('meta').get('release:'+p.slug);
          req.onsuccess=()=>resolve(req.result?.release);
          req.onerror=()=>reject(Error('RELEASE_READ_FAILED'));
        });
        if(!release||release.approval?.sourceFingerprint!==r.stagedFingerprint||
           !['CONFIRMED_PUBLIC','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(release.state))
          return fail('RECOVERY_NOT_SOURCE_AUTHORIZED');
      }
      let stage;
      if(m.type==='STAGE'){
        stage=await stageFactory(database).getFull(p.slug);
        if(!stage.ok||stage.record.state!=='PINNED'||
           stage.record.candidate.fingerprint!==r.stagedFingerprint||
           stage.record.nonce!==r.nonce)return fail('EXISTING_STAGE_CHANGED');
      }
      if(effectGate({phase:'I13',action:m.type,record:r})!==true)
        return fail('PROVIDER_ACTIVATION_HELD');
      if(!(await recheck(g,r.personaUid,before)).ok)return fail('EXISTING_GUARD_CHANGED');
      if(stage){
        const stages=stageFactory(database);
        let step=await stages.move(p.slug,stage.record.revision,'PREPARED');
        if(!step.ok)return step;
        step=await stages.move(p.slug,step.revision,'DISPATCH_POSSIBLE');
        if(!step.ok)return step;
      }
      const kind=m.type==='RECOVERY_UNLIST'?'RECOVERY_UNLIST_DISPATCH':
        m.type+'_DISPATCH';
      const armed=await store.move(p.slug,r.revision,kind);
      if(!armed.ok)return armed;
      if(effectGate({phase:'I13',action:m.type,record:r})!==true||
         (await sentinel.inspect()).held)return fail('EXISTING_EFFECT_POSSIBLE_HELD');
      const request={slug:p.slug,nonce:r.nonce,
        action:m.type==='RECOVERY_UNLIST'?'UNLIST':m.type,
        previousFiles:['UNLIST','STAGE'].includes(m.type)?prior.source.blobs:r.stageSource.blobs,
        ...(m.type==='STAGE'?{targetFiles:r.stageSource.blobs}:
          m.type==='RESTORE'?{targetFiles:prior.source.blobs}:{})};
      let attempt;
      try{attempt=await g.runExistingStep(r.personaUid,request);}
      catch{attempt=fail('EXISTING_EFFECT_OUTCOME_UNKNOWN');}
      const held=await store.move(p.slug,armed.revision,
        m.type==='RECOVERY_UNLIST'?'RECOVERY_UNLIST_UNCERTAIN':m.type+'_UNCERTAIN',
        {reason:attempt?.code||'EXISTING_OUTCOME_UNKNOWN'});
      return held.ok?{...held,ack:attempt?.ok===true?'UNVERIFIED_ACK':'UNKNOWN',
        next:'READ_ONLY_RECHECK_REQUIRED'}:held;
    }
    return fail('EXISTING_COMMAND_OFF');
  }
  async function run(m,sender){
    const valid=validateExistingMessage(api,sender,m);
    if(!valid.ok)return valid;
    try{return await runTrusted(m);}
    catch{return fail('EXISTING_CANONICAL_HOLD');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==EXISTING_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(msg,port.sender)).then(result=>{
          try{port.postMessage(result);}catch{}
        }).catch(()=>{try{port.postMessage(fail('EXISTING_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createExistingBoundary(browser).register();
