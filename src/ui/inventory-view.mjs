// I04 inventory search/paging. Only observed historical readback is displayed;
// no list or edit-key record can activate provider writes.
const rows=document.getElementById('pcms-generators-rows');
const query=document.getElementById('pcms-generator-query');
const filter=document.getElementById('pcms-generator-owner-filter');
const feedback=document.getElementById('pcms-inventory-feedback');
const counter=document.getElementById('pcms-generator-count');
const before=document.getElementById('pcms-generator-prev');
const after=document.getElementById('pcms-generator-next');
const reload=document.getElementById('pcms-generator-refresh');
const syncButton=document.getElementById('pcms-generator-sync');
const accountPicker=document.getElementById('pcms-generator-account');
const overviewCount=document.getElementById('pcms-overview-inventory');
let epoch=0,offset=0,total=0,accounts=[],latest=[],selection=new Set(),accountEpoch=0;
const limit=50;
const inspectorTitle=document.getElementById('pcms-generator-inspector-title');
const inspectorBody=document.getElementById('pcms-generator-inspector-body');
let inspectedSlug=null;
function inspect(item,focus=false){
  inspectedSlug=item.slug;
  inspectorTitle.textContent=item.slug;
  inspectorBody.replaceChildren();
  const note=document.createElement('p');
  note.textContent='Historical local observation. Reverify account/route/source before any write.';
  const dl=document.createElement('dl');dl.className='pcms-evidence-kv';
  const details=[
    ['Account',item.accountId||'Unknown'],
    ['Owner evidence',labels[item.ownerState]||'Unknown/held'],
    ['Perchance listing',item.visibility||'UNKNOWN'],
    ['Git source',item.source||'SOURCE_PENDING'],
    ['Local revision',String(item.revision??'Unknown')]
  ];
  for(const [label,value] of details) {
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value;
    dl.append(dt,dd);
  }
  inspectorBody.append(note,dl);
  if(focus)inspectorTitle.focus({preventScroll:true});
}
function emptyInspector(){
  inspectedSlug=null;inspectorTitle.textContent='Select a generator';
  inspectorBody.textContent='Choose Inspect in an inventory row. This is local historical evidence; no ownership or write permission is inferred.';
}
const labels={
  OBSERVED_OWNER:'Owner previously observed (not current authorization)',
  OWNER_UNVERIFIED:'Ownership unknown',OWNER_DISPUTED:'Owner evidence disputed',
  UNOBSERVED:'Absent from latest complete observation — NOT deleted',
  IDENTITY_CONFLICT:'Remote identity changed — held',
  OWNER_CONFLICT:'Conflicting account claim — held'
};
function command(portName,type,params) {
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:portName});
    let ended=false;
    const timer=setTimeout(()=>done(null,Error('TIMEOUT')),type==='SYNC_ACCOUNT'?25000:5000);
    function done(out,err){
      if(ended)return;
      ended=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      err?reject(err):resolve(out);
    }
    port.onMessage.addListener(v=>done(v));
    port.onDisconnect.addListener(()=>done(null,Error('DISCONNECTED')));
    try{port.postMessage(params?{type,params}:{type});}catch{done(null,Error('DISCONNECTED'));}
  });
}
const inv=(type,params)=>command('pcms-i04-inventory',type,params);
const acct=()=>command('pcms-i03-accounts','LIST_ACCOUNTS');
function draw(items) {
  rows.replaceChildren();
  if(inspectedSlug){
    const updated=items.find(x=>x.slug===inspectedSlug);
    if(updated)inspect(updated);else emptyInspector();
  }
  if(!items.length) {
    const tr=document.createElement('tr'),td=document.createElement('td');
    td.colSpan=4;td.className='empty';
    td.textContent=total?'No entries on this page. Adjust filters.':
      'No observed records. Absence is not a remote census.';
    tr.append(td);rows.append(tr);
  }
  for(const item of items) {
    const tr=document.createElement('tr'),cells=[];
    const pick=document.createElement('input');
    pick.type='checkbox';pick.checked=selection.has(item.slug);
    pick.setAttribute('aria-label','Select '+item.slug);
    pick.addEventListener('change',()=>{
      if(pick.checked)selection.add(item.slug);else selection.delete(item.slug);
      showCounter();
    });
    const first=document.createElement('td');
    first.append(pick,document.createTextNode(' '+item.slug+' '));
    const inspectPick=document.createElement('button');
    inspectPick.type='button';inspectPick.textContent='Inspect';
    inspectPick.setAttribute('aria-label','Inspect local evidence for '+item.slug);
    inspectPick.addEventListener('click',()=>inspect(item,true));
    first.append(inspectPick,document.createTextNode(' '));
    const sourcePick=document.createElement('button');
    sourcePick.type='button';sourcePick.textContent='Source';
    sourcePick.setAttribute('aria-label','Inspect Git source for '+item.slug);
    sourcePick.addEventListener('click',()=>window.dispatchEvent(
      new CustomEvent('pcms-source-target',{detail:{slug:item.slug,revision:item.revision}})));
    first.append(sourcePick);
    const timing=document.createElement('button');timing.type='button';timing.textContent='Timing';
    timing.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('pcms-refresher-target',{detail:{slug:item.slug}})));
    first.append(document.createTextNode(' '),timing);
    const adoptPick=document.createElement('button');
    adoptPick.type='button';adoptPick.textContent='Adopt';
    adoptPick.disabled=item.ownerState!=='OBSERVED_OWNER' ||
      !['PUBLIC','UNLISTED'].includes(item.visibility);
    adoptPick.setAttribute('aria-label','Adopt existing generator '+item.slug);
    adoptPick.addEventListener('click',()=>window.dispatchEvent(
      new CustomEvent('pcms-adoption-target',{detail:{
        slug:item.slug,revision:item.revision,ownerState:item.ownerState,
        visibility:item.visibility
      }})));
    first.append(document.createTextNode(' '),adoptPick);
    cells.push(first);
    for(const value of [item.accountId, labels[item.ownerState]||'Evidence unknown',
       (item.visibility||'UNKNOWN')+' · '+(item.source||'SOURCE_PENDING')]) {
      const td=document.createElement('td');td.textContent=value;cells.push(td);
    }
    tr.append(...cells);rows.append(tr);
  }
}
function showCounter(){
  const first=total===0?0:offset+1,last=Math.min(total,offset+limit);
  counter.textContent=first+'–'+last+' of '+total+' matching · '+selection.size+
    ' selected (no bulk mutations enabled)';
  before.disabled=offset===0;
  after.disabled=offset+limit>=total;
}
async function load() {
  const mine=++epoch;
  feedback.textContent='Reading local inventory…';
  try{
    const res=await inv('LIST_INVENTORY',{
      query:query.value,ownerState:filter.value,offset,limit
    });
    if(mine!==epoch)return;
    if(res?.ok!==true)throw Error(res?.code||'READ_UNAVAILABLE');
    total=res.total;latest=res.items;draw(latest);showCounter();
    feedback.textContent=(res.truncated?'Result limit reached. Narrow filters. ':
      'Local inventory only. ')+(res.restoreHeld?
      'Restore hold active. ':'')+
      'Real-time ownership is not asserted; provider writes OFF.';
  }catch{
    if(mine!==epoch)return;
    total=0;latest=[];rows.replaceChildren();showCounter();
    feedback.textContent='Inventory read unavailable. No absence or ownership inferred.';
  }
}
async function loadOverview() {
  if(!overviewCount)return;
  try {
    const result=await inv('LIST_INVENTORY',{offset:0,limit:1});
    overviewCount.textContent=result?.ok ?
      result.total+' local generator observations; ownership is historical. '+(result.truncated?'Inventory truncated. ':'')+
      'Provider writes OFF.' :
      'Inventory unavailable ('+(result?.code||'UNKNOWN')+'). No ownership or deletion inferred.';
  } catch {overviewCount.textContent='Inventory unavailable. No remote absence inferred.';}
}
async function loadAccounts() {
  const mine=++accountEpoch;
  try{
    const r=await acct();
    if(mine!==accountEpoch)return;
    if(!r?.ok||r.truncated)throw Error('ACCOUNTS_UNAVAILABLE');
    accounts=r.accounts;
    const prior=accountPicker.value;
    accountPicker.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent='Choose bound account';
    accountPicker.append(empty);
    for(const a of accounts.filter(a=>a.state!=='ARCHIVED')) {
      const o=document.createElement('option');o.value=a.accountId;
      o.textContent=a.accountId+' · '+a.identity;
      accountPicker.append(o);
    }
    if([...accountPicker.options].some(option=>option.value===prior))
      accountPicker.value=prior;
    accountPicker.dispatchEvent(new Event('change'));
  }catch{
    if(mine!==accountEpoch)return;
    accounts=[];accountPicker.replaceChildren();
    syncButton.disabled=true;
    feedback.textContent='Account authority unavailable; Sync held.';
  }
}
accountPicker.addEventListener('change',()=>{
  const a=accounts.find(x=>x.accountId===accountPicker.value);
  syncButton.disabled=!a||a.state!=='VERIFIED'||a.identity!=='VERIFIED';
});
syncButton.addEventListener('click',async()=>{
  const a=accounts.find(x=>x.accountId===accountPicker.value);
  if(!a||a.state!=='VERIFIED'||a.identity!=='VERIFIED')return;
  syncButton.disabled=true;
  feedback.textContent='Requesting guarded independent read-only observation…';
  try{
    const out=await inv('SYNC_ACCOUNT',{accountId:a.accountId,expectedRevision:a.revision});
    await load();
    feedback.textContent=out?.ok?
      'Guarded observation stored. Owner readback is historical only; provider writes OFF.':
      'Sync held: '+(out?.code||'UNVERIFIED')+'. Local records preserved; inspect Persona route and account login.';
  }catch{
    feedback.textContent='Sync acknowledgment unavailable. Read local state; do not infer completion.';
  }finally{
    syncButton.disabled=false;
    accountPicker.dispatchEvent(new Event('change'));
  }
});
let debounce;
query.addEventListener('input',()=>{
  clearTimeout(debounce);debounce=setTimeout(()=>{offset=0;void load();},180);
});
filter.addEventListener('change',()=>{offset=0;void load();});
reload.addEventListener('click',()=>{void loadAccounts();void load();void loadOverview();});
// Dashboard routes reuse one document. Revalidate the canonical projection
// whenever an operator revisits Generators; old observations are not live.
window.addEventListener('hashchange',()=>{
  if(location.hash==='#generators'){void loadAccounts();void load();}
  if(location.hash==='#overview'){void loadOverview();}
});
before.addEventListener('click',()=>{offset=Math.max(0,offset-limit);void load();});
after.addEventListener('click',()=>{if(offset+limit<total){offset+=limit;void load();}});
void loadAccounts();void load();void loadOverview();
