import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachPcmsBackupDonor,waitForPcmsBackupDonor} from '../src/runtime/backup-auto-donor.mjs';
import {BACKUP_DONOR_PORT,createDonorSnapshotPortHandler} from '../src/runtime/backup-auto-boundary.mjs';

const api={runtime:{id:'persona-route-manager@local',
  getURL:path=>'moz-extension://s02-test/'+path}};
function port(sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')},
  name=BACKUP_DONOR_PORT){
  let notify,receive;
  const reply=new Promise(resolve=>receive=resolve);
  const value={name,sender,onMessage:{addListener(fn){notify=fn}},
    postMessage(result){receive(result)}};
  return {value,reply,send(msg){if(!notify)throw Error('PORT_LISTENER_MISSING');notify(msg)}};
}
test('S02 donor adapter waits for late signed donor initialization, no fallback',async()=>{
  const pending=waitForPcmsBackupDonor({timeoutMs:2500});
  const source={snapshot:async()=>({state:{schemaVersion:3},containers:[]}),
    cookies:async()=>[]};
  attachPcmsBackupDonor(source);
  assert.equal(await pending,await waitForPcmsBackupDonor());
  assert.deepEqual(await (await pending).snapshot(),
    {state:{schemaVersion:3},containers:[]});
  assert.throws(()=>attachPcmsBackupDonor(source),/BACKUP_DONOR_ALREADY_ATTACHED/);
});
test('S02 dedicated donor port is exact sender/single-purpose and returns real adapter state',async()=>{
  const receiver=createDonorSnapshotPortHandler(api),p=port();
  receiver(p.value);p.send({action:'SNAPSHOT'});
  const actual=await p.reply;
  assert.deepEqual(actual,{ok:true,state:{schemaVersion:3},containers:[]});
  const illegal=port({id:api.runtime.id,url:'https://perchance.org/'});
  receiver(illegal.value);
  assert.equal((await illegal.reply).code,'UNTRUSTED_SENDER');
  const invalid=port();receiver(invalid.value);
  invalid.send({action:'ANYTHING'});
  assert.equal((await invalid.reply).code,'BACKUP_COMMAND_SCHEMA');
});
test('S02 donor port does not promote absent or malformed adapter into recovered backup',async()=>{
  const receiver=createDonorSnapshotPortHandler(api,{
    wait:async()=>({snapshot:async()=>({state:null,containers:[]})})});
  const p=port();receiver(p.value);p.send({action:'SNAPSHOT'});
  assert.equal((await p.reply).code,'BACKUP_DONOR_UNAVAILABLE');
  const other=port();const denied=createDonorSnapshotPortHandler(api,{
    wait:async()=>{throw Error('PRIVATE_SECRET_IN_ERROR')}});
  denied(other.value);other.send({action:'SNAPSHOT'});
  assert.deepEqual(await other.reply,{ok:false,code:'BACKUP_DONOR_UNAVAILABLE'});
});
