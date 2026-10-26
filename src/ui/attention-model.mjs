// Pure, deterministic projection; review never suppresses an unresolved incident.
// C-68: only an explicit shared root joins scopes. Generic failure labels
// describe symptoms and retain their affected scope; they are not outage proof.
const severity={SERIOUS:3,ACTION_REQUIRED:2,INFORMATIONAL:1};
export function noticeCause(n){
 const cause=typeof n?.cause==='string'&&n.cause?n.cause:n?.code;
 return !cause||cause===n.code||['ACCOUNT_ROUTE_UNAVAILABLE','ACCOUNT_IDENTITY_UNVERIFIED'].includes(cause)?
  n.code+':'+n.scopeId:cause;
}
export function groupNotices(notices){
  const groups=new Map();
  for(const n of notices){
    if(!n || typeof n.scopeId!=='string' || typeof n.code!=='string')continue;
    const cause=noticeCause(n);
    let g=groups.get(cause);
    if(!g){g={cause,code:n.code,severity:n.severity,notices:[],scopes:[],
      reviewed:true,count:0};groups.set(cause,g);}
    g.notices.push(n);
    if(!g.scopes.includes(n.scopeId))g.scopes.push(n.scopeId);
    g.reviewed=g.reviewed&&n.reviewed===true;
    g.count+=Number.isSafeInteger(n.count)?n.count:1;
    if((severity[n.severity]||0)>(severity[g.severity]||0))g.severity=n.severity;
  }
  for(const g of groups.values())g.scopes.sort();
  return [...groups.values()].sort((a,b)=>(severity[b.severity]||0)-
    (severity[a.severity]||0)||a.cause.localeCompare(b.cause));
}
