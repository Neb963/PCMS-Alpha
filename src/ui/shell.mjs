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
  currentStatus.textContent = `${heading.textContent} · I17 integration verification · Provider writes HELD`;
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

// Search uses the existing bounded local inventory filter; it must never
// suggest account/source/operation or remote search capability.
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
quickSearch.addEventListener('keydown', event => {
  if (event.key === 'Escape') { quickSearch.value = ''; quickSearch.blur(); return; }
  if (event.key !== 'Enter') return;
  event.preventDefault();
  showGeneratorPanel('inventory');
  const query = document.getElementById('pcms-generator-query');
  query.value = quickSearch.value;
  location.hash = '#generators';
  query.dispatchEvent(new Event('input', {bubbles:true}));
  query.focus({preventScroll:true});
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    quickSearch.focus();
    quickSearch.select();
  }
});
render();
