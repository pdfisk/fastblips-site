// TextArea, SplitButton and SelectBox (src/ui/widgets/text-area.js,
// split-button.js, select-box.js): the toolkit widgets over a small stand-in
// for the DOM, as a program sees them through the widget host, and in the
// designer.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { newNode, fieldsFor, setField, getField } from '../src/ui/designer-model.js';
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
    this.value = '';
    this.placeholder = '';
    this.readOnly = false;
    this.disabled = false;
    this.selectedIndex = -1;
    this.scrollWidth = 40;
    this.scrollHeight = 500;
    this.scrollTop = 0;
    const names = new Set();
    this.classList = {
      add: (n) => names.add(n), contains: (n) => names.has(n), remove: (n) => names.delete(n),
      toggle: (n, on) => (on ? names.add(n) : names.delete(n)),
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  contains(other) { return other === this || this.children.some((c) => c.contains(other)); }
  removeAttribute() {}
  remove() {}
  setAttribute() {}
}

let TextArea;
let SplitButton;
let SelectBox;
let ProgramWidgetHost;
let FreeLayer;
let WidgetError;
let host;

const create = (cls, ...args) => host.create(cls, args);
const call = (id, method, ...args) => host.call(id, method, args);

function keydown(widget, props) {
  const event = Object.assign(new Event('keydown'), props);
  widget.element.dispatchEvent(event);
}

function callback(name, heard, ...fields) {
  const f = (...values) => heard.push(fields.length ? `${name}:${values.join(',')}` : name);
  f.handlerName = name;
  return f;
}

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ TextArea } = await import('../src/ui/widgets/text-area.js'));
  ({ SplitButton } = await import('../src/ui/widgets/split-button.js'));
  ({ SelectBox } = await import('../src/ui/widgets/select-box.js'));
  ({ ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js'));
  ({ WidgetError } = await import('../src/vm/runtime/widgets.js'));
});

function fresh() {
  const layer = new FreeLayer();
  layer.setBounds(0, 0, 400, 300);
  host = new ProgramWidgetHost(layer);
}

// ---- TextArea ----------------------------------------------------------------

test('TextArea: a text field with several lines: text, placeholder, limit, read only, enabled', () => {
  const area = new TextArea('one\ntwo');
  assert.equal(area.element.tagName, 'textarea');
  assert.equal(area.element.classList.contains('cr-text-field') && area.element.classList.contains('cr-text-area'), true);
  assert.equal(area.text, 'one\ntwo');
  area.placeholder = 'Notes';
  area.maxLength = 500;
  area.readOnly = true;
  area.enabled = false;
  assert.deepEqual([area.placeholder, area.maxLength, area.readOnly, area.enabled], ['Notes', 500, true, false]);
});

test('TextArea: append goes to the end and scrolls there; wrap can be turned off', () => {
  const area = new TextArea('a');
  area.append('b');
  area.append(3);
  assert.equal(area.text, 'ab3');
  assert.equal(area.element.scrollTop, 500);
  assert.equal(area.wrap, true);
  area.wrap = false;
  assert.deepEqual([area.wrap, area.element.wrap, area.element.style.whiteSpace], [false, 'off', 'pre']);
  area.wrap = true;
  assert.deepEqual([area.element.wrap, area.element.style.whiteSpace], ['soft', '']);
});

test('TextArea: Ctrl+Enter (or Cmd+Enter) submits; Enter is a new line', () => {
  const area = new TextArea();
  let submits = 0;
  area.element.addEventListener('submit', () => { submits += 1; });
  keydown(area, { key: 'Enter' });
  keydown(area, { key: 'a', ctrlKey: true });
  assert.equal(submits, 0);
  keydown(area, { key: 'Enter', ctrlKey: true });
  keydown(area, { key: 'Enter', metaKey: true });
  assert.equal(submits, 2);
});

// ---- SelectBox -----------------------------------------------------------------

