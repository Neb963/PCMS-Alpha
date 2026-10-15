import { DESTINATIONS, resolveDestination, invalidDestination } from './routes.mjs';

const nav = document.getElementById('navigation');
const menu = document.getElementById('menu');
const sidebar = document.getElementById('sidebar');
const currentStatus = document.getElementById('navigation-status');
const workspaceCrumb = document.getElementById('pcms-current-workspace');
const quickSearch = document.getElementById('pcms-quick-generator-search');
const invalidNotice = document.getElementById('unknown-route');

function closeMenu(restoreFocus = false) {
  menu.setAttribute('aria-expanded', 'false');
  sidebar.classList.remove('open');
  if (restoreFocus) menu.focus();
}

let runtimeHealth=null,canonicalHealth=null;
function renderCapabilityStatus(){
  currentStatus.textContent=canonicalHealth?.held===true?'Restore or storage hold · inspect Settings':
    runtimeHealth?.donorReady===false?'Donor guard unavailable · inspect Accounts':
    runtimeHealth?.donorReady===true&&canonicalHealth?.storage==='READY'?
      'Protected workflows available · each action checks its target':
      'Reading runtime eligibility…';
}
window.addEventListener('pcms-runtime-health',e=>{runtimeHealth=e.detail;renderCapabilityStatus();});
window.addEventListener('pcms-canonical-health',e=>{canonicalHealth=e.detail;renderCapabilityStatus();});
function render({ focusHeading = false } = {}) {
  const selected = resolveDestination(location.hash);
  for (const destination of DESTINATIONS) {
    const item = document.getElementById(`view-${destination}`);
    const link = nav.querySelector(`[data-workspace="${destination}"]`);
    item.hidden = destination !== selected;
    if (destination === selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const heading = document.getElementById(`heading-${selected}`);
  document.title = `PCMS Alpha — ${heading.textContent}`;
  renderCapabilityStatus();
  workspaceCrumb.textContent = heading.textContent;
  invalidNotice.hidden = !invalidDestination(location.hash);
  closeMenu();
  if (focusHeading) heading.focus({ preventScroll: true });
}

nav.addEventListener('click', event => {
  const link = event.target.closest('a[data-workspace]');
  if (link && link.getAttribute('href') === location.hash) {
    document.getElementById(`heading-${resolveDestination(location.hash)}`).focus({ preventScroll: true });
  }
});
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  document.getElementById('main').focus({ preventScroll: true });
});
window.addEventListener('hashchange', () => render({ focusHeading: true }));
menu.addEventListener('click', () => {
  const opening = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(opening));
  sidebar.classList.toggle('open', opening);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    closeMenu(true);
  }
});

// Read-only cross-workspace lookup is implemented in global-search-view.mjs.
// The shell only supplies explicit navigation to the real inventory panel.
const generatorPanels=new Map(
  [...document.querySelectorAll('#view-generators [data-pcms-generator-panel]')]
    .map(panel=>[panel.dataset.pcmsGeneratorPanel,panel])
);
function showGeneratorPanel(name,{focus=false}={}){
  const selected=generatorPanels.get(name);
  if(!selected)return false;
  for(const [key,panel] of generatorPanels)panel.hidden=key!==name;
  for(const button of document.querySelectorAll('[data-pcms-jump]')){
    button.setAttribute('aria-pressed',String(
      selected.contains(document.getElementById(button.dataset.pcmsJump))));
  }
  if(focus){
    const heading=selected.querySelector('h2');
    if(heading){
      heading.tabIndex=-1;
      heading.scrollIntoView({block:'start'});
      heading.focus({preventScroll:true});
    }
  }
  return true;
}
document.querySelectorAll('[data-pcms-jump]').forEach(button=>{
  button.addEventListener('click',()=>{
    const target=document.getElementById(button.dataset.pcmsJump);
    if(target && !target.closest('.workspace')?.hidden){
      showGeneratorPanel(target.closest('[data-pcms-generator-panel]')?.dataset.pcmsGeneratorPanel,{focus:true});
    }
  });
});
// Cross-workspace target events also select the correct panel before an
// existing source/adoption handler displays its canonical revision-fenced data.
window.addEventListener('pcms-source-target',()=>showGeneratorPanel('source'));
window.addEventListener('pcms-adoption-target',()=>showGeneratorPanel('adopt'));
// Work Queue exposes one real workflow at a time, preserving all DOM targets,
// historical receipts and pending input while hiding unrelated complexity.
const workPanels=new Map(
  [...document.querySelectorAll('#view-work-queue [data-pcms-work-panel]')]
    .map(panel=>[panel.dataset.pcmsWorkPanel,panel]));
function showWorkPanel(name,{focus=false}={}){
  const selected=workPanels.get(name);
  if(!selected)return false;
  for(const [key,panel] of workPanels)panel.hidden=key!==name;
  for(const button of document.querySelectorAll('[data-pcms-work-show]')){
    button.setAttribute('aria-pressed',String(button.dataset.pcmsWorkShow===name));
  }
  if(focus){
    const heading=selected.querySelector('h2');
    if(heading){
      heading.tabIndex=-1;
      heading.scrollIntoView({block:'start'});
      heading.focus({preventScroll:true});
    }
  }
  return true;
}
document.querySelectorAll('[data-pcms-work-show]').forEach(button=>{
  button.addEventListener('click',()=>{
    if(!document.getElementById('view-work-queue').hidden)
      showWorkPanel(button.dataset.pcmsWorkShow,{focus:true});
  });
});
// A result is never provider authorization; route through existing inspectors.
window.addEventListener('pcms-global-generator-target', event=>{
  const slug=event.detail?.slug;
  if(typeof slug!=='string'||slug.length>80)return;
  showGeneratorPanel('inventory');
  const field=document.getElementById('pcms-generator-query');
  field.value=slug;
  location.hash='#generators';
  field.dispatchEvent(new Event('input',{bubbles:true}));
  field.focus({preventScroll:true});
});
render();
