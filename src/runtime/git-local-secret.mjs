// A03: Git secrets belong to the extension-origin BACKGROUND IndexedDB.
// No token is ever written to storage.local, sent to a port, or exported.
// This database is deliberately separate from the canonical/portable backup DB.
const NAME='pcms-private-git-credentials-v1',OBJECT='credentials';
const RID=/^[1-9][0-9]{0,19}$/;
const TOKEN=/^[\x21-\x7e]{12,512}$/;
const fail=code=>({ok:false,code});
export const GIT_SECRET_DATABASE=NAME;
export function createBrowserGitCredentialStore({factory=()=>globalThis.indexedDB}={}){
  async function open(){
    const f=factory();if(!f?.open)throw Error('GIT_LOCAL_STORAGE_UNAVAILABLE');
    return new Promise((resolve,reject)=>{
      const req=f.open(NAME,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains(OBJECT))
          req.result.createObjectStore(OBJECT,{keyPath:'repositoryId'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(Error('GIT_LOCAL_STORAGE_UNAVAILABLE'));
      req.onblocked=()=>reject(Error('GIT_LOCAL_STORAGE_BLOCKED'));
    });
  }
  async function execute(mode,makeRequest){
    const db=await open();
    try{
      return await new Promise((resolve,reject)=>{
        let tx,request,out;
        try{
          tx=db.transaction(OBJECT,mode);
          request=makeRequest(tx.objectStore(OBJECT));
          request.onsuccess=()=>{out=request.result;};
          tx.oncomplete=()=>resolve(out);
          tx.onabort=()=>reject(Error('GIT_LOCAL_TRANSACTION_ABORTED'));
          tx.onerror=()=>reject(Error('GIT_LOCAL_TRANSACTION_FAILED'));
        }catch(e){reject(e);}
      });
    }finally{db.close();}
  }
  async function get(repositoryId){
    if(!RID.test(repositoryId||''))return fail('GIT_IDENTITY_INVALID');
    try{
      const record=await execute('readonly',s=>s.get(repositoryId));
      return record?.repositoryId===repositoryId&&TOKEN.test(record.token||'')?
        {ok:true,token:record.token}:fail('GIT_RECONNECT_REQUIRED');
    }catch{return fail('GIT_LOCAL_STORAGE_UNAVAILABLE');}
  }
  async function put(repositoryId,token){
    if(!RID.test(repositoryId||'')||!TOKEN.test(token||''))
      return fail('GIT_CREDENTIAL_INVALID');
    try{
      await execute('readwrite',s=>s.put({repositoryId,token,version:1}));
      const observed=await get(repositoryId);
      return observed.ok&&observed.token===token?{ok:true}:fail('GIT_LOCAL_WRITE_UNCERTAIN');
    }catch{return fail('GIT_LOCAL_WRITE_UNCERTAIN');}
  }
  async function remove(repositoryId){
    if(!RID.test(repositoryId||''))return fail('GIT_IDENTITY_INVALID');
    try{
      await execute('readwrite',s=>s.delete(repositoryId));
      const observed=await get(repositoryId);
      return observed.code==='GIT_RECONNECT_REQUIRED'?{ok:true}:fail('GIT_LOCAL_REMOVE_UNCERTAIN');
    }catch{return fail('GIT_LOCAL_REMOVE_UNCERTAIN');}
  }
  async function status(repositoryId){
    const value=await get(repositoryId);
    return value.ok?{ok:true,present:true}:
      value.code==='GIT_RECONNECT_REQUIRED'?{ok:false,code:'MISSING_OR_INVALID'}:value;
  }
  return Object.freeze({get,put,remove,status});
}
// Internal background-only compatibility packet for older coordinator seams.
// It never sends a native message. Do not register as a page-visible command.
export async function browserGitCredentialPacket(packet,store=createBrowserGitCredentialStore()){
  if(!packet||!RID.test(packet.repositoryId||''))return fail('DENIED');
  if(packet.action==='git.get'){
    const r=await store.get(packet.repositoryId);
    return r.ok?{ok:true,credential:r.token}:r;
  }
  if(packet.action==='git.store')return store.put(packet.repositoryId,packet.credential);
  if(packet.action==='git.remove')return store.remove(packet.repositoryId);
  if(packet.action==='git.status')return store.status(packet.repositoryId);
  return fail('DENIED');
}
