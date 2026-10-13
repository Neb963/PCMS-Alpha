// Fixed I12 ISOLATED-world read-only executor. Historical Discovery v3:
// GET /api/getGeneratorList => success.generators[{name,views,...}], recent-first.
// Current schema/meaning still needs separately authorized activation evidence.
export async function perchanceMonitorIsolated(request){
  const no=code=>({ok:false,code});
  const name=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
  if(globalThis.location?.origin!=='https://perchance.org')return no('WRONG_ORIGIN');
  if(!request||!['RECENT','STATISTIC'].includes(request.kind)||
    Object.keys(request).some(k=>!['kind','slug'].includes(k))||
    (request.kind==='STATISTIC'&&!name(request.slug))||
    (request.kind==='RECENT'&&request.slug!=null))return no('MONITOR_REQUEST_INVALID');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
    const url=request.kind==='RECENT'?'https://perchance.org/api/getGeneratorList':
      'https://perchance.org/api/getDynamicMetaData?__generatorName='+encodeURIComponent(request.slug);
    const response=await fetch(url,{method:'GET',credentials:'same-origin',
      redirect:'error',cache:'no-store',signal:controller.signal});
    if(response.status===429){
      const retry=Number(response.headers.get('retry-after'));
      return {ok:false,code:'RATE_LIMITED',retryAfterMs:Number.isFinite(retry)&&retry>=0?
        Math.min(86400000,retry*1000):600000};
    }
    if([502,503,504].includes(response.status))return no('PROVIDER_UNAVAILABLE');
    if(response.status!==200)return no('MONITOR_HTTP_UNVERIFIED');
    if(!response.headers.get('content-type')?.includes('json'))return no('MONITOR_SCHEMA_UNVERIFIED');
    // Bound actual streamed bytes, not just the optional Content-Length.
    const reader=response.body?.getReader();
    if(!reader)return no('MONITOR_BODY_UNAVAILABLE');
    const decoder=new TextDecoder(),parts=[];let bytes=0;
    try{
      while(true){
        const chunk=await reader.read();if(chunk.done)break;
        bytes+=chunk.value.byteLength;
        if(bytes>1048576){await reader.cancel();return no('MONITOR_RESPONSE_LIMIT');}
        parts.push(decoder.decode(chunk.value,{stream:true}));
      }
      parts.push(decoder.decode());
    }finally{reader.releaseLock();}
    const payload=JSON.parse(parts.join(''));
    if(!payload||payload.status!=='success')return no('MONITOR_SCHEMA_UNVERIFIED');
    if(request.kind==='STATISTIC'){
      if(!Number.isSafeInteger(payload.views)||payload.views<0)
        return no('STATISTIC_SCHEMA_UNVERIFIED');
      return {ok:true,views:payload.views,unit:'VIEWS',source:'GUARDED_READ_ONLY'};
    }
    if(!Array.isArray(payload.generators)||payload.generators.length>5000)
      return no('RECENT_SCHEMA_UNVERIFIED');
    const seen=new Set(),items=[];
    for(const item of payload.generators){
      if(!name(item?.name)||seen.has(item.name)||
        !Number.isSafeInteger(item.views)||item.views<0)return no('RECENT_SCHEMA_UNVERIFIED');
      seen.add(item.name);items.push({slug:item.name,views:item.views});
    }
    return {ok:true,complete:true,items};
  }catch{return no('MONITOR_READ_UNAVAILABLE');}
  finally{clearTimeout(timer);}
}
