// A Firefox onStartup observation is distinct from an extension/page reload.
// This is not independent OS/process evidence and performs no remote effects.
import {trustedExtensionPage} from './command-boundary.mjs';
const KEY='pcmsS08StartupTicket',PORT='pcms-s08-startup';
const validId=id=>typeof id==='string'&&/^s08_[a-f0-9]{12,32}$/.test(id);
export function createDiagnosticStartup(api,{clock=Date.now}={}){
 let registered=false,serial=Promise.resolve();
 const enqueue=fn=>{const p=serial.then(fn);serial=p.catch(()=>{});return p};
 async function handle(message,sender){
  if(!trustedExtensionPage(api,sender))return {ok:false,code:'UNTRUSTED_SENDER'};
  if(!message||!['ARM','STATUS'].includes(message.type)||!validId(message.params?.runId)||
    Object.keys(message).some(k=>!['type','params'].includes(k))||Object.keys(message.params).length!==1)
   return {ok:false,code:'INVALID_STARTUP_CHECK'};
  const id=message.params.runId,prior=(await api.storage.local.get(KEY))?.[KEY],version=api.runtime.getManifest().version;
  if(message.type==='STATUS')return {ok:true,observed:prior?.runId===id&&prior.version===version&&
   prior.source==='FIREFOX_ON_STARTUP'&&Number.isSafeInteger(prior.observedAt)&&prior.observedAt>=prior.armedAt,
   ...(prior?.runId===id?{runId:id,version:prior.version,armedAt:prior.armedAt,observedAt:prior.observedAt||null}:{}),
   proof:'BROWSER_STARTUP_OBSERVATION_ONLY',independentProcessProof:false};
  if(prior?.runId===id&&prior.version===version)return {ok:true,code:'RESTART_CHECK_ALREADY_ARMED'};
  const ticket={schema:1,runId:id,version,armedAt:clock(),observedAt:null,source:'ARMED_BY_OPERATOR'};
  await api.storage.local.set({[KEY]:ticket});
  if(JSON.stringify((await api.storage.local.get(KEY))?.[KEY])!==JSON.stringify(ticket))return {ok:false,code:'STARTUP_CHECK_WRITE_UNKNOWN'};
  return {ok:true,code:'RESTART_FIREFOX_TO_FINISH'};
 }
 async function startup(){
  const prior=(await api.storage.local.get(KEY))?.[KEY];
  if(prior?.schema!==1||!validId(prior.runId)||prior.version!==api.runtime.getManifest().version||
    prior.observedAt!==null||prior.source!=='ARMED_BY_OPERATOR')return;
  await api.storage.local.set({[KEY]:{...prior,observedAt:clock(),source:'FIREFOX_ON_STARTUP'}});
 }
 function register(){
  if(registered)return;registered=true;
  api.runtime.onStartup.addListener(()=>void enqueue(startup).catch(()=>{}));
  api.runtime.onConnect.addListener(port=>{
   if(port.name!==PORT)return;
   port.onMessage.addListener(message=>void enqueue(()=>handle(message,port.sender)).then(out=>{
    try{port.postMessage(out)}catch{}
   }).catch(()=>{try{port.postMessage({ok:false,code:'STARTUP_CHECK_UNAVAILABLE'})}catch{}}));
  });
 }
 return Object.freeze({register,handle,startup});
}
if(typeof browser!=='undefined')createDiagnosticStartup(browser).register();
