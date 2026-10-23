// A03 browser-only Git storage: deterministic IndexedDB completion and restart
// oracles. No network, local OS helpers, provider or private repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserGitCredentialStore,browserGitCredentialPacket,GIT_SECRET_DATABASE}
  from '../src/runtime/git-local-secret.mjs';
import {createCatalogBoundary} from '../src/runtime/catalog-boundary.mjs';
const TOKEN='github_pat_'+'q'.repeat(42);
function indexedDBFixture({abortWrites=false}={}){
  const databases=new Map(),changed=new Map();
  const factory={
    open(name){
      const req={result:null,error:null,onupgradeneeded:null,onsuccess:null,onerror:null};
      queueMicrotask(()=>{
        let db=databases.get(name),fresh=false;
        if(!db){
          fresh=true;
          const stores=new Map();
          db={
            objectStoreNames:{contains:k=>stores.has(k)},
            createObjectStore(name,{keyPath}){
              const data=new Map();stores.set(name,{keyPath,data});
              return data;
            },
            transaction(name,mode){
              const record=stores.get(name);if(!record)throw Error('STORE_MISSING');
              let reqs=0,finished=false,mutations=[];
              const tx={oncomplete:null,onabort:null,onerror:null,objectStore(){
                const req=(action,key,value)=>{
                  reqs++;
                  const r={result:undefined,error:null,onsuccess:null,onerror:null};
                  queueMicrotask(()=>{
                    if(action==='get')r.result=structuredClone(record.data.get(key));
                    else if(action==='put'){
                      r.result=value[record.keyPath];
                      mutations.push(()=>record.data.set(r.result,structuredClone(value)));
                    }else mutations.push(()=>record.data.delete(key));
                    reqs--;r.onsuccess?.({target:r});
                    queueMicrotask(()=>{
                      if(!reqs&&!finished){finished=true;
                        if(abortWrites&&mode==='readwrite'){tx.onabort?.();}
                        else{for(const f of mutations)f();tx.oncomplete?.();}
                      }
                    });
                  });
                  return r;
                };
                return {
                  get:key=>req('get',key),
                  put:value=>req('put',null,value),
                  delete:key=>req('delete',key)
                };
              }};
              return tx;
            },
            close(){}
          };
          databases.set(name,db);changed.set(name,stores);
        }
        req.result=db;
        if(fresh)req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  };
  return {factory,databases,changed};
}
test('A03 durable extension database isolates multiple repository IDs across service reopen',async()=>{
 const fixture=indexedDBFixture(),store=createBrowserGitCredentialStore({factory:()=>fixture.factory});
 assert.equal((await store.put('42',TOKEN)).ok,true);
 assert.equal((await store.put('43','ghp_'+'x'.repeat(35))).ok,true);
 const reopened=createBrowserGitCredentialStore({factory:()=>fixture.factory});
 assert.deepEqual(await reopened.status('42'),{ok:true,present:true});
 assert.equal((await reopened.get('42')).token,TOKEN);
 assert.equal((await reopened.get('43')).token,'ghp_'+'x'.repeat(35));
 assert.equal(fixture.databases.size,1);
 assert.ok(fixture.databases.has(GIT_SECRET_DATABASE));
 assert.equal((await reopened.remove('42')).ok,true);
 assert.equal((await store.get('42')).code,'GIT_RECONNECT_REQUIRED');
 assert.equal((await store.get('43')).ok,true);
});
test('A03 local commit interruption is uncertain and cannot invent configured secret',async()=>{
 const fixture=indexedDBFixture({abortWrites:true});
 const store=createBrowserGitCredentialStore({factory:()=>fixture.factory});
 assert.equal((await store.put('42',TOKEN)).code,'GIT_LOCAL_WRITE_UNCERTAIN');
 assert.equal((await store.get('42')).code,'GIT_RECONNECT_REQUIRED');
 const readFail=createBrowserGitCredentialStore({factory:()=>({open(){throw Error('IDB_LOCKED')}})});
 assert.equal((await readFail.get('42')).code,'GIT_LOCAL_STORAGE_UNAVAILABLE');
 assert.equal((await readFail.remove('42')).code,'GIT_LOCAL_REMOVE_UNCERTAIN');
});
test('A03 credential packet is internal and rejects unauthorized verbs/IDs',async()=>{
 const fixture=indexedDBFixture(),store=createBrowserGitCredentialStore({factory:()=>fixture.factory});
 assert.deepEqual(await browserGitCredentialPacket({action:'git.read-all',repositoryId:'42'},store),
   {ok:false,code:'DENIED'});
 assert.deepEqual(await browserGitCredentialPacket({action:'git.get',repositoryId:'../42'},store),
   {ok:false,code:'DENIED'});
 assert.deepEqual(await browserGitCredentialPacket({action:'git.store',repositoryId:'42',credential:'short'},store),
   {ok:false,code:'GIT_CREDENTIAL_INVALID'});
 const saved=await browserGitCredentialPacket({action:'git.store',repositoryId:'42',credential:TOKEN},store);
 assert.deepEqual(saved,{ok:true});
 assert.deepEqual(await browserGitCredentialPacket({action:'git.status',repositoryId:'42'},store),
   {ok:true,present:true});
});
test('A03 default Git connect persists only nonsecret metadata, no OS native service',async()=>{
 const fixture=indexedDBFixture();
 const previous=globalThis.indexedDB;
 globalThis.indexedDB=fixture.factory;
 const map=new Map(),calls=[];
 const api={
  runtime:{id:'fixture',getURL:path=>'moz-extension://fixture/'+path,
    sendNativeMessage:async()=>{throw Error('FORBIDDEN_NATIVE')}},
  storage:{local:{
    async get(k){return k===null?Object.fromEntries(map):
      Object.fromEntries((Array.isArray(k)?k:[k]).filter(v=>map.has(v)).map(v=>[v,map.get(v)]));},
    async set(rows){calls.push('set');for(const [k,v] of Object.entries(rows)){
      assert.ok(!JSON.stringify(v).includes(TOKEN),'token was saved in browser.storage.local');
      map.set(k,v);
    }},
    async remove(k){map.delete(k);}
  }}
 };
 const sender={id:'fixture',url:api.runtime.getURL('pcms/index.html')};
 const transport=async()=>({status:200,json:async()=>({
   full_name:'Neb963/per-gens',private:true,id:42
 })});
 try {
  const boundary=createCatalogBoundary(api,{transport});
  const connected=await boundary.run({type:'CONNECT_GIT',params:{
    repository:'Neb963/per-gens',token:TOKEN}},sender);
  assert.equal(connected.ok,true,JSON.stringify(connected));
  assert.equal(connected.code,'GIT_CONNECTED_LOCALLY_VERIFIED');
  assert.equal(map.get('pcmsS03Git')?.repositoryId,'42');
  assert.equal(map.has('pcmsS03GitPending'),false);
  const saved=createBrowserGitCredentialStore();
  assert.equal((await saved.get('42')).token,TOKEN);
  assert.equal((await boundary.run({type:'GIT_STATUS'},sender)).ok,true);
  assert.equal((await boundary.run({type:'DISCONNECT_GIT'},sender)).code,'GIT_DISCONNECTED');
  assert.equal((await saved.get('42')).code,'GIT_RECONNECT_REQUIRED');
 }finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
});
