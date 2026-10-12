// Read-only status projection. Never infer an empty healthy account fleet from
// a failed bootstrap, and never activate actions on a successful diagnostic.
const status = document.getElementById('pcms-guard-health');
const badge = document.getElementById('pcms-guard-badge');
const account = document.getElementById('pcms-account-guard');

function project(code, donorReady = false) {
  const label = donorReady ? 'Guarded · effects off' : 'Held · not ready';
  badge.textContent = label;
  status.textContent = code + '. PCMS provider writes remain disabled.';
  account.textContent = 'Background: ' + label + '. Account enrollment remains disabled.';
}
try {
  const result = await Promise.race([
    browser.runtime.sendMessage({ type: 'PCMS_I01_STATUS' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
  ]);
  if (result?.ok === true && result.providerEffects === 'OFF')
    project(result.admission || 'HELD', result.donorReady === true && result.privacySafe === true);
  else project('HEALTH_UNAVAILABLE');
} catch {
  project('HEALTH_UNAVAILABLE');
}
