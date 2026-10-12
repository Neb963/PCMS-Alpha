import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DESTINATIONS, invalidDestination, resolveDestination } from '../src/ui/routes.mjs';

const html = await readFile(new URL('../src/ui/index.html', import.meta.url), 'utf8');
const shell = await readFile(new URL('../src/ui/shell.mjs', import.meta.url), 'utf8');

test('exactly six unique navigable workspace targets', () => {
  assert.deepEqual(DESTINATIONS, ['overview','generators','work-queue','accounts','refresher','settings']);
  for (const id of DESTINATIONS) {
    assert.match(html, new RegExp(`href="#${id}" data-workspace="${id}"`));
    assert.match(html, new RegExp(`id="view-${id}" data-view="${id}"`));
    assert.match(html, new RegExp(`id="heading-${id}" tabindex="-1"`));
    assert.equal(resolveDestination(`#${id}`), id);
  }
});

test('unknown routes cannot cause action or navigation into non-I00 features', () => {
  for (const value of ['', '#', '#/other', '#not-in-scope', '#__proto__', '#settings/activate']) {
    assert.equal(resolveDestination(value), 'overview');
  }
  assert.equal(invalidDestination('#not-in-scope'), true);
  assert.equal(invalidDestination('#'), false);
});

test('cross-workspace links and accessible route changes are present', () => {
  assert.match(html, /aria-current="page"/);
  assert.match(html, /id="navigation-status"/);
  assert.match(html, /id="unknown-route"/);
  assert.match(shell, /addEventListener\('hashchange'/);
  assert.match(shell, /heading\.focus/);
});

test('new PCMS actions remain disabled, without network or browser mutation APIs', () => {
  assert.ok((html.match(/<button\b[^>]*\bdisabled\b/g) || []).length >= 3);
  for(const [id, reason] of [['generators','blocked-generators'],['work-queue','blocked-work-queue'],['refresher','blocked-refresher']]){
    assert.match(html, new RegExp(`aria-describedby="${reason}"`));
    assert.match(html, new RegExp(`id="${reason}"`));
  }
  assert.doesNotMatch(shell, /\b(?:browser|chrome|fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\s*\./);
  assert.match(html, /PersonaMonkey advanced controls/);
  assert.match(html, /I06 · Local supply receipts · Provider writes HELD/);
  assert.match(html, /Emergency redacted diagnostics/);
  assert.match(html, /id="pcms-enroll" disabled/);
  assert.match(html, /id="pcms-create-persona" disabled/);
  assert.match(html, /id="pcms-accounts-list"/);
  assert.match(html, /accounts-view\.mjs/);
  assert.match(html, /inventory-view\.mjs/);
  for (const name of ['Reserve generator','Start action','Start refresh'])
    assert.match(html, new RegExp('<button[^>]*disabled[^>]*>'+name+'</button>'));

});
