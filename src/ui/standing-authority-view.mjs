// S06 explicit standing authority. No browser/private operations are issued
// from this view. An actual writer still needs every protected donor gate.
const by=id=>document.getElementById('pcms-s06-'+id);
const development=by('grant-development'),git=by('grant-git'),
 publication=by('grant-publication'),ack=by('authority-consent'),
 activate=by('authority-enable'),revoke=by('authority-revoke'),
 refresh=by('authority-refresh'),scope=by('authority-repository'),
 status=by('authority-status');
const CONSENT='I AUTHORIZE PROTECTED PCMS OPERATIONS';
let revision=null,repositoryId=null,busy=false;
const call=(type,params={})=>new Promise((resolve,reject)=>{
 const port=browser.runtime.connect({name:'pcms-s06-authority'});
 let done=false;
 const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),20000);
 function finish(result,error){
  if(done)return;done=true;clearTimeout(timeout);
  try{port.disconnect();}catch{}
  error?reject(error):resolve(result);
 }
 port.onMessage.addListener(value=>finish(value));
 port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
 try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
});
function controls(){
 activate.disabled=busy||repositoryId===null||revision===null||
   ack.value!==CONSENT;
 revoke.disabled=busy;refresh.disabled=busy;
 for(const el of [development,git,publication,ack])el.disabled=busy;
}
function render(record){
 revision=Number.isSafeInteger(record?.revision)?record.revision:null;
 repositoryId=record?.repositoryId||null;
 const g=record?.grants||{};
 development.checked=g.development===true;
 git.checked=g.gitWrite===true;
 publication.checked=g.publication===true;
 scope.textContent=repositoryId?
   'Scope: '+record.repository+' · repository ID '+repositoryId:
   'Scope: private per-gens repository not connected';
}
async function dispatch(type,params={}){
 if(busy)return;
 busy=true;controls();status.textContent='Checking current authorization ledger…';
 try{
  const answer=await call(type,params);
  if(!answer?.ok){
   status.textContent='Held: '+(answer?.code||'STANDING_AUTHORITY_UNVERIFIED')+
     '. No new permission was granted.';
  }else{
   render(answer.record);
   status.textContent=type==='REVOKE'?
     'All standing effects paused. Reconcile any possibly dispatched prior operation.':
     answer.reason?
       'Permissions OFF: '+answer.reason:
       'Revision '+answer.record.revision+' · development '+
       (answer.record.grants.development?'ON':'OFF')+' · Git '+
       (answer.record.grants.gitWrite?'ON':'OFF')+' · publication '+
       (answer.record.grants.publication?'ON':'OFF')+
       '. Existing guarded checks still apply.';
   ack.value='';
  }
 }catch{
  status.textContent='Permission connection unavailable. Activation is UNKNOWN; reload the durable status before attempting further effects.';
  revision=null;repositoryId=null;
 }finally{busy=false;controls();}
}
activate.addEventListener('click',()=>dispatch('SET',{
 expectedRevision:revision,repositoryId,
 grants:{development:development.checked,gitWrite:git.checked,
   publication:publication.checked},consent:ack.value
}));
revoke.addEventListener('click',()=>dispatch('REVOKE'));
refresh.addEventListener('click',()=>dispatch('GET'));
ack.addEventListener('input',controls);
controls();void dispatch('GET');
