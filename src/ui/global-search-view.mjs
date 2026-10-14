// I17 local cross-entity search: two existing same-extension read-only ports.
// Not a remote provider census and never an operation/release identity proof.
import {validSearchQuery,localSearchResults} from './global-search-core.mjs';
const field=document.getElementById('pcms-quick-generator-search');
const panel=document.getElementById('pcms-global-results');
let epoch=0,inflight=false,needNew=false,last=[],delay=0,available=true,dismissed=false;
function dismiss(){
  dismissed=true;epoch++;clearTimeout(delay);needNew=false;last=[];hide();
}
function hide(){
  panel.hidden=true;
  field.setAttribute('aria-expanded','false');
}
function show(){
  panel.hidden=false;
  field.setAttribute('aria-expanded','true');
}
function queryPort(name,type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name}),timer=setTimeout(()=>finish(null,'TIMEOUT'),5000);
    let finished=false;
    function finish(value,error){
      if(finished)return;
      finished=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      error?reject(Error(error)):resolve(value);
    }
    port.onMessage.addListener(value=>finish(value));
    port.onDisconnect.addListener(()=>finish(null,'DISCONNECTED'));
    try{port.postMessage({type,params});}catch{finish(null,'DISCONNECTED');}
  });
}
function navigate(item){
  dismiss();field.value=item.key;
  if(item.kind==='generator'){
    window.dispatchEvent(new CustomEvent('pcms-global-generator-target',{detail:{slug:item.key}}));
  }else{
    window.dispatchEvent(new CustomEvent('pcms-global-account-target',{detail:{accountId:item.key}}));
  }
}
function draw(value){
  panel.replaceChildren();
  const {items,partial}=value;
  last=items;
  if(!items.length){
    const el=document.createElement('p');el.className='pcms-search-notice';
    el.textContent=available?'No local matches. Remote data was not searched.':'Local search unavailable; no absence inferred.';
    panel.append(el);
  }
  for(const item of items){
    const button=document.createElement('button');
    button.type='button';
    button.setAttribute('aria-label',item.kind+' '+item.title);
    const type=document.createElement('span');type.className='pcms-search-type';
    type.textContent=item.kind==='generator'?'Generator':'Account';
    const name=document.createElement('span');name.className='pcms-search-target';
    name.textContent=item.title;
    button.append(type,name);
    button.addEventListener('click',()=>navigate(item));
    panel.append(button);
  }
  const foot=document.createElement('p');foot.className='pcms-search-foot';
  foot.textContent=partial?'Partial local results · refine query':
    'Local observations only · remote ownership not verified';
  panel.append(foot);
  show();
}
async function refresh(){
  if(inflight){needNew=true;return;}
  inflight=true;
  try{
    do{
      needNew=false;
      const id=epoch,q=validSearchQuery(field.value);
      if(q.length<2||dismissed){hide();last=[];break;}
      // Each canonical authority is independent: one degraded read must not
      // erase a healthy result from the other. Partial stays explicitly marked.
      const [i,a]=await Promise.allSettled([
        queryPort('pcms-i04-inventory','LIST_INVENTORY',{query:q,offset:0,limit:10}),
        queryPort('pcms-i03-accounts','LIST_ACCOUNTS')
      ]);
      const inventory=i.status==='fulfilled'&&i.value?.ok===true?i.value:null;
      const accounts=a.status==='fulfilled'&&a.value?.ok===true?a.value:null;
      available=!!inventory||!!accounts;
      if(id!==epoch){needNew=!dismissed;continue;}
      if(dismissed)break;
      const projected=localSearchResults(q,inventory?.items||[],
        accounts?.accounts||[],{inventoryPartial:!inventory||inventory.total>10||inventory.truncated===true,
          accountsPartial:!accounts||accounts.truncated===true});
      draw(projected);
    }while(needNew);
  }finally{inflight=false;}
}
field.addEventListener('input',()=>{
  // Invalidate displayed results immediately. Enter must never navigate to a
  // prior query's entity while a new local-only lookup is pending.
  dismissed=false;epoch++;clearTimeout(delay);hide();last=[];
  if(validSearchQuery(field.value).length<2)return;
  delay=setTimeout(()=>{void refresh();},160);
});
field.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();dismiss();field.blur();return;}
  if(event.key==='ArrowDown'&&!panel.hidden){
    const first=panel.querySelector('button');
    if(first){event.preventDefault();first.focus();}
    return;
  }
  if(event.key==='Enter'){
    event.preventDefault();
    if(last.length&&!panel.hidden){navigate(last[0]);return;}
    // Never guess that an unresolved cross-entity query is a generator.
    // Wait for a canonical local result; unsupported/absent stays unknown.
    if(validSearchQuery(field.value).length>1){dismissed=false;void refresh();}
  }
});
panel.addEventListener('keydown',event=>{
  const buttons=[...panel.querySelectorAll('button')],idx=buttons.indexOf(document.activeElement);
  if(event.key==='Escape'){event.preventDefault();dismiss();field.focus();return;}
  if(event.key==='ArrowDown'&&idx>=0){event.preventDefault();buttons[Math.min(idx+1,buttons.length-1)]?.focus();}
  if(event.key==='ArrowUp'&&idx>=0){event.preventDefault();idx>0?buttons[idx-1]?.focus():field.focus();}
});
field.addEventListener('focus',()=>{
  if(!dismissed&&validSearchQuery(field.value).length>1)void refresh();
});
document.addEventListener('pointerdown',event=>{
  if(!panel.contains(event.target)&&event.target!==field)dismiss();
});
document.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
    event.preventDefault();dismissed=false;field.focus();field.select();
  }
});
