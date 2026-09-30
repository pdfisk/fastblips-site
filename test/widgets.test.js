// Widget objects (New Button / Button(), ...) and the event loop that runs
// click handlers, with a fake widget host in place of the browser's AppScreen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/index.js';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { readFileSync } from 'node:fs';

class FakeHost {
  constructor() { this.widgets = new Map(); this.next = 1; }
  create(kind, text, left, top, width, height) {
    const id = this.next++;
    this.widgets.set(id, { kind, text, box: [left, top, width, height], clicks: [] });
    return id;
  }
  has(id) { return this.widgets.has(id); }
  setText(id, text) { this.widgets.get(id).text = text; }
  getText(id) { return this.widgets.get(id).text; }
  setBounds(id, ...box) { this.widgets.get(id).box = box; }
  onClick(id, callback) { this.widgets.get(id).clicks.push(callback); }
  click(id) { for (const cb of this.widgets.get(id).clicks) cb(); }
}

function crumb(source) {
  const { chunk, errors } = compile(source, { filename: 't.crumb' });
  assert.deepEqual(errors, []);
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

test('Crumb: New makes widgets; their methods place, size and read them', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb([
    'Dim b = New Button("Go")',
    'Dim label = new label(42)',
    'label.setText("n=" & 1)',
    'b.setBounds(1, 2, 3, 4.4)',
    'label.setLeft(10)',
    'label.setTop(60)',
    'label.SetWidth(199.6)',
    'label.setHeight(24)',
    'Print label.getText(), b.getText(), b.getLeft(), b.getTop(), b.getWidth(), b.getHeight()',
    'Print label.getLeft(), label.getTop(), label.getWidth(), label.getHeight()',
    'Print b, New Label("x").getHeight(), b = b, b = label',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  assert.equal(vm.halted, true);
  assert.deepEqual(out, ['n=1 Go 1 2 3 4', '10 60 200 24', '<Button> 24 True False']);
  assert.deepEqual(host.widgets.get(1), { kind: 'button', text: 'Go', box: [1, 2, 3, 4], clicks: [] });
  assert.deepEqual(host.widgets.get(2).box, [10, 60, 200, 24]);
  assert.equal(host.widgets.get(2).kind, 'label');
  assert.deepEqual(host.widgets.get(3).box, [0, 0, 100, 24]);   // a new widget's box
});

test('Crumb: a variable may share its name with a class', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb('Dim label = New Label("Hello")\nlabel.setWidth(100)\nPrint label.getWidth()'),
    { gui: host, out: (t) => out.push(t) });
  settle(vm);
  assert.deepEqual(out, ['100']);
});

