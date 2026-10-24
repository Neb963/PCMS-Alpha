// Primary initial-import review is derived from canonical owned inventory and
// the same provisional balanced allocator as explicit intake. Local absence
// is never provider absence: creation still needs an independent target read.
import {previewCreation} from './creation-preview.mjs';
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function readImportTargets(db,slugs){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readonly'),inventory=new Map();let result;
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('IMPORT_INVENTORY_UNAVAILABLE'));
  tx.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;
   if(c){if(String(c.key).startsWith('inventory:')&&c.value?.generator)inventory.set(c.value.generator.slug,c.value.generator);c.continue();return}
   result=slugs.map(slug=>{const g=inventory.get(slug);return {slug,ownerState:g?.ownerState||'NOT_IN_MANAGED_INVENTORY',accountId:g?.accountId||null,
    remoteId:g?.remoteId||null,personaUid:g?.personaUid||null,bindingVersion:g?.bindingVersion||null}});
  };
 });
}
export async function buildImportPreview(db,catalog){
 const slugs=catalog.generators.map(g=>g.slug);
 const plan=slugs.length?await previewCreation(db,{slugs}):{ok:true,items:[],accounts:[]};
 if(!plan.ok)return plan;
 const targets=await readImportTargets(db,slugs);
 const items=catalog.generators.map((g,i)=>({...g,...plan.items[i],observed:targets[i].ownerState,
   proposedAccountId:plan.items[i].accountId||null}));
 // Ordinary load/temporary health changes can adjust provisional allocation
 // (C37). Identity/ownership changes require a fresh initial review.
 const planDigest=await hash(targets);
 return {ok:true,items,targets,accounts:plan.accounts,planDigest,unresolved:items.filter(x=>x.action==='HELD').length,
  repository:catalog.repository,repositoryId:catalog.repositoryId,head:catalog.head,approved:false,
  requiresExplicitInitialApproval:true,providerEffects:'OFF'};
}
export function sameImportTarget(a,b){return JSON.stringify(a)===JSON.stringify(b)}
