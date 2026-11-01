// The widget documentation (src/ui/widget-docs.js) and the window that shows
// it (windows/widget-help-window.js, Help > Widget Documentation).

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_CLASSES, COMMON_METHODS } from '../src/vm/runtime/widgets.js';
import {
  WIDGET_DOCS, COMMON_GROUPS, WIDGET_NAMES, kindName, signature,
  describeWidget, describeCommon, describeAll, helpEntries,
} from '../src/ui/widget-docs.js';

const classNamed = (name) => WIDGET_CLASSES.find((c) => c.name === name);
const methodNamed = (cls, name) => classNamed(cls).methods.find((m) => m.name === name);

test('every widget class has a description, and nothing else does', () => {
  const names = WIDGET_CLASSES.map((c) => c.name);
  for (const name of names) assert.ok(WIDGET_DOCS[name]?.trim(), `${name} has no description in WIDGET_DOCS`);
  assert.deepEqual(Object.keys(WIDGET_DOCS).sort(), [...names].sort());
});

test('every method every widget has is described in exactly one group', () => {
  const grouped = COMMON_GROUPS.flatMap(([, , names]) => names);
  assert.deepEqual([...grouped].sort(), COMMON_METHODS.map((m) => m.name).sort());
  assert.equal(new Set(grouped).size, grouped.length, 'a method is in two groups');
  for (const [title, text] of COMMON_GROUPS) assert.ok(title && text.trim(), title);
});

test('arguments and results are written as BlipPy writes them', () => {
  assert.equal(signature(methodNamed('Label', 'setWidth')), 'set_width(size)');
  assert.equal(signature(methodNamed('Label', 'getText')), 'get_text() -> str');
  assert.equal(signature(methodNamed('Label', 'setBounds')), 'set_bounds(int, int, size, size)');
  assert.equal(signature(methodNamed('ListPanel', 'onSelect')), 'on_select(function(widget, int))');
  assert.equal(signature(methodNamed('Label', 'findByClass')), 'find_by_class(class) -> list of widgets');
  assert.equal(signature(methodNamed('Window', 'getButtonBar')), 'get_button_bar() -> widget');
  assert.equal(kindName('handler:int:int'), 'function(widget, int, int)');
  assert.equal(kindName('handler'), 'function(widget)');
  assert.equal(signature(methodNamed('Canvas', 'getMouseX')), 'get_mouse_x() -> int');
  assert.equal(signature(methodNamed('Physics', 'getVx')), 'get_vx(int) -> float');
});

test('a class\'s text has its name, constructor and every method of its own', () => {
  for (const cls of WIDGET_CLASSES) {
    const text = describeWidget(cls.name);
    assert.ok(text.startsWith(`${cls.name}\n${'='.repeat(cls.name.length)}\n`), cls.name);
    assert.ok(text.includes(`\nMake it\n  ${cls.name}(${cls.params.map(kindName).join(', ')})\n`), cls.name);
    for (const m of cls.own) assert.ok(text.includes(`\n  ${signature(m)}\n`) || text.endsWith(`\n  ${signature(m)}`), `${cls.name}.${m.name}`);
  }
  assert.match(describeWidget('Label'), /It also has the common methods of every widget/);
  // The Board and the Canvas have none of the common methods, and say nothing of them
  assert.doesNotMatch(describeWidget('Board'), /common methods/);
  assert.doesNotMatch(describeWidget('Canvas'), /set_left/);
  // the Viewport has only the find methods, listed with its own
  const viewport = describeWidget('Viewport');
  assert.match(viewport, /\n {2}find_by_id\(str\) -> widget\n/);
  assert.doesNotMatch(viewport, /set_left/);
  assert.throws(() => describeWidget('Nope'), /there is no widget class 'Nope'/);
});

