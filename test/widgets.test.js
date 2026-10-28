// Widget objects (New Button / Button(), HPanel, ListPanel, Window, ...) and
// the event loop that runs their handlers, with an in-memory widget host
// (./fake-widget-host.js) in place of the browser's AppScreen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile as compilePython } from '../src/vm/compiler/python/loader.js';
import { VM } from '../src/vm/vm.js';
import { Scheduler } from '../src/scheduling/scheduler.js';
import { WIDGET_CLASSES } from '../src/vm/runtime/widgets.js';
import { FakeHost } from './fake-widget-host.js';

function py(source) {
  const { chunk, loadErrors } = compilePython(source, { filename: 't.py' });
  assert.ok(chunk, JSON.stringify(loadErrors));
  return chunk;
}

/** Runs a VM until it halts or waits for events. */
function settle(vm) {
  while (!vm.runSlice(1000)) if (vm.waiting) return;
}

function runPy(source, host = new FakeHost()) {
  const out = [];
  const vm = new VM(py(source), { gui: host, out: (t) => out.push(t) });
  settle(vm);
  return { vm, host, out };
}

test('the classes are the toolkit\'s general-purpose widgets', () => {
  assert.deepEqual(WIDGET_CLASSES.map((c) => c.name), [
    'Viewport', 'Label', 'Button', 'Menu', 'Spacer', 'Panel', 'HPanel', 'VPanel', 'ButtonBar',
    'HSplitPanel', 'VSplitPanel', 'TabPanel', 'Window', 'TextPanel', 'MonacoPanel', 'ListPanel', 'Board', 'Canvas', 'Physics',
    'Ellipse', 'RoundedRect', 'Composite', 'Stack', 'Image', 'CheckGroupBox', 'RadioGroupBox', 'TextField', 'PasswordField', 'TextArea', 'SplitButton', 'SelectBox',
    'NavigationBar', 'Carousel', 'Drawer',
  ]);
  for (const c of WIDGET_CLASSES) {
    for (const m of c.methods) assert.match(m.py, /^[a-z_]+(3d)?$/, `${c.name}.${m.name}`);
  }
});

test('MiniPy: every class can be made by calling it', () => {
  const lines = WIDGET_CLASSES.map((c) => `print(${c.name}(${c.params.map(() => '"x"').join(', ')}))`);
  const { out } = runPy(lines.join('\n'));
  assert.deepEqual(out, WIDGET_CLASSES.map((c) => `<${c.name} object>`));
});

test('MiniPy: properties are set and read through methods; numbers are checked and rounded', () => {
  const { host, out } = runPy([
    'b = Button("Go")',
    'label = Label(42)',
    'label.set_text("n=" + str(1))',
    'b.set_bounds(1, 2, 3, 4.4)',
    'label.set_width(199.6)',
    'label.set_visible(False)',
    'b.set_enabled(False)',
    'b.set_background("red")',
    'print(label.get_text(), b.get_text(), b.get_left(), b.get_height(), label.get_width(), label.is_visible(), b.is_enabled())',
    'print(b is b, b is label, label is None)',
  ].join('\n'));
  assert.deepEqual(out, ['n=1 Go 1 4 200 False False', 'True False False']);
  assert.deepEqual(host.get(1).props, {
    visible: true, enabled: false, text: 'Go', left: 1, top: 2, width: 3, height: 4, background: 'red',
  });
});

test('MiniPy: containers hold widgets, and hand back the same objects', () => {
  const { host, out } = runPy([
    'row = HPanel()',
    'ok = Button("OK")',
    'gap = Spacer()',
    'row.add(gap)',
    'row.add(ok)',
    'ok.set_flex(2)',
    'row.set_padding(4)',
    'print(row.get_count(), row.get_child(1) is ok, ok.get_parent() is row, row.get_parent() is Viewport())',
    'ok.remove()',
    'print(row.get_count(), ok.get_parent() is None)',
    'win = Window("Main")',
    'win.set_content(row)',
    'bar = win.get_button_bar()',
    'cancel = bar.add_button("Cancel")',
    'print(win.get_content() is row, bar, bar is win.get_button_bar(), cancel.get_text(), cancel.get_parent() is bar)',
  ].join('\n'));
  assert.deepEqual(out, ['2 True True True', '1 True', 'True <ButtonBar object> True Cancel True']);
  assert.equal(host.get(2).props.flex, 2);
  assert.equal(host.get(1).props.padding, 4);
});

