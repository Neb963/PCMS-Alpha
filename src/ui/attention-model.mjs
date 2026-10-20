// Pure, deterministic projection; review never suppresses an unresolved incident.
// C-68: group by the causal key (cause, defaulting to the problem code), so
// one outage affecting many scopes is one incident, while unrelated root
// causes on the same scope stay separate.
const severity={SERIOUS:3,ACTION_REQUIRED:2,INFORMATIONAL:1};
export function groupNotices(notices){
  const groups=new Map();
  for(const n of notices){
    if(!n || typeof n.scopeId!=='string' || typeof n.code!=='string')continue;
    const cause=typeof n.cause==='string'&&n.cause?n.cause:n.code;
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
