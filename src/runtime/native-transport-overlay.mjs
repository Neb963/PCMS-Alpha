// Build-copy repair. The pinned donor and its OS host remain unchanged.
export function repairNativeTransport(source){
 const once=(before,after)=>{
  if(source.split(before).length!==2)throw Error('NATIVE_RECOVERY_ANCHOR_MISMATCH');
  source=source.replace(before,after);
 };
 // A native host services messages serially. Observations need their own
 // finite connection so they cannot queue behind a tunnel/forwarder effect.
 once('await nativeRequest("status", {}, 6000)','await dedicatedNativeRequest("status", {}, 6000)');
 once('return nativeRequest("list_entries", {}, 6000)','return dedicatedNativeRequest("list_entries", {}, 6000)');
 // A delayed disconnect from a retired connection owns only its requests.
 once('if (!item) return;','if (!item || item.port !== p) return;');
 once('for (const [id, item] of pending) {','for (const [id, item] of pending) {\n      if (item.port !== p) continue;');
 once('pending.set(id, { resolve, reject, timer });','pending.set(id, { resolve, reject, timer, port: p });');
 once('return { installed: false, ready: false, error: String(error?.message || error), lastDisconnectError };',
  `const timeout = /timed out/i.test(String(error?.message || error));
    return { installed: timeout ? null : false, ready: false,
      observation: timeout ? "TIMED_OUT" : "UNAVAILABLE",
      error: String(error?.message || error), lastDisconnectError };`);
 return source;
}
