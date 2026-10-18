// S03 fixed-purpose GitHub connection and main-only catalog boundary.
// Native Secret Service owns tokens; neither canonical state nor UI receives them.
import {trustedExtensionPage} from './command-boundary.mjs';
import {createRestoreSentinel,fail} from './journal.mjs';
import {scanMainCatalog,validRepository,makeInitialImportPreview} from './git-catalog.mjs';
export const CATALOG_PORT='pcms-s03-catalog';
const STATE_KEY='pcmsS03Git';
const VAULT_HOST='local.pcms.backup_vault';
const TOKEN=/^[\x21-\x7e]{12,512}$/;
const validConfig=c=>c&&typeof c==='object'&&validRepository(c.repository)&&
  typeof c.repositoryId==='string'&&/^[1-9][0-9]{0,19}$/.test(c.repositoryId);
export function validateCatalogMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  if(!message||typeof message!=='object'||Array.isArray(message)||
      Object.keys(message).some(k=>!['type','params'].includes(k)))
    return fail('CAPABILITY_OFF');
  const types=['SCAN_CATALOG','CONNECT_GIT','SCAN_CONNECTED','GIT_STATUS','DISCONNECT_GIT'];
  if(!types.includes(message.type))return fail('CAPABILITY_OFF');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  if(['SCAN_CATALOG','CONNECT_GIT'].includes(message.type)){
    if(Object.keys(p).some(k=>!['repository','token'].includes(k))||
      !validRepository(p.repository)||!TOKEN.test(p.token||''))
      return fail('INVALID_PARAMS');
  } else if(Object.keys(p).length)return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createCatalogBoundary(api,{scan=scanMainCatalog,transport=fetch,
  native=(packet)=>api.runtime.sendNativeMessage(VAULT_HOST,packet)}={}){
  const sentinel=createRestoreSentinel(api.storage.local);
  const readConfig=async()=>{
    const c=(await api.storage.local.get(STATE_KEY))?.[STATE_KEY];
    return validConfig(c)?c:null;
  };
  async function getSecret(config){
    const result=await native({action:'git.get',repositoryId:config.repositoryId});
    return result?.ok&&TOKEN.test(result.credential||'')?
      {ok:true,token:result.credential}:fail('GIT_VAULT_UNAVAILABLE');
  }
  async function scanAndPreview(repository,token,expectedId){
    const result=await scan({repository,token});
    if(!result?.ok||!result.complete)return result?.code?
      {ok:false,complete:false,code:result.code}:fail('CATALOG_INCOMPLETE');
    if(expectedId&&result.repositoryId!==expectedId)return fail('GIT_IDENTITY_CHANGED');
    return {...result,preview:makeInitialImportPreview(result)};
  }
  async function run(message,sender){
    const auth=validateCatalogMessage(api,sender,message);
    if(!auth.ok)return auth;
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const p=message.params||{};
    try{
      if(message.type==='SCAN_CATALOG')
        return await scanAndPreview(p.repository,p.token,null);
      if(message.type==='CONNECT_GIT'){
        // Verify actual private repository ID before writing one credential into
        // the OS vault. Never accept a user-submitted repository ID.
        const response=await transport('https://api.github.com/repos/'+p.repository,{
          method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
          headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+p.token,
            'X-GitHub-Api-Version':'2022-11-28'}});
        if(response?.status!==200)return fail('GIT_ACCESS_DENIED');
        const obj=await response.json();
        if(obj?.full_name!==p.repository||obj?.private!==true||
          !/^[1-9][0-9]{0,19}$/.test(String(obj.id||'')))
          return fail('REPOSITORY_IDENTITY_UNVERIFIED');
        const id=String(obj.id);
        const current=await readConfig();
        if(current&&(current.repositoryId!==id||current.repository!==p.repository))
          return fail('GIT_CONNECTION_REPLACE_REQUIRES_DISCONNECT');
        const saved=await native({action:'git.store',repositoryId:id,credential:p.token});
        if(saved?.ok!==true)return fail('GIT_VAULT_UNAVAILABLE');
        await api.storage.local.set({[STATE_KEY]:{repository:p.repository,repositoryId:id}});
        return {ok:true,code:'GIT_CONNECTED',repository:p.repository,repositoryId:id};
      }
      const config=await readConfig();
      if(!config)return fail('GIT_RECONNECT_REQUIRED');
      if(message.type==='GIT_STATUS'){
        const result=await native({action:'git.status',repositoryId:config.repositoryId});
        return {ok:result?.ok===true,code:result?.ok===true?'GIT_CREDENTIAL_PRESENT':'GIT_VAULT_UNAVAILABLE',
          repository:config.repository,repositoryId:config.repositoryId};
      }
      if(message.type==='DISCONNECT_GIT'){
        const result=await native({action:'git.remove',repositoryId:config.repositoryId});
        if(!result?.ok)return fail('GIT_VAULT_UNAVAILABLE');
        await api.storage.local.remove(STATE_KEY);
        return {ok:true,code:'GIT_DISCONNECTED'};
      }
      if(message.type==='SCAN_CONNECTED'){
        const secret=await getSecret(config);
        if(!secret.ok)return secret;
        return await scanAndPreview(config.repository,secret.token,config.repositoryId);
      }
      return fail('CAPABILITY_OFF');
    }catch{return fail('GIT_CONNECTION_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==CATALOG_PORT)return;
      let pending=false;
      port.onMessage.addListener(message=>{
        if(pending){try{port.postMessage(fail('BUSY'));}catch{}return;}
        pending=true;
        Promise.resolve(run(message,port.sender)).then(result=>{
          try{port.postMessage(result);}catch{}
        }).catch(()=>{try{port.postMessage(fail('CATALOG_INCOMPLETE'));}catch{}})
          .finally(()=>{pending=false;});
      });
    });
  }
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createCatalogBoundary(browser).register();