test('the common methods are listed once, in their groups', () => {
  const text = describeCommon();
  for (const [title] of COMMON_GROUPS) assert.ok(text.includes(`\n${title}\n${'-'.repeat(title.length)}\n`), title);
  for (const m of COMMON_METHODS) assert.ok(text.includes(`  ${signature(m)}\n`) || text.endsWith(`  ${signature(m)}`), m.name);
  assert.equal(text.split('  set_margin(size)').length, 2);
});

test('the help entries are All widgets, Common methods, then every class A to Z', () => {
  const entries = helpEntries();
  assert.deepEqual(entries.slice(0, 2).map((e) => e.label), ['All widgets', 'Common methods']);
  assert.deepEqual(entries.slice(2).map((e) => e.label), WIDGET_NAMES);
  assert.equal(entries.length, 2 + WIDGET_CLASSES.length);
  assert.deepEqual([...WIDGET_NAMES], [...WIDGET_NAMES].sort((a, b) => a.localeCompare(b)));
  const all = describeAll();
  for (const e of entries.slice(1)) assert.ok(all.includes(e.text), e.label);
  assert.match(all, /^Widgets\n=======\nEvery widget a program can make/);
  assert.ok(WIDGET_NAMES.includes('Composite') && WIDGET_NAMES.includes('Stack') && WIDGET_NAMES.includes('Image'));
});

test('the descriptions name only methods that exist', () => {
  const real = new Set(WIDGET_CLASSES.flatMap((c) => c.methods.map((m) => m.py)));
  const prose = [...Object.values(WIDGET_DOCS), ...COMMON_GROUPS.map(([, text]) => text)].join('\n');
  const named = prose.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [];
  const unknown = [...new Set(named)].filter((n) => !real.has(n));
  assert.deepEqual(unknown, []);
});

// ---- the window --------------------------------------------------------------

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.textContent = '';
    this.value = '';
    const names = new Set();
    this.classList = {
      add: (n) => names.add(n), contains: (n) => names.has(n), remove: (n) => names.delete(n),
      toggle: (n, on) => (on ? names.add(n) : names.delete(n)),
    };
  }
  appendChild(c) { this.children.push(c); return c; }
  append(...c) { this.children.push(...c); }
  prepend(...c) { this.children.unshift(...c); }
  replaceChildren(...c) { this.children = c; }
  contains(o) { return o === this || this.children.some((c) => c.contains?.(o)); }
  remove() {}
  setAttribute() {}
  removeAttribute() {}
  getAttribute() { return null; }
  querySelector() { return null; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; }
  setPointerCapture() {}
  focus() {}
  scrollIntoView() {}
}

let WidgetHelpWindow;

before(async () => {
  const html = new FakeElement('html');
  html.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
  globalThis.window = globalThis;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
    body: new FakeElement('body'),
    documentElement: html,
    addEventListener() {},
  };
  ({ WidgetHelpWindow } = await import('../src/ui/windows/widget-help-window.js'));
});

test('the Widget Documentation window: a list of entries and the text of the one chosen', () => {
  const win = WidgetHelpWindow.instance;
  assert.equal(WidgetHelpWindow.instance, win, 'a singleton');
  assert.throws(() => new WidgetHelpWindow(), /singleton/);
  assert.equal(win.title, 'Widget Documentation');
  assert.equal(win.listPanel.items.length, 2 + WIDGET_CLASSES.length);
  assert.equal(win.selectedEntry.label, 'All widgets');
  assert.equal(win.textPanel.text, describeAll());
  assert.equal(win.textPanel.readOnly, true);

  assert.equal(win.show('Image'), true);
  assert.equal(win.selectedEntry.label, 'Image');
  assert.equal(win.textPanel.text, describeWidget('Image'));
  win.listPanel.select(win.listPanel.items.findIndex((i) => i.label === 'Common methods'));
  assert.equal(win.textPanel.text, describeCommon());
  assert.equal(win.show('Nope'), false);
  assert.equal(win.selectedEntry.label, 'Common methods');
});