test('Crumb: onClick runs the Sub for each click, after the module code', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb([
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
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  assert.equal(vm.waiting, true);
  assert.equal(vm.halted, false);
  assert.deepEqual(out, ['ready']);
  host.click(1);
  host.click(1);                 // queued: both run, in order
  settle(vm);
  assert.deepEqual(out, ['ready', 'click Go 1', 'click Go 2']);
  assert.equal(host.getText(2), '2');
  assert.equal(vm.waiting, true);
});

test('Crumb: object load errors', () => {
  const errorsOf = (source) => compile(source, { filename: 't.crumb' }).errors.map((e) => e.message);
  assert.match(errorsOf('Dim x = New Window("a")')[0], /no class 'Window': the classes are Button, Label/);
  assert.match(errorsOf('Dim x = New Label()')[0], /'New Label' takes 1 argument, found 0/);
  assert.match(errorsOf('Dim x = New Label')[0], /expected '\(' after 'New Label'/);
  assert.match(errorsOf('Dim x = 1\nx.grow(2)')[0], /no method 'grow'/);
  assert.match(errorsOf('Dim x = 1\nx.setWidth()')[0], /'setWidth' takes 1 argument, found 0/);
  assert.match(errorsOf('Dim x = 1\nx.setWidth = 3')[0], /needs parentheses/);
  assert.match(errorsOf('Dim x = 1\nx.getWidth() = 3')[0], /cannot assign to a method call/);
  assert.match(errorsOf('Dim new = 1')[0], /'New' is a reserved word/);
});

test('Crumb: widget runtime errors', () => {
  const run = (source, gui = new FakeHost()) => {
    const vm = new VM(crumb(source), { gui, out: () => {} });
    assert.throws(() => settle(vm), (e) => { run.message = e.message; return true; });
    return run.message;
  };
  assert.match(run('Dim b = New Button("x")', null), /New Button needs a screen/);
  assert.match(run('Dim x = 3\nx.setText("x")'), /cannot call method 'setText' on a Number/);
  assert.match(run('Dim x\nx.setText("x")'), /on Nothing: only an object has methods/);
  assert.match(run('Dim b = New Button("x")\nb.setWidth(-1)'), /width of 0 or more/);
  assert.match(run('Dim b = New Button("x")\nb.setLeft("0")'), /setLeft expects a Number as argument 1, got String/);
  assert.match(run('Dim b = New Button("x")\nb.setText(b)'), /cannot show a Button/);
  assert.match(run('Dim b = New Button("x")\nPrint "b=" & b'), /cannot convert a Button to a String/);
  assert.match(run('Dim b = New Button("x")\nb.onClick("Nope")'), /no Sub named 'Nope'/);
  assert.match(run('Dim b = New Button("x")\nb.onClick("F")\nFunction F()\n  Return 1\nEnd Function'),
    /a click handler must be a Sub/);
});

test('MiniPy: Label, Button, their methods and handlers with or without the widget', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(py([
    'count = [0]',
    'b = Button("Go")',
    'lab = Label("0")',
    'def clicked(w):',
    '    count[0] = count[0] + 1',
    '    lab.set_text(count[0])',
    '    print("clicked", w.get_text(), w is b, lab.get_text())',
    'def other():',
    '    print("other")',
    'b.on_click(clicked)',
    'b.on_click(other)',
    'lab.set_bounds(1, 2, 3.0, 4)',
    'lab.set_width(30)',
    'print(lab.get_left(), lab.get_top(), lab.get_width(), lab.get_height(), lab)',
    'print("ready")',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  host.click(1);
  settle(vm);
  assert.deepEqual(out, ['1 2 30 4 <Label object>', 'ready', 'clicked Go True 1', 'other']);
  assert.deepEqual(host.widgets.get(2).box, [1, 2, 30, 4]);
});

test('MiniPy: widget errors are exceptions', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(py([
    'lab = Label("x")',
    'try:',
    '    lab.nope()',
    'except AttributeError as e:',
    '    print(e)',
    'try:',
    '    lab.set_width("1")',
    'except TypeError as e:',
    '    print(e)',
    'try:',
    '    lab.set_width(-1)',
    'except ValueError as e:',
    '    print(e)',
    'try:',
    '    lab.set_text()',
    'except TypeError as e:',
    '    print(e)',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  assert.deepEqual(out, [
    "'Label' object has no attribute 'nope'",
    "set_width() expects a number, not 'str'",
    'set_width() expects a width of 0 or more, got -1',
    'set_text() takes 1 argument (0 given)',
  ]);
  assert.throws(() => settle(new VM(py('Label("x")'), { out: () => {} })), /Label\(\) needs a screen/);
});

test('MiniPy: an exception in a handler ends the program', () => {
  const host = new FakeHost();
  const vm = new VM(py([
    'b = Button("Go")',
    'def boom():',
    '    raise ValueError("bad click")',
    'b.on_click(boom)',
  ].join('\n')), { gui: host, out: () => {} });
  settle(vm);
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
  assert.equal(host.getText(2), 'Clicks: 10');
  assert.equal(host.getText(1), 'Ten clicks. Impressive!');
  assert.deepEqual(host.widgets.get(3).box, [20, 126, 240, 40]);
  assert.equal(host.getText(3), 'Keep going');
  host.click(4);
  settle(vm);
  assert.equal(host.getText(2), 'Clicks: 0');
  assert.deepEqual(host.widgets.get(3).box, [20, 84, 120, 32]);
  assert.deepEqual(out, ['Start over after 10 clicks']);
});
