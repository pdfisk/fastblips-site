// The designer's code generator (src/ui/designer-codegen.js): a design in,
// a Crumb or MiniPy program out. The programs are compiled, run on the
// in-memory widget host (fake-widget-host.js) and the widgets they build
// are compared with the design.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import {
  PALETTE, newNode, addChild, fieldsFor, setField, cloneNode,
} from '../src/ui/designer-model.js';
import { DEFAULT_BOXES, DEFAULT_WINDOW_BOUNDS } from '../src/ui/widget-defaults.js';
import {
  generateCode, updateCode, saveAsScript, crumbString, pyString, LANGUAGES,
} from '../src/ui/designer-codegen.js';
import { FakeHost } from './fake-widget-host.js';

const LANGS = Object.keys(LANGUAGES);

// ---- building designs the way the designer does ----------------------------------

/** Sets a field by its label, as the inspector would. */
function set(node, label, value, opts = {}) {
  const field = fieldsFor(node, opts).flatMap(([, fs]) => fs).find((f) => f.label === label || f.key === label);
  assert.ok(field, `${node.class} has no field ${label}`);
  setField(node, field, value);
  return node;
}

/** A node of a class with some fields set: made('Label', { Text: 'Hi' }, { parent }). */
function made(cls, fields = {}, opts = {}) {
  const node = newNode(cls);
  for (const [label, value] of Object.entries(fields)) set(node, label, value, opts);
  return node;
}

const add = (parent, child) => { assert.equal(addChild(parent, child), null); return child; };

/** A design that uses most of the toolkit. */
function bigDesign() {
  const win = made('Window', { Title: 'Sign "in"', Left: '30', Top: '40', Width: '420', Height: '320' }, { isRoot: true });

  const split = add(win, made('VSplitPanel', { Id: 'main', 'Divider (0-1)': '0.3' }, { parent: win }));
  const free = add(split, newNode('Panel'));
  add(free, made('Label', { Id: 'caption', Text: 'Name:', Left: '10', Top: '20' }, { parent: free }));
  add(free, made('TextPanel', { Id: 'name', Text: 'line one\nline "two"\tend', Left: '10', Top: '50', Width: '200', Height: '60' }, { parent: free }));

  const tabs = add(split, newNode('TabPanel'));
  const row = add(tabs, made('HPanel', { Padding: '4', Spacing: '2' }, { parent: tabs }));
  add(row, made('Label', { Text: 'Pick:', Width: '60' }, { parent: row }));
  add(row, made('Spacer', { Flex: '1' }, { parent: row }));
  add(row, made('Button', { Id: 'go', Text: 'Go', Enabled: false, onClick: 'Go' }, { parent: row }));
  const menu = add(row, made('Menu', { Text: 'File' }, { parent: row }));
  set(menu, 'Items: Label = Handler, - for a line', 'Open = OpenFile\nSave\n-\nQuit');
  const list = add(tabs, made('ListPanel', {
    Id: 'fruit', 'Items (one a line)': 'apple\npear "green"\nplum', Selected: '1', 'Empty text': 'none', onSelect: 'Picked', Background: '#eef', Colour: 'navy',
  }, { parent: tabs }));
  assert.equal(list.items.length, 3);
  set(tabs, 'Tab labels (one a line)', 'Row\nFruit');
  set(tabs, 'Selected', '1');

  add(win, made('Button', { Id: 'ok', Text: 'OK', onClick: 'LoggedIn' }, { parent: win }));
  add(win, made('Button', { Text: 'Cancel' }, { parent: win }));
  add(win, made('Label', { Text: 'ready' }, { parent: win }));
  return win;
}

// ---- compiling and running ----------------------------------------------------------

function settle(vm) {
  while (!vm.runSlice(1000)) if (vm.waiting) return;
}

function runProgram(source, lang, host = new FakeHost()) {
  const out = [];
  let chunk;
  if (lang === 'basic') {
    const r = compile(source, { filename: 'gen.bas' });
    assert.deepEqual(r.errors.map((e) => e.message), [], source);
    chunk = r.chunk;
  } else {
    const r = compilePython(source, { filename: 'gen.py' });
    assert.ok(r.chunk, `${JSON.stringify(r.loadErrors)}\n${source}`);
    chunk = r.chunk;
  }
  const vm = new VM(chunk, { gui: host, out: (t) => out.push(t) });
  settle(vm);
  return { vm, host, out };
}

