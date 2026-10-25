// Build-copy native effect receipts. No OS service changes or new host.
export function repairNativePrepare(source){
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('NATIVE_PREPARE_ANCHOR_MISMATCH');source=source.replace(before,after)};
 once('export function nativeRequest(command, payload = {}, timeoutMs = 45000) {',
  'export function nativeRequest(command, payload = {}, timeoutMs = 45000, onLateReply = null) {');
 once('pending.set(id, { resolve, reject, timer, port: p });',
  'pending.set(id, { resolve, reject, timer, port: p, onLateReply, expired: false });');
 once('    pending.delete(id);\n    clearTimeout(item.timer);',
  '    pending.delete(id);\n    clearTimeout(item.timer);\n    if(item.expired){void item.onLateReply?.(msg);return;}');
 once('      pending.delete(id);\n      reject(new Error(`Local Mullvad service timed out during ${command}`));',
  `      const item=pending.get(id);
      if(onLateReply&&item)item.expired=true;else pending.delete(id);
      const error=new Error(\`Local Mullvad service timed out during \${command}\`);
      error.nativeOutcomeUncertain=true;reject(error);`);
 once('return { installed: true, ...status, error: null };',
  'return { installed: true, ...status, error: null, pending_prepare_routes: await pendingPrepareRoutes() };');
 const start=source.indexOf('export function prepareExit('),end=source.indexOf('\nexport function releaseExit(',start);
 if(start<0||end<0)throw Error('NATIVE_PREPARE_FUNCTION_MISSING');
 source=source.slice(0,start)+String.raw`
const PREPARE_PREFIX="personaMullvadPendingPrepare:";
const prepareFlights=new Map();
async function pendingPrepareRoutes(){
  try{return Object.keys(await browser.storage.local.get(null)).filter(k=>k.startsWith(PREPARE_PREFIX)).map(k=>k.slice(PREPARE_PREFIX.length));}
  catch{return ["OBSERVATION_UNAVAILABLE"];}
}
function uncertainPrepare(){
  const error=new Error("Mullvad route preparation is unconfirmed; observe the saved connection before another update");
  error.nativeOutcomeUncertain=true;return error;
}
async function settlePrepare(key,nonce){
  const saved=(await browser.storage.local.get(key))[key];
  if(saved?.nonce===nonce)await browser.storage.local.remove(key);
}
export function prepareExit(route, start = true, forwarderToken){
  const key=PREPARE_PREFIX+route.id;
  const fingerprint=JSON.stringify([route.id,route.host,route.port,start,forwarderToken]);
  const prior=prepareFlights.get(route.id);
  if(prior)return prior.fingerprint===fingerprint?prior.promise:Promise.reject(uncertainPrepare());
  const promise=(async()=>{
    // Pre-dispatch receipt contains no credential and survives a cold restart.
    let saved;
    try{saved=(await browser.storage.local.get(key))[key];}catch{throw uncertainPrepare();}
    if(saved)throw uncertainPrepare();
    const nonce=crypto.randomUUID();
    await browser.storage.local.set({[key]:{schema:1,nonce,routeId:route.id,relayIp:route.host,relayPort:Number(route.port||1080)}});
    const valid=reply=>reply?.ok!==false&&reply?.route_id===route.id&&
      reply.relay_ip===route.host&&Number(reply.relay_port)===Number(route.port||1080)&&
      reply.local_host==="127.0.0.1"&&Number.isInteger(reply.local_port)&&reply.local_port>0&&reply.local_port<=65535;
    try{
      const reply=await nativeRequest("prepare_exit",{
        route_id:route.id,relay_ip:route.host,relay_port:Number(route.port||1080),start,forwarder_token:forwarderToken
      },45000,async late=>{if(valid(late))try{await settlePrepare(key,nonce);}catch{}});
      if(!valid(reply))throw uncertainPrepare();
      await settlePrepare(key,nonce);return reply;
    }catch(error){
      // Native-host socket timeout does not cancel the daemon worker. Only
      // explicit settled negative replies permit a future automatic attempt.
      const text=String(error?.message||error);
      const missing=/not found|no such native application|not registered|native messaging api is unavailable/i.test(text);
      if((!error.nativeOutcomeUncertain&&!/timed out|disconnect|no response/i.test(text))||missing){
        await settlePrepare(key,nonce);throw error;
      }
      throw uncertainPrepare();
    }
  })().finally(()=>prepareFlights.delete(route.id));
  prepareFlights.set(route.id,{fingerprint,promise});return promise;
}`+source.slice(end);
 once('export function releaseExit(routeId) { return nativeRequest("release_exit", { route_id: routeId }, 6000); }',
  `export async function releaseExit(routeId) {
    if((await browser.storage.local.get(PREPARE_PREFIX+routeId))[PREPARE_PREFIX+routeId])throw uncertainPrepare();
    return nativeRequest("release_exit",{route_id:routeId},6000);
  }`);
 return source;
}
export function repairMullvadRuntime(source){
 const before='        try { await operations.releaseExit?.(route.id); } catch {}\n        const message = String(error?.message || error);';
 if(source.split(before).length!==2)throw Error('NATIVE_UNCERTAINTY_ANCHOR_MISMATCH');
 return source.replace(before,
  '        if(error?.nativeOutcomeUncertain!==true)try { await operations.releaseExit?.(route.id); } catch {}\n        const message = String(error?.message || error);');
}
