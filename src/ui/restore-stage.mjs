// I16 bounded cross-store stage runner. Never blind-replay a possible effect.
// Production adapters must be explicitly approved; the runner itself has no
// route, donor state-manager, cookie, Git or Perchance mutation authority.
import {RESTORE_GROUPS} from './restore-core.mjs';
const okHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const err=s=>{throw Error(s);};
export function createRestoreStageEngine(gate,{dispatch,readback}={}){
  const check=async ({epoch,revision,group,fingerprint,continuePrepared=false})=>{
    if(!RESTORE_GROUPS.includes(group)||!okHash(fingerprint))
      err('RESTORE_STAGE_INVALID');
    const s=await gate.read();
    if(!s?.active||s.epoch!==epoch||s.revision!==revision)
      err('RESTORE_STALE_GUARD');
    if(s.groups[group]&&!(continuePrepared&&s.protocol===2&&
       s.groups[group].status==='BEFORE_DISPATCH'&&s.groups[group].fingerprint===fingerprint))
      err('RESTORE_GROUP_ALREADY_STARTED');
    const index=RESTORE_GROUPS.indexOf(group);
    // An independently OBSERVED preceding group is required. No optimistic
    // overlap across donor, cookies and canonical persistence.
    for(let i=0;i<index;i++)
      if(s.groups[RESTORE_GROUPS[i]]?.status!=='OBSERVED')
        err('RESTORE_DEPENDENCY_HELD');
    return s;
  };
  const observe=async (row,group,step,fingerprint)=>{
    let proof;
    try{proof=await readback({group,step,fingerprint,epoch:row.epoch});}
    catch{proof=null;}
    if(proof?.source==='INDEPENDENT_READBACK'&&proof.digest===fingerprint){
      return gate.advance({epoch:row.epoch,revision:row.revision,group,step,
        status:'OBSERVED',observation:{source:'INDEPENDENT_READBACK',digest:fingerprint}});
    }
    return gate.advance({epoch:row.epoch,revision:row.revision,group,step,
      status:'HELD_UNCERTAIN'});
  };
  async function execute({epoch,revision,group,step,fingerprint,continuePrepared=false}){
    if(typeof dispatch!=='function'||typeof readback!=='function')
      err('RESTORE_ADAPTER_NOT_CONFIGURED');
    const prior=await check({epoch,revision,group,fingerprint,continuePrepared});
    const prepared=prior.groups[group]?.status==='BEFORE_DISPATCH'?prior:
      await gate.advance({epoch,revision,group,step,status:'BEFORE_DISPATCH',fingerprint});
    // Durable DISPATCH_POSSIBLE is a hard precondition to calling the adapter.
    const possible=await gate.advance({epoch,revision:prepared.revision,group,
      step,status:'DISPATCH_POSSIBLE'});
    try{await dispatch({group,step,fingerprint,epoch});}
    catch{/* lost reply != proof that no effect occurred */}
    const current=await gate.read();
    if(current?.epoch!==epoch||
       current.groups[group]?.status!=='DISPATCH_POSSIBLE'||
       current.groups[group]?.fingerprint!==fingerprint)
      err('RESTORE_STEP_CHANGED_DURING_DISPATCH');
    return observe(current,group,step,fingerprint);
  }
  async function reconcile({epoch,revision,group,step,fingerprint}){
    if(typeof readback!=='function')err('RESTORE_READBACK_UNAVAILABLE');
    if(!RESTORE_GROUPS.includes(group)||!okHash(fingerprint))
      err('RESTORE_STAGE_INVALID');
    const s=await gate.read();
    if(!s?.active||s.epoch!==epoch||s.revision!==revision)
      err('RESTORE_STALE_GUARD');
    const current=s.groups[group];
    if(!current||!['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(current.status)||
      current.step!==step)err('RESTORE_RECONCILIATION_NOT_REQUIRED');
    // Recovery is observe-only. Even a negative readback must never cause an
    // automatic repeat, since a delayed external write might still land.
    return observe(s,group,step,fingerprint);
  }
  return Object.freeze({execute,reconcile});
}