// ---- what the design says the widgets should be ----------------------------------------

const TEXTED = ['Label', 'Button', 'Menu', 'TextPanel', 'MonacoPanel'];

/** Every property the host should have recorded for node (the host starts with visible and enabled). */
function expectedProps(node, parent) {
  const cls = node.class;
  const p = { visible: node.visible !== false, enabled: node.enabled !== false };
  if (node.id) p.id = node.id;
  if (TEXTED.includes(cls)) p.text = node.text ?? '';
  if (node.background) p.background = node.background;
  if (node.color) p.color = node.color;
  if (cls === 'Window') {
    p.title = node.title ?? '';
    p.state = node.maximized ? 'maximize' : 'open';
    const b = node.bounds ?? DEFAULT_WINDOW_BOUNDS;
    if (b.some((x, i) => x !== DEFAULT_WINDOW_BOUNDS[i])) [p.left, p.top, p.width, p.height] = b;
    return p;
  }
  if (!parent || parent.class === 'Panel') {
    const dflt = DEFAULT_BOXES[cls];
    const box = node.box ?? dflt;
    const bounds = [box[0], box[1], node.width ?? box[2], node.height ?? box[3]];
    if (bounds.some((x, i) => x !== dflt[i])) [p.left, p.top, p.width, p.height] = bounds;
  } else {
    if (node.width !== undefined) p.width = node.width;
    if (node.height !== undefined) p.height = node.height;
  }
  if (node.flex !== undefined) p.flex = node.flex;
  if (node.fill) p.fill = true;
  if (node.readOnly) p.readOnly = true;
  if (node.padding !== undefined) p.padding = node.padding;
  if (node.spacing !== undefined) p.spacing = node.spacing;
  if (node.position !== undefined && /Split/.test(cls)) p.position = node.position;
  if (node.emptyText) p.emptyText = node.emptyText;
  if ((node.items ?? []).some((i) => i?.separator)) p.state = 'addSeparator';   // how the fake host records it
  return p;
}

const childrenOfNode = (node) => {
  switch (node.class) {
    case 'Panel': case 'HPanel': case 'VPanel': case 'ButtonBar': return node.children ?? [];
    case 'HSplitPanel': case 'VSplitPanel': return [node.first, node.second].filter(Boolean);
    case 'TabPanel': return (node.tabs ?? []).map((t) => t.widget);
    case 'Window': return [node.content].filter(Boolean);
    default: return [];
  }
};

/** Checks the widget `id` of the host against node, and everything under both. */
function compare(host, id, node, parent, where = node.class) {
  const w = host.get(id);
  assert.equal(w.className, node.class, where);
  const { first, second, content, ...props } = w.props;   // ids of children, checked below
  assert.deepEqual(props, expectedProps(node, parent), where);

  if (node.class === 'MonacoPanel') assert.equal(w.args[1], node.language || 'plaintext', where);
  if (node.class === 'ListPanel') {
    assert.deepEqual(w.items, node.items ?? [], where);
    const inRange = Number.isInteger(node.selected) && node.selected >= 0 && node.selected < (node.items ?? []).length;
    assert.equal(w.selected, inRange ? node.selected : -1, where);
  }
  if (node.class === 'TabPanel') {
    assert.deepEqual(w.items, (node.tabs ?? []).map((t) => t.label), where);
    assert.equal(w.selected, node.selected > 0 ? node.selected : 0, where);
  }
  if (node.class === 'Menu') {
    const real = (node.items ?? []).filter((i) => !i.separator);
    assert.deepEqual(w.items, real.map((i) => i.label), where);
    assert.deepEqual((w.itemHandlers ?? []).map((cb) => cb.handlerName.toLowerCase().replaceAll('_', '')),
      real.map((i) => (i.handler ?? `file${i.label}`).toLowerCase()), where);
  }
  const events = Object.entries(w.handlers).flatMap(([event, cbs]) => cbs.map((cb) => [`on${event[0].toUpperCase()}${event.slice(1)}`, cb.handlerName]));
  assert.deepEqual(events.sort(), (node.events ?? []).map((e) => [e.method, e.handler]).sort(), where);

  const kids = childrenOfNode(node);
  const hostKids = node.class === 'Window' ? [content].filter(Boolean) : host.kids(w);
  assert.equal(hostKids.length, kids.length, `${where}: number of children`);
  kids.forEach((kid, i) => compare(host, hostKids[i], kid, node, `${where} > ${kid.class}[${i}]`));

  if (node.class === 'Window') {
    const barKids = node.buttonBar?.children ?? [];
    if (barKids.length === 0) assert.equal(w.buttonBar, undefined, `${where}: no button bar`);
    else {
      const bar = host.get(w.buttonBar);
      assert.equal(bar.children.length, barKids.length, `${where}: button bar`);
      barKids.forEach((kid, i) => compare(host, bar.children[i], kid, node.buttonBar, `${where} > bar[${i}]`));
    }
  }
}

