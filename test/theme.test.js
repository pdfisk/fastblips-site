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

test('the editor themes: five, in the menu after Classic and Apple; Steampunk and Pokemon are gone', () => {
  const ids = ['graphite', 'midnight', 'ember', 'circuit', 'daylight'];
  assert.deepEqual(Object.keys(themes), ids);
  assert.deepEqual(MENU_THEMES.map(([name]) => name), ['classic', 'apple', ...ids]);
  for (const gone of ['steampunk', 'pokemon']) {
    assert.equal(THEMES[gone], undefined);
    assert.equal(themes[gone], undefined);
  }
  assert.deepEqual(Object.values(themes).filter((t) => !t.dark).map((t) => t.id), ['daylight']);
});

const NOT_COLOURS = ['shadow', 'radius', 'borderWidth', 'fontUi', 'fontMono'];

test('the editor themes share one set of tokens, with every colour written as #rrggbb', () => {
  const names = Object.keys(themes.graphite.ui);
  for (const theme of Object.values(themes)) {
    assert.deepEqual(Object.keys(theme.ui), names, theme.id);
    assert.deepEqual(Object.keys(theme.syntax), Object.keys(themes.graphite.syntax), theme.id);
    const colours = [...Object.entries(theme.ui).filter(([k]) => !NOT_COLOURS.includes(k)), ...Object.entries(theme.syntax)];
    for (const [name, value] of colours) assert.match(value, /^#[0-9a-f]{6}$/, `${theme.id} ${name}`);   // toMonacoTheme needs the hex
  }
});

/** The WCAG contrast ratio of two #rrggbb colours. */
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('text can be read on what it sits on in every editor theme (a contrast of 4.5 or more)', () => {
  for (const { id, ui, syntax } of Object.values(themes)) {
    const pairs = [
      ['text', 'surface'], ['text', 'panel'], ['text', 'selection'], ['titleText', 'titleBar'],
      ['buttonText', 'button'], ['buttonText', 'buttonHover'], ['text', 'buttonHover'],
      ['accentText', 'accent'], ['accentText', 'accentHover'], ['accentText', 'danger'],
    ];
    for (const [fg, bg] of pairs) {
      assert.ok(contrast(ui[fg], ui[bg]) >= 4.5, `${id}: ${fg} on ${bg} is ${contrast(ui[fg], ui[bg]).toFixed(2)}`);
    }
    assert.ok(contrast(ui.textMuted, ui.panel) >= 3, `${id}: textMuted on panel is ${contrast(ui.textMuted, ui.panel).toFixed(2)}`);
    for (const [token, colour] of Object.entries(syntax)) {
      assert.ok(contrast(colour, ui.surface) >= 3, `${id}: syntax ${token} is ${contrast(colour, ui.surface).toFixed(2)}`);
    }
  }
});
