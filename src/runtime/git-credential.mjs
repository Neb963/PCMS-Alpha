// One-time Git connection: the credential stored by Settings → Connect GitHub
// in the OS Secret Service vault serves every routine Git read/write. A typed
// token remains an optional per-operation override, never a requirement.
const CONFIG='pcmsS03Git',VAULT_HOST='local.pcms.backup_vault';
const TOKEN=/^[\x21-\x7e]{12,512}$/,RID=/^[1-9][0-9]{0,19}$/;
const fail=code=>({ok:false,code});
export const GIT_RECONNECT_REQUIRED='GIT_RECONNECT_REQUIRED';
export function createGitCredentialResolver(api,{
  native=packet=>api.runtime.sendNativeMessage(VAULT_HOST,packet)}={}){
  return async function resolve(explicit){
    if(typeof explicit==='string'&&explicit.length)
      return TOKEN.test(explicit)?{ok:true,token:explicit,source:'OPERATOR_SUPPLIED'}:
        fail('INVALID_PARAMS');
    let config;
    try{config=(await api.storage.local.get(CONFIG))?.[CONFIG];}catch{}
    if(!config||typeof config.repository!=='string'||!RID.test(config.repositoryId||''))
      return fail(GIT_RECONNECT_REQUIRED);
    let reply;
    try{reply=await native({action:'git.get',repositoryId:config.repositoryId});}
    catch{return fail('GIT_VAULT_UNAVAILABLE');}
    // A missing vault entry after restore or keyring loss needs one explicit
    // reconnection; queued canonical work is untouched and simply waits.
    if(!reply?.ok||!TOKEN.test(reply.credential||''))
      return fail(reply?.ok===false&&/MISSING|NOT_FOUND|ABSENT/.test(reply.code||'')?
        GIT_RECONNECT_REQUIRED:'GIT_VAULT_UNAVAILABLE');
    return {ok:true,token:reply.credential,source:'OS_VAULT',
      repository:config.repository,repositoryId:config.repositoryId};
  };
}
