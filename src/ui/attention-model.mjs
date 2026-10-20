// Pure, deterministic projection; review never suppresses an unresolved incident.
const severity={SERIOUS:3,ACTION_REQUIRED:2,INFORMATIONAL:1};
export function groupNotices(notices){
  const groups=new Map();
  for(const n of notices){
    if(!n || typeof n.scopeId!=='string' || typeof n.code!=='string')continue;
    let g=groups.get(n.scopeId);
    if(!g){g={scopeId:n.scopeId,severity:n.severity,notices:[]};groups.set(n.scopeId,g);}
    g.notices.push(n);
    if((severity[n.severity]||0)>(severity[g.severity]||0))g.severity=n.severity;
  }
  return [...groups.values()].sort((a,b)=>(severity[b.severity]||0)-
    (severity[a.severity]||0)||a.scopeId.localeCompare(b.scopeId));
}
