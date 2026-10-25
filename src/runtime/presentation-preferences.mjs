// Presentation only. No credential, permission, source or effect authority.
export const PRESENTATION_KEY='pcmsUiWorkspaceV1';
export const COLUMN_IDS=['generator','account','status','visibility','source'];
export const COLUMN_LABELS={generator:'Generator',account:'Account',status:'Status',visibility:'Visibility',source:'Source'};
const widths={generator:240,account:160,status:150,visibility:120,source:210};
const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
const text=(value,max,fallback='')=>typeof value==='string'?value.slice(0,max):fallback;
export function normalizeFilters(raw={}){
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 return {query:text(raw.query,80),account:text(raw.account,128,'ALL')||'ALL',
  filter:choice(raw.filter,['ALL','PUBLISHED','DEVELOPING','REVIEW','HELD'],'ALL'),
  owner:choice(raw.owner,['ALL','OBSERVED_OWNER','OWNER_UNVERIFIED','OWNER_DISPUTED','UNOBSERVED','IDENTITY_CONFLICT','OWNER_CONFLICT'],'ALL'),
  source:choice(raw.source,['ALL','GIT','PROTECTED','ORIGINAL_SAVED','CAPTURING','PENDING'],'ALL'),
  sort:choice(raw.sort,['fleet','name','account'],'fleet')};
}
export function normalizeColumns(raw){
 const rows=Array.isArray(raw)?raw:[],seen=new Set(),out=[];
 for(const row of [...rows,...COLUMN_IDS.map(id=>({id}))]){
  if(!COLUMN_IDS.includes(row?.id)||seen.has(row.id))continue;seen.add(row.id);
  out.push({id:row.id,visible:row.id==='generator'||row.visible!==false,
   width:Number.isInteger(row.width)&&row.width>=80&&row.width<=500?row.width:widths[row.id]});
 }
 return out;
}
export function normalizePresentation(raw={}){
 const seen=new Set(),views=[];
 for(const row of Array.isArray(raw?.views)?raw.views:[]){
  if(views.length===30)break;
  if(!/^[a-f0-9]{32}$/.test(row?.id||'')||seen.has(row.id)||typeof row.name!=='string'||row.name.trim().length<2)continue;
  seen.add(row.id);views.push({id:row.id,name:row.name.trim().slice(0,55),filters:normalizeFilters(row.filters),columns:normalizeColumns(row.columns)});
 }
 const panelWidths={};for(const route of ['overview','generators','work-queue','accounts','refresher','settings']){
  const n=raw?.panelWidths?.[route];if(Number.isInteger(n)&&n>=320&&n<=1200)panelWidths[route]=n;
 }
 return {schema:1,theme:choice(raw?.theme,['auto','light','dark'],'auto'),density:choice(raw?.density,['compact','comfortable'],'compact'),
  generator:{filters:normalizeFilters(raw?.generator?.filters),columns:normalizeColumns(raw?.generator?.columns)},views,panelWidths};
}
export function createPresentationPreferences(storage){
 let value=normalizePresentation(),loaded=false,tail=Promise.resolve();const listeners=new Set();
 const announce=()=>{for(const fn of listeners)fn(structuredClone(value))};
 async function load(){const row=(await storage.get(PRESENTATION_KEY))[PRESENTATION_KEY];
  if(row&&row.schema!==1)throw Error('PRESENTATION_VERSION_UNSUPPORTED');
  value=normalizePresentation(row);loaded=true;announce();return structuredClone(value)}
 function update(reduce){
  const task=tail.then(async()=>{
   if(!loaded)await load();const next=normalizePresentation(reduce(structuredClone(value)));
   if(JSON.stringify(next)===JSON.stringify(value))return structuredClone(value);
   try{await storage.set({[PRESENTATION_KEY]:next})}catch{/* A lost reply is checked below. */}
   const observed=(await storage.get(PRESENTATION_KEY))[PRESENTATION_KEY];
   if(JSON.stringify(observed)!==JSON.stringify(next))throw Error('PRESENTATION_SAVE_UNCONFIRMED');
   value=next;announce();return structuredClone(value);
  });tail=task.catch(()=>{});return task;
 }
 return Object.freeze({load,update,get:()=>structuredClone(value),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}});
}
