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

test('operator workspaces expose guarded production actions without UI-origin network/route bypass', () => {
  assert.ok((html.match(/<button\b[^>]*\bdisabled\b/g) || []).length >= 3);
  // The Work Queue explains its read-only receipts; the former permanently
  // disabled "Start action" button was a dead control and stays removed.
  assert.match(html, /id="blocked-work-queue"/);
  assert.doesNotMatch(html, />Start action</);
  assert.doesNotMatch(shell, /\b(?:browser|chrome|fetch|XMLHttpRequest|WebSocket|navigator\.sendBeacon)\s*\./);
  assert.match(html, /PersonaMonkey advanced controls/);
  assert.match(html, /Operator dashboard · protected workflows/);
  assert.match(html,/id="pcms-supply-preview"/);
  assert.match(html,/id="pcms-supply-freeze" disabled/);
  assert.match(html, /Emergency redacted diagnostics/);
  assert.match(html, /id="pcms-add-account" disabled/);
  assert.doesNotMatch(html, /id="pcms-create-persona"|id="pcms-persona-picker"/);
  assert.match(html, /id="pcms-accounts-list"/);
  assert.match(html, /accounts-view\.mjs/);
  assert.match(html, /inventory-view\.mjs/);
  assert.match(html,/id="blocked-refresher"/);
  assert.match(html,/id="pcms-refresher-enable" type="checkbox"/);
  assert.match(html,/Source saves are OFF until explicitly enabled|source saves are OFF until explicitly enabled/i);
  assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>Reserve generator<\/button>/);
  assert.match(html,/id="pcms-s06-authority-enable" type="button" disabled/);

});
