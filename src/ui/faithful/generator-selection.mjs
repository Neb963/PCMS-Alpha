import {writeDisplayState} from '../presentation-client.mjs';
import {normalizeSelection} from '../presentation-preferences.mjs';
const KEY='pcmsUiGeneratorSelectionV1';
const valid=x=>x&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x.slug||'')&&
 typeof x.accountId==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(x.accountId)&&
 Number.isSafeInteger(x.revision)&&x.revision>0;
export function createGeneratorSelection(storage){
 const entries=new Map(),listeners=new Set();let generation=0,pendingWrites=0,error=null,writes=Promise.resolve(),observed=normalizeSelection();
 const snapshot=()=>[...entries.values()].map(x=>({...x}));
 const changed=()=>{for(const fn of listeners)fn()};
 const ready=Promise.resolve().then(()=>storage.get(KEY)).then(out=>{
  const saved=out?.[KEY]?.items;
  observed=normalizeSelection(out?.[KEY]);
  if(generation===0&&Array.isArray(saved))for(const item of saved)if(valid(item))
   entries.set(item.slug,{slug:item.slug,accountId:item.accountId,revision:item.revision});
  changed();return true;
 }).catch(()=>{error='Saved selection could not be read.';changed();return false});
 function save(){
  const items=snapshot();generation++;pendingWrites++;changed();
  writes=writes.catch(()=>{}).then(async()=>{
    const value={schema:1,items};
    if(globalThis.browser?.runtime?.connect){const result=await writeDisplayState('SELECTION',value,observed);if(!result?.ok)throw Error(result?.code||'SELECTION_SAVE_UNCONFIRMED')}
    else await storage.set({[KEY]:value});
    observed=structuredClone(value);
  })
   .then(()=>{error=null;changed()}).catch(cause=>{
     error=cause.message==='RESTORE_HOLD'?'Selection is paused during restore. Your current choices are kept here. Retry after it finishes.':
       cause.message==='PRESENTATION_STALE'?'Saved selection changed in another dashboard or restore. Reload this page before selecting again.':
       'Selection could not be saved. Your current selection is kept on this page.';changed()})
   .finally(()=>{pendingWrites--;changed()});
  return writes;
 }
 return Object.freeze({
  ready,snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
  includes:item=>entries.get(item.slug)?.accountId===item.accountId,
  set(item,checked){return ready.then(()=>{if(!valid(item))return false;
   if(checked)entries.set(item.slug,{slug:item.slug,accountId:item.accountId,revision:item.revision});
   else entries.delete(item.slug);return save()})},
  setMany(items,checked){return ready.then(()=>{for(const item of items)if(valid(item)){
   if(checked)entries.set(item.slug,{slug:item.slug,accountId:item.accountId,revision:item.revision});
   else entries.delete(item.slug)}return save()})},
  remove(slug){return ready.then(()=>{entries.delete(slug);return save()})},
  clear(){return ready.then(()=>{entries.clear();return save()})},
  status:()=>({count:entries.size,error,saving:pendingWrites>0}),settled:()=>writes
 });
}
