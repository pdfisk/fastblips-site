// The database window's list: several records can be selected and given a
// category together, and Refresh starts afresh. Runs on the fake DOM of
// ./example-host.js, with an in-memory store in place of the server.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './example-host.js';

let ListPanel;
let PythonDatabaseWindow;
before(async () => {
  installDom();
  globalThis.confirm = () => globalThis.confirmAnswer ?? true;
  ({ ListPanel } = await import('../src/ui/widgets/list-panel.js'));
  ({ PythonDatabaseWindow } = await import('../src/ui/windows/database-window.js'));
});

const items = (n) => Array.from({ length: n }, (_, i) => ({ label: `row ${i}`, value: i + 1 }));

/** A list panel that records the select events it fires. */
function list(options) {
  const panel = new ListPanel({ items: items(5), ...options });
  const events = [];
  panel.element.addEventListener('select', (e) => events.push(e.detail.items.map((it) => it.value)));
  return { panel, events };
}

/** A mouse press on row i, with modifier keys. */
function press(panel, i, keys = {}) {
  const row = panel.list.children[i];
  const e = Object.assign(new Event('mousedown'), { ctrlKey: false, metaKey: false, shiftKey: false, ...keys });
  e.preventDefault = () => {};
  Object.defineProperty(e, 'target', { value: { closest: () => row } });
  panel.list.dispatchEvent(e);
}

test('ListPanel: a list is single-select unless made multiple', () => {
  const { panel, events } = list();
  press(panel, 1);
  press(panel, 3, { ctrlKey: true });
  assert.deepEqual(panel.selectedValues, [4]);
  assert.deepEqual(events, [[2], [4]]);
});

test('ListPanel multiple: Ctrl+click adds and removes rows, Shift+click selects a range, Ctrl+A all', () => {
  const { panel, events } = list({ multiple: true });
  press(panel, 1);
  press(panel, 3, { ctrlKey: true });
  assert.deepEqual(panel.selectedValues, [2, 4]);
  press(panel, 1, { metaKey: true });
  assert.deepEqual(panel.selectedValues, [4]);
  press(panel, 3, { shiftKey: true });                 // from row 1 (the last clicked) to row 3
  assert.deepEqual(panel.selectedValues, [2, 3, 4]);
  assert.deepEqual(panel.selectedIndices, [1, 2, 3]);
  press(panel, 0);                                     // a plain click selects one row
  assert.deepEqual(panel.selectedValues, [1]);
  const key = Object.assign(new Event('keydown'), { key: 'a', ctrlKey: true });
  key.preventDefault = () => {};
  panel.list.dispatchEvent(key);
  assert.deepEqual(panel.selectedValues, [1, 2, 3, 4, 5]);
  assert.deepEqual(events, [[2], [2, 4], [4], [2, 3, 4], [1], [1, 2, 3, 4, 5]]);
});

test('ListPanel multiple: the selection follows the values through new items; setting it fires nothing', () => {
  const { panel, events } = list({ multiple: true });
  panel.selectedValues = [2, 4, 9];
  assert.deepEqual(panel.selectedValues, [2, 4]);
  panel.items = items(3);                              // row 4 is gone
  assert.deepEqual(panel.selectedValues, [2]);
  assert.deepEqual(events, []);
  assert.equal(panel.list.children[1].getAttribute?.('aria-selected') ?? 'true', 'true');
});

// ------------------------------------------------------------ the window

/** An in-memory store, with the calls made to it. */
function fakeStore(records) {
  const rows = new Map(records.map((r) => [r.id, { ...r }]));
  const calls = [];
  return {
    calls, rows, space: 'peter', baseUrl: 'mem:',
    async list() { calls.push(['list']); return [...rows.values()].map((r) => ({ ...r })); },
    async get(id) { calls.push(['get', id]); return { ...rows.get(id) }; },
    async update(id, fields) {
      calls.push(['update', id, fields]);
      if (fields.category === 'bad') throw new Error('category is not included in the list');
      Object.assign(rows.get(id), fields);
      return { ...rows.get(id) };
    },
    async create(fields) { const id = rows.size + 1; rows.set(id, { id, ...fields }); return { ...rows.get(id) }; },
    async remove(id) { rows.delete(id); },
  };
}

const RECORDS = [
  { id: 1, name: 'alpha', content: 'print(1)\n', category: 'mobile-game' },
  { id: 2, name: 'bravo', content: 'print(2)\n', category: 'mobile-game' },
  { id: 3, name: 'charlie', content: 'print(3)\n', category: 'tutorial' },
  { id: 4, name: 'delta', content: 'print(4)\n', category: 'mobile-game' },
];

