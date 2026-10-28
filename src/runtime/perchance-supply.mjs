// Fixed I06 ISOLATED-world provider operation. The DONOR owns tab choice,
// Persona route and a short control lease. No arbitrary script/code/URL or
// browser-provided identity is taken from the PCMS UI.
// Mutating kinds require durable DISPATCH_POSSIBLE plus exact owner/route,
// restore and capability verification. READ kinds observe only; none authorizes replay.
export async function perchanceSupplyIsolated(request) {
  const hold=code=>({ok:false,code});
  const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x);
  const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x);
  const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  if(location.origin!=='https://perchance.org')return hold('WRONG_ORIGIN');
  if(!request||!['CREATE','RENAME','READ_CREATE','READ_RENAME','READ_TARGET','RENAME_EXISTING','READ_EXISTING_RENAME','READ_TEMPLATE'].includes(request.kind)||
     !slug(request.slug)||!hex(request.principalFingerprint))
    return hold('INVALID_SUPPLY_REQUEST');
  if(!['CREATE','READ_TARGET','READ_TEMPLATE'].includes(request.kind)&&!slug(request.temporarySlug))
    return hold('INVALID_SUPPLY_REQUEST');
  if(['RENAME','READ_RENAME','RENAME_EXISTING','READ_EXISTING_RENAME'].includes(request.kind)&&!safeId(request.remoteId))
    return hold('INVALID_SUPPLY_REQUEST');
  try {
    const raw=localStorage.getItem('app-storage'),change=localStorage.getItem('sessionTokenLastChangeTime');
    if(typeof raw!=='string'||raw.length>160000)return hold('NO_PAGE_SESSION');
    const user=JSON.parse(raw)?.user;
    if(user?.loggedIn!==true||typeof user?.email!=='string'||
       typeof user.sessionToken!=='string'||user.sessionToken.length<8||
       user.sessionToken.length>8192)return hold('NO_PAGE_SESSION');
    const email=user.email.trim().toLowerCase();
    if(email.length>254||!email.includes('@'))return hold('NO_PAGE_SESSION');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email));
    const fp=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(fp!==request.principalFingerprint)return hold('PRINCIPAL_CHANGED');
    const sameSession=()=>localStorage.getItem('sessionTokenLastChangeTime')===change &&
      localStorage.getItem('app-storage')===raw && location.origin==='https://perchance.org';
    async function call(endpoint,body,{unauthenticated=false}={}) {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
      try{
        const response=await fetch('https://perchance.org/api/'+endpoint,{
          method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(unauthenticated?body:{email,sessionToken:user.sessionToken,...body}),
          signal:controller.signal});
        // Some provider/CDN deployments report an absent generator with
        // HTTP 404 rather than a JSON 200 missing-status. A 404 alone is
        // NEVER absence proof: READ_TARGET requires the separate authenticated
        // non-owner check, complete owner census and a positive same-endpoint
        // control read before accepting it.
        if(response.status===404&&endpoint==='getGeneratorPageData'&&unauthenticated)
          return {status:'pcms-observed-http-404'};
        if(response.status===429)return {status:'too-many-requests'};
        if(response.status!==200||!String(response.headers.get('content-type')||'').includes('json'))
          return {status:'unverified'};
        const data=await response.json();
        if(!data||typeof data!=='object'||Array.isArray(data)||
           data.status==='pcms-observed-http-404')return {status:'unverified'};
        return data;
      }catch{return {status:'unverified'};}
      finally{clearTimeout(timer);}
    }
    if(request.kind==='READ_TEMPLATE'){
      // Current prerequisite observation only. This path never saves, creates,
      // renames, uses the editor, or requires a complete owned-generator census.
      const page=await call('getGeneratorPageData',{generatorName:'minimal'},{unauthenticated:true});
      const owner=await call('checkGeneratorOwnership',{generatorName:'minimal'});
      if(!sameSession())return hold('SESSION_CHANGED');
      if(owner.status==='is-not-owner'&&['generator-does-not-exist','not-found'].includes(page.status))
        return {ok:true,source:'INDEPENDENT_TEMPLATE_READBACK',template:'minimal',
          state:'MISSING_VERIFIED',ownership:'NOT_OWNED',schemaVerified:false,fingerprint:null};
      if(!['is-owner','is-not-owner'].includes(owner.status))return hold('TEMPLATE_OWNER_UNVERIFIED');
      if(page.status!=='success')return hold('TEMPLATE_UNVERIFIED');
      const g=page.generator,manifest=g?.srcManifest;
      if(!g||g.name!=='minimal'||typeof g.isPrivate!=='boolean'||
        typeof g.modelText!=='string'||typeof g.outputTemplate!=='string'||
        g.modelText.length>2097152||g.outputTemplate.length>2097152||
        !manifest||typeof manifest!=='object')return hold('TEMPLATE_SCHEMA_UNVERIFIED');
      const source=JSON.stringify({name:g.name,isPrivate:g.isPrivate,
        modelText:g.modelText,outputTemplate:g.outputTemplate,srcManifest:manifest});
      if(source.length>4194304)return hold('TEMPLATE_SCHEMA_UNVERIFIED');
      const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
      if(!sameSession())return hold('SESSION_CHANGED');
      return {ok:true,source:'INDEPENDENT_TEMPLATE_READBACK',template:'minimal',
        state:'AVAILABLE',ownership:owner.status==='is-owner'?'OWNED':'NOT_OWNED',
        schemaVerified:true,fingerprint:[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')};
    }
    const census=await call('getGeneratorsByUser',{});
    if(!sameSession())return hold('SESSION_CHANGED');
    if(census.status==='session-token-error')return hold('SESSION_REJECTED');
    if(census.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
    if(census.status!=='success'||!Array.isArray(census.generators)||
       census.generators.length>5000)return hold('SESSION_UNVERIFIED');
    const all=census.generators;
    const currentNames=new Set();
    for(const g of all){
      if(typeof g?.name!=='string'||typeof g.isPrivate!=='boolean'||currentNames.has(g.name))
        return hold('INVENTORY_SCHEMA_UNVERIFIED');
      currentNames.add(g.name);
    }
    const read=async name=>{
      const owner=await call('checkGeneratorOwnership',{generatorName:name});
      const page=await call('getGeneratorPageData',{generatorName:name},{unauthenticated:true});
      const manifest=page.generator?.srcManifest;
      const manifestVerified=manifest!==null&&typeof manifest==='object'&&
        (Array.isArray(manifest)?
          manifest.length===0:
          (Object.getPrototypeOf(manifest)===Object.prototype||
           (Object.prototype.toString.call(manifest)==='[object Object]'&&
            Object.getPrototypeOf(manifest)!==null&&Object.getPrototypeOf(Object.getPrototypeOf(manifest))===null))&&
          Object.keys(manifest).length===0);
      if(owner.status!=='is-owner'||page.status!=='success'||!page.generator||
         page.generator.name!==name||page.generator.isPrivate!==true||
         page.generator.modelText!==''||page.generator.outputTemplate!==''||
         !manifestVerified)
        return hold('PRIVATE_EMPTY_OWNER_UNVERIFIED');
      const publicId=page.generator.publicId;
      if(typeof publicId!=='string'||!safeId('public_'+publicId))
        return hold('REMOTE_ID_UNVERIFIED');
      return {ok:true,remoteId:'public_'+publicId};
    };
    // Shared absence gate for READ_TARGET and the *independent* last checks
    // inside CREATE/RENAME/RENAME_EXISTING. HTTP 404 alone is not proof:
    // require current authenticated non-ownership, complete owner census
    // omission and a positive same-endpoint control (when status is HTTP404).
    const confirmAbsent=async(name,owner,page)=>{
      if(!sameSession())return hold('SESSION_CHANGED');
      if(owner.status==='session-token-error')return hold('SESSION_REJECTED');
      if(owner.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
      if(owner.status!=='is-not-owner')return hold('TARGET_OWNER_READBACK_UNVERIFIED');
      if(currentNames.has(name))return hold('TARGET_CENSUS_OWNER_CONFLICT');
      if(['generator-does-not-exist','not-found'].includes(page.status))
        return {ok:true};
      if(page.status==='pcms-observed-http-404'){
        const control=all[0]?.name||'minimal';
        if(control===name)return hold('TARGET_HTTP404_CONTROL_UNVERIFIED');
        const controlPage=await call('getGeneratorPageData',{
          generatorName:control},{unauthenticated:true});
        if(!sameSession())return hold('SESSION_CHANGED');
        if(controlPage.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
        if(controlPage.status!=='success'||controlPage.generator?.name!==control||
           typeof controlPage.generator.publicId!=='string')
          return hold('TARGET_HTTP404_CONTROL_UNVERIFIED');
        if(all.length){
          const checked=await call('checkGeneratorOwnership',{generatorName:control});
          if(!sameSession())return hold('SESSION_CHANGED');
          if(checked.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
          if(checked.status!=='is-owner')return hold('TARGET_HTTP404_CONTROL_UNVERIFIED');
        }
        return {ok:true};
      }
      if(page.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
      if(page.status==='server-error')return hold('PROVIDER_UNAVAILABLE');
      if(page.status==='unverified')return hold('TARGET_PAGE_TRANSPORT_UNAVAILABLE');
      return hold('TARGET_PAGE_ABSENCE_UNVERIFIED');
    };
    if(request.kind==='READ_TARGET'){
      // A new name has no owner to prove. The authenticated owned-generator
      // census is authoritative for deciding whether this account must adopt.
      // A public page read can reject a clearly occupied name early, but its
      // failure is not a prerequisite to asking Perchance to claim the name.
      // The server enforces uniqueness during changeGeneratorName.
      const proof=(state,extra={})=>({ok:true,source:'INDEPENDENT_TARGET_READBACK',
        state,slug:request.slug,ownerMatches:state==='OWNED_VERIFIED',...extra});
      const ownedHere=currentNames.has(request.slug);
      if(ownedHere){
        const owner=await call('checkGeneratorOwnership',{generatorName:request.slug});
        if(!sameSession())return hold('SESSION_CHANGED');
        if(owner.status==='session-token-error')return hold('SESSION_REJECTED');
        if(owner.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
        if(owner.status!=='is-owner')return hold('TARGET_CENSUS_OWNER_CONFLICT');
        const page=await call('getGeneratorPageData',{generatorName:request.slug},{unauthenticated:true});
        if(!sameSession())return hold('SESSION_CHANGED');
        if(page.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
        const g=page.generator;
        if(page.status!=='success'||g?.name!==request.slug||
           typeof g.isPrivate!=='boolean'||typeof g.publicId!=='string'||
           !safeId('public_'+g.publicId))return hold('TARGET_OWNED_PAGE_UNVERIFIED');
        return proof('OWNED_VERIFIED',{remoteId:'public_'+g.publicId,
          visibility:g.isPrivate?'UNLISTED':'PUBLIC'});
      }
      const page=await call('getGeneratorPageData',{generatorName:request.slug},{unauthenticated:true});
      if(!sameSession())return hold('SESSION_CHANGED');
      if(page.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
      if(page.status==='success'){
        const g=page.generator;
        if(g?.name!==request.slug||typeof g.isPrivate!=='boolean'||
           typeof g.publicId!=='string'||!safeId('public_'+g.publicId))
          return hold('TARGET_PAGE_IDENTITY_UNVERIFIED');
        // A valid existing page is occupied. Check for a contradictory
        // authenticated ownership claim before treating it as foreign.
        const owner=await call('checkGeneratorOwnership',{generatorName:request.slug});
        if(!sameSession())return hold('SESSION_CHANGED');
        if(owner.status==='is-owner')return hold('TARGET_CENSUS_OWNER_CONFLICT');
        if(owner.status==='session-token-error')return hold('SESSION_REJECTED');
        if(owner.status==='too-many-requests')return hold('PROVIDER_RATE_LIMITED');
        return proof('COLLISION');
      }
      if(page.status==='server-error')return hold('PROVIDER_UNAVAILABLE');
      // A not-found page is useful evidence, but its status and an optional
      // nonownership request do not prove global availability. An unavailable
      // page read also cannot grant ownership. This candidate may attempt
      // ONE journaled create, then ONE server-arbitrated rename.
      return proof('CLAIM_CANDIDATE');
    }
    if(request.kind==='READ_CREATE') {
      const checked=await read(request.temporarySlug);
      if(!checked.ok)return hold(checked.code||'CREATE_READBACK_UNVERIFIED');
      return sameSession()?{ok:true,source:'INDEPENDENT_READBACK',
        temporarySlug:request.temporarySlug,remoteId:checked.remoteId,
        ownerMatches:true,privateEmpty:true}:hold('SESSION_CHANGED');
    }
    if(request.kind==='READ_RENAME') {
      const checked=await read(request.slug);
      if(!checked.ok||checked.remoteId!==request.remoteId)return hold('RENAME_READBACK_UNVERIFIED');
      if(currentNames.has(request.temporarySlug))return hold('OLD_SLUG_STILL_PRESENT');
      return sameSession()?{ok:true,source:'INDEPENDENT_READBACK',
        slug:request.slug,previousSlug:request.temporarySlug,
        remoteId:checked.remoteId,ownerMatches:true,privateEmpty:true}:
        hold('SESSION_CHANGED');
    }
    if(request.kind==='CREATE') {
      // Exact first save is PRIVATE/EMPTY. Never use the current editor's
      // unsaved content, copy an existing owned generator, or create publicly.
      if(currentNames.has(request.slug))return hold('SLUG_ALREADY_OWNED');
      const template=await call('getGeneratorPageData',{generatorName:'minimal'},{unauthenticated:true});
      if(template.status!=='success'||template.generator?.name!=='minimal')
        return hold('TEMPLATE_UNVERIFIED');
      // Never use this account's own generator as a copy source.
      if(currentNames.has('minimal'))return hold('TEMPLATE_OWNED_BY_TARGET');
      if(!sameSession())return hold('SESSION_CHANGED');
      const original=template.generator;
      // One provider request only, AFTER outer dispatcher journaling.
      const result=await call('save',{generator:{
        ...original,name:'minimal',isPrivate:true,modelText:'',outputTemplate:''
      },srcManifest:[]});
      if(!sameSession())return hold('SESSION_CHANGED_AFTER_EFFECT');
      if(result.status!=='created'||!slug(result.name))
        return hold('CREATE_ACK_UNCERTAIN');
      return {ok:true,ack:'CREATED',temporarySlug:result.name};
    }
    // AC-09 existing owned identity rename is DISTINCT from the private/empty
    // temporary-slug rename during CREATE. Only the trusted background may
    // dispatch this after a durable DISPATCH_POSSIBLE intent and exact owner,
    // source and route proof. This isolated adapter never deletes or saves
    // generator source and never retries a remote write.
    if(request.kind==='RENAME_EXISTING'||request.kind==='READ_EXISTING_RENAME'){
      if(request.temporarySlug===request.slug)return hold('SAME_IDENTITY');
      const existing=await call('checkGeneratorOwnership',{
        generatorName:request.temporarySlug});
      const oldPage=await call('getGeneratorPageData',{
        generatorName:request.temporarySlug},{unauthenticated:true});
      const original=oldPage.generator;
      const oldId=original?.publicId;
      const matchesOld=existing.status==='is-owner'&&oldPage.status==='success'&&
        original?.name===request.temporarySlug&&typeof oldId==='string'&&
        'public_'+oldId===request.remoteId;
      const newOwner=await call('checkGeneratorOwnership',{generatorName:request.slug});
      const newPage=await call('getGeneratorPageData',{
        generatorName:request.slug},{unauthenticated:true});
      if(!sameSession())return hold('SESSION_CHANGED');
      if(request.kind==='READ_EXISTING_RENAME'){
        if(matchesOld||oldPage.status==='success'||existing.status==='is-owner')
          return hold('OLD_IDENTITY_STILL_PRESENT');
        if(newOwner.status!=='is-owner'||newPage.status!=='success'||
           newPage.generator?.name!==request.slug||
           'public_'+newPage.generator?.publicId!==request.remoteId)
          return hold('RENAMED_OWNER_OR_ID_UNVERIFIED');
        return {ok:true,source:'INDEPENDENT_TARGET_READBACK',
          state:'RENAMED_SAME_REMOTE_ID',remoteId:request.remoteId,
          oldSlug:request.temporarySlug,newSlug:request.slug,
          ownerMatches:true,sourceUnchanged:'NOT_INFERRED'};
      }
      if(!matchesOld||!currentNames.has(request.temporarySlug))
        return hold('EXISTING_OWNER_OR_REMOTE_ID_UNVERIFIED');
      if(currentNames.has(request.slug)||newPage.status==='success')
        return hold('TARGET_ALREADY_OCCUPIED');
      const absence=await confirmAbsent(request.slug,newOwner,newPage);
      if(!absence.ok)return absence;
      if(!sameSession())return hold('SESSION_CHANGED');
      const renamed=await call('changeGeneratorName',{
        currentName:request.temporarySlug,newName:request.slug});
      if(!sameSession())return hold('SESSION_CHANGED_AFTER_EFFECT');
      return renamed.status==='success'?
        {ok:true,ack:'RENAME_EXISTING_ACK_ONLY'}:
        hold('RENAME_EXISTING_OUTCOME_UNCERTAIN');
    }
    if(request.kind==='RENAME'){
      if(request.temporarySlug===request.slug||currentNames.has(request.slug))
        return hold('SLUG_COLLISION');
      const checked=await read(request.temporarySlug);
      if(!checked.ok||checked.remoteId!==request.remoteId)return hold('TEMP_OWNER_UNVERIFIED');
      // The provider's atomic rename is the final name-claim arbiter. The
      // prepared journal already fences this write against replay.
      if(!sameSession())return hold('SESSION_CHANGED');
      const result=await call('changeGeneratorName',{
        currentName:request.temporarySlug,newName:request.slug});
      if(!sameSession())return hold('SESSION_CHANGED_AFTER_EFFECT');
      if(result.status!=='success')return hold('RENAME_ACK_UNCERTAIN');
      return {ok:true,ack:'RENAMED'};
    }
    return hold('CAPABILITY_OFF');
  }catch{return hold('SUPPLY_OBSERVER_UNAVAILABLE');}
}
