// BoardPanel (src/ui/widgets/board-panel.js) and a console's widget host for
// it (src/ui/board-host.js), run against a small stand-in for the DOM: just
// the parts of document and its elements the widget uses.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.textContent = '';
    this.className = '';
    const names = new Set();
    this.classList = {
      add: (n) => names.add(n),
      contains: (n) => names.has(n),
      toggle: (n, on) => (on ? names.add(n) : names.delete(n)),
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  closest() { return this; }
}

let BoardPanel;
let ConsoleOutputHost;

before(async () => {
  globalThis.document = {
    createElement: (tag) => new FakeElement(tag),
    getElementById: () => null,
    head: new FakeElement('head'),
  };
  globalThis.CustomEvent ??= class extends Event {
    constructor(type, init = {}) { super(type, init); this.detail = init.detail ?? null; }
  };
  ({ BoardPanel } = await import('../src/ui/widgets/board-panel.js'));
  ({ ConsoleOutputHost } = await import('../src/ui/board-host.js'));
});

test('a board is 8 by 8 and checkered by default', () => {
  const board = new BoardPanel();
  assert.equal(board.rows, 8);
  assert.equal(board.columns, 8);
  assert.equal(board.grid.children.length, 64);
  const dark = (r, c) => board._cell(r, c).classList.contains('cr-board-dark');
  assert.equal(dark(0, 0), false);
  assert.equal(dark(0, 1), true);
  assert.equal(dark(7, 7), false);
  board.checkered = false;
  assert.equal(dark(0, 1), false);
});

test('cells hold text and colours, and clear() empties them', () => {
  const board = new BoardPanel({ rows: 3, columns: 3, checkered: false });
  board.setText(1, 1, 'X');
  board.setText(0, 2, 'O');
  board.setBackground(1, 1, 'gold');
  board.setColor(1, 1, 'red');
  assert.equal(board.getText(1, 1), 'X');
  assert.equal(board.getText(0, 2), 'O');
  assert.equal(board.getText(2, 2), '');
  assert.equal(board.getBackground(1, 1), 'gold');
  assert.equal(board.getColor(1, 1), 'red');
  board.select(1, 1);
  board.clear();
  assert.equal(board.getText(1, 1), '');
  assert.equal(board.getBackground(1, 1), '');
  assert.equal(board.getColor(1, 1), '');
  assert.equal(board.selected, null);
  assert.equal(board.rows, 3);
});

test('cells off the board and bad sizes are RangeErrors', () => {
  const board = new BoardPanel({ rows: 3, columns: 4 });
  assert.throws(() => board.setText(3, 0, 'X'), RangeError);
  assert.throws(() => board.getText(0, 4), RangeError);
  assert.throws(() => board.getText(-1, 0), RangeError);
  assert.throws(() => board.getText(0.5, 0), RangeError);
  assert.throws(() => board.setSize(0, 3), RangeError);
  assert.throws(() => new BoardPanel({ rows: 3, columns: 101 }), RangeError);
  assert.throws(() => board.add({}), /cannot contain/);
});

test('setSize() rebuilds and empties the board', () => {
  const board = new BoardPanel({ rows: 3, columns: 3 });
  board.setText(2, 2, 'X');
  board.setSize(6, 7);
  assert.equal(board.rows, 6);
  assert.equal(board.columns, 7);
  assert.equal(board.grid.children.length, 42);
  assert.equal(board.getText(2, 2), '');
  assert.equal(board.grid.style.gridTemplateColumns, 'repeat(7, 1fr)');
});

test('one cell at a time is selected, with select events', () => {
  const board = new BoardPanel();
  const events = [];
  board.element.addEventListener('select', (e) => events.push(e.detail));
  board.select(2, 3);
  board.select(2, 3);          // no change, no event
  board.select(4, 5);
  assert.deepEqual(board.selected, { row: 4, column: 5 });
  assert.equal(board._cell(2, 3).getAttribute('aria-selected'), null);
  assert.equal(board._cell(4, 5).getAttribute('aria-selected'), 'true');
  board.clearSelection();
  assert.equal(board.selected, null);
  assert.deepEqual(events, [{ row: 2, column: 3 }, { row: 4, column: 5 }, null]);
});

