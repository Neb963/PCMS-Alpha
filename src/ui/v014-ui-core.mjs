// v0.1.4 desktop UI: presentation-only grouping and safe local search rules.
// No writer, provider or PersonaMonkey routing authority in this module.
export const GROUPS=Object.freeze({
 generators:Object.freeze([
  {key:'inventory',label:'Inventory',heads:['generators-table-title']},
  {key:'create',label:'Create generators',heads:['pcms-supply-heading']},
  {key:'catalog',label:'Git catalog',heads:['pcms-catalog-heading']},
  {key:'adopt',label:'Adopt existing',heads:['pcms-adopt-heading']},
  {key:'stage',label:'Private staging',heads:['pcms-stage-heading']},
  {key:'source',label:'Git source',heads:['pcms-source-heading']}
 ]),
 'work-queue':Object.freeze([
  {key:'activity',label:'Activity & receipts',heads:['pcms-stage-queue-title','pcms-adoption-queue-title','pcms-supply-queue-title']},
  {key:'writeback',label:'Git writeback',heads:['pcms-writeback-heading']},
  {key:'update',label:'Source updates',heads:['pcms-existing-heading']},
  {key:'release',label:'Publication',heads:['pcms-release-heading']},
  {key:'ai',label:'AI development',heads:['pcms-ai-jobs-heading']}
 ]),
 settings:Object.freeze([
  {key:'backup',label:'Backup & restore',heads:['pcms-backup-title','pcms-restore-title']},
  {key:'automation',label:'Automation',heads:['pcms-auto-backup-title','pcms-writeback-auto-heading']},
  {key:'permissions',label:'Permissions',heads:['pcms-s06-authority-heading']},
  {key:'ai',label:'AI settings',heads:['pcms-ai-config-heading']},
  {key:'diagnostics',label:'Diagnostics',heads:['pcms-diagnostic-heading']}
 ])
});
export function panelGroup(route,heading){
 const groups=GROUPS[route]||[];
 return groups.find(g=>g.heads.includes(heading))?.key||
  (route==='work-queue'&&!heading?'activity':route==='settings'&&!heading?'permissions':'other');
}
export function safeQuery(value){
 if(typeof value!=='string')return '';
 return value.trim().slice(0,80);
}
export function generatorRow(item){
 if(!item||typeof item.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(item.slug))return null;
 return {kind:'generator',id:item.slug,account:typeof item.accountId==='string'?item.accountId.slice(0,100):''};
}
export function accountRow(item){
 if(!item||typeof item.accountId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(item.accountId))return null;
 return {kind:'account',id:item.accountId,account:''};
}
export function stableResults(items,max=10){
 const seen=new Set(),result=[];
 for(const item of items){
  if(!item||!['generator','account'].includes(item.kind)||typeof item.id!=='string')continue;
  const k=item.kind+':'+item.id;
  if(seen.has(k))continue;
  seen.add(k);result.push(item);
  if(result.length===max)break;
 }
 return result;
}