/** The root of the design is the first widget the program made after the Viewport. */
function rootId(host) {
  const first = [...host.widgets.values()].find((w) => w.id !== host.viewport);
  assert.ok(first, 'the program made a widget');
  return first.id;
}

// ---- the tests ---------------------------------------------------------------------

test('Basic: a small design has the layout and the stub we expect', () => {
  const column = made('VPanel', { Id: 'form', Padding: '8' }, { isRoot: true });
  add(column, made('Label', { Text: 'Say "hi"' }, { parent: column }));
  add(column, made('Button', { Text: 'OK', onClick: 'Pressed' }, { parent: column }));
  assert.equal(generateCode(column, { language: 'basic', name: 'hello' }), [
    `' Generated by the FastBlips Designer from "hello".`,
    `' The layout section is rebuilt from the design: put your own code outside it.`,
    '',
    `' ===== DESIGNER LAYOUT (generated: edit the design, not this) =====`,
    'Dim vp = New Viewport()',
    '',
    'Dim form = New VPanel()',
    'form.setId("form")',
    'form.setPadding(8)',
    'Dim label1 = New Label("Say ""hi""")',
    'form.add(label1)',
    'Dim button1 = New Button("OK")',
    'button1.onClick("Pressed")',
    'form.add(button1)',
    'vp.add(form)',
    `' ===== END DESIGNER LAYOUT =====`,
    '',
    'Sub Pressed(sender)',
    `  ' Runs on button1.onClick: add your code here.`,
    'End Sub',
    '',
  ].join('\n'));
});

test('Python: the same design, in snake_case, with the function before the layout that names it', () => {
  const column = made('VPanel', { Id: 'form', Padding: '8' }, { isRoot: true });
  add(column, made('Label', { Text: 'Say "hi"' }, { parent: column }));
  add(column, made('Button', { Text: 'OK', onClick: 'Pressed' }, { parent: column }));
  assert.equal(generateCode(column, { language: 'python', name: 'hello' }), [
    '# Generated by the FastBlips Designer from "hello".',
    '# The layout section is rebuilt from the design: put your own code outside it.',
    '',
    'def Pressed(sender):',
    '    pass  # Runs on button1.on_click: add your code here.',
    '',
    '# ===== DESIGNER LAYOUT (generated: edit the design, not this) =====',
    'vp = Viewport()',
    '',
    'form = VPanel()',
    'form.set_id("form")',
    'form.set_padding(8)',
    'label1 = Label("Say \\"hi\\"")',
    'form.add(label1)',
    'button1 = Button("OK")',
    'button1.on_click(Pressed)',
    'form.add(button1)',
    'vp.add(form)',
    '# ===== END DESIGNER LAYOUT =====',
    '',
  ].join('\n'));
});

