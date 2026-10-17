// Widget objects (New Button / Button(), HPanel, ListPanel, Window, ...) and
// the event loop that runs their handlers, with an in-memory widget host
// (./fake-widget-host.js) in place of the browser's AppScreen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from '../src/index.js';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { WIDGET_CLASSES } from '../src/vm/runtime/widgets.js';
import { FakeHost } from './fake-widget-host.js';

function crumb(source) {
  const { chunk, errors } = compile(source, { filename: 't.crumb' });
  assert.deepEqual(errors.map((e) => e.message), []);
  return chunk;
}

function py(source) {
  const { chunk, loadErrors } = compilePython(source, { filename: 't.py' });
  assert.ok(chunk, JSON.stringify(loadErrors));
  return chunk;
}

/** Runs a VM until it halts or waits for events. */
function settle(vm) {
  while (!vm.runSlice(1000)) if (vm.waiting) return;
}

function runCrumb(source, host = new FakeHost()) {
  const out = [];
  const vm = new VM(crumb(source), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  return { vm, host, out };
}

function runPy(source, host = new FakeHost()) {
  const out = [];
  const vm = new VM(py(source), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  return { vm, host, out };
}

const crumbError = (source, gui = new FakeHost()) => {
  const vm = new VM(crumb(source), { gui, out: () => {} });
  try { settle(vm); } catch (e) { return e.message; }
  return assert.fail('expected a runtime error');
};

test('the classes are the toolkit\'s general-purpose widgets', () => {
  assert.deepEqual(WIDGET_CLASSES.map((c) => c.name), [
    'Viewport', 'Label', 'Button', 'Menu', 'Spacer', 'Panel', 'HPanel', 'VPanel', 'ButtonBar',
    'HSplitPanel', 'VSplitPanel', 'TabPanel', 'Window', 'TextPanel', 'MonacoPanel', 'ListPanel', 'Board', 'Canvas', 'Physics',
  ]);
  for (const c of WIDGET_CLASSES) {
    for (const m of c.methods) assert.match(m.py, /^[a-z_]+(3d)?$/, `${c.name}.${m.name}`);
  }
});

test('Crumb: every class can be made with New', () => {
  const lines = WIDGET_CLASSES.map((c, i) => {
    const args = c.params.map((_, j) => `"a${j}"`).join(', ');
    return `Dim w${i} = New ${c.name}(${args})\nPrint w${i}`;
  });
  const { host, out } = runCrumb(lines.join('\n'));
  assert.deepEqual(out, WIDGET_CLASSES.map((c) => `<${c.name}>`));
  assert.deepEqual([...host.widgets.values()].map((w) => w.className), WIDGET_CLASSES.map((c) => c.name));
  assert.deepEqual(host.get(16).args, []);
  assert.deepEqual(host.get(15).args, ['a0', 'a1']);   // MonacoPanel(text, language)
});

test('MiniPy: every class can be made by calling it', () => {
  const lines = WIDGET_CLASSES.map((c) => `print(${c.name}(${c.params.map(() => '"x"').join(', ')}))`);
  const { out } = runPy(lines.join('\n'));
  assert.deepEqual(out, WIDGET_CLASSES.map((c) => `<${c.name} object>`));
});

test('Crumb: properties are set and read through methods; numbers are checked and rounded', () => {
  const { host, out } = runCrumb([
    'Dim b = New Button("Go")',
    'Dim label = new label(42)',
    'label.setText("n=" & 1)',
    'b.setBounds(1, 2, 3, 4.4)',
    'label.SetWidth(199.6)',
    'label.setVisible(False)',
    'b.setEnabled(False)',
    'b.setBackground("red")',
    'Print label.getText(), b.getText(), b.getLeft(), b.getHeight(), label.getWidth(), label.isVisible(), b.isEnabled()',
    'Print b = b, b = label, label = Nothing',
  ].join('\n'));
  assert.deepEqual(out, ['n=1 Go 1 4 200 False False', 'True False False']);
  assert.deepEqual(host.get(1).props, {
    visible: true, enabled: false, text: 'Go', left: 1, top: 2, width: 3, height: 4, background: 'red',
  });
});

test('Crumb: containers hold widgets, and hand back the same objects', () => {
  const { host, out } = runCrumb([
    'Dim row = New HPanel()',
    'Dim ok = New Button("OK")',
    'Dim gap = New Spacer()',
    'row.add(gap)',
    'row.add(ok)',
    'ok.setFlex(2)',
    'row.setPadding(4)',
    'Print row.getCount(), row.getChild(1) = ok, ok.getParent() = row, row.getParent() = New Viewport()',
    'ok.remove()',
    'Print row.getCount(), ok.getParent() = Nothing',
    'Dim win = New Window("Main")',
    'win.setContent(row)',
    'Dim bar = win.getButtonBar()',
    'Dim cancel = bar.addButton("Cancel")',
    'Print win.getContent() = row, bar, bar = win.getButtonBar(), cancel.getText(), cancel.getParent() = bar',
  ].join('\n'));
  assert.deepEqual(out, ['2 True True True', '1 True', 'True <ButtonBar> True Cancel True']);
  assert.equal(host.get(2).props.flex, 2);
  assert.equal(host.get(1).props.padding, 4);
});

test('Crumb: split panels, tab panels, text panels', () => {
  const { host, out } = runCrumb([
    'Dim split = New VSplitPanel()',
    'Dim top = New TextPanel("one")',
    'Dim tabs = New TabPanel()',
    'split.setFirst(top)',
    'split.setSecond(tabs)',
    'split.setPosition(0.25)',
    'tabs.addTab("Code", New MonacoPanel("Print 1", "vb"))',
    'tabs.addTab("Notes", New TextPanel(""))',
    'tabs.select(1)',
    'top.append(" two")',
    'top.setReadOnly(True)',
    'Print split.getFirst() = top, split.getPosition(), tabs.getCount(), tabs.getSelectedIndex(), tabs.getSelectedText(), top.getText(), top.isReadOnly()',
  ].join('\n'));
  assert.deepEqual(out, ['True 0.25 2 1 Notes one two True']);
  assert.deepEqual(host.get(3).items, ['Code', 'Notes']);
});

test('Crumb: a ListPanel and its select handler get the widget and the index', () => {
  const { vm, host, out } = runCrumb([
    'Dim list = New ListPanel()',
    'list.addItem("apple")',
    'list.addItem("pear")',
    'list.addItem("fig")',
    'list.setItem(2, "plum")',
    'list.removeItem(0)',
    'list.onSelect("Picked")',
    'Print list.getCount(), list.getItem(1), list.getSelectedIndex()',
    'Sub Picked(w, index)',
    '  Print "picked", index, w.getItem(index), w.getSelectedText(), w = list',
    'End Sub',
  ].join('\n'));
  assert.equal(vm.waiting, true);
  host.call(1, 'select', [1]);   // as the user clicking the second row
  settle(vm);
  assert.deepEqual(out, ['2 plum -1', 'picked 1 plum plum True']);
});

test('Crumb: handlers take none, one or two arguments', () => {
  const { vm, host, out } = runCrumb([
    'Dim m = New Menu("File")',
    'm.addItem("Open", "Chosen")',
    'm.addSeparator()',
    'm.addItem("Quit", "Quit")',
    'Dim t = New TextPanel("")',
    't.onChange("Typed")',
    't.onSubmit("Submitted")',
    'Sub Chosen(menu, label)',
    '  Print "chose", label, menu.getText()',
    'End Sub',
    'Sub Quit()',
    '  Print "quit"',
    'End Sub',
    'Sub Typed(w, text)',
    '  Print "typed", text',
    'End Sub',
    'Sub Submitted(w)',
    '  Print "submitted", w.getText()',
    'End Sub',
  ].join('\n'));
  host.get(1).itemHandlers[0]('Open');
  host.get(1).itemHandlers[1]('Quit');
  host.get(2).props.text = 'hi';
  host.fire(2, 'change', 'hi');
  host.fire(2, 'submit');
  settle(vm);
  assert.deepEqual(out, ['chose Open File', 'quit', 'typed hi', 'submitted hi']);
});

test('Crumb: onClick runs the Sub for each click, after the module code', () => {
  const { vm, host, out } = runCrumb([
    'Dim n = 0',
    'Dim b = New Button("Go")',
    'Dim l = New Label("0")',
    'b.onClick("clicked")',
    'Print "ready"',
    'Sub Clicked(w)',
    '  n = n + 1',
    '  l.setText(n)',
    '  Print "click", w.getText(), n',
    'End Sub',
  ].join('\n'));
  assert.equal(vm.waiting, true);
  assert.deepEqual(out, ['ready']);
  host.click(1);
  host.click(1);                 // queued: both run, in order
  settle(vm);
  assert.deepEqual(out, ['ready', 'click Go 1', 'click Go 2']);
  assert.equal(host.get(2).props.text, '2');
});

test('Crumb: object load errors', () => {
  const errorsOf = (source) => compile(source, { filename: 't.crumb' }).errors.map((e) => e.message);
  assert.match(errorsOf('Dim x = New Screen()')[0], /no class 'Screen': the classes are Board, Button, ButtonBar, Canvas, HPanel/);
  assert.match(errorsOf('Dim x = New Label()')[0], /'New Label' takes 1 argument, found 0/);
  assert.match(errorsOf('Dim x = New HPanel(1)')[0], /'New HPanel' takes 0 arguments, found 1/);
  assert.match(errorsOf('Dim x = New HPanel')[0], /expected '\(' after 'New HPanel'/);
  assert.match(errorsOf('Dim x = 1\nx.grow(2)')[0], /no method 'grow'/);
  assert.match(errorsOf('Dim x = 1\nx.setWidth()')[0], /'setWidth' takes 1 argument, found 0/);
  assert.match(errorsOf('Dim x = 1\nx.addItem()')[0], /'addItem' takes 1 or 2 arguments, found 0/);
  assert.match(errorsOf('Dim x = 1\nx.setWidth = 3')[0], /needs parentheses/);
  assert.match(errorsOf('Dim x = 1\nx.getWidth() = 3')[0], /cannot assign to a method call/);
  assert.match(errorsOf('Dim new = 1')[0], /'New' is a reserved word/);
});

test('Crumb: widget runtime errors', () => {
  assert.match(crumbError('Dim b = New Button("x")', null), /New Button needs a screen/);
  assert.match(crumbError('Dim x = 3\nx.setText("x")'), /cannot call method 'setText' on a Number/);
  assert.match(crumbError('Dim x\nx.setText("x")'), /on Nothing: only an object has methods/);
  assert.match(crumbError('Dim l = New Label("x")\nl.addTab("a", l)'), /a Label has no method 'addTab'/);
  assert.match(crumbError('Dim l = New ListPanel()\nl.addItem("a", "b")'), /'addItem' of a ListPanel takes 1 argument, found 2/);
  assert.match(crumbError('Dim b = New Button("x")\nb.setWidth(-1)'), /size of 0 or more/);
  assert.match(crumbError('Dim b = New Button("x")\nb.setLeft("0")'), /setLeft expects a Number as argument 1, got String/);
  assert.match(crumbError('Dim b = New Button("x")\nb.setVisible(1)'), /setVisible expects a Boolean/);
  assert.match(crumbError('Dim p = New Panel()\np.add(3)'), /add expects a widget as argument 1, got Number/);
  assert.match(crumbError('Dim l = New ListPanel()\nl.getItem(1.5)'), /whole Number/);
  assert.match(crumbError('Dim l = New ListPanel()\nPrint l.getItem(0)'), /index 0 is out of range/);
  assert.match(crumbError('Dim b = New Button("x")\nb.setText(b)'), /cannot show a Button/);
  assert.match(crumbError('Dim b = New Button("x")\nPrint "b=" & b'), /cannot convert a Button to a String/);
  assert.match(crumbError('Dim b = New Button("x")\nb.onClick("Nope")'), /no Sub named 'Nope'/);
  assert.match(crumbError('Dim b = New Button("x")\nb.onClick("F")\nFunction F()\n  Return 1\nEnd Function'),
    /an event handler must be a Sub/);
  assert.match(crumbError('Dim b = New Button("x")\nb.onClick("S")\nSub S(a, b, c)\nEnd Sub'),
    /takes 3 arguments; an event handler takes none, one/);
});

test('MiniPy: the same classes and methods, snake_case', () => {
  const { vm, host, out } = runPy([
    'count = [0]',
    'root = VPanel()',
    'root.fill()',
    'b = Button("Go")',
    'lab = Label("0")',
    'items = ListPanel()',
    'root.add(lab)',
    'root.add(b)',
    'root.add(items)',
    'items.set_flex(1)',
    'items.add_item("a")',
    'items.add_item("b")',
    'def clicked(w):',
    '    count[0] = count[0] + 1',
    '    lab.set_text(count[0])',
    '    print("clicked", w.get_text(), w is b, lab.get_text())',
    'def other():',
    '    print("other")',
    'def picked(w, i):',
    '    print("picked", i, i * 2, w.get_item(i))',
    'b.on_click(clicked)',
    'b.on_click(other)',
    'items.on_select(picked)',
    'lab.set_bounds(1, 2, 3.0, 4)',
    'print(root.get_count(), root.get_child(1) is b, b.get_parent() is root, lab.get_left(), lab.is_visible())',
    'print("ready")',
  ].join('\n'));
  host.click(2);
  host.fire(4, 'select', 1);
  settle(vm);
  assert.deepEqual(out, ['3 True True 1 True', 'ready', 'clicked Go True 1', 'other', 'picked 1 2 b']);
  assert.equal(host.get(1).props.fill, true);
});

test('MiniPy: widget errors are exceptions', () => {
  const { out } = runPy([
    'lab = Label("x")',
    'lst = ListPanel()',
    'def t0():',
    '    lab.nope()',
    'def t1():',
    '    lab.set_width("1")',
    'def t2():',
    '    lab.set_width(-1)',
    'def t3():',
    '    lab.set_text()',
    'def t4():',
    '    lst.get_item(3)',
    'def t5():',
    '    lst.add(lab)',
    'def t6():',
    '    lab.set_visible(1)',
    'for code in [t0, t1, t2, t3, t4, t5, t6]:',
    '    try:',
    '        code()',
    '    except Exception as e:',
    '        print(e)',
  ].join('\n'));
  assert.deepEqual(out, [
    "'Label' object has no attribute 'nope'",
    "set_width() expects a number as argument 1, not 'str'",
    'set_width() expects a size of 0 or more as argument 1, got -1',
    'set_text() takes 1 argument (0 given)',
    'index 3 is out of range 0..-1',
    "'ListPanel' object has no attribute 'add'",
    "set_visible() expects a bool as argument 1, not 'int'",
  ]);
  assert.throws(() => settle(new VM(py('Label("x")'), { out: () => {} })), /Label\(\) needs a screen/);
});

test('MiniPy: an exception in a handler ends the program', () => {
  const { vm, host } = runPy([
    'b = Button("Go")',
    'def boom():',
    '    raise ValueError("bad click")',
    'b.on_click(boom)',
  ].join('\n'));
  host.click(1);
  assert.throws(() => settle(vm), /bad click/);
});

test('Scheduler: a waiting process sleeps off the queues until a click', () => {
  const host = new FakeHost();
  const out = [];
  const scheduler = new Scheduler({ quantum: 1000 });
  scheduler.start = () => {};    // drive it by hand
  const process = scheduler.spawn(crumb([
    'Dim b = New Button("Go")',
    'b.onClick("Hit")',
    'Sub Hit()',
    '  Print "hit"',
    'End Sub',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  scheduler.runAll();
  assert.equal(process.state, 'waiting');
  assert.equal(scheduler.empty, true);
  host.click(1);
  assert.equal(process.state, 'ready');
  scheduler.runAll();
  assert.deepEqual(out, ['hit']);
  assert.equal(process.state, 'waiting');
  scheduler.kill(process.pid);
  host.click(1);                 // ignored once killed
  scheduler.runAll();
  assert.deepEqual(out, ['hit']);
});

test('examples/button-demo.crumb', () => {
  const host = new FakeHost();
  const out = [];
  const source = readFileSync(new URL('../examples/button-demo.crumb', import.meta.url), 'utf8');
  const vm = new VM(crumb(source), { gui: host, out: (t) => out.push(t), transcript: (t) => out.push(t) });
  settle(vm);
  for (let i = 0; i < 10; i++) host.click(3);
  settle(vm);
  assert.equal(host.get(2).props.text, 'Clicks: 10');
  assert.equal(host.get(1).props.text, 'Ten clicks. Impressive!');
  assert.equal(host.get(3).props.text, 'Keep going');
  assert.deepEqual([host.get(3).props.top, host.get(3).props.width, host.get(3).props.height], [126, 240, 40]);
  host.click(4);
  settle(vm);
  assert.equal(host.get(2).props.text, 'Clicks: 0');
  assert.deepEqual([host.get(3).props.left, host.get(3).props.top, host.get(3).props.width, host.get(3).props.height], [20, 84, 120, 32]);
  assert.deepEqual(out, ['Start over after 10 clicks']);
});

test('examples/widget-tour.crumb and widget-tour.py', () => {
  const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
  const crumbRun = runCrumb(read('widget-tour.crumb'));
  assert.equal(crumbRun.vm.waiting, true);
  const { host, vm } = crumbRun;
  const find = (className) => [...host.widgets.values()].find((w) => w.className === className);
  const addId = [...host.widgets.values()].find((w) => w.props.text === 'Add item').id;
  host.click(addId);
  host.click(addId);
  settle(vm);
  const list = find('ListPanel');
  assert.deepEqual(list.items, ['Item 1', 'Item 2']);
  host.call(list.id, 'select', [1]);
  settle(vm);
  assert.equal(find('Label').props.text, 'Picked Item 2');
  find('Menu').itemHandlers[1]('lightblue');
  settle(vm);
  assert.equal(list.props.background, 'lightblue');

  const pyRun = runPy(read('widget-tour.py'));
  assert.equal(pyRun.vm.waiting, true);
  const addPy = [...pyRun.host.widgets.values()].find((w) => w.props.text === 'Add item').id;
  pyRun.host.click(addPy);
  settle(pyRun.vm);
  assert.deepEqual([...pyRun.host.widgets.values()].find((w) => w.className === 'ListPanel').items, ['Item 1']);
});

/** Runs a VM until it halts or waits for events, waiting out save / load. */
async function settleAsync(vm) {
  for (;;) {
    if (vm.runSlice(1000)) return;
    if (vm.blocked) { await vm.blockedOn; continue; }
    if (vm.waiting) return;
  }
}

test('Crumb: the Viewport is a singleton at the top of the widget tree', () => {
  const { out } = runCrumb([
    'Dim vp = New Viewport()',
    'Dim b = New Button("Go")',
    'Dim row = New HPanel()',
    'row.add(New Label("x"))',
    'Print vp = New viewport(), b.getParent() = vp, vp.getCount(), vp.getChild(0) = b',
    'Print vp, row.getChild(0).getParent() = row',
  ].join('\n'));
  assert.deepEqual(out, ['True True 2 True', '<Viewport> True']);
});

test('Crumb: ids, findById and findByClass', () => {
  const { out } = runCrumb([
    'Dim vp = New Viewport()',
    'Dim page = New VPanel()',
    'Dim row = New HPanel()',
    'page.add(row)',
    'Dim ok = New Button("OK")',
    'ok.setId("ok")',
    'row.add(ok)',
    'Dim cancel = New Button("Cancel")',
    'row.add(cancel)',
    'Dim buttons = vp.findByClass("button")',
    'Print UBound(buttons), buttons(0) = ok, buttons(1) = cancel, ok.getId()',
    'Print vp.findById("ok") = ok, page.findById("ok") = ok, row.findById("nope") = Nothing',
    'Print UBound(row.findByClass("Label")), UBound(page.findByClass("HPanel"))',
  ].join('\n'));
  assert.deepEqual(out, ['1 True True ok', 'True True True', '-1 0']);
  assert.match(crumbError('Dim vp = New Viewport()\nPrint vp.findByClass("Gadget")'), /no class 'Gadget'/);
  assert.match(crumbError('Dim vp = New Viewport()\nvp.setLeft(3)'), /a Viewport has no method 'setLeft'/);
});

test('MiniPy: Viewport(), ids and finding', () => {
  const { out } = runPy([
    'vp = Viewport()',
    'b = Button("Go")',
    'b.set_id("go")',
    'found = vp.find_by_class("Button")',
    'print(vp is Viewport(), b.get_parent() is vp, vp.find_by_id("go") is b, len(found), found[0] is b)',
  ].join('\n'));
  assert.deepEqual(out, ['True True True 1 True']);
});

test('Crumb: toJson gives JSON text; fromJson rebuilds the screen and wires handlers by name', () => {
  const { vm, host, out } = runCrumb([
    'Dim vp = New Viewport()',
    'Dim b = New Button("Go")',
    'b.setId("go")',
    'b.onClick("Hit")',
    'Dim text = vp.toJson()',
    'Print JsonGet(text, "children.0.props.id")',
    'vp.clear()',
    'vp.fromJson(text)',
    'Dim again = vp.findById("go")',
    'Print again = b, again.getText()',
    'Sub Hit(w)',
    '  Print "hit", w.getId()',
    'End Sub',
  ].join('\n'));
  assert.deepEqual(out, ['go', 'False Go']);
  const newId = [...host.widgets.values()].find((w) => w.props.id === 'go').id;
  host.click(newId);
  settle(vm);
  assert.deepEqual(out, ['go', 'False Go', 'hit go']);
});

test('Crumb: save and load go through the database, and the program waits for them', async () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb([
    'Dim vp = New Viewport()',
    'Dim list = New ListPanel()',
    'list.setId("fruit")',
    'list.addItem("fig")',
    'list.onSelect("Picked")',
    'vp.save("main")',
    'Print "saved"',
    'vp.clear()',
    'Print vp.getCount()',
    'vp.load("main")',
    'Print vp.getCount(), vp.findById("fruit").getItem(0)',
    'Sub Picked(w, i)',
    '  Print "picked", i',
    'End Sub',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  await settleAsync(vm);
  assert.deepEqual(out, ['saved', '0', '1 fig']);
  assert.ok(host.saved.has('main'));
  const list = [...host.widgets.values()].find((w) => w.props.id === 'fruit');
  host.call(list.id, 'select', [0]);
  await settleAsync(vm);
  assert.deepEqual(out.slice(3), ['picked 0']);

  const fail = async (source) => {
    const v = new VM(crumb(source), { gui: new FakeHost(), out: () => {} });
    await assert.rejects(settleAsync(v), (e) => { fail.message = e.message; return true; });
    return fail.message;
  };
  assert.match(await fail('Dim vp = New Viewport()\nvp.load("nothing")'), /load: there is no saved viewport named 'nothing'/);
  assert.match(await fail([
    'Dim vp = New Viewport()',
    'vp.fromJson("{""class"":""Viewport"",""props"":{},""items"":[],""children"":[{""class"":""Button"",""props"":{""text"":""x""},""items"":[],""children"":[],""events"":[{""event"":""click"",""handler"":""Gone""}]}]}")',
  ].join('\n')), /fromJson: there is no Sub named 'Gone'/);
});

test('MiniPy: save and load, with handlers found by function name', async () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(py([
    'vp = Viewport()',
    'b = Button("Go")',
    'b.set_id("go")',
    'def hit(w):',
    '    print("hit", w.get_id())',
    'b.on_click(hit)',
    'vp.save("py")',
    'vp.clear()',
    'vp.load("py")',
    'print(vp.get_count(), vp.find_by_id("go") is b)',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  await settleAsync(vm);
  assert.deepEqual(out, ['1 False']);
  host.click([...host.widgets.values()].find((w) => w.props.id === 'go' && w.id !== 2).id);
  await settleAsync(vm);
  assert.deepEqual(out, ['1 False', 'hit go']);
});

test('Crumb: a composite is saved from any widget and loaded as many times as wanted', async () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb([
    'Dim vp = New Viewport()',
    'Dim form = New VPanel()',
    'Dim ok = New Button("OK")',
    'ok.setId("ok")',
    'ok.onClick("Pressed")',
    'form.add(ok)',
    'form.saveComposite("okForm")',
    'form.remove()',
    'Dim a = vp.loadComposite("okForm")',
    'Dim b = vp.loadComposite("okForm")',
    'Print a, a = b, a.getParent() = vp, a.findById("ok").getText(), vp.getCount()',
    'Sub Pressed(w)',
    '  Print "pressed", w.getParent() = b',
    'End Sub',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  await settleAsync(vm);
  assert.deepEqual(out, ['<VPanel> False True OK 2']);
  const second = [...host.widgets.values()].filter((w) => w.props.id === 'ok').pop();
  host.click(second.id);
  await settleAsync(vm);
  assert.deepEqual(out.slice(1), ['pressed True']);
  const v2 = new VM(crumb('Dim vp = New Viewport()\nDim x = vp.loadComposite("none")'), { gui: new FakeHost(), out: () => {} });
  await assert.rejects(settleAsync(v2), /loadComposite: there is no saved composite named 'none'/);
});

// ------------------------------------------------------------------ Board

test('Crumb: the Board is a singleton whose cells hold text and colours', () => {
  const { host, out } = runCrumb([
    'Dim b = New Board()',
    'Print b, b = New Board(), b.getRows(), b.getColumns(), b.isCheckered()',
    'b.setSize(3, 4)',
    'b.setCheckered(False)',
    'b.setSquareCells(True)',
    'b.setText(1, 2, "X")',
    'b.setText(0, 0, 7)',
    'b.setBackground(1, 2, "gold")',
    'b.setColor(1, 2, "red")',
    'Print b.getRows(), b.getColumns(), b.isCheckered(), b.isSquareCells()',
    'Print b.getText(1, 2) & b.getText(0, 0) & "[" & b.getText(2, 3) & "]", b.getBackground(1, 2), b.getColor(1, 2)',
    'Print b.getSelectedRow(), b.getSelectedColumn()',
    'b.select(2, 3)',
    'Print b.getSelectedRow(), b.getSelectedColumn()',
    'b.clearSelection()',
    'b.clear()',
    'Print "[" & b.getText(1, 2) & "]", b.getSelectedRow()',
  ].join('\n'));
  assert.deepEqual(out, [
    '<Board> True 8 8 True', '3 4 False True', 'X7[] gold red', '-1 -1', '2 3', '[] -1',
  ]);
  assert.equal(host.get(host.board).className, 'Board');
});

test('Crumb: a click on the Board calls its handler with the row and column', () => {
  const { vm, host, out } = runCrumb([
    'Dim b = New Board()',
    'b.setSize(3, 3)',
    'b.onClick("Clicked")',
    'Sub Clicked(board, row, column)',
    '  board.setText(row, column, "X")',
    '  Print row, column, board.getText(row, column)',
    'End Sub',
  ].join('\n'));
  assert.equal(vm.waiting, true);
  host.clickCell(2, 1);
  host.clickCell(0, 0);
  settle(vm);
  assert.deepEqual(out, ['2 1 X', '0 0 X']);
});

test('Crumb: a Board handler may take fewer arguments, but not more than three', () => {
  const { vm, host, out } = runCrumb('Dim b = New Board()\nb.onClick("Hit")\nSub Hit()\n  Print "hit"\nEnd Sub');
  host.clickCell(1, 1);
  settle(vm);
  assert.deepEqual(out, ['hit']);
  assert.match(
    crumbError('Dim b = New Board()\nb.onClick("H")\nSub H(a, b, c, d)\nEnd Sub'),
    /takes 4 arguments; this event's handler takes none, one \(the widget\) or up to 3/,
  );
  // Other events still pass one value.
  assert.match(
    crumbError('Dim l = New ListPanel()\nl.onSelect("H")\nSub H(a, b, c)\nEnd Sub'),
    /takes 3 arguments; an event handler takes none, one \(the widget\) or two/,
  );
});

test('Crumb: Board mistakes are runtime errors', () => {
  assert.match(crumbError('Dim b = New Board()\nb.setText(8, 0, "X")'), /the board has no cell at row 8, column 0/);
  assert.match(crumbError('Dim b = New Board()\nb.setSize(0, 3)'), /rows must be a whole number from 1 to 100/);
  assert.match(crumbError('Dim b = New Board()\nb.setText(1.5, 0, "X")'), /expects a whole Number as argument 1/);
  assert.match(crumbError('Dim b = New Board()\nb.setLeft(3)'), /a Board has no method 'setLeft'/);
  assert.match(crumbError('Dim b = New Board()', null), /New Board needs a screen/);
});

test('MiniPy: the Board, with snake_case methods and a function for clicks', () => {
  const { vm, host, out } = runPy([
    'b = Board()',
    'b.set_size(3, 3)',
    'b.set_checkered(False)',
    'turn = ["X"]',
    'def clicked(board, row, column):',
    '    if board.get_text(row, column) == "":',
    '        board.set_text(row, column, turn[0])',
    '        if turn[0] == "X":',
    '            turn[0] = "O"',
    '        else:',
    '            turn[0] = "X"',
    '    print(row, column, board.get_text(row, column))',
    'b.on_click(clicked)',
    'print(b is Board(), b.get_rows(), b.get_columns(), b.is_checkered(), b.get_selected_row())',
  ].join('\n'));
  assert.deepEqual(out, ['True 3 3 False -1']);
  host.clickCell(1, 1);
  host.clickCell(0, 2);
  host.clickCell(1, 1);
  settle(vm);
  assert.deepEqual(out, ['True 3 3 False -1', '1 1 X', '0 2 O', '1 1 X']);
});

test('examples/tic-tac-toe.crumb and tic-tac-toe.py', () => {
  const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
  for (const run of [() => runCrumb(read('tic-tac-toe.crumb')), () => runPy(read('tic-tac-toe.py'))]) {
    const { vm, host, out } = run();
    const board = host.get(host.board);
    assert.deepEqual([board.props.rows, board.props.columns, board.props.checkered], [3, 3, false]);
    // X takes the top row; O plays twice in the middle row; a click on a
    // taken cell is ignored.
    for (const [row, column] of [[0, 0], [1, 0], [0, 1], [0, 1], [1, 1], [0, 2]]) host.clickCell(row, column);
    settle(vm);
    assert.equal(out.at(-1), 'X wins! Click the board to play again.');
    assert.deepEqual(['0,0', '0,1', '0,2', '1,0', '1,1'].map((k) => board.cells.get(k).text), ['X', 'X', 'X', 'O', 'O']);
    assert.equal(board.cells.get('0,1').background, '#9acd32');
    assert.equal(board.cells.get('1,0').color, '#c03030');
    host.clickCell(2, 2);            // starts a new game
    settle(vm);
    assert.equal(board.cells.size, 0);
    assert.equal(out.at(-1), 'X to move: click a square.');
  }
});

// ----------------------------------------------------------------- Canvas

test('Crumb: the Canvas is a singleton that draws in 2D and 3D', () => {
  const { host, out } = runCrumb([
    'Dim c = New Canvas()',
    'Print c, c = New Canvas(), c.getWidth(), c.getHeight(), c.isAutoUpdate()',
    'c.setSize(200, 100)',
    'c.setBackground("black")',
    'c.setColor("red")',
    'c.setLineWidth(2.5)',
    'c.clear()',
    'c.line(0, 0, 200, 100)',
    'c.fillRect(10, 10, 30, 20)',
    'c.fillCircle(100, 50, 12.5)',
    'c.fillTriangle(0, 0, 10, 0, 5, 8)',
    'c.text(4, 4, 42)',
    'c.orbit(30, 3, 6)',
    'c.fillBox3d(0, 0, 0, 1, 2, 3)',
    'c.line3d(0, 0, 0, 1, 1, 1)',
    'c.setAutoUpdate(False)',
    'c.update()',
    'Print c.getWidth(), c.getHeight(), c.isAutoUpdate(), c.isKeyDown("Left"), c.getMouseX()',
  ].join('\n'));
  assert.deepEqual(out, ['<Canvas> True 400 300 True', '200 100 False False 0']);
  const canvas = host.get(host.canvas);
  assert.deepEqual(canvas.drawn, [
    ['line', 0, 0, 200, 100],
    ['fillRect', 10, 10, 30, 20],
    ['fillCircle', 100, 50, 12.5],
    ['fillTriangle', 0, 0, 10, 0, 5, 8],
    ['text', 4, 4, '42'],
    ['orbit', 30, 3, 6],
    ['fillBox3d', 0, 0, 0, 1, 2, 3],
    ['line3d', 0, 0, 0, 1, 1, 1],
    ['update'],
  ]);
  assert.deepEqual([canvas.props.background, canvas.props.color, canvas.props.lineWidth], ['black', 'red', 2.5]);
});

test('Crumb: Canvas clicks pass x and y, keys their name, and keys can be asked for', () => {
  const { vm, host, out } = runCrumb([
    'Dim c = New Canvas()',
    'c.onClick("Clicked")',
    'c.onKey("Pressed")',
    'Sub Clicked(canvas, x, y)',
    '  Print "click", x, y, canvas.getMouseX(), canvas.getMouseY()',
    'End Sub',
    'Sub Pressed(canvas, key)',
    '  Print "key", key, canvas.isKeyDown("LEFT"), canvas.isKeyDown("Right")',
    'End Sub',
  ].join('\n'));
  host.clickCanvas(120, 45);
  host.pressKey('Left');
  settle(vm);
  assert.deepEqual(out, ['click 120 45 120 45', 'key left True False']);
});

test('Crumb: Canvas mistakes are load or runtime errors', () => {
  assert.match(crumbError('Dim c = New Canvas()\nc.setSize(0, 10)'), /width must be a number from 1 to 4000/);
  assert.match(crumbError('Dim c = New Canvas()\nc.line(1, 2, 3, "x")'), /line expects a Number as argument 4/);
  assert.match(crumbError('Dim c = New Canvas()\nc.setLeft(3)'), /a Canvas has no method 'setLeft'/);
  const { errors } = compile('Dim c = New Canvas()\nc.line(1, 2, 3)', { filename: 't.crumb' });
  assert.equal(errors.length, 1);
});

test('MiniPy: the Canvas, with snake_case methods', () => {
  const { vm, host, out } = runPy([
    'c = Canvas()',
    'c.set_size(100, 100)',
    'c.set_color("#336699")',
    'c.fill_rect(0, 0, 10, 10)',
    'c.fill_box3d(0, 0, 0, 1, 1, 1)',
    'c.fill_triangle3d(0, 0, 0, 1, 0, 0, 0, 1, 0)',
    'c.look_at(0, 1, 0)',
    'c.set_auto_update(False)',
    'c.update()',
    'def clicked(canvas, x, y):',
    '    print(x, y, canvas.is_key_down("a"))',
    'c.on_click(clicked)',
    'print(c is Canvas(), c.get_width(), c.is_auto_update())',
  ].join('\n'));
  host.pressKey('a');
  host.clickCanvas(7, 9);
  settle(vm);
  assert.deepEqual(out, ['True 100 False', '7 9 True']);
  assert.deepEqual(host.get(host.canvas).drawn.map((d) => d[0]),
    ['fillRect', 'fillBox3d', 'fillTriangle3d', 'lookAt', 'update']);
});

test('examples/canvas-demo.crumb and canvas-demo.py', () => {
  const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
  for (const [make, source] of [[crumb, read('canvas-demo.crumb')], [py, read('canvas-demo.py')]]) {
    const host = new FakeHost();
    const out = [];
    const vm = new VM(make(source), { gui: host, out: (t) => out.push(t), sleep: () => {} });
    settle(vm);
    const canvas = host.get(host.canvas);
    assert.equal(canvas.drawn.filter((d) => d[0] === 'fillRect').length, 6);
    assert.deepEqual(canvas.drawn.find((d) => d[0] === 'fillRect'), ['fillRect', 45, 176, 40, 84]);
    assert.deepEqual(out, ['Click the chart to see it in 3D.']);
    host.clickCanvas(10, 10);
    for (let i = 0; i < 50 && !canvas.drawn.some((d) => d[0] === 'update'); i++) vm.runSlice(1000);
    assert.equal(canvas.drawn.filter((d) => d[0] === 'fillBox3d').length, 6);
    assert.equal(canvas.drawn.filter((d) => d[0] === 'line3d').length, 14);
    assert.deepEqual(canvas.drawn.find((d) => d[0] === 'orbit'), ['orbit', 0, 4, 9]);
    assert.equal(canvas.props.autoUpdate, false);
  }
});
