import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const sourcePattern=/^[a-f0-9]{40}$/;
const digestPattern=/^[a-f0-9]{64}$/;
const TIER=['D','B','H','GIT','L'];
const CASES=['positive','adverse','recovery'];
const STATES=['PASS','FAIL','BLOCKED','NOT_TESTED','NOT_APPLICABLE'];
const external=new Set(['H','GIT','L']);
const methodByTier={D:'deterministic-production',B:'installed-xpi',H:'host-process-disk',GIT:'remote-git-readback',L:'provider-readback'};
// Later client amendment v1.0.1 overrides only contradictory historical acceptance wording.
const ORIGINAL_X_SHA256='1cd35938134e18422037a5123f2ae4a041d06c37a9a8b86c4dadac5d0dec73ac';

export function parseOriginalXScenarios(source){
 assert(typeof source==='string','A09_ORIGINAL_X_SOURCE_REQUIRED');
 const lines=source.split(/\r?\n/).filter(x=>/^\| \*\*X-\d{2}:/.test(x));
 assert(lines.length===14,'A09_ORIGINAL_X_COUNT_INVALID');
 const bytes=lines.join('\n')+'\n';
 assert(createHash('sha256').update(bytes).digest('hex')===ORIGINAL_X_SHA256,'A09_ORIGINAL_X_SOURCE_HASH_MISMATCH');
 const out=new Map();
 for(const line of lines){
  const m=/^\| \*\*(X-\d{2}): ([^*]+)\*\* \| (.*?) \| (.*?) \| (.*?) \|$/.exec(line);
  assert(m,'A09_ORIGINAL_X_ROW_INVALID');
  assert(!out.has(m[1]),'A09_ORIGINAL_X_DUPLICATE');
  const advertised=m[5];
  const optionalExternal=/\b(?:only when needed|where necessary|appropriate real tier)\b/i.test(advertised);
  const included=distinct((advertised.match(/\b(?:D|B|H|GIT|L)\b/g)||[])
    .filter(t=>!optionalExternal||!external.has(t)));
  assert(included.includes('D')&&included.includes('B'),'A09_ORIGINAL_X_TIERS_INVALID');
  out.set(m[1],{id:m[1],title:m[2],trigger:m[3],expected:m[4],tierText:advertised,
   tiers:orderedTiers(included)});
 }
 for(let i=1;i<=14;i++)assert(out.has('X-'+String(i).padStart(2,'0')),'A09_ORIGINAL_X_ID_MISSING');
 return out;
}

// Later accepted operator amendments control implementation; the X scenarios
// are auditable 2026-10-22 review traces, not a new sacred product contract.
const amendedJourneys={
 'AC-14':{negative:'A partial feed is UNKNOWN; already-visible targets are not saved pointlessly; shutdown cannot fabricate active operating credit, but 72-hour rest advances with wall time; missed writes never burst-replay.'},
 'AC-15':{description:'Recover conserved background work and source history across dashboard close, worker suspension and Firefox restart using persisted state and browser alarms, with rest as elapsed wall time and active work only when observed.'},
 'AC-17':{description:'Export manual and daily strictly passwordless, unencrypted, browser-native source-complete portable backups and inspect/restore them into current or fresh profiles with inactive controller until identity/source/route verification.',negative:'Reject corrupt/incomplete archives, interruptible restore, removed-account ambiguity, stale approvals, UID/exit history loss and leaked Git credentials; preserve last known-good without any key/passphrase/native vault.'}
};

const tMap={
 'T-01':['AC-04','AC-07','AC-08'],
 'T-02':['AC-13','AC-14'],
 'T-03':['AC-10','AC-11'],
 'T-04':['AC-12','AC-14'],
 'T-05':['AC-02','AC-17'],
 'T-06':['AC-04','AC-09'],
 'T-07':['AC-15','AC-17'],
 'T-08':['AC-14'],
 'T-09':['AC-07','AC-08'],
 'T-10':['AC-17']
};
// Cross-references are reviewer-derived from the *recovered* X narrative.
// Historical A01 topic/AC labels are not original Part 8 source.
const originalXRelatedAC={
 'X-01':['AC-04','AC-05','AC-06','AC-07','AC-09'],
 'X-02':['AC-04','AC-05'],
 'X-03':['AC-07','AC-08','AC-09','AC-11'],
 'X-04':['AC-10','AC-11','AC-12','AC-13'],
 'X-05':['AC-12','AC-13','AC-14'],
 'X-06':['AC-14','AC-15'],
 'X-07':['AC-01','AC-02','AC-15','AC-16'],
 'X-08':['AC-11','AC-17'],
 'X-09':['AC-17'],
 'X-10':['AC-16','AC-17','AC-18'],
 'X-11':['AC-01','AC-15','AC-17','AC-18'],
 'X-12':['AC-13','AC-14','AC-16','AC-17','AC-18'],
 'X-13':['AC-06','AC-10','AC-17'],
 'X-14':['AC-15','AC-16','AC-18']
};
function assert(condition,code){if(!condition)throw new Error(code);}
const orderedTiers=xs=>TIER.filter(t=>xs.includes(t));
const distinct=a=>[...new Set(a)];

