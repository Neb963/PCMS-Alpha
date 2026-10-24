// I04: canonical, read-only generator observations. Never a provider-write grant.
import { fail, isSafeId } from './journal.mjs';

const slugOK = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,99}$/.test(v);
const hashOK = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const states = new Set(['OBSERVED_OWNER','OWNER_UNVERIFIED','OWNER_DISPUTED','UNOBSERVED','IDENTITY_CONFLICT','OWNER_CONFLICT']);
const inventoryKey = slug => 'inventory:' + slug;
const ownerAccount = a => ['VERIFIED','INVENTORY_PENDING'].includes(a?.state) && a.identity?.source === 'GUARDED_SESSION_READBACK' &&
  hashOK(a.identity.principalFingerprint) && a.identity.bindingVersion === a.bindingVersion &&
  isSafeId(a.accountId) && Number.isSafeInteger(a.revision);

export function eligibleInventoryAccount(account) {
  return ownerAccount(account) ? {ok:true} : fail('ACCOUNT_IDENTITY_UNVERIFIED');
}

// Only an independently authenticated account readback plus distinct target
// owner readback can claim "previously owner-observed". Edit permissions, edit
// keys, shared/collaborator access and page text are intentionally ignored.
export function validateInventoryObservation(account, observation) {
  if (!ownerAccount(account)) return fail('ACCOUNT_IDENTITY_UNVERIFIED');
  if (observation?.source !== 'GUARDED_PERCHANCE_READBACK' ||
      observation.complete !== true || observation.accountId !== account.accountId ||
      observation.personaUid !== account.personaUid ||
      observation.bindingVersion !== account.bindingVersion ||
      observation.accountRevision !== account.revision ||
      observation.principalFingerprint !== account.identity.principalFingerprint ||
      !isSafeId(observation.observationId) ||
      !Number.isSafeInteger(observation.observedAt) || observation.observedAt <= 0 ||
      !Array.isArray(observation.generators) || observation.generators.length > 5000)
    return fail('INVENTORY_EVIDENCE_UNAVAILABLE');
  const seen = new Set(), normalized = [];
  for (const item of observation.generators) {
    if (!slugOK(item?.slug) || !isSafeId(item.remoteId) ||
        seen.has(item.slug) ||
        !['IS_OWNER','NOT_OWNER','UNKNOWN'].includes(item.ownerResult) ||
        (item.ownerResult === 'IS_OWNER' && (item.ownerPrincipalFingerprint !== observation.principalFingerprint ||
          item.ownerObservationId == null || !isSafeId(item.ownerObservationId))) ||
        (item.visibility != null && !['PUBLIC','UNLISTED','UNKNOWN'].includes(item.visibility))) {
      return fail('INVENTORY_ITEM_AMBIGUOUS');
    }
    seen.add(item.slug);
    normalized.push({
      slug:item.slug,remoteId:item.remoteId,ownerResult:item.ownerResult,
      visibility:item.visibility || 'UNKNOWN',
      ownerEvidence:item.ownerResult === 'IS_OWNER' ? item.ownerObservationId : null
    });
  }
  return {ok:true,items:normalized};
}

