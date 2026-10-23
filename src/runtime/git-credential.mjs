// A03: configured Git credentials are held in background-origin IndexedDB.
import {createBrowserGitCredentialStore} from './git-local-secret.mjs';
const CONFIG='pcmsS03Git';
const TOKEN=/^[\x21-\x7e]{12,512}$/,RID=/^[1-9][0-9]{0,19}$/;
const fail=code=>({ok:false,code});
export const GIT_RECONNECT_REQUIRED='GIT_RECONNECT_REQUIRED';
export function createGitCredentialResolver(api,{
  store=createBrowserGitCredentialStore(),native=null
}={}){
  return async function resolve(explicit){
    if(typeof explicit==='string'&&explicit.length)
      return TOKEN.test(explicit)?{ok:true,token:explicit,source:'OPERATOR_SUPPLIED'}:
        fail('INVALID_PARAMS');
    let config;
    try{config=(await api.storage.local.get(CONFIG))?.[CONFIG];}
    catch{return fail('GIT_CONFIG_READ_FAILED');}
    if(!config||typeof config.repository!=='string'||!RID.test(config.repositoryId||''))
      return fail(GIT_RECONNECT_REQUIRED);
    // Legacy native injection remains only for historical test fixtures.
    // Shipped runtime never supplies a native credential host.
    if(native){
      let reply;
      try{reply=await native({action:'git.get',repositoryId:config.repositoryId});}
      catch{return fail('GIT_VAULT_UNAVAILABLE');}
      if(!reply?.ok||!TOKEN.test(reply.credential||''))
        return fail(reply?.code==='MISSING_OR_INVALID'?GIT_RECONNECT_REQUIRED:'GIT_VAULT_UNAVAILABLE');
      return {ok:true,token:reply.credential,source:'OS_VAULT',
        repository:config.repository,repositoryId:config.repositoryId};
    }
    let reply;
    try{reply=await store.get(config.repositoryId);}
    catch{return fail('GIT_LOCAL_STORAGE_UNAVAILABLE');}
    if(!reply?.ok||!TOKEN.test(reply.token||''))
      return fail(reply?.code===GIT_RECONNECT_REQUIRED?GIT_RECONNECT_REQUIRED:
        reply?.code||'GIT_LOCAL_STORAGE_UNAVAILABLE');
    return {ok:true,token:reply.token,source:'BROWSER_LOCAL',
      repository:config.repository,repositoryId:config.repositoryId};
  };
}