test('SelectBox: the first item added is chosen, and every change of the choice is announced', () => {
  const box = new SelectBox();
  const heard = [];
  box.element.addEventListener('select', (e) => heard.push(`${e.detail.index}:${e.detail.text}`));
  assert.deepEqual([box.selectedIndex, box.selectedText, box.count], [-1, '', 0]);
  box.addItem('red');
  box.addItem('green');
  box.addItem('blue');
  assert.deepEqual([box.selectedIndex, box.element.selectedIndex, box.selectedText], [0, 0, 'red']);
  box.select(1);
  box.select(1);                              // no change, no event
  box.select(-1);
  assert.deepEqual([box.selectedIndex, box.selectedText], [-1, '']);
  box.select(2);
  assert.deepEqual(heard, ['0:red', '1:green', '-1:', '2:blue']);
  assert.deepEqual(box.items, ['red', 'green', 'blue']);
  assert.throws(() => box.select(3), /index 3 is out of range 0\.\.2/);
  assert.throws(() => box.select(1.5), /out of range/);
  box.setItem(2, 'navy');
  assert.equal(box.getItem(2), 'navy');
  assert.equal(heard.length, 4, 'changing an item\'s text is not a change of choice');
});

test('SelectBox: removing items keeps a choice when there are items', () => {
  const box = new SelectBox();
  for (const t of ['a', 'b', 'c', 'd']) box.addItem(t);
  const heard = [];
  box.element.addEventListener('select', (e) => heard.push(`${e.detail.index}:${e.detail.text}`));
  box.select(2);
  box.removeItem(0);                           // before the choice: it is c still, now at 1
  assert.deepEqual([box.selectedIndex, box.selectedText], [1, 'c']);
  assert.deepEqual(heard, ['2:c']);
  box.removeItem(1);                           // the chosen one: its neighbour d is chosen
  assert.deepEqual([box.selectedIndex, box.selectedText], [1, 'd']);
  box.removeItem(1);                           // the last one chosen: the one before
  assert.deepEqual([box.selectedIndex, box.selectedText], [0, 'b']);
  box.removeItem(0);                           // the only one: none
  assert.deepEqual([box.selectedIndex, box.count], [-1, 0]);
  assert.deepEqual(heard, ['2:c', '1:d', '0:b', '-1:']);
  assert.throws(() => box.removeItem(0), /there are no items/);
  box.addItem('x');
  box.clear();
  box.clear();                                 // nothing chosen: no second event
  assert.deepEqual(heard.slice(4), ['0:x', '-1:']);
});

test('SelectBox: the user picks from the list', () => {
  const box = new SelectBox();
  box.addItem('a');
  box.addItem('b');
  const heard = [];
  box.element.addEventListener('select', (e) => heard.push(e.detail.index));
  box.element.selectedIndex = 1;
  box.element.dispatchEvent(new Event('change'));
  assert.equal(box.selectedIndex, 1);
  assert.deepEqual(heard, [1]);
  box.enabled = false;
  assert.equal(box.element.disabled, true);
});

// ---- SplitButton ---------------------------------------------------------------

test('SplitButton: a button and an arrow, laid out side by side', () => {
  const split = new SplitButton('Save');
  assert.deepEqual([split.label, split.arrow.label], ['Save', '\u25be']);
  split.setBounds(0, 0, 120, 32);
  split.layout();
  const at = (w) => [w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height];
  assert.deepEqual(at(split.button), [0, 0, 96, 32]);
  assert.deepEqual(at(split.arrow), [96, 0, 24, 32]);
  assert.equal(split.preferredWidth(), 42 + 24);
  assert.throws(() => split.add({}), /cannot contain other widgets/);
});

test('SplitButton: the button\'s click runs the action, the arrow\'s opens the menu; items are the menu\'s', () => {
  let clicks = 0;
  const split = new SplitButton('Save', () => { clicks += 1; });
  const chosen = [];
  split.addItem('Save As...', () => chosen.push('as'));
  split.addSeparator();
  split.addItem('Save a copy', () => chosen.push('copy'));
  assert.equal(split.items.length, 3);
  let opened = 0;
  split.arrow.open = () => { opened += 1; };      // the Menu's own pop-up code needs a real browser
  split.button.element.dispatchEvent(new Event('click'));
  assert.equal(clicks, 1);
  assert.equal(opened, 0);
  split.arrow.button.dispatchEvent(new Event('click'));
  assert.deepEqual([clicks, opened], [1, 1]);     // the arrow opens the menu and is not the button
  split.items[2].action();
  assert.deepEqual(chosen, ['copy']);
  split.action = () => { clicks += 10; };
  split.button.element.dispatchEvent(new Event('click'));
  assert.equal(clicks, 11);
  split.enabled = false;
  assert.deepEqual([split.enabled, split.button.element.disabled, split.arrow.button.disabled], [false, true, true]);
});

// ---- as a program uses them ------------------------------------------------------

