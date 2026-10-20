// Read-only status projection. Never infer an empty healthy account fleet from
// a failed bootstrap, and never activate actions on a successful diagnostic.
const status = document.getElementById('pcms-guard-health');
const badge = document.getElementById('pcms-guard-badge');
const account = document.getElementById('pcms-account-guard');

function project(code, donorReady = false) {
  const label = donorReady ? 'Protected route ready' : 'Route unavailable';
  badge.textContent = label;
  status.textContent = code + '. Operations require scoped permissions and fresh route/source checks.';
  account.textContent = 'Background: ' + label + '. PersonaMonkey manages protected routes; PCMS applies individual operation guards.';
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
