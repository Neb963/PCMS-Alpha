// All canonical operator-note/report writes participate in restore draining.
import {createOperatorRecords} from './operator-records.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {checkpointed} from './work-checkpoint.mjs';
export function createOperatorRecordBoundary(api){
 const store=createOperatorRecords({storage:api.storage.local,admitted:true});
 const handle=checkpointed(api,async (message,sender)=>{
  if(!trustedExtensionPage(api,sender))return {ok:false,code:'UNTRUSTED_SENDER'};
  if(!message||Object.keys(message).some(k=>!['key','record','expectedRevision'].includes(k))||
    !message.record||typeof message.record!=='object'||
    JSON.stringify(message.record).length>1000000||
    !(message.expectedRevision===null||Number.isSafeInteger(message.expectedRevision)&&message.expectedRevision>=0))
    return {ok:false,code:'OPERATOR_RECORD_INVALID'};
  return store.put(message.key,message.record,{expectedRevision:message.expectedRevision});
 });
 return {handle,register(){api.runtime.onConnect.addListener(port=>{
  if(port.name!=='pcms-operator-records')return;
  port.onMessage.addListener(message=>void handle(message,port.sender).then(out=>{
   try{port.postMessage(out)}catch{}
  }).catch(()=>{try{port.postMessage({ok:false,code:'OPERATOR_RECORD_WRITE_FAILED'})}catch{}}));
 })}};
}
if(typeof browser!=='undefined')createOperatorRecordBoundary(browser).register();
