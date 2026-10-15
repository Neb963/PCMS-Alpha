// Read-only status projection. Never infer an empty healthy account fleet from
// a failed bootstrap, and never activate actions on a successful diagnostic.
const status = document.getElementById('pcms-guard-health');
const badge = document.getElementById('pcms-guard-badge');
const account = document.getElementById('pcms-account-guard');

function project(code, donorReady = false) {
  // I01 is a read-only health endpoint; its providerEffects='OFF' only
  // describes the guard facade, NOT the separately guarded I06-I17 writers.
  const label = donorReady ? 'Donor guard ready' : 'Donor guard unavailable';
  badge.textContent = label;
  status.textContent = code + '. Protected Persona checks are required for each provider operation; this health view does not authorize writes.';
  account.textContent = 'Background: ' + label + '. Account identity and protected route eligibility are rechecked by each workflow.';
}

// Dedicated health port avoids competing with the donor's legacy onMessage
// switch, whose unknown-message rejection is deliberately retained.
function readHealth() {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connect({ name: 'pcms-i01-health-readonly' });
    let settled = false;
    const timer = setTimeout(() => finish(null, new Error('timeout')), 3500);
    function finish(value, error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { port.disconnect(); } catch {}
      if (error) reject(error);
      else resolve(value);
    }
    port.onMessage.addListener(value => finish(value));
    port.onDisconnect.addListener(() => finish(null, new Error('disconnected')));
  });
}
try {
  const result = await readHealth();
  if (result?.ok === true && result.providerEffects === 'OFF')
    project(result.admission || 'HELD', result.donorReady === true && result.privacySafe === true);
  else project('HEALTH_UNAVAILABLE');
} catch {
  project('HEALTH_UNAVAILABLE');
}
