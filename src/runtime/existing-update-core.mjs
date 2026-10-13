// I13 existing-source recovery: sealed previous-good full bytes. Credentials
// never enter IDB or diagnostics. A valid, operator-supplied passphrase must
// independently decrypt and match exact canonical bytes before mutation.
import {fail} from './journal.mjs';
import {exactSource} from './staging-core.mjs';
const encoder=new TextEncoder();
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
function b64(data){let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(binary);}
function un64(str,max=20*1024*1024){
  if(typeof str!=='string'||str.length>Math.ceil(max/3)*4+12||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(str))throw Error('INVALID_RECOVERY_BYTES');
  const raw=atob(str);if(raw.length>max)throw Error('RECOVERY_TOO_LARGE');
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function strongPassphrase(pass){return typeof pass==='string'&&pass.length>=12&&
  pass.length<=256&&pass.trim()===pass&&!pass.includes('\0');}
async function key(pass,salt,usage){
  const imported=await crypto.subtle.importKey('raw',encoder.encode(pass),
    'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},
    imported,{name:'AES-GCM',length:256},false,[usage]);
}
export async function sealPrevious(previous,passphrase){
  if(!strongPassphrase(passphrase)||!previous?.ok||!hex(previous.fingerprint))
    return fail('RECOVERY_SOURCE_OR_PASSPHRASE_INVALID');
  const source=await exactSource(previous.blobs);
  if(!source.ok||source.fingerprint!==previous.fingerprint)
    return fail('RECOVERY_SOURCE_DRIFT');
  const plain=encoder.encode(JSON.stringify({format:'PCMS_I13_P_V1',
    fingerprint:source.fingerprint,blobs:source.blobs}));
  if(plain.length>22*1024*1024)return fail('RECOVERY_TOO_LARGE');
  try{
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const derived=await key(passphrase,salt,'encrypt');
    const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,
      additionalData:encoder.encode('PCMS_I13_P_V1:'+source.fingerprint)},
      derived,plain);
    return {ok:true,format:'PCMS_I13_P_V1',fingerprint:source.fingerprint,
      salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher)),
      files:source.files.length};
  }catch{return fail('RECOVERY_ENCRYPTION_UNVERIFIED');}
}
export async function unlockPrevious(seal,passphrase){
  if(!strongPassphrase(passphrase)||seal?.format!=='PCMS_I13_P_V1'||
    !hex(seal.fingerprint)||!Number.isSafeInteger(seal.files)||
    seal.files<2||seal.files>502)return fail('RECOVERY_SEAL_INVALID');
  try{
    const salt=un64(seal.salt,16),iv=un64(seal.iv,12);
    if(salt.length!==16||iv.length!==12)return fail('RECOVERY_SEAL_INVALID');
    const derived=await key(passphrase,salt,'decrypt');
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,
      additionalData:encoder.encode('PCMS_I13_P_V1:'+seal.fingerprint)},
      derived,un64(seal.ciphertext,22*1024*1024));
    const decoded=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));
    if(decoded?.format!==seal.format||decoded.fingerprint!==seal.fingerprint)
      return fail('RECOVERY_SOURCE_DRIFT');
    const source=await exactSource(decoded.blobs);
    if(!source.ok||source.fingerprint!==seal.fingerprint||
       source.files.length!==seal.files)return fail('RECOVERY_SOURCE_DRIFT');
    return {ok:true,source};
  }catch{return fail('RECOVERY_DECRYPTION_FAILED');}
}
export function authorizeSleepingUpdate({account,inventory,adoption,shadow,original,remote}){
  if(!account||!inventory||!adoption||!original?.ok||!remote?.ok||
    account.state!=='VERIFIED'||account.revision!==adoption.accountRevision||
    account.identity?.source!=='GUARDED_SESSION_READBACK'||
    account.identity?.principalFingerprint!==adoption.principalFingerprint||
    account.bindingVersion!==adoption.bindingVersion||
    account.personaUid!==adoption.personaUid||
    inventory.slug!==adoption.slug||inventory.remoteId!==adoption.remotePublicId||
    inventory.ownerState!=='OBSERVED_OWNER'||
    inventory.accountId!==adoption.accountId||
    inventory.bindingVersion!==adoption.bindingVersion||
    adoption.archiveState!=='ARCHIVED_GIT_CONFIRMED'||adoption.archived===true||
    remote.remotePublicId!==inventory.remoteId||remote.ownerResult!=='IS_OWNER'||
    remote.visibility!=='PUBLIC'||
    original.fingerprint!==remote.source?.fingerprint||
    shadow?.phase!=='SLEEPING'||!Number.isSafeInteger(shadow.sleepRemaining)||
    shadow.sleepRemaining<=0||shadow.paused===true||shadow.slot===true||
    shadow.identityHeld===true||shadow.reviewHeld===true||
    shadow.ownerVerified!==true||shadow.releaseVerified!==true||
    shadow.bindingVersion!==inventory.bindingVersion||
    shadow.remoteId!==inventory.remoteId||
    shadow.accountId!==inventory.accountId||
    shadow.personaUid!==inventory.personaUid)
    return fail('EXISTING_SLEEP_OWNER_OR_PRIOR_F_UNVERIFIED');
  return {ok:true,slug:inventory.slug,previousFingerprint:original.fingerprint};
}