test('MiniPy: split panels, tab panels, text panels', () => {
  const { host, out } = runPy([
    'split = VSplitPanel()',
    'top = TextPanel("one")',
    'tabs = TabPanel()',
    'split.set_first(top)',
    'split.set_second(tabs)',
    'split.set_position(0.25)',
    'tabs.add_tab("Code", MonacoPanel("print(1)", "python"))',
    'tabs.add_tab("Notes", TextPanel(""))',
    'tabs.select(1)',
    'top.append(" two")',
    'top.set_read_only(True)',
    'print(split.get_first() is top, split.get_position(), tabs.get_count(), tabs.get_selected_index(), tabs.get_selected_text(), top.get_text(), top.is_read_only())',
  ].join('\n'));
  assert.deepEqual(out, ['True 0.25 2 1 Notes one two True']);
  assert.deepEqual(host.get(3).items, ['Code', 'Notes']);
});

test('MiniPy: Composite and Stack, with the layout settings in snake_case', () => {
  const { host, out } = runPy([
    'form = Composite()',
    'form.set_layout("grid")',
    'form.set_spacing(6)',
    'form.set_column_flex(1, 1)',
    'form.set_row_min_height(0, 24)',
    'name = Label("Name")',
    'field = TextPanel("")',
    'form.add(name)',
    'form.add(field)',
    'field.set_cell(0, 1)',
    'field.set_span(1, 2)',
    'field.set_align("left", "")',
    'name.set_edge("west")',
    'name.set_canvas_bounds("10", "", "", "5%", "", "")',
    'form.set_content_align("", "")',
    'form.set_reversed(False)',
    'print(form.get_layout(), form.get_count(), form.get_child(1) is field)',
    'pages = Stack()',
    'pages.add(Panel())',
    'pages.add(Panel())',
    'pages.select(1)',
    'pages.select_next()',
    'pages.select_previous()',
    'print(pages.get_count(), pages.get_selected_index())',
  ].join('\n'));
  assert.deepEqual(out, ['grid 2 True', '2 1']);
  const named = (id, method) => host.calls.filter((c) => c[0] === id && c[1] === method).map((c) => c.slice(2));
  assert.deepEqual(named(1, 'setLayout'), [['grid']]);
  assert.deepEqual(named(1, 'setColumnFlex'), [[1, 1]]);
  assert.deepEqual(named(1, 'setRowMinHeight'), [[0, 24]]);
  assert.deepEqual(named(3, 'setCell'), [[0, 1]]);
  assert.deepEqual(named(3, 'setSpan'), [[1, 2]]);
  assert.deepEqual(named(3, 'setAlign'), [['left', '']]);
  assert.deepEqual(named(2, 'setCanvasBounds'), [['10', '', '', '5%', '', '']]);
});

test('MiniPy: TextField and PasswordField, with their methods in snake_case', () => {
  const { host, out } = runPy([
    'name = TextField("Ann")',
    'name.set_placeholder("Your name")',
    'name.set_max_length(12)',
    'name.set_read_only(True)',
    'name.set_enabled(False)',
    'name.focus()',
    'name.select_all()',
    'secret = PasswordField()',
    'secret.set_text("hunter2")',
    'print(name.get_text(), name.get_placeholder(), name.get_max_length(), name.is_read_only(), name.is_enabled())',
    'print(secret.get_text(), PasswordField(), TextField("x"))',
  ].join('\n'));
  assert.deepEqual(out, ['Ann Your name 12 True False', 'hunter2 <PasswordField object> <TextField object>']);
  const named = (id, method) => host.calls.filter((c) => c[0] === id && c[1] === method).map((c) => c.slice(2));
  assert.deepEqual(named(1, 'setMaxLength'), [[12]]);
  assert.deepEqual(named(1, 'selectAll'), [[]]);
  assert.throws(() => runPy('TextField("x").set_max_length(-1)'), /set_max_length\(\) expects a size of 0 or more/);
  assert.throws(() => runPy('PasswordField("secret")'), /PasswordField\(\) takes 0 arguments/);
});

