// Composite and Stack as a program sees them: made and driven through the
// browser widget host (src/ui/program-widgets.js) over a small stand-in for
// the DOM. The layouts' own arithmetic is in layouts.test.js.

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
    this.textContent = '';
    const names = new Set();
    this.classList = { add: (n) => names.add(n), contains: (n) => names.has(n), remove: (n) => names.delete(n) };
  }
  appendChild(child) { this.children.push(child); return child; }
  contains(other) { return other === this || this.children.some((c) => c.contains(other)); }
  remove() {}
  setAttribute() {}
}

let ProgramWidgetHost;
let FreeLayer;
let WidgetError;
let host;

const create = (cls, ...args) => host.create(cls, args);
const call = (id, method, ...args) => host.call(id, method, args);
const at = (id) => { const b = host.widget(id).bounds; return [b.x, b.y, b.width, b.height]; };

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js'));
  ({ WidgetError } = await import('../src/vm/runtime/widgets.js'));
});

function fresh() {
  const layer = new FreeLayer();
  layer.setBounds(0, 0, 400, 300);
  host = new ProgramWidgetHost(layer);
}

test('Composite: a program picks the layout and the widgets sit where it puts them', () => {
  fresh();
  const comp = create('Composite');
  assert.equal(call(comp, 'getLayout'), 'basic');
  call(comp, 'setLayout', 'VBox');
  call(comp, 'setSpacing', 6);
  const a = create('Label', 'one');
  const b = create('Label', 'two');
  call(comp, 'add', a);
  call(comp, 'add', b);
  assert.equal(call(comp, 'getLayout'), 'vbox');
  assert.deepEqual(at(a), [0, 0, 320, 24]);
  assert.deepEqual(at(b), [0, 30, 320, 24]);
  call(comp, 'setLayout', 'hbox');
  call(comp, 'setContentAlign', 'right', '');
  call(a, 'setWidth', 50);
  call(b, 'setWidth', 60);
  assert.deepEqual([at(a)[0], at(b)[0]], [210, 260]);
});

test('Composite: a grid, with cells, spans, flex and alignment set through methods', () => {
  fresh();
  const comp = create('Composite');
  call(comp, 'setLayout', 'grid');
  call(comp, 'setColumnFlex', 1, 1);
  const a = create('Ellipse');
  const b = create('Ellipse');
  const c = create('Ellipse');
  call(comp, 'add', a);
  call(comp, 'add', b);
  call(comp, 'add', c);
  call(b, 'setCell', 0, 1);
  call(c, 'setCell', 1, 0);
  call(c, 'setSpan', 1, 2);
  call(c, 'setAlign', 'center', 'top');
  assert.deepEqual(at(a), [0, 0, 120, 80]);
  assert.deepEqual(at(b), [120, 0, 200, 80]);
  assert.deepEqual(at(c), [100, 80, 120, 80]);
  assert.deepEqual([call(b, 'getRow'), call(b, 'getColumn'), call(c, 'getRowSpan'), call(c, 'getColumnSpan')], [0, 1, 1, 2]);
  call(comp, 'setColumnWidth', 0, 50);
  assert.equal(at(a)[2], 50);
});

test('Composite: a dock and a canvas layout through methods', () => {
  fresh();
  const dock = create('Composite');
  call(dock, 'setLayout', 'dock');
  const top = create('Ellipse');
  const middle = create('Ellipse');
  call(dock, 'add', top);
  call(dock, 'add', middle);
  call(top, 'setEdge', 'NORTH');
  assert.equal(call(top, 'getEdge'), 'north');
  assert.deepEqual(at(top), [0, 0, 320, 80]);
  assert.deepEqual(at(middle), [0, 80, 320, 120]);
  call(top, 'setEdge', '');
  assert.equal(call(top, 'getEdge'), '');

  const canvas = create('Composite');
  call(canvas, 'setLayout', 'canvas');
  const dot = create('Ellipse');
  call(canvas, 'add', dot);
  call(dot, 'setCanvasBounds', '', '', '10', '10', '', '');
  assert.deepEqual(at(dot), [190, 110, 120, 80]);
  call(dot, 'setCanvasBounds', '25%', '', '', '', '50%', '');
  assert.deepEqual(at(dot), [80, 0, 160, 80]);
});

