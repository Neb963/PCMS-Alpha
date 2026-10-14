// I17: bounded presentation-only index projection, no provider or routing
// authority. Raw credentials, source bytes and account identity proofs never
// enter search results.
export const RESULT_LIMIT=10;
const MAX_QUERY=80;
export function validSearchQuery(query){
  if(typeof query!=='string')return '';
  return query.trim().slice(0,MAX_QUERY).toLowerCase();
}
const short=(s,max=100)=>typeof s==='string'?s.slice(0,max):'';
export function localSearchResults(query,inventory,accounts,{inventoryPartial=false,accountsPartial=false}={}){
  const q=validSearchQuery(query);
  if(q.length<2)return {items:[],partial:false};
  const entries=[];
  for(const row of Array.isArray(inventory)?inventory:[]){
    const slug=short(row?.slug);
    if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))continue;
    const owner=short(row?.accountId,128);
    if(!slug.toLowerCase().includes(q)&&!owner.toLowerCase().includes(q))continue;
    entries.push({kind:'generator',key:slug,title:slug});
  }
  for(const row of Array.isArray(accounts)?accounts:[]){
    const id=short(row?.accountId,128);
    if(!/^[a-z0-9_-]{1,128}$/i.test(id))continue;
    if(!id.toLowerCase().includes(q))continue;
    entries.push({kind:'account',key:id,title:id});
  }
  const ordered=entries.sort((a,b)=>
    (a.key.toLowerCase()===q?-1:0)-(b.key.toLowerCase()===q?-1:0)||
    (a.key.toLowerCase().startsWith(q)?-1:0)-(b.key.toLowerCase().startsWith(q)?-1:0)||
    a.kind.localeCompare(b.kind)||a.key.localeCompare(b.key));
  const unique=new Set(),items=[];
  for(const row of ordered){
    const ref=row.kind+':'+row.key;
    if(unique.has(ref))continue;
    unique.add(ref);items.push(Object.freeze(row));
    if(items.length===RESULT_LIMIT)break;
  }
  return {items,partial:inventoryPartial||accountsPartial||entries.length>RESULT_LIMIT};
}
