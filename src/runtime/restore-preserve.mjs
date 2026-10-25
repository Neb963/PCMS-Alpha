// Called only inside the donor-owned restore adapter. Imported source gets
// independent IDs; unrelated scripts/workflows and their execution stay intact.
export function preserveUnselectedDonorSources(imported,current,targetIds,{newId=kind=>kind+'-restore-'+crypto.randomUUID().replaceAll('-','')}={}){
 const targets=new Set(targetIds),scriptIds=new Map(),workflowIds=new Map();
 const allocate=(kind,objects,original)=>{let id;do{id=newId(kind)}while(objects[id]||original[id]);return id;};
 for(const oldId of new Set(imported.maps.script.values())){
  let id=oldId;
  if(current.scripts?.[oldId])id=allocate('script',imported.state.scripts,current.scripts||{});
  scriptIds.set(oldId,id);
  imported.state.scripts[id]={...structuredClone(imported.state.scripts[oldId]),id};
 }
 for(const [key,id] of imported.maps.script)imported.maps.script.set(key,scriptIds.get(id));
 for(const id of targets){const p=imported.state.profiles[id];if(p)p.scriptIds=(p.scriptIds||[]).map(s=>scriptIds.get(s)||s);}
 for(const oldId of new Set(imported.maps.workflow.values())){
  let id=oldId;
  if(current.workflows?.[oldId])id=allocate('workflow',imported.state.workflows,current.workflows||{});
  workflowIds.set(oldId,id);
  const w=structuredClone(imported.state.workflows[oldId]);
  w.id=id;for(const step of w.steps||[])step.scriptIds=(step.scriptIds||[]).map(s=>scriptIds.get(s)||s);
  imported.state.workflows[id]=w;
 }
 for(const [key,id] of imported.maps.workflow)imported.maps.workflow.set(key,workflowIds.get(id));
 for(const [id,script] of Object.entries(current.scripts||{})){
  const copy=structuredClone(script);
  // Detach only the explicitly replaced Persona targets. Other assignments,
  // source bytes, enable flags and external ownership are preserved.
  if(Array.isArray(copy.profileIds))copy.profileIds=copy.profileIds.filter(p=>!targets.has(p));
  imported.state.scripts[id]=copy;
 }
 for(const [id,workflow] of Object.entries(current.workflows||{}))
  imported.state.workflows[id]=structuredClone(workflow);
 return imported;
}