export function reconcileInventory(existing, account, observation) {
  const validated = validateInventoryObservation(account, observation);
  if (!validated.ok) return validated;
  const next = new Map(existing.map(x => [x.slug, {...x}]));
  const seen = new Set(), incidents = [];
  for (const item of validated.items) {
    const prior = next.get(item.slug);
    seen.add(item.slug);
    if (prior && (prior.accountId !== account.accountId || prior.remoteId !== item.remoteId)) {
      const accountConflict=prior.accountId!==account.accountId;
      const slugOnlyAfterProven= !accountConflict &&
        prior.identitySchema===2 &&
        prior.identityBasis==='INDEPENDENT_FULL_BYTE_READBACK' &&
        prior.identityAliases?.includes(item.remoteId) &&
        /^public_[A-Za-z0-9_-]{1,90}$/.test(prior.remoteId||'');
      // A fresh owner-list entry identifies a *slug*, not the immutable
      // provider resource. Preserve the proven ID and hold mutation until an
      // independent protected full-source recheck proves it has not changed.
      const state=accountConflict?'OWNER_CONFLICT':'IDENTITY_CONFLICT';
      next.set(item.slug,{...prior,ownerState:state,revision:prior.revision+1,
        ...(slugOnlyAfterProven?{identityHold:'PUBLIC_ID_REVALIDATION_REQUIRED'}:{})});
      incidents.push({slug:item.slug,code:slugOnlyAfterProven?
        'PUBLIC_ID_REVALIDATION_REQUIRED':state});
      continue;
    }
    const ownerState = item.ownerResult === 'IS_OWNER' ? 'OBSERVED_OWNER' :
      item.ownerResult === 'NOT_OWNER' ? 'OWNER_DISPUTED' : 'OWNER_UNVERIFIED';
    const unchanged = prior && prior.ownerState === ownerState && prior.visibility === item.visibility &&
      prior.lastObservationId === observation.observationId;
    next.set(item.slug,{
      slug:item.slug,remoteId:item.remoteId,accountId:account.accountId,
      personaUid:account.personaUid,bindingVersion:account.bindingVersion,
      accountRevision:account.revision,ownerState,visibility:item.visibility,
      // A later read-only sync never erases that PCMS created this generator
      // (same account and remote ID, checked above) or its source state;
      // staging eligibility depends on MANAGED_CREATED.
      management:prior?.management==='MANAGED_CREATED'?'MANAGED_CREATED':'OBSERVED_ONLY',
      source:prior?.management==='MANAGED_CREATED'&&typeof prior.source==='string'?
        prior.source:'SOURCE_PENDING',
      lastObservationId:observation.observationId,
      lastObservedAt:observation.observedAt,
      revision:unchanged?prior.revision:(prior?.revision || 0)+1
    });
  }
  // "complete" means this observation was exhaustive, not that missing items
  // were deleted. Retain every old identity and source association.
  for (const [slug, prior] of next) {
    if (prior.accountId === account.accountId && !seen.has(slug) &&
        prior.ownerState !== 'UNOBSERVED' && !['IDENTITY_CONFLICT','OWNER_CONFLICT'].includes(prior.ownerState)) {
      next.set(slug,{...prior,ownerState:'UNOBSERVED',revision:prior.revision+1});
    }
  }
  return {ok:true,rows:[...next.values()],incidents};
}

export function publicGenerator(row) {
  return {slug:row.slug,accountId:row.accountId,ownerState:row.ownerState,
    visibility:row.visibility,management:row.management,source:row.source,
    revision:row.revision,lastObservedAt:row.lastObservedAt,
    ...(row.identityHold?{identityHold:row.identityHold}:{}) ,
    evidence:'HISTORICAL_READ_ONLY',providerWrites:'OFF'};
}

