// Shared presentation behavior; each dialog retains its own real Close handler.
export function installInteraction({root,preferences,route,notify=()=>{}}){
 let opener=null,known=new Map(),menu=false;
 const app=root.querySelector('.app'),nav=root.querySelector('.sidebar'),toggle=root.querySelector('#pcms-menu-toggle');
 const visible=node=>node.getClientRects().length&&!node.closest('[hidden]');
 const controls=dialog=>[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')].filter(visible);
 function returnTarget(prior){
  if(prior?.isConnected)return prior;
  const row=prior?.closest('tr[data-presentation-key]');
  if(row){const current=[...root.querySelectorAll('tr[data-presentation-key]')].find(r=>r.dataset.presentationKey===row.dataset.presentationKey);
   if(current)return ['INPUT','BUTTON'].includes(prior.tagName)?current.querySelector(prior.tagName.toLowerCase()):current;
  }
  return root.querySelector('#page-heading');
 }
 function closeMenu(focus=false){menu=false;root.host.removeAttribute('data-menu-open');toggle?.setAttribute('aria-expanded','false');if(focus)toggle?.focus()}
 toggle?.addEventListener('click',()=>{menu=!menu;root.host.toggleAttribute('data-menu-open',menu);toggle.setAttribute('aria-expanded',String(menu));if(menu)nav.querySelector('[aria-current=page]')?.focus()});
 root.querySelector('#pcms-skip-main')?.addEventListener('click',()=>root.querySelector('#page-heading')?.focus());
 root.addEventListener('pointerdown',event=>{opener=event.target.closest('button,a,input,select,textarea,tr[tabindex]')||root.activeElement},true);
 root.addEventListener('keydown',event=>{
  opener=root.activeElement;
  const dialogs=[...root.querySelectorAll('[role=dialog]')].filter(visible),top=dialogs.at(-1);
  if(!top){if(menu&&event.key==='Escape'){event.preventDefault();closeMenu(true)}return}
  if(event.key==='Escape'){
   const close=[...top.querySelectorAll('button')].find(b=>b.textContent.trim()==='Close'&&!b.disabled);
   if(close){event.preventDefault();event.stopImmediatePropagation();close.click()}return;
  }
  if(event.key==='Tab'){
   const all=controls(top),index=all.indexOf(root.activeElement);
   if(all.length&&((event.shiftKey&&index<=0)||(!event.shiftKey&&(index<0||index===all.length-1)))){
    event.preventDefault();event.stopImmediatePropagation();(event.shiftKey?all.at(-1):all[0]).focus();
   }
  }
 },true);
 function resize(dialog){
  if(!dialog.matches('.drawer')||dialog.matches('.source-workspace,.review-workspace'))return;
  const workspace=route(),saved=preferences.get().panelWidths[workspace];if(saved)dialog.style.width=saved+'px';
  const handle=document.createElement('div');handle.className='panel-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Resize details panel');
  handle.setAttribute('aria-valuemin','320');handle.setAttribute('aria-valuemax','1200');
  const update=width=>{const value=Math.max(320,Math.min(1200,Math.round(width)));dialog.style.width=value+'px';handle.setAttribute('aria-valuenow',String(value));return value};
  const commit=()=>{const width=update(dialog.getBoundingClientRect().width);void preferences.update(value=>({...value,panelWidths:{...value.panelWidths,[workspace]:width}})).catch(()=>notify('Panel width could not be saved. The current width is kept for this session.'))};
  update(saved||525);handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();update(event.key==='Home'?320:event.key==='End'?1200:dialog.getBoundingClientRect().width+(event.key==='ArrowLeft'?20:-20));commit()});
  handle.addEventListener('pointerdown',event=>{event.preventDefault();handle.setPointerCapture(event.pointerId);const start=event.clientX,width=dialog.getBoundingClientRect().width;
   const move=e=>update(width+start-e.clientX),end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);commit()};
   handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  });dialog.prepend(handle);
 }
 const observer=new MutationObserver(()=>{
  const dialogs=[...root.querySelectorAll('[role=dialog]')].filter(visible),top=dialogs.at(-1),next=new Map();
  app.inert=!!top;
  for(const dialog of dialogs){let prior=known.get(dialog);if(!known.has(dialog)){prior=dialog.pcmsReturnFocus||(opener?.isConnected&&!dialog.contains(opener)?opener:root.querySelector('#page-heading'));resize(dialog)}dialog.inert=dialog!==top;next.set(dialog,prior)}
  const removed=[...known].filter(([dialog])=>!next.has(dialog));
  if(removed.length){const prior=removed.at(-1)[1];
   if(!top)returnTarget(prior)?.focus({preventScroll:true});
   else if(!top.contains(root.activeElement)&&prior?.isConnected&&top.contains(prior))prior.focus({preventScroll:true});
  }
  known=next;
  if(top&&!top.contains(root.activeElement))controls(top)[0]?.focus({preventScroll:true});
 });observer.observe(root,{childList:true,subtree:true});
 window.addEventListener('hashchange',()=>closeMenu());
 root.addEventListener('click',event=>{if(event.target.closest('[data-nav]'))closeMenu()});
 return Object.freeze({closeMenu});
}