test('Composite: settings a layout does not have are errors the program sees', () => {
  fresh();
  const comp = create('Composite');
  const child = create('Ellipse');
  call(comp, 'add', child);
  assert.throws(() => call(comp, 'setLayout', 'atom'), (e) => e instanceof WidgetError && /there is no layout 'atom'/.test(e.message));
  call(comp, 'setLayout', 'hbox');
  assert.throws(() => call(comp, 'setSpacingX', 4), /hbox layout has no spacingX/);
  assert.throws(() => call(comp, 'setColumnFlex', 0, 1), /hbox layout has no columns or rows/);
  assert.throws(() => call(comp, 'setContentAlign', '', 'top'), /along x only/);
  call(comp, 'setLayout', 'vbox');
  assert.throws(() => call(comp, 'setContentAlign', 'left', ''), /along y only/);
  call(comp, 'setLayout', 'grid');
  assert.throws(() => call(comp, 'setReversed', true), /grid layout has no reversed/);
  assert.throws(() => call(comp, 'setColumnFlex', -1, 1), /whole number of 0 or more/);
  assert.throws(() => call(child, 'setEdge', 'up'), /edge must be one of/);
  assert.throws(() => call(child, 'setCell', -1, 0), /row must be a whole number of 0 or more/);
  assert.throws(() => call(child, 'setSpan', 0, 1), /rowSpan must be a whole number of 1 or more/);
  assert.throws(() => call(child, 'setAlign', 'top', ''), /alignX must be one of/);
  assert.throws(() => call(child, 'setCanvasBounds', 'ten', '', '', '', '', ''), /is not a length/);
});

test('a Composite is saved with its layout, its settings and its children\'s places, and built again the same', () => {
  fresh();
  const comp = create('Composite');
  call(comp, 'setId', 'form');
  call(comp, 'setLayout', 'grid');
  call(comp, 'setSpacingX', 8);
  call(comp, 'setColumnFlex', 1, 2);
  call(comp, 'setRowMinHeight', 0, 30);
  const a = create('Ellipse');
  const b = create('Ellipse');
  call(comp, 'add', a);
  call(comp, 'add', b);
  call(b, 'setCell', 0, 1);
  call(b, 'setSpan', 2, 1);
  call(b, 'setAlign', 'right', '');
  const node = JSON.parse(call(comp, 'toJson'));
  assert.equal(node.class, 'Composite');
  assert.equal(node.layout, 'grid');
  assert.deepEqual(node.layoutOptions, { spacingX: 8, columns: { 1: { flex: 2 } }, rows: { 0: { min: 30 } } });
  assert.equal(node.layoutProps, undefined);
  assert.deepEqual(node.children[1].layoutProps, { column: 1, rowSpan: 2, alignX: 'right' });
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.equal(rebuilt.layoutName, 'grid');
  // a basic Composite saves no layout at all
  const plain = JSON.parse(call(create('Composite'), 'toJson'));
  assert.equal(plain.layout, undefined);
  assert.equal(plain.layoutOptions, undefined);
});

test('a saved Composite with a bad layout or bad props is refused', () => {
  fresh();
  assert.throws(() => host.build({ class: 'Composite', layout: 'atom' }), /there is no layout 'atom'/);
  assert.throws(() => host.build({ class: 'Composite', layout: 'hbox', layoutOptions: { spacingX: 3 } }), /no spacingX setting/);
  assert.throws(() => host.build({ class: 'Ellipse', layoutProps: { edge: 'up' } }), /edge must be one of/);
});

test('Stack: a program switches between its widgets and hears about it', () => {
  fresh();
  const stack = create('Stack');
  const a = create('Ellipse');
  const b = create('Ellipse');
  const heard = [];
  const callback = (index) => heard.push(index);
  callback.handlerName = 'Picked';
  call(stack, 'onSelect', callback);
  call(stack, 'add', a);
  call(stack, 'add', b);
  assert.equal(call(stack, 'getCount'), 2);
  assert.equal(call(stack, 'getSelectedIndex'), 0);
  assert.deepEqual([host.widget(a).visible, host.widget(b).visible], [true, false]);
  call(stack, 'select', 1);
  assert.deepEqual([host.widget(a).visible, host.widget(b).visible], [false, true]);
  assert.deepEqual(at(b), [0, 0, 320, 200]);
  call(stack, 'selectNext');
  call(stack, 'selectPrevious');
  assert.deepEqual(heard, [0, 1, 0, 1]);
  assert.throws(() => call(stack, 'select', 2), /index 2 is out of range 0..1/);
  assert.equal(call(stack, 'getChild', 1), b);
});

test('a Stack is saved with the page showing, and its pages need no visibility of their own', () => {
  fresh();
  const stack = create('Stack');
  call(stack, 'add', create('Ellipse'));
  call(stack, 'add', create('Ellipse'));
  call(stack, 'select', 1);
  const node = JSON.parse(call(stack, 'toJson'));
  assert.equal(node.selected, 1);
  assert.equal(node.children.length, 2);
  assert.ok(node.children.every((c) => c.visible === undefined));
  const rebuilt = host.build(node);
  assert.equal(rebuilt.selectedIndex, 1);
  assert.deepEqual(rebuilt.children.map((c) => c.visible), [false, true]);
  assert.deepEqual(host.save(rebuilt), node);
});
