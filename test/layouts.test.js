// Composite, Stack and the layout managers (src/ui/layouts), run against a
// small stand-in for the DOM: just the parts of document and its elements
// the widgets use. Each test sets a container's size, gives its children the
// sizes they ask for and checks the boxes the layout puts them in.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    const names = new Set();
    this.classList = { add: (n) => names.add(n), contains: (n) => names.has(n) };
  }
  appendChild(child) { this.children.push(child); return child; }
  remove() {}
  setAttribute() {}
}

let Widget, Composite, Stack, layouts;

/** A widget of a size: what it asks for in a row, column or cell. */
function box(width, height) {
  class Box extends Widget {}
  const w = new Box();
  w.preferredWidth = () => width;
  w.preferredHeight = () => height;
  return w;
}

/** A Composite of a layout, as big as given, holding kids (each a widget, or [widget, layout props]). */
function composite(layout, width, height, kids = []) {
  const c = new Composite({ layout });
  c.setBounds(0, 0, width, height);
  for (const kid of kids) {
    const [w, props] = Array.isArray(kid) ? kid : [kid];
    if (props) w.layoutProps = props;
    c.add(w);
  }
  c.layout();
  return c;
}

const at = (w) => [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height];

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ Widget } = await import('../src/ui/widgets/widget.js'));
  ({ Composite } = await import('../src/ui/widgets/composite.js'));
  ({ Stack } = await import('../src/ui/widgets/stack.js'));
  layouts = await import('../src/ui/layouts/index.js');
});

test('the layouts are qooxdoo\'s, by name', () => {
  assert.deepEqual(layouts.LAYOUT_NAMES, ['basic', 'canvas', 'dock', 'flow', 'grid', 'grow', 'hbox', 'vbox']);
  assert.equal(layouts.makeLayout('HBox').kind, 'hbox');
  assert.throws(() => layouts.makeLayout('atom'), /there is no layout 'atom'; the layouts are basic, canvas/);
});

test('Composite: a basic layout by default, and the layout can be changed', () => {
  const c = new Composite();
  assert.equal(c.layoutName, 'basic');
  c.layoutManager = 'GRID';
  assert.equal(c.layoutName, 'grid');
  assert.throws(() => { c.layoutManager = 'nope'; }, /there is no layout/);
});

test('basic: children sit where their box says, inside the padding, or fill the area', () => {
  const a = box(1, 1);
  a.box = [5, 6, 50, 20];
  const b = box(1, 1);
  b.fillParent = true;
  const c = new Composite();
  c.setBounds(0, 0, 300, 200);
  c.padding = 10;
  c.add(a);
  c.add(b);
  c.layout();
  assert.deepEqual(at(a), [15, 16, 50, 20]);
  assert.deepEqual(at(b), [10, 10, 280, 180]);
});

test('grow: every child fills the area inside the padding', () => {
  const a = box(1, 1);
  const c = new Composite({ layout: 'grow' });
  c.setBounds(0, 0, 100, 80);
  c.padding = [5, 10, 15, 20];
  c.add(a);
  c.layout();
  assert.deepEqual(at(a), [20, 5, 70, 60]);
});

test('hbox: fixed, flex and natural widths; children fill the height', () => {
  const a = box(1, 1);
  a.fixedWidth = 50;
  const b = box(1, 1);
  b.flex = 1;
  const c2 = box(1, 1);
  c2.flex = 2;
  const d = box(40, 1);
  const c = composite('hbox', 300, 100, [a, b, c2, d]);
  c.layoutManager.set('spacing', 10);
  c.layout();
  assert.deepEqual(at(a), [0, 0, 50, 100]);
  assert.deepEqual(at(b), [60, 0, 60, 100]);
  assert.deepEqual(at(c2), [130, 0, 120, 100]);
  assert.deepEqual(at(d), [260, 0, 40, 100]);
});

