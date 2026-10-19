// I13 existing public-source inspector. Every operation is an explicit click;
// no auto-advance after lost acknowledgement, even across tab reloads.
const prefix='pcms-existing-';
const get=id=>document.getElementById(prefix+id);
const slug=get('slug'),token=get('token'),password=get('passphrase'),
  status=get('status'),details=get('details');
const actions=['GET','PREPARE','UNLIST','RECHECK_UNLIST','PIN_STAGE','STAGE',
  'RECHECK_STAGE','RECOVERY_UNLIST','RECHECK_RECOVERY_UNLIST','RESTORE',
  'RECHECK_RESTORE'];
const buttons=Object.fromEntries(actions.map(x=>[x,get(x.toLowerCase().replaceAll('_','-'))]));
const allowed={
  GET:null,PREPARE:null,UNLIST:['PREPARED'],
  RECHECK_UNLIST:['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN'],
  PIN_STAGE:['UNLIST_CONFIRMED'],
  STAGE:['UNLIST_CONFIRMED'],
  RECHECK_STAGE:['STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN'],
  RECOVERY_UNLIST:['STAGE_CONFIRMED'],
  RECHECK_RECOVERY_UNLIST:['RECOVERY_UNLIST_DISPATCH_POSSIBLE','RECOVERY_UNLIST_UNCERTAIN'],
  RESTORE:['STAGE_CONFIRMED','RECOVERY_UNLIST_CONFIRMED'],
  RECHECK_RESTORE:['RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN']
};
let receipt=null,busy=false,epoch=0;
const safeSlug=x=>/^[a-z0-9][a-z0-9-]{0,99}$/.test(x);
const withPass=new Set(['PREPARE','UNLIST','PIN_STAGE','STAGE','RESTORE']);
const withToken=new Set(['PIN_STAGE']);
function paint(){
  for(const action of actions) {
    const eligible=action==='GET'?safeSlug(slug.value):
      action==='PREPARE'?safeSlug(slug.value)&&(!receipt||receipt.state==='STAGE_CONFIRMED'):
      receipt&&receipt.slug===slug.value&&allowed[action]?.includes(receipt.state);
    buttons[action].disabled=busy||!eligible||
      (withPass.has(action)&&password.value.length<12)||
      (withToken.has(action)&&token.value.length>0&&token.value.length<12);
  }
}
function explain(x){
  details.replaceChildren();
  if(!x?.ok)return;
  const p=document.createElement('p');
  p.textContent='State '+x.state+' · Revision '+x.revision+
    ' · Prior P '+x.priorFingerprint+' · Recovery '+x.recovery+
    ' · Operation '+x.operationId;
  details.append(p);
  const q=document.createElement('p');
  q.textContent=x.providerEffect==='POSSIBLE_NEVER_RETRY'?
    'Remote effect may already have happened. Only read-only reconciliation is safe.':
    'No automatic remote mutation is scheduled. Every next action needs explicit confirmation.';
  details.append(q);
}
function call(type,params){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i13-existing'});
    let closed=false;
    const timer=setTimeout(()=>finish(null,Error('TIMEOUT')),70000);
    function finish(v,e){
      if(closed)return;closed=true;clearTimeout(timer);
      try{port.disconnect();}catch{}
      e?reject(e):resolve(v);
    }
    port.onMessage.addListener(v=>finish(v));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
async function act(type){
  if(busy||!safeSlug(slug.value))return;
  const accepted=allowed[type];
  if(type!=='PREPARE'&&type!=='GET'&&
     (!receipt||receipt.slug!==slug.value||!accepted.includes(receipt.state)))return;
  busy=true;const serial=++epoch;paint();
  status.textContent='Checking guarded canonical '+type+'…';
  const p={slug:slug.value};
  if(accepted)p.expectedRevision=receipt.revision;
  if(withPass.has(type))p.passphrase=password.value;
  if(withToken.has(type)&&token.value)p.token=token.value;
  try{
    const v=await call(type,p);
    if(serial!==epoch)return;
    if(v?.ok){
      receipt=v;explain(v);
      status.textContent=type+' acknowledged in canonical state: '+
        v.state+'. A provider acknowledgement alone never proves a mutation.';
    }else{
      status.textContent=(v?.code||'EXISTING_HELD')+
        ' — no success claimed. Load the canonical record and reconcile before any repeat.';
      if(['UNLIST','STAGE','RECOVERY_UNLIST','RESTORE','PREPARE'].includes(type))
        receipt=null;
    }
  }catch{
    if(serial===epoch){receipt=null;
      status.textContent='Response lost. An effect may be possible; never retry until canonical receipt is loaded and independently checked.';}
  }finally{if(serial===epoch){busy=false;paint();}}
}
for(const action of actions)buttons[action].addEventListener('click',()=>act(action));
for(const input of [token,password])input.addEventListener('input',paint);
slug.addEventListener('input',()=>{
  if(busy)return;
  epoch++;receipt=null;
  details.textContent='Generator changed. Previous source approval and operations invalidated.';
  status.textContent='Load and independently review the selected generator.';
  paint();
});
paint();
