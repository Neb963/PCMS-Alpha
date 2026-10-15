// I17: inert operator evidence UI. Never send these entries to Core or providers.
import {CASES,STATES,TIERS,emptyChecklist,normalizeChecklist,
  recordObservation,checklistMarkdown} from './acceptance-core.mjs';
import {createSafeReport} from './safe-report.mjs';
const STORAGE_KEY='pcmsI17OperatorChecklist';
const parent=document.getElementById('view-settings');
const section=document.createElement('section');
section.className='panel pcms-acceptance';
section.setAttribute('aria-labelledby','pcms-acceptance-title');
const h=document.createElement('h2');h.id='pcms-acceptance-title';h.textContent='I17 · Operator acceptance checklist';
const expl=document.createElement('p');
expl.textContent='Local self-reported notes only, never verified acceptance or permission. H-01/H-07 require human Firefox observation. H-06 only for migration; H-02–H-05 require separate authorization when applicable. Keep credentials and source out of notes.';
const status=document.createElement('p');status.id='pcms-acceptance-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
const selection=document.createElement('select');selection.id='pcms-acceptance-case';
const caseLabel=document.createElement('label');caseLabel.htmlFor=selection.id;caseLabel.textContent='Test contract';
for(const c of CASES){const option=document.createElement('option');option.value=c.id;option.textContent=c.id+' — '+c.label;selection.append(option);}
const result=document.createElement('select');result.id='pcms-acceptance-result';
const resultLabel=document.createElement('label');resultLabel.htmlFor=result.id;resultLabel.textContent='Observed status';
for(const v of STATES){const o=document.createElement('option');o.value=v;o.textContent=v;result.append(o);}
const tier=document.createElement('select');tier.id='pcms-acceptance-tier';
const tierLabel=document.createElement('label');tierLabel.htmlFor=tier.id;tierLabel.textContent='Actual evidence tier (not independently authenticated by this form)';
for(const v of TIERS){const o=document.createElement('option');o.value=v;o.textContent=v;tier.append(o);}
const reference=document.createElement('input');reference.id='pcms-acceptance-reference';reference.maxLength=96;reference.autocomplete='off';reference.placeholder='sanitized-case-01';
const refLabel=document.createElement('label');refLabel.htmlFor=reference.id;refLabel.textContent='Opaque evidence reference, 3–96 safe characters';
const note=document.createElement('textarea');note.id='pcms-acceptance-note';note.maxLength=240;note.rows=2;
const noteLabel=document.createElement('label');noteLabel.htmlFor=note.id;noteLabel.textContent='Observed fact / blocker (12–240 characters, no secrets, URLs or accounts)';
const save=document.createElement('button');save.type='button';save.id='pcms-acceptance-save';save.textContent='Save observation locally';
const reload=document.createElement('button');reload.type='button';reload.textContent='Reload local checklist';
const build=document.createElement('input');build.id='pcms-acceptance-build';build.maxLength=64;build.placeholder='64-character XPI SHA-256 (optional)';
const buildLabel=document.createElement('label');buildLabel.htmlFor=build.id;buildLabel.textContent='Build SHA-256';
const ff=document.createElement('input');ff.id='pcms-acceptance-firefox';ff.maxLength=80;ff.placeholder='Firefox Developer Edition version (optional)';
const ffLabel=document.createElement('label');ffLabel.htmlFor=ff.id;ffLabel.textContent='Firefox build';
const fixture=document.createElement('input');fixture.id='pcms-acceptance-fixture';fixture.maxLength=96;fixture.placeholder='synthetic-fixture-01 (optional)';
const fixtureLabel=document.createElement('label');fixtureLabel.htmlFor=fixture.id;fixtureLabel.textContent='Fixture reference';
const exportButton=document.createElement('button');exportButton.type='button';exportButton.id='pcms-acceptance-export';exportButton.textContent='Export marked results + safe diagnostics (.md)';
const overview=document.createElement('p');overview.id='pcms-acceptance-overview';overview.setAttribute('role','status');
const controls=document.createElement('div');controls.className='pcms-acceptance-controls';
controls.append(caseLabel,selection,resultLabel,result,tierLabel,tier,refLabel,reference,
  noteLabel,note,save,reload,buildLabel,build,ffLabel,ff,fixtureLabel,fixture,exportButton);
