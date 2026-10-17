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
           Object.keys(snapshot).sort().join(',')!=='containers,ok,state'){
          finish(null,true);return;
        }
        finish({state:snapshot.state,containers:snapshot.containers},false);
      });
      port.onDisconnect.addListener(()=>finish(null,true));
      port.postMessage({action:'SNAPSHOT'});
    }catch{finish(null,true);}
  });
}