async function openWindow(records = RECORDS) {
  const store = fakeStore(records);
  const win = new PythonDatabaseWindow({ store, session: async () => ({ has_database_write_permission: true }) });
  await win.reload();
  return { win, store };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const pick = (win, label) => win.categoryMenu.items.find((it) => it.label === label);

test('database window: one record is loaded; Refresh clears the selection and the editor', async () => {
  const { win } = await openWindow();
  win.listPanel.select(1);
  await tick();
  assert.equal(win.current.name, 'bravo');
  assert.equal(win.recordPanel.content, 'print(2)\n');
  assert.ok(await win.refresh());
  assert.deepEqual(win.listPanel.selectedValues, []);
  assert.equal(win.current, null);
  assert.equal(win.recordPanel.content, '');
  assert.equal(win.recordPanel.name, '');
  assert.equal(win.listPanel.items.length, 4);
});

test('database window: Refresh asks before throwing away an edit, and keeps it if told to', async () => {
  const { win } = await openWindow();
  win.listPanel.select(0);
  await tick();
  win.recordPanel.content = 'print("changed")\n';
  globalThis.confirmAnswer = false;
  try {
    assert.equal(await win.refresh(), false);
  } finally { globalThis.confirmAnswer = undefined; }
  assert.equal(win.current.name, 'alpha');
  assert.equal(win.recordPanel.content, 'print("changed")\n');
  assert.deepEqual(win.listPanel.selectedValues, [1]);
});

test('database window: a category chosen for several records is stored on all of them by Save', async () => {
  const { win, store } = await openWindow();
  press(win.listPanel, 0);
  await tick();
  press(win.listPanel, 1, { ctrlKey: true });
  press(win.listPanel, 2, { ctrlKey: true });
  await tick();
  assert.deepEqual(win.batch.ids, [1, 2, 3]);
  assert.equal(win.current, null);
  assert.equal(win.recordPanel.content, '');
  assert.equal(win.saveButton.enabled, false, 'nothing to save yet');
  assert.equal(win.deleteButton.enabled, false, 'no deleting several at once');
  assert.equal(pick(win, 'Desktop Game').enabled(), true);
  assert.equal(win.shownCategory, null, 'they do not share a category');

  pick(win, 'Desktop Game').action();
  assert.equal(win.saveButton.enabled, true);
  assert.equal(pick(win, 'Desktop Game').checked(), true);
  assert.match(win.title, /3 records · Desktop Game/);
  assert.deepEqual(store.calls.filter((c) => c[0] === 'update'), [], 'nothing is stored before Save');

  assert.equal(await win.save(), 3);
  assert.deepEqual(store.calls.filter((c) => c[0] === 'update'),
    [['update', 1, { category: 'desktop-game' }], ['update', 2, { category: 'desktop-game' }], ['update', 3, { category: 'desktop-game' }]]);
  assert.deepEqual([1, 2, 3, 4].map((id) => store.rows.get(id).category), ['desktop-game', 'desktop-game', 'desktop-game', 'mobile-game']);
  assert.equal(store.rows.get(1).content, 'print(1)\n', 'only the category is sent');
  assert.deepEqual(win.listPanel.selectedValues, [1, 2, 3], 'the selection stays');
  assert.equal(win.saveButton.enabled, false, 'saved: nothing left to save');
  assert.equal(win.shownCategory, 'desktop-game');
  assert.equal(win.status.text, 'Set 3 records to Desktop Game');
});

test('database window: only records whose category differs are sent; failures are reported', async () => {
  const { win, store } = await openWindow();
  win.listPanel.selectedValues = [1, 2, 3];
  await win._onSelect(win.listPanel.selectedItems);
  pick(win, 'Mobile Game').action();                   // 1 and 2 are games already
  await win.save();
  assert.deepEqual(store.calls.filter((c) => c[0] === 'update'), [['update', 3, { category: 'mobile-game' }]]);
  assert.equal(win.status.text, 'Set 1 record to Mobile Game');
  win.batch.category = 'bad';
  await win.save();
  assert.equal(win.status.element.style.color, 'var(--cr-danger)');
  assert.match(win.status.text, /Saved 0 of 3; could not save "alpha": category is not included/);
});

test('database window: changing the selection with a category chosen asks first; going back to one record loads it', async () => {
  const { win } = await openWindow();
  win.listPanel.selectedValues = [1, 2];
  await win._onSelect(win.listPanel.selectedItems);
  pick(win, 'Tutorial').action();
  globalThis.confirmAnswer = false;
  try {
    press(win.listPanel, 3);                           // declined: the selection is put back
    await tick();
  } finally { globalThis.confirmAnswer = undefined; }
  assert.deepEqual(win.listPanel.selectedValues, [1, 2]);
  assert.equal(win.batch.category, 'tutorial');
  press(win.listPanel, 3);                             // accepted
  await tick();
  assert.equal(win.batch, null);
  assert.equal(win.current.name, 'delta');
  assert.equal(win.recordPanel.content, 'print(4)\n');
});

test('database window: with one record selected, its category is still saved with it', async () => {
  const { win, store } = await openWindow();
  win.listPanel.select(3);
  await tick();
  pick(win, 'Desktop Game').action();
  assert.equal(win.saveButton.enabled, true);
  await win.save();
  const update = store.calls.find((c) => c[0] === 'update');
  assert.equal(update[2].category, 'desktop-game');
  assert.equal(store.rows.get(4).category, 'desktop-game');
});