export function buildCatalog(matrix,scenarioMap,originalXSource){
 assert(typeof matrix==='string'&&matrix.length>100,'A09_MATRIX_REQUIRED');
 assert(scenarioMap?.schema==='pcms.a01.scenario-map/1','A09_X_AUTHORITY_INVALID');
 const originalX=parseOriginalXScenarios(originalXSource);
 const ac=[];
 for(const line of matrix.split(/\r?\n/)){
  const m=line.match(/^\|\s*\*\*(AC-\d{2})\*\*\s*\|/);
  if(!m)continue;
  const cells=line.split('|').map(x=>x.trim());
  assert(cells.length>=6,'A09_AC_ROW_TRUNCATED:'+m[1]);
  const evid=cells[cells.length-2];
  const tiers=distinct(evid.match(/\b(?:GIT|D|B|H|L)\b/g)||[]);
  assert(tiers.includes('D')&&tiers.includes('B'),'A09_AC_TIERS_MISSING:'+m[1]);
  ac.push({id:m[1],kind:'AC',description:amendedJourneys[m[1]]?.description||cells[2],negative:amendedJourneys[m[1]]?.negative||cells[3],tiers:orderedTiers(tiers),cases:CASES,authority:'ACCEPTED_MATRIX_v1.0.0_AS_AMENDED_v1.0.1'});
 }
 assert(ac.length===18,'A09_AC_COUNT_INVALID');
 const lookup=new Map(ac.map(x=>[x.id,x]));
 for(let i=1;i<=18;i++)assert(lookup.has('AC-'+String(i).padStart(2,'0')),'A09_AC_ID_MISSING:'+i);
 const ts=distinct([...matrix.matchAll(/^\*\*(T-\d{2})\s+—/gm)].map(x=>x[1]));
 assert(ts.length===10,'A09_T_COUNT_INVALID');
 const t=ts.map(id=>{
  const refs=tMap[id];assert(refs?.every(x=>lookup.has(x)),'A09_T_MAPPING_MISSING:'+id);
  return {id,kind:'T',relatedAC:refs,tiers:orderedTiers(distinct(refs.flatMap(x=>lookup.get(x).tiers))),cases:['adverse','recovery'],authority:'ACCEPTED_MATRIX_v1.0.0'};
 });
 assert(Array.isArray(scenarioMap.scenarios)&&scenarioMap.scenarios.length===14,'A09_X_COUNT_INVALID');
 const xs=scenarioMap.scenarios.map(x=>{
  assert(x.id&&x.acceptance?.length&&x.acceptance.every(id=>lookup.has(id)),'A09_X_MAPPING_INVALID');
  const source=originalX.get(x.id);
  assert(source,'A09_ORIGINAL_X_ID_MISSING:'+x.id);
  // Historical A01 labels/mapping are derived. The original 14 traces and
  // tier wording now come from the recovered, digest-pinned Part 8 report.
  const relatedAC=originalXRelatedAC[x.id];
  assert(relatedAC?.every(id=>lookup.has(id)),'A09_RECOVERED_X_CROSSWALK_INVALID:'+x.id);
  return {id:x.id,kind:'X',relatedAC,relatedACProvenance:'REVIEW_DERIVED_NOT_ORIGINAL_AUDIT',tiers:source.tiers,
   cases:['adverse','recovery'],authority:'RECOVERED_PART8_AUDIT_VERBATIM',
   title:source.title,description:source.trigger,expected:source.expected,
   originalDescription:source.trigger,originalTierText:source.tierText};
 });
 const rows=[...ac,...t,...xs];
 assert(rows.length===42&&new Set(rows.map(x=>x.id)).size===42,'A09_ID_COLLISION');
 for(const [prefix,n] of [['T',10],['X',14]])for(let i=1;i<=n;i++)assert(rows.some(x=>x.id===prefix+'-'+String(i).padStart(2,'0')),'A09_ID_MISSING');
 return rows;
}

