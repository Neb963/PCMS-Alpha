// S04 fixed creation transitions. A provider ACK is never confirmation.
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';
const bad=code=>({ok:false,code});
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(s);
const remote=s=>safeId(s);
export function advanceS04Effect(record,event,proof={}){
  if(!record||typeof event!=='string'||isI17Quarantined(record))
    return bad(isI17Quarantined(record)?I17_QUARANTINE_CODE:'INVALID_EFFECT');
  const old=record.state;
  const next={...record,revision:record.revision+1};
  const requireState=(...states)=>states.includes(old);
  if(event==='TARGET_OBSERVED'){
    if(old!=='OWNER_READBACK_PENDING'||proof.source!=='INDEPENDENT_TARGET_READBACK'||
       proof.slug!==record.slug)return bad('TARGET_READBACK_REQUIRED');
    if(proof.state==='MISSING_VERIFIED'){
      next.state='OWNER_MISSING_VERIFIED';next.hold=null;
    }else if(proof.state==='OWNED_VERIFIED'&&
      proof.ownerMatches===true&&remote(proof.remoteId)&&
      ['PUBLIC','UNLISTED'].includes(proof.visibility)){
      next.state='ADOPTION_ORIGINAL_PENDING';
      next.hold='ADOPTION_REQUIRES_ORIGINAL_SOURCE_PROOF';
      next.remoteId=proof.remoteId;next.visibility=proof.visibility;
    }else if(proof.state==='COLLISION'){
      next.state='TARGET_COLLISION_HELD';next.hold='REMOTE_COLLISION';
    }else return bad('TARGET_READBACK_REQUIRED');
    return {ok:true,record:next};
  }
  if(event==='CREATE_PREPARE'){
    if(!requireState('OWNER_MISSING_VERIFIED')||!safeId(proof.operationId)||
      !/^[a-f0-9]{64}$/.test(proof.fingerprint||''))return bad('CREATE_NOT_ADMISSIBLE');
    next.state='CREATE_PREPARED';next.hold=null;
    next.createOperationId=proof.operationId;next.createFingerprint=proof.fingerprint;
  }else if(event==='CREATE_DISPATCH'){
    if(!requireState('CREATE_PREPARED'))return bad('CREATE_NOT_ADMISSIBLE');
    next.state='CREATE_DISPATCH_POSSIBLE';
  }else if(event==='CREATE_OBSERVING'){
    if(!requireState('CREATE_DISPATCH_POSSIBLE','CREATE_UNCERTAIN')||
      !slug(proof.temporarySlug)||proof.temporarySlug===record.slug)
      return bad('CREATE_IDENTITY_UNVERIFIED');
    next.ackTemporarySlug=proof.temporarySlug;
    next.state='CREATE_OBSERVING';
  }else if(event==='CREATE_UNCERTAIN'){
    if(!requireState('CREATE_DISPATCH_POSSIBLE','CREATE_OBSERVING','CREATE_UNCERTAIN'))
      return bad('CREATE_NOT_ADMISSIBLE');
    if(proof.temporarySlug!==undefined){
      if(!slug(proof.temporarySlug)||proof.temporarySlug===record.slug)
        return bad('CREATE_IDENTITY_UNVERIFIED');
      next.ackTemporarySlug=proof.temporarySlug;
    }
    next.state='CREATE_UNCERTAIN';next.hold='CREATE_OUTCOME_UNKNOWN';
  }else if(event==='CREATE_CONFIRMED'){
    if(!requireState('CREATE_OBSERVING')||proof.source!=='INDEPENDENT_READBACK'||
      proof.ownerMatches!==true||proof.privateEmpty!==true||
      !remote(proof.remoteId)||proof.temporarySlug!==record.ackTemporarySlug)
      return bad('INDEPENDENT_CREATE_PROOF_REQUIRED');
    next.state='PRIVATE_EMPTY_CONFIRMED';next.hold=null;
    next.temporarySlug=proof.temporarySlug;next.remoteId=proof.remoteId;
  }else if(event==='RENAME_PREPARE'){
    if(!requireState('PRIVATE_EMPTY_CONFIRMED')||
      !safeId(proof.operationId)||!/^[a-f0-9]{64}$/.test(proof.fingerprint||''))
      return bad('RENAME_NOT_ADMISSIBLE');
    next.state='RENAME_PREPARED';next.renameOperationId=proof.operationId;
    next.renameFingerprint=proof.fingerprint;
  }else if(event==='RENAME_DISPATCH'){
    if(!requireState('RENAME_PREPARED'))return bad('RENAME_NOT_ADMISSIBLE');
    next.state='RENAME_DISPATCH_POSSIBLE';
  }else if(event==='RENAME_OBSERVING'){
    if(!requireState('RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN'))
      return bad('RENAME_NOT_ADMISSIBLE');
    next.state='RENAME_OBSERVING';
  }else if(event==='RENAME_UNCERTAIN'){
    if(!requireState('RENAME_DISPATCH_POSSIBLE','RENAME_UNCERTAIN','RENAME_OBSERVING'))
      return bad('RENAME_NOT_ADMISSIBLE');
    next.state='RENAME_UNCERTAIN';next.hold='RENAME_OUTCOME_UNKNOWN';
  }else if(event==='RENAME_CONFIRMED'){
    if(!requireState('RENAME_OBSERVING')||proof.source!=='INDEPENDENT_READBACK'||
      proof.ownerMatches!==true||proof.privateEmpty!==true||
      proof.slug!==record.slug||proof.previousSlug!==record.temporarySlug||
      proof.remoteId!==record.remoteId)return bad('INDEPENDENT_RENAME_PROOF_REQUIRED');
    next.state='GIT_INIT_PENDING';next.hold='GIT_ASSOCIATION_PENDING';
  }else if(event==='PREPARED_ABORT'){
    if(old==='CREATE_PREPARED'){next.state='OWNER_MISSING_VERIFIED';next.createOperationId=null;}
    else if(old==='RENAME_PREPARED'){next.state='PRIVATE_EMPTY_CONFIRMED';next.renameOperationId=null;}
    else return bad('DISPATCH_MAY_HAVE_OCCURRED');
    next.hold=null;
  }else return bad('INVALID_EFFECT_TRANSITION');
  return {ok:true,record:next};
}