for (const lang of LANGS) {
  test(`${lang}: a big design compiles, runs, and builds the widgets the design describes`, () => {
    const win = bigDesign();
    const source = generateCode(win, { language: lang, name: 'big' });
    const { host } = runProgram(source, lang);
    compare(host, rootId(host), win, null);
  });

  test(`${lang}: a design with no window is added to the screen`, () => {
    const root = made('VPanel', { Id: 'page', 'Fill its area': true, Background: 'white', Visible: true }, { isRoot: true });
    add(root, made('Label', { Text: 'a' }, { parent: root }));
    const hidden = add(root, made('Button', { Text: 'b', Visible: false, Flex: '2', Height: '40' }, { parent: root }));
    assert.equal(hidden.visible, false);
    const { host } = runProgram(generateCode(root, { language: lang }), lang);
    const id = rootId(host);
    compare(host, id, root, null);
    assert.equal(host.get(id).parent, host.viewport, 'on the screen');
  });

  test(`${lang}: every class in the palette can be generated alone`, () => {
    for (const cls of PALETTE) {
      const root = newNode(cls);
      if (cls === 'Menu') set(root, 'Items: Label = Handler, - for a line', 'One\nTwo = Second\n-\nThree');
      const source = generateCode(root, { language: lang });
      const { host } = runProgram(source, lang);
      assert.ok([...host.widgets.values()].some((w) => w.className === cls), `${cls}\n${source}`);
    }
  });

  test(`${lang}: handlers are called with the widget and the event's value, and may be shared`, () => {
    const col = made('VPanel', {}, { isRoot: true });
    const a = add(col, made('Button', { Id: 'a', Text: 'A', onClick: 'Same' }, { parent: col }));
    const b = add(col, made('Button', { Id: 'b', Text: 'B', onClick: 'same' }, { parent: col }));
    const list = add(col, made('ListPanel', { Id: 'l', 'Items (one a line)': 'x\ny', onSelect: 'Chose' }, { parent: col }));
    assert.ok(a && b && list);
    const source = generateCode(col, { language: lang });
    assert.equal(source.match(lang === 'basic' ? /^Sub /gm : /^def /gm).length, 2, 'Same and same are one handler');
    const { host } = runProgram(source, lang);
    const [first, second, listId] = host.get(rootId(host)).children;
    host.click(first);
    host.click(second);
    host.fire(listId, 'select', 1);
  });
}

