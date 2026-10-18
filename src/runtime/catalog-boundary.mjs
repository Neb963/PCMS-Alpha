// S03 isolated read-only extension port. No token persistence or capabilities to write.
import {trustedExtensionPage} from './command-boundary.mjs';
import {fail} from './journal.mjs';
import {scanMainCatalog,validRepository,makeInitialImportPreview} from './git-catalog.mjs';
export const CATALOG_PORT='pcms-s03-catalog';
export function validateCatalogMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  if(!message||typeof message!=='object'||Array.isArray(message)||
      Object.keys(message).some(k=>!['type','params'].includes(k))||
      message.type!=='SCAN_CATALOG')return fail('CAPABILITY_OFF');
  const p=message.params;
  if(!p||typeof p!=='object'||Array.isArray(p)||
    Object.keys(p).some(k=>!['repository','token'].includes(k))||
    !validRepository(p.repository)||typeof p.token!=='string'||
    p.token.length<12||p.token.length>512||
    !/^[\x21-\x7e]+$/.test(p.token))return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createCatalogBoundary(api,{scan=scanMainCatalog}={}){
  async function run(message,sender){
    const auth=validateCatalogMessage(api,sender,message);
    if(!auth.ok)return auth;
    const p=message.params;
    try{
      const result=await scan({repository:p.repository,token:p.token});
      if(!result?.ok||!result.complete)return result?.code?
        {ok:false,complete:false,code:result.code}:fail('CATALOG_INCOMPLETE');
      // No remotely verifiable ownership facts are inferred from a Git path.
      // Initial approval/creation intentionally stays separate and held.
      const preview=makeInitialImportPreview(result);
      return {...result,preview};
    }catch{return fail('CATALOG_INCOMPLETE');}
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
