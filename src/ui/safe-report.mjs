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
  return report;
}