test('hbox: the group can sit at the right or in the middle, and be reversed; a child can align across', () => {
  const a = box(50, 20);
  const b = box(50, 20);
  const c = composite('hbox', 300, 100, [a, b]);
  c.layoutManager.set('spacing', 10);
  c.layoutManager.set('alignX', 'center');
  c.layout();
  assert.deepEqual([a.bounds.x, b.bounds.x], [95, 155]);
  c.layoutManager.set('alignX', 'right');
  c.layout();
  assert.deepEqual([a.bounds.x, b.bounds.x], [190, 250]);
  c.layoutManager.set('alignX', 'left');
  c.layoutManager.set('reversed', true);
  c.layout();
  assert.deepEqual([b.bounds.x, a.bounds.x], [0, 60]);
  a.layoutProps = { alignY: 'bottom' };
  b.layoutProps = { alignY: 'middle' };
  c.layout();
  assert.deepEqual([a.bounds.y, a.bounds.height, b.bounds.y, b.bounds.height], [80, 20, 40, 20]);
});

test('hbox: a margin is part of a child\'s box', () => {
  const a = box(40, 20);
  a.margin = 5;
  const b = box(40, 20);
  composite('hbox', 300, 100, [a, b]);
  assert.deepEqual(at(a), [0, 0, 50, 100]);
  assert.deepEqual(at(b), [50, 0, 40, 100]);
});

test('vbox: the same down a column; children fill the width, or align across', () => {
  const a = box(1, 30);
  const flexible = box(1, 1);
  flexible.flex = 1;
  const b = box(40, 30);
  b.layoutProps = { alignX: 'center' };
  const c = composite('vbox', 100, 300, [a, flexible, b]);
  c.layoutManager.set('spacing', 5);
  c.layout();
  assert.deepEqual(at(a), [0, 0, 100, 30]);
  assert.deepEqual(at(flexible), [0, 35, 100, 230]);
  assert.deepEqual(at(b), [30, 270, 40, 30]);
});

test('vbox: alignY puts the group at the bottom', () => {
  const a = box(1, 40);
  const c = composite('vbox', 100, 100, [a]);
  c.layoutManager.set('alignY', 'bottom');
  c.layout();
  assert.deepEqual(at(a), [0, 60, 100, 40]);
  assert.throws(() => c.layoutManager.set('alignX', 'left'), /vbox layout has no alignX/);
});

test('dock: edges in order, the middle gets what is left', () => {
  const north = box(1, 20);
  const south = box(1, 30);
  const west = box(50, 1);
  const east = box(40, 1);
  const middle = box(1, 1);
  const c = composite('dock', 300, 200, [
    [middle, {}], [north, { edge: 'north' }], [south, { edge: 'south' }],
    [west, { edge: 'west' }], [east, { edge: 'east' }],
  ]);
  assert.deepEqual(at(north), [0, 0, 300, 20]);
  assert.deepEqual(at(south), [0, 170, 300, 30]);
  assert.deepEqual(at(west), [0, 20, 50, 150]);
  assert.deepEqual(at(east), [260, 20, 40, 150]);
  assert.deepEqual(at(middle), [50, 20, 210, 150]);
  c.layoutManager.set('spacingX', 4);
  c.layoutManager.set('spacingY', 2);
  c.layout();
  assert.deepEqual(at(west), [0, 22, 50, 146]);
  assert.deepEqual(at(middle), [54, 22, 202, 146]);
});

test('flow: children wrap onto new lines', () => {
  const k = [box(40, 20), box(40, 30), box(40, 20), box(30, 10)];
  const c = composite('flow', 100, 200, k);
  c.layoutManager.set('spacingX', 10);
  c.layoutManager.set('spacingY', 5);
  c.layout();
  assert.deepEqual(k.map(at), [[0, 0, 40, 20], [50, 0, 40, 30], [0, 35, 40, 20], [50, 35, 30, 10]]);
  c.layoutManager.set('alignX', 'center');
  k[0].layoutProps = { alignY: 'middle' };
  c.layout();
  assert.deepEqual(k.map(at), [[5, 5, 40, 20], [55, 0, 40, 30], [10, 35, 40, 20], [60, 35, 30, 10]]);
});

