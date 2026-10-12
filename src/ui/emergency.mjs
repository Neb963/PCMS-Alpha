// No import of PCMS controller, PersonaGuard, donor management, AI or backup.
import { createSafeReport } from './safe-report.mjs';
const output = document.getElementById('report');
const state = document.getElementById('diagnostic-state');
let report;
async function inspect() {
  let snapshot = null;
  try {
    const key = 'pcmsI01WakeHealth';
    const restoreKey = 'pcmsRestoreInProgress';
    const stored = await browser.storage.local.get([key, restoreKey]);
    snapshot = {
      wakeCount: stored[key]?.wakeCount,
      alarmCount: stored[key]?.alarmCount,
      lastWake: stored[key]?.lastWake,
      previousBoot: stored[key]?.priorBootSeen,
      restoreActive: stored[restoreKey]?.active
    };
  } catch { /* report section unavailable */ }
  report = createSafeReport(snapshot);
  output.textContent = JSON.stringify(report, null, 2);
  state.textContent = snapshot ? 'Limited safe status available.' : 'Independent storage unavailable; minimal report only.';
}
document.getElementById('export').addEventListener('click', () => {
  if (!report) return;
  const file = new Blob([JSON.stringify(report,null,2)+'\n'], { type:'application/json' });
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pcms-redacted-diagnostics.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
await inspect();
