const output=document.querySelector('#result');let frame,removeReceiver;
// Complete browser commands are exposed for the disposable external controller.
// The controller invokes packaged code; it never evaluates supplied module code.
window.proof=async function(m){const r=await browser.runtime.sendMessage(m);output.textContent=JSON.stringify(r,null,2);return r;};
async function mount(){
  const s=await window.proof({op:'state'});removeReceiver?.();frame?.remove();
  if(!s.module?.enabled)return;
  const p=s.module.package,bound={version:s.module.version,epoch:s.module.epoch};
  frame=document.createElement('iframe');frame.src='sandbox.html';document.querySelector('#module').append(frame);
  const own=frame,token=crypto.randomUUID();
  const receive=async e=>{
    if(e.source!==own.contentWindow||e.origin!=='null'||e.data?.token!==token||e.data?.type!=='rpc')return;
    const m=e.data;try{const result=await window.proof({op:'uiRPC',bound,method:m.method,args:m.args});own.contentWindow?.postMessage({token,seq:m.seq,result},'*');}
    catch(err){own.contentWindow?.postMessage({token,seq:m.seq,error:String(err)},'*');}
  };
  addEventListener('message',receive);removeReceiver=()=>removeEventListener('message',receive);
  frame.onload=()=>own.contentWindow.postMessage({type:'load',token,source:p.ui,kind:'ui',context:{}},'*');
}
window.mountProofModule=mount;
async function fileJSON(id){return JSON.parse(await document.querySelector(id).files[0].text());}
for(const op of ['enable','disable','replayOld','continueRestore','verifyRestore'])document.getElementById(op).onclick=()=>window.proof({op}).then(mount).catch(e=>output.textContent=String(e));
document.querySelector('#refresh').onclick=mount;
document.querySelector('#install').onclick=async()=>{await window.proof({op:'install',package:await fileJSON('#package')});await mount();};
document.querySelector('#seed').onclick=async()=>window.proof({op:'seed',fixture:await fileJSON('#fixture')});
for(const op of ['capture','captureCut'])document.getElementById(op).onclick=()=>window.proof({op:'capture',interrupt:op==='captureCut'}).catch(e=>output.textContent=String(e));
for(const op of ['restore','restoreCut'])document.getElementById(op).onclick=async()=>window.proof({op:'restore',bytes:[...new Uint8Array(await document.querySelector('#archive').files[0].arrayBuffer())],interrupt:op==='restoreCut'}).catch(e=>output.textContent=String(e));
await mount();
