// Build-copy native effect receipts. No OS service changes or new host.
export function repairNativePrepare(source){
 source='import {withNativeReceiptLock} from "../pcms/native-receipts.mjs";\n'+source;
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
function knownPreparedReceipt(row,route){
  const keys=['schema','phase','nonce','routeId','relayIp','relayPort','password','createdAtMs'];
  return row&&typeof row==='object'&&!Array.isArray(row)&&row.schema===2&&row.phase==='PREPARED'&&
    row.routeId===route.id&&row.relayIp===route.host&&row.relayPort===Number(route.port||1080)&&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.nonce||'')&&/^[a-f0-9]{64}$/.test(row.password||'')&&
    Number.isSafeInteger(row.createdAtMs)&&row.createdAtMs>0&&row.createdAtMs<=Date.now()&&
    Object.keys(row).every(key=>keys.includes(key));
}
async function settlePrepare(key,nonce){
  await withNativeReceiptLock(key,async()=>{
    const saved=(await browser.storage.local.get(key))[key];
    if(saved?.nonce===nonce)await browser.storage.local.remove(key);
  });
}
export function prepareExit(route, start = true, forwarderToken){
  const key=PREPARE_PREFIX+route.id;
  const fingerprint=JSON.stringify([route.id,route.host,route.port,start,forwarderToken]);
  const prior=prepareFlights.get(route.id);
  if(prior)return prior.fingerprint===fingerprint?prior.promise:Promise.reject(uncertainPrepare());
  const promise=(async()=>{
    // Private, short-lived reconciliation credential; excluded from portable exports.
    const nonce=crypto.randomUUID();
    const receipt={schema:2,phase:'PREPARED',nonce,routeId:route.id,relayIp:route.host,relayPort:Number(route.port||1080),password:forwarderToken,createdAtMs:Date.now()};
    try{
     await withNativeReceiptLock(key,async()=>{
      const saved=(await browser.storage.local.get(key))[key];
      if(knownPreparedReceipt(saved,route))await browser.storage.local.remove(key);
      else if(saved!==undefined)throw uncertainPrepare();
      await browser.storage.local.set({[key]:receipt});
      await browser.storage.local.set({[key]:{...receipt,phase:'DISPATCH_POSSIBLE'}});
     });
    }
    catch{const error=uncertainPrepare();error.nativeNoDispatch=true;throw error;}
    const valid=reply=>reply?.ok===true&&reply.ready===true&&reply?.route_id===route.id&&
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
      if(error.nativeNotSent===true||(error.nativeReply===true&&!/timed out|disconnect|no response|returned no response/i.test(text))){
        await settlePrepare(key,nonce);throw error;
      }
      throw uncertainPrepare();
    }
  })().finally(()=>prepareFlights.delete(route.id));
  prepareFlights.set(route.id,{fingerprint,promise});return promise;
}
// Private background recovery candidate, never a general proxy resolution or
// a public port response. The secret is excluded from every portable export.
export async function inspectPendingPreparation(routeId,status){
  const row=(await browser.storage.local.get(PREPARE_PREFIX+routeId))[PREPARE_PREFIX+routeId];
  if(status?.installed!==true||status.ready!==true||status.version!=="0.3.0"||
     row?.schema!==2||row.phase!=='DISPATCH_POSSIBLE'||row.routeId!==routeId||!/^[a-f0-9]{64}$/.test(row.password||"")||
     !/^[a-zA-Z0-9-]{8,100}$/.test(row.nonce||"")||
     !Number.isSafeInteger(row.createdAtMs)||Date.now()-row.createdAtMs>=3600000||Date.now()<row.createdAtMs)return null;
  const exits=(status.active_exits||[]).filter(e=>e.route_id===routeId&&e.relay_ip===row.relayIp&&Number(e.relay_port)===row.relayPort&&
    e.local_host==="127.0.0.1"&&Number.isInteger(e.local_port)&&e.local_port>0&&e.local_port<=65535);
  if(exits.length!==1)return null;
  return {...row,endpoint:exits[0]};
}
export async function settleObservedPreparation(candidate){
  const current=await inspectPendingPreparation(candidate.routeId,await getNativeStatus());
  if(!current||current.nonce!==candidate.nonce||current.password!==candidate.password||
     JSON.stringify(current.endpoint)!==JSON.stringify(candidate.endpoint))return false;
  await settlePrepare(PREPARE_PREFIX+candidate.routeId,candidate.nonce);return true;
}`+source.slice(end);
 once('export function releaseExit(routeId) { return nativeRequest("release_exit", { route_id: routeId }, 6000); }',
  `export async function releaseExit(routeId) {
    const key=PREPARE_PREFIX+routeId,nonce=crypto.randomUUID();
    await withNativeReceiptLock(key,async()=>{
    if((await browser.storage.local.get(key))[key]!==undefined)throw uncertainPrepare();
      await browser.storage.local.set({[key]:{schema:2,phase:'DISPATCH_POSSIBLE',operation:'RELEASE',routeId,nonce,createdAtMs:Date.now()}});
    });
    const valid=reply=>reply?.ok===true&&typeof reply.released==='boolean';
    try{
      const reply=await nativeRequest("release_exit",{route_id:routeId},6000,async late=>{
        if(valid(late))try{await settlePrepare(key,nonce);}catch{}
      });
      if(!valid(reply))throw uncertainPrepare();
      await settlePrepare(key,nonce);return reply;
    }catch(error){
      if(error.nativeNotSent===true||(error.nativeReply===true&&!/timed out|disconnect|no response|returned no response/i.test(String(error.message)))){
        await settlePrepare(key,nonce);throw error;
      }
      throw uncertainPrepare();
    }
  }`);
 return source;
}
export function repairMullvadRuntime(source){
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('NATIVE_RUNTIME_ANCHOR_MISMATCH');source=source.replace(before,after)};
 once('operations, now = () => Date.now() } = {})', 'operations, now = () => Date.now(), onReadiness = () => {} } = {})');
 once('    status = normalizeNativeStatus(await operations.getStatus());\n    return status;',
  '    status = normalizeNativeStatus(await operations.getStatus());\n    onReadiness(status);\n    return status;');
 once('function setStatus(next) { status = normalizeNativeStatus(next); return status; }',
  'function setStatus(next) { status = normalizeNativeStatus(next); onReadiness(status); return status; }');
 const before='        try { await operations.releaseExit?.(route.id); } catch {}\n        const message = String(error?.message || error);';
 if(source.split(before).length!==2)throw Error('NATIVE_UNCERTAINTY_ANCHOR_MISMATCH');
 once(before,
  '        if(error?.nativeOutcomeUncertain!==true&&error?.nativeNoDispatch!==true&&error?.nativeNotSent!==true)try { await operations.releaseExit?.(route.id); } catch {}\n        const message = String(error?.message || error);'
 );
 once('          ready: false,\n          error: message','          ready: false,\n          preparationHeld: error?.nativeOutcomeUncertain===true||error?.nativeNoDispatch===true,\n          error: message');
 once('  async function resolve(route) {','  async function resolve(route,{fresh=false}={}) {');
 once('if (cached && now() - cached.at < 8000) {','if (!fresh && cached && now() - cached.at < 8000) {');
 const anchor='        let forwarderToken = cachedTokenIsFresh ? cached.route.password : createForwarderToken();\n        let tokenCreatedAt = cachedTokenIsFresh ? cached.tokenCreatedAt : now();';
 once(anchor,`        const existing=(bridgeStatus.active_exits||[]).filter(e=>e.route_id===route.id&&e.relay_ip===route.host&&Number(e.relay_port)===Number(route.port||1080)&&
          e.local_host==="127.0.0.1"&&e.local_port===cached?.route?.port);
        const pending=bridgeStatus.pending_prepare_routes||[];
        if(cachedTokenIsFresh&&bridgeStatus.ready===true&&existing.length===1&&!pending.includes(route.id)&&!pending.includes("OBSERVATION_UNAVAILABLE")){
          if(startedLifecycleGeneration!==lifecycleGeneration||startedRouteGeneration!==(routeGenerations.get(route.id)||0))return null;
          routes.set(route.id,{...cached,at:now()});return cached.route;
        }
        // Only actual preparation/renewal rotates a credential. A unique token
        // later proves that THIS uncertain operation reached its last mutation.
        let forwarderToken = createForwarderToken();
        let tokenCreatedAt = now();`);
 once('    const tabs = await browserApi.tabs.query({});',
  '    if(inFlight.size||(await refreshStatus()).pending_prepare_routes?.length)return false;\n    const tabs = await browserApi.tabs.query({});');
 once('      await operations.stopTunnel();\n      routes.clear();','      clear();\n      onReadiness({...status,ready:false},{idle:true});\n      await operations.stopTunnel();');
 once('  return { resolve, refreshStatus, maybeStopIdle, clear, drop, setStatus, getStatus };',
  `  function recoveryGeneration(routeId){return {routeId,lifecycle:lifecycleGeneration,route:routeGenerations.get(routeId)||0};}
  function recoveryCurrent(generation){return !!generation&&generation.lifecycle===lifecycleGeneration&&
    generation.route===(routeGenerations.get(generation.routeId)||0)&&!inFlight.has(generation.routeId);}
  function acceptObservedPreparation(route,prepared,password,tokenCreatedAt,generation){
    if(generation?.routeId!==route.id||!recoveryCurrent(generation))return false;
    routes.set(route.id,{route:materialize(route,prepared,password),at:now(),tokenCreatedAt});
    return true;
  }
  return { resolve, refreshStatus, maybeStopIdle, clear, drop, setStatus, getStatus, recoveryGeneration,recoveryCurrent,acceptObservedPreparation };`);
 return source;
}
