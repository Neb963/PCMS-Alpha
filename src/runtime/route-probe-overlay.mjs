// Bounded cancellation only for donor observations, never a race around a
// tunnel/forwarder mutation. A canceled queue slot still waits its predecessor
// before releasing successors, so fixed verifier requests cannot overlap.
export function repairRouteProbes(source){
 const once=(before,after)=>{if(source.split(before).length!==2)throw Error('ROUTE_PROBE_ANCHOR_MISMATCH');source=source.replace(before,after)};
 once('async function withRouteTestTargetLock(target, task) {',
  'async function withRouteTestTargetLock(target, task, signal = null) {');
 once('  await previous;\n  try {\n    return await task();\n  } finally {\n    release();\n    if (routeTestTargetLocks.get(target) === gate) routeTestTargetLocks.delete(target);\n  }',
  `  let aborted;
  const cancelled=new Promise((_,reject)=>{
    aborted=()=>reject(new Error("Route observation cancelled"));
    signal?.addEventListener("abort",aborted,{once:true});
    if(signal?.aborted)aborted();
  });
  try {
    await (signal?Promise.race([previous,cancelled]):previous);
    if(signal?.aborted)throw new Error("Route observation cancelled");
    return await task();
  } finally {
    signal?.removeEventListener("abort",aborted);
    // Do not let cancellation jump over an older probe's ownership.
    void previous.finally(()=>{
      release();
      if(routeTestTargetLocks.get(target)===gate)routeTestTargetLocks.delete(target);
    });
  }`);
 once('async function fetchJsonThroughRouteTest(profileId, effectiveRoute, url, timeoutMs = 15000) {',
  'async function fetchJsonThroughRouteTest(profileId, effectiveRoute, url, timeoutMs = 15000, signal = null) {');
 once('    const timer = setTimeout(() => controller.abort(), timeoutMs);',
  `    const abort=()=>controller.abort();
    signal?.addEventListener("abort",abort,{once:true});
    if(signal?.aborted)abort();
    const timer = setTimeout(abort, timeoutMs);`);
 once('      clearTimeout(timer);\n      if (routeTestRequests.get(target) === override)',
  '      clearTimeout(timer);\n      signal?.removeEventListener("abort",abort);\n      if (routeTestRequests.get(target) === override)');
 once('    }\n  });\n}\nfunction isTrustedExtensionPageSender',
  '    }\n  }, signal);\n}\nfunction isTrustedExtensionPageSender');
 once('async function performProfileTest(profileId) {','async function performProfileTest(profileId, signal = null) {');
 once('async function testProfile(profileId) {','async function testProfile(profileId, signal = null) {');
 once('const result = await performProfileTest(profileId);','const result = await performProfileTest(profileId, signal);');
 // Only the profile-test body supplies the optional observation signal.
 const start=source.indexOf('async function performProfileTest('),end=source.indexOf('\nasync function testProfile(',start);
 const body=source.slice(start,end).replaceAll(', 15000)',', 15000, signal)');
 source=source.slice(0,start)+body+source.slice(end);
 once('  let data = {};\n  let primaryConnectionError',
  '  if(signal?.aborted)return {ok:false,error:"Route observation cancelled"};\n  let data = {};\n  let primaryConnectionError');
 return source;
}
