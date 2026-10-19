// S06 C-48/C-49 exceptional operator review. This journal stores actual
// operator-attributed manual checks. It does NOT assert that AI/browser tests
// passed and grants neither Git nor provider publication authority itself.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {evaluation} from './ai-evidence.mjs';
import {exactSource} from './staging-core.mjs';
const fail=code=>({ok:false,code});
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const fp=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const key=s=>'s06-exception:'+s;
const MODES=new Set(['MANUAL_INFRASTRUCTURE','OPTIONAL_CHAT2_INCOMPLETE']);
const NOTICE='I PERFORMED THE RECORDED MANUAL CHECKS';
const INFRASTRUCTURE=new Set([
 'AI_PROVIDER_UNAVAILABLE','NATIVE_AI_NOT_WIRED','NATIVE_BRIDGE_UNAVAILABLE',
 'AI_NATIVE_ACTIVATION_HELD','AI_PROVIDER_ACTIVATION_HELD',
 'AI_TEST_INFRASTRUCTURE_UNAVAILABLE','AI_ORACLE_UNAVAILABLE',
 'AI_NATIVE_SESSION_UNAVAILABLE','AI_CHAT2_ISOLATION_UNVERIFIED',
 'AI_SCHEDULER_BRIDGE_UNAVAILABLE'
]);
const validChecks=(checks,required)=>Array.isArray(checks)&&
  checks.length===required.length&&checks.length>0&&checks.length<=128&&
  new Set(checks.map(x=>x?.name)).size===checks.length&&
  required.every(name=>checks.some(x=>x.name===name&&x.result==='PASS'&&
    typeof x.observation==='string'&&x.observation.trim()===x.observation&&
    x.observation.length>=12&&x.observation.length<=2000));
const testedNames=job=>[...new Set([
 ...(job.prompt?.tests||[]),...(job.optionalTesting?.tests||[])
])];
export function assessS06Exception({ready,stage,job,mode,checks}={}){
  const active=ready?.active;
  if(!MODES.has(mode)||!slug(stage?.slug)||ready?.slug!==stage.slug||
     job?.slug!==stage.slug||ready.desired||ready.hold||!active||
     active.identifier!==stage.readyIdentifier||
     active.inputFingerprint!==stage.readyInputFingerprint||
     job.stageRevision!==stage.revision||job.readyIdentifier!==active.identifier||
     job.readyInputFingerprint!==active.inputFingerprint||
     stage.state!=='SOURCE_VERIFIED'||!stage.verifiedAt||
     job.executionSlotReleased!==true||
     !['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE'].includes(job.native?.state)||
     !fp(job.sourceFingerprint)||job.finalSource?.fingerprint!==job.sourceFingerprint||
     !Array.isArray(job.finalSource?.blobs))
    return fail('S06_EXCEPTION_CANONICAL_SOURCE_UNVERIFIED');
  const result=evaluation(job);
  if(!result.ok||result.state==='KNOWN_FAILURE')
    return fail('S06_EXCEPTION_KNOWN_FAILURE_BLOCKED');
  if(result.state==='TESTS_VERIFIED')
    return fail('S06_EXCEPTION_NORMAL_VERIFIED_PATH_REQUIRED');
  if(mode==='OPTIONAL_CHAT2_INCOMPLETE'){
    if(!job.optionalTesting||!result.chat1Pass||result.chat2Pass)
      return fail('S06_OPTIONAL_CHAT2_EXCEPTION_INELIGIBLE');
    if(checks&&checks.length)return fail('S06_CHAT2_NO_MANUAL_PASS_INFERENCE');
  }else{
    if(!INFRASTRUCTURE.has(job.hold)&&
       !INFRASTRUCTURE.has(job.schedulerHold))
      return fail('S06_MANUAL_INFRASTRUCTURE_NOT_PROVEN');
    if(!validChecks(checks,testedNames(job)))
      return fail('S06_MANUAL_CHECKS_INCOMPLETE');
  }
  return {ok:true,mode,sourceFingerprint:job.sourceFingerprint,
    stageRevision:stage.revision,jobRevision:job.revision,
    requiredTests:testedNames(job),
    chat1Pass:result.chat1Pass===true,
    chat2Pass:result.chat2Pass===true,
    evidenceMode:mode==='MANUAL_INFRASTRUCTURE'?
      'OPERATOR_ATTESTED_MANUAL_CHECKS_NOT_AI_VERIFIED':
      'INDEPENDENT_CHAT1_PASS_OPTIONAL_CHAT2_UNVERIFIED',
    publication:'REQUIRES_SEPARATE_SOURCE_BOUND_APPROVAL'};
}
const visible=r=>r?{ok:true,slug:r.slug,revision:r.revision,
 mode:r.mode,state:r.state,sourceFingerprint:r.sourceFingerprint,
 stageRevision:r.stageRevision,jobRevision:r.jobRevision,
 manualChecks:r.manualChecks,chat1Verified:r.chat1Verified,
 chat2Verified:false,evidenceMode:r.evidenceMode,
 changedAt:r.changedAt,publication:'NOT_AUTHORIZED'}:
 fail('S06_EXCEPTION_NOT_FOUND');
