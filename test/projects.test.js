// src/ui/projects.js: the stores and the script list of the Projects window.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceStore, setUser, setSpace } from '../src/ui/db-client.js';
import {
  PROJECTS, SCRIPTS, byName, projectScript, projectScriptCopy, sameScripts, findProjectScript, projectPrograms, scriptLabel,
  availableScripts, moved, sameList, uniqueName, copyProject, projectDetails, languageTitle,
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

const BALL = { name: 'Ball', language: 'python', content: 'print(1)' };

test('a project is saved with its description and its copies of its scripts', async () => {
  setUser('ann');
  const fetch = fakeFetch({ status: 201, body: { id: 1 } }, { status: 200, body: { id: 1 } });
  const s = new SourceStore({ ...PROJECTS, baseUrl: 'http://db.test', fetch });
  await s.create({ name: 'Games', description: 'Small games', scripts: [BALL] });
  await s.update(1, { name: 'Games', description: '', scripts: [] });
  setUser('');
  assert.deepEqual(fetch.calls.map((c) => `${c.method} ${c.url}`),
    ['POST http://db.test/projects', 'PATCH http://db.test/projects/1']);
  assert.deepEqual(fetch.calls[0].body,
    { project: { name: 'Games', description: 'Small games', scripts: [BALL], owner: 'ann' } });
  // An empty list is sent: it takes every script out of the project.
  assert.deepEqual(fetch.calls[1].body, { project: { name: 'Games', description: '', scripts: [] } });
});

test('byName: by name ignoring case, then by id', () => {
  const sorted = byName([{ id: 3, name: 'beta' }, { id: 2, name: 'Alpha' }, { id: 1, name: 'alpha' }, { id: 4 }]);
  assert.deepEqual(sorted.map((r) => r.id), [4, 1, 2, 3]);
  assert.deepEqual(byName(null), []);
});

test('projectScript: an entry of the Add list, language by title and owner always there', () => {
  assert.deepEqual(projectScript({ id: 1, name: 'snake', language: 'python', owner: 'ann', content: 'x' }),
    { id: 1, name: 'snake', language: 'Python', owner: 'ann' });
  assert.deepEqual(projectScript({ id: 2, name: 'x', language: 'python', owner: null }),
    { id: 2, name: 'x', language: 'Python', owner: '' });
  assert.equal(languageTitle('python'), 'Python');
  assert.equal(languageTitle('lua'), 'lua');
});

test('projectScriptCopy: a script record or a project script as the project keeps it', () => {
  const record = { id: 3, name: ' Ball ', language: 'python', content: 'print(1)', owner: 'ann', priority: 2,
    compiled_code: '{}', visibility: 'public', version: 4, key: 'k' };
  assert.deepEqual(projectScriptCopy(record),
    { name: 'Ball', language: 'python', content: 'print(1)', priority: 2, compiled_code: '{}' });
  assert.deepEqual(projectScriptCopy({ name: 'x', language: 'python', content: null, priority: null, compiled_code: '' }),
    { name: 'x', language: 'python', content: '' });
});

test('sameScripts compares the copies, in order, whatever else the entries carry', () => {
  const a = { name: 'A', language: 'python', content: '1' };
  const b = { name: 'B', language: 'python', content: '2' };
  assert.equal(sameScripts([a, b], [{ ...a, key: 'k1' }, { content: '2', language: 'python', name: 'B' }]), true);
  assert.equal(sameScripts([a, b], [b, a]), false);
  assert.equal(sameScripts([a], [{ ...a, content: '1 ' }]), false);
  assert.equal(sameScripts(null, []), true);
});

test('findProjectScript finds a project script by name, ignoring case', () => {
  const scripts = [{ name: 'Ball' }, { name: 'Paddle' }];
  assert.equal(findProjectScript(' ball', scripts), scripts[0]);
  assert.equal(findProjectScript('net', scripts), undefined);
});

test('projectPrograms: the programs to run, in order, skipping languages that cannot run', () => {
  class Py {}
  const { programs, skipped } = projectPrograms([
    { name: 'B', language: 'python', content: 'print(2)', compiled_code: '{}' },
    { name: 'Old', language: 'basic', content: 'Print 1' },
    { name: 'A', language: 'python', content: 'print(1)', priority: 2 },
  ], { python: Py });
  assert.deepEqual(programs, [
    { name: 'B', language: Py, source: 'print(2)', compiled: '{}', priority: undefined },
    { name: 'A', language: Py, source: 'print(1)', compiled: null, priority: 2 },
  ]);
  assert.equal(skipped, 1);
  assert.deepEqual(projectPrograms(undefined, {}), { programs: [], skipped: 0 });
});

test('scriptLabel shows the owner of other users\' scripts only', () => {
  const mine = { name: 'snake', language: 'python', owner: 'Peter' };
  assert.equal(scriptLabel(mine, 'peter'), 'snake  Python');
  assert.equal(scriptLabel({ ...mine, owner: 'ann' }, 'peter'), 'snake  Python  \u00b7 ann');
  assert.equal(scriptLabel({ ...mine, owner: '' }, ''), 'snake  Python');
});

test('availableScripts: the space\'s own and the shared space, not named like one already in', () => {
  const scripts = [
    { id: 1, name: 'snake', language: 'python', owner: 'peter' },
    { id: 2, name: 'Pong', language: 'python', owner: 'ann' },
    { id: 3, name: 'secret', language: 'python', owner: 'ann' },
    { id: 4, name: 'common', language: 'python', owner: null },
    { id: 5, name: 'chart', language: 'python', owner: 'Peter' },
  ];
  assert.deepEqual(availableScripts(scripts, [], 'peter').map((s) => s.id), [5, 4, 1]);
  assert.deepEqual(availableScripts(scripts, ['Chart'], 'peter').map((s) => s.id), [4, 1]);
  // The shared space has only the scripts of no one.
  assert.deepEqual(availableScripts(scripts, [], '').map((s) => s.id), [4]);
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
    { id: 1, name: 'Ball', language: 'python', content: 'PRINT 1', compiled_code: '{"a":1}', priority: 3 },
    { id: 2, name: 'Paddle', language: 'python', content: 'print(2)', compiled_code: null, priority: null },
  ],
};

test('uniqueName adds a number until the name is free, ignoring case', () => {
  assert.equal(uniqueName('Pong', ['Snake']), 'Pong');
  assert.equal(uniqueName('Pong', ['pong']), 'Pong 2');
  assert.equal(uniqueName('Pong', ['Pong', 'Pong 2', 'pong 3']), 'Pong 4');
});

test('copyProject makes an unshared project of the user with copies of the scripts, in order', async () => {
  const projects = memoryStore();
  const { project } = await copyProject(SOURCE, { name: ' Pong copy ', projects });
  assert.deepEqual(projects.created.map(({ id, ...f }) => f), [{
    name: 'Pong copy', description: 'Two paddles', shared: false,
    scripts: [
      { name: 'Ball', language: 'python', content: 'PRINT 1', priority: 3, compiled_code: '{"a":1}' },
      { name: 'Paddle', language: 'python', content: 'print(2)' },
    ],
  }]);
  assert.equal(project.name, 'Pong copy');
});

test('copyProject refuses an empty name or one of the user\'s projects, making nothing', async () => {
  const projects = memoryStore([{ id: 1, name: 'pong' }]);
  await assert.rejects(copyProject(SOURCE, { name: '  ', projects }), /name is required/);
  await assert.rejects(copyProject(SOURCE, { name: 'Pong', projects }), /already have a project called "Pong"/);
  assert.equal(projects.created.length, 0);
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
