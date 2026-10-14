// No import of PCMS controller, PersonaGuard, donor management, AI or backup.
import { createSafeReport,safeMarkdownReport } from './safe-report.mjs';
import { makeSafeArchive } from './diagnostic-archive.mjs';
const output = document.getElementById('report');
const state = document.getElementById('diagnostic-state');
const markdown = document.getElementById('markdown');
const downloadStatus=document.getElementById('download-status');
let report;
async function inspect() {
  let snapshot = null;
  try {
    const key = 'pcmsI01WakeHealth';
    const restoreKey = 'pcmsRestoreInProgress';
    const stored = await browser.storage.local.get([key, restoreKey, 'pcmsI12Status']);
    snapshot = {
      wakeCount: stored[key]?.wakeCount,
      alarmCount: stored[key]?.alarmCount,
      lastWake: stored[key]?.lastWake,
      previousBoot: stored[key]?.priorBootSeen,
      restoreActive: stored[restoreKey]?.active,
      refresher:stored.pcmsI12Status
    };
  } catch { /* report section unavailable */ }
  report = createSafeReport(snapshot);
  output.textContent = JSON.stringify(report, null, 2);
  markdown.value=safeMarkdownReport(report);
  state.textContent = snapshot ? 'Limited safe status available.' : 'Independent storage unavailable; minimal report only.';
}
document.getElementById('export').addEventListener('click', () => {
  if (!report){
    downloadStatus.textContent='Export unavailable. Use the Markdown fallback.';
    return;
  }
  let url;
  try{
    const file = new Blob([makeSafeArchive(report)], { type:'application/zip' });
    url=URL.createObjectURL(file);
    const a=document.createElement('a');
    a.href=url;a.download='pcms-redacted-diagnostics.zip';
    a.click();
    downloadStatus.textContent='ZIP requested. Check Downloads for the file; no completion has been verified.';
  }catch{
    downloadStatus.textContent='ZIP export unavailable. Select and copy the Markdown fallback below.';
  }finally{
    if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
});
await inspect();
