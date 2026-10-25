import {checkpointed} from './work-checkpoint.mjs';
import {autoBackup} from './backup-auto-boundary.mjs';
import {inventoryBoundary} from './inventory-boundary.mjs';
import {browserGitCredentialPacket} from './git-local-secret.mjs';
// I07 same-XPI adoption port. Explicit consent never authorizes source writes.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {createAdoptionStore} from './adoption-store.mjs';
import {validateAdoptionIntent,verifyOriginal} from './adoption.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {standingS06} from './s06-standing-authority.mjs';
import {writeOriginalArchive,inspectOriginalArchive} from './original-archive.mjs';
export const ADOPTION_PORT='pcms-i07-adoption';
export const ADOPTION_AUTO_ALARM='pcms-adoption-auto';
const AUTO_CURSOR='pcmsAdoptionAutoCursor',AUTO_BACKOFF=30*60000;
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
export function validateAdoptionMessage(api,sender,msg){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(msg);}catch{return fail('INVALID_MESSAGE');}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof json!=='string'||
     json.length>700||Object.keys(msg).some(k=>!['type','params'].includes(k)))
    return fail('INVALID_MESSAGE');
  if(!['GET_ADOPTION','INSPECT_ORIGINAL','READ_ORIGINAL_FILE','LIST_ADOPTIONS','CAPTURE_ADOPTION','RECHECK_IDENTITY','ARCHIVE_LOCAL','ARCHIVE_GIT','RECHECK_GIT','ABORT_GIT_PREPARED','RETRY_ADOPTION'].includes(msg.type))
    return fail('CAPABILITY_OFF');
  const p=msg.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=msg.type==='RETRY_ADOPTION'?['slug']:msg.type==='READ_ORIGINAL_FILE'?['slug','path']:msg.type==='INSPECT_ORIGINAL'?['slug']:
    msg.type==='LIST_ADOPTIONS'?[]:
    msg.type==='CAPTURE_ADOPTION'?['slug','expectedRevision','explicitPublicConsent']:
    msg.type==='RECHECK_IDENTITY'?['slug','expectedRevision']:
    msg.type==='GET_ADOPTION'?['slug']:
    ['ARCHIVE_GIT','RECHECK_GIT'].includes(msg.type)?['slug','expectedRevision']:
    ['slug','expectedRevision'];
  if(Object.keys(p).some(k=>!allowed.includes(k))||
     (msg.type!=='LIST_ADOPTIONS'&&!slug(p.slug)))return fail('INVALID_PARAMS');
  if(['ARCHIVE_LOCAL','CAPTURE_ADOPTION','RECHECK_IDENTITY','ARCHIVE_GIT','RECHECK_GIT','ABORT_GIT_PREPARED'].includes(msg.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))
    return fail('INVALID_PARAMS');
  if(msg.type==='READ_ORIGINAL_FILE'&&(typeof p.path!=='string'||p.path.length>240))return fail('INVALID_PARAMS');
  if(msg.type==='RETRY_ADOPTION')return {ok:true};
  if(msg.type==='CAPTURE_ADOPTION'&&typeof p.explicitPublicConsent!=='boolean')
    return fail('INVALID_PARAMS');
  return {ok:true};
}
function readRow(db,slug){
  return new Promise((resolve,reject)=>{
    let r=fail('TARGET_NOT_OBSERVED'),t;
    try{t=db.transaction(['meta'],'readonly');}catch{return reject(Error('DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(r);t.onabort=()=>reject(Error('DB_ABORT'));
    const m=t.objectStore('meta');
    m.get('inventory:'+slug).onsuccess=e=>{
      const row=e.target.result?.generator;
      if(!row)return;
      m.get('account:'+row.accountId).onsuccess=a=>{
        const account=a.target.result?.account;
        r=account?{ok:true,row,account}:fail('ACCOUNT_CONTEXT_CHANGED');
      };
    };
  });
}
export function createAdoptionBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,storeFactory=createAdoptionStore,
  gitWrite=writeOriginalArchive,gitRead=inspectOriginalArchive,
  // Packaged Git mutation activation remains HELD pending separate operator proof.
  gitGate=()=>false,
  // C-10 account-level management: production uses the standing operator
  // development grant. Off by default; tests inject.
  managementGate=()=>false,clock=Date.now,
  refreshIdentity=(slug,revision)=>inventoryBoundary?.recheckGenerator(slug,revision),
  requestCheckpoint=()=>autoBackup?.runner.requestOriginalCheckpoint(),
  getGitConnection=async()=>{const out=await api.storage.local.get('pcmsS03Git');
    return out?.pcmsS03Git;},
  getGitCredential=async repositoryId=>browserGitCredentialPacket({action:'git.get',repositoryId})
}={}){
  let dbPromise;
  const db=()=>dbPromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  async function run(msg,sender){
    const valid=validateAdoptionMessage(api,sender,msg);
    if(!valid.ok)return valid;
    return runTrusted(msg);
  }
  async function runTrusted(msg){
    const p=msg.params||{};
    try{
      const database=await db(),store=storeFactory(database);
      if(msg.type==='LIST_ADOPTIONS')return await store.list();
      if(msg.type==='GET_ADOPTION')return await store.get(p.slug);
      if(['INSPECT_ORIGINAL','READ_ORIGINAL_FILE'].includes(msg.type)){
        const found=await store.getFull(p.slug),a=found.record;if(!found.ok||a.archived)return fail('ORIGINAL_UNAVAILABLE');
        if(msg.type==='INSPECT_ORIGINAL')return {ok:true,files:a.original.files,visibility:a.visibility,
          protected:a.archiveState==='ARCHIVED_GIT_CONFIRMED'&&a.originalCheckpoint?.qualified===true};
        const file=a.original.blobs.find(f=>f.path===p.path);
        return file?{ok:true,path:file.path,base64:file.base64}:fail('ORIGINAL_FILE_NOT_FOUND');
      }
      if(msg.type==='RETRY_ADOPTION'){backoff.delete(p.slug);return autoTick({maxSteps:8,onlySlug:p.slug});}
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(msg.type==='ARCHIVE_LOCAL')return await store.archiveLocal(p.slug,p.expectedRevision);
      if(msg.type==='ABORT_GIT_PREPARED'){
        const cancelled=await store.archiveStage(p.slug,p.expectedRevision,'ABORT_PREPARED');
        return cancelled.ok?{ok:true,slug:p.slug,archive:'ARCHIVE_PENDING',
          providerWrites:'OFF'}:cancelled;
      }

      if(['ARCHIVE_GIT','RECHECK_GIT'].includes(msg.type)){
        const saved=await store.getFull(p.slug);
        if(!saved.ok)return saved;
        const rec=saved.record;
        if(rec.revision!==p.expectedRevision)return fail('STALE_REVISION');
        if(rec.archived)return fail('TOMBSTONE_HELD');
        const g=guard();
        if(!g?.getSafeRouteReadiness)return fail('DONOR_GUARD_UNAVAILABLE');
        const route=await g.getSafeRouteReadiness(rec.personaUid);
        if(!route?.ready)return fail(route?.code||'PROTECTED_ROUTE_UNVERIFIED');
        const cfg=await getGitConnection();
        if(!cfg?.repository||!/^[1-9][0-9]{0,19}$/.test(cfg.repositoryId||''))
          return fail('GIT_RECONNECT_REQUIRED');
        const secret=await getGitCredential(cfg.repositoryId);
        if(!secret?.ok||typeof secret.credential!=='string')
          return fail('GIT_VAULT_UNAVAILABLE');
        const params={slug:rec.slug,original:rec.original,
          repository:cfg.repository,repositoryId:cfg.repositoryId,
          token:secret.credential};
        if(msg.type==='RECHECK_GIT'){
          if(!['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(rec.archiveState))
            return fail('ARCHIVE_RECONCILIATION_NOT_REQUIRED');
          let proof;
          try{proof=await gitRead(params);}catch{return fail('GIT_READBACK_UNAVAILABLE');}
          if(!proof?.ok)return fail('ARCHIVE_RECONCILIATION_REQUIRED');
          if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
          const updated=await store.archiveStage(p.slug,rec.revision,'CONFIRM',proof);
          return updated.ok?{...updated,record:undefined,
            archive:'ARCHIVED_GIT_CONFIRMED',providerWrites:'OFF'}:updated;
        }
        if(rec.archiveState!=='ARCHIVE_PENDING')
          return fail('ARCHIVE_RECONCILIATION_REQUIRED');
        if(gitGate({slug:p.slug,record:rec})!==true)
          return fail('GIT_WRITE_ACTIVATION_HELD');
        let at=await store.archiveStage(p.slug,rec.revision,'PREPARE');
        if(!at.ok)return at;
        const route2=await g.getSafeRouteReadiness(rec.personaUid);
        if(!route2?.ready||route2.cookieStoreId!==route.cookieStoreId||
           route2.routeId!==route.routeId||(await sentinel.inspect()).held)
          return fail('GIT_PREPARED_HELD');
        if(gitGate({slug:p.slug,record:at.record})!==true)
          return fail('GIT_PREPARED_HELD');
        at=await store.archiveStage(p.slug,at.record.revision,'MARK_DISPATCH');
        if(!at.ok)return at;
        // DISPATCH_POSSIBLE committed before the first Git API write.
        // A late hold here is UNCERTAIN, never a safe unjournaled restart.
        const finalRoute=await g.getSafeRouteReadiness(rec.personaUid);
        if(gitGate({slug:p.slug,record:at.record})!==true||
           !finalRoute?.ready||finalRoute.cookieStoreId!==route.cookieStoreId||
           finalRoute.routeId!==route.routeId||
           (await sentinel.inspect()).held){
          await store.archiveStage(p.slug,at.record.revision,'HELD_UNCERTAIN');
          return fail('GIT_DISPATCH_HELD_UNCERTAIN');
        }
        let result;
        try{result=await gitWrite(params);}
        catch{result=fail('GIT_WRITE_UNCERTAIN');}
        if(!result?.ok){
          await store.archiveStage(p.slug,at.record.revision,'HELD_UNCERTAIN');
          return fail('GIT_WRITE_UNCERTAIN');
        }
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        const confirmed=await store.archiveStage(p.slug,at.record.revision,'CONFIRM',result);
        return confirmed.ok?{ok:true,slug:p.slug,
          archive:'ARCHIVED_GIT_CONFIRMED',originalFingerprint:rec.original.fingerprint,
          providerWrites:'OFF',publication:'OFF'}:fail('GIT_WRITE_UNCERTAIN');
      }

      const context=await readRow(database,p.slug);
      if(!context.ok)return context;
      const identityRecheck=msg.type==='RECHECK_IDENTITY';
      if(identityRecheck){
        if(context.row.revision!==p.expectedRevision||
           context.row.ownerState!=='IDENTITY_CONFLICT'||
           context.row.identityHold!=='PUBLIC_ID_REVALIDATION_REQUIRED')
          return fail('IDENTITY_NOT_RECHECKABLE');
      }else{
        const eligible=validateAdoptionIntent(context.row,context.account,p);
        if(!eligible.ok)return eligible;
      }
      const g=guard();
      if(!g?.observeReadOnly||!g.getSafeRouteReadiness)return fail('GUARD_NOT_READY');
      const ready=await g.getSafeRouteReadiness(context.row.personaUid);
      if(!ready?.ready)return fail(ready?.code||'PROTECTED_ROUTE_UNVERIFIED');
      // Independent exact source readbacks; a changed source is held.
      const read=async()=>{
        const raw=await g.observeReadOnly(context.row.personaUid,false,p.slug);
        if(!raw?.ok||!raw.original||
           raw.principalFingerprint!==context.account.identity.principalFingerprint)
          return fail('ORIGINAL_SOURCE_READBACK_UNAVAILABLE');
        return verifyOriginal({...raw.original,ok:true,
          source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:p.slug,
          accountId:context.row.accountId,personaUid:context.row.personaUid,
          principalFingerprint:raw.principalFingerprint,observedAt:Date.now()},
          context.row,context.account);
      };
      const first=await read();
      if(!first.ok)return first;
      const second=await read();
      if(!second.ok)return second;
      if(first.fingerprint!==second.fingerprint||
         first.remotePublicId!==second.remotePublicId||
         first.visibility!==second.visibility)return fail('ORIGINAL_SOURCE_DRIFT');
      const after=await g.getSafeRouteReadiness(context.row.personaUid);
      if(!after?.ready||after.cookieStoreId!==ready.cookieStoreId||
         after.routeId!==ready.routeId||
         (await sentinel.inspect()).held)return fail('SESSION_CONTEXT_CHANGED');
      // Atomic commit rechecks the account/Persona and exact row revision.
      return identityRecheck?
        await store.recheckIdentity(p.slug,p.expectedRevision,second):
        await store.adopt(p,second);
    }catch{return fail('ADOPTION_AUTHORITY_UNAVAILABLE');}
  }
  // C-10: once account-level management is granted, discover and adopt
  // independently verified owned generators (private or public) without
  // per-generator approval. Each step is the SAME guarded handler as the
  // operator path: two matching full-byte readbacks, then the conditional Git
  // original archive. Adoption never publishes, unlists, deletes or
  // overwrites remote content. Ambiguous/changed/incomplete sources hold
  // per generator with a bounded backoff; a held item never blocks others.
  const backoff=new Map();let autoBusy=false;
  function scanWork(database){
    return new Promise((resolve,reject)=>{
      let t;try{t=database.transaction(['meta'],'readonly');}catch{return reject(Error('DB_UNAVAILABLE'));}
      const inventory=[],adoptions=new Map(),accounts=new Map();
      t.oncomplete=()=>resolve({inventory,adoptions,accounts});
      t.onabort=()=>reject(Error('DB_ABORT'));
      t.objectStore('meta').openCursor().onsuccess=e=>{
        const c=e.target.result;if(!c)return;
        const k=c.key;
        if(typeof k==='string'){
          if(k.startsWith('inventory:')&&c.value?.generator)inventory.push(c.value.generator);
          else if(k.startsWith('adoption:')&&c.value?.adoption)adoptions.set(c.value.adoption.slug,c.value.adoption);
          else if(k.startsWith('account:')&&c.value?.account)accounts.set(c.value.account.accountId,c.value.account);
        }
        c.continue();
      };
    });
  }
  let lastCheckpointRequest=0;
  async function autoTick({maxSteps=8,onlySlug=null}={}){
    if(autoBusy)return fail('BUSY');
    autoBusy=true;
    try{
      if((await managementGate())!==true)return fail('ACCOUNT_MANAGEMENT_NOT_GRANTED');
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const database=await db();
      const {inventory,adoptions,accounts}=await scanWork(database);
      const now=clock(),work=[];
      for(const row of inventory){
        const a=accounts.get(row.accountId);
        // Only generators discovered on the account; PCMS-created private
        // generators (MANAGED_CREATED) have no human original to adopt.
        if(!slug(row.slug)||a?.state!=='VERIFIED'||onlySlug&&row.slug!==onlySlug)continue;
        if((backoff.get(row.slug)||0)>now)continue;
        const rec=adoptions.get(row.slug);
        if(rec?.archived)continue;
        if(rec&&rec.accountRevision!==a.revision&&rec.personaUid===a.personaUid&&
           rec.bindingVersion===a.bindingVersion&&rec.principalFingerprint===a.identity?.principalFingerprint){
          work.push({slug:row.slug,type:'REFRESH_CONTEXT',params:{slug:row.slug,expectedRevision:row.revision}});continue;
        }
        if(rec&&row.ownerState==='IDENTITY_CONFLICT'&&
           row.identityHold==='PUBLIC_ID_REVALIDATION_REQUIRED'&&
           rec.remotePublicId===row.remoteId){
          work.push({slug:row.slug,type:'RECHECK_IDENTITY',params:{
            slug:row.slug,expectedRevision:row.revision}});
          continue;
        }
        if(row.ownerState!=='OBSERVED_OWNER'||
           (row.management!==undefined&&row.management!=='OBSERVED_ONLY')||
           !['PUBLIC','UNLISTED'].includes(row.visibility))continue;
        if(!rec)work.push({slug:row.slug,type:'CAPTURE_ADOPTION',params:{slug:row.slug,
          expectedRevision:row.revision,explicitPublicConsent:false,standingManagement:true}});
        else if(!rec.archived&&rec.archiveState==='ARCHIVE_PENDING'&&gitGate({slug:row.slug,record:rec})===true)
          work.push({slug:row.slug,type:'ARCHIVE_GIT',params:{slug:row.slug,expectedRevision:rec.revision}});
        else if(!rec.archived&&rec.archiveState==='GIT_PREPARED')
          work.push({slug:row.slug,type:'ABORT_GIT_PREPARED',params:{slug:row.slug,expectedRevision:rec.revision}});
        else if(!rec.archived&&['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(rec.archiveState))
          // An uncertain Git write is reconciled read-only, never repeated.
          work.push({slug:row.slug,type:'RECHECK_GIT',params:{slug:row.slug,expectedRevision:rec.revision}});
      }
      // Bounded fair rotation: resume after the last attempted slug.
      work.sort((x,y)=>x.slug<y.slug?-1:x.slug>y.slug?1:0);
      let cursor=null;try{cursor=(await api.storage.local.get(AUTO_CURSOR))?.[AUTO_CURSOR]||null;}catch{}
      const start=cursor?Math.max(0,work.findIndex(w=>w.slug>cursor)):0;
      const ordered=[...work.slice(start<0?0:start),...work.slice(0,start<0?0:start)];
      const results=[];
      for(const item of ordered.slice(0,maxSteps)){
        if((await managementGate())!==true||(await sentinel.inspect()).held)break;
        const out=item.type==='REFRESH_CONTEXT'?await refreshIdentity(item.slug,item.params.expectedRevision):
          await runTrusted({type:item.type,params:item.params});
        if(!out?.ok)backoff.set(item.slug,clock()+AUTO_BACKOFF);else backoff.delete(item.slug);
        results.push({slug:item.slug,step:item.type,ok:out?.ok===true,code:out?.ok?null:out?.code||'HELD'});
        try{await api.storage.local.set({[AUTO_CURSOR]:item.slug});}catch{}
      }
      if(results.some(r=>r.ok)||work.length>results.length)
        try{void Promise.resolve(api.alarms?.create(ADOPTION_AUTO_ALARM+'-followup',{when:clock()+60000})).catch(()=>{});}catch{}
      const unqualified=[...adoptions.values()].some(a=>{const current=accounts.get(a.accountId);
        return !a.archived&&a.archiveState==='ARCHIVED_GIT_CONFIRMED'&&!a.originalCheckpoint?.qualified&&
          current?.state==='VERIFIED'&&current.revision===a.accountRevision&&current.personaUid===a.personaUid&&
          current.bindingVersion===a.bindingVersion&&current.identity?.principalFingerprint===a.principalFingerprint;});
      if(unqualified&&clock()-lastCheckpointRequest>=5*60000){
        lastCheckpointRequest=clock();void Promise.resolve(requestCheckpoint()).catch(()=>{});
      }
      return {ok:true,code:'ADOPTION_AUTO_CHECKPOINT',pending:work.length,results,
        providerWrites:'OFF',publication:'OFF'};
    }catch{return fail('ADOPTION_AUTO_UNAVAILABLE');}
    finally{autoBusy=false;}
  }
  function register(){
    try{api.alarms?.create(ADOPTION_AUTO_ALARM,{periodInMinutes:5});}catch{}
    api.alarms?.onAlarm?.addListener(alarm=>{if([ADOPTION_AUTO_ALARM,ADOPTION_AUTO_ALARM+'-followup'].includes(alarm?.name))void autoTick();});
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==ADOPTION_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender)).then(result=>{
          try{port.postMessage(result);}catch{}
        }).catch(()=>{try{port.postMessage(fail('ADOPTION_AUTHORITY_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
    run=checkpointed(api,run,{allowDuringRestore:message=>["LIST_ADOPTIONS","GET_ADOPTION","INSPECT_ORIGINAL","READ_ORIGINAL_FILE"].includes(message?.type)});
  runTrusted=checkpointed(api,runTrusted,{allowDuringRestore:message=>["LIST_ADOPTIONS","GET_ADOPTION","INSPECT_ORIGINAL","READ_ORIGINAL_FILE"].includes(message?.type)});
  autoTick=checkpointed(api,autoTick);
  return Object.freeze({run,register,autoTick});
}
if(typeof browser!=='undefined')createAdoptionBoundary(browser,{
  gitGate:()=>standingS06?.gate('gitWrite')===true,
  managementGate:()=>standingS06?.allowsOperatorManagement()
}).register();
