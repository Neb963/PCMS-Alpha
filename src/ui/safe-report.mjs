// Explicit allowlist; no copying input objects, error messages, URLs,
// hashes, arbitrary user labels, routes, cookies or external identifiers.
const wake = new Set(['entry','startup','installed','alarm','message']);
function bounded(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 999999
    ? value : null;
}
export function createSafeReport(input) {
  const report = {
    schema: 'PCMS_SAFE_DIAGNOSTIC_V1',
    phase: 'I02',
    effects: 'OFF',
    sections: { canonical: 'section_unavailable', donor: 'section_unavailable' }
  };
  if (!input || typeof input !== 'object') {
    report.sections.wake = 'section_unavailable';
    report.sections.restore = 'section_unavailable';
    return report;
  }
  report.sections.wake = 'allowlisted';
  report.wake = {
    count: bounded(input.wakeCount),
    alarmCount: bounded(input.alarmCount),
    lastEvent: wake.has(input.lastWake) ? input.lastWake : 'UNKNOWN',
    previousBootObserved: input.previousBoot === true
  };
  report.sections.restore = input.restoreActive === true
    ? 'RESTORE_IN_PROGRESS'
    : input.restoreActive === undefined ? 'section_unavailable' : 'RESTORE_MARKER_INVALID';
  const refresher=input.refresher;
  report.sections.refresher=refresher?.mode==='SHADOW_ONLY'?'allowlisted':'section_unavailable';
  if(refresher?.mode==='SHADOW_ONLY')report.refresher={
    mode:'SHADOW_ONLY',mutations:0,turns:bounded(refresher.turns),reads:bounded(refresher.reads),
    queuePeak:bounded(refresher.queuePeak),readPeak:bounded(refresher.readPeak),
    unknownIntervals:bounded(refresher.unknownIntervals),alarmHeld:refresher.alarmHeld===true,
    code:new Set(['SHADOW_READY','MONITOR_ACTIVATION_HELD','ALARM_UNVERIFIED',
      'CANONICAL_UNAVAILABLE','RESTORE_HOLD']).has(refresher.code)?refresher.code:'UNKNOWN'};
  return report;
}
