// Presentation only. No credential, permission, source or effect authority.
export const PRESENTATION_KEY='pcmsUiWorkspaceV1';
export const SELECTION_KEY='pcmsUiGeneratorSelectionV1';
export const COLUMN_IDS=['generator','account','status','visibility','source','release','refresher','attention','observed'];
export const COLUMN_LABELS={generator:'Generator',account:'Account',status:'Status',visibility:'Perchance listing',source:'GitHub source',release:'Release',refresher:'Refresher',attention:'Attention',observed:'Observed'};
const widths={generator:240,account:160,status:150,visibility:120,source:210,release:160,refresher:160,attention:190,observed:150};
export function normalizeSelection(raw){
 const items=new Map();for(const item of Array.isArray(raw?.items)?raw.items:[]){
  if(item&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(item.slug||'')&&/^[A-Za-z0-9_-]{8,100}$/.test(item.accountId||'')&&Number.isSafeInteger(item.revision)&&item.revision>0)
   items.set(item.slug,{slug:item.slug,accountId:item.accountId,revision:item.revision});
 }return {schema:1,items:[...items.values()]};
}
const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const text=(value,max,fallback='')=>typeof value==='string'?value.slice(0,max):fallback;
export function normalizeFilters(raw={}){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 return {query:text(raw.query,80),account:text(raw.account,128,'ALL')||'ALL',
  filter:choice(raw.filter,['ALL','PUBLISHED','DEVELOPING','REVIEW','HELD'],'ALL'),
  owner:choice(raw.owner,['ALL','OBSERVED_OWNER','OWNER_UNVERIFIED','OWNER_DISPUTED','UNOBSERVED','IDENTITY_CONFLICT','OWNER_CONFLICT'],'ALL'),
  source:choice(raw.source,['ALL','GIT','PROTECTED','ORIGINAL_SAVED','CAPTURING','PENDING'],'ALL'),
  sort:choice(raw.sort,['fleet','name','account'],'fleet'),management:choice(raw.management,['ALL','MANAGED'],'ALL')};
}
export function normalizeColumns(raw){
 const rows=Array.isArray(raw)?raw:[],seen=new Set(),out=[];
 for(const row of [...rows,...COLUMN_IDS.map(id=>({id}))]){
  if(!COLUMN_IDS.includes(row?.id)||seen.has(row.id))continue;seen.add(row.id);
  out.push({id:row.id,visible:row.id==='generator'||row.visible!==false,
   width:Number.isInteger(row.width)&&row.width>=70&&row.width<=500?row.width:widths[row.id]});
 }
 return out;
}
export function normalizePresentation(raw={}){
 const seen=new Set(),views=[];
 for(const row of Array.isArray(raw?.views)?raw.views:[]){
  if(!/^[a-f0-9]{32}$/.test(row?.id||'')||seen.has(row.id)||typeof row.name!=='string'||row.name.trim().length<2)continue;
  seen.add(row.id);views.push({id:row.id,name:row.name.trim().slice(0,55),filters:normalizeFilters(row.filters),columns:normalizeColumns(row.columns)});
 }
 const panelWidths={};for(const route of ['overview','generators','work-queue','accounts','refresher','settings']){
  const n=raw?.panelWidths?.[route];if(Number.isInteger(n)&&n>=320&&n<=1200)panelWidths[route]=n;
 }
 return {schema:1,theme:choice(raw?.theme,['auto','light','dark'],'auto'),density:choice(raw?.density,['compact','comfortable'],'compact'),
  generator:{filters:normalizeFilters(raw?.generator?.filters),columns:normalizeColumns(raw?.generator?.columns)},views,panelWidths};
}
export function createPresentationPreferences(storage,{write}={}){
 let value=normalizePresentation(),loaded=false,tail=Promise.resolve();const listeners=new Set();
 const announce=()=>{for(const fn of listeners)fn(structuredClone(value))};
 async function load(){const row=(await storage.get(PRESENTATION_KEY))[PRESENTATION_KEY];
  if(row&&row.schema!==1)throw Error('PRESENTATION_VERSION_UNSUPPORTED');
  value=normalizePresentation(row);loaded=true;announce();return structuredClone(value)}
 function update(reduce){
  const task=tail.then(async()=>{
   if(!loaded)await load();const next=normalizePresentation(reduce(structuredClone(value)));
   if(JSON.stringify(next)===JSON.stringify(value))return structuredClone(value);
   let reply;
   try{reply=write?await write(next,structuredClone(value)):await storage.set({[PRESENTATION_KEY]:next})}catch{/* A lost reply is checked below. */}
   if(reply?.ok===false)throw Error(reply.code||'PRESENTATION_SAVE_UNCONFIRMED');
   const observed=(await storage.get(PRESENTATION_KEY))[PRESENTATION_KEY];
   if(JSON.stringify(observed)!==JSON.stringify(next))throw Error('PRESENTATION_SAVE_UNCONFIRMED');
   value=next;announce();return structuredClone(value);
  });tail=task.catch(()=>{});return task;
 }
 return Object.freeze({load,update,get:()=>structuredClone(value),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}});
}
