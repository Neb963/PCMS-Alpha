import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceMonitorIsolated} from '../src/runtime/perchance-monitor.mjs';

test('S07 T-08: a paginated, partial, duplicated or malformed recent page cannot prove absence',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'location');
  const originalFetch=globalThis.fetch;
  Object.defineProperty(globalThis,'location',{configurable:true,value:{origin:'https://perchance.org'}});
  const respond=(body)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  try{
    const base={status:'success',generators:[{name:'owned-a',views:1}]};
    globalThis.fetch=async()=>respond(base);
    assert.deepEqual((await perchanceMonitorIsolated({kind:'RECENT'})).items,[{slug:'owned-a',views:1}]);
    for(const marker of [{hasMore:true},{has_more:true},{nextCursor:'cursor'},
      {nextPage:2},{pagination:{hasNext:true}},{pagination:{hasMore:true}}]){
      globalThis.fetch=async()=>respond({...base,...marker});
      assert.equal((await perchanceMonitorIsolated({kind:'RECENT'})).code,'RECENT_INCOMPLETE');
    }
    globalThis.fetch=async()=>respond({...base,generators:[...base.generators,...base.generators]});
    assert.equal((await perchanceMonitorIsolated({kind:'RECENT'})).code,'RECENT_SCHEMA_UNVERIFIED');
  }finally{
    globalThis.fetch=originalFetch;
    if(descriptor)Object.defineProperty(globalThis,'location',descriptor);
    else delete globalThis.location;
  }
});
