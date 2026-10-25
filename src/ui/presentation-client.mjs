import {createPresentationPreferences as createPreferences} from './presentation-preferences.mjs';
export function writeDisplayState(kind,value,expected){return new Promise((resolve,reject)=>{
  const port=browser.runtime.connect({name:'pcms-presentation'});let done=false;
  const timer=setTimeout(()=>finish(null,Error('PRESENTATION_SAVE_UNKNOWN')),30000);
  function finish(out,error){if(done)return;done=true;clearTimeout(timer);try{port.disconnect()}catch{};error?reject(error):resolve(out)}
  port.onMessage.addListener(out=>finish(out));port.onDisconnect.addListener(()=>finish(null,Error('PRESENTATION_SAVE_UNKNOWN')));
  port.postMessage({kind,expected,value});
 })}
export function createPresentationPreferences(storage){
 return createPreferences(storage,{write:(value,expected)=>writeDisplayState('WORKSPACE',value,expected)});
}
