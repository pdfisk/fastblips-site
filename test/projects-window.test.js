// The My Projects window's Category button: the project's category, chosen
// from five and stored by Save; with no project, a filter on the list. Runs on the fake DOM of ./example-host.js,
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

test('with no project, the Category button lists All and the five categories, all shown', async () => {
  const { win } = await openWindow();
  assert.deepEqual(win.categoryMenu.items.filter((it) => it.label).map((it) => it.label),
    ['All', 'Development', 'Desktop Game', 'Desktop App', 'Mobile Game', 'Mobile App']);
  assert.equal(win.categoryMenu.label, 'Category');
  assert.equal(win.categoryMenu.button.disabled, false);
  assert.equal(item(win, 'All').checked(), true);
  assert.equal(item(win, 'Mobile Game').checked(), false);
  assert.equal(win.listPanel.items.length, 2);
});

test('with no project, choosing a category lists only its projects; All lists them all', async () => {
  const { win } = await openWindow();
  item(win, 'Desktop Game').action();
  assert.deepEqual(win.listPanel.items.map((i) => i.value), [1]);
  assert.equal(win.categoryMenu.label, 'Category: Desktop Game');
  assert.equal(win.title, 'My Projects: Desktop Game');
  assert.equal(item(win, 'Desktop Game').checked(), true);
  assert.equal(item(win, 'All').checked(), false);
  assert.equal(win.current, null, 'filtering selects no project');
  item(win, 'Development').action();
  assert.deepEqual(win.listPanel.items.map((i) => i.value), [2], 'a project from before categories is Development');
  item(win, 'Mobile App').action();
  assert.equal(win.listPanel.items.length, 0);
  item(win, 'All').action();
  assert.equal(win.listPanel.items.length, 2);
  assert.equal(win.categoryMenu.label, 'Category');
  assert.equal(win.title, 'My Projects');
});

test('with a project selected, the button shows its category, not the filter', async () => {
  const { win } = await openWindow();
  item(win, 'Desktop Game').action();
  choose(win, 0);
  assert.equal(win.current.name, 'Pong');
  assert.equal(win.categoryMenu.label, 'Category: Desktop Game');
  assert.equal(item(win, 'All').enabled(), false);
  item(win, 'Mobile Game').action();   // sets the project's category, not the filter
  assert.equal(win.category, 'mobile-game');
  assert.equal(win.title, 'My Projects: Mobile Game');
  assert.equal(win.filter, 'desktop-game');
  assert.deepEqual(win.listPanel.items.map((i) => i.value), [1]);
});

test('Refresh leaves no project and no category selected', async () => {
  const { win } = await openWindow();
  item(win, 'Desktop Game').action();
  choose(win, 0);
  await win.refresh({ clear: true });
  assert.equal(win.current, null);
  assert.equal(win.filter, null);
  assert.equal(win.listPanel.items.length, 2);
  assert.equal(win.categoryMenu.label, 'Category');
});

test('a new project starts in the category the list shows, and stays listed when saved elsewhere', async () => {
  const { win } = await openWindow();
  item(win, 'Mobile Game').action();
  win.newProject();
  assert.equal(win.category, 'mobile-game');
  win.projectPanel.name = 'Tap';
  item(win, 'Mobile App').action();
  await win.save();
  assert.equal(win.filter, null, 'saved outside the filter: all are listed again');
  assert.ok(win.listPanel.items.some((i) => i.value === win.current.id));
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
