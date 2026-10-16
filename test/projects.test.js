// src/ui/projects.js: the stores and the script list of the Projects window.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, setUser, setSpace } from '../src/ui/db-client.js';
import {
  PROJECTS, SCRIPTS, byName, projectScript, scriptLabel, availableScripts, moved, sameList,
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