function transact(db,write,fn){
 return new Promise((resolve,reject)=>{
  let t,value=fail('S06_EXCEPTION_TRANSACTION_INCOMPLETE');
  try{t=db.transaction(write?['meta','events']:['meta'],
   write?'readwrite':'readonly');}
  catch{return reject(Error('S06_EXCEPTION_DB_UNAVAILABLE'));}
  t.oncomplete=()=>resolve(value);t.onabort=()=>reject(Error('S06_EXCEPTION_DB_ABORT'));
  try{fn(t.objectStore('meta'),t,x=>{value=x;});}
  catch{try{t.abort();}catch{}}
 });
}
export function createS06ExceptionStore(db){
 const get=name=>!slug(name)?Promise.resolve(fail('S06_EXCEPTION_SLUG_INVALID')):
  transact(db,false,(m,t,done)=>m.get(key(name)).onsuccess=e=>
    done(visible(e.target.result?.record)));
 async function record({name,mode,checks=[],consent,expectedStageRevision,
   expectedJobRevision,sourceFingerprint}){
  if(!slug(name)||!MODES.has(mode)||consent!==NOTICE||
     !Number.isSafeInteger(expectedStageRevision)||expectedStageRevision<1||
     !Number.isSafeInteger(expectedJobRevision)||expectedJobRevision<1||
     !fp(sourceFingerprint)||!Array.isArray(checks)||checks.length>128)
    return fail('S06_EXCEPTION_REQUEST_INVALID');
  return transact(db,true,(m,t,done)=>m.get(key(name)).onsuccess=old=>{
   const previous=old.target.result?.record;
   m.get('s05-ready:'+name).onsuccess=rr=>{
    m.get('stage:'+name).onsuccess=ss=>{
     m.get('ai-job:'+name).onsuccess=jj=>{
      m.get('release:'+name).onsuccess=pub=>{
       m.get('s06-human:'+name).onsuccess=human=>{
        m.get('s06-change:'+name).onsuccess=child=>{
         const ready=rr.target.result?.record,stage=ss.target.result?.record,
          job=jj.target.result?.job,release=pub.target.result?.release;
         const admit=assessS06Exception({ready,stage,job,mode,checks});
         if(!admit.ok){done(admit);return;}
         if(stage.revision!==expectedStageRevision||
            job.revision!==expectedJobRevision||
            admit.sourceFingerprint!==sourceFingerprint||
            human.target.result?.record?.state==='DEFERRED'||
            child.target.result?.record?.state==='REQUESTED'||
            (release&&release.state!=='CANCELED'&&
             !(release.state==='CONFIRMED_PUBLIC'&&
               release.approval?.sourceFingerprint===stage.previous?.fingerprint))){
          done(fail('S06_EXCEPTION_CONTEXT_OR_EFFECT_CHANGED'));return;
         }
         if(previous&&previous.state==='RECORDED'&&
            previous.stageRevision===stage.revision&&
            previous.jobRevision===job.revision){
          done(fail('S06_EXCEPTION_ALREADY_RECORDED'));return;
         }
         const rec={slug:name,revision:(previous?.revision||0)+1,
          state:'RECORDED',mode,sourceFingerprint,
          stageRevision:stage.revision,jobRevision:job.revision,
          readyIdentifier:ready.active.identifier,
          readyInputFingerprint:ready.active.inputFingerprint,
          manualChecks:checks.map(x=>({name:x.name,result:'PASS',
            observation:x.observation})),
          chat1Verified:admit.chat1Pass,evidenceMode:admit.evidenceMode,
          changedAt:Date.now()};
         if(previous)m.put({key:'s06-exception-history:'+name+':'+previous.revision,
           record:structuredClone(previous)});
         m.put({key:key(name),record:rec});
         t.objectStore('events').add({stage:'S06_EXCEPTION_MANUAL_REVIEW_RECORDED',
          slug:name,mode,sourceFingerprint,stageRevision:stage.revision,
          assertedBy:'EXPLICIT_OPERATOR',aiVerified:false,remoteEffects:'NONE'});
         done(visible(rec));
        };
       };
      };
     };
    };
   };
  });
 }
 return Object.freeze({get,record});
}
export function createS06ExceptionBoundary(api,{open=openCanonicalDatabase}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let dbPromise;const database=()=>dbPromise||=open();
 async function runTrusted(msg){
  const db=await database(),store=createS06ExceptionStore(db),p=msg.params||{};
  if(msg.type==='GET_EXCEPTION')return store.get(p.slug);
  if(msg.type!=='RECORD_EXCEPTION')return fail('S06_EXCEPTION_ACTION_INVALID');
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  return store.record({name:p.slug,mode:p.mode,checks:p.checks,
   consent:p.consent,expectedStageRevision:p.expectedStageRevision,
   expectedJobRevision:p.expectedJobRevision,
   sourceFingerprint:p.sourceFingerprint});
 }
 return Object.freeze({runTrusted});
}
