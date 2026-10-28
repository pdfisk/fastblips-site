// TextField and PasswordField (src/ui/widgets/text-field.js): the toolkit
// widgets over a small stand-in for the DOM, as a program sees them through
// the widget host, and in the designer. A password is never saved.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { newNode, addChild, fieldsFor, getField, setField } from '../src/ui/designer-model.js';
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
    this.selected = 0;
    const names = new Set();
    this.classList = { add: (n) => names.add(n), contains: (n) => names.has(n), remove: (n) => names.delete(n) };
  }
  appendChild(child) { this.children.push(child); return child; }
  contains(other) { return other === this || this.children.some((c) => c.contains(other)); }
  removeAttribute(name) { this.removed = [...(this.removed ?? []), name]; }
  select() { this.selected += 1; }
  focus() { this.focused = true; }
  remove() {}
  setAttribute() {}
}

let TextField;
let PasswordField;
let ProgramWidgetHost;
let FreeLayer;
let host;

const create = (cls, ...args) => host.create(cls, args);
const call = (id, method, ...args) => host.call(id, method, args);

/** The user types: sets what the input holds and fires the browser's input event. */
function type(widget, text) {
  widget.element.value = text;
  widget.element.dispatchEvent(new Event('input'));
}

function press(widget, key) {
  const event = new Event('keydown');
  event.key = key;
  widget.element.dispatchEvent(event);
}

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  ({ TextField, PasswordField } = await import('../src/ui/widgets/text-field.js'));
  ({ ProgramWidgetHost, FreeLayer } = await import('../src/ui/program-widgets.js'));
});

function fresh() {
  const layer = new FreeLayer();
  layer.setBounds(0, 0, 400, 300);
  host = new ProgramWidgetHost(layer);
}

test('TextField: text, placeholder, limit, read only, enabled', () => {
  const field = new TextField('Ann');
  assert.equal(field.element.type, 'text');
  assert.equal(field.text, 'Ann');
  field.text = 42;
  assert.equal(field.text, '42');
  field.placeholder = 'Your name';
  assert.equal(field.placeholder, 'Your name');
  assert.equal(field.maxLength, 0);
  field.maxLength = 12.4;
  assert.deepEqual([field.maxLength, field.element.maxLength], [12, 12]);
  field.maxLength = 0;
  assert.equal(field.maxLength, 0);
  assert.deepEqual(field.element.removed, ['maxlength']);     // no limit: the attribute goes
  field.maxLength = -3;
  assert.equal(field.maxLength, 0);
  assert.deepEqual([field.readOnly, field.enabled], [false, true]);
  field.readOnly = true;
  field.enabled = false;
  assert.deepEqual([field.readOnly, field.enabled, field.element.disabled], [true, false, true]);
  field.focus();
  field.selectAll();
  assert.deepEqual([field.element.focused, field.element.selected], [true, 1]);
});

test('TextField: Enter fires submit, other keys do not', () => {
  const field = new TextField();
  let submits = 0;
  field.element.addEventListener('submit', () => { submits += 1; });
  press(field, 'a');
  press(field, 'Tab');
  assert.equal(submits, 0);
  press(field, 'Enter');
  assert.equal(submits, 1);
});

test('PasswordField: shows dots, asks the browser not to fill it in, starts empty', () => {
  const field = new PasswordField();
  assert.equal(field.element.type, 'password');
  assert.equal(field.element.autocomplete, 'new-password');
  assert.equal(field.text, '');
  assert.ok(field instanceof TextField);
  assert.equal(field.element.classList.contains('cr-password-field'), true);
  assert.equal(new TextField().element.autocomplete, 'off');
});

test('a program makes the fields and uses them through methods', () => {
  fresh();
  const id = create('TextField', 'Ann');
  const secret = create('PasswordField');
  assert.deepEqual([call(id, 'getText'), call(id, 'getPlaceholder'), call(id, 'getMaxLength')], ['Ann', '', 0]);
  call(id, 'setText', 'Bob');
  call(id, 'setPlaceholder', 'Name');
  call(id, 'setMaxLength', 8);
  call(id, 'setReadOnly', true);
  call(id, 'setEnabled', false);
  call(id, 'focus');
  call(id, 'selectAll');
  assert.deepEqual([call(id, 'getText'), call(id, 'getPlaceholder'), call(id, 'getMaxLength'), call(id, 'isReadOnly'), call(id, 'isEnabled')],
    ['Bob', 'Name', 8, true, false]);
  call(secret, 'setText', 'hunter2');
  assert.equal(call(secret, 'getText'), 'hunter2');
  // their boxes are their classes' defaults: 160 by 28
  assert.deepEqual(host.widget(id).box.slice(2), [160, 28]);
  assert.equal(host.widget(secret).preferredHeight(), 28);
});

