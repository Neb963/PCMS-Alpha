import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';

// A04 red reproductions: the previous UI rejects 101 slugs and the canonical
// store has no durable batch receipt, so closing the dashboard loses intake.
test('A04 RED: creator must not impose a 100-generator product cap',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/slugs\.length\s*>\s*100/);
});
test('A04 RED: batch manifest must be durable before acknowledging intake',()=>{
 const store=createCoordinatorStore(fakeDatabase());
 assert.equal(typeof store.beginBatch,'function');
 assert.equal(typeof store.appendBatch,'function');
 assert.equal(typeof store.finalizeBatch,'function');
 assert.equal(typeof store.processBatch,'function');
 assert.equal(typeof store.getBatch,'function');
});
