// src/ui/projects.js: the stores and the script list of the Projects window.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, setUser, setSpace } from '../src/ui/db-client.js';
import { PROJECTS, SCRIPTS, byName, scriptRows, sameIds } from '../src/ui/projects.js';

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

test('the project and script stores read the page\'s space, in every language', async () => {
  setUser('Peter');
  const fetch = fakeFetch({ status: 200, body: [] }, { status: 200, body: [] }, { status: 200, body: [] });
  await new SourceStore({ ...PROJECTS, baseUrl: 'http://db.test', fetch }).list();
  await new SourceStore({ ...SCRIPTS, baseUrl: 'http://db.test', fetch }).list();
  setUser('');
  await new SourceStore({ ...PROJECTS, baseUrl: 'http://db.test', fetch }).list();
  setSpace(null);
  assert.deepEqual(fetch.calls.map((c) => c.url), [
    'http://db.test/projects?owner=Peter',
    'http://db.test/scripts?owner=Peter',
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

test('scriptRows: every script in the space, checked when in the project', () => {
  const scripts = [
    { id: 1, name: 'snake', language: 'basic', project_name: 'Games' },
    { id: 2, name: 'Pong', language: 'python', project_name: 'Games' },
    { id: 3, name: 'notes', language: 'basic', project_name: null },
    { id: 4, name: 'chart', language: 'python', project_name: 'Reports' },
  ];
  const project = { id: 7, name: 'Games', scripts: [{ id: 1, name: 'snake', language: 'basic' }, { id: 2 }] };
  assert.deepEqual(scriptRows(scripts, project), [
    { id: 4, name: 'chart', language: 'Python', checked: false, note: 'in Reports' },
    { id: 3, name: 'notes', language: 'Basic', checked: false, note: '' },
    { id: 2, name: 'Pong', language: 'Python', checked: true, note: '' },
    { id: 1, name: 'snake', language: 'Basic', checked: true, note: '' },
  ]);
  // A new project has no scripts yet; ones in other projects say so.
  const fresh = scriptRows(scripts, { id: null, name: '', scripts: [] });
  assert.deepEqual(fresh.map((r) => r.checked), [false, false, false, false]);
  assert.deepEqual(fresh.map((r) => r.note), ['in Reports', '', 'in Games', 'in Games']);
  assert.deepEqual(scriptRows([], project), []);
});

test('sameIds ignores order and repeats', () => {
  assert.equal(sameIds([1, 2, 3], [3, 1, 2]), true);
  assert.equal(sameIds([], []), true);
  assert.equal(sameIds([1, 2], [1]), false);
  assert.equal(sameIds([1, 1, 2], [2, 1]), true);
  assert.equal(sameIds([1, 2], [1, 3]), false);
});
