// Pure decisions shared by the browser proof and synthetic fault checks.
export function restorePlan(sections,mapping) {
  const out=structuredClone(sections);
  const remap=id=>{if(!Object.hasOwn(mapping,id))throw Error(`unmapped container ${id}`);return mapping[id];};
  for(const p of out.personas.items)p.cookieStoreId=remap(p.cookieStoreId);
  for(const c of out.cookies)c.storeId=remap(c.storeId);
  for(const family of ['localStorage','indexedDB','opfs'])for(const scope of out[family])scope.storeId=remap(scope.storeId);
  for(const j of out.core.jobs) {
    delete j.lease;delete j.runtimeToken;
    if(j.effect==='sent'||j.status==='Unknown')j.status='Reconcile';
    else if(j.status!=='Complete')j.status='Recover';
    if(j.jobABI!==out.modules.package.jobABI)j.status='Incompatible';
  }
  out.core.paused=true;out.core.maintenance=true;
  // Observed host leases/tokens are evidence, never restored as current authority.
  out.personas.routeVerification='Required';
  return out;
}
export function admit(state,bound,method) {
  if(!state.module?.enabled||state.module.epoch!==bound.epoch||state.module.version!==bound.version)throw Error('revoked generation');
  if(state.maintenance||state.module.quiescing)throw Error('maintenance/update');
  if(!['checkpoint','job','effect'].includes(method))throw Error('capability denied');
  if(method!=='checkpoint'&&state.paused)throw Error('paused');
}