// External real-world observations must be directly relevant, but must not
// multiply every negative/recovery fixture into a dangerous live operation.
// AC: observe a real positive external path; T and X: observe the applicable
// adverse/recovery boundary, with deterministic B/D fault injection reused.
function casesFor(row,tier){
 if(!external.has(tier))return row.cases;
 if(row.kind==='AC')return ['positive'];
 if(row.kind==='X'&&/restore|restart|continuity|clock|lost-intent/i.test(row.title||''))return ['recovery'];
 return ['adverse'];
}
function receiptProof(r,sourceSha,xpiSha256){
 assert(r&&typeof r==='object'&&!Array.isArray(r),'A09_RECEIPT_INVALID');
 assert(STATES.includes(r.status),'A09_RECEIPT_STATUS_INVALID');
 assert(r.sourceSha===sourceSha&&r.xpiSha256===xpiSha256,'A09_FOREIGN_REVISION_OR_XPI');
 assert(typeof r.environment==='string'&&r.environment.trim().length>=5,'A09_ENVIRONMENT_REQUIRED');
 if(r.status!=='PASS')return;
 assert(r.method===methodByTier[r.tier],'A09_TIER_METHOD_MISMATCH');
 assert(typeof r.artifact==='string'&&/^https:\/\//.test(r.artifact),'A09_INDEPENDENT_ARTIFACT_REQUIRED');
 assert(typeof r.observed==='string'&&r.observed.trim().length>=16,'A09_OBSERVATION_REQUIRED');
 assert(typeof r.observedAt==='string'&&!Number.isNaN(Date.parse(r.observedAt)),'A09_OBSERVATION_TIME_REQUIRED');
 assert(r.fixtureOnly!==true&&r.simulated!==true,'A09_FIXTURE_CANNOT_CLAIM_PASS');
 if(external.has(r.tier)){
  assert(r.independentReadback===true,'A09_EXTERNAL_READBACK_REQUIRED');
  assert(typeof r.observer==='string'&&r.observer.length>=5,'A09_EXTERNAL_OBSERVER_REQUIRED');
 }
}

export function evaluateEvidence({catalog,receipts,sourceSha,xpiSha256}){
 assert(sourcePattern.test(sourceSha),'A09_SOURCE_SHA_REQUIRED');
 assert(digestPattern.test(xpiSha256),'A09_EXACT_XPI_SHA256_REQUIRED');
 assert(Array.isArray(catalog)&&catalog.length===42,'A09_CATALOG_REQUIRED');
 assert(Array.isArray(receipts),'A09_RECEIPTS_ARRAY_REQUIRED');
 const byId=new Map(catalog.map(x=>[x.id,x]));const slots=new Map();
 for(const r of receipts){
  const row=byId.get(r?.id);assert(row,'A09_UNKNOWN_ACCEPTANCE_ID');
  assert(row.tiers.includes(r.tier)&&casesFor(row,r.tier).includes(r.case),'A09_OUTSIDE_ACCEPTANCE_SCOPE');
  receiptProof(r,sourceSha,xpiSha256);
  const key=[r.id,r.tier,r.case].join('/');
  assert(!slots.has(key),'A09_DUPLICATE_OR_CONFLICTING_RECEIPT:'+key);
  assert(r.status!=='NOT_APPLICABLE','A09_REQUIRED_CASE_CANNOT_BE_NOT_APPLICABLE');
  slots.set(key,r);
 }
 const rows=catalog.map(x=>{
  let pass=0,fail=0,blocked=0,unverified=0;
  const evidence=[];
  for(const tier of x.tiers)for(const caseName of casesFor(x,tier)){
   const r=slots.get([x.id,tier,caseName].join('/'));
   const status=r?.status||'NOT_TESTED';
   if(status==='PASS')pass++;
   else if(status==='FAIL')fail++;
   else if(status==='BLOCKED')blocked++;
   else unverified++;
   evidence.push({tier,case:caseName,status,artifact:r?.artifact||null});
  }
  const originalMissing=false; // Original Part 8 X source recovered and SHA-256 pinned.
  const status=fail?'FAIL':(unverified||blocked||originalMissing)?'HELD':'PASS';
  return {id:x.id,kind:x.kind,status,required:x.tiers,positiveAdverseRecovery:x.cases,
    missingOriginalXDescription:originalMissing,evidence,pass,fail,blocked,unverified};
 });
 const holds=[];
 // Original Part 8 X prose is present and digest-checked; no invented provenance hold.
 if(rows.some(x=>x.evidence.some(e=>external.has(e.tier)&&e.status!=='PASS')))holds.push('MISSING_PROVIDER_GIT_HOST_EVIDENCE');
 if(rows.some(x=>x.evidence.some(e=>!external.has(e.tier)&&e.status!=='PASS')))holds.push('MISSING_ENGINEERING_EVIDENCE');
 if(rows.some(x=>x.status==='FAIL'))holds.push('FAILING_ACCEPTANCE_EVIDENCE');
 const counts={PASS:rows.filter(x=>x.status==='PASS').length,HELD:rows.filter(x=>x.status==='HELD').length,FAIL:rows.filter(x=>x.status==='FAIL').length};
 const release=counts.FAIL?'FAIL':(holds.length?'HELD':'READY_FOR_INDEPENDENT_OPERATOR_SIGNOFF');
 return {schema:'pcms.a09.evidence-evaluation/1',sourceSha,xpiSha256,release,
   limits:['STRUCTURAL_VALIDATION_NOT_INDEPENDENT_ATTESTATION','NO_LIVE_OR_PRIVATE_OPERATIONS_PERFORMED'],
   counts,holds,rows};
}

export function markdownReport(report){
 const lines=['# A09 — Exact candidate acceptance evidence','',
  'Source commit: `'+report.sourceSha+'`', 'XPI SHA-256: `'+report.xpiSha256+'`',
  'Disposition: **'+report.release+'**','',
  'Evidence is evaluated at individual requirement, tier and positive/adverse/recovery scope. A missing report is NOT_TESTED. Structural verification of a receipt is not independent confirmation that an external action occurred.','',
  '| Requirement | Status | Required tiers | PASS slots | Unverified slots |','|---|---|---|---:|---:|'];
 for(const x of report.rows)lines.push('| '+x.id+' | '+x.status+' | '+x.required.join(', ')+' | '+x.pass+' | '+(x.unverified+x.blocked)+' |');
 lines.push('','## Holds','',...report.holds.map(h=>'- '+h),
  '','Release requires separately verified live/provider, private Git, host/profile and original X-source evidence. A READY result is only a candidate for independent operator signoff, not automatic release.');
 return lines.join('\n')+'\n';
}

async function main(args){
 const value=(flag)=>{const i=args.indexOf(flag);return i<0?null:args[i+1]};
 const xpi=value('--xpi'),sha=value('--source-sha'),receiptPath=value('--receipts'),out=value('--out-dir');
 assert(xpi&&sha,'A09_USAGE_REQUIRES_EXACT_XPI_AND_SOURCE_SHA');
 const checkoutSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert(sha===checkoutSha,'A09_SOURCE_CHECKOUT_SHA_MISMATCH');
 const raw=await readFile(xpi);
 const digest=createHash('sha256').update(raw).digest('hex');
 const audited=JSON.parse(execFileSync('python3',['scripts/a08-xpi-audit.py',xpi],{encoding:'utf8'}));
 assert(audited.xpiSha256===digest&&audited.pcmsInstalledNativeServices===0,'A09_EXACT_XPI_AUDIT_FAILED');
 const acceptance=await readFile('docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md','utf8');
 const scenarios=JSON.parse(await readFile('tests/fixtures/a01-recovery-scenarios.json','utf8'));
 const originalX=await readFile('docs/audit/PART8-ORIGINAL-X01-X14.md','utf8');
 const receipts=receiptPath?JSON.parse(await readFile(receiptPath,'utf8')):[];
 const report=evaluateEvidence({catalog:buildCatalog(acceptance,scenarios,originalX),receipts,sourceSha:sha,xpiSha256:digest});
 if(out){await mkdir(out,{recursive:true});await writeFile(path.join(out,'a09-evidence.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,'a09-evidence.md'),markdownReport(report));}
 process.stdout.write(JSON.stringify({release:report.release,sourceSha:sha,xpiSha256:digest,counts:report.counts,holds:report.holds})+'\n');
 if(args.includes('--require-ready')&&report.release!=='READY_FOR_INDEPENDENT_OPERATOR_SIGNOFF')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});}
