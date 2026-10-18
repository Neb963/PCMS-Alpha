// S03 read-only background observer. Git credentials stay in native Secret Service.
// This deliberately does NOT send generator intents or provider/Git writes.
import {scanMainCatalog} from './git-catalog.mjs';
import {createRestoreSentinel} from './journal.mjs';
import {createGitResumeTransport} from './catalog-resume.mjs';
export const CATALOG_ALARM='pcms-s03-main-observe';
export const CATALOG_RESUME_ALARM='pcms-s03-main-resume';
const CONFIG='pcmsS03Git',RECEIPT='pcmsS03CatalogReceipt',LAST='pcmsS03CatalogLastComplete';
const SHA=/^[0-9a-f]{40}$/;
const identifier=c=>c&&typeof c.repository==='string'&&
  typeof c.repositoryId==='string'&&/^[1-9][0-9]{0,19}$/.test(c.repositoryId);
const safe=code=>({ok:false,code});
const MINUTES=15;
export function createCatalogWatcher(api,{scan=scanMainCatalog,
  native=p=>api.runtime.sendNativeMessage('local.pcms.backup_vault',p),
  network=fetch,clock=Date.now}={}){
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
      return {ok:true,code:'CATALOG_OBSERVED_READ_ONLY',head:result.head,
        newFolders:added,missingFolderObservations:missing};
    }catch{return persistStatus('CATALOG_OBSERVATION_UNAVAILABLE');}
  }
  function tick(){return running||(running=perform().finally(()=>{running=null;}));}
  function schedule(){
    try{void Promise.resolve(api.alarms.create(CATALOG_ALARM,{periodInMinutes:MINUTES})).catch(()=>{});}
    catch{}
  }
  function register(){
    if(registered)return;registered=true;
    api.alarms.onAlarm.addListener(event=>{
      if(event?.name===CATALOG_ALARM||event?.name===CATALOG_RESUME_ALARM)void tick();
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
if(typeof browser!=='undefined')createCatalogWatcher(browser).register();
