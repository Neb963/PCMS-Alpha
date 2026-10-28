import {makeArchive,validate,hash} from './archive.mjs';
import {restorePlan} from './recovery.mjs';
const get=k=>browser.storage.local.get(k).then(x=>x[k]);
async function site(scope,op,data){
  if(scope.origin!=='http://127.0.0.1:8765')throw Error('only synthetic loopback allowed');
  const tab=await browser.tabs.create({url:scope.origin+'/site.html',cookieStoreId:scope.storeId,active:false});
  try{
    for(let i=0;i<100;i++){if((await browser.tabs.get(tab.id)).status==='complete')break;await new Promise(r=>setTimeout(r,30));}
    await browser.scripting.executeScript({target:{tabId:tab.id},files:['site.js']});
    const [r]=await browser.scripting.executeScript({target:{tabId:tab.id},func:(op,data)=>globalThis.pcmsSiteProof(op,data),args:[op,data??null]});
    return r.result;
  } finally{await browser.tabs.remove(tab.id);}
}
async function containers(sections,prefix){
  const map={};for(const p of sections.personas.items){const c=await browser.contextualIdentities.create({name:prefix+p.id,color:'blue',icon:'fingerprint'});map[p.cookieStoreId]=c.cookieStoreId;}return map;
}
async function setCookies(cookies){
  for(const c of cookies){const d={url:`${c.secure?'https':'http'}://${c.domain.replace(/^\./,'')}${c.path}`,name:c.name,value:c.value,path:c.path,storeId:c.storeId,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite};
    if(!c.hostOnly)d.domain=c.domain;if(!c.session)d.expirationDate=c.expirationDate;
    if(c.firstPartyDomain)d.firstPartyDomain=c.firstPartyDomain;if(c.partitionKey)d.partitionKey=c.partitionKey;
    await browser.cookies.set(d);
  }
}
const scopeData=(f,i)=>({localStorage:f.localStorage[i],indexedDB:f.indexedDB[i],opfs:f.opfs[i]});
async function collect(f){
  const out=structuredClone(f);out.cookies=[];
  for(let i=0;i<f.personas.items.length;i++){
    const storeId=f.personas.items[i].cookieStoreId;
    out.cookies.push(...await browser.cookies.getAll({storeId,partitionKey:{}}));
    const r=await site(f.localStorage[i],'read');
    out.localStorage[i].values=r.values;out.indexedDB[i].databases=r.databases;out.opfs[i].files=r.files;
  }
  return out;
}
async function download(bytes){
  const digest=await hash(bytes),url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));
  try{
    const id=await browser.downloads.download({url,filename:`PCMS/feasibility-${Date.now()}.zip`,saveAs:false});
    for(let i=0;i<400;i++){
      const [d]=await browser.downloads.search({id});
      if(d.state==='interrupted')throw Error(`download interrupted: ${d.error}`);
      if(d.state==='complete'){if(d.fileSize!==bytes.length)throw Error('download byte count');return {id,filename:d.filename,bytes:bytes.length,sha256:digest};}
      await new Promise(r=>setTimeout(r,50));
    }
    throw Error('download completion timeout');
  }finally{URL.revokeObjectURL(url);}
}
export async function handle(m,host){
  let s=await host.read();
  if(m.op==='seed'){
    if(await get('sourceFixture'))throw Error('source already seeded; use fresh profile');
    const original=m.fixture,remap=await containers(original,'Source-');
    const f=restorePlan(original,remap);f.core=original.core;
    for(let i=0;i<f.personas.items.length;i++)await site(f.localStorage[i],'write',scopeData(f,i));
    await setCookies(f.cookies);await browser.storage.local.set({sourceFixture:f});return {seeded:true,mapping:remap};
  }
  if(m.op==='capture'){
    const f=await get('sourceFixture');if(!f)throw Error('seed source first');
    s.maintenance=true;host.event(s,'capture-barrier');await host.save(s);
    await browser.storage.local.set({captureStage:{phase:'capturing',complete:false}});
    for(const scope of f.localStorage)await site(scope,'freeze');
    if(m.interrupt)throw Error('INJECTED_CAPTURE_INTERRUPTION; no archive published; barrier retained');
    const sections=await collect(f),bytes=await makeArchive(sections,{captureId:crypto.randomUUID()});
    await validate(bytes);await browser.storage.local.set({captureStage:{phase:'validated',complete:true}});
    for(const scope of f.localStorage)await site(scope,'thaw');
    s.maintenance=false;host.event(s,'capture-complete');await host.save(s);
    const receipt=await download(bytes);await browser.storage.local.set({captureReceipt:receipt,captureStage:null});return receipt;
  }
  if(m.op==='restore'){
    const parsed=await validate(Uint8Array.from(m.bytes)); // Preflight precedes all restoration effects.
    if(await get('activeSnapshot'))throw Error('fresh target required in this proof');
    s.maintenance=true;host.event(s,'restore-barrier');await host.save(s);
    // Deliberately occupy extra IDs. Never import source cookieStoreId authority.
    for(let i=0;i<3;i++)await browser.contextualIdentities.create({name:'Target-unused-'+i,color:'red',icon:'circle'});
    const mapping=await containers(parsed.sections,'Restored-'),plan=restorePlan(parsed.sections,mapping);
    await browser.storage.local.set({restoreStage:{phase:'prepared',plan,mapping,archiveSHA:await hash(Uint8Array.from(m.bytes))}});
    // A real partial origin write, not just a staged success flag.
    await site(plan.localStorage[0],'write',scopeData(plan,0));
    if(m.interrupt)throw Error('INJECTED_RESTORE_INTERRUPTION; active snapshot unchanged; hold retained');
    return handle({op:'continueRestore'},host);
  }
  if(m.op==='continueRestore'){
    const stage=await get('restoreStage');if(!stage)throw Error('no staged restore');const f=stage.plan;
    for(let i=0;i<f.personas.items.length;i++)await site(f.localStorage[i],'write',scopeData(f,i));
    await setCookies(f.cookies);
    const observed=await collect(f);
    // Do not commit before content verification; cookie readback is compared externally as well.
    for(const key of ['localStorage','indexedDB','opfs'])if(JSON.stringify(observed[key])!==JSON.stringify(f[key])){
      // Object property ordering can differ; compare canonical JSON without losing array order.
      const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;
      if(JSON.stringify(canon(observed[key]))!==JSON.stringify(canon(f[key])))throw Error('readback mismatch '+key);
    }
    await browser.storage.local.set({activeSnapshot:f,restoreStage:null,restoreReceipt:{mapping:stage.mapping,archiveSHA:stage.archiveSHA,byteRestore:'verified',login:'NOT TESTED',routes:'NOT TESTED'}});
    s=await host.read();s.maintenance=true;host.event(s,'restore-bytes-committed-awaiting-session-route-validation');await host.save(s);
    return {mapping:stage.mapping,status:'bytes restored; operational hold retained',jobs:f.core.jobs};
  }
  if(m.op==='verifyRestore'){
    const f=await get('activeSnapshot');if(!f)throw Error('nothing committed');return {actual:await collect(f),receipt:await get('restoreReceipt'),state:await host.read()};
  }
  throw Error('unknown backup operation');
}