const list=document.createElement('div');list.id='pcms-acceptance-list';list.setAttribute('role','region');list.setAttribute('aria-label','Recorded local acceptance results');
section.append(h,expl,status,controls,overview,list);
parent.append(section);
let current=emptyChecklist();
function show(){
  const e=current.entries[selection.value];
  result.value=e.state;tier.value=e.tier;reference.value=e.reference;note.value=e.note;
  overview.textContent='Local revision '+current.revision+' · '+CASES.filter(c=>current.entries[c.id].state==='PASS').length+
    ' operator-recorded PASS (not certified) · '+CASES.filter(c=>['FAIL','BLOCKED'].includes(current.entries[c.id].state)).length+' FAIL/BLOCKED.';
  list.replaceChildren();
  const ul=document.createElement('ul');
  for(const c of CASES){
    const li=document.createElement('li');
    const e=current.entries[c.id];
    li.textContent=c.id+' — '+e.state+' ('+e.tier+')'+(e.reference?' · evidence '+e.reference:'');
    ul.append(li);
  }
  list.append(ul);
}
async function reloadChecklist(){
  try{const stored=await browser.storage.local.get(STORAGE_KEY);
    current=normalizeChecklist(stored[STORAGE_KEY]);status.textContent='Local checklist loaded. No H evidence certified.';}
  catch{current=emptyChecklist();status.textContent='Checklist storage unavailable. Nothing saved; export only.';}
  show();
}
selection.addEventListener('change',show);
reload.addEventListener('click',reloadChecklist);
save.addEventListener('click',async()=>{
  save.disabled=true;status.textContent='Validating evidence and local revision…';
  try{
    const stored=await browser.storage.local.get(STORAGE_KEY);
    const source=stored[STORAGE_KEY]===undefined?emptyChecklist():normalizeChecklist(stored[STORAGE_KEY]);
    if(source.revision!==current.revision)throw Error('STALE_CHECKLIST_RELOAD_REQUIRED');
    const change=recordObservation(source,selection.value,{
      state:result.value,tier:tier.value,reference:reference.value.trim(),note:note.value.trim()
    },current.revision);
    if(!change.ok)throw Error(change.code);
    await browser.storage.local.set({[STORAGE_KEY]:change.value});
    const confirmed=await browser.storage.local.get(STORAGE_KEY);
    if(confirmed[STORAGE_KEY]?.revision!==change.value.revision)
      throw Error('SAVE_READBACK_UNCONFIRMED');
    current=normalizeChecklist(confirmed[STORAGE_KEY]);status.textContent='Local evidence entry saved. Self-reported, not independently accepted.';
    show();
  }catch(e){status.textContent='Not saved: '+(e.message==='STALE_CHECKLIST_RELOAD_REQUIRED'?'another view changed the local revision; reload':
    'missing or unsafe evidence / storage uncertain; reload before retry');}
  finally{save.disabled=false;}
});
async function safeDiagnostics(){
  try{
    const v=await browser.storage.local.get(['pcmsI01WakeHealth','pcmsRestoreInProgress']);
    const health=v.pcmsI01WakeHealth||{};
    return createSafeReport({wakeCount:health.wakeCount,alarmCount:health.alarmCount,
      lastWake:health.lastWake,previousBoot:health.priorBootSeen,
      restoreActive:v.pcmsRestoreInProgress?.active});
  }catch{return createSafeReport(null);}
}
exportButton.addEventListener('click',async()=>{
  exportButton.disabled=true;status.textContent='Preparing bounded redacted Markdown…';
  try{
    const snapshot=await browser.storage.local.get(STORAGE_KEY);
    const latest=snapshot[STORAGE_KEY]===undefined?emptyChecklist():normalizeChecklist(snapshot[STORAGE_KEY]);
    if(latest.revision!==current.revision)throw Error('STALE_CHECKLIST_RELOAD_REQUIRED');
    const markdown=checklistMarkdown(latest,{
      buildSha:build.value.trim(),firefox:ff.value.trim(),fixture:fixture.value.trim()
    },await safeDiagnostics());
    const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}));
    try{const a=document.createElement('a');a.href=url;a.download='pcms-i17-operator-acceptance.md';a.click();}
    finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
    status.textContent='Markdown export requested. Verify saved file separately; H tests remain operator claims.';
  }catch{status.textContent='Export held: invalid context or stale checklist. Reload and verify fields.';}
  finally{exportButton.disabled=false;}
});
await reloadChecklist();
