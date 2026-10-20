// Firefox toolbar navigation; the popup is intentionally absent from the XPI.
// This module owns no provider, account, or route permissions.
export function createDashboardAction(api){
  let pending=null;
  const target=api.runtime.getURL('pcms/index.html');
  async function open(){
    if(pending)return pending;
    pending=(async()=>{
      const tabs=await api.tabs.query({});
      const existing=tabs.find(t=>t.url?.split('#')[0]===target &&
        Number.isInteger(t.id));
      if(existing){
        await api.tabs.update(existing.id,{active:true});
        if(Number.isInteger(existing.windowId) && api.windows?.update)
          await api.windows.update(existing.windowId,{focused:true});
        return {reused:true,tabId:existing.id};
      }
      const tab=await api.tabs.create({url:target,active:true});
      return {reused:false,tabId:tab.id};
    })().finally(()=>{pending=null});
    return pending;
  }
  function register(){api.action.onClicked.addListener(()=>{void open().catch(()=>{});});}
  return Object.freeze({register,open});
}
if(typeof browser!=='undefined')createDashboardAction(browser).register();
