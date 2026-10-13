import test from 'node:test';
import assert from 'node:assert/strict';
import {planAiStep} from '../src/runtime/ai-supervisor.mjs';
// Independent fake remote is NOT canonical PCMS state and is never passed as
// trusted proof to production. It exists to demonstrate that page/session
// observations cannot distinguish accepted effects from lost acknowledgments.
const F='a'.repeat(64),S1='1'.repeat(64),S2='2'.repeat(64);
class RemoteLedger {
  constructor(){this.history=[];this.sessions=new Map();this.workspaces=new Map();}
  dispatchSend(sid,{dropAck=false,reuseWorkspace=false}={}){
    const workspace=reuseWorkspace?'shared':sid;
    this.sessions.set(sid,{open:true,workspace});
    this.workspaces.set(workspace, {owner:sid,files:new Set(['main.pjs'])});
    this.history.push({effect:'SEND_ACCEPTED',sid,workspace});
    return dropAck?null:{ok:true,sid};
  }
  end(sid,{dropAck=false,accept=false}={}){
    if(accept){this.sessions.get(sid).open=false;this.history.push({effect:'END_ACCEPTED',sid});}
    else this.history.push({effect:'END_LOST',sid});
    return dropAck?null:{ok:accept};
  }
  write(sid,path){
    const row=this.sessions.get(sid),workspace=this.workspaces.get(row.workspace);
    workspace.files.add(path);this.history.push({effect:'WRITE_ACCEPTED',sid,path});
  }
  isolated(first,second){
    const a=this.sessions.get(first),b=this.sessions.get(second);
    return !!a&&!a.open&&!!b&&b.open&&a.workspace!==b.workspace;
  }
}
const job=(native)=>({slug:'fake-owned',revision:2,state:'HELD_RECONCILE',
  sourceFingerprint:F,prompt:{revision:2,tests:['default_generator_smoke']},
  chat1:{sessionDigest:S1,tests:{}},
  chat2:{state:'FRESH_OBSERVED',sessionDigest:S2,tests:{}},
  native,optionalTesting:{tests:['default_generator_smoke']},
  finalSource:{fingerprint:F},executionSlotReleased:false});
test('P52-06 X: accepted Send/lost ACK never selects a second Send',()=>{
  const remote=new RemoteLedger();remote.dispatchSend(S1,{dropAck:true});
  const p=planAiStep(job({state:'DISPATCH_POSSIBLE',step:'CHAT1_SEND'}));
  assert.equal(p.type,'PROBE_NATIVE');
  assert.equal(remote.history.filter(x=>x.effect==='SEND_ACCEPTED').length,1);
  // New tab and lost local state are insufficient to authorize replay.
  assert.equal(p.step,undefined);
});
test('P52-06 X: a failed prior end and distinct next SID can share one OPFS workspace',()=>{
  const r=new RemoteLedger();
  r.dispatchSend(S1);r.write(S1,'scratch/stale-secret.dat');
  r.end(S1,{dropAck:true,accept:false});
  r.dispatchSend(S2,{reuseWorkspace:true});
  assert.equal(r.isolated(S1,S2),false);
  assert.equal(r.sessions.get(S1).open,true);
  assert.equal(planAiStep(job({state:'CHAT2_OBSERVED_IDLE',
    sessionDigest:S2})).code,'AI_CHAT2_ISOLATION_UNVERIFIED');
});
test('P52-06 X: end accepted without ACK and genuine separate workspace also stays held',()=>{
  const r=new RemoteLedger();
  r.dispatchSend(S1);r.end(S1,{dropAck:true,accept:true});
  r.dispatchSend(S2);
  assert.equal(r.isolated(S1,S2),true);
  // This independent oracle is available ONLY to the fake: the deployed
  // extension cannot infer these server facts from a native chat transcript.
  assert.equal(planAiStep(job({state:'CHAT2_OBSERVED_IDLE',
    sessionDigest:S2})).code,'AI_CHAT2_ISOLATION_UNVERIFIED');
});
test('P52-06 X: cancelled native new-chat modal cannot authorize Chat2 Send',()=>{
  const r=new RemoteLedger();r.dispatchSend(S1);
  // No end request and no reset because the human dismissed confirmation.
  const uncertain=job({state:'DISPATCH_POSSIBLE',step:'CHAT2_RESET'});
  const action=planAiStep(uncertain);
  assert.equal(action.type,'PROBE_NATIVE');
  assert.equal(r.history.length,1);
  assert.equal(r.isolated(S1,S2),false);
});
