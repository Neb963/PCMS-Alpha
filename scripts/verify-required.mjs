#!/usr/bin/env node
/** Full acceptance only. Draft preflight never publishes pcms-required. */
export const MANDATORY = Object.freeze(['baseline', 'fast', 'firefox']);
export function checkRequired(result) {
  const bad = MANDATORY.filter(name => !result || result[name] !== 'success');
  return { accepted: bad.length === 0, bad };
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  let observations;
  try { observations = JSON.parse(process.argv[2] ?? '{}'); }
  catch { observations = null; }
  const verdict = checkRequired(observations);
  if (!verdict.accepted) {
    console.error(`pcms-required FAIL: mandatory jobs not successful: ${verdict.bad.join(', ')}`);
    process.exitCode = 1;
  } else console.log('pcms-required PASS [FULL_ENGINEERING_GATE]: all mandatory jobs succeeded');
}
