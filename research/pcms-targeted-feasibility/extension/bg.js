// Test-only extension. No PersonaMonkey controller, Perchance or GitHub access.
const libs=Promise.all([import('./archive.mjs'),import('./recovery.mjs')]);
const boot=crypto.randomUUID();let tail=Promise.resolve(),lastOldBinding=null;
const serial=fn=>{const p=tail.then(fn);tail=p.catch(console.error);return p;};
const read=async()=> (await browser.storage.local.get('state')).state||{paused:false,maintenance:false,module:null,jobs:[],effects:[],events:[]};
const save=s=>browser.storage.local.set({state:s});
const event=(s,type,detail={})=>s.events.push({type,boot,time:Date.now(),...detail});
function pkgOK(p){if(p?.id!=='synthetic-module'||p.coreABI!==1||p.jobABI!==1||typeof p.background!=='string'||typeof p.ui!=='string'||!/^\d+$/.test(p.version))throw Error('unsupported synthetic package');}
async function schedule(s){await browser.alarms.clear('work');if(s.module?.enabled&&!s.maintenance&&s.jobs.some(j=>j.status==='Waiting'))await browser.alarms.create('work',{when:Math.max(Date.now()+1000,s.due||0)});}
async function request(bound,method,args) {
  const [,recovery]=await libs,s=await read();recovery.admit(s,bound,method);
  if(!args||typeof args!=='object'||Array.isArray(args))throw Error('bad args');
  if(method==='job'){
    if(typeof args.input!=='string'||args.input.length>1000)throw Error('bad input');
    s.jobs.push({id:crypto.randomUUID(),status:'Waiting',jobABI:1,input:args.input,checkpoint:0});s.due=Date.now()+1000;
  } else {
    const j=s.jobs.find(j=>j.id===bound.jobId);if(!j||j.status!=='Waiting')throw Error('job unavailable');
    if(method==='checkpoint') {if(!Number.isSafeInteger(args.n)||args.n!==j.checkpoint+1||args.version!==bound.version)throw Error('checkpoint mismatch');j.checkpoint=args.n;}
    if(method==='effect') {
      if(typeof args.label!=='string'||args.label.length>100)throw Error('bad label');
      // Observable synthetic effect only; no external mutation.
      s.effects.push({job:j.id,version:bound.version,epoch:bound.epoch,checkpoint:j.checkpoint,label:args.label,boot});
      if(j.checkpoint>=30)j.status='Complete';
    }
  }
  event(s,method,{version:bound.version});await save(s);if(method==='job')await schedule(s);return {accepted:true};
}
function runFrame(p,bound,context) {
  return new Promise((resolve,reject)=>{
    const f=document.createElement('iframe'),token=crypto.randomUUID();f.src='sandbox.html';document.body.append(f);
    let chain=Promise.resolve();const timer=setTimeout(()=>end(Error('sandbox timeout')),15000);
    const end=err=>{clearTimeout(timer);removeEventListener('message',receive);f.remove();err?reject(err):resolve();};
    const receive=e=>{
      if(e.source!==f.contentWindow||e.origin!=='null'||e.data?.token!==token)return;
      const m=e.data;
      if(m.type==='rpc')chain=chain.then(async()=>{try{const result=await request(bound,m.method,m.args);f.contentWindow?.postMessage({token,seq:m.seq,result},'*');}catch(err){f.contentWindow?.postMessage({token,seq:m.seq,error:String(err)},'*');}});
      if(m.type==='loaded')chain.then(()=>end());
      if(m.type==='error')end(Error(m.error));
    };
    addEventListener('message',receive);f.onload=()=>f.contentWindow.postMessage({type:'load',token,kind:'background',source:p.background,context},'*');
  });
}
async function step(){
  let s=await read();if(!s.module?.enabled||s.maintenance||s.paused)return;
  const j=s.jobs.find(x=>x.status==='Waiting');if(!j)return;
  const bound={version:s.module.version,epoch:s.module.epoch,jobId:j.id};lastOldBinding=bound;
  try{await runFrame(s.module.package,bound,{checkpoint:j.checkpoint,input:j.input});}
  catch(err){s=await read();event(s,'step-error',{error:String(err)});await save(s);}
  s=await read();s.due=Date.now()+10000;await save(s);await schedule(s);
}
async function command(m,sender){
  const own=browser.runtime.getURL('ui.html');if(sender.id!==browser.runtime.id||!sender.url?.startsWith(own))throw Error('wrong UI sender');
  let s=await read();
  if(m.op==='state')return {...s,liveBoot:boot};
  if(m.op==='wakeProof'){
    s.due=Date.now()+100;await save(s);await schedule(s);return {scheduled:true};
  }
  if(m.op==='install'){
    pkgOK(m.package);s.module&&(s.module.quiescing=true);await save(s);
    // Serial queue drains accepted finite steps before replacement. No long async external writes in this fixture.
    const old=s.module;s.module={enabled:true,quiescing:false,version:m.package.version,epoch:(old?.epoch||0)+1,package:m.package};
    event(s,'replace',{from:old?.version,to:m.package.version});await save(s);await schedule(s);return s.module;
  }
  if(m.op==='disable'||m.op==='enable'){
    if(!s.module)throw Error('no module');s.module.enabled=m.op==='enable';s.module.epoch++;event(s,m.op);await save(s);await schedule(s);return s.module;
  }
  if(m.op==='uiRPC')return request(m.bound,m.method,m.args);
  if(m.op==='replayOld'){
    if(!lastOldBinding)throw Error('run a background step first, then update');
    const before=s.effects.length;let rejection;
    try{await request(lastOldBinding,'effect',{label:'OLD_REPLAY_MUST_NOT_APPEAR'});}catch(e){rejection=String(e);}
    s=await read();event(s,'replay-result',{before,after:s.effects.length,rejection});await save(s);return s.events.at(-1);
  }
  if(m.op==='seed'||m.op==='capture'||m.op==='restore'||m.op==='continueRestore'||m.op==='verifyRestore'){
    const backup=await import('./backup.mjs');return backup.handle(m,{read,save,event,boot});
  }
  throw Error('unknown proof command');
}
// Register every wake listener before any await.
browser.runtime.onMessage.addListener((m,sender)=>serial(()=>command(m,sender)));
browser.alarms.onAlarm.addListener(a=>{if(a.name==='work')serial(step);});
browser.runtime.onStartup.addListener(()=>serial(async()=>schedule(await read())));
browser.action.onClicked.addListener(()=>browser.tabs.create({url:'ui.html'}));
serial(async()=>{const s=await read();event(s,'boot');await save(s);await schedule(s);});