test('onChange hears the user\'s edits, not the program\'s; onSubmit hears Enter', () => {
  fresh();
  const id = create('TextField', '');
  const heard = [];
  const on = (name) => { const f = (value) => heard.push(value === undefined ? name : `${name}:${value}`); f.handlerName = name; return f; };
  call(id, 'onChange', on('Edited'));
  call(id, 'onSubmit', on('Entered'));
  const field = host.widget(id);
  type(field, 'a');
  type(field, 'ab');
  call(id, 'setText', 'program');            // no event
  press(field, 'Enter');
  assert.deepEqual(heard, ['Edited:a', 'Edited:ab', 'Entered']);
  assert.equal(call(id, 'getText'), 'program');
});

test('a TextField is saved with its text and settings, and built again the same', () => {
  fresh();
  const id = create('TextField', 'Ann');
  call(id, 'setId', 'who');
  const plain = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([plain.class, plain.text, plain.placeholder, plain.maxLength, plain.readOnly, plain.enabled],
    ['TextField', 'Ann', undefined, undefined, undefined, undefined]);
  call(id, 'setPlaceholder', 'Name');
  call(id, 'setMaxLength', 20);
  call(id, 'setReadOnly', true);
  call(id, 'setEnabled', false);
  const node = JSON.parse(call(id, 'toJson'));
  assert.deepEqual([node.placeholder, node.maxLength, node.readOnly, node.enabled], ['Name', 20, true, false]);
  const rebuilt = host.build(node);
  assert.deepEqual(host.save(rebuilt), node);
  assert.deepEqual([rebuilt.text, rebuilt.placeholder, rebuilt.maxLength, rebuilt.readOnly, rebuilt.enabled], ['Ann', 'Name', 20, true, false]);
});

test('a password is never saved, in a screen, a composite or a widget on its own', () => {
  fresh();
  const comp = create('Composite');
  const secret = create('PasswordField');
  call(comp, 'add', secret);
  call(secret, 'setText', 'hunter2');
  call(secret, 'setPlaceholder', 'Password');
  const json = call(comp, 'toJson');
  assert.ok(!json.includes('hunter2'), json);
  const alone = JSON.parse(call(secret, 'toJson'));
  assert.deepEqual([alone.class, alone.text, alone.placeholder], ['PasswordField', undefined, 'Password']);
  assert.ok(!('text' in alone));
  // a saved file that holds one anyway is not believed
  const rebuilt = host.build({ class: 'PasswordField', text: 'leaked', placeholder: 'Password' });
  assert.equal(rebuilt.text, '');
  assert.equal(rebuilt.placeholder, 'Password');
});

test('the designer offers the fields; a PasswordField has no text of its own', () => {
  const field = newNode('TextField');
  const secret = newNode('PasswordField');
  assert.deepEqual(field, { class: 'TextField', text: '', box: [0, 0, 160, 28] });
  assert.deepEqual(secret, { class: 'PasswordField', box: [0, 0, 160, 28] });
  const labels = (node) => fieldsFor(node).flatMap(([, fs]) => fs).map((f) => f.label);
  assert.ok(labels(field).includes('Text'));
  assert.ok(!labels(secret).includes('Text'));
  for (const node of [field, secret]) {
    for (const label of ['Placeholder', 'Max length (0 for none)', 'Read only', 'Enabled']) assert.ok(labels(node).includes(label), `${node.class} ${label}`);
  }
  const find = (node, label) => fieldsFor(node).flatMap(([, fs]) => fs).find((f) => f.label === label);
  setField(field, find(field, 'Placeholder'), 'Name');
  setField(field, find(field, 'Max length (0 for none)'), '20');
  assert.deepEqual([field.placeholder, field.maxLength, getField(field, find(field, 'Placeholder'))], ['Name', 20, 'Name']);
  assert.ok(fieldsFor(field).some(([title]) => title.startsWith('Events')));
});

test('the generated program makes the fields and sets what was changed', () => {
  const form = newNode('Composite');
  const name = newNode('TextField');
  name.text = 'Ann "A"';
  name.placeholder = 'Name';
  name.maxLength = 20;
  name.readOnly = true;
  name.events = [{ method: 'onChange', handler: 'NameEdited' }, { method: 'onSubmit', handler: 'NameDone' }];
  const secret = newNode('PasswordField');
  secret.text = 'leaked';                      // a design that holds text for one: not written out
  secret.enabled = false;
  addChild(form, name);
  addChild(form, secret);
  addChild(form, newNode('TextField'));
  const source = generateCode(form, { language: 'python', name: 'login' });
  assert.match(source, /field1 = TextField\("Ann \\"A\\""\)/);
  assert.match(source, /field1\.set_placeholder\("Name"\)/);
  assert.match(source, /field1\.set_max_length\(20\)/);
  assert.match(source, /field1\.set_read_only\(True\)/);
  assert.match(source, /field1\.on_change\(NameEdited\)/);
  assert.match(source, /field1\.on_submit\(NameDone\)/);
  assert.match(source, /def NameEdited\(sender, text\):/);
  assert.match(source, /def NameDone\(sender\):/);
  assert.match(source, /password1 = PasswordField\(\)/);
  assert.match(source, /password1\.set_enabled\(False\)/);
  assert.ok(!source.includes('leaked'));
  assert.match(source, /field2 = TextField\(""\)/);
  assert.doesNotMatch(source, /field2\.set_/);
});
