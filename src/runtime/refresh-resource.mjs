// Same-XPI, read/write-local-only resource qualification sample. Synthetic
// workload measurements are not live provider throughput or an SLO claim.
import {emptyShadow,reconcileShadow,advanceShadow} from './refresher-core.mjs';
import {digestReview} from './refresh-review.mjs';
export async function measureRefreshResources(api,{clock=Date.now}={}){
  const start=performance.now(),at=clock(),H='a'.repeat(64);
  const inputs=Array.from({length:1250},(_,i)=>({slug:'resource-fixture-'+i,
    accountId:'resource_account_'+i%50,personaUid:'resource-persona-'+i%50,bindingVersion:1,
    remoteId:'resource_remote_'+i,ownerVerified:true,accountVerified:true,
    principalFingerprint:H,releaseVerified:true,releaseFingerprint:H,listing:'PUBLIC'}));
  let state=reconcileShadow(emptyShadow(),inputs).state;
  let queuePeak=0;
  for(let i=0;i<8;i++){
    const out=advanceShadow(state,{now:at+i*60000,bootId:'resource_fixture_boot'});
    if(!out.ok)throw Error('RESOURCE_ORACLE_FAILED');state=out.state;
    queuePeak=Math.max(queuePeak,state.rows.length);
  }
  const estimate=await api.storage.estimate?.().catch(()=>null);
  const report={schema:1,kind:'PACKAGED_LOCAL_RESOURCE_MEASUREMENT',id:crypto.randomUUID().replaceAll('-',''),
    at,accounts:50,generators:1250,turns:8,queuePeak,maxConcurrentSaves:1,
    turnMs:Math.ceil(performance.now()-start),serializedBytes:new TextEncoder().encode(JSON.stringify(state)).length,
    storageUsage:Number.isFinite(estimate?.usage)?estimate.usage:null,
    storageQuota:Number.isFinite(estimate?.quota)?estimate.quota:null,
    scope:'ISOLATED_LOCAL_CORE_SAMPLE_NOT_LIVE_PROVIDER_CAPACITY'};
  return {...report,digest:await digestReview(report)};
}
