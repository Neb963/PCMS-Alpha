/**
 * A01 disposable upgrade fixture inspector. Read-only *preflight*, not a
 * migration/restore engine. Unknown identities and possibly issued effects
 * are holds, never automatically rewritten or dispatched.
 */
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(x);
export function inspectUpgradeFixture(snapshot){
  const holds=[],sources=[];
  if(!snapshot||snapshot.profile!=='DISPOSABLE'||
      !Number.isSafeInteger(snapshot.schemaVersion)||snapshot.schemaVersion<0)
    return {ok:false,code:'UNSAFE_OR_UNVERSIONED_FIXTURE'};
  const seenAccounts=new Set(),personas=new Set(),routes=new Set();
  for(const account of snapshot.accounts||[]){
    if(!safeId(account.accountId)||seenAccounts.has(account.accountId))
      holds.push('ACCOUNT_IDENTITY_COLLISION');
    seenAccounts.add(account.accountId);
    if(account.personaUid){
      if(personas.has(account.personaUid))holds.push('PERSONA_NOT_UNIQUE');
      personas.add(account.personaUid);
    }
    if(account.routeId){
      if(routes.has(account.routeId))holds.push('PROTECTED_ROUTE_NOT_UNIQUE');
      routes.add(account.routeId);
    }
  }
  const seenGeneratorIds=new Set();
  for(const gen of snapshot.generators||[]){
    if(typeof gen.id!=='string'||!(/^(?:public_[0-9]+|slug-[a-z0-9-]+)$/.test(gen.id))||
        seenGeneratorIds.has(gen.id)||!/^[a-f0-9]{64}$/.test(gen.sourceFingerprint||''))
      holds.push('SOURCE_IDENTITY_UNVERIFIED');
    seenGeneratorIds.add(gen.id);
  }
  if((snapshot.generators||[]).some(g=>g.id.startsWith('public_')))
    holds.push('LEGACY_PUBLIC_ID_RECONCILIATION_REQUIRED');
  for(const op of snapshot.operations||[]){
    if(['DISPATCH_POSSIBLE','OBSERVING','HELD_UNCERTAIN'].includes(op.status))
      holds.push('POSSIBLE_EFFECT_READBACK_REQUIRED');
  }
  if(snapshot.restore?.resumeRequired)holds.push('RESTORE_CHECKPOINT_REQUIRES_INSPECTION');
  for(const item of snapshot.sourceBlobs||[]){
    if(typeof item.path!=='string'||item.path.includes('..')||
        typeof item.contentBase64!=='string'||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.contentBase64)){
      holds.push('SOURCE_BLOB_INVALID');continue;
    }
    const bytes=Buffer.from(item.contentBase64,'base64');
    if(bytes.toString('base64')!==item.contentBase64){
      holds.push('SOURCE_BLOB_NONCANONICAL');continue;
    }
    sources.push({slug:item.slug,path:item.path,sha256:sha(bytes),size:bytes.length});
  }
  const secretShape=JSON.stringify(snapshot);
  if(/"(?:githubToken|gitCredential|access_token|secretToken)"\s*:/.test(secretShape))
    holds.push('BACKUP_CREDENTIAL_INCLUDED');
  const unique=[...new Set(holds)].sort();
  return {ok:true,schema:'pcms.a01.migration-preflight/1',readOnly:true,
    migrationPerformed:false,dispatchedEffects:0,
    sourceDigests:sources,holds:unique,
    status:unique.length?'HELD_FOR_INSPECTION':'READ_ONLY_CANDIDATE'};
}
