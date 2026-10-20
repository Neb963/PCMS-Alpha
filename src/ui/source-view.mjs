// I05 operator-initiated private Git inspection. The token remains only in
// this password field; neither DB, extension storage nor logs receive it.
const get=id=>document.getElementById(id);
const target=get('pcms-source-target'),folder=get('pcms-source-folder');
const token=get('pcms-source-token'),inspect=get('pcms-source-inspect');
const associate=get('pcms-source-associate'),recheck=get('pcms-source-recheck');
const clear=get('pcms-source-clear'),status=get('pcms-source-status');
const files=get('pcms-source-files');
let selected=null,preview=null,generation=0,busy=false;
function port(type,params) {
  return new Promise((resolve,reject)=>{
    const channel=browser.runtime.connect({name:'pcms-i05-source'});
    let done=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),24000);
    function finish(data,error) {
      if(done)return;done=true;clearTimeout(timer);
      try{channel.disconnect();}catch{}
      error?reject(error):resolve(data);
    }
    channel.onMessage.addListener(data=>finish(data));
    channel.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{channel.postMessage({type,params:Object.fromEntries(Object.entries(params||{}).filter(([k,v])=>!(['token','passphrase'].includes(k)&&v==='')))});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function controls(){
  inspect.disabled=busy;
  associate.disabled=busy||!preview?.ok||!selected;
  recheck.disabled=busy||!selected;
}
function announce(text){status.textContent=text;}
function show(snapshot){
  files.replaceChildren();
  if(!snapshot?.ok)return;
  const headline=document.createElement('p');
  headline.textContent='Pinned main '+snapshot.head.slice(0,12)+' · '+snapshot.files+
    ' files · '+(snapshot.ready?'READY (read-only evidence)':'NOT READY')+
    ' · fingerprint '+snapshot.fingerprint.slice(0,16);
  files.append(headline);
  const table=document.createElement('table'),thead=document.createElement('thead');
  const headings=document.createElement('tr');
  for(const h of ['Path','Bytes','SHA-256']) {
    const th=document.createElement('th');th.textContent=h;headings.append(th);
  }
  thead.append(headings);table.append(thead);
  const tbody=document.createElement('tbody');
  for(const item of snapshot.paths){
    const tr=document.createElement('tr');
    for(const value of [item.path,String(item.size),item.sha256.slice(0,16)+'…']){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);files.append(table);
}
window.addEventListener('pcms-source-target',async event=>{
  const v=event.detail;
  if(!v||typeof v.slug!=='string'||!Number.isSafeInteger(v.revision))return;
  ++generation;selected={slug:v.slug,expectedRevision:v.revision};preview=null;
  target.value=v.slug+' (local rev '+v.revision+')';files.replaceChildren();
  announce('Reading local association for '+v.slug+'; source is not live authorization.');
  controls();
  const mine=generation;
  try{
    const r=await port('GET_ASSOCIATION',{slug:v.slug});
    if(generation!==mine)return;
    if(r?.ok){
      folder.value=r.link.folder;
      announce('Previously associated '+r.link.folder+' at '+r.link.mainHead.slice(0,12)+
        '; source is historical. Use Recheck with an explicit read-only token.');
    }else announce('No current valid association ('+(r?.code||'UNKNOWN')+
      '). Inspect a folder and confirm one-to-one mapping; no provider changes.');
  }catch{if(generation===mine)announce('Local association unavailable. No source inferred.');}
});
folder.addEventListener('input',()=>{++generation;preview=null;show(null);controls();});
token.addEventListener('input',()=>{++generation;preview=null;controls();});
clear.addEventListener('click',()=>{++generation;token.value='';preview=null;controls();announce('Token cleared; no source capability stored.');});
inspect.addEventListener('click',async()=>{
  const mine=++generation;preview=null;busy=true;controls();show(null);
  announce('Inspecting read-only pinned Git main; no commits or source edits…');
  try{
    const r=await port('INSPECT_SOURCE',{token:token.value,folder:folder.value.trim()});
    if(mine!==generation)return;
    if(r?.ok){
      preview=r;show(r);
      announce(r.ready?'READY marker and actual bytes inspected. Confirmation binds source only; it is not permission to publish.':
        'Source inspected but NOT READY. Association is allowed; deployment remains held.');
    }else announce('Source held: '+(r?.code||'SOURCE_UNVERIFIED')+
      '. Existing mapping and Perchance generator are unchanged.');
  }catch{
    if(mine===generation)announce('Source read unavailable; cached READY cannot be used.');
  }finally{busy=false;controls();}
});
associate.addEventListener('click',async()=>{
  if(!selected||!preview?.ok||busy)return;
  busy=true;controls();const mine=generation;
  announce('Re-reading Git HEAD and fencing canonical target association…');
  try {
    const r=await port('ASSOCIATE_SOURCE',{
      slug:selected.slug,expectedRevision:selected.expectedRevision,
      folder:preview.folder,token:token.value,
      pinnedFingerprint:preview.fingerprint,pinnedHead:preview.head,
      pinnedTestingSha:preview.testingSha
    });
    if(mine!==generation)return;
    announce(r?.ok?'Associated '+r.folder+
      ' (historical source only). Current READY, owner and release approvals must be independently rechecked.':
      'Association held: '+(r?.code||'SOURCE_UNVERIFIED')+
      '. No existing binding was replaced.');
  }catch{
    if(mine===generation)announce('Association acknowledgment unknown. Select the generator again to read canonical state; do not retry blindly.');
  }finally{busy=false;controls();}
});
recheck.addEventListener('click',async()=>{
  if(!selected||busy)return;busy=true;controls();const mine=++generation;
  announce('Rechecking the linked folder against current main…');
  try {
    const r=await port('RECHECK_SOURCE',{slug:selected.slug,token:token.value});
    if(mine!==generation)return;
    announce(r?.ok?'Source check: '+r.code+
      ' · relevant bytes unchanged. Test inputs and current ownership still require independent authority.':
      'Source HELD: '+(r?.code||'SOURCE_UNVERIFIED')+
      '. No writes or reassociation occurred.');
  }catch{
    if(mine===generation)announce('Git source recheck unavailable; preserve candidate and hold.');
  }finally{busy=false;controls();}
});
controls();
