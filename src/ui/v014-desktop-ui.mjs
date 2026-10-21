// v0.1.4 production desktop presentation.
 // Existing canonical view modules own all mutations, revision fencing and source effects.
import {GROUPS,panelGroup,safeQuery,generatorRow,accountRow,stableResults} from './v014-ui-core.mjs';
const q=id=>document.getElementById(id);
const tabs=new Map(),selected=new Map();
function selectGroup(route,key,focus=false){
 const state=tabs.get(route);
 if(!state||!state.groups.has(key))return false;
 const group=state.groups.get(key);
 for(const [name,row] of state.groups){
  const active=name===key;
  row.button.setAttribute('aria-pressed',String(active));
  row.button.classList.toggle('is-current',active);
  for(const panel of row.panels)panel.hidden=!active;
 }
 selected.set(route,key);
 if(focus)group.button.focus({preventScroll:true});
 return true;
}
function initGroups(route){
 const workspace=q('view-'+route);
 if(!workspace)return;
 const panels=[...workspace.children].filter(n=>n.matches?.('section.panel'));
 if(!panels.length)return;
 const definitions=GROUPS[route]||[];
 const mapping=new Map();
 for(const def of definitions)mapping.set(def.key,{label:def.label,panels:[]});
 for(let i=0;i<panels.length;i++){
  const p=panels[i];
  const heading=p.getAttribute('aria-labelledby')||'';
  const key=panelGroup(route,heading);
  if(!mapping.has(key))mapping.set(key,{label:'Other',panels:[]});
  if(!p.id)p.id='pcms-v014-'+route+'-panel-'+i;
  mapping.get(key).panels.push(p);
 }
 const active=[...mapping].filter(([,row])=>row.panels.length);
 if(active.length<=1)return; // Never conceal a single functional workspace.
 const bar=document.createElement('nav');
 bar.className='pcms-v014-workflow-nav';
 bar.setAttribute('aria-label',route==='generators'?'Generator workflows':
  route==='work-queue'?'Work queue workflows':'Settings categories');
 bar.setAttribute('role','toolbar');
 const groups=new Map();
 for(const [key,row] of active){
  const button=document.createElement('button');
  button.type='button';
  button.className='pcms-v014-workflow-button';
  button.textContent=row.label;
  button.dataset.uiGroup=key;
  button.setAttribute('aria-pressed','false');
  button.setAttribute('aria-controls',row.panels.map(p=>p.id).join(' '));
  button.addEventListener('click',()=>selectGroup(route,key));
  bar.append(button);
  groups.set(key,{...row,button});
 }
 bar.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const current=event.target.closest('button[data-ui-group]');
  if(!current||!bar.contains(current))return;
  event.preventDefault();
  const items=[...bar.querySelectorAll('button[data-ui-group]')];
  const n=items.indexOf(current);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:
    (n+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;
  selectGroup(route,items[next].dataset.uiGroup,true);
 });
 const header=workspace.querySelector(':scope > header.workspace-head');
 if(!header)return;
 header.after(bar);
 tabs.set(route,{groups,bar});
 selectGroup(route,selected.get(route)||active[0][0]);
}
for(const route of ['generators','work-queue','settings'])initGroups(route);
// Source/adoption selection from actual inventory opens the existing inspector,
// rather than leaving its real update hidden behind a different panel.
window.addEventListener('pcms-v014-workflow-request',event=>{
 const route=event.detail?.route,key=event.detail?.group;
 if(typeof route!=='string'||typeof key!=='string')return;
 if(selectGroup(route,key)&&location.hash!=='#'+route)location.hash='#'+route;
});
window.addEventListener('pcms-source-target',()=>selectGroup('generators','source'));
window.addEventListener('pcms-adoption-target',()=>selectGroup('generators','adopt'));
const jumps=[...document.querySelectorAll('[data-pcms-v014-open]')];
for(const button of jumps)button.addEventListener('click',()=>{
 const [route,key]=button.dataset.pcmsV014Open.split(':');
 if(key)selectGroup(route,key);
 if(location.hash!=='#'+route)location.hash='#'+route;
 else q('heading-'+route)?.focus({preventScroll:true});
});
// Search only the canonical local read-only inventory and account projections.
const field=q('pcms-v014-search'),results=q('pcms-v014-search-results');
let searchEpoch=0,searchTimer=null,selectedIndex=-1,found=[];
function hideResults(){
 results.hidden=true;results.replaceChildren();found=[];
 field.setAttribute('aria-expanded','false');
 field.removeAttribute('aria-activedescendant');selectedIndex=-1;
}
function command(name,type,params,ms=6500){
 return new Promise((resolve,reject)=>{
  let port,settled=false;
  const timeout=setTimeout(()=>finish(null,Error('READ_TIMEOUT')),ms);
  function finish(value,error){
   if(settled)return;
   settled=true;clearTimeout(timeout);
   try{port?.disconnect();}catch{}
   error?reject(error):resolve(value);
  }
  try{
   port=browser.runtime.connect({name});
   port.onMessage.addListener(value=>finish(value));
   port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
   port.postMessage(params?{type,params}:{type});
  }catch{finish(null,Error('READ_UNAVAILABLE'));}
 });
}
function choose(item){
 if(item.kind==='generator'){
  selectGroup('generators','inventory');
  const target=q('pcms-generator-query');
  if(target){
   target.value=item.id;
   target.dispatchEvent(new Event('input',{bubbles:true}));
  }
  location.hash='#generators';
  target?.focus({preventScroll:true});
 }else if(item.kind==='account'){
  location.hash='#accounts';
  q('heading-accounts')?.focus({preventScroll:true});
 }
 hideResults();
}
function highlight(index){
 if(!found.length)return;
 selectedIndex=(index+found.length)%found.length;
 for(let i=0;i<found.length;i++)found[i].button.setAttribute('aria-selected',String(i===selectedIndex));
 field.setAttribute('aria-activedescendant',found[selectedIndex].button.id);
 found[selectedIndex].button.scrollIntoView({block:'nearest'});
}
function renderResults(rows,error=false){
 hideResults();
 results.hidden=false;
 field.setAttribute('aria-expanded','true');
 const items=stableResults(rows);
 if(!items.length){
  const note=document.createElement('p');
  note.className='pcms-v014-search-empty';
  note.textContent=error?'Local search unavailable; no remote state inferred.':'No matching local records.';
  results.append(note);return;
 }
 const title=document.createElement('p');title.className='pcms-v014-search-hint';
 title.textContent='Local records only · select to inspect in its workspace';
 results.append(title);
 items.forEach((item,i)=>{
  const button=document.createElement('button');
  button.type='button';button.id='pcms-v014-result-'+i;
  button.setAttribute('role','option');button.setAttribute('aria-selected','false');
  button.className='pcms-v014-search-option';
  const strong=document.createElement('strong');strong.textContent=item.id;
  const badge=document.createElement('span');badge.textContent=item.kind==='account'?'Account':'Generator';
  const account=document.createElement('small');account.textContent=item.account;
  button.append(strong,badge,account);
  button.addEventListener('click',()=>choose(item));
  found.push({item,button});results.append(button);
 });
}
async function search(){
 const value=safeQuery(field.value);
 const epoch=++searchEpoch;
 if(value.length<2){hideResults();return;}
 try{
  const response=await Promise.allSettled([
   command('pcms-i04-inventory','LIST_INVENTORY',{query:value,offset:0,limit:10}),
   command('pcms-i03-accounts','LIST_ACCOUNTS')
  ]);
  if(epoch!==searchEpoch||document.hidden)return;
  const inv=response[0].status==='fulfilled'?response[0].value:null;
  const acc=response[1].status==='fulfilled'?response[1].value:null;
  if(inv?.ok!==true&&acc?.ok!==true){renderResults([],true);return;}
  const lower=value.toLowerCase();
  const rows=[
   ...(inv?.ok&&Array.isArray(inv.items)?inv.items.map(generatorRow):[]),
   ...(acc?.ok&&Array.isArray(acc.accounts)?acc.accounts.map(accountRow)
     .filter(x=>x&&x.id.toLowerCase().includes(lower)):[])
  ].filter(Boolean);
  renderResults(rows);
 }catch{if(epoch===searchEpoch)renderResults([],true);}
}
field?.addEventListener('input',()=>{
 clearTimeout(searchTimer);++searchEpoch;
 if(field.value.trim().length<2){hideResults();return;}
 // Do not replace the input node or disrupt IME/composition events.
 searchTimer=setTimeout(()=>{void search();},180);
});
field?.addEventListener('keydown',event=>{
 if(event.key==='Escape'){++searchEpoch;hideResults();return;}
 if(!found.length)return;
 if(event.key==='ArrowDown'){event.preventDefault();highlight(selectedIndex+1);}
 else if(event.key==='ArrowUp'){event.preventDefault();highlight(selectedIndex-1);}
 else if(event.key==='Enter'&&selectedIndex>=0){
  event.preventDefault();choose(found[selectedIndex].item);
 }
});
document.addEventListener('keydown',event=>{
 if(event.defaultPrevented||event.isComposing||event.repeat)return;
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
  event.preventDefault();field?.focus({preventScroll:true});field?.select();
 }else if(event.key==='Escape'&&!results.hidden){++searchEpoch;hideResults();}
});
document.addEventListener('pointerdown',event=>{
 if(!field?.contains(event.target)&&!results?.contains(event.target)){
  ++searchEpoch;hideResults();
 }
});
window.addEventListener('hashchange',()=>{++searchEpoch;hideResults();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){++searchEpoch;hideResults();}});
