// The FastBlips themes (src/ui/fastblips-themes.js) as --cr-* themes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, MENU_THEMES } from '../src/ui/theme.js';
import { themes, toMonacoTheme } from '../src/ui/fastblips-themes.js';

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

test('each FastBlips theme is a theme and is offered in Settings > Theme', () => {
  for (const theme of Object.values(themes)) {
    assert.ok(THEMES[theme.id], theme.id);
    assert.ok(MENU_THEMES.some(([name, label]) => name === theme.id && label === theme.label));
  }
});

test('a FastBlips theme defines every variable the light theme does', () => {
  // :root carries the light theme's values, so one left out would show through.
  for (const theme of Object.values(themes)) {
    const missing = Object.keys(THEMES.light).filter((name) => !(name in THEMES[theme.id]));
    assert.deepEqual(missing, [], theme.id);
  }
});

test('a FastBlips theme refers only to tokens the theme has', () => {
  for (const theme of Object.values(themes)) {
    const tokens = new Set(Object.keys(theme.ui).map(kebab));
    for (const [name, value] of Object.entries(THEMES[theme.id])) {
      for (const [, token] of value.matchAll(/var\(--fb-([a-z-]+)\)/g)) {
        assert.ok(tokens.has(token), `${theme.id} ${name}: --fb-${token}`);
      }
    }
  }
});

test('the Monaco theme is named after the theme and uses its colours', () => {
  for (const theme of Object.values(themes)) {
    assert.equal(THEMES[theme.id].monaco, theme.id);
    const monaco = toMonacoTheme(theme);
    assert.equal(monaco.base, theme.dark ? 'vs-dark' : 'vs');
    assert.equal(monaco.colors['editor.background'], theme.ui.surface);
  }
});
