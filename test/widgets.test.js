// Widget builtins (AddButton / add_button, ...) and the event loop that runs
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

test('Crumb: widgets are created, placed, sized and read back', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb([
    'Dim b = AddButton("Go", 10, 20, 100, 30.4)',
    'Dim l = AddLabel(42, 10, 60, 200, 24)',
    'SetText(l, "n=" & 1)',
    'SetBounds(b, 1, 2, 3, 4)',
    'Print b, l, GetText(l), GetText(b)',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  assert.equal(vm.halted, true);
  assert.deepEqual(out, ['1 2 n=1 Go']);
  assert.deepEqual(host.widgets.get(1), { kind: 'button', text: 'Go', box: [1, 2, 3, 4], clicks: [] });
  assert.deepEqual(host.widgets.get(2).box, [10, 60, 200, 24]);
  assert.equal(host.widgets.get(2).kind, 'label');
});

test('Crumb: OnClick runs the Sub for each click, after the module code', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(crumb([
    'Dim n = 0',
    'Dim b = AddButton("Go", 0, 0, 50, 20)',
    'Dim l = AddLabel("0", 0, 30, 50, 20)',
    'OnClick(b, "clicked")',
    'Print "ready"',
    'Sub Clicked(w)',
    '  n = n + 1',
    '  SetText(l, n)',
    '  Print "click", w, n',
    'End Sub',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  assert.equal(vm.waiting, true);
  assert.equal(vm.halted, false);
  assert.deepEqual(out, ['ready']);
  host.click(1);
  host.click(1);                 // queued: both run, in order
  settle(vm);
  assert.deepEqual(out, ['ready', 'click 1 1', 'click 1 2']);
  assert.equal(host.getText(2), '2');
  assert.equal(vm.waiting, true);
});

test('Crumb: widget errors', () => {
  const run = (source, gui = new FakeHost()) => {
    const vm = new VM(crumb(source), { gui, out: () => {} });
    assert.throws(() => settle(vm), (e) => { run.message = e.message; return true; });
    return run.message;
  };
  assert.match(run('Dim b = AddButton("x", 0, 0, 1, 1)', null), /needs a screen/);
  assert.match(run('SetText(3, "x")'), /no widget 3/);
  assert.match(run('Dim b = AddButton("x", 0, 0, -1, 1)'), /width and height of 0 or more/);
  assert.match(run('Dim b = AddButton("x", "0", 0, 1, 1)'), /expects a Number as argument 2/);
  assert.match(run('Dim b = AddButton("x", 0, 0, 1, 1)\nOnClick(b, "Nope")'), /no Sub named 'Nope'/);
  assert.match(run('Dim b = AddButton("x", 0, 0, 1, 1)\nOnClick(b, "F")\nFunction F()\n  Return 1\nEnd Function'),
    /a click handler must be a Sub/);
});

test('MiniPy: add_button, on_click and handlers with or without the widget', () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(py([
    'count = [0]',
    'b = add_button("Go", 5, 5, 80, 24)',
    'lab = add_label("0", 5, 40, 80, 24)',
    'def clicked(w):',
    '    count[0] = count[0] + 1',
    '    set_text(lab, count[0])',
    '    print("clicked", w, get_text(lab))',
    'def other():',
    '    print("other")',
    'on_click(b, clicked)',
    'on_click(b, other)',
    'set_bounds(lab, 1, 2, 3.0, 4)',
    'print("ready")',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  host.click(1);
  settle(vm);
  assert.deepEqual(out, ['ready', 'clicked 1 1', 'other']);
  assert.deepEqual(host.widgets.get(2).box, [1, 2, 3, 4]);
});

test('MiniPy: an exception in a handler ends the program', () => {
  const host = new FakeHost();
  const vm = new VM(py([
    'b = add_button("Go", 0, 0, 10, 10)',
    'def boom():',
    '    raise ValueError("bad click")',
    'on_click(b, boom)',
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
    'Dim b = AddButton("Go", 0, 0, 50, 20)',
    'OnClick(b, "Hit")',
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
