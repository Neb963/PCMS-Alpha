// Narrow, same-XPI connection to pinned donor-controlled state/cookie services.
// Only attached by donor background after its guard bootstrap. Not a port/API.
let binding=null;
export function attachPcmsRestoreDonor(adapter){
  if(binding)throw Error('RESTORE_DONOR_ALREADY_ATTACHED');
  for(const key of ['snapshot','cookies','prepare','commit','containers','createContainer','importCookies']){
    if(typeof adapter?.[key]!=='function')throw Error('RESTORE_DONOR_ADAPTER_INVALID');
  }
  binding=Object.freeze({...adapter});
}
export function getPcmsRestoreDonor(){
  if(!binding)throw Error('RESTORE_DONOR_UNAVAILABLE');
  return binding;
}
