// The Welcome window (src/ui/windows/welcome-window.js): its links must lead
// to sections the documentation windows have.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { pythonHelpEntries } from '../src/ui/python-docs.js';
import { helpEntries } from '../src/ui/widget-docs.js';

let welcome;

before(async () => {
  globalThis.window ??= globalThis;
  welcome = await import('../src/ui/windows/welcome-window.js');
});

test('every Welcome link names a section of its documentation window', () => {
  const sections = {
    python: new Set(pythonHelpEntries().map((e) => e.label)),
    widgets: new Set(helpEntries().map((e) => e.label)),
  };
  let count = 0;
  for (const [heading, links] of welcome.WELCOME_LINKS) {
    assert.ok(heading);
    for (const [label, which, section, blurb] of links) {
      assert.ok(label && blurb, label);
      assert.ok(sections[which], `${label}: unknown window '${which}'`);
      assert.ok(sections[which].has(section), `${label}: no section '${section}' in ${which}`);
      count += 1;
    }
  }
  assert.ok(count > 0);
});

test('Show at startup is on unless turned off, and is remembered', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.equal(welcome.showWelcomeAtStartup(), true);
  welcome.setShowWelcomeAtStartup(false);
  assert.equal(welcome.showWelcomeAtStartup(), false);
  welcome.setShowWelcomeAtStartup(true);
  assert.equal(welcome.showWelcomeAtStartup(), true);
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(welcome.showWelcomeAtStartup(), true);
  assert.doesNotThrow(() => welcome.setShowWelcomeAtStartup(false));
});
