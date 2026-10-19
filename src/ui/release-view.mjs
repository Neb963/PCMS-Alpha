// I13 Work Queue inspector: fingerprints and test provenance, never source
// bytes or credentials. Pending and disconnected outcomes never claim publish.
const slug=document.getElementById('pcms-release-slug');
const token=document.getElementById('pcms-release-token');
const passphrase=document.getElementById('pcms-existing-passphrase');
const previewBtn=document.getElementById('pcms-release-preview');
const approveBtn=document.getElementById('pcms-release-approve');
const requestChangesBtn=document.getElementById('pcms-s06-request-changes');
const changeInstructions=document.getElementById('pcms-s06-change-instructions');
const humanInspect=document.getElementById('pcms-s06-human-inspect');
const humanDefer=document.getElementById('pcms-s06-human-defer');
const humanAdopt=document.getElementById('pcms-s06-human-adopt');
const humanStatus=document.getElementById('pcms-s06-human-status');
const exceptionInspect=document.getElementById('pcms-s06-exception-inspect');
const exceptionMode=document.getElementById('pcms-s06-exception-mode');
const exceptionChecks=document.getElementById('pcms-s06-exception-checks');
const exceptionConsent=document.getElementById('pcms-s06-exception-consent');
const exceptionRecord=document.getElementById('pcms-s06-exception-record');
const exceptionStatus=document.getElementById('pcms-s06-exception-status');
const dispatchBtn=document.getElementById('pcms-release-dispatch');
const cancelBtn=document.getElementById('pcms-release-cancel');
const reconcileBtn=document.getElementById('pcms-release-reconcile');
const loadBtn=document.getElementById('pcms-release-load');
const clearBtn=document.getElementById('pcms-release-clear');
const status=document.getElementById('pcms-release-status');
const details=document.getElementById('pcms-release-diff');
const reviewQueue=document.getElementById('pcms-s06-review-queue');
const refreshQueue=document.getElementById('pcms-s06-review-refresh');
const nextQueue=document.getElementById('pcms-s06-review-next');
let queueCursor='',queueBusy=false;
let snapshot=null,receipt=null,active=false,sequence=0,humanContext=null,exceptionContext=null;
const valid=s=>/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
function command(type,params={}){
  return new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i13-release'});
    let done=false;
    const timeout=setTimeout(()=>finish(null,Error('TIMEOUT')),70000);
    function finish(v,e){
      if(done)return;done=true;clearTimeout(timeout);
      try{port.disconnect();}catch{}
      e?reject(e):resolve(v);
    }
    port.onMessage.addListener(v=>finish(v));
    port.onDisconnect.addListener(()=>finish(null,Error('DISCONNECTED')));
    try{port.postMessage({type,params});}catch{finish(null,Error('DISCONNECTED'));}
  });
}
function note(s){status.textContent=s;}
function controls(){
  const target=valid(slug.value);
  exceptionInspect.disabled=active||!target;
  exceptionRecord.disabled=active||!target||
    exceptionContext?.slug!==slug.value||!exceptionConsent.checked;
  humanInspect.disabled=active||!target;
  humanDefer.disabled=active||!humanContext||humanContext.slug!==slug.value||
    !humanContext.sourceFingerprint||humanContext.human?.state==='DEFERRED';
  humanAdopt.disabled=active||humanContext?.slug!==slug.value||
    humanContext?.human?.state!=='DEFERRED';
  previewBtn.disabled=active||!target;
  loadBtn.disabled=active||!target;
  clearBtn.disabled=active;
  approveBtn.disabled=active||!snapshot||snapshot.slug!==slug.value;
  requestChangesBtn.disabled=active||!snapshot||snapshot.slug!==slug.value||
    changeInstructions.value.trim().length<3;
  cancelBtn.disabled=active||!receipt||receipt.slug!==slug.value||
    receipt.state!=='APPROVED';
  dispatchBtn.disabled=active||!receipt||receipt.slug!==slug.value||
    receipt.state!=='APPROVED';
  reconcileBtn.disabled=active||!receipt||receipt.slug!==slug.value||
    !['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(receipt.state);
}
function renderPreview(v){
  details.replaceChildren();
  if(!v?.ok)return;
  const head=document.createElement('p');
  head.textContent='Exact F: '+v.sourceFingerprint+' · Previous: '+
    v.previousFingerprint+' · Git HEAD: '+v.gitHead;
  details.append(head);
  const title=document.createElement('h3');
  title.textContent='Full approved-file manifest';
  details.append(title);
  const list=document.createElement('ul');
  for(const f of v.files||[]){
    const item=document.createElement('li');
    item.textContent=f.path+' · '+f.size+' bytes · SHA-256 '+f.sha256;
    list.append(item);
  }
  details.append(list);
  const diff=document.createElement('p');
  diff.textContent=(v.diff||[]).map(f=>f.kind+' '+f.path).join(' · ')||
    'No changes relative to sealed previous bytes.';
  details.append(diff);
  const warning=document.createElement('p');
  warning.textContent='Approve only this exact generator and F. Any test, owner, READY, '+
    'editor or byte drift must block dispatch. Approval is not publication.';
  details.append(warning);
  const tests=document.createElement('p');
  tests.textContent='Actual test attribution: '+v.tests?.state+
    ' · Default prompt revision '+v.promptRevision+
    ' · TESTING.md '+(v.testingSha||'not configured');
  details.append(tests);
  const assertions=document.createElement('ul');
  for(const t of [...(v.tests?.default||[]),...(v.tests?.optional||[])]){
    const item=document.createElement('li');
    item.textContent=t.name+' — '+t.result+' on exact saved F';
    assertions.append(item);
  }
  details.append(assertions);
  const header=document.createElement('p');
  header.textContent='Inspect full source bytes. Select each path, then page through all 8 KiB chunks. Binary shown in hex; no source leaves the extension.';
  details.append(header);
  const paths=[...new Set([...(v.files||[]),...(v.priorFiles||[])].map(x=>x.path))].sort();
  const sourceSelector=document.createElement('select');
  sourceSelector.setAttribute('aria-label','Exact source file for byte-by-byte review');
  for(const path of paths) {
    const item=document.createElement('option');item.value=path;item.textContent=path;
    sourceSelector.append(item);
  }
  details.append(sourceSelector);
  const panes=document.createElement('div');
  const createPane=origin=>{
    const wrap=document.createElement('section');
    const label=document.createElement('p');
    label.textContent=origin==='F'?'Final candidate F':'Previous-good P';
    wrap.append(label);
    const controls=document.createElement('div');controls.className='account-controls';
    const previous=document.createElement('button');previous.type='button';
    previous.textContent='Previous 8 KiB';
    const next=document.createElement('button');next.type='button';
    next.textContent='Next 8 KiB';
    const code=document.createElement('pre');code.setAttribute('tabindex','0');
    code.setAttribute('aria-label',label.textContent+' (exact bytes)');
    code.style.overflow='auto';code.style.maxHeight='340px';
    let offset=0,busy=false;
    const load=async n=>{
      if(busy||!snapshot||snapshot!==v)return;
      busy=true;previous.disabled=true;next.disabled=true;
      code.textContent='Reading canonical bytes…';
      try{
        const out=await command('GET_REVIEW_CHUNK',{
          slug:v.slug,stageRevision:v.stageRevision,
          fingerprint:v.sourceFingerprint,origin,
          path:sourceSelector.value,offset:n});
        if(snapshot!==v)return;
        if(!out?.ok){code.textContent=out?.code||'SOURCE_REVIEW_HELD';return;}
        offset=out.offset;
        const bytes=Uint8Array.from(atob(out.base64),c=>c.charCodeAt(0));
        let view;
        if(out.path==='main.pjs'||out.path==='index.html'){
          try{view=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
          catch{view=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join(' ');}
        }else view=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join(' ');
        code.textContent=out.path+' · '+out.offset+'–'+(out.offset+out.length)+
          ' of '+out.total+' bytes · SHA-256 '+out.fileSha256+'\n'+view;
        previous.disabled=offset===0;next.disabled=out.nextOffset===null;
      }catch{
        code.textContent='Review unavailable; canonical source may be stale.';
      }finally{busy=false;}
    };
    previous.addEventListener('click',()=>load(offset-8192));
    next.addEventListener('click',()=>load(offset+8192));
    sourceSelector.addEventListener('change',()=>load(0));
    controls.append(previous,next);wrap.append(controls,code);
    panes.append(wrap);
    return ()=>load(0);
  };
  const loadF=createPane('F'),loadP=createPane('P');
  details.append(panes);
  void loadF();void loadP();
}
async function act(type,params,message){
  if(active)return;
  active=true;const serial=++sequence;controls();note(message);
  try{
    const result=await command(type,params);
    if(serial!==sequence)return;
    if(result?.ok){
      if(type==='PREVIEW'){snapshot=result;receipt=null;renderPreview(result);
        note('Exact saved F, current READY and editor checked. Individual approval available.');}
      else if(type==='REQUEST_CHANGES'){
        snapshot=null;receipt=null;details.replaceChildren();
        changeInstructions.value='';
        note('Saved source-bound Request Changes '+result.requestId+
          ' · pending safe child admission. Old approval is revoked; nothing published.');
      }
      else if(type==='APPROVE'){receipt=result;note('Durable source-bound approval '+result.releaseId+
        '. No provider effect performed.');}
      else if(type==='CANCEL_APPROVED'){receipt=result;snapshot=null;
        note('Unsent source approval canceled; publication not attempted. Review fresh F before reapproving.');}
      else if(type==='DISPATCH'){receipt=result;note('Dispatch may have occurred: '+
        result.state+'. Reconcile independently; do not click again.');}
      else if(type==='RECONCILE'){receipt=result;note(result.state==='CONFIRMED_PUBLIC'?
        'Independent full source + public listing confirmed.':
        'Publication still uncertain. No retry authorized.');}
      else if(type==='GET'){receipt=result;note('Stored release '+result.releaseId+
        ' · '+result.state+' · '+result.publication+'.');}
    }else {
      // A disconnected dispatch does NOT mean no remote effect.
      if(['DISPATCH','APPROVE'].includes(type)){snapshot=null;}
      note((result?.code||'RELEASE_UNVERIFIED')+
        ' — held; read the canonical receipt before taking another action.');
    }
  }catch{
    if(serial===sequence){snapshot=null;receipt=null;
      note('Connection lost or timed out. Possible effect is UNKNOWN. Load the canonical receipt and reconcile before any further action.');}
  }finally{if(serial===sequence){active=false;controls();}}
}
previewBtn.addEventListener('click',()=>act('PREVIEW',{
  slug:slug.value,token:token.value,passphrase:passphrase.value},'Checking current owner, route, clean editor, Git READY and full saved F…'));
requestChangesBtn.addEventListener('click',()=>{
  const f=snapshot;
  if(!f||f.slug!==slug.value)return;
  act('REQUEST_CHANGES',{slug:f.slug,token:token.value,
    passphrase:passphrase.value,expectedStageRevision:f.stageRevision,
    expectedJobRevision:f.jobRevision,sourceFingerprint:f.sourceFingerprint,
    instructions:changeInstructions.value.trim(),
    ...(f.releaseRevision!==null?{releaseRevision:f.releaseRevision}:{})},
    'Revalidating current Git F, guarded saved source and approval before recording the child request…');
});
approveBtn.addEventListener('click',()=>{
  const f=snapshot;
  if(!f||f.slug!==slug.value)return;
  act('APPROVE',{slug:f.slug,token:token.value,
    expectedStageRevision:f.stageRevision,expectedJobRevision:f.jobRevision,
    fingerprint:f.sourceFingerprint,explicitApproval:true,passphrase:passphrase.value},
    'Recording exact-F individual approval in canonical journal…');
});
cancelBtn.addEventListener('click',()=>{
  if(!receipt||receipt.state!=='APPROVED')return;
  act('CANCEL_APPROVED',{slug:receipt.slug,expectedRevision:receipt.revision},
    'Canceling unsent exact-source approval; no remote effect…');
});
dispatchBtn.addEventListener('click',()=>{
  if(!receipt)return;
  act('DISPATCH',{slug:receipt.slug,token:token.value,
    expectedRevision:receipt.revision,passphrase:passphrase.value},
    'Revalidating exact F, READY and owner before a single fenced publication attempt…');
});
reconcileBtn.addEventListener('click',()=>{
  if(!receipt)return;
  act('RECONCILE',{slug:receipt.slug,token:token.value,
    expectedRevision:receipt.revision},
    'Read-only remote public listing and every F source byte; no repeat of publication…');
});
loadBtn.addEventListener('click',()=>act('GET',{slug:slug.value},
  'Loading persisted approval/dispatch/uncertainty receipt…'));
clearBtn.addEventListener('click',()=>{token.value='';controls();});
slug.addEventListener('input',()=>{
  if(active)return;
  sequence++;snapshot=null;receipt=null;humanContext=null;
  humanStatus.textContent='Review target changed. Inspect its current human-edit state.';
  exceptionContext=null;exceptionConsent.checked=false;
  exceptionStatus.textContent='Changed generator; inspect exceptional source again.';
  details.textContent='Target changed. Previous preview and approval controls invalidated.';
  note('Selection changed; review new target before any approval.');
  controls();
});
token.addEventListener('input',controls);
passphrase?.addEventListener('input',controls);
changeInstructions.addEventListener('input',controls);
controls();

// C-53 human review uses its own source- and stage-bound local control.
// Defer never reads/writes user drafts. Adoption is allowed only after
// independently proved saved-source and idle-editor observations.
async function humanAct(type,params={}){
 if(active||!valid(slug.value))return;
 active=true;const serial=++sequence;controls();
 humanStatus.textContent='Checking canonical human-edit hold and saved source…';
 try{
  const response=await command(type,{slug:slug.value,...params});
  if(serial!==sequence)return;
  if(!response?.ok){
    humanStatus.textContent='Held: '+(response?.code||'S06_HUMAN_REVIEW_UNVERIFIED')+
      '. No editor save, test PASS, Git write or publication was attempted.';
    if(type!=='HUMAN_CONTEXT')humanContext=null;
  }else if(type==='HUMAN_CONTEXT'){
    humanContext=response;
    humanStatus.textContent=response.human?.state==='DEFERRED'?
      'Human work DEFERRED. Save all changes in Perchance before adopting; old approval is revoked.':
      response.human?.state==='ADOPTED_UNTESTED'?
      'Human saved source was adopted. New independent tests and Git writeback are required.':
      'No human-edit hold recorded. Defer now if human work may conflict with review or publication.';
  }else{
    humanContext=null;snapshot=null;receipt=null;details.replaceChildren();
    humanStatus.textContent=type==='DEFER_HUMAN'?
      'Human work preserved; unsent approval revoked, publication blocked. Save unsaved work before adoption.':
      'Human saved source admitted as a NEW untested candidate; previous F/P archived. Review again after tests and Git writeback.';
    // Refresh only the local record, never invoke an external effect.
    const current=await command('HUMAN_CONTEXT',{slug:slug.value});
    if(serial===sequence&&current?.ok)humanContext=current;
  }
 }catch{
  if(serial===sequence){humanContext=null;
    humanStatus.textContent='Human-review connection interrupted. No source was touched here; reload canonical state.';}
 }finally{if(serial===sequence){active=false;controls();}}
}
humanInspect.addEventListener('click',()=>humanAct('HUMAN_CONTEXT'));
humanDefer.addEventListener('click',()=>{
 const c=humanContext;
 if(!c||c.slug!==slug.value)return;
 humanAct('DEFER_HUMAN',{expectedStageRevision:c.stageRevision,
   expectedJobRevision:c.jobRevision,expectedFingerprint:c.sourceFingerprint});
});
humanAdopt.addEventListener('click',()=>{
 const c=humanContext;
 if(!c||c.slug!==slug.value||c.human?.state!=='DEFERRED')return;
 humanAct('ADOPT_HUMAN',{expectedRevision:c.human.revision});
});

// C-48/C-49: exceptional test evidence never sets TESTS_VERIFIED or
// grants Git/writeback/publication authority. A known required FAIL is blocked.
function parseManualRows(text){
 const lines=text.trim()?text.trim().split(/\r?\n/):[];
 return lines.map(line=>{
  const tab=line.indexOf('\t');
  if(tab<=0)return {name:'',result:'PASS',observation:''};
  return {name:line.slice(0,tab).trim(),result:'PASS',
    observation:line.slice(tab+1).trim()};
 });
}
async function exceptionAct(type,params={}){
 if(active||!valid(slug.value))return;
 active=true;const serial=++sequence;controls();
 exceptionStatus.textContent='Checking exact canonical test evidence…';
 try{
  const out=await command(type,{slug:slug.value,...params});
  if(serial!==sequence)return;
  if(!out?.ok){
   exceptionStatus.textContent='Held: '+(out?.code||'EXCEPTION_EVIDENCE_UNAVAILABLE')+
     '. No test PASS, private Git write or publication is inferred.';
   if(type!=='GET_EXCEPTION')exceptionContext=null;
  }else if(type==='EXCEPTION_CONTEXT'){
   exceptionContext=out;
   exceptionStatus.textContent='Source '+out.sourceFingerprint+
    ' · '+out.evidenceState+' · Chat 1: '+(out.chat1Verified?'verified':'not verified')+
    ' · Chat 2: '+(out.chat2Verified?'verified':'incomplete')+
    ' · Required checks: '+out.requiredChecks.join(', ')+
    ' · native hold: '+(out.nativeHold||'none')+
    '. Known required failures are never eligible.';
  }else{
   exceptionContext=null;exceptionConsent.checked=false;
   exceptionStatus.textContent='Recorded '+out.mode+' on '+out.sourceFingerprint+
    '. Evidence: '+out.evidenceMode+
    '. This is NOT AI-verified and does not authorize Git or publication.';
  }
 }catch{
  if(serial===sequence)exceptionStatus.textContent='Exceptional-review connection interrupted. Reinspect canonical state.';
 }finally{if(serial===sequence){active=false;controls();}}
}
exceptionInspect.addEventListener('click',()=>exceptionAct('EXCEPTION_CONTEXT'));
exceptionConsent.addEventListener('change',controls);
exceptionMode.addEventListener('change',controls);
exceptionChecks.addEventListener('input',controls);
exceptionRecord.addEventListener('click',()=>{
 const c=exceptionContext;
 if(!c||c.slug!==slug.value||!exceptionConsent.checked)return;
 const mode=exceptionMode.value;
 const checks=mode==='MANUAL_INFRASTRUCTURE'?
    parseManualRows(exceptionChecks.value):[];
 exceptionAct('RECORD_EXCEPTION',{
   mode,checks,consent:'I PERFORMED THE RECORDED MANUAL CHECKS',
   expectedStageRevision:c.stageRevision,expectedJobRevision:c.jobRevision,
   sourceFingerprint:c.sourceFingerprint});
});

// S06 canonical release candidate queue: read-only, bounded and fully keyboard
// accessible. Selection only changes the view; it never approves/publishes.
async function fetchReviewPage(cursor=''){
  if(queueBusy||active)return;
  queueBusy=true;refreshQueue.disabled=true;nextQueue.disabled=true;
  reviewQueue.textContent='Reading the persisted publication queue…';
  try{
    const response=await command('LIST_REVIEW',{after:cursor,limit:40});
    if(!response?.ok){
      reviewQueue.textContent='Queue unavailable: '+(response?.code||'UNKNOWN');return;
    }
    reviewQueue.replaceChildren();
    if(!response.items?.length)reviewQueue.textContent='No candidates on this page.';
    for(const item of response.items||[]){
      const line=document.createElement('div');line.className='account-controls';
      const pick=document.createElement('button');pick.type='button';
      pick.textContent=item.slug;
      pick.setAttribute('aria-label','Review generator '+item.slug);
      pick.addEventListener('click',()=>{
        slug.value=item.slug;slug.dispatchEvent(new Event('input'));
        note('Selected '+item.slug+'. Review exact source and tests before approval.');
      });
      const status=document.createElement('span');
      status.textContent=item.state+' · '+item.code;
      line.append(pick,status);reviewQueue.append(line);
    }
    queueCursor=response.more?response.nextCursor||'':'';
    nextQueue.disabled=!response.more||!queueCursor;
  }catch{reviewQueue.textContent='Queue connection interrupted; no approval or publication occurred.';}
  finally{queueBusy=false;refreshQueue.disabled=false;}
}
refreshQueue.addEventListener('click',()=>fetchReviewPage(''));
nextQueue.addEventListener('click',()=>fetchReviewPage(queueCursor));
void fetchReviewPage();
