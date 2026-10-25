// One bounded compare/readback loop for local Refresher policy choices.
// Unknown acknowledgments are read back, never blindly replayed.
export async function saveRefresherChoice({request,type,params,baseline,select,matches,query={}}){
 let current;
 for(let attempt=0;attempt<2;attempt++){
  try{current=await request('GET_REFRESHER',query)}catch{return {ok:false,code:'STATE_UNAVAILABLE'}}
  if(!current?.ok||!Number.isSafeInteger(current.revision))return {ok:false,code:current?.code||'STATE_UNAVAILABLE'};
  if(matches(current))return {ok:true,verified:true,snapshot:current};
  if(JSON.stringify(select(current))!==JSON.stringify(baseline))return {ok:false,code:'CHOICE_CHANGED',snapshot:current};
  let result;
  try{result=await request(type,{...params,expectedRevision:current.revision})}
  catch{result={ok:false,code:'ACK_UNKNOWN'}}
  if(result?.code==='STALE_REVISION'&&attempt===0)continue;
  // Readback also covers loss of the acknowledgment after a committed choice.
  let after;try{after=await request('GET_REFRESHER',query)}catch{}
  if(after?.ok&&matches(after))return {ok:true,verified:true,snapshot:after};
  return {ok:false,code:result?.ok?'READBACK_UNAVAILABLE':result?.code||'ACK_UNKNOWN',snapshot:after};
 }
 return {ok:false,code:'STALE_REVISION'};
}
export const observedAge=(at,now=Date.now())=>{
 if(!Number.isSafeInteger(at)||at<=0||at>now)return 'not observed';
 const m=Math.floor((now-at)/60000);return m<1?'just now':m<60?m+' min ago':m<1440?Math.floor(m/60)+' h ago':Math.floor(m/1440)+' d ago';
};
export function feedCoverage(recent,now=Date.now()){
 const x=recent?.latestOccupancy;
 if(!x||!Number.isSafeInteger(x.feedSize)||x.feedSize<0||!Number.isSafeInteger(x.ownedVisible)||x.ownedVisible<0||x.ownedVisible>x.feedSize)
  return {label:'Not measured',detail:'A complete recent-page observation is needed.',fresh:false};
 const fresh=recent.complete===true&&!recent.stale&&Number.isSafeInteger(x.at)&&x.at<=now&&now-x.at<=600000;
 return {label:x.ownedVisible+' / '+x.feedSize+(x.feedSize?' · '+(100*x.ownedVisible/x.feedSize).toFixed(1)+'%':' · empty page'),
  detail:(fresh?'Observed ':'Historical ')+observedAge(x.at,now)+' · '+(Number.isSafeInteger(x.ownedPublic)?x.ownedPublic+' owned public generators':'owned population unknown'),fresh};
}
export function placementText(row,now=Date.now()){
 const p=row.presence;
 if(!p||p.source!=='GUARDED_RECENT_LIST'||!Number.isSafeInteger(p.observedAt)||p.observedAt<=0||p.observedAt>now)return 'Not observed';
 const fresh=!p.stale;
 const label=p.present===true&&Number.isSafeInteger(p.position)&&p.position>0?'#'+p.position:p.present===false?'Absent':'Unknown';
 return (fresh?'':'Historical ')+label+' · '+observedAge(p.observedAt,now);
}