// This store rechecks the canonical account inside the same IDB transaction
// that commits inventory. A login/rebind/archive revision change cannot race
// a stale asynchronous provider readback into authoritative inventory.
export function createInventoryStore(db) {
  function transact(mode, fn) {
    return new Promise((resolve,reject)=>{
      let result=fail('INVENTORY_TRANSACTION_INCOMPLETE'), tx;
      try {tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
      catch {reject(Error('INVENTORY_DB_UNAVAILABLE'));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(Error('INVENTORY_DB_ABORTED'));
      tx.onerror=()=>{};
      try {fn(tx,v=>{result=v;});} catch {try{tx.abort();}catch{}}
    });
  }
  function applyObservation(account, observation) {
    const preliminary=validateInventoryObservation(account,observation);
    if(!preliminary.ok)return Promise.resolve(preliminary);
    return transact('readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta'), all=[];
      meta.get('account:'+account.accountId).onsuccess=e=>{
        const current=e.target.result?.account;
        if(!current || current.revision!==account.revision ||
            current.bindingVersion!==account.bindingVersion ||
            current.personaUid!==account.personaUid ||
            current.identity?.principalFingerprint!==account.identity.principalFingerprint ||
            !['VERIFIED','INVENTORY_PENDING'].includes(current.state)) {finish(fail('ACCOUNT_CONTEXT_CHANGED'));return;}
        // Monotone per-account observation watermark prevents a slow older
        // response or replay from overwriting a newer complete snapshot.
        meta.get('inventory-batch:'+account.accountId).onsuccess=mark=>{
          const last=mark.target.result;
          if(last && (observation.observedAt<=last.observedAt ||
              observation.observationId===last.observationId)){
            finish(fail('STALE_OR_REPLAYED_OBSERVATION'));return;
          }
        meta.openCursor().onsuccess=c=>{
          const row=c.target.result;
          if(row){
            if(typeof row.key==='string' && row.key.startsWith('inventory:') && row.value?.generator)
              all.push(row.value.generator);
            row.continue();return;
          }
          const outcome=reconcileInventory(all,current,observation);
          if(!outcome.ok){finish(outcome);return;}
          // The original records (including conflicts and absences) remain.
          for(const value of outcome.rows) {
            const original=all.find(x=>x.slug===value.slug);
            if (!original || JSON.stringify(original)!==JSON.stringify(value))
              meta.put({key:inventoryKey(value.slug),generator:value});
          }
          meta.put({key:'inventory-batch:'+account.accountId,
            observedAt:observation.observedAt,observationId:observation.observationId,
            accountRevision:current.revision,bindingVersion:current.bindingVersion});
          tx.objectStore('events').add({
            stage:'INVENTORY_OBSERVED',accountId:account.accountId,
            observationId:observation.observationId,entries:preliminary.items.length,
            conflicts:outcome.incidents.length
          });
          finish({ok:true,observed:preliminary.items.length,
            conflicts:outcome.incidents.length,held:outcome.incidents.length>0});
        };
        };
      };
    });
  }
  // A07: sort before pagination, never rearrange a single already-sliced page.
  // Keep at most offset+limit candidates (not the entire fleet) for sorted
  // reads; count every matching canonical row without a product count cap.
  function list({query='',ownerState='ALL',accountId='',offset=0,limit=50,sort='fleet'}={}) {
    if(typeof query!=='string' || query.length>80 ||
        (ownerState!=='ALL'&&!states.has(ownerState)) ||
        (accountId!==''&&!isSafeId(accountId)) ||
        !['fleet','name','account'].includes(sort) ||
        !Number.isSafeInteger(offset)||offset<0||offset>100000 ||
        !Number.isSafeInteger(limit)||limit<1||limit>100)
      return Promise.resolve(fail('INVALID_INVENTORY_QUERY'));
    const search=query.trim().toLowerCase(),keep=offset+limit;
    const compare=(a,b)=>sort==='account'?
      a.accountId.localeCompare(b.accountId)||a.slug.localeCompare(b.slug):
      a.slug.localeCompare(b.slug);
    return transact('readonly',(tx,finish)=>{
      const matches=[];let count=0;
      tx.objectStore('meta').openCursor().onsuccess=e=>{
        const row=e.target.result;
        if(!row){
          finish({ok:true,items:sort==='fleet'?matches:matches.slice(offset),
            total:count,truncated:false});return;
        }
        const g=row.value?.generator;
        if(typeof row.key==='string'&&row.key.startsWith('inventory:')&&g&&
            (!accountId||g.accountId===accountId)&&
            (ownerState==='ALL'||g.ownerState===ownerState)&&
            (g.slug.toLowerCase().includes(search)||g.accountId.toLowerCase().includes(search))){
          if(sort==='fleet'){
            if(count>=offset&&matches.length<limit)matches.push(publicGenerator(g));
          }else{
            const value=publicGenerator(g);
            // Insert in global order without retaining records beyond the
            // requested last row. Retained candidate identity is canonical.
            let low=0,high=matches.length;
            while(low<high){const m=(low+high)>>>1;
              if(compare(matches[m],value)<=0)low=m+1;else high=m;}
            if(low<keep)matches.splice(low,0,value);
            if(matches.length>keep)matches.pop();
          }
          count++;
        }
        row.continue();
      };
    });
  }
  function accountSummaries(){
    return transact('readonly',(tx,finish)=>{
      const summaries=Object.create(null);
      const summary=id=>summaries[id]||= {known:false,observedAt:null,verifiedOwned:0,unverified:0};
      tx.objectStore('meta').openCursor().onsuccess=e=>{
        const row=e.target.result;
        if(!row){finish({ok:true,summaries});return;}
        const name=String(row.key),value=row.value;
        if(name.startsWith('inventory-batch:')&&value?.observationId){
          const s=summary(name.slice('inventory-batch:'.length));
          Object.assign(s,{known:true,observedAt:value.observedAt,
            accountRevision:value.accountRevision??null,bindingVersion:value.bindingVersion??null});
        }else if(name.startsWith('inventory:')&&value?.generator?.accountId){
          const g=value.generator,s=summary(g.accountId);
          if(g.ownerState==='OBSERVED_OWNER')s.verifiedOwned++;
          else s.unverified++;
        }
        row.continue();
      };
    });
  }
  return Object.freeze({applyObservation,list,accountSummaries});
}
