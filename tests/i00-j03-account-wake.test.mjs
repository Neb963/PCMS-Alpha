import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountBoundary,ROUTE_UPKEEP_ALARM} from '../src/runtime/account-boundary.mjs';

test('account upkeep retains its scheduled wake across event-page controllers and startup',async()=>{
 const listeners=[],created=[];let saved=null;
 const api={storage:{local:{get:async()=>({})}},runtime:{onConnect:{addListener(){}},onStartup:{addListener:fn=>listeners.push(fn)}},
  alarms:{get:async name=>{assert.equal(name,ROUTE_UPKEEP_ALARM);return saved;},create:async(name,options)=>{created.push({name,options});saved={name,scheduledTime:9000};},onAlarm:{addListener(){}}}};
 createAccountBoundary(api).register();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created.length,1);assert.equal(created[0].options.delayInMinutes,1);assert.equal(created[0].options.periodInMinutes,10);
 const original=saved;
 createAccountBoundary(api).register();await new Promise(resolve=>setImmediate(resolve));
 listeners.at(-1)();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created.length,1,'a background wake must not postpone the existing renewal deadline');assert.equal(saved,original);
});
