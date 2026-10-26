// Must be imported statically by pcms/entry.mjs. No asynchronous dependency
// is permitted before registering these wake-critical Firefox listeners.
import { getPcmsGuardHealth } from './persona-guard.mjs';
export const WAKE_ALARM = 'pcms-i01-health';
export const HEALTH_PORT = 'pcms-i01-health-readonly';
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
        alarmCount: Math.min(999999, (Number.isSafeInteger(previous?.alarmCount)
          ? previous.alarmCount : 0) + (kind === 'alarm' ? 1 : 0)),
        priorBootSeen: Boolean(previous?.bootId && previous.bootId !== bootId)
      } });
    }).catch(() => { storageFailure = true; });
    return writeTail;
  }

  let alarmFlight=null;
  function alarmSchedule() {
    if(alarmFlight)return alarmFlight;
    // Event-page evaluation can occur before an already due alarm is
    // delivered. Replacing it here postpones the wake on every cold event.
    alarmFlight=Promise.resolve().then(async()=>{
      if(typeof api.alarms.get==='function'&&await api.alarms.get(WAKE_ALARM))return;
      await api.alarms.create(WAKE_ALARM,{periodInMinutes:10});
    }).catch(()=>{storageFailure=true;}).finally(()=>{alarmFlight=null;});
    return alarmFlight;
  }

  function statusFor(sender) {
    if (!trustedStatusSender(api, sender)) return { ok: false, code: 'UNTRUSTED_SENDER' };
    const guard = health();
    return {
      ok: true, phase: 'I01', bootId, wakeCount: eventCount,
      lastWake: lastEvent, healthStorage: storageFailure ? 'DEGRADED' : 'BEST_EFFORT',
      donorReady: guard.donorReady === true, privacySafe: guard.privacySafe === true,
      admission: guard.admission, providerEffects: 'OFF'
    };
  }

  function onConnect(port) {
    if (port?.name !== HEALTH_PORT) return;
    if(!trustedStatusSender(api,port.sender)){
      try{port.postMessage(statusFor(port.sender));}catch{}return;
    }
    // A cold alarm can reach this port before its asynchronous storage write.
    // Observe that real checkpoint before claiming a healthy wake receipt.
    // A stalled diagnostic write remains tracked; it cannot hang the port.
    const snapshot={wakeCount:eventCount,lastWake:lastEvent};
    let timer;
    void Promise.race([writeTail.then(()=>true),new Promise(resolve=>{
      timer=setTimeout(()=>resolve(false),2000);
    })]).then(persisted=>{
      const response={...statusFor(port.sender),...snapshot};
      if(!persisted)response.healthStorage='PENDING';
      response.receiptPersisted=persisted&&!storageFailure;
      try{port.postMessage(response);}catch{}
    }).finally(()=>clearTimeout(timer));
  }

  function onMessage(message, sender) {
    // No competing return value with the donor's async legacy switch. Read-only
    // health uses an isolated port; unknown messages remain donor-owned.
    if (message?.type !== 'PCMS_I01_WAKE') return undefined;
    if (!trustedStatusSender(api, sender)) return undefined;
    receipt('message');
    return undefined;
  }

  function register() {
    if (registered) return;
    // Listener registration is synchronous. Do not move behind an await.
    api.runtime.onMessage.addListener(onMessage);
    api.runtime.onConnect.addListener(onConnect);
    api.runtime.onStartup.addListener(() => { receipt('startup'); alarmSchedule(); });
    api.runtime.onInstalled.addListener(() => { receipt('installed'); alarmSchedule(); });
    api.alarms.onAlarm.addListener(alarm => {
      if (alarm?.name === WAKE_ALARM) {void alarmSchedule();return receipt('alarm');}
    });
    registered = true;
    alarmSchedule(); // Firefox alarms do not persist across full restarts.
    receipt('entry');
  }
  return Object.freeze({ register, onMessage, onConnect, getLocalReceipt: () => ({
    bootId, eventCount, lastEvent, storageFailure
  }) });
}

// Node tests import the factory without a global browser. Firefox registers
// at module evaluation, before donor recovery's first asynchronous completion.
if (typeof browser !== 'undefined') createWakeService(browser).register();
