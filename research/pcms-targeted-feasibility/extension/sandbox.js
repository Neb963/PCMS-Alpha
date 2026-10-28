// Only this packaged opaque-origin page evaluates module text.
let started=false;
addEventListener('message',async e=>{
  if(started||e.source!==parent||e.origin!==location.origin||e.data?.type!=='load')return;
  started=true; const {token,source,context,kind}=e.data;let seq=0;const waiting=new Map();
  addEventListener('message',reply=>{
    if(reply.source!==parent||reply.origin!==location.origin||reply.data?.token!==token)return;
    const r=reply.data,w=waiting.get(r.seq);if(!w)return;waiting.delete(r.seq);r.error?w.reject(Error(r.error)):w.resolve(r.result);
  });
  const api=(method,args)=>new Promise((resolve,reject)=>{
    const id=++seq;waiting.set(id,{resolve,reject});parent.postMessage({type:'rpc',token,seq:id,method,args},'*');
  });
  try {
    // Evaluated by extension code, never by WebDriver or a privileged extension page.
    await new Function('context','api',`return (async()=>{${source}\n})()`)(context,api);
    parent.postMessage({type:'loaded',token,kind,extensionAPIs:typeof browser},'*');
  } catch(err){parent.postMessage({type:'error',token,error:String(err)},'*');}
});
