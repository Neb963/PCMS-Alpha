import {createPresentationPreferences} from '../presentation-client.mjs';
import {normalizeFilters,normalizeColumns,COLUMN_LABELS,COLUMN_IDS} from '../presentation-preferences.mjs';
export function createPresentationWorkspace({root,el,b,notify,generator,reload}){
 const preferences=createPresentationPreferences(browser.storage.local),media=matchMedia('(prefers-color-scheme: dark)');
 function apply(value){root.host.dataset.theme=value.theme==='auto'?(media.matches?'dark':'light'):value.theme;root.host.dataset.density=value.density;applyTable()}
 preferences.subscribe(apply);media.addEventListener('change',()=>apply(preferences.get()));
 const ready=preferences.load().then(value=>{Object.assign(generator, value.generator.filters);return value}).catch(()=>{notify('Saved display settings could not be read. Retry in Appearance.');return preferences.get()});
 async function save(reduce,status){try{const result=await preferences.update(reduce);if(status)status.textContent='Saved.';return result}catch(error){
  const message=error.message==='RESTORE_HOLD'?'Settings could not be saved while a restore is in progress. Your choices are kept here; retry after it finishes.':
   error.message==='PRESENTATION_STALE'?'Saved display settings changed in another dashboard or restore. Reload this page before saving; your current choices have not overwritten them.':
   'Settings could not be saved. Your choices are kept here; retry Save.';
  if(status){status.textContent=message;status.dataset.failureCode=/^(?:PRESENTATION_[A-Z_]+|RESTORE_HOLD)$/.test(error.message)?error.message:'PRESENTATION_STORAGE_UNAVAILABLE'}else notify(message);return null}}
 function dialog(title,trigger){
  const prior=trigger||root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer presentation-dialog');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
  panel.pcmsReturnFocus=prior;
  const close=()=>{overlay.remove();queueMicrotask(()=>{if(prior?.isConnected)prior.focus({preventScroll:true})})},head=el('div','drawer-head'),body=el('div','drawer-body');
  head.append(el('h2','drawer-title',title),b('Close',close));panel.append(head,body);overlay.append(panel);root.append(overlay);
  overlay.addEventListener('click',event=>{if(event.target===overlay)close()});head.querySelector('button').focus();
  return {body,close};
 }
 function rememberFilters(){
  // This invocation records the operator's current choice. Reading the
  // mutable workspace inside the queued reducer can persist a later choice
  // under an earlier event (including an in-flight saved-view transition).
  const filters=normalizeFilters(generator);
  void ready.then(()=>save(value=>({...value,generator:{...value.generator,filters}})));
 }
 function applyTable(){
  const table=root.querySelector('#page[data-view=generators] table.data');if(!table)return;
  const defaults=['selection',...COLUMN_IDS,'actions'],columns=preferences.get().generator.columns;
  const ordered=['selection',...columns.map(c=>c.id),'actions'];
  for(const row of table.querySelectorAll('tr')){
   if(row.children.length!==defaults.length)continue;
   for(const [i,cell] of [...row.children].entries())cell.dataset.presentationColumn||=defaults[i];
   const cells=new Map([...row.children].map(cell=>[cell.dataset.presentationColumn,cell]));
   for(const id of ordered){const cell=cells.get(id),column=columns.find(c=>c.id===id);if(!cell)continue;
    cell.hidden=column?.visible===false;cell.style.width=(column?.width||(id==='selection'?42:88))+'px';
    if(cell.tagName==='TH')cell.scope='col';row.append(cell);
   }
  }
  table.style.width=(130+columns.filter(c=>c.visible).reduce((n,c)=>n+c.width,0))+'px';table.style.minWidth='100%';
 }
 function columns(event){
  const view=dialog('Generator columns',event?.currentTarget),list=el('div'),status=el('p','setting-note');status.setAttribute('role','status');
  let draft=structuredClone(preferences.get().generator.columns);
  const note=el('p','setting-note','Choose which columns to show, their order and width. Full details remain available by opening a generator.');view.body.append(note,list,status);
  function draw(focus){list.replaceChildren();for(const [i,row] of draft.entries()){
   const line=el('div','presentation-column');line.dataset.columnId=row.id;
   const label=el('label'),visible=el('input');visible.type='checkbox';visible.checked=row.visible;
   if(row.id==='generator')label.textContent='Generator · always shown';
   else{visible.setAttribute('aria-label','Show '+COLUMN_LABELS[row.id]);visible.addEventListener('change',()=>{row.visible=visible.checked});label.append(visible,document.createTextNode(COLUMN_LABELS[row.id]));}
   const width=el('input','form-input');width.type='number';width.min=70;width.max=500;width.value=row.width;width.setAttribute('aria-label',COLUMN_LABELS[row.id]+' width in pixels');width.addEventListener('input',()=>{row.width=Number(width.value)});
   const move=delta=>{const j=i+delta;if(j<0||j>=draft.length)return;[draft[i],draft[j]]=[draft[j],draft[i]];draw(row.id)};
   const up=b('↑',()=>move(-1)),down=b('↓',()=>move(1));up.setAttribute('aria-label','Move '+COLUMN_LABELS[row.id]+' up');down.setAttribute('aria-label','Move '+COLUMN_LABELS[row.id]+' down');up.disabled=i===0;down.disabled=i===draft.length-1;
   line.append(label,width,up,down);list.append(line);
  }if(focus)list.querySelector('[data-column-id="'+focus+'"] input[type=number]')?.focus()}
  draw();const applyButton=b('Save columns',async()=>{
   if(draft.some(c=>!Number.isInteger(c.width)||c.width<70||c.width>500)){status.textContent='Enter whole-number widths between 70 and 500 pixels.';return}
   applyButton.disabled=true;const saved=await save(value=>({...value,generator:{filters:normalizeFilters(generator),columns:normalizeColumns(draft)}}),status);applyButton.disabled=false;if(saved)view.close();
  },'btn primary');view.body.append(applyButton,b('Reset columns',()=>{draft=normalizeColumns();draw();status.textContent='Default columns selected. Save to apply.'}));
 }
 function savedViews(event){
  const view=dialog('Saved generator views',event?.currentTarget),name=el('input','form-input'),label=el('label','','View name'),status=el('p','setting-note'),list=el('div');
  name.id='pcms-view-name';name.maxLength=55;label.htmlFor=name.id;status.setAttribute('role','status');
  view.body.append(el('p','setting-note','Save the current search, filters, sort and column layout. Selection is preserved separately.'),label,name,status,list);
  async function use(filters,columns){const saved=await save(value=>({...value,generator:{filters,columns}}),status);if(saved){Object.assign(generator,filters,{offset:0});view.close();await reload()}}
  const builtins=el('div','presentation-tools');
  for(const [title,patch] of [['All',{}],['Needs Attention',{filter:'HELD'}],['Awaiting Review',{filter:'REVIEW'}],['Managed',{management:'MANAGED'}]]){
   const button=b(title,()=>void use(normalizeFilters(patch),preferences.get().generator.columns));button.dataset.builtinView=title;builtins.append(button);
  }view.body.append(el('h3','h3','Built-in views'),builtins,el('h3','h3','Your saved views'));
  function draw(){list.replaceChildren();for(const row of preferences.get().views){const line=el('div','presentation-view');line.append(el('strong','',row.name),b('Apply',()=>void use(row.filters,row.columns)),b('Remove',async()=>{if(await save(value=>({...value,views:value.views.filter(v=>v.id!==row.id)}),status))draw()}));list.append(line)}}
  const saveButton=b('Save current view',async()=>{
   const title=name.value.trim(),current=preferences.get();if(title.length<2){status.textContent='Enter a name with at least two characters.';return}
   if(current.views.some(v=>v.name.toLowerCase()===title.toLowerCase())){status.textContent='A view already uses this name. Choose a different name.';return}
   saveButton.disabled=true;const saved=await save(value=>({...value,views:[...value.views,{id:crypto.randomUUID().replaceAll('-',''),name:title,filters:normalizeFilters(generator),columns:value.generator.columns}]}),status);saveButton.disabled=false;if(saved){name.value='';draw()}
  },'btn primary');view.body.append(saveButton);draw();
 }
 function mountTools(){const target=root.querySelector('#page[data-view=generators] .toolbar');if(!target)return;
  target.querySelector('[data-managed-view]')?.remove();
  if(generator.management==='MANAGED'){const clear=b('Managed · clear',()=>{generator.management='ALL';generator.offset=0;void reload()});clear.dataset.managedView='';target.append(clear)}
  for(const [id,key] of [['generator-search','query'],['generator-sort','sort'],['generator-owner','owner'],['generator-source','source']]){const input=root.querySelector('#'+id);if(input&&root.activeElement!==input)input.value=generator[key]}
  if(generator.owner!=='ALL'||generator.source!=='ALL'){const extra=root.querySelector('[data-generator-extra-filters]');if(extra)extra.hidden=false;root.querySelector('[data-action=generator-filters]')?.setAttribute('aria-expanded','true')}
  if(target.querySelector('[data-display-tools]'))return;
  const actions=el('div','presentation-tools');actions.dataset.displayTools='';actions.append(b('Saved views',savedViews),b('Columns',columns));target.append(actions);applyTable();
 }
 function appearance(container){
  const section=el('section','card settings-group card-pad appearance-card'),title=el('h2','h2','Appearance and interaction'),theme=el('select','form-input'),density=el('select','form-input'),status=el('p','setting-note');
  theme.id='pcms-appearance-theme';density.id='pcms-appearance-density';status.setAttribute('role','status');
  for(const [value,text] of [['auto','System'],['light','Light'],['dark','Dark']]){const option=el('option','',text);option.value=value;theme.append(option)}
  for(const [value,text] of [['compact','Compact · 36px'],['comfortable','Comfortable · 44px']]){const option=el('option','',text);option.value=value;density.append(option)}
  theme.value=preferences.get().theme;density.value=preferences.get().density;
  const a=el('label','','Color theme'),d=el('label','','Table density');a.htmlFor=theme.id;d.htmlFor=density.id;
  const themeRow=el('div','appearance-choice'),densityRow=el('div','appearance-choice'),actions=el('div','form-foot');themeRow.append(a,theme);densityRow.append(d,density);
  actions.append(
   b('Save appearance',async()=>{await save(value=>({...value,theme:theme.value,density:density.value}),status)},'btn primary'),
   b('Reload saved settings',async()=>{try{const value=await preferences.load();theme.value=value.theme;density.value=value.density;status.textContent='Saved settings loaded.'}catch{status.textContent='Saved settings could not be read. Your choices are kept here.'}}));
  section.append(title,themeRow,densityRow,el('p','setting-note','Ctrl/Cmd+K opens search. Arrow keys move between rows. Enter opens details. Escape closes a dialog and returns focus.'),status,actions);container.replaceChildren(section);
 }
 return Object.freeze({ready,rememberFilters,applyTable,mountTools,appearance,preferences});
}
