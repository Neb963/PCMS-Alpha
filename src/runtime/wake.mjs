// Must be imported statically by pcms/entry.mjs. No asynchronous dependency
// is permitted before registering these wake-critical Firefox listeners.
import { getPcmsGuardHealth } from './persona-guard.mjs';
export const WAKE_ALARM = 'pcms-i01-health';
const STORE_KEY = 'pcmsI01WakeHealth';

function trustedStatusSender(api, sender) {
  // Firefox populates sender.url; content scripts retain their web-page URL,
  // even when their extension ID matches. Never trust message-supplied origin.
  return sender?.id === api.runtime.id && typeof sender.url === 'string' &&
    sender.url.startsWith(api.runtime.getURL('pcms/'));
}

export function createWakeService(api, { health = getPcmsGuardHealth } = {}) {
  let registered = false, writeTail = Promise.resolve();
  const bootId = crypto.randomUUID();
  let eventCount = 0, lastEvent = 'entry';
  let storageFailure = false;

  function receipt(kind) {
    eventCount = Math.min(999999, eventCount + 1);
    lastEvent = kind;
    // Diagnostic breadcrumb, NOT canonical PCMS state or a dispatch journal.
    writeTail = writeTail.then(async () => {
      const prior = await api.storage.local.get(STORE_KEY);
      const previous = prior?.[STORE_KEY];
      await api.storage.local.set({ [STORE_KEY]: {
        bootId, wakeCount: eventCount, lastWake: kind,
        priorBootSeen: Boolean(previous?.bootId && previous.bootId !== bootId)
      } });
    }).catch(() => { storageFailure = true; });
  }

  function alarmSchedule() {
    try { api.alarms.create(WAKE_ALARM, { periodInMinutes: 10 }); }
    catch { storageFailure = true; }
  }

  function onMessage(message, sender) {
    if (message?.type !== 'PCMS_I01_STATUS') return undefined;
    if (!trustedStatusSender(api, sender)) return { ok: false, code: 'UNTRUSTED_SENDER' };
    const guard = health();
    return {
      ok: true, phase: 'I01', bootId, wakeCount: eventCount,
      lastWake: lastEvent, healthStorage: storageFailure ? 'DEGRADED' : 'BEST_EFFORT',
      donorReady: guard.donorReady === true, privacySafe: guard.privacySafe === true,
      admission: guard.admission, providerEffects: 'OFF'
    };
  }

  function register() {
    if (registered) return;
    // Listener registration is synchronous. Do not move behind an await.
    api.runtime.onMessage.addListener(onMessage);
    api.runtime.onStartup.addListener(() => { receipt('startup'); alarmSchedule(); });
    api.runtime.onInstalled.addListener(() => { receipt('installed'); alarmSchedule(); });
    api.alarms.onAlarm.addListener(alarm => {
      if (alarm?.name === WAKE_ALARM) receipt('alarm');
    });
    registered = true;
    alarmSchedule(); // Firefox alarms do not persist across full restarts.
    receipt('entry');
  }
  return Object.freeze({ register, onMessage, getLocalReceipt: () => ({
    bootId, eventCount, lastEvent, storageFailure
  }) });
}

// Node tests import the factory without a global browser. Firefox registers
// at module evaluation, before donor recovery's first asynchronous completion.
if (typeof browser !== 'undefined') createWakeService(browser).register();
