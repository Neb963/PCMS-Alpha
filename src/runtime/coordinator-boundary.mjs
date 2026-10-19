// S00: trusted, installed-XPI command ingress; no provider, Git or native writes.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
export const COORDINATOR_PORT='pcms-s00-coordinator';
const types=new Set(['ACCEPT_CREATE_INTENT','GET_CREATE_INTENT','LIST_CREATE_INTENTS','ADVANCE_CREATE_INTENT']);
export function validateCoordinatorMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let encoded;
  try{encoded=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!encoded||encoded.length>1600||!message||typeof message!=='object'||
     Array.isArray(message)||!types.has(message.type)||
     Object.keys(message).some(k=>!['type','params'].includes(k)))return fail('INVALID_MESSAGE');
  const p=message.params;
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  if(message.type==='ACCEPT_CREATE_INTENT'){
    if(Object.keys(p).some(k=>!['intentId','slug','origin','accountId'].includes(k)))
      return fail('INVALID_PARAMS');
  }else if(message.type==='GET_CREATE_INTENT'){
    if(Object.keys(p).some(k=>k!=='intentId')||!isSafeId(p.intentId))
      return fail('INVALID_PARAMS');
  }else if(message.type==='LIST_CREATE_INTENTS'){
    if(Object.keys(p).some(k=>!['after','limit'].includes(k))||
       (p.after!==undefined&&p.after!==null&&!isSafeId(p.after))||
       (p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100)))
      return fail('INVALID_PARAMS');
  }else if(Object.keys(p).some(k=>!['intentId','expectedRevision'].includes(k))||
    !isSafeId(p.intentId)||!Number.isSafeInteger(p.expectedRevision))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createCoordinatorBoundary(api,{open=openCanonicalDatabase,
  factory=createCoordinatorStore}={}){
  let dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const store=async()=>factory(await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;})));
  async function run(message,sender){
    const v=validateCoordinatorMessage(api,sender,message);
    if(!v.ok)return v;
    const hold=await sentinel.inspect();
    if(hold.held)return fail(hold.code);
    try{
      const s=await store(),p=message.params;
      if(message.type==='ACCEPT_CREATE_INTENT')return await s.acceptCreate(p);
      if(message.type==='GET_CREATE_INTENT')return await s.getCreate(p.intentId);
      if(message.type==='LIST_CREATE_INTENTS')return await s.listCreate(p);
      return await s.advanceCreate(p.intentId,p.expectedRevision);
    }catch{return fail('COORDINATOR_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==COORDINATOR_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender)).then(out=>{
          try{port.postMessage(out);}catch{}
        }).catch(()=>{try{port.postMessage(fail('COORDINATOR_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createCoordinatorBoundary(browser).register();