test('MiniPy: TextArea, SplitButton and SelectBox, with their methods in snake_case', () => {
  const { host, out } = runPy([
    'notes = TextArea("a")',
    'notes.set_wrap(False)',
    'notes.append("b")',
    'notes.set_placeholder("Notes")',
    'save = SplitButton("Save")',
    'def save_as(button, label):',
    '    pass',
    'save.add_item("Save As...", save_as)',
    'save.add_separator()',
    'save.set_enabled(False)',
    'pick = SelectBox()',
    'for name in ["red", "green"]:',
    '    pick.add_item(name)',
    'pick.set_item(1, "blue")',
    'pick.select(1)',
    'print(notes.get_text(), notes.is_wrap(), save.get_text(), save.is_enabled(), pick.get_count(), pick.get_item(1), pick.get_selected_index())',
  ].join('\n'));
  assert.deepEqual(out, ['ab False Save False 2 blue 1']);
  const named = (id, method) => host.calls.filter((c) => c[0] === id && c[1] === method).map((c) => c.slice(2));
  assert.deepEqual(named(1, 'setWrap'), [[false]]);
  assert.deepEqual(named(1, 'append'), [['b']]);
  assert.equal(named(2, 'addItem').length, 1);
  assert.deepEqual(named(3, 'addItem'), [['red'], ['green']]);
  assert.deepEqual(named(3, 'setItem'), [[1, 'blue']]);
  assert.throws(() => runPy('SelectBox().select("a")'), /select\(\) expects an int as argument 1/);
  assert.throws(() => runPy('SelectBox("x")'), /SelectBox\(\) takes 0 arguments/);
});

test('MiniPy: NavigationBar, Carousel and Drawer, with their methods in snake_case', () => {
  const { host, out } = runPy([
    'bar = NavigationBar("Inbox")',
    'bar.set_back_text("Mail")',
    'bar.set_action_text("Edit")',
    'def back(widget):',
    '    pass',
    'bar.on_back(back)',
    'pages = Carousel()',
    'for i in range(3):',
    '    pages.add(Composite())',
    'pages.set_dots(False)',
    'pages.select(2)',
    'pages.select_previous()',
    'menu = Drawer()',
    'menu.set_side("right")',
    'menu.set_panel_size(200)',
    'menu.set_dismiss_on_tap(False)',
    'menu.set_layout("vbox")',
    'menu.add(Label("Settings"))',
    'menu.set_open(True)',
    'menu.toggle()',
    'print(bar.get_title(), bar.get_back_text(), bar.get_action_text(), pages.get_count(), pages.is_dots(), menu.get_side(), menu.get_panel_size(), menu.get_count())',
  ].join('\n'));
  assert.deepEqual(out, ['Inbox Mail Edit 3 False right 200 1']);
  const named = (id, method) => host.calls.filter((c) => c[0] === id && c[1] === method).map((c) => c.slice(2));
  assert.deepEqual(named(2, 'setDots'), [[false]]);
  assert.deepEqual(named(2, 'select'), [[2], [1]]);
  assert.deepEqual(named(6, 'setSide'), [['right']]);
  assert.deepEqual(named(6, 'setPanelSize'), [[200]]);
  assert.deepEqual(named(6, 'setOpen'), [[true]]);
  assert.deepEqual(named(6, 'toggle'), [[]]);
  assert.throws(() => runPy('Drawer().set_panel_size(-5)'), /set_panel_size\(\) expects a size of 0 or more/);
  assert.throws(() => runPy('NavigationBar()'), /NavigationBar\(\) takes 1 argument/);
});

test('MiniPy: layout settings are checked before the host sees them', () => {
  assert.throws(() => runPy(['c = Composite()', 'c.set_column_flex("a", 1)'].join('\n')),
    /set_column_flex\(\) expects an int as argument 1/);
  assert.throws(() => runPy(['c = Composite()', 'c.set_spacing(-1)'].join('\n')), /set_spacing\(\) expects a size of 0 or more/);
});

