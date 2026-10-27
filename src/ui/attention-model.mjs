// Pure incident projection. A shared root must be explicitly witnessed;
// generic failure codes never imply that independent account scopes coincide.
const severity={SERIOUS:3,ACTION_REQUIRED:2,INFORMATIONAL:1};
const shared=new Set(['personamonkey_connection','PERSONAMONKEY_HELPER_OUTAGE','PROVIDER_ROUTE_DOMAIN','provider_connection','git_connection']);
export function sharedIncidentCause(cause){
 return typeof cause==='string'&&(shared.has(cause)||
  /^git_main_change:[1-9][0-9]{0,19}:[a-f0-9]{40}$/.test(cause));
}
// Compatibility name used by existing canonical and historical readers.
export function noticeCause(n){
 return sharedIncidentCause(n?.cause)?n.cause:n.code+':'+n.scopeId;
}
export function incidentGroupKey(n){
 return sharedIncidentCause(n?.cause)?'shared:'+n.cause:
  'scope:'+n.scopeId+':'+n.code;
}
export function groupNotices(notices){
 const groups=new Map();
 for(const n of notices){
  if(!n||typeof n.scopeId!=='string'||typeof n.code!=='string')continue;
  const key=incidentGroupKey(n);let g=groups.get(key);
  if(!g){g={key,cause:noticeCause(n),code:n.code,severity:n.severity,
   notices:[],scopes:[],reviewed:true,count:0};groups.set(key,g);}
  g.notices.push(n);if(!g.scopes.includes(n.scopeId))g.scopes.push(n.scopeId);
  g.reviewed&&=n.reviewed===true;g.count+=Number.isSafeInteger(n.count)?n.count:1;
  if((severity[n.severity]||0)>(severity[g.severity]||0))g.severity=n.severity;
 }
 for(const g of groups.values())g.scopes.sort();
 return [...groups.values()].sort((a,b)=>(severity[b.severity]||0)-
  (severity[a.severity]||0)||a.key.localeCompare(b.key));
}
