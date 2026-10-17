// S02 protected PersonaMonkey read-only snapshot. Same-XPI port waits for
// signed donor bootstrap; never accept arbitrary source or route fallback.
export async function readProtectedDonorSnapshot(api){
  // Dedicated protected read-only port: unlike legacy GET_SNAPSHOT it can
  // await dynamic PersonaMonkey bootstrap without losing a response to an
  // earlier synchronous, intentionally undefined PCMS wake listener.
  return new Promise((resolve,reject)=>{
    let port,done=false;
    const finish=(data,error)=>{
      if(done)return;done=true;
      try{port?.disconnect();}catch{}
      if(error)reject(Error('BACKUP_DONOR_UNAVAILABLE'));
      else resolve(data);
    };
    try{
      port=api.runtime.connect({name:'pcms-s02-backup-donor-readonly'});
      port.onMessage.addListener(snapshot=>{
        if(snapshot?.ok!==true||!snapshot.state||
           !Array.isArray(snapshot.containers)||
           Object.keys(snapshot).some(k=>!['ok','state','containers',
             'security','mullvadNative','userScriptsGranted'].includes(k))){
          finish(null,true);return;
        }
        const extras=Object.fromEntries(['security','mullvadNative',
          'userScriptsGranted'].filter(k=>Object.hasOwn(snapshot,k))
            .map(k=>[k,snapshot[k]]));
        finish({state:snapshot.state,containers:snapshot.containers,
          ...extras},false);
      });
      port.onDisconnect.addListener(()=>finish(null,true));
      port.postMessage({action:'SNAPSHOT'});
    }catch{finish(null,true);}
  });
}
