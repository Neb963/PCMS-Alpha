import { DESTINATIONS, resolveDestination, invalidDestination } from './routes.mjs';

const nav = document.getElementById('navigation');
const menu = document.getElementById('menu');
const sidebar = document.getElementById('sidebar');
const currentStatus = document.getElementById('navigation-status');
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
  currentStatus.textContent = `${heading.textContent} · I03 account binding · Provider effects OFF`;
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
render();
