// GroupBox, CheckGroupBox and RadioGroupBox (src/ui/widgets/group-box.js):
// the toolkit widgets over a small stand-in for the DOM, as a program sees
// them through the widget host, and in the designer.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  newNode, addChild, fieldsFor, getField, setField, isFreeParent, isHorizontal, isList,
} from '../src/ui/designer-model.js';
import { generateCode } from '../src/ui/designer-codegen.js';

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.textContent = '';
    this.inert = false;
    const names = new Set();
    this.classList = {
      add: (n) => names.add(n),
      contains: (n) => names.has(n),
      remove: (n) => names.delete(n),
      toggle: (n, on) => (on ? names.add(n) : names.delete(n)),
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  contains(other) { return other === this || this.children.some((c) => c.contains(other)); }
  remove() {}
  setAttribute() {}
}

let GroupBox;
let CheckGroupBox;
let RadioGroupBox;
let Composite;
let Widget;
let ProgramWidgetHost;
let FreeLayer;
let WidgetError;
let host;

/** A widget of a size, for putting in a box. */
function box(width, height) {
  class Box extends Widget {}
  const w = new Box();
  w.preferredWidth = () => width;
  w.preferredHeight = () => height;
  return w;
}

const at = (w) => [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height];

/** What a radio group box has said: records 'text:checked' for each change. */
function listen(heard, ...boxes) {
  for (const b of boxes) b.element.addEventListener('change', (e) => heard.push(`${b.text}:${e.detail.checked}`));
}

const create = (cls, ...args) => host.create(cls, args);
const call = (id, method, ...args) => host.call(id, method, args);

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ Widget } = await import('../src/ui/widgets/widget.js'));
  ({ Composite } = await import('../src/ui/widgets/composite.js'));
  ({ GroupBox, CheckGroupBox, RadioGroupBox } = await import('../src/ui/widgets/group-box.js'));
  ({ ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js'));
  ({ WidgetError } = await import('../src/vm/runtime/widgets.js'));
});

function fresh() {
  const layer = new FreeLayer();
  layer.setBounds(0, 0, 400, 300);
  host = new ProgramWidgetHost(layer);
}

test('a group box has a title and places its children by a layout (vbox) inside its frame, below the title', () => {
  const group = new GroupBox('Options');
  assert.equal(group.text, 'Options');
  assert.equal(group.layoutName, 'vbox');
  assert.equal(group.contentEnabled, true);
  assert.throws(() => { group.checked = true; }, /no checked state/);
  group.setBounds(0, 0, 200, 150);
  const child = box(1, 30);
  group.add(child);
  group.layout();
  // the title is 24 high, then the frame's line (1) and its space (6); 7 at the sides and below
  assert.deepEqual(at(child), [7, 31, 186, 30]);
  group.padding = 4;
  group.layout();
  assert.deepEqual(at(child), [11, 35, 178, 30]);
  group.layoutManager = 'hbox';
  group.layout();
  assert.deepEqual(at(child), [11, 35, 1, 104]);   // 150 less 4 + 4 of padding and the 31 + 7 the title and frame take
});

test('CheckGroupBox: checked at first; unchecked, its children are dimmed and inert', () => {
  const group = new CheckGroupBox('Extras');
  const heard = [];
  listen(heard, group);
  const a = box(1, 10);
  const b = box(1, 10);
  group.add(a);
  assert.equal(group.checked, true);
  assert.equal(a.element.inert, false);

  group.checked = false;
  assert.equal(group.input.checked, false);
  assert.equal(a.element.inert, true);
  assert.equal(group.element.classList.contains('cr-groupbox-off'), true);
  group.add(b);                               // a child added meanwhile is inert too
  assert.equal(b.element.inert, true);
  group.checked = false;                      // no change, no event
  group.checked = true;
  assert.deepEqual([a.element.inert, b.element.inert], [false, false]);
  assert.deepEqual(heard, ['Extras:false', 'Extras:true']);

  group.checked = false;
  group.remove(a);                            // a child taken out is usable again
  assert.equal(a.element.inert, false);

  // the user clicks the check box
  group.input.checked = true;
  group.input.dispatchEvent(new Event('change'));
  assert.equal(group.checked, true);
  assert.equal(heard.at(-1), 'Extras:true');
});

