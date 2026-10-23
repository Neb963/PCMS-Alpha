import {browserGitCredentialPacket} from './git-local-secret.mjs';
// S04 configured Git continuation. Credential never crosses a dashboard
// port. No ref movement occurs without a committed DISPATCH_POSSIBLE receipt.
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {scanMainCatalog} from './git-catalog.mjs';
import {writeS04Marker,S04_NOT_READY} from './creation-git.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {requireS04FreshOwner} from './creation-git-owner.mjs';
const digest=async parts=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(JSON.stringify(parts))))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
const markerSha=async()=>{
  const data=new TextEncoder().encode(S04_NOT_READY);
  const header=new TextEncoder().encode('blob '+data.length+'\0');
  const all=new Uint8Array(header.length+data.length);
  all.set(header);all.set(data,header.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1',all))]
    .map(n=>n.toString(16).padStart(2,'0')).join('');
};
export function createS04GitContinuation(api,{open=openCanonicalDatabase,
  scan=scanMainCatalog,write=writeS04Marker,
  transport=fetch,gate=()=>false,guard=internalPcmsGuard,
  vault=req=>browserGitCredentialPacket(req)}={}){
  const sentinel=createRestoreSentinel(api.storage.local);
  let dbPromise;
  const store=async()=>createCoordinatorStore(await (dbPromise||=open().catch(e=>{
    dbPromise=null;throw e;})));
  async function step(intentId,expectedRevision){
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const s=await store(),found=await s.getCreate(intentId);
      if(!found.ok)return found;
      const item=found.record;
      if(item.revision!==expectedRevision)return fail('STALE_REVISION');
      if(!['GIT_INIT_PENDING','GIT_PREPARED','GIT_DISPATCH_POSSIBLE',
        'GIT_UNCERTAIN','GIT_OBSERVING'].includes(item.state))
        return fail('GIT_STATE_NOT_ADMISSIBLE');
      const cfg=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
      if(!cfg||!cfg.repository||!cfg.repositoryId)
        return fail('GIT_RECONNECT_REQUIRED');
      if(item.gitRepositoryId&&item.gitRepositoryId!==cfg.repositoryId)
        return fail('GIT_REPOSITORY_CHANGED');
      // A historic provider success/owner row never authorizes today's Git
      // link or ref mutation. Recheck exact current remote identity under
      // the bound donor route, including during uncertain reconciliation.
      const owner=await requireS04FreshOwner({
        db:await (dbPromise||=open()),item,guard:guard(),
        restoreHeld:async()=>(await sentinel.inspect()).held});
      if(!owner.ok)return owner;
      const privateCredential=await vault({
        action:'git.get',repositoryId:cfg.repositoryId});
      if(privateCredential?.ok!==true||typeof privateCredential.credential!=='string')
        return fail('GIT_VAULT_UNAVAILABLE');
      const token=privateCredential.credential;
      const observed=await scan({repository:cfg.repository,token},transport);
      if(!observed?.ok||observed.complete!==true||
         observed.repositoryId!==cfg.repositoryId)return fail('GIT_MAIN_INCOMPLETE');
      const row=observed.generators.find(g=>g.slug===item.slug);
      if(item.state==='GIT_INIT_PENDING'){
        if(row){
          if(row.sourceState!=='NOT_READY'||!/^[a-f0-9]{40}$/.test(row.markerOid||''))
            return fail('GIT_FOLDER_DIVERGENT_OR_READY');
          // Explicit verified main folder requires no Git write.
          return await s.stageGit({intentId,expectedRevision,event:'EXISTING',proof:{
            source:'PINNED_MAIN_READ_ONLY',repositoryId:cfg.repositoryId,
            folder:'generators/'+item.slug,head:observed.head,
            markerOid:row.markerOid}});
        }
        if(!gate({intent:item,repositoryId:cfg.repositoryId}))
          return fail('GIT_WRITE_ACTIVATION_HELD');
        const operationId='s04_git_'+crypto.randomUUID().replaceAll('-','');
        const fp=await digest({intentId,slug:item.slug,
          remoteId:item.remoteId,accountId:item.accountId,
          bindingVersion:item.bindingVersion,repositoryId:cfg.repositoryId,
          parent:observed.head,marker:S04_NOT_READY});
        return await s.stageGit({intentId,expectedRevision,event:'PREPARE',proof:{
          operationId,fingerprint:fp,repositoryId:cfg.repositoryId,
          baseHead:observed.head,markerOid:await markerSha()}});
      }
      if(['GIT_DISPATCH_POSSIBLE','GIT_UNCERTAIN','GIT_OBSERVING'].includes(item.state)){
        // Exactly one possible ref movement. Only independent full marker
        // readback can reconcile; a missing path never permits another write.
        if(row?.sourceState!=='NOT_READY'||row.markerOid!==await markerSha())
          return fail('GIT_EFFECT_OUTCOME_UNKNOWN');
        const observing=item.state==='GIT_OBSERVING'?{ok:true,record:item}:
          await s.stageGit({intentId,expectedRevision,event:'OBSERVING'});
        if(!observing.ok)return observing;
        return await s.stageGit({intentId,
          expectedRevision:observing.record.revision,event:'CONFIRM',proof:{
            source:'INDEPENDENT_GIT_BYTE_READBACK',head:observed.head,
            markerOid:row.markerOid,folder:row.folder,ready:false,
            repositoryId:cfg.repositoryId}});
      }
      if(item.state==='GIT_PREPARED'){
        if(observed.head!==item.gitBaseHead ||
           item.gitExpectedMarkerOid!==await markerSha())
          return fail('GIT_PREPARED_PARENT_CHANGED');
        if(!gate({intent:item,repositoryId:cfg.repositoryId}))
          return fail('GIT_WRITE_ACTIVATION_HELD');
        if(observed.generators.some(g=>g.slug===item.slug))
          return fail('GIT_PATH_CHANGED');
        const marked=await s.stageGit({intentId,expectedRevision,event:'DISPATCH'});
        if(!marked.ok)return marked;
        const now=marked.record;
        if(!gate({intent:now,repositoryId:cfg.repositoryId})||
           (await sentinel.inspect()).held){
          return await s.stageGit({intentId,
            expectedRevision:now.revision,event:'UNCERTAIN'});
        }
        let proof;
        try{proof=await write({token,repository:cfg.repository,
          repositoryId:cfg.repositoryId,slug:item.slug,
          folder:'generators/'+item.slug,expectedHead:item.gitBaseHead},transport);}
        catch{proof=fail('GIT_EFFECT_UNCERTAIN');}
        if(proof?.ok!==true){
          await s.stageGit({intentId,expectedRevision:now.revision,event:'UNCERTAIN'});
          return fail('GIT_EFFECT_OUTCOME_UNKNOWN');
        }
        const opened=await s.stageGit({intentId,expectedRevision:now.revision,
          event:'OBSERVING'});
        if(!opened.ok)return fail('GIT_EFFECT_OUTCOME_UNKNOWN');
        return await s.stageGit({intentId,expectedRevision:opened.record.revision,
          event:'CONFIRM',proof});
      }
      return fail('GIT_STATE_NOT_ADMISSIBLE');
    }catch{return fail('S04_GIT_CONTINUATION_UNAVAILABLE');}
  }
  return Object.freeze({step});
}
