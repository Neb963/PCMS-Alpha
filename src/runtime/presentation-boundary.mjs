import {PRESENTATION_KEY,SELECTION_KEY,normalizePresentation,normalizeSelection} from './presentation-preferences.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {checkpointed} from './work-checkpoint.mjs';
// One non-authorizing key, serialized across all dashboards. An admitted write
// and its readback drain before the restore safety copy; new writes are held.
export function createPresentationBoundary(api){
 let tail=Promise.resolve();
 const admitted=checkpointed(api,async(message,sender)=>{
  if(!trustedExtensionPage(api,sender))return {ok:false,code:'UNTRUSTED_SENDER'};
  if(!message||Object.keys(message).some(k=>!['kind','expected','value'].includes(k))||!['WORKSPACE','SELECTION'].includes(message.kind||'WORKSPACE')||
     !message.value||!message.expected||message.value.schema!==1||message.expected.schema!==1)
   return {ok:false,code:'PRESENTATION_INVALID'};
  const selection=message.kind==='SELECTION',key=selection?SELECTION_KEY:PRESENTATION_KEY,normalize=selection?normalizeSelection:normalizePresentation;
  const storage=api.storage.local,current=normalize((await storage.get(key))[key]);
  if(JSON.stringify(current)!==JSON.stringify(normalize(message.expected)))return {ok:false,code:'PRESENTATION_STALE'};
  const next=normalize(message.value);
  try{await storage.set({[key]:next})}catch{/* Read back a possibly committed save. */}
  const observed=(await storage.get(key))[key];
  return observed?.schema===1&&JSON.stringify(normalize(observed))===JSON.stringify(next)?{ok:true}:{ok:false,code:'PRESENTATION_SAVE_UNCONFIRMED'};
 });
 function handle(message,sender){const task=tail.then(()=>admitted(message,sender));tail=task.catch(()=>{});return task}
 return {handle,register(){api.runtime.onConnect.addListener(port=>{
  if(port.name!=='pcms-presentation')return;
  port.onMessage.addListener(message=>void handle(message,port.sender).then(out=>{
   try{port.postMessage(out)}catch{}
  }).catch(()=>{try{port.postMessage({ok:false,code:'PRESENTATION_SAVE_UNCONFIRMED'})}catch{}}));
 })}};
}
if(typeof browser!=='undefined')createPresentationBoundary(browser).register();