test('MiniPy: handlers take none, one or two arguments', () => {
  const { vm, host, out } = runPy([
    'def chosen(menu, label):',
    '    print("chose", label, menu.get_text())',
    'def quit():',
    '    print("quit")',
    'def typed(w, text):',
    '    print("typed", text)',
    'def submitted(w):',
    '    print("submitted", w.get_text())',
    'm = Menu("File")',
    'm.add_item("Open", chosen)',
    'm.add_separator()',
    'm.add_item("Quit", quit)',
    't = TextPanel("")',
    't.on_change(typed)',
    't.on_submit(submitted)',
  ].join('\n'));
  host.get(1).itemHandlers[0]('Open');
  host.get(1).itemHandlers[1]('Quit');
  host.get(2).props.text = 'hi';
  host.fire(2, 'change', 'hi');
  host.fire(2, 'submit');
  settle(vm);
  assert.deepEqual(out, ['chose Open File', 'quit', 'typed hi', 'submitted hi']);
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

test('examples/layouts-tour.py', () => {
  const source = readFileSync(new URL('../examples/layouts-tour.py', import.meta.url), 'utf8');
  const { vm, host, out } = runPy(source);
  assert.deepEqual(out, []);
  const layouts = host.calls.filter((c) => c[1] === 'setLayout').map((c) => c[2]);
  assert.deepEqual(layouts, ['vbox', 'hbox', 'grid', 'dock']);
  assert.equal(host.calls.filter((c) => c[1] === 'setEdge').length, 5);
  const pages = [...host.widgets.values()].find((w) => w.className === 'Stack');
  assert.equal(pages.children.length, 3);
  const more = [...host.widgets.values()].find((w) => w.props.text === 'Next page');
  assert.equal(pages.selected, 0);
  host.click(more.id);
  settle(vm);
  assert.equal(pages.selected, 1);
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
  const process = scheduler.spawn(py([
    'def hit():',
    '    print("hit")',
    'b = Button("Go")',
    'b.on_click(hit)',
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

test('examples/widget-tour.py', () => {
  const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
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

test('MiniPy: to_json gives JSON text; from_json rebuilds the screen and wires handlers by name', () => {
  const { vm, host, out } = runPy([
    'def hit(w):',
    '    print("hit", w.get_id())',
    'vp = Viewport()',
    'b = Button("Go")',
    'b.set_id("go")',
    'b.on_click(hit)',
    'text = vp.to_json()',
    'print("go" in text)',
    'vp.clear()',
    'vp.from_json(text)',
    'again = vp.find_by_id("go")',
    'print(again is b, again.get_text())',
  ].join('\n'));
  assert.deepEqual(out, ['True', 'False Go']);
  const newId = [...host.widgets.values()].find((w) => w.props.id === 'go').id;
  host.click(newId);
  settle(vm);
  assert.deepEqual(out, ['True', 'False Go', 'hit go']);
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

test('MiniPy: a composite is saved from any widget and loaded as many times as wanted', async () => {
  const host = new FakeHost();
  const out = [];
  const vm = new VM(py([
    'def pressed(w):',
    '    print("pressed", w.get_parent() is b)',
    'vp = Viewport()',
    'form = VPanel()',
    'ok = Button("OK")',
    'ok.set_id("ok")',
    'ok.on_click(pressed)',
    'form.add(ok)',
    'form.save_composite("okForm")',
    'form.remove()',
    'a = vp.load_composite("okForm")',
    'b = vp.load_composite("okForm")',
    'print(a, a is b, a.get_parent() is vp, a.find_by_id("ok").get_text(), vp.get_count())',
  ].join('\n')), { gui: host, out: (t) => out.push(t) });
  await settleAsync(vm);
  assert.deepEqual(out, ['<VPanel object> False True OK 2']);
  const second = [...host.widgets.values()].filter((w) => w.props.id === 'ok').pop();
  host.click(second.id);
  await settleAsync(vm);
  assert.deepEqual(out.slice(1), ['pressed True']);
  const v2 = new VM(py('vp = Viewport()\nx = vp.load_composite("none")'), { gui: new FakeHost(), out: () => {} });
  await assert.rejects(settleAsync(v2), /there is no saved composite named 'none'/);
});

// ------------------------------------------------------------------ Board

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

test('examples/tic-tac-toe.py', () => {
  const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
  for (const run of [() => runPy(read('tic-tac-toe.py'))]) {
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

test('examples/canvas-demo.py', () => {
  const read = (name) => readFileSync(new URL(`../examples/${name}`, import.meta.url), 'utf8');
  for (const [make, source] of [[py, read('canvas-demo.py')]]) {
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