test('clicking a cell fires cellclick with its row, column and text', () => {
  const board = new BoardPanel();
  board.setText(6, 1, 'P');
  let detail = null;
  board.element.addEventListener('cellclick', (e) => { detail = e.detail; });
  const click = new Event('click');
  Object.defineProperty(click, 'target', { value: board._cell(6, 1) });
  board.grid.dispatchEvent(click);
  assert.deepEqual(detail, { row: 6, column: 1, text: 'P' });
  assert.equal(board.selected, null);
});

test('cells fill the panel, or stay square and centred', () => {
  const board = new BoardPanel({ rows: 4, columns: 8 });
  board.setBounds(0, 0, 400, 300);
  board.layout();
  assert.equal(board.grid.style.width, '400px');
  assert.equal(board.grid.style.height, '300px');
  board.squareCells = true;      // 50px cells: 400 x 200, centred vertically
  assert.equal(board.grid.style.width, '400px');
  assert.equal(board.grid.style.height, '200px');
  assert.equal(board.grid.style.top, '50px');
  assert.equal(board.grid.style.left, '0px');
});

// ------------------------------------------------------ ConsoleOutputHost

function consoleHost() {
  const tabs = [];
  const canvasPanel = { element: new FakeElement('div'), reset() {} };
  const outputPanel = { boardPanel: new BoardPanel(), canvasPanel, selectTab: (label) => tabs.push(label) };
  return { host: new ConsoleOutputHost(outputPanel), board: outputPanel.boardPanel, tabs };
}

function clickCell(board, row, column) {
  const click = new Event('click');
  Object.defineProperty(click, 'target', { value: board._cell(row, column) });
  board.grid.dispatchEvent(click);
}

test('a console\'s host makes only the Board, and shows its tab', () => {
  const { host, tabs } = consoleHost();
  assert.equal(host.has(1), false);
  const id = host.create('Board', []);
  assert.equal(host.create('Board', []), id);
  assert.equal(host.has(id), true);
  assert.equal(host.classOf(id), 'Board');
  assert.deepEqual(tabs, ['Board', 'Board']);
  assert.throws(() => host.create('Button', ['x']), { name: 'WidgetError', message: /a Button needs a screen/ });
});

test('the host runs the Board\'s methods on the console\'s BoardPanel', () => {
  const { host, board } = consoleHost();
  const id = host.create('Board', []);
  host.call(id, 'setSize', [3, 3]);
  host.call(id, 'setCheckered', [false]);
  host.call(id, 'setText', [1, 1, 'X']);
  host.call(id, 'setBackground', [1, 1, 'gold']);
  host.call(id, 'select', [2, 0]);
  assert.equal(board.rows, 3);
  assert.equal(board.checkered, false);
  assert.equal(board.getText(1, 1), 'X');
  assert.equal(host.call(id, 'getText', [1, 1]), 'X');
  assert.equal(host.call(id, 'getBackground', [1, 1]), 'gold');
  assert.deepEqual([host.call(id, 'getRows', []), host.call(id, 'getColumns', [])], [3, 3]);
  assert.deepEqual([host.call(id, 'getSelectedRow', []), host.call(id, 'getSelectedColumn', [])], [2, 0]);
  host.call(id, 'clearSelection', []);
  assert.equal(host.call(id, 'getSelectedRow', []), -1);
  assert.throws(() => host.call(id, 'setText', [3, 0, 'X']), { name: 'WidgetError', message: /no cell at row 3, column 0/ });
  assert.throws(() => host.call(id, 'setSize', [0, 3]), { name: 'WidgetError' });
  assert.throws(() => host.call(id, 'setLeft', [3]), { name: 'WidgetError', message: /no method 'setLeft'/ });
});

test('onClick passes the row and column; reset() drops the handler and empties the board', () => {
  const { host, board } = consoleHost();
  const id = host.create('Board', []);
  const clicks = [];
  host.call(id, 'onClick', [(row, column) => clicks.push([row, column])]);
  host.call(id, 'setSize', [3, 3]);
  host.call(id, 'setSquareCells', [true]);
  host.call(id, 'setText', [0, 0, 'X']);
  clickCell(board, 2, 1);
  assert.deepEqual(clicks, [[2, 1]]);
  host.reset();
  assert.equal(host.has(id), false);
  assert.deepEqual([board.rows, board.columns, board.checkered, board.squareCells], [8, 8, true, false]);
  assert.equal(board.getText(0, 0), '');
  clickCell(board, 2, 1);
  assert.deepEqual(clicks, [[2, 1]]);
});