test('grid: columns as wide as their widest child, rows as high as their highest', () => {
  const a = box(30, 20);
  const b = box(50, 20);
  const cc = box(40, 10);
  const d = box(20, 30);
  const c = composite('grid', 200, 100, [
    [a, { row: 0, column: 0 }], [b, { row: 0, column: 1 }], [cc, { row: 1, column: 0 }], [d, { row: 1, column: 1 }],
  ]);
  c.layoutManager.set('spacingX', 10);
  c.layoutManager.set('spacingY', 4);
  c.layout();
  assert.deepEqual([a, b, cc, d].map(at), [[0, 0, 40, 20], [50, 0, 50, 20], [0, 24, 40, 30], [50, 24, 50, 30]]);
  c.layoutManager.setTrack('column', 1, 'flex', 1);
  c.layout();
  assert.deepEqual(at(b), [50, 0, 150, 20]);
  c.layoutManager.setTrack('row', 1, 'flex', 1);
  c.layout();
  assert.deepEqual(at(d), [50, 24, 150, 76]);
});

test('grid: a child that spans tracks widens the last one it needs to', () => {
  const a = box(30, 10);
  const b = box(20, 10);
  const e = box(100, 10);
  const c = composite('grid', 300, 100, [
    [a, { row: 0, column: 0 }], [b, { row: 0, column: 1 }], [e, { row: 1, column: 0, columnSpan: 2 }],
  ]);
  c.layoutManager.set('spacingX', 10);
  c.layout();
  assert.deepEqual(at(b), [40, 0, 60, 10]);
  assert.deepEqual(at(e), [0, 10, 100, 10]);
});

test('grid: a track can have a fixed size, and flex stops at min and max', () => {
  const a = box(10, 10);
  const b = box(10, 10);
  const c = composite('grid', 200, 50, [[a, { row: 0, column: 0 }], [b, { row: 0, column: 1 }]]);
  c.layoutManager.setTrack('column', 0, 'size', 70);
  c.layout();
  assert.deepEqual([a.bounds.x, a.bounds.width, b.bounds.x, b.bounds.width], [0, 70, 70, 10]);
  const d = composite('grid', 200, 50, [[box(10, 10), { row: 0, column: 0 }], [box(10, 10), { row: 0, column: 1 }]]);
  d.layoutManager.setTrack('column', 0, 'flex', 1);
  d.layoutManager.setTrack('column', 1, 'flex', 1);
  d.layoutManager.setTrack('column', 0, 'max', 50);
  d.layout();
  assert.deepEqual(d.children.map((w) => w.bounds.width), [50, 150]);
});

test('grid: a child can align in its cell', () => {
  const a = box(30, 20);
  const b = box(100, 50);
  composite('grid', 100, 50, [
    [a, { row: 0, column: 0, alignX: 'right', alignY: 'bottom' }], [b, { row: 0, column: 0 }],
  ]);
  assert.deepEqual(at(a), [70, 30, 30, 20]);
});

test('canvas: edges and sizes in pixels and percentages', () => {
  const a = box(1, 1);
  const b = box(1, 1);
  b.box = [0, 0, 40, 30];
  const e = box(1, 1);
  e.box = [7, 8, 40, 30];
  composite('canvas', 200, 100, [
    [a, { canvas: ['10', '20', '', '', '50%', '50%'] }],
    [b, { canvas: ['', '', '10', '10', '', ''] }],
    [e, { canvas: ['10', '', '10', '', '', ''] }],
  ]);
  assert.deepEqual(at(a), [10, 20, 100, 50]);
  assert.deepEqual(at(b), [150, 60, 40, 30]);
  assert.deepEqual(at(e), [10, 8, 180, 30]);
});

