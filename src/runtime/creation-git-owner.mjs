// S04 read-only owner fence for any Git association. The first verified
// provider result can become stale while a browser is closed: re-observe
// the exact current bound principal/remote ID/visibility on the donor route
// before creating or confirming a canonical source association.
const fail=code=>({ok:false,code});
const HEX=/^[a-f0-9]{64}$/;
export async function requireS04FreshOwner({db,item,guard,restoreHeld=async()=>false}={}){
  if(!db||!item?.accountId||!item?.personaUid||!item?.remoteId||
     !guard?.getSafeRouteReadiness||!guard?.runSupplyStep)
    return fail('GIT_OWNER_AUTHORITY_UNAVAILABLE');
  const account=await new Promise((resolve,reject)=>{
    let value=null,tx;
    try{tx=db.transaction(['meta'],'readonly');}
    catch{return reject(Error('S04_ACCOUNT_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(Error('S04_ACCOUNT_DB_ABORTED'));
    tx.objectStore('meta').get('account:'+item.accountId).onsuccess=e=>{
      const a=e.target.result?.account;
      if(a?.state==='VERIFIED'&&a.revision===item.accountRevision&&
         a.personaUid===item.personaUid&&
         a.bindingVersion===item.bindingVersion&&
         a.identity?.source==='GUARDED_SESSION_READBACK'&&
         a.identity?.bindingVersion===item.bindingVersion&&
         HEX.test(a.identity?.principalFingerprint||''))value=a;
    };
  });
  if(!account)return fail('GIT_ACCOUNT_CONTEXT_CHANGED');
  if(await restoreHeld())return fail('RESTORE_HOLD');
  const before=await guard.getSafeRouteReadiness(item.personaUid);
  if(!before?.ready||before.personaUid!==item.personaUid)
    return fail('GIT_PROTECTED_ROUTE_UNVERIFIED');
  let observed;
  try{
    observed=await guard.runSupplyStep(item.personaUid,{
      kind:'READ_TARGET',slug:item.slug,
      principalFingerprint:account.identity.principalFingerprint});
  }catch{return fail('GIT_OWNER_READBACK_UNAVAILABLE');}
  const after=await guard.getSafeRouteReadiness(item.personaUid);
  if(!after?.ready||after.personaUid!==before.personaUid||
     after.cookieStoreId!==before.cookieStoreId||
     after.routeId!==before.routeId||await restoreHeld())
    return fail('GIT_PROTECTED_ROUTE_CHANGED');
  if(observed?.ok!==true||observed.source!=='INDEPENDENT_TARGET_READBACK'||
     observed.state!=='OWNED_VERIFIED'||observed.ownerMatches!==true||
     observed.slug!==item.slug||observed.remoteId!==item.remoteId||
     observed.visibility!==(item.visibility||'UNLISTED'))
    return fail('GIT_CURRENT_OWNER_OR_VISIBILITY_UNVERIFIED');
  return {ok:true,source:'FRESH_PROTECTED_OWNER_AND_REMOTE_ID',
    accountRevision:account.revision};
}
