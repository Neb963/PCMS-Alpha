// Fixed native API adapter, injected only into the donor-selected protected
// Perchance tab. Read-only preflight and dispatch are separate invocations.
export async function perchanceSupplyIsolated(request) {
  let boundary='NOT_DISPATCHED',phase='SESSION';
  const hold=code=>({ok:false,code,effectBoundary:boundary,stage:phase});
  const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x);
  const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x);
  const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const kind=request?.kind,preflight=kind?.startsWith('PREFLIGHT_'),operation=preflight?kind.slice(10):kind;
  if(location.origin!=='https://perchance.org')return hold('WRONG_ORIGIN');
  if(!request||!['CREATE','RENAME','READ_CREATE','READ_RENAME','INVESTIGATE_CREATE','CHECK_AVAILABILITY'].includes(operation)||
    !slug(request.slug)||!hex(request.principalFingerprint))return hold('INVALID_SUPPLY_REQUEST');
  if(['RENAME','READ_CREATE','READ_RENAME'].includes(operation)&&!slug(request.temporarySlug))return hold('INVALID_SUPPLY_REQUEST');
  if(['RENAME','READ_RENAME'].includes(operation)&&!safeId(request.remoteId))return hold('INVALID_SUPPLY_REQUEST');
  const mutation=['CREATE','RENAME'].includes(operation)&&!preflight;
  try {
    const raw=localStorage.getItem('app-storage'),change=localStorage.getItem('sessionTokenLastChangeTime');
    if(typeof raw!=='string'||raw.length>160000)return hold('NO_PAGE_SESSION');
    const user=JSON.parse(raw)?.user;
    if(user?.loggedIn!==true||typeof user?.email!=='string'||typeof user.sessionToken!=='string'||
      user.sessionToken.length<8||user.sessionToken.length>8192)return hold('NO_PAGE_SESSION');
    const email=user.email.trim().toLowerCase();
    if(email.length>254||!email.includes('@'))return hold('NO_PAGE_SESSION');
    const fp=await hash(email);if(fp!==request.principalFingerprint)return hold('PRINCIPAL_CHANGED');
    const sameSession=()=>localStorage.getItem('sessionTokenLastChangeTime')===change&&
      localStorage.getItem('app-storage')===raw&&location.origin==='https://perchance.org';
    const stamp=await hash('PCMS_SUPPLY_SESSION:'+request.operationId+':'+user.sessionToken+':'+change);
    if(mutation&&(!safeId(request.operationId)||request.preflight?.operationId!==request.operationId||
      request.preflight.sessionStamp!==stamp||request.preflight.slug!==request.slug||
      request.preflight.kind!==operation||!Number.isSafeInteger(request.preflight.observedAt)||
      Date.now()-request.preflight.observedAt>30000||Date.now()<request.preflight.observedAt))return hold('PREFLIGHT_EXPIRED_OR_SESSION_CHANGED');
    async function call(endpoint,body,{unauthenticated=false,mutating=false}={}) {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      try{
        if(!sameSession())return {status:'session-changed'};
        if(mutating)boundary='DISPATCH_POSSIBLE';
        const response=await fetch('https://perchance.org/api/'+endpoint,{method:'POST',credentials:'same-origin',
          redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(unauthenticated?body:{email,sessionToken:user.sessionToken,...body}),signal:controller.signal});
        if(response.status===429)return {status:'too-many-requests'};
        if(response.status!==200||!String(response.headers.get('content-type')||'').includes('json'))return {status:'transport-unverified'};
        const data=await response.json();return data&&typeof data==='object'&&!Array.isArray(data)?data:{status:'transport-unverified'};
      }catch{return {status:'transport-unverified'};}finally{clearTimeout(timer);}
    }
    phase='ACCOUNT_CENSUS';
    const census=await call('getGeneratorsByUser',{});
    if(census.status!=='success'||!Array.isArray(census.generators)||census.generators.length>5000||!sameSession())
      return hold(census.status==='too-many-requests'?'RATE_LIMITED':'SESSION_UNVERIFIED');
    const names=new Set(),privacy=new Map();
    for(const g of census.generators){
      if(!slug(g?.name)||typeof g.isPrivate!=='boolean'||names.has(g.name))return hold('INVENTORY_SCHEMA_UNVERIFIED');
      names.add(g.name);privacy.set(g.name,g.isPrivate);
    }
    const canonical=[...privacy].sort(([a],[b])=>a<b?-1:a>b?1:0);
    const censusFingerprint=await hash(JSON.stringify(canonical));
    if(mutation&&censusFingerprint!==request.preflight.censusFingerprint)return hold('PREFLIGHT_CENSUS_CHANGED');
    async function read(name){
      const owner=await call('checkGeneratorOwnership',{generatorName:name});
      const page=await call('getGeneratorPageData',{generatorName:name},{unauthenticated:true}),g=page.generator;
      const manifest=g?.srcManifest;
      const empty=manifest!=null&&typeof manifest==='object'&&Object.keys(manifest).length===0;
      if(owner.status!=='is-owner'||page.status!=='success'||g?.name!==name||g.isPrivate!==true||
        g.modelText!==''||g.outputTemplate!==''||!empty||
        ['imports','modelTextImports'].some(k=>g[k]!==undefined&&(!Array.isArray(g[k])||g[k].length))||
        ![undefined,false].includes(g.collabEditModeIsEnabled)||
        ['isPublic','isListed','listed','published','isPublished','showInRecent','isFeatured'].some(k=>g[k]!=null&&g[k]!==false)||
        ['visibility','privacy'].some(k=>g[k]!=null&&!['private','PRIVATE'].includes(g[k])))return hold('PRIVATE_EMPTY_OWNER_UNVERIFIED');
      if(typeof g.publicId!=='string'||!safeId('public_'+g.publicId))return hold('REMOTE_ID_UNVERIFIED');
      return {ok:true,remoteId:'public_'+g.publicId};
    }
    async function absent(){
      const target=await call('getGeneratorPageData',{generatorName:request.slug},{unauthenticated:true});
      if(target.status==='success')return hold('SLUG_COLLISION');
      return ['generator-does-not-exist','not-found'].includes(target.status)?{ok:true}:hold('REMOTE_ABSENCE_UNVERIFIED');
    }
    if(operation==='CHECK_AVAILABILITY'){
      const out=await absent();return out.ok?{ok:true,slug:request.slug,availability:'AVAILABLE_AT_OBSERVATION',observedAt:Date.now()}:
        {...out,availability:out.code==='SLUG_COLLISION'?'UNAVAILABLE':'UNKNOWN'};
    }
    if(operation==='INVESTIGATE_CREATE'){
      phase='READ_ONLY_INVESTIGATION';
      const baseline=request.preflight?.census;
      const prior=Array.isArray(baseline)?new Set(baseline.map(x=>x.name)):null;
      const hints=prior?[...names].filter(n=>!prior.has(n)):
        slug(request.candidateSlug)?[request.candidateSlug]:[];
      const candidates=[];
      for(const name of hints.slice(0,10)){
        const proof=await read(name);
        candidates.push({slug:name,inAccount:names.has(name),private:privacy.get(name)===true,
          ownerAndEmpty:proof.ok===true,remoteId:proof.ok?proof.remoteId:null,
          attributable:false});
      }
      return sameSession()?{ok:true,source:'INDEPENDENT_INVESTIGATION',effectBoundary:'NOT_DISPATCHED',
        baselineAvailable:!!prior,censusFingerprint,accountCount:names.size,candidates,truncated:hints.length>10,
        attribution:'UNPROVEN',observedAt:Date.now()}:hold('SESSION_CHANGED');
    }
    if(operation==='READ_CREATE'||operation==='READ_RENAME'){
      phase='INDEPENDENT_READBACK';const creating=operation==='READ_CREATE',name=creating?request.temporarySlug:request.slug;
      if(!names.has(name))return hold(creating?'TEMP_NOT_IN_ACCOUNT_INVENTORY':'FINAL_SLUG_NOT_IN_ACCOUNT_INVENTORY');
      if(privacy.get(name)!==true)return hold(creating?'TEMP_ACCOUNT_PRIVACY_UNVERIFIED':'FINAL_ACCOUNT_PRIVACY_UNVERIFIED');
      const proof=await read(name);if(!proof.ok)return {...proof,readback:'UNVERIFIED'};
      if(request.remoteId&&proof.remoteId!==request.remoteId)return hold('REMOTE_ID_CHANGED');
      if(!creating){
        if(names.has(request.temporarySlug))return hold('OLD_SLUG_STILL_PRESENT');
        const old=await call('getGeneratorPageData',{generatorName:request.temporarySlug},{unauthenticated:true});
        if(!['not-found','generator-does-not-exist'].includes(old.status))return hold('OLD_SLUG_PAGE_UNVERIFIED');
      }
      return sameSession()?{ok:true,source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,remoteId:proof.remoteId,
        ...(creating?{temporarySlug:name}:{slug:name,previousSlug:request.temporarySlug})}:hold('SESSION_CHANGED');
    }
    phase='TARGET_AVAILABILITY';
    if(names.has(request.slug))return hold('SLUG_COLLISION');
    const target=await absent();if(!target.ok)return target;
    if(operation==='RENAME'){
      if(!names.has(request.temporarySlug))return hold('TEMP_NOT_IN_ACCOUNT_INVENTORY');
      if(privacy.get(request.temporarySlug)!==true)return hold('TEMP_ACCOUNT_PRIVACY_UNVERIFIED');
      const old=await read(request.temporarySlug);
      if(!old.ok||old.remoteId!==request.remoteId)return hold('TEMP_OWNER_UNVERIFIED');
    }
    if(operation==='CREATE'&&preflight){
      phase='TEMPLATE';
      const t=await call('getGeneratorPageData',{generatorName:'minimal'},{unauthenticated:true});
      if(t.status!=='success'||t.generator?.name!=='minimal')return hold('TEMPLATE_UNVERIFIED');
      const owner=await call('checkGeneratorOwnership',{generatorName:'minimal'});
      if(owner.status!=='is-not-owner')return hold('TEMPLATE_OWNER_UNVERIFIED');
      // Only name is inherited. Source/imports/assets/privacy are explicitly
      // replaced, so public template metadata is neither cloned nor a refusal.
      if(typeof t.generator.modelText!=='string'||typeof t.generator.outputTemplate!=='string')return hold('TEMPLATE_SOURCE_UNVERIFIED');
      const m=t.generator.srcManifest;
      if(m!=null&&(typeof m!=='object'||Object.keys(m).length))return hold('TEMPLATE_SOURCE_UNVERIFIED');
      if(['html','pjs','src','scripts','files','javascript','js','source','sourceFiles','assets',
        'generatorCode','css','script','styles','plugins','imports','modelTextImports'].some(k=>
        t.generator[k]!=null&&t.generator[k]!==''&&(!Array.isArray(t.generator[k])||t.generator[k].length)))
        return hold('TEMPLATE_SOURCE_UNVERIFIED');
      if(typeof t.generator.isPrivate!=='boolean')return hold('TEMPLATE_VISIBILITY_UNVERIFIED');
    }
    if(!sameSession())return hold('SESSION_CHANGED');
    if(preflight)return {ok:true,code:'READY_TO_DISPATCH',effectBoundary:'NOT_DISPATCHED',preflight:{
      version:2,operationId:request.operationId,kind:operation,slug:request.slug,sessionStamp:stamp,
      observedAt:Date.now(),censusFingerprint,census:canonical.map(([name,isPrivate])=>({name,isPrivate})),
      owner:'VERIFIED',route:'PROTECTED',template:operation==='CREATE'?'UNOWNED_MINIMAL_EXPLICIT_EMPTY_PAYLOAD':null}};
    phase='NATIVE_DISPATCH';
    const result=operation==='CREATE'?await call('save',{generator:{name:'minimal',isPrivate:true,
      collabEditModeIsEnabled:false,imports:[],modelText:'',outputTemplate:''},srcManifest:{}},{mutating:true}):
      await call('changeGeneratorName',{currentName:request.temporarySlug,newName:request.slug},{mutating:true});
    const ackName=operation==='CREATE'&&slug(result.name)&&result.name!=='minimal'&&result.name!==request.slug&&!names.has(result.name)?result.name:null;
    const ackRemote=typeof result.publicId==='string'&&safeId('public_'+result.publicId)?'public_'+result.publicId:null;
    const hints={...(ackName?{temporarySlug:ackName}:{}),...(ackRemote?{remoteId:ackRemote}:{})};
    if(!sameSession())return {...hold('SESSION_CHANGED_AFTER_EFFECT'),...hints};
    if(operation==='CREATE'&&(result.status!=='created'||!ackName))return {...hold('CREATE_ACK_UNCERTAIN'),...hints,providerStatus:
      ['captcha-needed','stale','session-token-error','too-big','too-many-requests','server-error','generator-does-not-exist'].includes(result.status)?result.status:'UNVERIFIED'};
    if(operation==='RENAME'&&result.status!=='success')return {...hold(result.status==='already-exists'?'SLUG_COLLISION':'RENAME_ACK_UNCERTAIN'),providerStatus:
      ['already-exists','session-token-error','server-error','too-many-requests'].includes(result.status)?result.status:'UNVERIFIED'};
    return {ok:true,ack:operation==='CREATE'?'CREATED':'RENAMED',...hints,effectBoundary:boundary,stage:phase};
  }catch{return hold(boundary==='NOT_DISPATCHED'?'SUPPLY_PREFLIGHT_UNAVAILABLE':'SUPPLY_TRANSPORT_UNCERTAIN');}
}
