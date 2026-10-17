// src/ui/projects.js: the stores and the script list of the Projects window.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, setUser, setSpace } from '../src/ui/db-client.js';
import {
  PROJECTS, SCRIPTS, byName, projectScript, scriptLabel, availableScripts, moved, sameList,
  uniqueName, copyProject, projectDetails,
} from '../src/ui/projects.js';

function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift();
    return { ok: r.status < 400, status: r.status, text: async () => (r.body === undefined ? '' : JSON.stringify(r.body)) };
  };
  fn.calls = calls;
  return fn;
}

test('the project store reads the page\'s space, the script store every space', async () => {
  setUser('Peter');
  const fetch = fakeFetch({ status: 200, body: [] }, { status: 200, body: [] }, { status: 200, body: [] });
  await new SourceStore({ ...PROJECTS, baseUrl: 'http://db.test', fetch }).list();
  await new SourceStore({ ...SCRIPTS, baseUrl: 'http://db.test', fetch }).list();
  setUser('');
  await new SourceStore({ ...PROJECTS, baseUrl: 'http://db.test', fetch }).list();
  setSpace(null);
  assert.deepEqual(fetch.calls.map((c) => c.url), [
    'http://db.test/projects?owner=Peter',
    'http://db.test/scripts',
    'http://db.test/projects?owner=',
  ]);
});

test('a project is saved with its description and the ids of its scripts', async () => {
  setUser('ann');
  const fetch = fakeFetch({ status: 201, body: { id: 1 } }, { status: 200, body: { id: 1 } });
  const s = new SourceStore({ ...PROJECTS, baseUrl: 'http://db.test', fetch });
  await s.create({ name: 'Games', description: 'Small games', script_ids: [3, 5] });
  await s.update(1, { name: 'Games', description: '', script_ids: [] });
  setUser('');
  assert.deepEqual(fetch.calls.map((c) => `${c.method} ${c.url}`),
    ['POST http://db.test/projects', 'PATCH http://db.test/projects/1']);
  assert.deepEqual(fetch.calls[0].body,
    { project: { name: 'Games', description: 'Small games', script_ids: [3, 5], owner: 'ann' } });
  // An empty list is sent: it takes every script out of the project.
  assert.deepEqual(fetch.calls[1].body, { project: { name: 'Games', description: '', script_ids: [] } });
});

test('byName: by name ignoring case, then by id', () => {
  const sorted = byName([{ id: 3, name: 'beta' }, { id: 2, name: 'Alpha' }, { id: 1, name: 'alpha' }, { id: 4 }]);
  assert.deepEqual(sorted.map((r) => r.id), [4, 1, 2, 3]);
  assert.deepEqual(byName(null), []);
});

test('projectScript: language by title, owner and shared always there', () => {
  assert.deepEqual(projectScript({ id: 1, name: 'snake', language: 'basic', owner: 'ann', shared: true, content: 'x' }),
    { id: 1, name: 'snake', language: 'Basic', owner: 'ann', shared: true });
  assert.deepEqual(projectScript({ id: 2, language: 'python', owner: null }),
    { id: 2, name: '', language: 'Python', owner: '', shared: false });
});

test('scriptLabel shows the owner of other users\' scripts only', () => {
  const mine = { name: 'snake', language: 'Basic', owner: 'Peter' };
  assert.equal(scriptLabel(mine, 'peter'), 'snake  Basic');
  assert.equal(scriptLabel({ ...mine, owner: 'ann' }, 'peter'), 'snake  Basic  \u00b7 ann');
  assert.equal(scriptLabel({ ...mine, owner: '' }, ''), 'snake  Basic');
});

test('availableScripts: the space\'s own, shared by others and the shared space, not already in', () => {
  const scripts = [
    { id: 1, name: 'snake', language: 'basic', owner: 'peter', shared: false },
    { id: 2, name: 'Pong', language: 'python', owner: 'ann', shared: true },
    { id: 3, name: 'secret', language: 'basic', owner: 'ann', shared: false },
    { id: 4, name: 'common', language: 'python', owner: null, shared: false },
    { id: 5, name: 'chart', language: 'python', owner: 'Peter', shared: false },
  ];
  assert.deepEqual(availableScripts(scripts, [], 'peter').map((s) => s.id), [5, 4, 2, 1]);
  assert.deepEqual(availableScripts(scripts, [5, 2], 'peter').map((s) => s.id), [4, 1]);
  // The shared space has the shared scripts and those of no one.
  assert.deepEqual(availableScripts(scripts, [], '').map((s) => s.id), [4, 2]);
  assert.deepEqual(availableScripts(null, [], 'peter'), []);
});