test('a program uses a TextArea', () => {
  fresh();
  const id = create('TextArea', 'one');
  assert.deepEqual(host.widget(id).box.slice(2), [240, 120]);
  call(id, 'setText', 'two');
  call(id, 'append', ' three');
  call(id, 'setPlaceholder', 'Notes');
  call(id, 'setWrap', false);
  call(id, 'setMaxLength', 100);
  assert.deepEqual([call(id, 'getText'), call(id, 'getPlaceholder'), call(id, 'isWrap'), call(id, 'getMaxLength')], ['two three', 'Notes', false, 100]);
  const heard = [];
  call(id, 'onChange', callback('Edited', heard, 'text'));
  call(id, 'onSubmit', callback('Sent', heard));
  const area = host.widget(id);
  area.element.value = 'typed';
  area.element.dispatchEvent(new Event('input'));
  call(id, 'setText', 'by program');
  keydown(area, { key: 'Enter', ctrlKey: true });
  assert.deepEqual(heard, ['Edited:typed', 'Sent']);   // the text typed; nothing for the program's own setText
  // saved with its text and settings
  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.class, node.text, node.placeholder, node.maxLength, node.wrap], ['TextArea', 'by program', 'Notes', 100, false]);
  const rebuilt = host.build(node);
  const { events, ...withoutEvents } = node;       // build does not wire handlers; the screen's loader does
  assert.equal(events.length, 2);
  assert.deepEqual(host.save(rebuilt), withoutEvents);
  assert.equal(rebuilt.wrap, false);
  const plain = JSON.parse(call(create('TextArea', 'x'), 'toJson'));
  assert.equal(plain.wrap, undefined);
  assert.throws(() => call(create('TextField', 'x'), 'setWrap', true), /a TextField has no method 'setWrap'/);
});

test('a program uses a SelectBox', () => {
  fresh();
  const id = create('SelectBox');
  const heard = [];
  call(id, 'onSelect', (index) => heard.push(index));
  for (const t of ['red', 'green', 'blue']) call(id, 'addItem', t);
  assert.deepEqual([call(id, 'getCount'), call(id, 'getSelectedIndex'), call(id, 'getSelectedText')], [3, 0, 'red']);
  call(id, 'select', 2);
  call(id, 'setItem', 2, 'navy');
  assert.deepEqual([call(id, 'getItem', 2), call(id, 'getSelectedText')], ['navy', 'navy']);
  call(id, 'removeItem', 0);
  assert.equal(call(id, 'getSelectedIndex'), 1);
  assert.throws(() => call(id, 'select', 5), (e) => e instanceof WidgetError && /index 5 is out of range 0\.\.1/.test(e.message));
  assert.throws(() => call(id, 'getItem', -2), /out of range/);
  call(id, 'select', -1);
  assert.equal(call(id, 'getSelectedIndex'), -1);
  assert.deepEqual(heard, [0, 2, -1]);             // removing the item before the choice moves its index, not the choice
  call(id, 'clear');
  assert.throws(() => call(id, 'removeItem', 0), /there are none|no items/);
});

test('a SelectBox is saved with its items, choice and state, and built again the same', () => {
  fresh();
  const id = create('SelectBox');
  const empty = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([empty.class, empty.items, empty.selected, empty.enabled], ['SelectBox', [], undefined, undefined]);
  for (const t of ['red', 'green', 'blue']) call(id, 'addItem', t);
  const first = JSON.parse(call(id, 'toJson'));
  assert.equal(first.selected, undefined);         // the first is the default choice
  call(id, 'select', 2);
  call(id, 'setEnabled', false);
  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.items, node.selected, node.enabled], [['red', 'green', 'blue'], 2, false]);
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.deepEqual([rebuilt.selectedIndex, rebuilt.enabled], [2, false]);
  call(id, 'select', -1);
  const none = JSON.parse(call(id, 'toJson'));
  assert.equal(none.selected, -1);
  assert.equal(host.build(none).selectedIndex, -1);
});

