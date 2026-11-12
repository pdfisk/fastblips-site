// The My Projects window's Category button: the project's category, chosen
// from five and stored by Save. Runs on the fake DOM of ./example-host.js,
// with in-memory stores in place of the server.

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './example-host.js';

let ProjectsWindow;
before(async () => {
  installDom();
  globalThis.confirm = () => globalThis.confirmAnswer ?? true;
  ({ ProjectsWindow } = await import('../src/ui/windows/projects-window.js'));
});

function memory(records) {
  const rows = new Map(records.map((r) => [r.id, { ...r }]));
  const calls = [];
  return {
    calls, rows, space: 'peter', baseUrl: 'mem:',
    async list() { return [...rows.values()].map((r) => ({ ...r })); },
    async create(fields) {
      calls.push(['create', fields]);
      const id = 100 + rows.size;
      rows.set(id, { id, owner: 'peter', category: 'development', ...fields });
      return { ...rows.get(id) };
    },
    async update(id, fields) {
      calls.push(['update', id, fields]);
      Object.assign(rows.get(id), fields);
      return { ...rows.get(id) };
    },
    async remove(id) { rows.delete(id); },
  };
}

const PROJECTS = [
  { id: 1, name: 'Pong', owner: 'peter', shared: true, category: 'desktop-game', scripts: [{ name: 'main', language: 'python', content: 'print(1)' }] },
  { id: 2, name: 'Old', owner: 'peter', shared: false, scripts: [] },   // from before categories
];

async function openWindow() {
  const store = memory(PROJECTS);
  const win = new ProjectsWindow({ store, scripts: memory([]) });
  await win.refresh();
  return { win, store };
}

const item = (win, label) => win.categoryMenu.items.find((it) => it.label === label);
const choose = (win, i) => win._onSelect(i, win.listPanel.items[i]);

test('the Category button lists the five categories and is greyed out with no project', async () => {
  const { win } = await openWindow();
  assert.deepEqual(win.categoryMenu.items.map((it) => it.label),
    ['Development', 'Desktop Game', 'Desktop App', 'Mobile Game', 'Mobile App']);
  assert.equal(win.categoryMenu.label, 'Category');
  assert.equal(win.categoryMenu.button.disabled, true);
  assert.equal(item(win, 'Mobile Game').enabled(), false);
});

test('a project shows its category; one from before categories is Development', async () => {
  const { win } = await openWindow();
  choose(win, 1);                                      // the list is by name: Old, Pong
  assert.equal(win.current.name, 'Pong');
  assert.equal(win.categoryMenu.label, 'Category: Desktop Game');
  assert.equal(win.categoryMenu.button.disabled, false);
  assert.equal(item(win, 'Desktop Game').checked(), true);
  assert.equal(win.dirty, false);
  choose(win, 0);
  assert.equal(win.current.name, 'Old');
  assert.equal(win.categoryMenu.label, 'Category: Development');
  assert.equal(win.dirty, false, 'reading no category as Development is not a change');
});

test('choosing a category marks the project changed, and Save stores it', async () => {
  const { win, store } = await openWindow();
  choose(win, 1);
  item(win, 'Mobile Game').action();
  assert.equal(win.dirty, true);
  assert.equal(win.categoryMenu.label, 'Category: Mobile Game');
  assert.equal(win.projectsMenu.items.find((it) => it.label === 'Save').enabled(), true);
  const saved = await win.save();
  assert.equal(saved.category, 'mobile-game');
  const [, id, fields] = store.calls.find((c) => c[0] === 'update');
  assert.equal(id, 1);
  assert.equal(fields.category, 'mobile-game');
  assert.equal(store.rows.get(1).category, 'mobile-game');
  assert.equal(win.dirty, false);
  assert.equal(win.categoryMenu.label, 'Category: Mobile Game');
});

test('choosing the category it already has is no change', async () => {
  const { win } = await openWindow();
  choose(win, 1);
  item(win, 'Desktop Game').action();
  assert.equal(win.dirty, false);
});

test('a new project starts as Development and is created with the category chosen', async () => {
  const { win, store } = await openWindow();
  win.newProject();
  assert.equal(win.categoryMenu.label, 'Category: Development');
  win.projectPanel.name = 'Racer';
  item(win, 'Mobile App').action();
  await win.save();
  assert.equal(store.calls.find((c) => c[0] === 'create')[1].category, 'mobile-app');
});

test('switching projects with a category chosen but not saved asks first', async () => {
  const { win } = await openWindow();
  choose(win, 1);
  item(win, 'Mobile Game').action();
  globalThis.confirmAnswer = false;
  try { choose(win, 0); } finally { globalThis.confirmAnswer = undefined; }
  assert.equal(win.current.name, 'Pong');
  assert.equal(win.category, 'mobile-game');
  choose(win, 0);
  assert.equal(win.current.name, 'Old');
  assert.equal(win.category, 'development');
});
