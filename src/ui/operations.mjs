// Read-only projection of canonical journal state; old asynchronous replies
// cannot replace newer ones and no command here can mutate business state.
const journalStatus = document.getElementById('pcms-journal-health');
const queue = document.getElementById('pcms-work-queue-summary');
let generation = 0;
async function read() {
  const mine = ++generation;
  const result = await new Promise((resolve,reject) => {
    const port = browser.runtime.connect({ name:'pcms-i02-canonical-readonly' });
    const timer = setTimeout(() => { try { port.disconnect(); } catch {} reject(Error('timeout')); },3500);
    port.onMessage.addListener(value => {
      clearTimeout(timer);
      try { port.disconnect(); } catch {}
      resolve(value);
    });
    port.onDisconnect.addListener(() => { clearTimeout(timer); reject(Error('disconnected')); });
    port.postMessage({ type: 'SUMMARY' });
  });
  if (mine !== generation) return;
  if (result?.ok !== true || result?.providerEffects !== 'OFF') throw Error('unsafe status');
  journalStatus.textContent = result.storage === 'READY'
    ? 'Canonical IndexedDB available. Restore: ' + result.restore + '. All remote effects OFF.'
    : 'Canonical store unavailable; global PCMS operation hold. Restore: ' + result.restore;
  const counts = result.states || {};
  queue.textContent = result.storage === 'READY'
    ? 'Persisted status counts: Prepared ' + (counts.PREPARED||0) +
      ', possible ' + (counts.DISPATCH_POSSIBLE||0) +
      ', uncertain ' + (counts.HELD_UNCERTAIN||0) +
      ', confirmed ' + (counts.CONFIRMED||0) +
      '. No provider work admitted or dispatched.'
    : 'Canonical journal inaccessible. Operation outcomes unknown; no retry allowed.';
}
try { await read(); } catch {
  journalStatus.textContent = 'Journal health unavailable; treat PCMS work as held.';
  queue.textContent = 'Could not obtain a journal snapshot. Outcomes unknown; do not retry.';
}
