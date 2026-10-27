import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {buildCatalog} from './a09-evidence.mjs';
const assert=(condition,code)=>{if(!condition)throw Error(code)};
export function validateMap(map,audit,catalog){
 const ids=[...audit.matchAll(/^### ([AGDRS]-\d{2}) /gm)].map(m=>m[1]);
 assert(ids.length===34&&map.findings.length===34,'J07_FINDING_COUNT');
 assert(new Set(map.findings.map(f=>f.id)).size===34&&ids.every(id=>map.findings.some(f=>f.id===id)),'J07_FINDING_COVERAGE');
 assert(Object.keys(map.journeys).join(',')==='J01,J02,J03,J04,J05,J06,J07','J07_JOURNEY_COVERAGE');
 for(const f of map.findings)assert(map.journeys[f.journey]&&f.control&&f.handler&&f.result,'J07_INCOMPLETE_TRACE');
 for(const row of catalog){const refs=row.kind==='AC'?[row.id]:row.relatedAC;
  assert(refs?.length&&refs.every(id=>map.acceptanceJourneys[id]?.length&&map.acceptanceJourneys[id].every(j=>map.journeys[j])),'J07_ACCEPTANCE_COVERAGE:'+row.id);
 }
 return map;
}
export function evaluateRun(map,receipt,digest){
 assert(receipt?.schema==='pcms.j07.full-browser-run/1'&&receipt.status==='PASS','J07_FULL_BROWSER_RUN_REQUIRED');
 assert(receipt.xpiSha256===digest&&/^[a-f0-9]{40}$/.test(receipt.checkoutSha||'')&&/^[a-f0-9]{40}$/.test(receipt.sourceTree||''),'J07_FOREIGN_SOURCE_OR_XPI');
 assert(receipt.geckoId==='persona-route-manager@local'&&receipt.version==='1.2.17','J07_WRONG_PACKAGE');
 assert(receipt.retainedSuites==='PASS','J07_RETAINED_SUITE_REQUIRED');
 assert(receipt.issue60Integration?.schema==='pcms.issue60.integration/1'&&receipt.issue60Integration.status==='PASS'&&receipt.issue60Integration.xpiSha256===digest,'ISSUE60_SAME_PACKAGE_INTEGRATION_REQUIRED');
 const required=Object.values(map.journeys).flatMap(j=>j.browser);
 assert(required.length===receipt.completed.length&&new Set(receipt.completed).size===required.length&&required.every(x=>receipt.completed.includes(x)),'J07_MISSING_OR_DUPLICATE_JOURNEY_RUN');
 return {browser:'PASS',normalSandbox:receipt.contentSandboxDisabled!==true,
  deterministic:receipt.githubActions===true?'FULL_FAST_SUCCESS_REQUIRED_BY_EXISTING_FIREFOX_JOB_DEPENDENCY':'NOT_ATTESTED_BY_BROWSER_RECEIPT',
  scope:'Actual packaged UI/IDB/file/process observations; external provider, routing and private Git dependencies are offline fixtures. Broad suite success is not an individual AC/T/X acceptance receipt.'};
}
export function markdown(report){
 const lines=['# J07 final primary UI audit','',`Version: ${report.version}. Checkout: ${report.checkoutSha}. Candidate: ${report.candidateSha}. Tree: ${report.sourceTree}.`,
  `XPI SHA-256: ${report.xpiSha256}. Gecko ID: ${report.geckoId}.`,
  `Actions: ${report.actionsUrl||'Local disposable browser run; no CI attestation'}.`,'',
  'All seven primary journeys and retained browser regressions completed on this package. The 34 original findings are traced below. External and human acceptance remains open, including G-07/D-06/R-03; no local fixture is live Perchance, real protected routing, or private generator Git proof.',
  '','| Finding | Primary control | Production handler | Result and limits |','|---|---|---|---|'];
 for(const f of report.findings)lines.push(`| ${f.id} (${f.journey}) | ${f.control} | ${f.handler} | ${f.result}${f.external?' **'+f.external+'**':''} |`);
 lines.push('','## Executed supporting scope','','| Journey | Installed browser entry points | Bounded observations |','|---|---|---|');
 for(const [id,j] of Object.entries(report.journeys))lines.push(`| ${id} | ${j.browser.join(', ')} | ${j.observations} |`);
 lines.push('','Issue60 additionally passed a same-package three-account 1.2.14 upgrade through real authenticated SOCKS/TLS and production isolated readers: helper/proxy outage, route recovery, read/Open lease isolation, protected create/rename without a human tab or dashboard, lost native and provider ACKs, cold reconciliation/no replay, historical and current queue context, and backup independence. Native/provider protocols are offline fixtures; real OS bridge and live resources remain untested.');
 lines.push('','## Accepted requirement trace','','These are coverage references to actual regression suites, not fabricated per-case acceptance PASS. Positive, adverse and recovery expectations and required tiers come from the accepted matrix as amended; X narratives are digest-checked against recovered Part 8. Each requirement retains its external and human acceptance needs. The existing A09 evaluator accepts separately obtained exact-source/tier/case receipts.','',
  '| Requirement | Required tiers | Supporting primary journeys | Acceptance |','|---|---|---|---|');
 for(const r of report.requirements)lines.push(`| ${r.id} | ${r.tiers.join(', ')} | ${r.journeys.join(', ')} | ${r.acceptance} |`);
 lines.push('','## Proof limits','',...report.limits.map(s=>'- '+s),'',
  'D evidence: '+report.run.deterministic+'. B suite: '+report.run.browser+'. Normal content sandbox: '+report.run.normalSandbox+'.',
  'This generated report is an engineering audit and a navigation map for the independent reviewer. It does not grant provider, Git, profile or publication authority.');
 return lines.join('\n')+'\n';
}
async function main(){
 const [xpi,receiptPath,out='build']=process.argv.slice(2);assert(xpi&&receiptPath,'J07_USAGE_XPI_FULL_RUN_RECEIPT_OUT');
 const [map,audit,matrix,scenarios,originalX,receipt,bytes]=await Promise.all([
  readFile('docs/verification/J07-CONFORMANCE.json','utf8').then(JSON.parse),readFile('docs/audit/2026-10-24-PRACTICAL-PRODUCT-CONFORMANCE.md','utf8'),
  readFile('docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md','utf8'),readFile('tests/fixtures/a01-recovery-scenarios.json','utf8').then(JSON.parse),
  readFile('docs/audit/PART8-ORIGINAL-X01-X14.md','utf8'),readFile(receiptPath,'utf8').then(JSON.parse),readFile(xpi)]);
 const catalog=buildCatalog(matrix,scenarios,originalX);validateMap(map,audit,catalog);
 for(const j of Object.values(map.journeys)){await access(j.ui);await access(j.runtime)}
 const digest=createHash('sha256').update(bytes).digest('hex'),run=evaluateRun(map,receipt,digest);
 const current=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert(current===receipt.checkoutSha,'J07_CHECKOUT_MISMATCH');
 const report={schema:'pcms.j07.final-audit/1',...receipt,run,findings:map.findings,journeys:map.journeys,
  requirements:catalog.map(r=>({...r,journeys:[...new Set((r.kind==='AC'?[r.id]:r.relatedAC).flatMap(id=>map.acceptanceJourneys[id]))],
   acceptance:r.tiers.some(t=>['L','GIT','H'].includes(t))?'OPEN: exact external/timed/operator acceptance receipts required':'OPEN: independent per-case/operator acceptance; supporting D/B scope below'})),
  limits:[
   'No personal Firefox profiles, live Perchance resources or private generator Git repositories were mutated.',
   'Actual disposable process exits, physical archive/binary file reopen and fresh/current-profile IDB restore are observed; these do not establish real Mullvad bridge health, long 24h/72h operation or every H acceptance slot.',
   'Source/tree/permissions, donor integrity, all deterministic regressions, reproducible XPI and installed Firefox remain mandatory through existing pcms-required protection. The report does not replace any gate.',
   'D large-archive (>64 MiB / 100001 records) stress and B physical-file/IDB recovery have distinct scope. No large-file B claim is inferred.',
   'Keyboard, focus, geometry and zoom checks are automated B observations; independent human screen-reader/visual acceptance is not claimed.',
   'G-07, D-06 and R-03 external positive outcomes remain NOT_TESTED until exact authorized provider/private-Git/protected-route readback exists.'
  ]};
 await mkdir(out,{recursive:true});await writeFile(path.join(out,'j07-final-audit.json'),JSON.stringify(report,null,2)+'\n');await writeFile(path.join(out,'j07-final-audit.md'),markdown(report));
 console.log('J07_FINAL_AUDIT_34_FINDINGS_18AC_10T_14X=WRITTEN; EXTERNAL_ACCEPTANCE=OPEN');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1});
