// Deterministic IndexedDB subset (get/put/add/openCursor) with staged writes
// that become visible only on transaction completion, and readwrite
// transactions serialized like real IndexedDB. The committed Map is the
// independent oracle: tests read it directly, never through modules.
export function fakeDatabase(){
  const stores=new Map(),commits=[];
  let abortNext=false,autoKey=0,lock=Promise.resolve();
  const store=name=>{if(!stores.has(name))stores.set(name,new Map());return stores.get(name);};
  function transaction(_names,mode){
    const pending=new Map();let requests=0,closed=false,release=()=>{};
    const started=mode==='readwrite'?lock:Promise.resolve();
    if(mode==='readwrite')lock=new Promise(r=>{release=r;});
    const later=fn=>started.then(()=>setImmediate(fn));
    const tx={oncomplete:null,onabort:null,onerror:null,
      abort(){if(closed)return;closed=true;release();setImmediate(()=>tx.onabort?.());}};
    const finish=()=>{
      if(requests||closed)return;
      setImmediate(()=>{
        if(requests||closed)return;
        closed=true;
        if(abortNext&&pending.size){abortNext=false;release();tx.onabort?.();return;}
        for(const {s,k,v} of pending.values())store(s).set(k,structuredClone(v));
        if(pending.size)commits.push({mode,keys:[...pending.keys()]});
        release();
        tx.oncomplete?.();
      });
    };
    const view=s=>{
      const merged=new Map(store(s));
      for(const p of pending.values())if(p.s===s)merged.set(p.k,p.v);
      return merged;
    };
    const stage=(s,k,value)=>{
      if(mode==='readonly')throw Error('readonly');
      pending.set(s+':'+k,{s,k,v:structuredClone(value)});
    };
    tx.objectStore=s=>({
      get(key){
        requests++;const req={result:undefined,onsuccess:null,onerror:null};
        later(()=>{req.result=structuredClone(view(s).get(key));requests--;
          req.onsuccess?.({target:req});finish();});
        return req;
      },
      put(value){stage(s,value.key??value.id??value.operationId,value);},
      // Match the real canonical operations keyPath as well as meta.key.
      add(value){stage(s,typeof value?.key==='string'?value.key:
        s==='operations'&&typeof value?.operationId==='string'?value.operationId:
        'auto'+String(++autoKey).padStart(8,'0'),value);},
      openCursor(){
        requests++;const req={onsuccess:null};
        let rows=null,i=0;
        const step=()=>setImmediate(()=>{
          rows??=[...view(s).entries()].sort(([a],[b])=>String(a).localeCompare(String(b)));
          requests--;
          if(i>=rows.length){req.onsuccess?.({target:{result:null}});finish();return;}
          const [key,value]=rows[i++];
          let continued=false;
          req.onsuccess?.({target:{result:{key,value:structuredClone(value),continue(){
            if(continued||closed)throw Error('TransactionInactiveOrCursorAdvanced');
            continued=true;requests++;step();
          }}}});
          // A cursor request completes even if its consumer stops reading.
          // Later continuation is legal while another IDB request keeps the
          // transaction alive, just as in Firefox.
          finish();
        });
        started.then(step);return req;
      }
    });
    started.then(()=>setImmediate(finish));
    return tx;
  }
  return {transaction,commits,read:(s,k)=>structuredClone(store(s).get(k)),
    keys:s=>[...store(s).keys()],failNextCommit(){abortNext=true;},addEventListener(){}};
}