test('RadioGroupBox: checking one unchecks the others in its container', () => {
  const row = new Composite();
  const [a, b, c] = ['A', 'B', 'C'].map((t) => new RadioGroupBox(t));
  for (const g of [a, b, c]) row.add(g);
  const heard = [];
  listen(heard, a, b, c);
  assert.deepEqual([a, b, c].map((g) => g.checked), [false, false, false]);
  assert.equal(a.contentEnabled, false);
  b.checked = true;
  assert.deepEqual([a, b, c].map((g) => g.checked), [false, true, false]);
  c.checked = true;
  assert.deepEqual([a, b, c].map((g) => g.checked), [false, false, true]);
  assert.deepEqual([a, b, c].map((g) => g.input.checked), [false, false, true]);
  assert.deepEqual(heard, ['B:true', 'B:false', 'C:true']);   // the one unchecked speaks first
  assert.equal(b.contentEnabled, false);
  assert.equal(c.contentEnabled, true);

  c.checked = false;                          // a program can clear the group
  assert.deepEqual([a, b, c].map((g) => g.checked), [false, false, false]);

  a.input.checked = true;                     // the user picks one
  a.input.dispatchEvent(new Event('change'));
  assert.deepEqual([a, b, c].map((g) => g.checked), [true, false, false]);
});

test('RadioGroupBox: a group is the boxes in one container, or those with the same name', () => {
  const left = new Composite();
  const right = new Composite();
  const [a1, a2] = [new RadioGroupBox('a1'), new RadioGroupBox('a2')];
  const [b1, b2] = [new RadioGroupBox('b1'), new RadioGroupBox('b2')];
  left.add(a1); left.add(a2); right.add(b1); right.add(b2);
  a1.checked = true;
  b1.checked = true;
  assert.deepEqual([a1, a2, b1, b2].map((g) => g.checked), [true, false, true, false]);   // one group each

  // named: all of them, wherever they are in the same tree
  const page = new Composite();
  page.add(left);
  page.add(right);
  for (const g of [a2, b2]) g.group = 'size';
  assert.equal(a2.group, 'size');
  a2.checked = true;
  b2.checked = true;
  assert.deepEqual([a2, b2].map((g) => g.checked), [false, true]);
  // the unnamed ones are a group of their own, apart from the named
  assert.deepEqual([a1, a2, b1, b2].map((g) => g.checked), [true, false, true, true]);
  a1.checked = true;
  assert.equal(b1.checked, true, 'a1 and b1 are in different containers');
  assert.deepEqual(a1.peers(), [a2].filter((g) => g.group === '' ), 'only unnamed boxes of its own container');
});

test('a program makes group boxes and sets their title, state and layout through methods', () => {
  fresh();
  const check = create('CheckGroupBox', 'Options');
  assert.deepEqual([call(check, 'getText'), call(check, 'isChecked'), call(check, 'getLayout')], ['Options', true, 'vbox']);
  const inside = create('Ellipse');
  call(check, 'add', inside);
  assert.deepEqual(at(host.widget(inside)), [7, 31, 306, 80]);
  call(check, 'setText', 'More');
  call(check, 'setChecked', false);
  call(check, 'setLayout', 'hbox');
  call(check, 'setSpacing', 4);
  assert.deepEqual([call(check, 'getText'), call(check, 'isChecked'), call(check, 'getLayout'), call(check, 'getCount')], ['More', false, 'hbox', 1]);
  assert.equal(host.widget(inside).element.inert, true);

  const radio = create('RadioGroupBox', 'Small');
  assert.deepEqual([call(radio, 'isChecked'), call(radio, 'getGroup')], [false, '']);
  call(radio, 'setGroup', 'size');
  assert.equal(call(radio, 'getGroup'), 'size');
  assert.throws(() => call(radio, 'setLayout', 'atom'), WidgetError);
  assert.throws(() => call(check, 'setGroup', 'x'), /a CheckGroupBox has no method 'setGroup'/);
});

test('onChange is called with the box and whether it is checked now', () => {
  fresh();
  const [a, b] = [create('RadioGroupBox', 'a'), create('RadioGroupBox', 'b')];
  const heard = [];
  const on = (name) => { const f = (checked) => heard.push(`${name}:${checked}`); f.handlerName = name; return f; };
  call(a, 'onChange', on('A'));
  call(b, 'onChange', on('B'));
  const comp = create('Composite');
  call(comp, 'add', a);
  call(comp, 'add', b);
  call(a, 'setChecked', true);
  call(b, 'setChecked', true);
  assert.deepEqual(heard, ['A:true', 'A:false', 'B:true']);
  assert.deepEqual([call(a, 'isChecked'), call(b, 'isChecked')], [false, true]);
});