test('a program uses a SplitButton: the button\'s click, the menu under the arrow', () => {
  fresh();
  const id = create('SplitButton', 'Save');
  const heard = [];
  call(id, 'onClick', callback('Saved', heard));
  call(id, 'addItem', 'Save As...', callback('SaveAs', heard, 'label'));
  call(id, 'addSeparator');
  call(id, 'addItem', 'Save a copy', callback('SaveCopy', heard, 'label'));
  const split = host.widget(id);
  assert.deepEqual([call(id, 'getText'), call(id, 'isEnabled')], ['Save', true]);
  split.arrow.open = () => heard.push('opened');  // the Menu's own pop-up code needs a real browser
  split.button.element.dispatchEvent(new Event('click'));
  split.arrow.button.dispatchEvent(new Event('click'));
  split.items[0].action();
  split.items[2].action();
  assert.deepEqual(heard, ['Saved', 'opened', 'SaveAs:Save As...', 'SaveCopy:Save a copy']);

  call(id, 'setText', 'Save all');
  call(id, 'setBackground', 'navy');
  call(id, 'setColor', 'white');
  assert.deepEqual([split.label, split.button.element.style.background, split.arrow.button.style.background], ['Save all', 'navy', 'navy']);
  assert.equal(split.arrow.button.style.color, 'white');

  call(id, 'setEnabled', false);
  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.class, node.text, node.enabled, node.background], ['SplitButton', 'Save all', false, 'navy']);
  assert.deepEqual(node.items, [{ label: 'Save As...', handler: 'SaveAs' }, { separator: true }, { label: 'Save a copy', handler: 'SaveCopy' }]);
  assert.deepEqual(node.events, [{ method: 'onClick', handler: 'Saved' }]);
  const rebuilt = host.build(node);
  assert.deepEqual(rebuilt.items.length, 3);
  assert.equal(rebuilt.enabled, false);
  const { events, ...withoutEvents } = node;       // handlers are wired by the screen's loader, not by build
  assert.deepEqual(events, [{ method: 'onClick', handler: 'Saved' }]);
  assert.deepEqual(host.save(rebuilt), withoutEvents);
  call(id, 'clear');
  assert.equal(split.items.length, 0);
  assert.throws(() => call(id, 'select', 0), /a SplitButton has no method 'select'/);
});

// ---- the designer ----------------------------------------------------------------

test('the designer offers the three: defaults, fields with their checks, and the code that builds them', () => {
  assert.deepEqual(newNode('TextArea'), { class: 'TextArea', text: '', box: [0, 0, 240, 120] });
  assert.deepEqual(newNode('SelectBox'), { class: 'SelectBox', items: [], box: [0, 0, 160, 28] });
  assert.deepEqual(newNode('SplitButton'), { class: 'SplitButton', text: 'SplitButton', items: [], box: [0, 0, 120, 32] });
  const find = (node, label) => fieldsFor(node).flatMap(([, fs]) => fs).find((f) => f.label === label);

  const area = newNode('TextArea');
  setField(area, find(area, 'Wrap lines'), false);
  setField(area, find(area, 'Placeholder'), 'Notes');
  assert.deepEqual([area.wrap, area.placeholder], [false, 'Notes']);
  assert.equal(getField(newNode('TextArea'), find(newNode('TextArea'), 'Wrap lines')), true);

  const select = newNode('SelectBox');
  setField(select, find(select, 'Items (one a line)'), 'red\ngreen\nblue');
  setField(select, find(select, 'Selected'), '2');
  setField(select, find(select, 'Enabled'), false);
  assert.deepEqual([select.items, select.selected, select.enabled], [['red', 'green', 'blue'], 2, false]);
  assert.ok(fieldsFor(select).some(([title]) => title.startsWith('Events')));

  const split = newNode('SplitButton');
  split.text = 'Save';
  setField(split, find(split, 'Items: Label = Handler, - for a line'), 'Save As = SaveAs\n-\nSave a copy');
  assert.equal(split.items.length, 3);

  area.text = 'line "one"\nline two';
  const source = generateCode(area, { language: 'python', name: 'n' });
  assert.match(source, /root = TextArea\("line \\"one\\"\\nline two"\)/);
  assert.match(source, /root\.set_wrap\(False\)/);
  assert.match(source, /root\.set_placeholder\("Notes"\)/);

  const form = newNode('Composite');
  form.children = [select, split];
  const code = generateCode(form, { language: 'python', name: 'form' });
  assert.match(code, /select1 = SelectBox\(\)/);
  assert.match(code, /select1\.add_item\("red"\)/);
  assert.match(code, /select1\.add_item\("blue"\)/);
  assert.match(code, /select1\.select\(2\)/);
  assert.match(code, /select1\.set_enabled\(False\)/);
  assert.match(code, /splitButton1 = SplitButton\("Save"\)/);
  assert.match(code, /splitButton1\.add_item\("Save As", SaveAs\)/);
  assert.match(code, /splitButton1\.add_separator\(\)/);
  assert.match(code, /def SaveAs\(sender, label\):/);
  assert.match(code, /root\.add\(select1\)/);
});