test('moved: one place up or down, never out of the list, without changing the original', () => {
  const list = ['a', 'b', 'c'];
  assert.deepEqual(moved(list, 1, -1), ['b', 'a', 'c']);
  assert.deepEqual(moved(list, 1, 1), ['a', 'c', 'b']);
  assert.deepEqual(moved(list, 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(moved(list, 2, 1), ['a', 'b', 'c']);
  assert.deepEqual(moved(list, -1, 1), ['a', 'b', 'c']);
  assert.deepEqual(list, ['a', 'b', 'c']);
});

test('sameList: same ids in the same order', () => {
  assert.equal(sameList([1, 2, 3], [1, 2, 3]), true);
  assert.equal(sameList([], []), true);
  assert.equal(sameList([1, 2, 3], [3, 1, 2]), false);
  assert.equal(sameList([1, 2], [1]), false);
});

import { listSharedProjects } from '../src/ui/projects.js';

test('listSharedProjects: only shared projects that have scripts, by name', async () => {
  const store = { list: async () => [
    { id: 1, name: 'zed', shared: true, scripts: [{ id: 1 }] },
    { id: 2, name: 'private', shared: false, scripts: [{ id: 1 }] },
    { id: 3, name: 'empty', shared: true, scripts: [] },
    { id: 4, name: 'Alpha', shared: true, scripts: [{ id: 2 }] },
  ] };
  const names = (await listSharedProjects({ store })).map((p) => p.name);
  assert.deepEqual(names, ['Alpha', 'zed']);
});

// A store in memory: the target space's projects or scripts.
function memoryStore(records = []) {
  const store = {
    records: [...records], created: [], removed: [], nextId: 100, failCreateOn: null,
    async list() { return store.records; },
    async create(fields) {
      if (store.failCreateOn === fields.name) throw new Error('boom');
      const record = { id: store.nextId += 1, ...fields };
      store.records.push(record);
      store.created.push(record);
      return record;
    },
    async remove(id) { store.removed.push(id); store.records = store.records.filter((r) => r.id !== id); },
  };
  return store;
}

const SOURCE = {
  id: 7, name: 'Pong', owner: 'ann', description: 'Two paddles', shared: true,
  scripts: [
    { id: 1, name: 'Ball', language: 'basic', content: 'PRINT 1', compiled_code: '{"a":1}', priority: 3 },
    { id: 2, name: 'Paddle', language: 'python', content: 'print(2)', compiled_code: null, priority: null },
  ],
};

test('uniqueName adds a number until the name is free, ignoring case', () => {
  assert.equal(uniqueName('Pong', ['Snake']), 'Pong');
  assert.equal(uniqueName('Pong', ['pong']), 'Pong 2');
  assert.equal(uniqueName('Pong', ['Pong', 'Pong 2', 'pong 3']), 'Pong 4');
});

test('copyProject makes the user\'s own copies of the scripts, then an unshared project listing them in order', async () => {
  const projects = memoryStore();
  const scripts = memoryStore();
  const { project, renamed } = await copyProject(SOURCE, { name: ' Pong copy ', projects, scripts });
  assert.deepEqual(scripts.created.map(({ id, ...f }) => f), [
    { name: 'Ball', language: 'basic', content: 'PRINT 1', priority: 3, compiled_code: '{"a":1}' },
    { name: 'Paddle', language: 'python', content: 'print(2)' },
  ]);
  assert.deepEqual(projects.created.map(({ id, ...f }) => f), [
    { name: 'Pong copy', description: 'Two paddles', shared: false, script_ids: scripts.created.map((s) => s.id) },
  ]);
  assert.equal(project.name, 'Pong copy');
  assert.deepEqual(renamed, []);
});

test('copyProject renames scripts the user already has, in any language', async () => {
  const scripts = memoryStore([{ id: 1, name: 'ball', language: 'python' }]);
  const { renamed } = await copyProject(SOURCE, { projects: memoryStore(), scripts });
  assert.deepEqual(renamed, [{ from: 'Ball', to: 'Ball 2' }]);
  assert.deepEqual(scripts.created.map((s) => s.name), ['Ball 2', 'Paddle']);
});

test('copyProject refuses an empty name or one of the user\'s projects, making nothing', async () => {
  const projects = memoryStore([{ id: 1, name: 'pong' }]);
  const scripts = memoryStore();
  await assert.rejects(copyProject(SOURCE, { name: '  ', projects, scripts }), /name is required/);
  await assert.rejects(copyProject(SOURCE, { name: 'Pong', projects, scripts }), /already have a project called "Pong"/);
  assert.equal(scripts.created.length, 0);
});

test('copyProject removes the scripts it made when the project cannot be made', async () => {
  const projects = memoryStore();
  projects.failCreateOn = 'Pong 2';
  const scripts = memoryStore();
  await assert.rejects(copyProject(SOURCE, { name: 'Pong 2', projects, scripts }), /boom/);
  assert.equal(scripts.created.length, 2);
  assert.deepEqual(scripts.removed, scripts.created.map((s) => s.id));
  assert.deepEqual(scripts.records, []);
});

test('a script store with no language sets the language it is given', async () => {
  setUser('ann');
  const fetch = fakeFetch({ status: 201, body: { id: 9 } });
  await new SourceStore({ ...SCRIPTS, owner: 'ann', baseUrl: 'http://db.test', fetch })
    .create({ name: 'Ball', language: 'python', content: 'x' });
  setUser('');
  assert.deepEqual(fetch.calls[0].body, { script: { name: 'Ball', content: 'x', language: 'python', owner: 'ann' } });
});

test('projectDetails shows the name, owner, script count, update time and description', () => {
  assert.equal(
    projectDetails({ name: 'Pong', owner: 'ann', description: ' Two paddles \n', scripts: [{}, {}] }, '9:05 AM'),
    'Name:    Pong\nOwner:   ann\nScripts: 2\nUpdated: 9:05 AM\n\nTwo paddles',
  );
  assert.equal(projectDetails({ name: 'X' }), 'Name:    X\nOwner:   (shared)\nScripts: 0\n\n(no description)');
});