test('group boxes are saved with title, state, group and layout, and built again the same', () => {
  fresh();
  const check = create('CheckGroupBox', 'Options');
  call(check, 'add', create('Ellipse'));
  const plain = JSON.parse(call(check, 'toJson'));
  assert.deepEqual([plain.class, plain.text, plain.checked, plain.layout, plain.layoutOptions], ['CheckGroupBox', 'Options', undefined, undefined, undefined]);
  assert.equal(plain.children.length, 1);

  call(check, 'setChecked', false);
  call(check, 'setLayout', 'basic');
  const node = JSON.parse(call(check, 'toJson'));
  assert.deepEqual([node.checked, node.layout], [false, 'basic']);
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.equal(rebuilt.checked, false);
  assert.equal(rebuilt.layoutName, 'basic');
  assert.equal(rebuilt.children[0].element.inert, true);

  const radio = create('RadioGroupBox', 'Large');
  call(radio, 'setGroup', 'size');
  call(radio, 'setChecked', true);
  call(radio, 'setSpacing', 3);
  const saved = JSON.parse(call(radio, 'toJson'));
  assert.deepEqual([saved.class, saved.text, saved.checked, saved.group, saved.layout, saved.layoutOptions],
    ['RadioGroupBox', 'Large', true, 'size', undefined, { spacing: 3 }]);
  const again = host.build(saved);
  assert.deepEqual(host.save(again), saved);
  assert.equal(again.checked, true);
  assert.equal(again.group, 'size');
  assert.throws(() => host.build({ class: 'RadioGroupBox', text: 'x', layout: 'atom' }), /there is no layout 'atom'/);
});

test('the designer offers group boxes: a list of children, a layout that starts as vbox, and their fields', () => {
  const check = newNode('CheckGroupBox');
  const radio = newNode('RadioGroupBox');
  assert.deepEqual(check, { class: 'CheckGroupBox', text: 'Group', children: [], box: [0, 0, 320, 200] });
  assert.equal(addChild(check, newNode('Label')), null);
  assert.equal(isList(check) && isList(radio), true);
  const field = (node, label, opts) => fieldsFor(node, opts).flatMap(([, fs]) => fs).find((f) => f.label === label);

  assert.equal(getField(check, field(check, 'Layout')), 'vbox');
  assert.equal(isFreeParent(check), false);
  setField(check, field(check, 'Layout'), 'basic');
  assert.equal(check.layout, 'basic');
  assert.equal(isFreeParent(check), true);
  setField(check, field(check, 'Layout'), 'hbox');
  assert.equal(isHorizontal(check), true);
  setField(check, field(check, 'Layout'), 'vbox');       // back to its own default: nothing kept
  assert.equal(check.layout, undefined);
  assert.throws(() => setField(check, field(check, 'Layout'), 'atom'), /there is no layout/);

  assert.equal(getField(check, field(check, 'Checked')), true);
  setField(check, field(check, 'Checked'), false);
  assert.equal(check.checked, false);
  setField(check, field(check, 'Checked'), true);
  assert.equal(check.checked, undefined);
  assert.equal(getField(radio, field(radio, 'Checked')), false);
  setField(radio, field(radio, 'Group'), 'size');
  setField(radio, field(radio, 'Checked'), true);
  assert.deepEqual([radio.group, radio.checked], ['size', true]);
  assert.ok(fieldsFor(radio).some(([title]) => title.startsWith('Events')));
  // a child's place in the group's layout
  const label = check.children[0];
  setField(check, field(check, 'Layout'), 'dock');
  setField(label, field(label, 'Edge (north, south, west, east, center)', { parent: check }), 'north');
  assert.deepEqual(label.layoutProps, { edge: 'north' });
});

test('the generated program makes the group boxes, sets their state and layout, and adds their children', () => {
  const form = newNode('Composite');
  const options = newNode('CheckGroupBox');
  options.text = 'Extras "all"';
  options.checked = false;
  options.layout = 'hbox';
  options.layoutOptions = { spacing: 6 };
  const small = newNode('RadioGroupBox');
  small.text = 'Small';
  small.group = 'size';
  small.checked = true;
  small.events = [{ method: 'onChange', handler: 'SizePicked' }];
  const large = newNode('RadioGroupBox');
  large.text = 'Large';
  large.group = 'size';
  const free = newNode('CheckGroupBox');
  free.layout = 'basic';
  for (const n of [options, small, large, free]) addChild(form, n);
  addChild(options, newNode('Button'));

  const source = generateCode(form, { language: 'python', name: 'sizes' });
  assert.match(source, /group1 = CheckGroupBox\("Extras \\"all\\""\)/);
  assert.match(source, /group1\.set_layout\("hbox"\)/);
  assert.match(source, /group1\.set_spacing\(6\)/);
  assert.match(source, /group1\.set_checked\(False\)/);
  assert.match(source, /group2 = RadioGroupBox\("Small"\)/);
  assert.match(source, /group2\.set_group\("size"\)/);
  assert.match(source, /group2\.set_checked\(True\)/);
  assert.match(source, /group2\.on_change\(SizePicked\)/);
  assert.match(source, /def SizePicked\(sender, checked\):/);
  assert.match(source, /group3 = RadioGroupBox\("Large"\)/);
  assert.doesNotMatch(source, /group3\.set_checked/);
  assert.match(source, /group4 = CheckGroupBox\("Group"\)\n[\s\S]*group4\.set_layout\("basic"\)/);
  assert.doesNotMatch(source, /group2\.set_layout/);          // vbox is its own default
  assert.match(source, /group1\.add\(button1\)/);
  assert.match(source, /root\.add\(group1\)/);
});
