// Fixed I06 ISOLATED-world provider operation. The DONOR owns tab choice,
// Persona route and a short control lease. No arbitrary script/code/URL or
// browser-provided identity is taken from the PCMS UI.
// This function may execute a remote effect: NEVER call except after durable
// DISPATCH_POSSIBLE and exact owner/route/restore/capability verification.
export async function perchanceSupplyIsolated(request) {
  const hold=code=>({ok:false,code});
  const slug=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x);
  const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x);
  const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
  if(location.origin!=='https://perchance.org')return hold('WRONG_ORIGIN');
  if(!request||!['CREATE','RENAME','READ_CREATE','READ_RENAME','READ_TARGET','RENAME_EXISTING','READ_EXISTING_RENAME'].includes(request.kind)||
     !slug(request.slug)||!hex(request.principalFingerprint))
    return hold('INVALID_SUPPLY_REQUEST');
  if(!['CREATE','READ_TARGET'].includes(request.kind)&&!slug(request.temporarySlug))
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
        if(response.status!==200||!String(response.headers.get('content-type')||'').includes('json'))
          return {status:'unverified'};
        const data=await response.json();
        return data&&typeof data==='object'&&!Array.isArray(data)?data:{status:'unverified'};
      }catch{return {status:'unverified'};}
      finally{clearTimeout(timer);}
    }
    const census=await call('getGeneratorsByUser',{});
    if(census.status!=='success'||!Array.isArray(census.generators)||
       census.generators.length>5000||!sameSession())
      return hold('SESSION_UNVERIFIED');
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
          Object.getPrototypeOf(manifest)===Object.prototype&&
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
    if(request.kind==='READ_TARGET'){
      // Two different provider observations; no census-absence shortcut.
      // A valid current owner may be adopted, never treated as a new CREATE.
      const owner=await call('checkGeneratorOwnership',{generatorName:request.slug});
      const page=await call('getGeneratorPageData',{
        generatorName:request.slug},{unauthenticated:true});
      if(!sameSession())return hold('SESSION_CHANGED');
      if(owner.status==='is-owner'&&page.status==='success'&&
         page.generator?.name===request.slug&&
         typeof page.generator.isPrivate==='boolean'&&
         typeof page.generator.publicId==='string'&&
         safeId('public_'+page.generator.publicId))
        return {ok:true,source:'INDEPENDENT_TARGET_READBACK',
          state:'OWNED_VERIFIED',ownerMatches:true,slug:request.slug,
          remoteId:'public_'+page.generator.publicId,
          visibility:page.generator.isPrivate?'UNLISTED':'PUBLIC'};
      if(owner.status==='is-not-owner'&&page.status==='success')
        return {ok:true,source:'INDEPENDENT_TARGET_READBACK',
          state:'COLLISION',ownerMatches:false,slug:request.slug};
      if(owner.status==='is-not-owner'&&
         ['generator-does-not-exist','not-found'].includes(page.status))
        return {ok:true,source:'INDEPENDENT_TARGET_READBACK',
          state:'MISSING_VERIFIED',ownerMatches:false,slug:request.slug};
      return hold('TARGET_OWNER_OR_ABSENCE_UNVERIFIED');
    }
    if(request.kind==='READ_CREATE') {
      const checked=await read(request.temporarySlug);
      if(!checked.ok)return hold('CREATE_READBACK_UNVERIFIED');
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
      // Ensure target is not already taken independently of this account.
      const occupied=await call('getGeneratorPageData',{generatorName:request.slug},{unauthenticated:true});
      if(occupied.status==='success')return hold('SLUG_COLLISION');
      if(!['generator-does-not-exist','not-found'].includes(occupied.status))
        return hold('REMOTE_ABSENCE_UNVERIFIED');
      const template=await call('getGeneratorPageData',{generatorName:'minimal'},{unauthenticated:true});
      if(template.status!=='success'||template.generator?.name!=='minimal')
        return hold('TEMPLATE_UNVERIFIED');
      const templateOwner=await call('checkGeneratorOwnership',{generatorName:'minimal'});
      if(templateOwner.status!=='is-not-owner')return hold('TEMPLATE_OWNER_UNVERIFIED');
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
      if(newOwner.status==='is-owner'||
         !['generator-does-not-exist','not-found'].includes(newPage.status))
        return hold('TARGET_ABSENCE_UNVERIFIED');
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
      const target=await call('getGeneratorPageData',{generatorName:request.slug},{unauthenticated:true});
      if(target.status==='success')return hold('SLUG_COLLISION');
      if(!['not-found','generator-does-not-exist'].includes(target.status))
        return hold('REMOTE_ABSENCE_UNVERIFIED');
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
