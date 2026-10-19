// S03 read-only background observer. Git credentials stay in native Secret Service.
// This deliberately does NOT send generator intents or provider/Git writes.
import {scanMainCatalog} from './git-catalog.mjs';
import {createRestoreSentinel} from './journal.mjs';
import {createGitResumeTransport} from './catalog-resume.mjs';
import {createCreationCatalogIntake} from './creation-catalog.mjs';
import {createReadyIntake} from './ready-intake.mjs';
import {createReadyDevelopment} from './ready-development.mjs';
import {createS06WritebackProgress} from './s06-writeback-progress.mjs';
import {createS06ChangeProgress} from './s06-request-changes.mjs';
export const CATALOG_ALARM='pcms-s03-main-observe';
export const CATALOG_RESUME_ALARM='pcms-s03-main-resume';
export const READY_PROGRESS_ALARM='pcms-s05-ready-progress';
const CONFIG='pcmsS03Git',RECEIPT='pcmsS03CatalogReceipt',LAST='pcmsS03CatalogLastComplete';
const SHA=/^[0-9a-f]{40}$/;
const identifier=c=>c&&typeof c.repository==='string'&&
  typeof c.repositoryId==='string'&&/^[1-9][0-9]{0,19}$/.test(c.repositoryId);
const safe=code=>({ok:false,code});
const MINUTES=15;
export function createCatalogWatcher(api,{scan=scanMainCatalog,
  native=p=>api.runtime.sendNativeMessage('local.pcms.backup_vault',p),
  network=fetch,clock=Date.now,ingestComplete=null,ingestReady=null,
  progressReady=null,progressChanges=null,progressWriteback=null}={}){
  const sentinel=createRestoreSentinel(api.storage.local);
  let running=null,registered=false;
  async function persistStatus(code){
    try{await api.storage.local.set({[RECEIPT]:{code,observedAt:clock()}});}catch{}
    return safe(code);
  }
  async function perform(){
    try{
      if((await sentinel.inspect()).held)return persistStatus('RESTORE_HOLD');
      const cfg=(await api.storage.local.get(CONFIG))?.[CONFIG];
      if(!identifier(cfg))return safe('GIT_RECONNECT_REQUIRED');
      const value=await native({action:'git.get',repositoryId:cfg.repositoryId});
      if(!value?.ok||typeof value.credential!=='string')
        return persistStatus('GIT_VAULT_UNAVAILABLE');
      const resumed=createGitResumeTransport(api.storage.local,{
        repositoryId:cfg.repositoryId,repository:cfg.repository,network});
      const result=await scan({repository:cfg.repository,token:value.credential},resumed.transport);
      if(resumed.status().paused){
        // One-time retry is a separate alarm; do not change the periodic alarm.
        try{await api.alarms.create(CATALOG_RESUME_ALARM,{when:clock()+60000});}catch{}
        return persistStatus('CATALOG_SCAN_CHECKPOINTED');
      }
      if(!result?.ok||!result.complete || result.repositoryId!==cfg.repositoryId)
        return persistStatus(result?.code||'CATALOG_INCOMPLETE');
      if((await sentinel.inspect()).held)return persistStatus('RESTORE_HOLD');
      const current=(await api.storage.local.get(CONFIG))?.[CONFIG];
      if(current?.repositoryId!==cfg.repositoryId||current.repository!==cfg.repository)
        return persistStatus('GIT_CONNECTION_CHANGED');
      const prior=(await api.storage.local.get(LAST))?.[LAST];
      // Only immutable, non-secret, main-verified metadata: no prompt contents,
      // token, raw source, negative ownership inference or provider mutation.
      const snapshot={repository:cfg.repository,repositoryId:cfg.repositoryId,
        head:result.head,rootTreeOid:result.rootTreeOid,
        promptOid:result.prompt?.oid||null,
        generators:result.generators.map(g=>({
          slug:g.slug,markerOid:g.markerOid,readyDeclared:g.ready,
          sourceState:g.sourceState,folderTreeOid:g.folderTreeOid
        })),complete:true,observedAt:clock()};
      const added=prior?.repositoryId===cfg.repositoryId&&prior.complete?
        snapshot.generators.filter(g=>!prior.generators?.some(x=>x.slug===g.slug)).map(x=>x.slug):[];
      const missing=prior?.repositoryId===cfg.repositoryId&&prior.complete?
        prior.generators.filter(g=>!snapshot.generators.some(x=>x.slug===g.slug)).map(x=>x.slug):[];
      // "Missing" is a reported Git path observation, NEVER deletion authority.
      await api.storage.local.set({[LAST]:snapshot,[RECEIPT]:{
        code:'CATALOG_OBSERVED_READ_ONLY',observedAt:clock(),
        repositoryId:cfg.repositoryId,head:result.head,recognizedCount:result.recognizedCount,
        newFolders:added,missingFolderObservations:missing,
        firstImportNeedsApproval:prior?.repositoryId!==cfg.repositoryId
      }});
      // S04 receives only the independently complete pinned-main scan. Its
      // own approval check and canonical DB handle decide local intent intake.
      // The S03 observer never invents provider ownership or performs writes.
      if(ingestComplete){
        let intake;
        try{intake=await ingestComplete(result);}catch{intake={ok:false,code:'S04_INTAKE_UNAVAILABLE'};}
        if(intake?.more===true)
          try{await api.alarms.create(CATALOG_RESUME_ALARM,{when:clock()+60000});}catch{}
        if(intake?.ok===false)
          try{await api.storage.local.set({pcmsS04CatalogIntakeReceipt:{
            code:intake.code||'S04_INTAKE_HELD',repositoryId:cfg.repositoryId,
            head:result.head,observedAt:clock(),providerEffects:'OFF'}});}catch{}
      }
      // S05 consumes only complete, pinned-main READY observations. Its queue
      // is local and effect-free; incomplete witnesses never become candidates.
      if(ingestReady){
        let ready;
        try{ready=await ingestReady({catalog:result,repository:cfg.repository,
          token:value.credential,transport:resumed.transport});}
        catch{ready={ok:false,code:'S05_READY_INTAKE_UNAVAILABLE'};}
        if(ready?.more===true)
          try{await api.alarms.create(CATALOG_RESUME_ALARM,{when:clock()+60000});}catch{}
        if(ready?.ok===false||ready?.held?.length)
          try{await api.storage.local.set({pcmsS05ReadyIntakeReceipt:{
            code:ready?.code||'READY_INTAKE_HELD',held:ready?.held||[],
            observedAt:clock(),providerEffects:'OFF'}});}catch{}
      }
      // The same existing observer owns bounded S05 progression. This
      // never promotes a partial Git scan into READY authority.
      if(progressReady)try{await progressReady();}catch{}
      if(progressChanges)try{await progressChanges();}catch{}
      if(progressWriteback)try{await progressWriteback();}catch{}
      return {ok:true,code:'CATALOG_OBSERVED_READ_ONLY',head:result.head,
        newFolders:added,missingFolderObservations:missing};
    }catch{return persistStatus('CATALOG_OBSERVATION_UNAVAILABLE');}
  }
  function tick(){return running||(running=perform().finally(()=>{running=null;}));}
  function schedule(){
    try{void Promise.resolve(api.alarms.create(CATALOG_ALARM,{periodInMinutes:MINUTES})).catch(()=>{});}
    catch{}
    // Native/READY transitions may resume without another large Git scan.
    // Each step revalidates canonical source and, where applicable, main.
    if(progressReady||progressChanges||progressWriteback)try{void Promise.resolve(api.alarms.create(READY_PROGRESS_ALARM,{periodInMinutes:1})).catch(()=>{});}
    catch{}
  }
  function register(){
    if(registered)return;registered=true;
    api.alarms.onAlarm.addListener(event=>{
      if(event?.name===CATALOG_ALARM||event?.name===CATALOG_RESUME_ALARM)void tick();
      if(event?.name===READY_PROGRESS_ALARM&&(progressReady||progressChanges||progressWriteback))
        void Promise.resolve().then(async()=>{
          if(progressReady)await progressReady();
          if(progressChanges)await progressChanges();
          if(progressWriteback)await progressWriteback();
        }).catch(()=>{});
    });
    api.runtime.onStartup.addListener(()=>{schedule();void tick();});
    api.runtime.onInstalled.addListener(()=>{schedule();void tick();});
    schedule();
    // Cold extension evaluation (including after background suspend) resumes
    // observation when the last operating-system credential is available.
    void tick();
  }
  return Object.freeze({register,tick});
}
if(typeof browser!=='undefined')createCatalogWatcher(browser,{
  ingestComplete:createCreationCatalogIntake(browser).run,
  ingestReady:createReadyIntake(browser).run,
  progressReady:createReadyDevelopment(browser).tick,
  progressChanges:createS06ChangeProgress(browser).tick,
  progressWriteback:createS06WritebackProgress(browser).tick
}).register();