test('a layout\'s settings are saved without the defaults, and loaded back', () => {
  const grid = layouts.makeLayout('grid');
  assert.deepEqual(grid.toJSON(), {});
  grid.set('spacingX', 8);
  grid.setTrack('column', 1, 'flex', 2);
  grid.setTrack('row', 0, 'min', 30);
  const saved = JSON.parse(JSON.stringify(grid.toJSON()));
  assert.deepEqual(saved, { spacingX: 8, columns: { 1: { flex: 2 } }, rows: { 0: { min: 30 } } });
  const again = layouts.makeLayout('grid');
  again.load(saved);
  assert.deepEqual(again.toJSON(), saved);
  const hbox = layouts.makeLayout('hbox');
  hbox.load({ spacing: 4, alignX: 'right', reversed: true });
  assert.deepEqual(hbox.toJSON(), { spacing: 4, alignX: 'right', reversed: true });
});

test('bad settings say what is wrong', () => {
  const hbox = layouts.makeLayout('hbox');
  assert.throws(() => hbox.set('spacingX', 1), /hbox layout has no spacingX setting/);
  assert.throws(() => hbox.set('spacing', -1), /spacing must be a number of 0 or more/);
  assert.throws(() => hbox.set('alignX', 'top'), /alignX must be one of left, center, right/);
  assert.throws(() => layouts.makeLayout('grid').setTrack('column', -1, 'flex', 1), /whole number of 0 or more/);
  assert.throws(() => layouts.cleanChildProps({ edge: 'up' }), /edge must be one of north, south, west, east, center/);
  assert.throws(() => layouts.cleanChildProps({ columnSpan: 0 }), /columnSpan must be a whole number of 1 or more/);
  assert.throws(() => layouts.cleanChildProps({ canvas: ['1'] }), /six lengths/);
  assert.throws(() => layouts.checkLength('ten'), /is not a length/);
  assert.deepEqual(layouts.cleanChildProps({ row: 1, column: 2, alignX: 'left', canvas: ['', '5%', '', '', '', ''] }),
    { row: 1, column: 2, alignX: 'left', canvas: ['', '5%', '', '', '', ''] });
});

test('Stack: shows one child at a time, each filling the area', () => {
  const kids = [box(1, 1), box(1, 1), box(1, 1)];
  const stack = new Stack();
  stack.setBounds(0, 0, 120, 80);
  const events = [];
  stack.element.addEventListener('select', (e) => events.push(e.detail.index));
  for (const k of kids) stack.add(k);
  stack.layout();
  assert.equal(stack.selectedIndex, 0);
  assert.deepEqual(kids.map((k) => k.visible), [true, false, false]);
  assert.deepEqual(at(kids[0]), [0, 0, 120, 80]);
  stack.select(1);
  assert.deepEqual(kids.map((k) => k.visible), [false, true, false]);
  assert.deepEqual(at(kids[1]), [0, 0, 120, 80]);
  assert.equal(stack.selectedWidget, kids[1]);
  stack.selectNext();
  stack.selectNext();
  assert.equal(stack.selectedIndex, 0);
  stack.selectPrevious();
  assert.equal(stack.selectedIndex, 2);
  assert.deepEqual(events, [0, 1, 2, 0, 2]);
});

test('Stack: removing the showing child shows its neighbour, and gives the child back its visibility', () => {
  const kids = [box(1, 1), box(1, 1), box(1, 1)];
  const stack = new Stack();
  stack.setBounds(0, 0, 50, 50);
  for (const k of kids) stack.add(k);
  stack.select(1);
  stack.remove(kids[1]);
  assert.equal(kids[1].visible, true);
  assert.equal(stack.selectedIndex, 1);
  assert.equal(stack.selectedWidget, kids[2]);
  assert.equal(kids[2].visible, true);
  stack.remove(kids[0]);
  assert.equal(stack.selectedIndex, 0);
  assert.equal(stack.selectedWidget, kids[2]);
});