test('names: ids that are reserved, repeated or not identifiers still give working programs', () => {
  const col = made('VPanel', { Id: 'End' }, { isRoot: true });
  for (const id of ['list', 'LIST', 'my widget', '9lives', 'vp', 'Print', 'str', 'Label', 'label']) {
    add(col, made('Label', { Id: id, Text: id }, { parent: col }));
  }
  for (const lang of LANGS) {
    const source = generateCode(col, { language: lang });
    const { host } = runProgram(source, lang);
    compare(host, rootId(host), col, null);
  }
  const basic = generateCode(col, { language: 'basic' });
  assert.match(basic, /^Dim End2 = New VPanel\(\)$/m, 'End is a keyword');
  assert.match(basic, /^Dim LIST2 = /m, 'names are case-insensitive');
  assert.match(basic, /^Dim Print2 = /m);
  assert.match(basic, /^Dim str2 = /m, 'Str is a built-in');
  assert.match(basic, /^Dim my_widget = /m);
  assert.match(basic, /^Dim x9lives = /m);
  assert.match(basic, /^Dim vp2 = /m, 'vp is the Viewport');
  const py = generateCode(col, { language: 'python' });
  assert.match(py, /^list2 = Label\(/m, 'list is a MiniPy built-in');
  assert.match(py, /^str2 = Label\(/m);
  assert.match(py, /^Label2 = Label\(/m, 'a variable must not be a class');
  assert.match(py, /^label = Label\(/m, 'label is not a class');
});

test('strings: quotes and control characters survive in both languages', () => {
  assert.equal(crumbString('a"b'), '"a""b"');
  assert.equal(crumbString('x\ny'), '"x" & Chr(10) & "y"');
  assert.equal(crumbString('\t'), 'Chr(9)');
  assert.equal(crumbString(''), '""');
  assert.equal(pyString('a"b\\c\nd\te'), '"a\\"b\\\\c\\nd\\te"');
  assert.equal(pyString(''), '""');
  const text = 'tab\there "quoted"\nsecond line \\ done é 中';
  const root = made('TextPanel', { Text: text }, { isRoot: true });
  assert.equal(root.text, text);
  for (const lang of LANGS) {
    const { host } = runProgram(generateCode(root, { language: lang }), lang);
    assert.equal(host.get(rootId(host)).props.text, text, lang);
  }
});

test('a design without a handler on a menu item gets a stub named for the menu and the item', () => {
  const menu = made('Menu', { Text: 'File' }, { isRoot: true });
  set(menu, 'Items: Label = Handler, - for a line', 'Open file\nSave = DoSave');
  const basic = generateCode(menu, { language: 'basic' });
  assert.match(basic, /^root\.addItem\("Open file", "FileOpenFile"\)$/m);
  assert.match(basic, /^Sub FileOpenFile\(sender, label\)$/m);
  assert.match(basic, /^Sub DoSave\(sender, label\)$/m);
  const py = generateCode(menu, { language: 'python' });
  assert.match(py, /^root\.add_item\("Open file", file_open_file\)$/m);
  assert.match(py, /^def file_open_file\(sender, label\):$/m);
});

test('stubs: parameters avoid the names of the design\'s widgets', () => {
  const col = made('VPanel', {}, { isRoot: true });
  add(col, made('ListPanel', { Id: 'index', onSelect: 'Chose' }, { parent: col }));
  add(col, made('Label', { Id: 'sender' }, { parent: col }));
  for (const lang of LANGS) {
    const source = generateCode(col, { language: lang });
    assert.match(source, lang === 'basic' ? /^Sub Chose\(sender2, index2\)$/m : /^def Chose\(sender2, index2\):$/m);
    runProgram(source, lang);
  }
});

test('updateCode: replaces the layout section, keeps the programmer\'s code, adds only missing stubs', () => {
  const col = made('VPanel', { Id: 'form' }, { isRoot: true });
  const go = add(col, made('Button', { Id: 'go', Text: 'Go', onClick: 'Go' }, { parent: col }));
  for (const lang of LANGS) {
    const first = generateCode(col, { language: lang });
    // The programmer fills in the stub and adds code of their own around the layout.
    const edited = lang === 'basic'
      ? first.replace(/^ {2}' Runs on .*$/m, '  Print "going"') + '\nSub Helper()\nEnd Sub\n'
      : first.replace(/^ {4}pass {2}# Runs on .*$/m, '    print("going")') + '\ndef helper():\n    pass\n';
    assert.match(edited, lang === 'basic' ? /Print "going"/ : /print\("going"\)/);

    set(go, 'Text', 'Go now');
    add(col, made('Button', { Id: 'stop', Text: 'Stop', onClick: 'Halt' }, { parent: col }));
    const next = updateCode(edited, col, { language: lang });
    assert.equal(next.merged, true);
    assert.deepEqual(next.added, ['Halt']);
    assert.match(next.text, /Go now/);
    assert.doesNotMatch(next.text, /Button\("Go"\)|Button\("Go"/);
    assert.match(next.text, lang === 'basic' ? /Print "going"/ : /print\("going"\)/, 'the programmer\'s code is kept');
    assert.match(next.text, lang === 'basic' ? /Sub Helper\(\)/ : /def helper\(\)/);
    assert.equal(next.text.match(lang === 'basic' ? /^Sub Go\(/gm : /^def Go\(/gm).length, 1, 'Go is not added again');
    assert.equal(next.text.match(lang === 'basic' ? /^Sub Halt\(/gm : /^def Halt\(/gm).length, 1);
    runProgram(next.text, lang);

    // Nothing changed: nothing added, and the text is stable.
    const again = updateCode(next.text, col, { language: lang });
    assert.equal(again.text, next.text);
    assert.deepEqual(again.added, []);

    // Back to the starting design for the other language.
    col.children.pop();
    set(go, 'Text', 'Go');
  }
});

test('updateCode: a program without the markers is not touched; the whole program is returned', () => {
  const col = made('VPanel', {}, { isRoot: true });
  const result = updateCode('Print "mine"\n', col, { language: 'basic' });
  assert.equal(result.merged, false);
  assert.equal(result.text, generateCode(col, { language: 'basic' }));
});

test('generating does not change the design', () => {
  const win = bigDesign();
  const before = JSON.stringify(win);
  for (const lang of LANGS) generateCode(win, { language: lang });
  assert.equal(JSON.stringify(win), before);
  assert.deepEqual(cloneNode(win), win);
});

test('errors: no design, or no such language', () => {
  assert.throws(() => generateCode(null), /no design/);
  assert.throws(() => generateCode(newNode('Label'), { language: 'cobol' }), /no language 'cobol'/);
});

// ---- saveAsScript ---------------------------------------------------------------------

/** The part of SourceStore that saveAsScript uses, in memory. */
function fakeScripts(records = []) {
  const rows = records.map((r, i) => ({ id: i + 1, ...r }));
  return {
    rows,
    async findByName(name) { return rows.filter((r) => r.name === name); },
    async create(fields) { const row = { id: rows.length + 1, ...fields }; rows.push(row); return row; },
    async update(id, fields) { return Object.assign(rows.find((r) => r.id === id), fields); },
  };
}

test('saveAsScript: a new name makes a script; the same name again updates its layout and keeps the code', async () => {
  const col = made('VPanel', { Id: 'form' }, { isRoot: true });
  add(col, made('Button', { Id: 'go', Text: 'Go', onClick: 'Go' }, { parent: col }));
  const store = fakeScripts();

  const first = await saveAsScript(store, { name: ' login ', root: col, language: 'python' });
  assert.equal(first.action, 'created');
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0].name, 'login');
  assert.equal(store.rows[0].language, 'python');
  runProgram(store.rows[0].content, 'python');

  // The programmer fills in the handler, and the script has compiled code from a run.
  store.rows[0].content = store.rows[0].content.replace(/^ {4}pass {2}# Runs on .*$/m, '    print("mine")');
  store.rows[0].compiled_code = '{"stale":true}';
  set(col.children[0], 'Text', 'Go now');
  add(col, made('Label', { Text: 'new' }, { parent: col }));

  const second = await saveAsScript(store, { name: 'login ', root: col, language: 'python' });
  assert.equal(second.action, 'updated');
  assert.equal(store.rows.length, 1, 'no second script');
  assert.match(store.rows[0].content, /Go now/);
  assert.match(store.rows[0].content, /print\("mine"\)/);
  assert.equal(store.rows[0].compiled_code, null, 'compiled code is dropped');
  assert.deepEqual(second.added, []);
  runProgram(store.rows[0].content, 'python');
});

test('saveAsScript: it will not overwrite other scripts, and needs a name', async () => {
  const col = made('VPanel', {}, { isRoot: true });
  const store = fakeScripts([
    { name: 'by-hand', language: 'basic', content: 'Print "hello"\n' },
    { name: 'other', language: 'python', content: 'print(1)\n' },
  ]);
  await assert.rejects(saveAsScript(store, { name: 'by-hand', root: col, language: 'basic' }), /no Designer layout section/);
  await assert.rejects(saveAsScript(store, { name: 'other', root: col, language: 'basic' }), /already a Python script/);
  await assert.rejects(saveAsScript(store, { name: '  ', root: col }), /name is required/);
  assert.equal(store.rows[0].content, 'Print "hello"\n', 'untouched');
  assert.equal(store.rows.length, 2);
});

test('shapes: the generated programs set the outline width and the corner radius', () => {
  const root = newNode('Panel');
  add(root, made('Ellipse', { 'Outline width': '4', 'Left': '10' }, { parent: root }));
  add(root, made('RoundedRect', { 'Corner radius': '20' }, { parent: root }));
  const crumb = generateCode(root, { language: 'basic' });
  const python = generateCode(root, { language: 'python' });
  assert.match(crumb, /New Ellipse\(\)/);
  assert.match(crumb, /setBorderWidth\(4\)/);
  assert.match(crumb, /New RoundedRect\(\)/);
  assert.match(crumb, /setRadius\(20\)/);
  assert.match(python, /RoundedRect\(\)/);
  assert.match(python, /set_radius\(20\)/);
  assert.doesNotMatch(crumb, /setRadius.*\n.*setRadius/, 'only the RoundedRect has a radius');
});
