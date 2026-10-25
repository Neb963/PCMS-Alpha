import {createOperatorRecords,downloadOperatorFile} from './operator-records.mjs';
export const OPERATOR_CHECKS=Object.freeze([
 ['AC-01','Add an account, complete protected login and read its owned inventory','accounts'],
 ['AC-02','Verify distinct exits and recover or change one account route','accounts'],
 ['AC-03','Archive, reactivate and separately remove an account locally','accounts'],
 ['AC-04','Create one private generator and preserve its source','generators'],
 ['AC-05','Review batch allocation, progress and a scoped retry','generators'],
 ['AC-06','Adopt an owned generator and inspect exact originals','generators'],
 ['AC-07','Inspect and approve the initial Git import','connections'],
 ['AC-08','Observe merged READY source start development in the background','work-queue'],
 ['AC-09','Review a missing or renamed source folder without confusing identities','work-queue'],
 ['AC-10','Review native AI progress, tests, repair and human changes','work-queue'],
 ['AC-11','Verify source writeback and edit the canonical Git prompt','connections'],
 ['AC-12','Compare complete source and approve the exact publication candidate','work-queue'],
 ['AC-13','Observe an existing public update wait for rest and remain unlisted for review','work-queue'],
 ['AC-14','Check observed Refresher visibility, timing and each Pause scope','refresher'],
 ['AC-15','Close the dashboard and restart Firefox without replay or fabricated active time','refresher'],
 ['AC-16','Run disposable diagnostics and preserve an honest report','diagnostics'],
 ['AC-17','Save, inspect and restore a backup with inactive accounts and preserved history','backups'],
 ['AC-18','Browse a large fleet, find exact items and operate with keyboard and zoom','generators']
]);
export function operatorChecklistMarkdown(record){
 return '# PCMS operator observations\n\nSource: OPERATOR_REPORTED. These observations are separate from automatic tests and independent engineering evidence.\n\n'+
 OPERATOR_CHECKS.map(([id,label])=>{
  const row=record.checks?.[id]||{outcome:'NOT_TESTED',notes:''};
  return '## '+id+' — '+label+'\n\nResult: '+row.outcome+'\n\n'+(row.notes||'No notes recorded.').replaceAll('<','&lt;').replaceAll('>','&gt;');
 }).join('\n\n')+'\n';
}
export function mountOperatorChecklist(container,{card,el,b}){
 const section=card(container,'Operator observations','Record your own result and notes for each accepted journey. Automatic diagnostic results stay separate.'),
 status=el('p','setting-note','Reading saved observations…'),actions=el('div','form-foot'),rows=el('div'),records=createOperatorRecords(),key='ui:operator-checklist:accepted-v1';
 section.id='pcms-operator-checklist';status.setAttribute('role','status');section.append(actions,status,rows);
 let revision=0,record={schema:1,provenance:'OPERATOR_REPORTED',checks:{}},generation=0,savedGeneration=0,busy=false,timer=null,loaded=false;
 const fields=new Map();
 function snapshot(){return {schema:1,provenance:'OPERATOR_REPORTED',updatedAt:Date.now(),checks:Object.fromEntries([...fields].map(([id,{result,notes}])=>[id,{outcome:result.value,notes:notes.value}]))}}
 async function save(){
  clearTimeout(timer);if(busy||!loaded)return;busy=true;saveButton.disabled=true;
  const at=generation,value=snapshot();status.textContent='Saving observations…';
  try{
   const out=await records.put(key,value,{expectedRevision:revision});
   if(!out.ok){status.textContent='Saved observations changed in another PCMS tab. Your input is kept. Export this draft or reload the saved version.';return}
   revision=out.row.revision;record=value;savedGeneration=at;
   status.textContent=generation===at?'Observations saved.':'Newer notes are waiting to save.';
  }catch(e){status.textContent=e?.message==='OPERATOR_RECORD_RESTORE_HOLD'?'Finish or cancel restore preparation before saving observations. Your input is kept.':'Observations could not be saved. Your input is kept; retry Save observations.'}
  finally{busy=false;saveButton.disabled=false;if(generation!==at)timer=setTimeout(()=>void save(),350)}
 }
 function changed(){generation++;status.textContent='Unsaved observations';clearTimeout(timer);timer=setTimeout(()=>void save(),350)}
 for(const [id,label,route] of OPERATOR_CHECKS){
  const row=el('details','setting-note'),head=el('summary','',id+' · '+label),result=el('select','form-input'),notes=el('textarea','form-input');
  result.id='pcms-check-'+id;result.setAttribute('aria-label',id+' result');
  for(const [value,text] of [['NOT_TESTED','Not tested'],['PASS','Pass'],['FAIL','Fail']]){const option=el('option','',text);option.value=value;result.append(option)}
  notes.id='pcms-notes-'+id;notes.rows=3;notes.maxLength=8000;notes.setAttribute('aria-label',id+' evidence notes');notes.placeholder='What you observed, where and when';
  const resultLabel=el('label','','Your result');resultLabel.htmlFor=result.id;
  const notesLabel=el('label','','Evidence notes');notesLabel.htmlFor=notes.id;
  result.disabled=notes.disabled=true;result.addEventListener('change',changed);notes.addEventListener('input',changed);
  const open=b('Open relevant workspace',()=>{},'btn small');
  if(['connections','backups','diagnostics'].includes(route))open.dataset.settings=route;else open.dataset.nav=route;
  row.append(head,resultLabel,result,notesLabel,notes,open);rows.append(row);fields.set(id,{result,notes});
 }
 const saveButton=b('Save observations',()=>void save(),'btn primary'),reload=b('Reload saved observations',()=>{
  if(generation!==savedGeneration&&!window.confirm('Replace the unsaved observations on this page with the saved version?'))return;
  void load();
 },'btn small');
 actions.append(saveButton,reload,b('Export Markdown',()=>downloadOperatorFile('pcms-operator-observations.md',operatorChecklistMarkdown(snapshot())),'btn small'),
 b('Export JSON',()=>downloadOperatorFile('pcms-operator-observations.json',JSON.stringify(snapshot(),null,2)+'\n','application/json'),'btn small'));
 async function load(){
  saveButton.disabled=reload.disabled=true;
  try{
   const saved=await records.get(key);revision=saved?.revision||0;
   record=saved?.record||{schema:1,provenance:'OPERATOR_REPORTED',checks:{}};
   if(record.schema!==1||record.provenance!=='OPERATOR_REPORTED')throw Error('OPERATOR_RECORD_VERSION_UNSUPPORTED');
   for(const [id,{result,notes}] of fields){const row=record.checks?.[id];result.value=['PASS','FAIL','NOT_TESTED'].includes(row?.outcome)?row.outcome:'NOT_TESTED';notes.value=typeof row?.notes==='string'?row.notes:'';result.disabled=notes.disabled=false}
   generation=savedGeneration=0;loaded=true;status.textContent=saved?'Saved operator observations loaded.':'No operator observations recorded. Start with any journey.';
  }catch{status.textContent='Saved observations could not be read. Retry Reload saved observations.'}
  finally{saveButton.disabled=!loaded;reload.disabled=false}
 }
 void load();
}
