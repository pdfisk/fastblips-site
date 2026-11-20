// The start menu of apps and games (src/ui/start-menu.js): group order by
// device, and the remembered "Show at startup" setting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startMenuSections, loadStartMenu, isMobileCategory,
  showStartMenuAtStartup, setShowStartMenuAtStartup,
} from '../src/ui/start-menu.js';

const PROJECTS = [
  { id: 1, name: 'Racer', category: 'mobile-game' },
  { id: 2, name: 'Chess', category: 'desktop-game' },
  { id: 3, name: 'Notes', category: 'mobile-app' },
  { id: 4, name: 'Paint', category: 'desktop-app' },
  { id: 5, name: 'Scratch', category: 'development' },
  { id: 6, name: 'Old' },   // no category: Development
];

test('a desktop lists desktop games first', () => {
  const sections = startMenuSections(PROJECTS, false);
  assert.deepEqual(sections.map((s) => s.label), ['Desktop Games', 'Desktop Apps', 'Mobile Games', 'Mobile Apps']);
  assert.deepEqual(sections[0].projects.map((p) => p.name), ['Chess']);
});

test('a phone lists mobile games first', () => {
  const sections = startMenuSections(PROJECTS, true);
  assert.deepEqual(sections.map((s) => s.category), ['mobile-game', 'mobile-app', 'desktop-game', 'desktop-app']);
});

test('development projects and empty groups are left out', () => {
  const sections = startMenuSections([PROJECTS[0], PROJECTS[4], PROJECTS[5]], false);
  assert.deepEqual(sections.map((s) => s.label), ['Mobile Games']);
  assert.deepEqual(startMenuSections([], true), []);
});

test('loadStartMenu reads only shared projects with scripts', async () => {
  const store = { list: async () => [
    { id: 1, name: 'Racer', shared: true, category: 'mobile-game', scripts: [{ id: 1 }] },
    { id: 2, name: 'Private', shared: false, category: 'mobile-game', scripts: [{ id: 1 }] },
    { id: 3, name: 'Empty', shared: true, category: 'desktop-game', scripts: [] },
    { id: 4, name: 'Chess', shared: true, category: 'desktop-game', scripts: [{ id: 2 }] },
  ] };
  const sections = await loadStartMenu({ mobile: true, store });
  assert.deepEqual(sections.map((s) => [s.label, s.projects.map((p) => p.name)]),
    [['Mobile Games', ['Racer']], ['Desktop Games', ['Chess']]]);
});

test('mobile categories run in a phone-sized window', () => {
  assert.equal(isMobileCategory('mobile-game'), true);
  assert.equal(isMobileCategory('mobile-app'), true);
  assert.equal(isMobileCategory('desktop-game'), false);
});

test('Show at startup is on unless turned off, and is remembered', () => {
  const saved = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(showStartMenuAtStartup(), true);
  setShowStartMenuAtStartup(false);
  assert.equal(showStartMenuAtStartup(), false);
  setShowStartMenuAtStartup(true);
  assert.equal(showStartMenuAtStartup(), true);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(showStartMenuAtStartup(), true);
  assert.doesNotThrow(() => setShowStartMenuAtStartup(false));
  globalThis.localStorage = saved;
});
