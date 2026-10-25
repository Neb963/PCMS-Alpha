// Ephemeral execution tracking for a consistent local restore safety copy.
// Durable restore authority remains exclusively in restore-gate.mjs.
import {createRestoreSentinel} from './journal.mjs';
const active=new Set();
export function trackPcmsWork(task){
 const promise=Promise.resolve(task);active.add(promise);
 promise.then(()=>active.delete(promise),()=>active.delete(promise));
 return promise;
}
export function checkpointed(api,fn,{allowDuringRestore=false}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 return function(...args){
  const self=this;
  return trackPcmsWork(Promise.resolve().then(async()=>{
   if(!(typeof allowDuringRestore==='function'?allowDuringRestore(...args):allowDuringRestore)&&
      (await sentinel.inspect()).held)
    return {ok:false,code:'RESTORE_HOLD'};
   return fn.apply(self,args);
  }));
 };
}
export async function settlePcmsWork({timeoutMs=30000}={}){
 const deadline=Date.now()+timeoutMs;
 while(active.size){
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('RESTORE_LOCAL_WORK_BUSY');
  let timer;
  try{
   const settled=await Promise.race([
    Promise.allSettled([...active]).then(()=>true),
    new Promise(resolve=>{timer=setTimeout(()=>resolve(false),remaining)})
   ]);
   if(!settled)throw Error('RESTORE_LOCAL_WORK_BUSY');
  }finally{clearTimeout(timer)}
 }
 return {ok:true};
}
