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
  report.sections.refresher=['SHADOW_ONLY','SCOPED_SOURCE_SAVE'].includes(refresher?.mode)?'allowlisted':'section_unavailable';
  if(['SHADOW_ONLY','SCOPED_SOURCE_SAVE'].includes(refresher?.mode))report.refresher={
    mode:refresher.mode,mutations:refresher.mode==='SHADOW_ONLY'?0:bounded(refresher.mutations),turns:bounded(refresher.turns),reads:bounded(refresher.reads),
    queuePeak:bounded(refresher.queuePeak),readPeak:bounded(refresher.readPeak),
    unknownIntervals:bounded(refresher.unknownIntervals),alarmHeld:refresher.alarmHeld===true,
    code:new Set(['SHADOW_READY','SOURCE_SAVE_READY','MONITOR_ACTIVATION_HELD','ALARM_UNVERIFIED',
      'CANONICAL_UNAVAILABLE','RESTORE_HOLD']).has(refresher.code)?refresher.code:'UNKNOWN'};
  return report;
}

/**
 * Revalidate a previously projected report before ANY downstream export.
 * Never trust a report supplied by a window, injected extension context or
 * stale UI: only known value fields re-enter createSafeReport's allowlist.
 */
export function normalizeSafeReport(report) {
  if(report?.schema!=='PCMS_SAFE_DIAGNOSTIC_V1')
    throw new TypeError('Unvalidated diagnostic report');
  const ref=report.refresher;
  return createSafeReport({
    wakeCount:report.wake?.count,
    alarmCount:report.wake?.alarmCount,
    lastWake:report.wake?.lastEvent,
    previousBoot:report.wake?.previousBootObserved,
    restoreActive:report.sections?.restore==='RESTORE_IN_PROGRESS'?true:undefined,
    ...(['SHADOW_ONLY','SCOPED_SOURCE_SAVE'].includes(ref?.mode)?{refresher:{
      mode:ref.mode,mutations:ref.mutations,turns:ref.turns,reads:ref.reads,
      queuePeak:ref.queuePeak,readPeak:ref.readPeak,
      unknownIntervals:ref.unknownIntervals,alarmHeld:ref.alarmHeld,
      code:ref.code
    }}:{})
  });
}
export function safeMarkdownReport(report) {
  const checked=normalizeSafeReport(report);
  const number=v=>v===null?'unavailable':String(v);
  const sections=checked.sections;
  const text=[
    '# PCMS Alpha — emergency diagnostics',
    '',
    'Read-only, redacted status. NOT a backup, provider verification,',
    'safe-controller activation proof, or approval for remote effects.',
    '',
    '- Canonical: '+sections.canonical,
    '- Donor: '+sections.donor,
    '- Restore: '+sections.restore,
    '- Wake section: '+sections.wake,
    '- Wake count: '+number(checked.wake?.count??null),
    '- Alarm count: '+number(checked.wake?.alarmCount??null),
    '- Previous boot observed: '+(checked.wake?.previousBootObserved?'yes':'no'),
    '- Refresher section: '+(sections.refresher||'section_unavailable')
  ];
  if(checked.refresher)text.push(
    '- Refresher mode: '+checked.refresher.mode,
    checked.refresher.mode==='SHADOW_ONLY'?'- Provider mutations: OFF':
      '- Provider mutations: scoped source-save admission; live qualification is separate',
    '- Recorded attempts (bounded history): '+number(checked.refresher.mutations),
    '- Refresher code: '+checked.refresher.code,
    '- Turns: '+number(checked.refresher.turns),
    '- Reads: '+number(checked.refresher.reads),
    '- Queue peak: '+number(checked.refresher.queuePeak),
    '- Read peak: '+number(checked.refresher.readPeak),
    '- Unknown intervals: '+number(checked.refresher.unknownIntervals),
    '- Alarm held: '+(checked.refresher.alarmHeld?'yes':'no'));
  text.push('', 'Unavailable sections remain unverified. No live provider calls',
    'were requested by the emergency diagnostics exporter.', '');
  return text.join('\n');
}
