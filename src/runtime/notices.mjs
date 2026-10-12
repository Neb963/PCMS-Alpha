// Local notification adapter: never includes account identifiers or arbitrary
// error text in OS notification contents. Failure leaves dashboard incident.
export function createNoticeDispatcher(api, store) {
  return Object.freeze({
    async emit(incident) {
      const receipt=await store.recordNotice(incident);
      if (!receipt.ok || !receipt.changed) return receipt;
      if (incident.severity==='INFORMATIONAL') return receipt;
      try {
        await api.notifications.create({
          type:'basic', title:'PCMS requires attention',
          message:'A protected operation is held. Open PCMS to review.',
          iconUrl:api.runtime.getURL('icons/icon48.png')
        });
        return { ...receipt, desktop:'REQUESTED' };
      } catch {
        return { ...receipt, desktop:'UNAVAILABLE_DASHBOARD_ONLY' };
      }
    }
  });
}
